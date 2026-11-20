/* Server-only. The Trust Center on the server (production programme group 4; inventory group 4, section 4). Admins and owners manage the
   documents, customer accounts, access requests, the domain blocklist and the chatbot; making a document public needs a second admin or
   owner who did not edit it (four-eyes `trust.publish`). Members who see the public page (the Viewer and Vendor roles, and admins previewing
   it) can read public documents, request access to the others, accept the NDA for their company's account, subscribe to updates and ask the
   chatbot. Deliberate differences from the demonstration, decided for production:
   - Documents are real files (the evidence store) served through short-lived links: public ones to everyone who sees the page, the others
     only to viewers of an active account whose NDA is accepted and whose access covers the document.
   - Approving access never marks an NDA as signed: the account waits until a viewer accepts it. The approver is never the requester, and never
     the person who unblocked the requester's domain (so one person cannot unblock and approve). Revoking and unblocking need a reason.
   - The requester is the signed-in member (their own email), at most 3 requests an hour; questions to the chatbot at most 20 an hour.
   - The public page is built from the company's own records: its name, verified library answers (the FAQ), sub-processors (approved vendors
     that process customer data), published documents, and control status by domain. Nothing is invented.
   - A new public document is listed "On request, NDA" until its publication is approved. Names are unique.
   - The anonymous public page (no sign-in) arrives with email (programme group 8): visitors must verify their address first. */
import { DOMAIN_RE, isoDayOf, trustManageBlock } from "@/lib/rulesWs";
import type { Deps } from "../types";
import { approvalsView, err, invalid, membersOf, missing, ok, refuse, str, sweepApprovals, txt, wsRoute, type WsHelpers } from "./common";
import type { Control } from "./assurance";
import { checkFile } from "./files";
import { pendingOf, registerFourEyes } from "./foureyes";
import type { Answer } from "./questionnaires";
import type { Actor, Rec, WsTx } from "./store";
import type { Vendor } from "./vendors";

export interface Resource { id: string; name: string; access: "Public" | "On request, NDA"; status: "Active"; editedBy: string; editedById: string; approvedBy?: string; at: string; file?: { path: string; name: string; size: number; type: string } }
export interface Account { id: string; company: string; domain: string; nda: string; ndaBy?: string; viewers: string[]; access: string[]; status: "Active" | "Revoked"; revokeReason?: string }
export interface TrustRequest { id: string; who: string; whoId: string; company: string; resource: string; resourceId: string; reason: string; at: string; atMs: number; status: "Pending" | "Approved" | "Denied"; by?: string; byId?: string; note?: string; decidedAt?: string }
interface Settings { chatbot: boolean; blocked: { domain: string; by: string; at: string }[]; unblocked: Record<string, string> }
interface Chat { id: string; at: string; atMs: number; who: string; whoId: string; q: string; a: string; answered: boolean }
export const TRUST_KINDS = ["trust.publish"];
const NEEDS_PERSON = "Thanks — this one needs a person. Your question was passed to the security team, who will reply to you.";
const domainOf = (email: string) => String(email).trim().toLowerCase().split("@").pop() || "";
const labelOf = (email: string) => { const l = domainOf(email).split(".")[0] || ""; return l ? l.charAt(0).toUpperCase() + l.slice(1, 80) : "—"; };

async function settings(t: WsTx): Promise<Rec<Settings>> {
  const s = await t.get<Settings>("trust-settings", "settings");
  if (s) return s;
  const fresh: Settings = { chatbot: true, blocked: [], unblocked: {} }; await t.insert("trust-settings", "settings", fresh);
  return (await t.get<Settings>("trust-settings", "settings"))!;
}
/** Best keyword overlap with the verified answers (the same matching as the demonstration); null when nothing scores. */
function botAnswer(q: string, pool: { q: string; a: string }[]): string | null {
  const ql = q.toLowerCase(); let best: string | null = null; let bestScore = 0;
  for (const a of pool) { const score = a.q.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && ql.includes(w)).length; if (score > bestScore) { bestScore = score; best = a.a; } }
  return bestScore >= 1 ? best : null;
}
/** The public page's change history and viewer activity (Activity & history tab). */
async function history(t: WsTx, change: string) { const id = `TH-${await t.next("trust-history", 0)}`; await t.insert("trust-history", id, { at: isoDayOf(t.now), who: t.actor.name, change: change.slice(0, 300) }); }
async function activity(t: WsTx, what: string) { const id = `TV-${await t.next("trust-activity", 0)}`; await t.insert("trust-activity", id, { at: isoDayOf(t.now), who: t.actor.name, what: what.slice(0, 300) }); }
/** The blocklist entries a requester's address falls under (its domain or a parent domain). */
const blockedBy = (email: string, domains: string[]) => { const dom = domainOf(email); return domains.filter((b) => dom === b || dom.endsWith("." + b)); };
async function emailOf(d: Deps, id: string) { return (await d.store.profileById(id))?.email?.toLowerCase() ?? ""; }

registerFourEyes("trust.publish", { mod: "trust", apply: async (_d, t, a, by) => {
  const rec = (await t.get<Resource>("trust-resource", String(a.payload.resourceId))) ?? missing("Resource");
  // whoever changed the document after the request was raised can never approve its publication
  if (rec.data.editedById === t.actor.id) refuse("Segregation of duties: you edited this document, so a different admin or owner must approve publishing it.");
  rec.data.access = "Public"; rec.data.approvedBy = by; await t.update("trust-resource", rec.id, rec.data, rec.version);
  await history(t, `${rec.data.name} made public (approved by ${by})`);
  await t.audit("trust.visibility.changed", `${rec.data.name} → Public (approved by ${by}; requested by ${a.requestedByName})`, "Policy");
} });

export function trustRoutes(h: WsHelpers) {
  const tx = <T,>(d: Deps, c: { actor: Actor }, w: (t: WsTx) => Promise<T>) => d.ws.tx(c.actor, d.now(), w);
  const admin = (fn: (d: Deps, t: WsTx, b: Record<string, unknown>, p: string[], a: Actor) => Promise<unknown>) => wsRoute(h, "trust", async (d, r, c) => {
    refuse(trustManageBlock(c.actor.role));
    return tx(d, c, async (t) => { await sweepApprovals(t, TRUST_KINDS); return ok((await fn(d, t, r.body, r.path, c.actor)) ?? { ok: true }); });
  });
  const visitor = (fn: (d: Deps, t: WsTx, b: Record<string, unknown>, p: string[], a: Actor) => Promise<unknown>) => wsRoute(h, "trust", async (d, r, c) => tx(d, c, async (t) => ok(await fn(d, t, r.body, r.path, c.actor))));

  /** What everyone who sees the page reads, built from the company's own records. */
  async function publicView(d: Deps, t: WsTx, a: Actor) {
    const company = (await d.dir.companiesOf(a.id)).find((m) => m.company.id === a.tenantId)?.company.name ?? "";
    const resources = (await t.list<Resource>("trust-resource")).map((x) => x.data);
    const controls = (await t.list<Control>("control")).map((x) => x.data); const byDomain = new Map<string, { n: number; pass: number }>();
    for (const c of controls) { const s = byDomain.get(c.domain) ?? { n: 0, pass: 0 }; s.n++; if (c.status === "Pass") s.pass++; byDomain.set(c.domain, s); }
    const me = await emailOf(d, a.id); const acct = (await t.list<Account>("trust-account")).map((x) => x.data).find((x) => x.status === "Active" && x.viewers.includes(me));
    return {
      company, chatbot: (await settings(t)).data.chatbot,
      faq: (await t.list<Answer>("answer")).map((x) => x.data).filter((x) => x.verified).map((x) => ({ q: x.q, a: x.a })),
      subprocessors: (await t.list<Vendor>("vendor")).map((x) => x.data).filter((v) => v.data && v.gate === "Approved").map((v) => ({ name: v.name, purpose: v.cat, region: "—" })),
      updates: resources.filter((r) => r.access === "Public").sort((x, y) => y.at.localeCompare(x.at)).slice(0, 5).map((r) => ({ at: r.at, title: `${r.name} published` })),
      controls: [...byDomain.entries()].map(([k, v]) => [k, v.pass === v.n ? "Pass" : "In review"]),
      account: acct ? { company: acct.company, nda: acct.nda, access: acct.access } : null,
      myRequests: (await t.list<TrustRequest>("trust-request")).map((x) => x.data).filter((x) => x.whoId === a.id).map((x) => ({ resource: x.resource, status: x.status, at: x.at })),
      subscribed: !!(await t.get("trust-sub", a.id)),
    };
  }
  const data = wsRoute(h, "trust", async (d, _r, c) => ok(await tx(d, c, async (t) => {
    await sweepApprovals(t, TRUST_KINDS);
    const pending = await pendingOf(t, TRUST_KINDS);
    const resources = (await t.list<Resource>("trust-resource")).map((x) => ({ ...x.data, file: x.data.file ? { name: x.data.file.name, size: x.data.file.size } : undefined, publishPending: pending.find((a) => a.payload.resourceId === x.id)?.id }));
    const pub = await publicView(d, t, c.actor);
    if (trustManageBlock(c.actor.role)) return { resources: resources.map((x) => ({ id: x.id, name: x.name, access: x.access, status: x.status, file: x.file ? { name: x.file.name } : undefined })), public: pub, filesConfigured: false };
    const s = (await settings(t)).data; const names = new Map((await membersOf(d, c.actor)).map((m) => [m.id, m.name]));
    const reqs = (await t.list<TrustRequest>("trust-request")).map((x) => x.data);
    return {
      resources, public: pub, filesConfigured: d.files.configured,
      accounts: (await t.list<Account>("trust-account")).map((x) => x.data),
      requests: reqs.filter((x) => x.status === "Pending").reverse(),
      decisions: reqs.filter((x) => x.status !== "Pending").reverse().map((x) => ({ at: x.decidedAt ?? x.at, who: x.who, resource: x.resource, decision: x.status, by: x.by ?? "", note: x.note ?? "" })),
      blocked: s.blocked.map((b) => b.domain), chatbot: s.chatbot,
      chats: (await t.list<Chat>("trust-chat")).map((x) => x.data).reverse().slice(0, 200).map((x) => ({ at: x.at, who: x.who, q: x.q, a: x.a })),
      subscribers: (await t.list("trust-sub")).length,
      activity: (await t.list<{ at: string; who: string; what: string }>("trust-activity")).map((x) => x.data).reverse().slice(0, 50),
      modeHist: (await t.list<{ at: string; who: string; change: string }>("trust-history")).map((x) => x.data).reverse().slice(0, 50),
      approvals: await approvalsView(t, TRUST_KINDS, names),
    };
  })));

  /* ----- administration ----- */
  const approve = wsRoute(h, "trust", async (d, r, c) => {
    refuse(trustManageBlock(c.actor.role)); const me = c.actor;
    // a refusal for a blocked domain is recorded: that unit of work commits, then the refusal is answered
    const out = await tx(d, c, async (t) => {
      const rec = (await t.get<TrustRequest>("trust-request", str(r.path[3], 20))) ?? missing("Request"); const q = rec.data;
      if (q.status !== "Pending") invalid("This request was already decided.");
      const s = (await settings(t)).data;
      if (blockedBy(q.who, s.blocked.map((b) => b.domain)).length) { await t.audit("trust.access.approve.denied", `${q.id} (blocked domain)`, "Policy"); return "blocked"; }
      if (q.whoId === me.id) refuse("Segregation of duties: you raised this request, so another admin or owner must approve it.");
      if (blockedBy(q.who, Object.keys(s.unblocked)).some((dom) => s.unblocked[dom] === me.id)) refuse("Segregation of duties: you unblocked this domain, so another admin or owner must approve its requests.");
      q.status = "Approved"; q.by = me.name; q.byId = me.id; q.decidedAt = isoDayOf(t.now); await t.update("trust-request", rec.id, q, rec.version);
      const accs = await t.list<Account>("trust-account"); const acc = accs.find((x) => x.data.domain === domainOf(q.who));
      if (acc) {
        const a = acc.data;
        if (a.status === "Revoked") { a.status = "Active"; a.nda = "Pending"; delete a.ndaBy; a.access = []; a.viewers = []; } // a revoked account starts over
        if (!a.viewers.includes(q.who)) a.viewers.push(q.who); if (!a.access.includes(q.resource)) a.access.push(q.resource);
        await t.update("trust-account", acc.id, a, acc.version);
      } else {
        const id = `TA-${await t.next("trust-account", 0)}`;
        await t.insert("trust-account", id, { id, company: q.company, domain: domainOf(q.who), nda: "Pending", viewers: [q.who], access: [q.resource], status: "Active" } satisfies Account);
      }
      await t.audit("trust.access.approved", `${q.id}: ${q.company} → ${q.resource}`, "Policy");
      await t.notify(q.whoId, `Your request for ${q.resource} was approved. Accept the NDA on the Trust Center to open it.`);
      return "ok";
    });
    return out === "blocked" ? err(403, "Blocked domain: this request cannot be approved.") : ok({ ok: true });
  });
  const deny = admin(async (_d, t, b, p, me) => {
    const rec = (await t.get<TrustRequest>("trust-request", str(p[3], 20))) ?? missing("Request"); const q = rec.data;
    if (q.status !== "Pending") invalid("This request was already decided.");
    const note = txt(b.note, 300);
    q.status = "Denied"; q.by = me.name; q.byId = me.id; q.note = note; q.decidedAt = isoDayOf(t.now); await t.update("trust-request", rec.id, q, rec.version);
    await t.audit("trust.access.denied", `${q.id}: ${q.company} → ${q.resource}${note ? `; note: ${note}` : ""}`, "Policy");
    await t.notify(q.whoId, `Your request for ${q.resource} was declined${note ? `: ${note}` : "."}`);
    return { ok: true };
  });
  const revoke = admin(async (_d, t, b, p) => {
    const rec = (await t.get<Account>("trust-account", str(p[3], 20))) ?? missing("Account"); const a = rec.data;
    if (a.status === "Revoked") invalid("Access is already revoked.");
    const reason = txt(b.reason, 300); if (reason.length < 10) invalid("Give a reason of at least 10 characters.");
    a.status = "Revoked"; a.viewers = []; a.access = []; a.revokeReason = reason; await t.update("trust-account", rec.id, a, rec.version);
    await t.audit("trust.account.revoked", `${a.company}; reason: ${reason}`, "Policy");
    return a;
  });
  const block = admin(async (_d, t, b, _p, me) => {
    const dom = txt(b.domain, 253).toLowerCase().replace(/^@/, ""); if (!DOMAIN_RE.test(dom)) invalid("Enter a domain such as example.com.");
    const rec = await settings(t); const s = rec.data;
    if (s.blocked.some((x) => x.domain === dom)) invalid(`${dom} is already blocked.`);
    s.blocked.push({ domain: dom, by: me.name, at: isoDayOf(t.now) }); delete s.unblocked[dom]; await t.update("trust-settings", rec.id, s, rec.version);
    await t.audit("trust.domain.blocked", dom, "Policy");
    return dom;
  });
  const unblock = admin(async (_d, t, b, p, me) => {
    const dom = str(decodeURIComponent(p[3] ?? ""), 253).toLowerCase(); const reason = txt(b.reason, 300);
    if (reason.length < 10) invalid("Give a reason of at least 10 characters.");
    const rec = await settings(t); const s = rec.data;
    if (!s.blocked.some((x) => x.domain === dom)) missing("Blocked domain");
    s.blocked = s.blocked.filter((x) => x.domain !== dom); s.unblocked[dom] = me.id; await t.update("trust-settings", rec.id, s, rec.version);
    await t.audit("trust.domain.unblocked", `${dom}; reason: ${reason}`, "Policy");
    return dom;
  });
  const chatbot = admin(async (_d, t, b) => {
    const on = b.enabled === true; const rec = await settings(t); rec.data.chatbot = on; await t.update("trust-settings", rec.id, rec.data, rec.version);
    await t.audit(on ? "trust.chatbot.enabled" : "trust.chatbot.disabled", "Trust Center chatbot", "Policy");
    return on;
  });
  const publish = admin(async (_d, t, b, _p, me) => {
    const name = txt(b.name, 160); if (!name) invalid("Resource name is required.");
    if ((await t.list<Resource>("trust-resource")).some((x) => x.data.name.toLowerCase() === name.toLowerCase())) invalid("A document with this name is already listed.");
    const id = `TRS-${await t.next("trust-resource", 0)}`; const wantsPublic = b.access === "Public";
    await t.insert("trust-resource", id, { id, name, access: "On request, NDA", status: "Active", editedBy: me.name, editedById: me.id, at: isoDayOf(t.now) } satisfies Resource);
    if (wantsPublic) {
      await t.request({ kind: "trust.publish", title: `Publish "${name.slice(0, 100)}" publicly`, subject: id, payload: { resourceId: id, mode: "new" }, needs: 1, approverRoles: ["admin", "owner"], forbid: [me.id], ttlMs: 24 * 3600_000 });
      await t.audit("trust.resource.publish_requested", `${name} (public)`, "Policy");
    } else { await t.audit("trust.resource.published", name, "Policy"); await history(t, `${name} published on request, NDA`); }
    return { name, pending: wantsPublic, id };
  });
  const visibility = admin(async (_d, t, _b, p, me) => {
    const rec = (await t.get<Resource>("trust-resource", str(p[3], 20))) ?? missing("Resource"); const x = rec.data;
    if (x.access === "Public") {
      x.access = "On request, NDA"; x.editedBy = me.name; x.editedById = me.id; await t.update("trust-resource", rec.id, x, rec.version);
      await t.audit("trust.visibility.changed", `${x.name} → On request, NDA`, "Policy"); await history(t, `${x.name} made private`);
      return { name: x.name, access: x.access, pending: false };
    }
    if ((await pendingOf(t, TRUST_KINDS)).some((a) => a.payload.resourceId === x.id)) invalid("Publishing is already awaiting approval.");
    await t.request({ kind: "trust.publish", title: `Make "${x.name.slice(0, 100)}" public`, subject: x.id, payload: { resourceId: x.id, mode: "toggle" }, needs: 1, approverRoles: ["admin", "owner"],
      forbid: [x.editedById], ttlMs: 24 * 3600_000 });
    await t.audit("trust.visibility.publish_requested", x.name, "Policy");
    return { name: x.name, access: x.access, pending: true };
  });
  /** The document's file (replacing any earlier one), checked and stored privately under the company. */
  const upload = wsRoute(h, "trust", async (d, r, c) => {
    refuse(trustManageBlock(c.actor.role));
    if (!d.files.configured) invalid("File storage is not set up yet. Ask your administrator to configure it.");
    const chk = checkFile(r.body.name, r.raw ?? new Uint8Array()); if ("error" in chk) invalid(chk.error);
    const f = chk as { name: string; ext: string; type: string };
    return tx(d, c, async (t) => {
      const rec = (await t.get<Resource>("trust-resource", str(r.path[3], 20))) ?? missing("Resource"); const x = rec.data;
      if ((await pendingOf(t, TRUST_KINDS)).some((a) => a.payload.resourceId === x.id)) invalid("Publishing is awaiting approval. Withdraw it before changing the file.");
      const wasPublic = x.access === "Public"; if (wasPublic) { x.access = "On request, NDA"; delete x.approvedBy; } // a new file is approved again before it is public
      const path = `${c.actor.tenantId}/TRUST/${crypto.randomUUID()}.${f.ext}`; await d.files.put(path, r.raw!, f.type);
      const old = x.file?.path; x.file = { path, name: f.name, size: r.raw!.length, type: f.type }; x.editedBy = c.actor.name; x.editedById = c.actor.id;
      await t.update("trust-resource", rec.id, x, rec.version);
      if (old) await d.files.remove([old]).catch(() => undefined);
      await t.audit("trust.resource.file", `${x.name}: ${f.name}${wasPublic ? "; back to on request until its publication is approved again" : ""}`, "Policy");
      await history(t, `${x.name}: file ${f.name}${wasPublic ? " (back to on request)" : ""}`);
      return ok({ name: f.name });
    });
  });

  /* ----- what visitors do ----- */
  const link = visitor(async (d, t, _b, p, me) => {
    const rec = (await t.get<Resource>("trust-resource", str(p[3], 20))) ?? missing("Resource"); const x = rec.data;
    if (!x.file) invalid("No file has been attached to this document yet.");
    if (x.access !== "Public" && trustManageBlock(me.role)) {
      const em = await emailOf(d, me.id);
      const acct = (await t.list<Account>("trust-account")).map((y) => y.data).find((y) => y.status === "Active" && y.viewers.includes(em));
      if (!acct || !acct.access.includes(x.name)) refuse("Request access to this document first.");
      if (!acct!.nda.startsWith("Accepted")) refuse("Accept the NDA first.");
    }
    const url = await d.files.link(x.file!.path, x.file!.name, 60);
    await t.audit("trust.document.viewed", `${x.name} by ${me.name}`, "Policy"); await activity(t, `Opened ${x.name}`);
    return { url };
  });
  const requestAccess = visitor(async (d, t, b, _p, me) => {
    const rec = (await t.get<Resource>("trust-resource", str(b.resourceId, 20))) ?? missing("Resource");
    const em = await emailOf(d, me.id); if (!em) invalid("Your account has no email address.");
    const reqs = (await t.list<TrustRequest>("trust-request")).map((x) => x.data);
    if (reqs.filter((x) => x.whoId === me.id && x.atMs > t.now - 3600_000).length >= 3) invalid("Too many requests. Please wait an hour before trying again.");
    if (rec.data.access === "Public" || reqs.some((x) => x.whoId === me.id && x.resourceId === rec.id && x.status === "Pending") || reqs.filter((x) => x.status === "Pending").length >= 200) return { queued: false };
    const id = `TR-${await t.next("trust-request", 0)}`;
    await t.insert("trust-request", id, { id, who: em, whoId: me.id, company: labelOf(em), resource: rec.data.name, resourceId: rec.id, reason: txt(b.reason, 300) || "—", at: isoDayOf(t.now), atMs: t.now, status: "Pending" } satisfies TrustRequest);
    await t.audit("trust.access.requested", `${id}: ${rec.data.name}`, "Policy");
    return { queued: true };
  });
  const nda = visitor(async (d, t, _b, _p, me) => {
    const em = await emailOf(d, me.id);
    const acc = (await t.list<Account>("trust-account")).find((x) => x.data.status === "Active" && x.data.viewers.includes(em));
    if (!acc) invalid("Your company has no Trust Center access yet. Request a document first.");
    if (acc!.data.nda.startsWith("Accepted")) invalid("The NDA is already accepted.");
    acc!.data.nda = `Accepted ${isoDayOf(t.now)} by ${me.name}`; acc!.data.ndaBy = me.id; await t.update("trust-account", acc!.id, acc!.data, acc!.version);
    await t.audit("trust.nda.accepted", `${acc!.data.company} by ${me.name}`, "Policy");
    return { ok: true };
  });
  const subscribe = visitor(async (d, t, _b, _p, me) => {
    if (await t.get("trust-sub", me.id)) invalid("You are already subscribed.");
    await t.insert("trust-sub", me.id, { userId: me.id, at: isoDayOf(t.now) });
    await t.audit("trust.subscribed", me.name, "Policy");
    return { ok: true };
  });
  const ask = visitor(async (_d, t, b, _p, me) => {
    const q = txt(b.q, 1000); if (!q) invalid("Enter a question first");
    const chats = await t.list<Chat>("trust-chat");
    if (chats.filter((x) => x.data.whoId === me.id && x.data.atMs > t.now - 3600_000).length >= 20) invalid("Too many questions. Please wait an hour before asking again.");
    const pool = (await t.list<Answer>("answer")).map((x) => x.data).filter((x) => x.verified);
    const ans = (await settings(t)).data.chatbot ? botAnswer(q, pool) : null;
    const id = `TC-${await t.next("trust-chat", 0)}`;
    await t.insert("trust-chat", id, { id, at: isoDayOf(t.now), atMs: t.now, who: me.name, whoId: me.id, q, a: ans ?? NEEDS_PERSON, answered: !!ans } satisfies Chat);
    await t.audit("trust.question.asked", q.slice(0, 60), "Policy");
    return { ans, reply: ans ?? NEEDS_PERSON };
  });

  return {
    "GET ws/data/trust": data,
    "POST ws/trust/requests/:id/approve": approve, "POST ws/trust/requests/:id/deny": deny, "POST ws/trust/accounts/:id/revoke": revoke,
    "POST ws/trust/blocked-domains": block, "POST ws/trust/blocked-domains/:domain/delete": unblock, "POST ws/trust/chatbot": chatbot,
    "POST ws/trust/resources": publish, "POST ws/trust/resources/:id/visibility": visibility, "POST ws/trust/resources/:id/file": upload, "GET ws/trust/resources/:id/link": link,
    "POST ws/trust/access-requests": requestAccess, "POST ws/trust/nda": nda, "POST ws/trust/subscriptions": subscribe, "POST ws/trust/questions": ask,
  };
}
