/* Server-only. The anonymous public Trust Center (production programme group 8b; inventory group 4, section 4 and group 8, E12-E15), at
   /trust/<company code>. Off until a company turns it on (a second admin or owner approves, server/ws/trust.ts). What anyone sees is the same
   page members see, built from the company's own records and only the sections the company publishes (a hidden section is not sent at
   all): its name, verified answers, approved sub-processors, control status by domain (off unless a second admin approved showing it),
   recent publications and documents. Public documents are listed and open for anyone; documents under NDA are only counted, and named
   only to a verified visitor they were granted to (as a viewer of their company's account), who opens them after accepting the NDA
   themselves (security fix F1-02).
   - Verifying: a work email (personal and temporary domains refused), a one-time code by email, then a visitor session for this company
     (server/visitor.ts). Without email set up, the page is read-only and says so.
   - Requests: for "Documents under NDA" with a reason (the approver chooses which to grant), 3 an hour per address, one pending at a time, 200 pending at most; a blocked domain may ask, but its requests cannot be
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
import type { Answer } from "./ws/questionnaires";
import { WsConflict, WsRefused, type Actor, type WsTx } from "./ws/store";
import { accountFor, accountsOf, activity, blockedBy, botAnswer, labelOf, NEEDS_PERSON, pageView, settings, visitorKey, type Chat, type Resource, type Settings, type TrustRequest } from "./ws/trust";
import { isNdaDoc, NDA_DOCS, sectionsOf } from "@/lib/trustSections";

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
    const pv = await pageView(d, t, v ? visitorKey(d, v.email) : null);
    return {
      company: page.name, ref: page.ref, mail: mailConfigured(d), ...pv.view,
      visitor: v ? {
        email: maskEmail(v.email), account: pv.mine ? { company: pv.mine.acct.company, nda: pv.mine.person.nda ? "Accepted" : "Pending", access: pv.granted } : null,
        requests: (await t.list<TrustRequest>("trust-request")).map((x) => x.data).filter((x) => x.who === v.email).map((x) => ({ resource: pv.requestLabel(x), status: x.status, at: x.at })),
        subscribed: !!(await t.get<Sub>("trust-sub", `v-${h(v.email).slice(0, 32)}`))?.data.token,
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
  const res = await checkCode(d, r, { tenantId, purpose: "trust", subject: "visitor", email }, s(r.body.code, 12));
  if (res.ok === false) return err(400, res.error);
  await d.ws.tx(actorFor(tenantId, r.ip, { tenantId, email } as Visitor), d.now(), (t) => t.audit("trust.visitor.verified", maskEmail(email), "Policy"));
  return ok({ ok: true }, [res.cookie]);
});
/** A verified visitor of this page, or a refusal. */
const verified = (v: Visitor | null): Visitor => v ?? bad("Confirm your email address first.", 401);
const NO_DOC = "Document not found.";
/** A verified visitor asks for "Documents under NDA" with a reason (their names are not shown, so none is named); naming a public
 *  document says to open it; naming one under NDA not granted to them answers as if it did not exist. */
const request = guard(async (d, r) => {
  const out = await onPage(d, r, r.path[1], async (t, _tid, _page, v0) => {
    const v = verified(v0);
    if (!sectionsOf((await settings(t)).data.sections).documents) bad(NO_DOC, 404);
    const rid = s(r.body.resourceId, 20); const rec = rid ? await t.get<Resource>("trust-resource", rid) : null;
    const mine = accountFor(await accountsOf(d, t), visitorKey(d, v.email));
    if (rid && (!rec || (isNdaDoc(rec.data.access) && !mine?.acct.access.includes(rec.id)))) bad(NO_DOC, 404);
    const reqs = (await t.list<TrustRequest>("trust-request")).map((x) => x.data);
    if (reqs.filter((x) => x.who === v.email && x.atMs > t.now - HOUR).length >= 3) bad("Too many requests. Please wait an hour before trying again.", 429);
    if (rec) return { queued: false, why: rec.data.access === "Public" ? "This document is public: open it directly." : "You already have access to this document." };
    const reason = s(r.body.reason, 300); if (reason.length < 10) bad("Give a reason of at least 10 characters.", 400);
    if (reqs.some((x) => x.who === v.email && !x.resourceId && x.status === "Pending")) return { queued: false, why: "You already asked for documents under NDA. You get an email when it is decided." };
    const dom = v.email.split("@")[1];
    if (reqs.filter((x) => x.status === "Pending" && x.who.endsWith(`@${dom}`)).length >= 10) bad("Your organisation has many requests waiting. Please wait until they are decided.", 429);
    if (reqs.filter((x) => x.status === "Pending").length >= 200) bad("Requests cannot be taken right now. Please try again later, or ask your contact at the company.", 503);
    const id = `TR-${await t.next("trust-request", 0)}`;
    await t.insert("trust-request", id, { id, who: v.email, whoId: "", company: labelOf(v.email), resource: NDA_DOCS, resourceId: "", reason, at: new Date(t.now).toISOString().slice(0, 10), atMs: t.now, status: "Pending" } satisfies TrustRequest);
    await t.audit("trust.access.requested", `${id}: ${NDA_DOCS} (public page)${blockedBy(v.email, (await settings(t)).data.blocked.map((b) => b.domain)).length ? "; blocked domain" : ""}`, "Policy");
    return { queued: true };
  });
  return out ? ok(out) : err(404, NOT_PUBLIC);
});
/** The NDA is accepted by this visitor for themselves; it never covers a colleague at the same company. */
const nda = guard(async (d, r) => {
  const out = await onPage(d, r, r.path[1], async (t, _tid, _page, v0) => {
    const v = verified(v0);
    const mine = accountFor(await accountsOf(d, t), visitorKey(d, v.email)) ?? bad("You have no access yet. Request documents first.", 409);
    if (mine.person.nda) bad("You already accepted the NDA.", 409);
    mine.person.nda = { at: new Date(t.now).toISOString().slice(0, 10), by: maskEmail(v.email) }; await t.update("trust-account", mine.rec.id, mine.acct, mine.rec.version);
    await t.audit("trust.nda.accepted", `${mine.acct.company} by ${maskEmail(v.email)} (public page)`, "Policy");
    return { ok: true };
  });
  return out ? ok(out) : err(404, NOT_PUBLIC);
});
const docLink = guard(async (d, r) => {
  const tid = await companyOf(d, r.path[1]); if (!tid) return err(404, NOT_PUBLIC);
  if (!(await under(d, "trust-open", h(`${tid}|${r.ip}`).slice(0, 32), 60)) || !(await under(d, "trust-open-co", h(tid).slice(0, 32), 1000))) return err(429, "Too many documents opened. Please wait an hour.");
  const out = await onPage(d, r, r.path[1], async (t, _tid, _page, v) => {
    if (!sectionsOf((await settings(t)).data.sections).documents) bad(NO_DOC, 404);
    const x = ((await t.get<Resource>("trust-resource", s(r.path[3], 20))) ?? bad(NO_DOC, 404)).data;
    if (x.access !== "Public") {
      const me = verified(v); const mine = accountFor(await accountsOf(d, t), visitorKey(d, me.email));
      if (!mine || !mine.acct.access.includes(x.id)) bad(NO_DOC, 404);
      if (!x.file) bad("No file has been attached to this document yet.", 404);
      if (!mine!.person.nda) bad("Accept the NDA first.", 403);
    }
    if (!x.file) bad("No file has been attached to this document yet.", 404);
    await t.audit("trust.document.viewed", `${x.name} by ${v ? maskEmail(v.email) : "a public visitor"} (public page)`, "Policy"); await activity(t, `Opened ${x.name} (public page)`);
    return { url: await d.files.link(x.file!.path, x.file!.name, 60) };
  });
  return out ? ok(out) : err(404, NOT_PUBLIC);
});
const subscribe = guard(async (d, r) => {
  const out = await onPage(d, r, r.path[1], async (t, _tid, _page, v0) => {
    const v = verified(v0); const id = `v-${h(v.email).slice(0, 32)}`;
    const sub: Sub = { email: v.email, at: new Date(t.now).toISOString().slice(0, 10), token: randomBytes(24).toString("base64url") };
    const was = await t.get<Sub>("trust-sub", id);
    if (was?.data.token) bad("You are already subscribed.", 409);
    if (was) await t.update("trust-sub", id, sub, was.version); else await t.insert("trust-sub", id, sub); // again after unsubscribing
    await t.audit("trust.subscribed", `${maskEmail(v.email)} (public page)`, "Policy");
    return { ok: true };
  });
  return out ? ok(out) : err(404, NOT_PUBLIC);
});
/** One-click unsubscribe from the link in an update email (no session needed; the token is the subscription's own). */
const unsubscribe = guard(async (d, r) => {
  const token = s(r.body.token, 64); if (token.length < 20) return err(404, "This link is not valid.");
  // works even when the page has been turned off: a subscriber can always leave
  const tenantId = await companyOf(d, r.path[1]); if (!tenantId) return err(404, "This link is not valid.");
  const out = await d.ws.tx(actorFor(tenantId, r.ip), d.now(), async (t) => {
    const sub = (await t.list<Sub>("trust-sub")).find((x) => x.data.token && x.data.token === token); if (!sub) return "gone" as const;
    await t.update("trust-sub", sub.id, { ...sub.data, email: "", token: "", ended: new Date(t.now).toISOString().slice(0, 10) }, sub.version); // kept as a tombstone, without the address
    await t.audit("trust.unsubscribed", "a subscriber (public page)", "Policy");
    return "done" as const;
  });
  return out === "gone" ? err(404, "This subscription has already ended.") : ok({ ok: true });
});
const ask = guard(async (d, r) => {
  const q = s(r.body.q, 1000); if (!q) return err(400, "Enter a question first");
  const tid = await companyOf(d, r.path[1]); if (!tid) return err(404, NOT_PUBLIC);
  // per network address and per company (the company's own log and records stay bounded)
  if (!(await under(d, "trust-ask", h(`${tid}|${r.ip}`).slice(0, 32), 20))) return err(429, "Too many questions. Please wait an hour before asking again.");
  if (!(await under(d, "trust-ask-co", h(tid).slice(0, 32), 300))) return err(429, "This Trust Center has had many questions in the last hour. Please try again later.");
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

/* Update emails: after a document's publication is approved and committed, one message per subscriber goes to an outbox (kept for 7 days),
   which is sent in small concurrent batches within a time budget: 15 seconds right after the approval, and 5 more each time an admin opens
   the Trust Center, until it is empty. A lock keeps two requests from sending the same messages. */
interface Out { to: string; title: string; token: string }
const OUTBOX_MS = 7 * 86_400_000;
onCommitted(async (d, a) => {
  const titles = (a.committed ?? []).filter((x) => x.action === "trust.visibility.changed" && x.target.includes(" → Public")).map((x) => x.target.split(" → Public")[0]);
  if (!titles.length) return;
  const subs = await d.ws.tx({ ...a, committed: undefined }, d.now(), async (t) => ((await settings(t)).data.publicPage?.on ? (await t.list<Sub>("trust-sub")).map((x) => x.data).filter((x) => x.email && x.token) : []));
  if (!subs.length) return;
  const box = (await d.store.kvGet<Out[]>("trust-outbox", a.tenantId)) ?? [];
  await d.store.kvSet("trust-outbox", a.tenantId, [...box, ...subs.slice(0, 2000).flatMap((x) => titles.map((title) => ({ to: x.email, title, token: x.token })))].slice(0, 5000), OUTBOX_MS);
  await drainOutbox(d, a.tenantId, 15_000);
});
/** Sends what waits in a company's update outbox, within `budgetMs`. */
export async function drainOutbox(d: Deps, tenantId: string, budgetMs: number) {
  if (!(await d.store.kvGet("trust-outbox", tenantId))) return;
  if (await d.store.kvGet("trust-outbox-lock", tenantId)) return;
  await d.store.kvSet("trust-outbox-lock", tenantId, 1, budgetMs + 30_000);
  try {
    const page = await d.ws.tx(actorFor(tenantId, "system"), d.now(), async (t) => (await t.get<Settings>("trust-settings", "settings"))?.data.publicPage);
    const start = Date.now(); let box = (await d.store.kvGet<Out[]>("trust-outbox", tenantId)) ?? [];
    while (box.length && page?.on && Date.now() - start < budgetMs) {
      const batch = box.slice(0, 5); box = box.slice(5);
      await Promise.all(batch.map((m) => sendMail(d, m.to, { t: "trust-update", company: page.name, title: m.title, link: `${d.site.origin}/trust/${page.ref}`, unsubscribe: `${d.site.origin}/trust/${page.ref}#unsubscribe=${m.token}` }, { tenantId, actor: "System", ip: "system" })));
      if (box.length) await d.store.kvSet("trust-outbox", tenantId, box, OUTBOX_MS); else await d.store.kvDel("trust-outbox", tenantId);
    }
    if (!page?.on) await d.store.kvDel("trust-outbox", tenantId); // the page was turned off: nothing more is announced
  } finally { await d.store.kvDel("trust-outbox-lock", tenantId); }
}

export function trustPublicRoutes(): Record<string, (d: Deps, r: Req) => Promise<Res>> {
  return {
    "GET trust-public/:ref": view, "POST trust-public/:ref/code": code, "POST trust-public/:ref/verify": verify, "POST trust-public/:ref/requests": request,
    "POST trust-public/:ref/nda": nda, "GET trust-public/:ref/documents/:id/link": docLink, "POST trust-public/:ref/subscribe": subscribe,
    "POST trust-public/:ref/unsubscribe": unsubscribe, "POST trust-public/:ref/questions": ask, "POST trust-public/:ref/sign-out": (d, r) => endVisitor(d, r),
  };
}
