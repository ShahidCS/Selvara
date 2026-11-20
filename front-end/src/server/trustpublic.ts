/* Server-only. The anonymous public Trust Center (production programme group 8b; inventory group 4, section 4 and group 8, E12-E15), at
   /trust/<company code>. Off until a company turns it on (a second admin or owner approves, server/ws/trust.ts). What anyone sees is the same
   page members see, built from the company's own records: its name, verified answers, approved sub-processors, control status by domain,
   documents and recent publications. Public documents open for anyone; the rest only for a verified visitor whose company's account was
   given access by an admin or owner and whose NDA is accepted.
   - Verifying: a work email (personal and temporary domains refused), a one-time code by email, then a visitor session for this company
     (server/visitor.ts). Without email set up, the page is read-only and says so.
   - Requests: 3 an hour per address, one pending per document, 200 pending at most; a blocked domain may ask, but its requests cannot be
     approved. Questions to the chatbot: 20 an hour per network address, answered only from verified answers.
   - Subscriptions: verified addresses only; each update email carries a one-click unsubscribe link. A new public document is emailed to
     subscribers after its publication was approved and committed.
   - Everything a visitor does is written to the company's audit log as "Visitor <masked address>" (or "Public visitor"). */
import { createHash, randomBytes } from "node:crypto";
import type { Req, Res } from "./core";
import { mailConfigured, maskEmail, sendMail } from "./mail";
import type { Deps } from "./types";
import { checkCode, endVisitor, sendCode, visitorOf, workEmailBlock, type Visitor } from "./visitor";
import { onCommitted } from "./ws/common";
import type { Control } from "./ws/assurance";
import type { Answer } from "./ws/questionnaires";
import { WsConflict, WsRefused, type Actor, type WsTx } from "./ws/store";
import { activity, blockedBy, botAnswer, labelOf, NEEDS_PERSON, settings, type Account, type Chat, type Resource, type Settings, type TrustRequest } from "./ws/trust";
import type { Vendor } from "./ws/vendors";

const ok = (body?: unknown, cookies?: string[]): Res => ({ status: body === undefined ? 204 : 200, body, cookies });
const err = (status: number, error: string): Res => ({ status, body: { error } });
const s = (v: unknown, max = 300) => String(v ?? "").slice(0, max).trim();
const h = (v: string) => createHash("sha256").update(v).digest("hex");
const HOUR = 3600_000;
const NOT_PUBLIC = "This Trust Center is not public.";
const NO_MAIL = "Verifying an address needs email, which this Trust Center has not set up yet.";
interface Sub { email: string; at: string; token: string }

/** The company of a public page: its code must belong to an active company whose page is on. */
async function companyOf(d: Deps, ref: unknown): Promise<string | null> { const code = s(ref, 40).toLowerCase(); return /^[a-z0-9-]{2,40}$/.test(code) ? d.dir.companyByCode(code) : null; }
const actorFor = (tenantId: string, ip: string, v?: Visitor | null): Actor => ({ id: "", name: v ? `Visitor ${maskEmail(v.email)}` : "Public visitor", role: "viewer", tenantId, ip });
/** Runs `work` for a company whose public page is on; null when it is not. */
async function onPage<T>(d: Deps, r: Req, ref: unknown, work: (t: WsTx, tenantId: string, page: { name: string; ref: string }, v: Visitor | null) => Promise<T>): Promise<T | null> {
  const tenantId = await companyOf(d, ref); if (!tenantId) return null;
  const v = await visitorOf(d, r, "trust"); const me = v && v.tenantId === tenantId ? v : null;
  return d.ws.tx(actorFor(tenantId, r.ip, me), d.now(), async (t) => {
    // read only: a visit never creates anything for a company whose page is off
    const page = (await t.get<Settings>("trust-settings", "settings"))?.data.publicPage; if (!page?.on) return null;
    return work(t, tenantId, page, me);
  });
}
const guard = (fn: (d: Deps, r: Req) => Promise<Res>) => async (d: Deps, r: Req): Promise<Res> => {
  try { return await fn(d, r); } catch (e) { if (e instanceof WsRefused) return err(e.status, e.message); if (e instanceof WsConflict) return err(409, e.message); throw e; }
};
const bad = (m: string, status = 400): never => { throw new WsRefused(m, status); };
async function under(d: Deps, bucket: string, key: string, max: number) {
  const now = d.now(); const list = ((await d.store.kvGet<number[]>(bucket, key)) ?? []).filter((x) => now - x < HOUR);
  if (list.length >= max) return false; await d.store.kvSet(bucket, key, [...list, now], HOUR); return true;
}

const view = guard(async (d, r) => {
  const out = await onPage(d, r, r.path[1], async (t, _tid, page, v) => {
    const resources = (await t.list<Resource>("trust-resource")).map((x) => x.data);
    const byDomain = new Map<string, { n: number; pass: number }>();
    for (const c of (await t.list<Control>("control")).map((x) => x.data)) { const k = byDomain.get(c.domain) ?? { n: 0, pass: 0 }; k.n++; if (c.status === "Pass") k.pass++; byDomain.set(c.domain, k); }
    const acct = v ? (await t.list<Account>("trust-account")).map((x) => x.data).find((x) => x.status === "Active" && x.viewers.includes(v.email)) : undefined;
    return {
      company: page.name, ref: page.ref, chatbot: (await settings(t)).data.chatbot, mail: mailConfigured(d),
      faq: (await t.list<Answer>("answer")).map((x) => x.data).filter((x) => x.verified).map((x) => ({ q: x.q, a: x.a })),
      subprocessors: (await t.list<Vendor>("vendor")).map((x) => x.data).filter((x) => x.data && x.gate === "Approved").map((x) => ({ name: x.name, purpose: x.cat })),
      updates: resources.filter((x) => x.access === "Public").sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5).map((x) => ({ at: x.at, title: `${x.name} published` })),
      controls: [...byDomain.entries()].map(([k, c]) => [k, c.pass === c.n ? "Pass" : "In review"]),
      documents: resources.map((x) => ({ id: x.id, name: x.name, access: x.access, file: !!x.file, open: x.access === "Public" || (!!acct && acct.access.includes(x.name) && acct.nda.startsWith("Accepted")) })),
      visitor: v ? {
        email: maskEmail(v.email), account: acct ? { company: acct.company, nda: acct.nda.startsWith("Accepted") ? "Accepted" : "Pending", access: acct.access } : null,
        requests: (await t.list<TrustRequest>("trust-request")).map((x) => x.data).filter((x) => x.who === v.email).map((x) => ({ resource: x.resource, status: x.status, at: x.at })),
        subscribed: !!(await t.get("trust-sub", `v-${h(v.email).slice(0, 32)}`)),
      } : null,
    };
  });
  return out ? ok(out) : err(404, NOT_PUBLIC);
});
const code = guard(async (d, r) => {
  if (!mailConfigured(d)) return err(409, NO_MAIL);
  const email = s(r.body.email, 254).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err(400, "Enter a valid email address.");
  const block = workEmailBlock(email); if (block) return err(400, block);
  const tenantId = await onPage(d, r, r.path[1], async (_t, tid) => tid); if (!tenantId) return err(404, NOT_PUBLIC);
  if (!(await sendCode(d, r, { tenantId, purpose: "trust", subject: "visitor", email }, "the Trust Center"))) return err(429, "Too many codes asked for. Wait an hour, then try again.");
  return ok({ sent: true, to: maskEmail(email) });
});
const verify = guard(async (d, r) => {
  const tenantId = await onPage(d, r, r.path[1], async (_t, tid) => tid); if (!tenantId) return err(404, NOT_PUBLIC);
  const email = s(r.body.email, 254).toLowerCase();
  const res = await checkCode(d, { tenantId, purpose: "trust", subject: "visitor", email }, s(r.body.code, 12));
  if (res.ok === false) return err(400, res.error);
  await d.ws.tx(actorFor(tenantId, r.ip, { tenantId, email } as Visitor), d.now(), (t) => t.audit("trust.visitor.verified", maskEmail(email), "Policy"));
  return ok({ ok: true }, [res.cookie]);
});
/** A verified visitor of this page, or a refusal. */
const verified = (v: Visitor | null): Visitor => v ?? bad("Confirm your email address first.", 401);
const request = guard(async (d, r) => {
  const out = await onPage(d, r, r.path[1], async (t, _tid, _page, v0) => {
    const v = verified(v0);
    const rec = (await t.get<Resource>("trust-resource", s(r.body.resourceId, 20))) ?? bad("Document not found.", 404);
    const reqs = (await t.list<TrustRequest>("trust-request")).map((x) => x.data);
    if (reqs.filter((x) => x.who === v.email && x.atMs > t.now - HOUR).length >= 3) bad("Too many requests. Please wait an hour before trying again.", 429);
    if (rec.data.access === "Public" || reqs.some((x) => x.who === v.email && x.resourceId === rec.id && x.status === "Pending") || reqs.filter((x) => x.status === "Pending").length >= 200) return { queued: false };
    const id = `TR-${await t.next("trust-request", 0)}`;
    await t.insert("trust-request", id, { id, who: v.email, whoId: "", company: labelOf(v.email), resource: rec.data.name, resourceId: rec.id, reason: s(r.body.reason, 300) || "—", at: new Date(t.now).toISOString().slice(0, 10), atMs: t.now, status: "Pending" } satisfies TrustRequest);
    await t.audit("trust.access.requested", `${id}: ${rec.data.name} (public page)${blockedBy(v.email, (await settings(t)).data.blocked.map((b) => b.domain)).length ? "; blocked domain" : ""}`, "Policy");
    return { queued: true };
  });
  return out ? ok(out) : err(404, NOT_PUBLIC);
});
const nda = guard(async (d, r) => {
  const out = await onPage(d, r, r.path[1], async (t, _tid, _page, v0) => {
    const v = verified(v0);
    const acc = (await t.list<Account>("trust-account")).find((x) => x.data.status === "Active" && x.data.viewers.includes(v.email)) ?? bad("Your company has no access yet. Request a document first.", 409);
    if (acc.data.nda.startsWith("Accepted")) bad("The NDA is already accepted.", 409);
    acc.data.nda = `Accepted ${new Date(t.now).toISOString().slice(0, 10)} by ${v.email}`; await t.update("trust-account", acc.id, acc.data, acc.version);
    await t.audit("trust.nda.accepted", `${acc.data.company} by ${maskEmail(v.email)} (public page)`, "Policy");
    return { ok: true };
  });
  return out ? ok(out) : err(404, NOT_PUBLIC);
});
const docLink = guard(async (d, r) => {
  const out = await onPage(d, r, r.path[1], async (t, _tid, _page, v) => {
    const x = ((await t.get<Resource>("trust-resource", s(r.path[3], 20))) ?? bad("Document not found.", 404)).data;
    if (!x.file) bad("No file has been attached to this document yet.", 404);
    if (x.access !== "Public") {
      const me = verified(v); const acct = (await t.list<Account>("trust-account")).map((y) => y.data).find((y) => y.status === "Active" && y.viewers.includes(me.email));
      if (!acct || !acct.access.includes(x.name)) bad("Request access to this document first.", 403);
      if (!acct!.nda.startsWith("Accepted")) bad("Accept the NDA first.", 403);
    }
    await t.audit("trust.document.viewed", `${x.name} by ${v ? maskEmail(v.email) : "a public visitor"} (public page)`, "Policy"); await activity(t, `Opened ${x.name} (public page)`);
    return { url: await d.files.link(x.file!.path, x.file!.name, 60) };
  });
  return out ? ok(out) : err(404, NOT_PUBLIC);
});
const subscribe = guard(async (d, r) => {
  const out = await onPage(d, r, r.path[1], async (t, _tid, _page, v0) => {
    const v = verified(v0); const id = `v-${h(v.email).slice(0, 32)}`;
    if (await t.get("trust-sub", id)) bad("You are already subscribed.", 409);
    await t.insert("trust-sub", id, { email: v.email, at: new Date(t.now).toISOString().slice(0, 10), token: randomBytes(24).toString("base64url") } satisfies Sub);
    await t.audit("trust.subscribed", `${maskEmail(v.email)} (public page)`, "Policy");
    return { ok: true };
  });
  return out ? ok(out) : err(404, NOT_PUBLIC);
});
/** One-click unsubscribe from the link in an update email (no session needed; the token is the subscription's own). */
const unsubscribe = guard(async (d, r) => {
  const token = s(r.body.token, 64); if (token.length < 20) return err(404, "This link is not valid.");
  const out = await onPage(d, r, r.path[1], async (t) => {
    const sub = (await t.list<Sub>("trust-sub")).find((x) => x.data.token === token); if (!sub) return "gone" as const;
    await t.update("trust-sub", sub.id, { ...sub.data, email: "", token: "", ended: new Date(t.now).toISOString().slice(0, 10) }, sub.version); // kept as a tombstone, without the address
    await t.audit("trust.unsubscribed", "a subscriber (public page)", "Policy");
    return "done" as const;
  });
  return out === null ? err(404, NOT_PUBLIC) : out === "gone" ? err(404, "This subscription has already ended.") : ok({ ok: true });
});
const ask = guard(async (d, r) => {
  const q = s(r.body.q, 1000); if (!q) return err(400, "Enter a question first");
  if (!(await under(d, "trust-ask", h(`${s(r.path[1], 40)}|${r.ip}`).slice(0, 32), 20))) return err(429, "Too many questions. Please wait an hour before asking again.");
  const out = await onPage(d, r, r.path[1], async (t, _tid, _page, v) => {
    const pool = (await t.list<Answer>("answer")).map((x) => x.data).filter((x) => x.verified);
    const ans = (await settings(t)).data.chatbot ? botAnswer(q, pool) : null;
    const id = `TC-${await t.next("trust-chat", 0)}`;
    await t.insert("trust-chat", id, { id, at: new Date(t.now).toISOString().slice(0, 10), atMs: t.now, who: v ? v.email.split("@")[1] : "anonymous", whoId: "", q, a: ans ?? NEEDS_PERSON, answered: !!ans } satisfies Chat);
    await t.audit("trust.question.asked", `${q.slice(0, 60)} (public page)`, "Policy");
    return { ans, reply: ans ?? (v ? NEEDS_PERSON : "Thanks — this one needs a person. Confirm your email address and request the document you need, or ask your contact at the company.") };
  });
  return out ? ok(out) : err(404, NOT_PUBLIC);
});

/* Update emails: after a document's publication is approved and committed, each verified subscriber gets a title and a link. */
onCommitted(async (d, a) => {
  const titles = (a.committed ?? []).filter((x) => x.action === "trust.visibility.changed" && x.target.includes(" → Public")).map((x) => x.target.split(" → Public")[0]);
  if (!titles.length) return;
  const { page, subs } = await d.ws.tx({ ...a, committed: undefined }, d.now(), async (t) => ({ page: (await settings(t)).data.publicPage, subs: (await t.list<Sub>("trust-sub")).map((x) => x.data).filter((x) => x.email && x.token) }));
  if (!page?.on) return;
  for (const sub of subs.slice(0, 500)) for (const title of titles)
    await sendMail(d, sub.email, { t: "trust-update", company: page.name, title, link: `${d.site.origin}/trust/${page.ref}`, unsubscribe: `${d.site.origin}/trust/${page.ref}#unsubscribe=${sub.token}` }, { tenantId: a.tenantId, actor: "System", ip: "system" });
});

export function trustPublicRoutes(): Record<string, (d: Deps, r: Req) => Promise<Res>> {
  return {
    "GET trust-public/:ref": view, "POST trust-public/:ref/code": code, "POST trust-public/:ref/verify": verify, "POST trust-public/:ref/requests": request,
    "POST trust-public/:ref/nda": nda, "GET trust-public/:ref/documents/:id/link": docLink, "POST trust-public/:ref/subscribe": subscribe,
    "POST trust-public/:ref/unsubscribe": unsubscribe, "POST trust-public/:ref/questions": ask, "POST trust-public/:ref/sign-out": (d, r) => endVisitor(d, r),
  };
}
