/* Server-only. The standalone vendor assessment portal (production programme group 8b; inventory group 4, section 2B). A company admin or
   owner sends the assessment to a vendor contact's work email (Vendors, "Send questionnaire", by email). The contact opens the emailed link,
   confirms the invited address, receives a one-time code by email, and answers in a verified-visitor session (server/visitor.ts) that
   opens only that questionnaire. Needs email: without it the company cannot send by email and the portal says so.
   - The link works until the questionnaire's expiry (30 days); a new link replaces the old one. Three addresses other than the invited one
     end the link (the company sends a new one).
   - Answers: Yes, Partially, No, Not applicable, a comment (2,000 characters), and evidence files checked like evidence (type, size,
     content). Critical questions answered Yes need evidence. Submitting locks the answers; the company may ask for clarification on chosen
     questions, which reopens only those (each needs a new comment, and a "Yes" new evidence) and makes a new version.
   - Files are not scanned for malware (no scanner is configured): their type and content are checked, they are stored privately and served
     to the company only through 60-second links.
   - Everything the vendor does is written to the company's audit log, attributed to the vendor contact (masked address). */
import { scalarText } from "@/server/text";
import { createHash, randomBytes } from "node:crypto";
import questions from "@/data/vendorQuestions.json";
import type { Req, Res } from "./core";
import { mailConfigured, maskEmail, sendMail } from "./mail";
import type { Deps } from "./types";
import { checkFile } from "./ws/files";
import type { VendorQuestionnaire } from "./ws/vendors";
import { WsConflict, WsRefused, type Actor, type Rec, type WsTx } from "./ws/store";
import { checkCode, endVisitor, sendCode, visitorOf, workEmailBlock } from "./visitor";

export interface PortalQuestion { domain: string; id: string; text: string; critical: boolean; evidence: string }
export const PORTAL_QUESTIONS = (questions as { questions: PortalQuestion[] }).questions;
export type PortalAnswer = "" | "Y" | "P" | "N" | "NA";
export interface PortalItem { answer: PortalAnswer; comment: string; file?: { name: string; path: string; at: number } }
export interface Portal {
  email: string; tokenHash: string; expiresAt: number; due: string; fails: number; dead: boolean; /** the link cannot start a new sign-in after a submission */ linkUsed?: boolean;
  items: Record<string, PortalItem>; version: number; clarify: string[]; clarifyNote?: string; base?: Record<string, PortalItem>; history: { version: number; at: number }[];
}
export type PortalQuestionnaire = VendorQuestionnaire & { portal?: Portal };
const ANSWERS: PortalAnswer[] = ["Y", "P", "N", "NA"];
const LABEL: Record<string, string> = { Y: "Yes", P: "Partially", N: "No", NA: "Not applicable" };
const LINK_DAYS = 30; const DAY = 86_400_000;
const h = (v: string) => createHash("sha256").update(v).digest("hex");
const ok = (body?: unknown, cookies?: string[]): Res => ({ status: body === undefined ? 204 : 200, body, cookies });
const err = (status: number, error: string): Res => ({ status, body: { error } });
const s = (v: unknown, max = 300) => scalarText(v).slice(0, max).trim();
export const portalLink = (d: Deps, token: string) => `${d.site.origin}/vendor-portal#t=${token}`;
const NO_MAIL = "This portal needs email, which is not set up yet. Ask your contact at the company to send the questionnaire again later.";
const DEAD = "This link no longer works. Ask your contact at the company to send a new one.";

/** A new portal invitation on a questionnaire record (company side): the token is returned once, to be emailed. */
export function newPortal(email: string, due: string, now: number): { portal: Portal; token: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, portal: { email, tokenHash: h(token), expiresAt: now + LINK_DAYS * DAY, due, fails: 0, dead: false, items: Object.fromEntries(PORTAL_QUESTIONS.map((q) => [q.id, { answer: "", comment: "" }])), version: 0, clarify: [], history: [] } };
}
/** The answers as text, for the company's existing questionnaire views. */
export const portalAnswers = (p: Portal) => PORTAL_QUESTIONS.map((q) => { const i = p.items[q.id]; return i?.answer ? `${LABEL[i.answer]}${i.comment ? `: ${i.comment}` : ""}${i.file ? ` [evidence: ${i.file.name}]` : ""}` : ""; });
export const portalReadiness = (p: Portal) => {
  const unanswered = PORTAL_QUESTIONS.filter((q) => !p.items[q.id]?.answer).length;
  const noEvidence = PORTAL_QUESTIONS.filter((q) => q.critical && p.items[q.id]?.answer === "Y" && !p.items[q.id]?.file).length;
  const clar = p.clarify.filter((id) => { const now = p.items[id]; const was = p.base?.[id]; return !now?.comment || now.comment === was?.comment || (now.answer === "Y" && (!now.file || now.file.path === was?.file?.path)); }).length;
  return { unanswered, noEvidence, clar, ready: !unanswered && !noEvidence && !clar };
};

/** Finds the questionnaire an invitation token belongs to (kv index set when it is sent). */
async function byToken(d: Deps, token: unknown): Promise<{ tenantId: string; qid: string } | null> {
  const t = s(token, 100); if (t.length < 20) return null;
  return (await d.store.kvGet<{ tenantId: string; qid: string }>("vportal", h(t))) ?? null;
}
export async function indexToken(d: Deps, token: string, tenantId: string, qid: string) { await d.store.kvSet("vportal", h(token), { tenantId, qid }, LINK_DAYS * DAY); }
const visitorActor = (tenantId: string, email: string, ip: string): Actor => ({ id: "", name: `Vendor contact ${maskEmail(email)}`, role: "vendor", tenantId, ip });
async function withQ<T>(d: Deps, tenantId: string, qid: string, a: Actor, work: (t: WsTx, rec: Rec<PortalQuestionnaire>, p: Portal) => Promise<T>): Promise<T | null> {
  return d.ws.tx(a, d.now(), async (t) => {
    const rec = await t.get<PortalQuestionnaire>("vendor-questionnaire", qid); if (!rec?.data.portal) return null;
    return work(t, rec, rec.data.portal);
  });
}
const refusal = (e: unknown): Res | null => (e instanceof WsRefused ? err(e.status, e.message) : e instanceof WsConflict ? err(409, e.message) : null);
const guard = (fn: (d: Deps, r: Req) => Promise<Res>) => async (d: Deps, r: Req): Promise<Res> => { try { return await fn(d, r); } catch (e) { const x = refusal(e); if (x) return x; throw e; } };
const live = (p: Portal, now: number) => !p.dead && p.expiresAt > now;
async function under(d: Deps, bucket: string, key: string, max: number) {
  const now = d.now(); const list = ((await d.store.kvGet<number[]>(bucket, key)) ?? []).filter((x) => now - x < 3600_000);
  if (list.length >= max) return false; await d.store.kvSet(bucket, key, [...list, now], 3600_000); return true;
}

/* ---------------- before sign-in: the link, the address, the code ---------------- */
const open = guard(async (d, r) => {
  const k = await byToken(d, r.body.token); if (!k) return err(404, DEAD);
  const v = await withQ(d, k.tenantId, k.qid, visitorActor(k.tenantId, "", r.ip), async (_t, rec, p) => (p.tokenHash === h(s(r.body.token, 100)) && live(p, d.now()) && !p.linkUsed ? { customer: rec.data.customer, vendor: rec.data.vendor, due: p.due, expiresAt: p.expiresAt, mail: mailConfigured(d) } : null));
  return v ? ok(v) : err(404, DEAD);
});
const verifyEmail = guard(async (d, r) => {
  if (!mailConfigured(d)) return err(409, NO_MAIL);
  const k = await byToken(d, r.body.token); if (!k) return err(404, DEAD);
  const email = s(r.body.email, 254).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err(400, "Enter a valid email address.");
  const block = workEmailBlock(email); if (block) return err(400, block);
  const out = await withQ(d, k.tenantId, k.qid, visitorActor(k.tenantId, email, r.ip), async (t, rec, p) => {
    if (p.tokenHash !== h(s(r.body.token, 100)) || !live(p, t.now) || p.linkUsed) return "dead" as const;
    if (email !== p.email) {
      p.fails++; if (p.fails >= 3) p.dead = true; await t.update("vendor-questionnaire", rec.id, rec.data, rec.version);
      await t.audit(p.dead ? "vendor.portal.link_ended" : "vendor.portal.email_mismatch", `${rec.data.vendor} (${rec.id}): attempt ${p.fails} of 3`, "Vendor");
      return p.dead ? ("dead" as const) : ("mismatch" as const);
    }
    return "ok" as const;
  });
  if (out === null || out === "dead") return err(404, DEAD);
  // a wrong address gets the same answer as the right one (no code is sent), so the reply never reveals the invited address
  if (out === "mismatch") return ok({ sent: true, to: maskEmail(email) });
  if (!(await sendCode(d, r, { tenantId: k.tenantId, purpose: "vendor-portal", subject: k.qid, email }, "the security questionnaire"))) return err(429, "Too many codes asked for. Wait an hour, then try again.");
  return ok({ sent: true, to: maskEmail(email) });
});
const verifyCode = guard(async (d, r) => {
  const k = await byToken(d, r.body.token); if (!k) return err(404, DEAD);
  const email = s(r.body.email, 254).toLowerCase();
  const res = await checkCode(d, r, { tenantId: k.tenantId, purpose: "vendor-portal", subject: k.qid, email }, s(r.body.code, 12));
  if (res.ok === false) return err(400, res.error);
  await withQ(d, k.tenantId, k.qid, visitorActor(k.tenantId, email, r.ip), (t, rec) => t.audit("vendor.portal.signed_in", `${rec.data.vendor} (${rec.id})`, "Vendor"));
  return ok({ ok: true }, [res.cookie]);
});

/* ---------------- signed in: one questionnaire ---------------- */
type V = NonNullable<Awaited<ReturnType<typeof visitorOf>>>;
const signedIn = (fn: (d: Deps, r: Req, v: V) => Promise<Res>) => guard(async (d, r) => {
  const v = await visitorOf(d, r, "vendor-portal"); if (!v) return err(401, "Your session ended. Open the link from your email again.");
  return fn(d, r, v);
});
const view = (rec: Rec<PortalQuestionnaire>, p: Portal) => ({
  id: rec.id, customer: rec.data.customer, vendor: rec.data.vendor, due: p.due, status: rec.data.status, version: p.version, clarify: p.clarify, clarifyNote: rec.data.status === "Reopened" ? p.clarifyNote ?? rec.data.note ?? "" : "",
  questions: PORTAL_QUESTIONS, items: Object.fromEntries(Object.entries(p.items).map(([k, i]) => [k, { answer: i.answer, comment: i.comment, file: i.file ? { name: i.file.name } : null }])), readiness: portalReadiness(p),
});
const get = signedIn(async (d, r, v) => {
  const out = await withQ(d, v.tenantId, v.subject, visitorActor(v.tenantId, v.email, r.ip), async (_t, rec, p) => (live(p, d.now()) && p.email === v.email ? view(rec, p) : null));
  return out ? ok(out) : err(404, DEAD);
});
/** What the vendor may change now: everything before the first submission, only the questions reopened for clarification afterwards. */
const editable = (rec: Rec<PortalQuestionnaire>, p: Portal) => (rec.data.status === "Sent" ? PORTAL_QUESTIONS.map((q) => q.id) : rec.data.status === "Reopened" ? p.clarify : []);
const draft = signedIn(async (d, r, v) => {
  const items = (r.body.items ?? {}) as Record<string, { answer?: unknown; comment?: unknown }>;
  const out = await withQ(d, v.tenantId, v.subject, visitorActor(v.tenantId, v.email, r.ip), async (t, rec, p) => {
    if (!live(p, t.now) || p.email !== v.email) return null;
    const can = editable(rec, p); if (!can.length) throw new WsRefused("These answers were submitted. Your contact can ask for a clarification if they need more.", 409);
    for (const id of can) { const x = items[id]; if (!x) continue; const a = String(x.answer ?? "") as PortalAnswer; p.items[id] = { ...p.items[id], answer: ANSWERS.includes(a) ? a : "", comment: s(x.comment, 2000) }; }
    await t.update("vendor-questionnaire", rec.id, rec.data, rec.version);
    return view(rec, p);
  });
  return out ? ok(out) : err(404, DEAD);
});
const upload = signedIn(async (d, r, v) => {
  if (!d.files.configured) return err(409, "File uploads are not set up yet. Describe the evidence in the comment instead.");
  const qid = s(r.path[2], 10); if (!PORTAL_QUESTIONS.some((q) => q.id === qid)) return err(404, "Question not found.");
  const bytes = r.raw ?? new Uint8Array(); const f = checkFile(r.body.name, bytes); if ("error" in f) return err(400, f.error);
  if (!["pdf", "docx", "xlsx", "png", "jpg", "jpeg"].includes(f.ext)) return err(400, "Allowed: pdf, docx, xlsx, png, jpg.");
  if (!(await under(d, `vupload-${v.tenantId}`, h(v.email).slice(0, 32), 60))) return err(429, "Too many files in the last hour. Please wait, then try again.");
  const path = `${v.tenantId}/vendor-q/${v.subject}/${qid}-${randomBytes(6).toString("hex")}.${f.ext}`; let replaced = ""; let stored = false;
  const out = await withQ(d, v.tenantId, v.subject, visitorActor(v.tenantId, v.email, r.ip), async (t, rec, p) => {
    if (!live(p, t.now) || p.email !== v.email) return null;
    if (!editable(rec, p).includes(qid)) throw new WsRefused("This answer cannot change now.", 409);
    await d.files.put(path, bytes, f.type); stored = true;
    const old = p.items[qid]?.file?.path; replaced = old && old !== p.base?.[qid]?.file?.path ? old : ""; // a submitted version's file stays
    p.items[qid] = { ...p.items[qid], file: { name: f.name, path, at: t.now } };
    await t.update("vendor-questionnaire", rec.id, rec.data, rec.version);
    await t.audit("vendor.portal.file_added", `${rec.data.vendor} (${rec.id}) ${qid}: ${f.name}`, "Vendor");
    return view(rec, p);
  }).catch(async (e) => { if (stored) await d.files.remove([path]).catch(() => undefined); throw e; }); // nothing is left behind when the change fails
  if (out && replaced) await d.files.remove([replaced]).catch(() => undefined); // a file replaced before submission is not kept
  return out ? ok(out) : err(404, DEAD);
});
const submit = signedIn(async (d, r, v) => {
  const out = await withQ(d, v.tenantId, v.subject, visitorActor(v.tenantId, v.email, r.ip), async (t, rec, p) => {
    if (!live(p, t.now) || p.email !== v.email) return null;
    if (!editable(rec, p).length) throw new WsRefused("These answers were already submitted.", 409);
    const rd = portalReadiness(p);
    if (rd.unanswered) throw new WsRefused(`${rd.unanswered} question${rd.unanswered === 1 ? "" : "s"} still need${rd.unanswered === 1 ? "s" : ""} an answer.`, 400);
    if (rd.noEvidence) throw new WsRefused(`${rd.noEvidence} "Yes" answer${rd.noEvidence === 1 ? "" : "s"} on required items still need${rd.noEvidence === 1 ? "s" : ""} evidence attached.`, 400);
    if (rd.clar) throw new WsRefused('Add a new clarification for each reopened answer, and new evidence for any "Yes".', 400);
    const clarified = rec.data.status === "Reopened";
    p.version++; p.history.push({ version: p.version, at: t.now }); p.clarify = []; delete p.base; delete p.clarifyNote; p.linkUsed = true; // a clarification sends a new link
    rec.data.status = "Submitted"; rec.data.submittedAt = new Date(t.now).toISOString().slice(0, 10); rec.data.answers = portalAnswers(p);
    await t.update("vendor-questionnaire", rec.id, rec.data, rec.version);
    await t.audit(clarified ? "vendor.questionnaire.clarified" : "vendor.questionnaire.submitted", `${rec.data.vendor} (${rec.id}) version ${p.version}, through the vendor portal`, "Vendor");
    await t.notify(rec.data.sentById, `${rec.data.vendor} ${clarified ? "sent a clarification on" : "submitted"} the security questionnaire (version ${p.version}).`);
    return view(rec, p);
  });
  return out ? ok(out) : err(404, DEAD);
});

/* ---------------- the company side: sending by email, the link again, clarification, evidence downloads ---------------- */
/** Sends (or sends again) the portal link by email. Returns whether it went out. */
export async function mailPortal(d: Deps, r: Req, actor: Actor, q: PortalQuestionnaire, token: string, clarify = false) {
  await indexToken(d, token, actor.tenantId, q.id);
  return sendMail(d, q.portal!.email, clarify ? { t: "vendor-clarify", company: q.customer, vendor: q.vendor, link: portalLink(d, token) } : { t: "vendor-invite", company: q.customer, vendor: q.vendor, link: portalLink(d, token), due: q.portal!.due }, { tenantId: actor.tenantId, actor: actor.name, ip: r.ip });
}

export function vendorPortalRoutes(): Record<string, (d: Deps, r: Req) => Promise<Res>> {
  return {
    "POST vendor-portal/open": open, "POST vendor-portal/verify-email": verifyEmail, "POST vendor-portal/verify-code": verifyCode,
    "GET vendor-portal/questionnaire": get, "POST vendor-portal/draft": draft, "POST vendor-portal/files/:q": upload, "POST vendor-portal/submit": submit,
    "POST vendor-portal/sign-out": (d, r) => endVisitor(d, r),
  };
}
export const ANSWER_LABEL = LABEL;
