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
   - The anonymous public page (group 8b, server/trustpublic.ts) is off until an admin or owner asks to turn it on and a second one approves
     (four-eyes `trust.public-page`); turning it off is immediate. Visitors without an account verify their address by email before they
     request a document, accept the NDA or subscribe. A decision on a visitor's request is emailed to them.
   - What people outside the company see (security fix F1-02, lib/trustSections.ts): the company publishes each section (FAQ,
     sub-processors, updates, live control status, documents) or not; a hidden section is left out of what the server sends. Showing the live
     control status needs a second admin or owner (four-eyes `trust.section-controls`); every other change, and hiding it, is immediate.
     Documents under NDA are only counted, never named, until they are granted to the person looking. A request names no document under NDA
     ("Documents under NDA", with a reason); the approver chooses which ones to grant.
   - Accounts hold document ids (a rename never changes access) and their viewers as stable keys: the member's user id, or a keyed hash of a
     visitor's normalised address (the address is kept for display and email only). The NDA is accepted by each viewer for themselves.
     Records from before are brought up to date when read: names become ids (a name matching no document is dropped, and the drop audited),
     and an NDA accepted for the whole account counts for nobody until each viewer accepts it. */
import { createHmac } from "node:crypto";
import { DOMAIN_RE, isoDayOf, trustManageBlock } from "@/lib/rulesWs";
import { isNdaDoc, isTrustSection, NDA_DOCS, sectionLabel, sectionsOf, visibleDocs, type TrustSection, type TrustSections } from "@/lib/trustSections";
import type { Deps } from "../types";
import { approvalsView, err, invalid, membersOf, missing, ok, refuse, str, sweepApprovals, txt, wsRoute, type WsHelpers, refuseFile } from "./common";
import type { Control } from "./assurance";
import { checkFile } from "./files";
import { pendingOf, registerFourEyes } from "./foureyes";
import type { Answer } from "./questionnaires";
import type { Actor, Rec, WsTx } from "./store";
import type { Vendor } from "./vendors";
import { mailConfigured, sendMail } from "../mail";

export interface Resource { id: string; name: string; access: "Public" | "On request, NDA"; status: "Active"; editedBy: string; editedById: string; approvedBy?: string; at: string; file?: { path: string; name: string; size: number; type: string } }
/** One viewer of an account: `key` is `u:<user id>` for a member or `e:<keyed hash of the address>` for a visitor; `email` is for display
 *  and email only. `nda`: when and by whom this viewer accepted the NDA. */
export interface Person { key: string; email: string; nda?: { at: string; by: string } }
/** `access` holds document ids; `viewers` the addresses (display). `nda`/`ndaBy` are from before F1-02 and open nothing any more. */
export interface Account { id: string; company: string; domain: string; nda: string; ndaBy?: string; viewers: string[]; people?: Person[]; access: string[]; status: "Active" | "Revoked"; revokeReason?: string }
/** `resourceId` "" with `resource` "Documents under NDA": a request that names no document; `granted`: the document ids the approver chose. */
export interface TrustRequest { id: string; who: string; whoId: string; company: string; resource: string; resourceId: string; reason: string; at: string; atMs: number; status: "Pending" | "Approved" | "Denied"; by?: string; byId?: string; note?: string; decidedAt?: string; granted?: string[] }
export interface Settings { chatbot: boolean; blocked: { domain: string; by: string; at: string }[]; unblocked: Record<string, string>; publicPage?: { on: boolean; name: string; ref: string; since: string; by: string }; sections?: Partial<TrustSections> }
export interface Chat { id: string; at: string; atMs: number; who: string; whoId: string; q: string; a: string; answered: boolean }
export const TRUST_KINDS = ["trust.publish", "trust.public-page", "trust.section-controls"];
export const NEEDS_PERSON = "Thanks — this one needs a person. Your question was passed to the security team, who will reply to you.";
export const domainOf = (email: string) => String(email).trim().toLowerCase().split("@").pop() || "";
export const labelOf = (email: string) => { const l = domainOf(email).split(".")[0] || ""; return l ? l.charAt(0).toUpperCase() + l.slice(1, 80) : "—"; };

export async function settings(t: WsTx): Promise<Rec<Settings>> {
  const s = await t.get<Settings>("trust-settings", "settings");
  if (s) return s;
  const fresh: Settings = { chatbot: true, blocked: [], unblocked: {} }; await t.insert("trust-settings", "settings", fresh);
  return (await t.get<Settings>("trust-settings", "settings"))!;
}
/** Best keyword overlap with the verified answers (the same matching as the demonstration); null when nothing scores. */
export function botAnswer(q: string, pool: { q: string; a: string }[]): string | null {
  const ql = q.toLowerCase(); let best: string | null = null; let bestScore = 0;
  for (const a of pool) { const score = a.q.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && ql.includes(w)).length; if (score > bestScore) { bestScore = score; best = a.a; } }
  return bestScore >= 1 ? best : null;
}
/** The public page's change history and viewer activity (Activity & history tab). */
async function history(t: WsTx, change: string) { const id = `TH-${await t.next("trust-history", 0)}`; await t.insert("trust-history", id, { at: isoDayOf(t.now), who: t.actor.name, change: change.slice(0, 300) }); }
export async function activity(t: WsTx, what: string) { const id = `TV-${await t.next("trust-activity", 0)}`; await t.insert("trust-activity", id, { at: isoDayOf(t.now), who: t.actor.name, what: what.slice(0, 300) }); }
/** The blocklist entries a requester's address falls under (its domain or a parent domain). */
export const blockedBy = (email: string, domains: string[]) => { const dom = domainOf(email); return domains.filter((b) => dom === b || dom.endsWith("." + b)); };
async function emailOf(d: Deps, id: string) { return (await d.store.profileById(id))?.email?.toLowerCase() ?? ""; }

/* ----- viewers, accounts and what outsiders see (F1-02) ----- */
export const memberKey = (userId: string) => `u:${userId}`;
/** A visitor's stable key: a keyed hash of the normalised address, so the address itself is never the reference. */
export const visitorKey = (d: Deps, email: string) => `e:${createHmac("sha256", d.secret).update(`trust-viewer|${String(email).trim().toLowerCase()}`).digest("hex").slice(0, 40)}`;
/** An address from a record made before F1-02: the member it belongs to, when one of this company's members has it, else a visitor. */
async function legacyKey(d: Deps, tenantId: string, email: string) {
  const p = await d.store.profileByEmail(String(email).trim().toLowerCase()).catch(() => null);
  return p && (await d.dir.membership(tenantId, p.id)) ? memberKey(p.id) : visitorKey(d, email);
}
/** The company's accounts, with records from before F1-02 brought up to date and saved: document names in `access` become ids (by the
 *  current name; a name that matches no document is dropped and the drop written to the log), and viewers become people with stable keys
 *  and no NDA accepted yet (an NDA accepted for the whole account counts for nobody). */
export async function accountsOf(d: Deps, t: WsTx): Promise<Rec<Account>[]> {
  const recs = await t.list<Account>("trust-account"); if (!recs.length) return recs;
  const docs = (await t.list<Resource>("trust-resource")).map((x) => x.data); const ids = new Set(docs.map((x) => x.id));
  for (const rec of recs) {
    const a = rec.data; let changed = false; const access: string[] = [];
    for (const v of Array.isArray(a.access) ? a.access.map(String) : []) {
      const id = ids.has(v) ? v : (docs.find((x) => x.name === v) ?? docs.find((x) => x.name.toLowerCase() === v.toLowerCase()))?.id;
      if (id !== v) changed = true;
      if (!id) { await t.audit("trust.account.access.dropped", `${a.company}: "${v.slice(0, 160)}" matches no document, access removed`, "Policy", true); continue; }
      if (!access.includes(id)) access.push(id);
    }
    if (!Array.isArray(a.access)) changed = true;
    if (!Array.isArray(a.people)) {
      a.people = []; for (const em of a.viewers ?? []) { const key = await legacyKey(d, t.actor.tenantId, em); if (!a.people.some((p) => p.key === key)) a.people.push({ key, email: em }); }
      changed = true;
    }
    if (changed) { a.access = access; a.viewers = a.people.map((p) => p.email); await t.update("trust-account", rec.id, a, rec.version); rec.version += 1; }
  }
  return recs;
}
/** The active account `key` is a viewer of, and that viewer. */
export function accountFor(accs: Rec<Account>[], key: string | null) {
  if (!key) return null;
  for (const rec of accs) { const p = rec.data.status === "Active" ? rec.data.people?.find((x) => x.key === key) : undefined; if (p) return { rec, acct: rec.data, person: p }; }
  return null;
}
export interface PageView {
  chatbot: boolean; faq?: { q: string; a: string }[]; subprocessors?: { name: string; purpose: string }[]; updates?: { at: string; title: string }[]; controls?: [string, string][];
  documents?: { id: string; name: string; access: string; file: boolean; open: boolean }[]; ndaCount?: number;
}
/** What a person outside the company sees: only the published sections (a hidden one is not in the result at all), public documents, and
 *  documents under NDA by name only once granted to this viewer (`key`; null for anyone not on an account, and for an admin's preview). */
export async function pageView(d: Deps, t: WsTx, key: string | null) {
  const s = (await settings(t)).data; const sec = sectionsOf(s.sections);
  const docs = (await t.list<Resource>("trust-resource")).map((x) => x.data);
  const mine = key ? accountFor(await accountsOf(d, t), key) : null; const granted = new Set(mine?.acct.access ?? []);
  const view: PageView = { chatbot: s.chatbot };
  if (sec.faq) view.faq = (await t.list<Answer>("answer")).map((x) => x.data).filter((x) => x.verified).map((x) => ({ q: x.q, a: x.a }));
  if (sec.subprocessors) view.subprocessors = (await t.list<Vendor>("vendor")).map((x) => x.data).filter((v) => v.data && v.gate === "Approved").map((v) => ({ name: v.name, purpose: v.cat }));
  if (sec.updates) view.updates = docs.filter((r) => r.access === "Public").sort((x, y) => y.at.localeCompare(x.at)).slice(0, 5).map((r) => ({ at: r.at, title: `${r.name} published` }));
  if (sec.controls) {
    const byDomain = new Map<string, { n: number; pass: number }>();
    for (const c of (await t.list<Control>("control")).map((x) => x.data)) { const k = byDomain.get(c.domain) ?? { n: 0, pass: 0 }; k.n++; if (c.status === "Pass") k.pass++; byDomain.set(c.domain, k); }
    view.controls = [...byDomain.entries()].map(([k, v]) => [k, v.pass === v.n ? "Pass" : "In review"]);
  }
  if (sec.documents) {
    const v = visibleDocs(docs, (x) => granted.has(x.id));
    view.documents = v.listed.map((x) => ({ id: x.id, name: x.name, access: x.access, file: !!x.file, open: !isNdaDoc(x.access) || !!mine?.person.nda }));
    view.ndaCount = v.ndaHidden;
  }
  const nameOf = (id: string) => docs.find((x) => x.id === id)?.name ?? "";
  /** A request as its requester sees it: a document under NDA is named only once it is granted to them. */
  const requestLabel = (q: TrustRequest) => {
    const doc = q.resourceId ? docs.find((x) => x.id === q.resourceId) : undefined;
    const names = (q.granted ?? []).filter((id) => granted.has(id)).map(nameOf).filter(Boolean);
    if (names.length) return `${NDA_DOCS}: ${names.join(", ")}`;
    return doc && (!isNdaDoc(doc.access) || granted.has(doc.id)) ? doc.name : NDA_DOCS;
  };
  return { view, sections: sec, mine, granted: [...granted].map(nameOf).filter(Boolean), requestLabel, docs };
}
/** Which documents an approval grants: those the approver chose (each must be a document under NDA), or the one an older request named. */
async function grantOf(t: WsTx, q: TrustRequest, chosen: unknown): Promise<{ ids: string[]; names: string[] }> {
  const docs = (await t.list<Resource>("trust-resource")).map((x) => x.data);
  const ask = Array.isArray(chosen) ? chosen.slice(0, 50).map((x) => str(x, 20)) : q.resourceId ? [q.resourceId] : [];
  const out = [...new Set(ask)].map((id) => docs.find((x) => x.id === id && isNdaDoc(x.access)) ?? invalid("Choose documents under NDA from the list."));
  if (!out.length) invalid("Select at least one document under NDA to grant.");
  return { ids: out.map((x) => x.id), names: out.map((x) => x.name) };
}

registerFourEyes("trust.publish", { mod: "trust", apply: async (_d, t, a, by) => {
  const rec = (await t.get<Resource>("trust-resource", String(a.payload.resourceId))) ?? missing("Resource");
  // whoever changed the document after the request was raised can never approve its publication
  if (rec.data.editedById === t.actor.id) refuse("Segregation of duties: you edited this document, so a different admin or owner must approve publishing it.");
  rec.data.access = "Public"; rec.data.approvedBy = by; await t.update("trust-resource", rec.id, rec.data, rec.version);
  await history(t, `${rec.data.name} made public (approved by ${by})`);
  await t.audit("trust.visibility.changed", `${rec.data.name} → Public (approved by ${by}; requested by ${a.requestedByName})`, "Policy");
} });
registerFourEyes("trust.public-page", { mod: "trust", apply: async (_d, t, a, by) => {
  const rec = await settings(t); const p = a.payload as { name: string; ref: string };
  rec.data.publicPage = { on: true, name: String(p.name), ref: String(p.ref), since: isoDayOf(t.now), by }; await t.update("trust-settings", rec.id, rec.data, rec.version);
  await history(t, `Public page turned on (approved by ${by})`);
  await t.audit("trust.public_page.enabled", `/trust/${p.ref} (approved by ${by}; requested by ${a.requestedByName})`, "Policy");
} });
registerFourEyes("trust.section-controls", { mod: "trust", apply: async (_d, t, a, by) => {
  const rec = await settings(t); rec.data.sections = { ...sectionsOf(rec.data.sections), controls: true }; await t.update("trust-settings", rec.id, rec.data, rec.version);
  await history(t, `${sectionLabel("controls")} shown to visitors (approved by ${by})`);
  await t.audit("trust.section.changed", `${sectionLabel("controls")} → shown (approved by ${by}; requested by ${a.requestedByName})`, "Policy");
} });

export function trustRoutes(h: WsHelpers) {
  const tx = <T,>(d: Deps, c: { actor: Actor }, w: (t: WsTx) => Promise<T>) => d.ws.tx(c.actor, d.now(), w);
  const admin = (fn: (d: Deps, t: WsTx, b: Record<string, unknown>, p: string[], a: Actor) => Promise<unknown>) => wsRoute(h, "trust", async (d, r, c) => {
    refuse(trustManageBlock(c.actor.role));
    return tx(d, c, async (t) => { await sweepApprovals(t, TRUST_KINDS); return ok((await fn(d, t, r.body, r.path, c.actor)) ?? { ok: true }); });
  });
  const visitor = (fn: (d: Deps, t: WsTx, b: Record<string, unknown>, p: string[], a: Actor) => Promise<unknown>) => wsRoute(h, "trust", async (d, r, c) => tx(d, c, async (t) => ok(await fn(d, t, r.body, r.path, c.actor))));

  /** What a member who sees the page reads (Viewer and Vendor roles), built from the company's own records and the sections it publishes.
   *  An admin's or owner's preview is what someone without access sees. */
  async function publicView(d: Deps, t: WsTx, a: Actor) {
    const company = (await d.dir.companiesOf(a.id)).find((m) => m.company.id === a.tenantId)?.company.name ?? "";
    const preview = !trustManageBlock(a.role);
    const pv = await pageView(d, t, preview ? null : memberKey(a.id)); const { view } = pv;
    return {
      company, ...view, ...(view.subprocessors ? { subprocessors: view.subprocessors.map((x) => ({ ...x, region: "—" })) } : {}),
      account: pv.mine ? { company: pv.mine.acct.company, nda: pv.mine.person.nda ? `Accepted ${pv.mine.person.nda.at}` : "Pending", access: pv.granted } : null,
      myRequests: preview ? [] : (await t.list<TrustRequest>("trust-request")).map((x) => x.data).filter((x) => x.whoId === a.id).map((x) => ({ resource: pv.requestLabel(x), status: x.status, at: x.at })),
      subscribed: !!(await t.get("trust-sub", a.id)),
    };
  }
  const data = wsRoute(h, "trust", async (d, _r, c) => {
    if (!trustManageBlock(c.actor.role)) await (await import("../trustpublic")).drainOutbox(d, c.actor.tenantId, 5_000).catch(() => undefined); // update emails still waiting
    return dataOf(d, c);
  });
  const dataOf = async (d: Deps, c: { actor: Actor }) => ok(await tx(d, c, async (t) => {
    await sweepApprovals(t, TRUST_KINDS);
    const pending = await pendingOf(t, TRUST_KINDS);
    const resources = (await t.list<Resource>("trust-resource")).map((x) => ({ ...x.data, file: x.data.file ? { name: x.data.file.name, size: x.data.file.size } : undefined, publishPending: pending.find((a) => a.payload.resourceId === x.id)?.id }));
    const pub = await publicView(d, t, c.actor);
    // a member outside administration gets only the documents the page shows them (none when the company does not publish documents)
    if (trustManageBlock(c.actor.role)) { const seen = new Set((pub.documents ?? []).map((x) => x.id)); return { resources: resources.filter((x) => seen.has(x.id)).map((x) => ({ id: x.id, name: x.name, access: x.access, status: x.status, file: x.file ? { name: x.file.name } : undefined })), public: pub, filesConfigured: false }; }
    const s = (await settings(t)).data; const names = new Map((await membersOf(d, c.actor)).map((m) => [m.id, m.name]));
    const reqs = (await t.list<TrustRequest>("trust-request")).map((x) => x.data);
    const nameOf = (id: string) => resources.find((x) => x.id === id)?.name ?? "";
    const grantText = (q: TrustRequest) => (q.granted?.length ? `${q.resource}: ${q.granted.map(nameOf).filter(Boolean).join(", ")}` : q.resource);
    return {
      resources, public: pub, filesConfigured: d.files.configured,
      accounts: (await accountsOf(d, t)).map(({ data: a }) => {
        const people = (a.people ?? []).map((p) => ({ email: p.email, nda: p.nda ? `Accepted ${p.nda.at}` : "Pending" })); const n = people.filter((p) => p.nda !== "Pending").length;
        return { id: a.id, company: a.company, domain: a.domain, status: a.status, revokeReason: a.revokeReason, viewers: people.map((p) => p.email), people,
          nda: n ? `Accepted by ${n} of ${people.length}` : "Pending", access: a.access.map(nameOf).filter(Boolean), accessIds: a.access };
      }),
      requests: reqs.filter((x) => x.status === "Pending").reverse(),
      decisions: reqs.filter((x) => x.status !== "Pending").reverse().map((x) => ({ at: x.decidedAt ?? x.at, who: x.who, resource: grantText(x), decision: x.status, by: x.by ?? "", note: x.note ?? "" })),
      blocked: s.blocked.map((b) => b.domain), chatbot: s.chatbot,
      publicPage: { on: !!s.publicPage?.on, ref: s.publicPage?.ref ?? "", since: s.publicPage?.since ?? "", by: s.publicPage?.by ?? "", pending: pending.find((a) => a.kind === "trust.public-page")?.id ?? null, mail: mailConfigured(d) },
      sections: sectionsOf(s.sections), sectionsPending: pending.find((a) => a.kind === "trust.section-controls")?.id ?? null,
      chats: (await t.list<Chat>("trust-chat")).map((x) => x.data).reverse().slice(0, 200).map((x) => ({ at: x.at, who: x.who, q: x.q, a: x.a })),
      subscribers: (await t.list("trust-sub")).length,
      activity: (await t.list<{ at: string; who: string; what: string }>("trust-activity")).map((x) => x.data).reverse().slice(0, 50),
      modeHist: (await t.list<{ at: string; who: string; change: string }>("trust-history")).map((x) => x.data).reverse().slice(0, 50),
      approvals: await approvalsView(t, TRUST_KINDS, names),
    };
  }));

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
      // a request from the public page carries only an address: the approver's own, or any member's, is refused (members use the workspace)
      if (!q.whoId) {
        const mine = await emailOf(d, me.id); if (q.who === mine) refuse("Segregation of duties: you raised this request, so another admin or owner must approve it.");
        const ms = await membersOf(d, me); for (const m of ms) if ((await emailOf(d, m.id)) === q.who) refuse("This address belongs to a member of your company. Members open documents in the workspace, not through the public page.");
      }
      if (blockedBy(q.who, Object.keys(s.unblocked)).some((dom) => s.unblocked[dom] === me.id)) refuse("Segregation of duties: you unblocked this domain, so another admin or owner must approve its requests.");
      // the approver chooses which documents under NDA to grant; none chosen is refused
      const grant = await grantOf(t, q, r.body.resourceIds);
      q.status = "Approved"; q.by = me.name; q.byId = me.id; q.decidedAt = isoDayOf(t.now); q.granted = grant.ids; await t.update("trust-request", rec.id, q, rec.version);
      const key = q.whoId ? memberKey(q.whoId) : visitorKey(d, q.who);
      const acc = (await accountsOf(d, t)).find((x) => x.data.domain === domainOf(q.who)); let fresh = true;
      if (acc) {
        const a = acc.data; const people = a.people ?? [];
        if (a.status === "Revoked") { a.status = "Active"; a.nda = "Pending"; delete a.ndaBy; a.access = []; people.length = 0; } // a revoked account starts over
        const p = people.find((x) => x.key === key); if (p) { fresh = !p.nda; p.email = q.who; } else people.push({ key, email: q.who });
        for (const id of grant.ids) if (!a.access.includes(id)) a.access.push(id);
        a.people = people; a.viewers = people.map((x) => x.email); await t.update("trust-account", acc.id, a, acc.version);
      } else {
        const id = `TA-${await t.next("trust-account", 0)}`;
        await t.insert("trust-account", id, { id, company: q.company, domain: domainOf(q.who), nda: "Pending", viewers: [q.who], people: [{ key, email: q.who }], access: grant.ids, status: "Active" } satisfies Account);
      }
      const names = grant.names.join(", ");
      await t.audit("trust.access.approved", `${q.id}: ${q.company} → ${names}`, "Policy");
      await t.notify(q.whoId, `Your request for ${q.resource} was approved: ${names}.${fresh ? " Accept the NDA on the Trust Center to open them." : ""}`);
      return { who: q.who, visitor: !q.whoId, resource: names, page: (await settings(t)).data.publicPage };
    });
    if (out === "blocked") return err(403, "Blocked domain: this request cannot be approved.");
    // a visitor without an account has no bell: they are told by email
    if (out.visitor && out.page) await sendMail(d, out.who, { t: "trust-decided", company: out.page.name, resource: out.resource, approved: true, note: "", link: `${d.site.origin}/trust/${out.page.ref}` }, { tenantId: me.tenantId, actor: me.name, ip: r.ip });
    return ok({ ok: true });
  });
  const deny = wsRoute(h, "trust", async (d, r, c) => {
    refuse(trustManageBlock(c.actor.role));
    const out = await tx(d, c, async (t) => denyIn(t, r.body, r.path, c.actor));
    // after the decision committed: a visitor without an account is told by email
    if (out.mailTo && out.page) await sendMail(d, out.mailTo, { t: "trust-decided", company: out.page.name, resource: out.resource, approved: false, note: out.note, link: `${d.site.origin}/trust/${out.page.ref}` }, { tenantId: c.actor.tenantId, actor: c.actor.name, ip: r.ip });
    return ok({ ok: true });
  });
  async function denyIn(t: WsTx, b: Record<string, unknown>, p: string[], me: Actor) {
    const rec = (await t.get<TrustRequest>("trust-request", str(p[3], 20))) ?? missing("Request"); const q = rec.data;
    if (q.status !== "Pending") invalid("This request was already decided.");
    const note = txt(b.note, 300);
    q.status = "Denied"; q.by = me.name; q.byId = me.id; q.note = note; q.decidedAt = isoDayOf(t.now); await t.update("trust-request", rec.id, q, rec.version);
    await t.audit("trust.access.denied", `${q.id}: ${q.company} → ${q.resource}${note ? `; note: ${note}` : ""}`, "Policy");
    await t.notify(q.whoId, `Your request for ${q.resource} was declined${note ? `: ${note}` : "."}`);
    return { mailTo: q.whoId ? "" : q.who, page: (await settings(t)).data.publicPage, resource: q.resource, note };
  }
  const revoke = admin(async (_d, t, b, p) => {
    const rec = (await t.get<Account>("trust-account", str(p[3], 20))) ?? missing("Account"); const a = rec.data;
    if (a.status === "Revoked") invalid("Access is already revoked.");
    const reason = txt(b.reason, 300); if (reason.length < 10) invalid("Give a reason of at least 10 characters.");
    a.status = "Revoked"; a.viewers = []; a.people = []; a.access = []; a.revokeReason = reason; await t.update("trust-account", rec.id, a, rec.version);
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
  /** The anonymous public page: turning it on is a request a second admin or owner approves; turning it off is immediate. */
  const publicPage = admin(async (d, t, b, _p, me) => {
    const rec = await settings(t); const s = rec.data;
    if (b.enabled !== true) {
      if (!s.publicPage?.on) invalid("The public page is already off.");
      s.publicPage = { ...s.publicPage!, on: false }; await t.update("trust-settings", rec.id, s, rec.version);
      await history(t, "Public page turned off"); await t.audit("trust.public_page.disabled", `/trust/${s.publicPage.ref}`, "Policy");
      return { on: false, pending: false };
    }
    if (s.publicPage?.on) invalid("The public page is already on.");
    if ((await pendingOf(t, ["trust.public-page"])).length) invalid("Turning the public page on is already awaiting approval.");
    const co = (await d.dir.companiesOf(me.id)).find((m) => m.company.id === me.tenantId)?.company; if (!co) invalid("Company not found.");
    await t.request({ kind: "trust.public-page", title: `Turn on the public Trust Center page (/trust/${co!.ref})`, subject: "public-page", payload: { name: co!.name, ref: co!.ref }, needs: 1, approverRoles: ["admin", "owner"], forbid: [me.id], ttlMs: 24 * 3600_000 });
    await t.audit("trust.public_page.requested", `/trust/${co!.ref}`, "Policy");
    return { on: false, pending: true };
  });
  /** What visitors can see: hiding any section, or showing one, is immediate, except showing the live control status, which a second admin
   *  or owner approves (four-eyes `trust.section-controls`, the requester can never approve it). Every change is audited and in the history. */
  const sections = admin(async (_d, t, b, _p, me) => {
    const k: TrustSection = isTrustSection(b.section) ? b.section : invalid("Choose a section of the page.");
    const on = b.on === true; const rec = await settings(t); const cur = sectionsOf(rec.data.sections); const label = sectionLabel(k);
    if (k === "controls" && on && (await pendingOf(t, ["trust.section-controls"])).length) invalid("Showing the live control status is already awaiting approval.");
    if (cur[k] === on) invalid(`${label} is already ${on ? "shown" : "hidden"}.`);
    if (k === "controls" && on) {
      await t.request({ kind: "trust.section-controls", title: "Show the live control status on the Trust Center", subject: "section-controls", payload: { section: "controls" }, needs: 1, approverRoles: ["admin", "owner"], forbid: [me.id], ttlMs: 24 * 3600_000 });
      await t.audit("trust.section.requested", `${label} → shown`, "Policy");
      await history(t, `Asked to show ${label.toLowerCase()} to visitors (needs a second admin or owner)`);
      return { section: k, on: false, pending: true };
    }
    rec.data.sections = { ...cur, [k]: on }; await t.update("trust-settings", rec.id, rec.data, rec.version);
    await t.audit("trust.section.changed", `${label} → ${on ? "shown" : "hidden"}`, "Policy");
    await history(t, `${label} ${on ? "shown to" : "hidden from"} visitors`);
    return { section: k, on, pending: false };
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
    const chk = checkFile(r.body.name, r.raw ?? new Uint8Array()); if ("error" in chk) await refuseFile(d, c.actor, chk, r.body.name);
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
    if (trustManageBlock(me.role)) {
      // outside administration: only what the page shows this member (documents published, and one under NDA only once granted to them)
      if (!sectionsOf((await settings(t)).data.sections).documents) missing("Resource");
      if (x.access !== "Public") {
        const mine = accountFor(await accountsOf(d, t), memberKey(me.id));
        if (!mine || !mine.acct.access.includes(x.id)) missing("Resource");
        if (!x.file) invalid("No file has been attached to this document yet.");
        if (!mine!.person.nda) refuse("Accept the NDA first.");
      }
    }
    if (!x.file) invalid("No file has been attached to this document yet.");
    const url = await d.files.link(x.file!.path, x.file!.name, 60);
    await t.audit("trust.document.viewed", `${x.name} by ${me.name}`, "Policy"); await activity(t, `Opened ${x.name}`);
    return { url };
  });
  /** A member asks for documents under NDA (naming none: their names are not shown) with a reason; a public document is opened directly. */
  const requestAccess = visitor(async (d, t, b, _p, me) => {
    if (!sectionsOf((await settings(t)).data.sections).documents) missing("Resource");
    const rid = str(b.resourceId, 20); const rec = rid ? await t.get<Resource>("trust-resource", rid) : null;
    const mine = accountFor(await accountsOf(d, t), memberKey(me.id));
    // naming a document under NDA that is not granted to them answers as if it did not exist (no probing of ids or names)
    if (rid && (!rec || (isNdaDoc(rec.data.access) && !mine?.acct.access.includes(rec.id)))) missing("Resource");
    const em = await emailOf(d, me.id); if (!em) invalid("Your account has no email address.");
    const reqs = (await t.list<TrustRequest>("trust-request")).map((x) => x.data);
    if (reqs.filter((x) => x.whoId === me.id && x.atMs > t.now - 3600_000).length >= 3) invalid("Too many requests. Please wait an hour before trying again.");
    if (rec) return { queued: false };
    const reason = txt(b.reason, 300); if (reason.length < 10) invalid("Give a reason of at least 10 characters.");
    if (reqs.some((x) => x.whoId === me.id && !x.resourceId && x.status === "Pending") || reqs.filter((x) => x.status === "Pending").length >= 200) return { queued: false };
    const id = `TR-${await t.next("trust-request", 0)}`;
    await t.insert("trust-request", id, { id, who: em, whoId: me.id, company: labelOf(em), resource: NDA_DOCS, resourceId: "", reason, at: isoDayOf(t.now), atMs: t.now, status: "Pending" } satisfies TrustRequest);
    await t.audit("trust.access.requested", `${id}: ${NDA_DOCS}`, "Policy");
    return { queued: true };
  });
  /** Each viewer accepts the NDA for themselves; it never covers a colleague. */
  const nda = visitor(async (d, t, _b, _p, me) => {
    const mine = accountFor(await accountsOf(d, t), memberKey(me.id));
    if (!mine) invalid("You have no Trust Center access yet. Request documents first.");
    if (mine!.person.nda) invalid("You already accepted the NDA.");
    mine!.person.nda = { at: isoDayOf(t.now), by: me.name }; await t.update("trust-account", mine!.rec.id, mine!.acct, mine!.rec.version);
    await t.audit("trust.nda.accepted", `${mine!.acct.company} by ${me.name}`, "Policy");
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
    "POST ws/trust/blocked-domains": block, "POST ws/trust/blocked-domains/:domain/delete": unblock, "POST ws/trust/chatbot": chatbot, "POST ws/trust/public-page": publicPage, "POST ws/trust/sections": sections,
    "POST ws/trust/resources": publish, "POST ws/trust/resources/:id/visibility": visibility, "POST ws/trust/resources/:id/file": upload, "GET ws/trust/resources/:id/link": link,
    "POST ws/trust/access-requests": requestAccess, "POST ws/trust/nda": nda, "POST ws/trust/subscriptions": subscribe, "POST ws/trust/questions": ask,
  };
}
