/* AI governance API stubs. In mock mode each function performs the in-memory DATA mutation the prototype did and returns
 * a result for the caller, which then does the log / toast / bumpData.
 * AUTHORITY: classification confirmation, impact-assessment approval and guardrail changes are decisions. The UI gates them with
 * aiCanManage / the four-eyes rules below, but the real API MUST enforce owner-or-admin, "confirmer is not the drafter" and
 * "approver is not the submitter" server-side and write the audit entry itself. */
import { DATA } from "@/lib/data";
import { getMe } from "@/lib/audit";
import { nowStamp } from "@/lib/format";
import { clampText } from "@/lib/security";
import {
  AI_ANNEX_AREAS, AI_AUTONOMY, AI_BIAS_STATUSES, AI_FRIA_STATUSES, AI_GUARDRAILS, AI_ROLES, AI_SHADOW, AI_TIERS,
  aiCanManage, aiFind, aiInit, aiIsLegalOrAdmin, todayGB,
} from "@/lib/ai";
import { riskNorm } from "@/lib/risk";
import { apiFetch, viaApi } from "./http";
import { nextId } from "./audits";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Res<T = object> = ({ ok: true } & T) | { ok: false; msg: string };
const post = <T,>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
const enc = encodeURIComponent;
const fail = (msg: string): { ok: false; msg: string } => ({ ok: false, msg });
const NOT_FOUND = fail("AI system not found");
const pickOf = (v: string, list: string[], fb: string) => (list.includes(v) ? v : fb);
const peopleNames = () => DATA.people.map((p) => p.name as string);

/** Returns a failure when the system is missing or the signed-in person may not manage it (deny by default). */
function gate(id: string, msg: string): { a: any } | { ok: false; msg: string } {
  const a = aiFind(id); if (!a) return NOT_FOUND;
  aiInit(a);
  return aiCanManage(a) ? { a } : fail(msg);
}
const isFail = (g: any): g is { ok: false; msg: string } => g.ok === false;

export interface RegisterInput { name: string; surface: string; tier: string; model: string; provider: string; purpose: string; data: string; autonomy: string; users: string; owner: string }
/** Prototype: aiRegisterSubmit (and aiRegister for a shadow-AI entry). No role gate in the source. */
export function registerSystem(input: RegisterInput, shadowId: string | null) {
  return viaApi<Res<{ id: string; name: string }>>(() => {
    const n = clampText(input.name, 120); if (!n) return fail("Give the system a name");
    const sh = shadowId ? AI_SHADOW.find((x) => x.id === shadowId) : null;
    const owner = pickOf(input.owner, peopleNames(), peopleNames()[0] || "");
    let k = DATA.ai.length + 1; while (DATA.ai.some((x) => x.id === "AI-" + String(k).padStart(2, "0"))) k++; // source: length+1 (could collide after a delete)
    const a = {
      id: "AI-" + String(k).padStart(2, "0"), name: n, purpose: clampText(input.purpose, 200) || "-", tier: pickOf(input.tier, AI_TIERS, "Medium"), status: "In review", owner, basis: "Pending assessment", added: todayGB(), lastReview: "", nextReview: "",
      surface: clampText(input.surface, 120) || "Internal service", model: clampText(input.model, 120) || "—", provider: clampText(input.provider, 120) || "In-house", dataReached: clampText(input.data, 200) || "Internal data",
      autonomy: pickOf(input.autonomy, AI_AUTONOMY, AI_AUTONOMY[0]), users: clampText(input.users, 40) || "—", discovered: sh ? sh.found : "Manual registration", guardrail: "Controlled", euClass: "Not classified", euState: { state: "Not classified", draftBy: owner },
    };
    DATA.ai.push(a);
    if (shadowId) { const ix = AI_SHADOW.findIndex((x) => x.id === shadowId); if (ix >= 0) AI_SHADOW.splice(ix, 1); }
    return { ok: true, id: a.id, name: n };
  }, () => post<Res<{ id: string; name: string }>>("/ai/systems", { ...input, shadowId }));
}
/** Prototype: aiDismissShadow. Removes a discovered (unregistered) AI entry. */
export function dismissShadow(id: string) {
  return viaApi<boolean>(() => { const ix = AI_SHADOW.findIndex((x) => x.id === id); if (ix < 0) return false; AI_SHADOW.splice(ix, 1); return true; }, () => post<boolean>(`/ai/shadow/${enc(id)}/dismiss`, {}));
}
/** Prototype: aiEdit save. */
export function editSystem(id: string, input: { name: string; purpose: string; basis: string }) {
  return viaApi<Res>(() => {
    const g = gate(id, "Only the AI system owner or an admin can change this"); if (isFail(g)) return g;
    g.a.name = clampText(input.name, 120) || g.a.name; g.a.purpose = clampText(input.purpose, 200); g.a.basis = clampText(input.basis, 200); // source keeps empty purpose/basis, but never an empty name
    return { ok: true };
  }, () => post<Res>(`/ai/systems/${enc(id)}`, input));
}
/** Prototype: aiClassify save (not reachable from the source UI). */
export function setTier(id: string, tier: string) {
  return viaApi<Res<{ tier: string }>>(() => {
    const g = gate(id, "Only the AI system owner or an admin can change this"); if (isFail(g)) return g;
    g.a.tier = pickOf(tier, AI_TIERS, g.a.tier); return { ok: true, tier: g.a.tier as string };
  }, () => post<Res<{ tier: string }>>(`/ai/systems/${enc(id)}/tier`, { tier }));
}
/** Prototype: aiAssign save. */
export function assignOwner(id: string, owner: string) {
  return viaApi<Res>(() => {
    const g = gate(id, "Only the AI system owner or an admin can change this"); if (isFail(g)) return g;
    if (!peopleNames().includes(owner)) return fail("Choose an owner from the list");
    g.a.owner = owner; return { ok: true };
  }, () => post<Res>(`/ai/systems/${enc(id)}/owner`, { owner }));
}
/** Prototype: aiEvidence. The source only stamps a file name; there is no upload. */
export function attachEvidence(id: string) {
  return viaApi<Res<{ name: string }>>(() => {
    const g = gate(id, "Only the AI system owner or an admin can change this"); if (isFail(g)) return g;
    g.a.evidence = "Impact assessment " + nowStamp().slice(0, 10) + ".pdf"; return { ok: true, name: g.a.name as string };
  }, () => post<Res<{ name: string }>>(`/ai/systems/${enc(id)}/evidence`, {}));
}
/** Prototype: aiReview. Toggles In review <-> Approved. */
export function toggleReview(id: string) {
  return viaApi<Res<{ name: string; completed: boolean }>>(() => {
    const g = gate(id, "Only the AI system owner or an admin can change this"); if (isFail(g)) return g;
    const a = g.a;
    if (a.status === "In review") { a.status = "Approved"; a.lastReview = todayGB(); return { ok: true, name: a.name as string, completed: true }; }
    a.status = "In review"; return { ok: true, name: a.name as string, completed: false };
  }, () => post<Res<{ name: string; completed: boolean }>>(`/ai/systems/${enc(id)}/review`, {}));
}
/** Prototype: aiArchive. */
export function archiveSystem(id: string) {
  return viaApi<Res<{ name: string }>>(() => {
    const g = gate(id, "Only the AI system owner or an admin can change this"); if (isFail(g)) return g;
    g.a.status = "Archived"; return { ok: true, name: g.a.name as string };
  }, () => post<Res<{ name: string }>>(`/ai/systems/${enc(id)}/archive`, {}));
}
/** Prototype: aiGuard save. */
export function setGuardrail(id: string, guardrail: string) {
  return viaApi<Res<{ guardrail: string }>>(() => {
    const g = gate(id, "Only the AI system owner or an admin can change this"); if (isFail(g)) return g;
    const v = AI_GUARDRAILS.find((x) => x[0] === guardrail)?.[0]; if (!v) return fail("Choose a guardrail tier from the list");
    g.a.guardrail = v; return { ok: true, guardrail: v };
  }, () => post<Res<{ guardrail: string }>>(`/ai/systems/${enc(id)}/guardrail`, { guardrail }));
}

/* ---- EU AI Act classification (two-person rule) ---- */
export interface EuAnswers { prohibited: boolean; high: boolean; transparency: boolean; area: string; role: string }
/** Prototype: aiEuDraft. Saves a DRAFT legal determination; a second person must confirm. */
export function saveEuDraft(id: string, q: EuAnswers) {
  return viaApi<Res>(() => {
    const g = gate(id, "Only the AI system owner or an admin can classify this system"); if (isFail(g)) return g;
    const a = g.a; let cls: string, rat: string;
    const area = pickOf(q.area, AI_ANNEX_AREAS, AI_ANNEX_AREAS[0]), role = pickOf(q.role, AI_ROLES, "Deployer");
    if (q.prohibited) { cls = "Prohibited"; rat = "Uses a prohibited practice under Article 5 — must not be operated."; }
    else if (q.high) { cls = "High-risk"; rat = "High-risk under Annex III (" + area + "); our role: " + role + ". Full Article 6 obligations apply."; }
    else if (q.transparency) { cls = "Limited risk"; rat = "Interacts with people or generates content; Article 50 transparency obligations apply."; }
    else { cls = "Minimal risk"; rat = "No prohibited practice, high-risk area or transparency trigger identified; no specific obligations."; }
    a.euClass = cls; a.euRationale = rat; a.tier = (cls === "High-risk" || cls === "Prohibited") ? "High" : cls === "Limited risk" ? "Medium" : "Low";
    a.guardrail = cls === "Prohibited" ? "Blocked" : cls === "High-risk" ? "Restricted" : cls === "Limited risk" ? "Standard" : "Controlled";
    a.euState = { state: "Draft", draftBy: getMe().name, by: "", at: "" };
    return { ok: true };
  }, () => post<Res>(`/ai/systems/${enc(id)}/eu-classification`, q));
}
/** Prototype: aiEuConfirm. Confirmer must not be the drafter, and must be Legal & Privacy or an admin. */
export function confirmEu(id: string) {
  return viaApi<Res>(() => {
    const a = aiFind(id); if (!a) return NOT_FOUND; aiInit(a);
    const st = a.euState || {}, me = getMe().name;
    if (st.draftBy === me) return fail("A different person must confirm this classification");
    if (!aiIsLegalOrAdmin()) return fail("Only Legal & Privacy or an admin can confirm");
    a.euState = { state: "Confirmed", draftBy: st.draftBy || a.owner, by: me + (/Rivera/i.test(me) ? " (Legal & Privacy)" : " (Admin)"), at: todayGB() };
    return { ok: true };
  }, () => post<Res>(`/ai/systems/${enc(id)}/eu-classification/confirm`, {}));
}

/* ---- impact assessment (FRIA / DPIA), submitter != approver ---- */
export function saveFria(id: string, input: { status: string; summary: string }) {
  return viaApi<Res>(() => {
    const g = gate(id, "Only the AI system owner or an admin can record this"); if (isFail(g)) return g;
    const a = g.a, st = pickOf(input.status, AI_FRIA_STATUSES, "Not started"), prev = a.fria || {};
    a.fria = { status: st, date: st === "Complete" ? todayGB() : (prev.date || ""), by: getMe().name, summary: clampText(input.summary, 2000), review: "Draft", submittedBy: "", approvedBy: "" };
    return { ok: true };
  }, () => post<Res>(`/ai/systems/${enc(id)}/impact-assessment`, input));
}
export function submitFria(id: string) {
  return viaApi<Res>(() => {
    const g = gate(id, "Only the AI system owner or an admin can submit this"); if (isFail(g)) return g;
    const a = g.a; a.fria = a.fria || {}; a.fria.review = "Submitted"; a.fria.submittedBy = getMe().name; return { ok: true };
  }, () => post<Res>(`/ai/systems/${enc(id)}/impact-assessment/submit`, {}));
}
export function approveFria(id: string) {
  return viaApi<Res>(() => {
    const a = aiFind(id); if (!a) return NOT_FOUND; aiInit(a);
    const f = a.fria || {};
    if (f.submittedBy === getMe().name) return fail("A different person must approve this");
    if (!aiCanManage(a)) return fail("Only the AI system owner or an admin can approve this");
    f.review = "Approved"; f.status = "Complete"; f.approvedBy = getMe().name; f.date = f.date || todayGB();
    a.evidence = "D-07 AI system impact assessment " + nowStamp().slice(0, 10) + ".pdf";
    return { ok: true };
  }, () => post<Res>(`/ai/systems/${enc(id)}/impact-assessment/approve`, {}));
}
export function returnFria(id: string) {
  return viaApi<Res>(() => {
    const a = aiFind(id); if (!a) return NOT_FOUND; aiInit(a);
    const f = a.fria || {};
    if (f.submittedBy === getMe().name) return fail("A different person must review this");
    if (!aiCanManage(a)) return fail("Only the AI system owner or an admin can review this");
    f.review = "Changes requested"; return { ok: true };
  }, () => post<Res>(`/ai/systems/${enc(id)}/impact-assessment/return`, {}));
}

/* ---- bias / oversight ---- */
export function saveBias(id: string, input: { status: string; notes: string }) {
  return viaApi<Res>(() => {
    const g = gate(id, "Only the AI system owner or an admin can log this"); if (isFail(g)) return g;
    const a = g.a, st = pickOf(input.status, AI_BIAS_STATUSES, "Due");
    a.bias = { status: st, last: (st === "Passed" || st === "Issues found") ? todayGB() : ((a.bias && a.bias.last) || ""), result: clampText(input.notes, 2000) };
    return { ok: true };
  }, () => post<Res>(`/ai/systems/${enc(id)}/bias-test`, input));
}
export function saveOversight(id: string, text: string) {
  return viaApi<Res>(() => {
    const g = gate(id, "Only the AI system owner or an admin can edit this"); if (isFail(g)) return g;
    g.a.oversight = String(text || "").split("\n").map((x) => clampText(x, 300)).filter(Boolean).slice(0, 30); return { ok: true };
  }, () => post<Res>(`/ai/systems/${enc(id)}/oversight`, { text }));
}

/* ---- signals ---- */
const SIG_MSG = "Only the AI system owner or an admin can do this";
const signalOf = (a: any, si: number) => (Number.isInteger(si) ? a.signals[si] : undefined);
/** Prototype: aiSignalRisk. Pushes a draft risk (category AI) and links it from the signal. */
export function signalRaiseRisk(id: string, si: number) {
  return viaApi<Res<{ ref: string }>>(() => {
    const g = gate(id, SIG_MSG); if (isFail(g)) return g;
    const a = g.a, s = signalOf(a, si); if (!s) return fail("Signal not found");
    let k = DATA.risks.length + 1; while (DATA.risks.some((x) => x.id === "RK-" + String(k).padStart(2, "0"))) k++;
    const rid = "RK-" + String(k).padStart(2, "0");
    const r: any = { id: rid, title: "AI signal: " + String(s.text).slice(0, 56) + " — " + a.name, desc: s.rec || "", cat: "AI", owner: a.owner, l: 3, i: 3, cl: 3, ci: 3, rl: 2, ri: 2, treat: "Mitigate", status: "Open", review: "Draft", linked: [], identified: nowStamp().slice(0, 10), reviewed: nowStamp().slice(0, 10) };
    riskNorm(r); r.review = "Draft"; DATA.risks.push(r); // source: riskNorm when defined, then force Draft
    s.status = "Risk raised"; s.ref = rid; return { ok: true, ref: rid };
  }, () => post<Res<{ ref: string }>>(`/ai/systems/${enc(id)}/signals/${si}/risk`, {}));
}
/** Prototype: aiSignalIssue. */
export function signalRaiseIssue(id: string, si: number) {
  return viaApi<Res<{ ref: string }>>(() => {
    const g = gate(id, SIG_MSG); if (isFail(g)) return g;
    const a = g.a, s = signalOf(a, si); if (!s) return fail("Signal not found");
    const rid = nextId("R-", 60, DATA.issues);
    DATA.issues.unshift({ id: rid, title: "AI signal: " + String(s.text).slice(0, 56) + " — " + a.name, sev: s.sev === "Review" ? "Medium" : "Low", status: "Open", owner: a.owner, due: "Due 14d" });
    s.status = "Issue raised"; s.ref = rid; return { ok: true, ref: rid };
  }, () => post<Res<{ ref: string }>>(`/ai/systems/${enc(id)}/signals/${si}/issue`, {}));
}
export function signalDismiss(id: string, si: number) {
  return viaApi<Res>(() => {
    const g = gate(id, SIG_MSG); if (isFail(g)) return g;
    const s = signalOf(g.a, si); if (!s) return fail("Signal not found");
    s.status = "Dismissed"; return { ok: true };
  }, () => post<Res>(`/ai/systems/${enc(id)}/signals/${si}/dismiss`, {}));
}
