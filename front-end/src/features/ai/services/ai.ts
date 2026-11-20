/* AI governance API stubs. In mock mode each function performs the in-memory DATA mutation and returns a result for the caller, which then does the log / toast / bumpData.
 * CONTRACT (docs/security/SOD_MATRIX.md section 3, AI): the classification confirmer is not the drafter (nor the system owner) and holds the admin/owner role (no surname
 * matching); the impact-assessment approver is not the submitter/recorder/owner; guardrail changes and archive are approvals by a second person (approvals engine);
 * registering a system is admin/owner/analyst and does not approve it (completing the review is a separate, different-person step). Violations throw SodError.
 * The real API MUST enforce all of it server-side from the session identity and write the audit entry itself. */
import { DATA } from "@/lib/data";
import { wsLog } from "@/lib/audit";
import { getApproval, requestApproval } from "@/lib/approvals";
import { payloadStr, registerApprovalHandler } from "@/lib/approvalKit";
import { assertNotSelf, assertRole, getActor, SodError } from "@/lib/sod";
import { nowStamp } from "@/lib/format";
import { clampText } from "@/lib/security";
import {
  AI_ANNEX_AREAS, AI_AUTONOMY, AI_BIAS_STATUSES, AI_FRIA_STATUSES, AI_GUARDRAILS, AI_ROLES, AI_SHADOW, AI_TIERS,
  aiCanManage, aiFind, aiForbidden, aiInit, todayGB,
} from "@/features/ai/lib/ai";
import { riskNorm } from "@/lib/risk";
import { viaApi } from "@/services/http";
import { wsPost } from "@/services/ws";
import { nextId } from "@/services/audits";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Res<T = object> = ({ ok: true } & T) | { ok: false; msg: string };
/** Production: the company's AI register on the server (server/ws/ai.ts), which re-checks every rule and writes the audit entry. */
const post = <T,>(path: string, body: unknown) => wsPost<T>(`/ws${path}`, body);
const enc = encodeURIComponent;
const fail = (msg: string): { ok: false; msg: string } => ({ ok: false, msg });
const NOT_FOUND = fail("AI system not found");
const pickOf = (v: string, list: string[], fb: string) => (list.includes(v) ? v : fb);
const peopleNames = () => DATA.people.map((p) => p.name as string);

/** Returns a failure when the system is missing or the signed-in person may not manage it (deny by default). */
function gate(id: string, msg: string): { a: any } | { ok: false; msg: string } {
  const a = aiFind(id); if (!a) return NOT_FOUND;
  aiInit(a);
  if (!aiCanManage(a)) throw new SodError("Not permitted: " + msg.charAt(0).toLowerCase() + msg.slice(1) + ".");
  return { a };
}
const APPROVERS = ["admin", "owner"];
const stillPending = (id?: string) => !!id && getApproval(id)?.status === "Pending";

registerApprovalHandler("ai.guardrail", {
  apply: (ap) => {
    const a = aiFind(payloadStr(ap, "id")); if (!a) throw new SodError("AI system not found.");
    const to = AI_GUARDRAILS.find((x) => x[0] === payloadStr(ap, "to"))?.[0]; if (!to) throw new SodError("Invalid guardrail tier.");
    a.guardrail = to; delete a.guardrailPending;
    wsLog("ai.guardrail.approved", `${a.name}: ${payloadStr(ap, "from")} → ${to} (approved by ${ap.approvals.map((x) => x.by).join(", ")}; requested by ${ap.requestedBy})`, "AI governance");
  },
  closed: (ap) => { const a = aiFind(payloadStr(ap, "id")); if (a) delete a.guardrailPending; },
});
registerApprovalHandler("ai.archive", {
  apply: (ap) => {
    const a = aiFind(payloadStr(ap, "id")); if (!a) throw new SodError("AI system not found.");
    a.status = "Archived"; delete a.archivePending;
    wsLog("ai.archive.approved", `${a.name} (approved by ${ap.approvals.map((x) => x.by).join(", ")}; requested by ${ap.requestedBy})`, "AI governance");
  },
  closed: (ap) => { const a = aiFind(payloadStr(ap, "id")); if (a) delete a.archivePending; },
});
const isFail = (g: any): g is { ok: false; msg: string } => g.ok === false;

export interface RegisterInput { name: string; surface: string; tier: string; model: string; provider: string; purpose: string; data: string; autonomy: string; users: string; owner: string; ownerId?: string }
/** Prototype: aiRegisterSubmit (and aiRegister for a shadow-AI entry). Gated to admin/owner/analyst; registering never approves the system. */
export function registerSystem(input: RegisterInput, shadowId: string | null) {
  return viaApi<Res<{ id: string; name: string }>>(() => {
    assertRole("registering an AI system", "admin", "owner", "analyst");
    const n = clampText(input.name, 120); if (!n) return fail("Give the system a name");
    const sh = shadowId ? AI_SHADOW.find((x) => x.id === shadowId) : null;
    const owner = pickOf(input.owner, peopleNames(), peopleNames()[0] || "");
    let k = DATA.ai.length + 1; while (DATA.ai.some((x) => x.id === "AI-" + String(k).padStart(2, "0"))) k++; // source: length+1 (could collide after a delete)
    const a = {
      id: "AI-" + String(k).padStart(2, "0"), name: n, purpose: clampText(input.purpose, 200) || "-", tier: pickOf(input.tier, AI_TIERS, "Medium"), status: "In review", owner, basis: "Pending assessment", added: todayGB(), lastReview: "", nextReview: "",
      surface: clampText(input.surface, 120) || "Internal service", model: clampText(input.model, 120) || "—", provider: clampText(input.provider, 120) || "In-house", dataReached: clampText(input.data, 200) || "Internal data",
      autonomy: pickOf(input.autonomy, AI_AUTONOMY, AI_AUTONOMY[0]), users: clampText(input.users, 40) || "—", discovered: sh ? sh.found : "Manual registration", guardrail: "Controlled", euClass: "Not classified", euState: { state: "Not classified", draftBy: owner }, registeredBy: getActor().name,
    };
    DATA.ai.push(a);
    if (shadowId) { const ix = AI_SHADOW.findIndex((x) => x.id === shadowId); if (ix >= 0) AI_SHADOW.splice(ix, 1); }
    return { ok: true, id: a.id, name: n };
  }, () => post<Res<{ id: string; name: string }>>("/ai/systems", { ...input, shadowId }));
}
/** Prototype: aiDismissShadow. Removes a discovered (unregistered) AI entry. */
export function dismissShadow(id: string, reason = "") {
  return viaApi<boolean>(() => { assertRole("dismissing discovered AI", "admin", "owner", "analyst"); const ix = AI_SHADOW.findIndex((x) => x.id === id); if (ix < 0) return false; AI_SHADOW.splice(ix, 1); return true; }, () => post<boolean>(`/ai/shadow/${enc(id)}/dismiss`, { reason }));
}
/** Prototype: aiEdit save. */
export function editSystem(id: string, input: { name: string; purpose: string; basis: string }) {
  return viaApi<Res>(() => {
    const g = gate(id, "Only the AI system owner or an admin can change this"); if (isFail(g)) return g;
    g.a.name = clampText(input.name, 120) || g.a.name; g.a.purpose = clampText(input.purpose, 200); g.a.basis = clampText(input.basis, 200); // source keeps empty purpose/basis, but never an empty name
    return { ok: true };
  }, () => post<Res>(`/ai/systems/${enc(id)}`, input));
}
/** Prototype: aiClassify save (not reachable from the source UI). Refused: the tier is only set by the EU AI Act classification, which a second person confirms. */
export function setTier(id: string, tier: string) {
  return viaApi<Res<{ tier: string }>>(() => {
    const g = gate(id, "Only the AI system owner or an admin can change this"); if (isFail(g)) return g;
    void tier; throw new SodError("The risk tier is set by the EU AI Act classification, which a second person must confirm.");
  }, async () => { void tier; throw new SodError("The risk tier is set by the EU AI Act classification, which a second person must confirm."); });
}
/** Prototype: aiAssign save. */
export function assignOwner(id: string, owner: string, ownerId = "") {
  return viaApi<Res>(() => {
    const g = gate(id, "Only the AI system owner or an admin can change this"); if (isFail(g)) return g;
    if (!peopleNames().includes(owner)) return fail("Choose an owner from the list");
    g.a.owner = owner; return { ok: true };
  }, () => post<Res>(`/ai/systems/${enc(id)}/owner`, { owner, ownerId }));
}
/** Prototype: aiEvidence. The source only stamps a file name; there is no upload. */
/** Production: links a real evidence record (group 1). */
export function attachEvidence(id: string, evidenceId = "") {
  return viaApi<Res<{ name: string }>>(() => {
    const g = gate(id, "Only the AI system owner or an admin can change this"); if (isFail(g)) return g;
    g.a.evidence = "Impact assessment " + nowStamp().slice(0, 10) + ".pdf"; return { ok: true, name: g.a.name as string };
  }, () => post<Res<{ name: string }>>(`/ai/systems/${enc(id)}/evidence`, { evidenceId }));
}
/** Prototype: aiReview. Toggles In review <-> Approved. Completing the review is the approval: admin/owner, not whoever registered the system and not its owner. */
/** Production: starting a new review of an approved system needs a reason. */
export function toggleReview(id: string, reason = "") {
  return viaApi<Res<{ name: string; completed: boolean }>>(() => {
    const g = gate(id, "Only the AI system owner or an admin can change this"); if (isFail(g)) return g;
    const a = g.a;
    if (a.status === "In review") {
      assertRole("completing the review (approval)", "admin", "owner");
      assertNotSelf("you registered or own this AI system, so a different admin or owner must complete its review", a.registeredBy, a.owner);
      a.status = "Approved"; a.lastReview = todayGB(); a.reviewedBy = getActor().name; return { ok: true, name: a.name as string, completed: true };
    }
    a.status = "In review"; return { ok: true, name: a.name as string, completed: false };
  }, () => post<Res<{ name: string; completed: boolean }>>(`/ai/systems/${enc(id)}/review`, { reason }));
}
/** Prototype: aiArchive. Archiving is an approval: requested here, applied when a second admin/owner (not the requester, not the system owner) approves. */
export function archiveSystem(id: string) {
  return viaApi<Res<{ name: string; pending: boolean }>>(() => {
    const g = gate(id, "Only the AI system owner or an admin can change this"); if (isFail(g)) return g;
    const a = g.a;
    if (a.status === "Archived") return fail("Already archived");
    if (stillPending(a.archivePending)) return fail("Archiving is already awaiting approval");
    const ap = requestApproval({ kind: "ai.archive", title: `Archive AI system ${clampText(a.name, 80)} (${a.id})`, subject: a.id, payload: { id: a.id }, needs: 1, approverRoles: APPROVERS, forbid: aiForbidden(a) });
    a.archivePending = ap.id; return { ok: true, name: a.name as string, pending: true };
  }, () => post<Res<{ name: string; pending: boolean }>>(`/ai/systems/${enc(id)}/archive`, {}));
}
/** Prototype: aiGuard save. A guardrail change is an approval by a second person (not the requester, not the system owner). */
export function setGuardrail(id: string, guardrail: string) {
  return viaApi<Res<{ guardrail: string; pending: boolean }>>(() => {
    const g = gate(id, "Only the AI system owner or an admin can change this"); if (isFail(g)) return g;
    const v = AI_GUARDRAILS.find((x) => x[0] === guardrail)?.[0]; if (!v) return fail("Choose a guardrail tier from the list");
    const a = g.a;
    if (v === a.guardrail) return fail("That is already the guardrail tier");
    if (stillPending(a.guardrailPending)) return fail("A guardrail change is already awaiting approval");
    const ap = requestApproval({ kind: "ai.guardrail", title: `Change guardrail of ${clampText(a.name, 80)}: ${a.guardrail} → ${v}`, subject: a.id, payload: { id: a.id, from: String(a.guardrail), to: v }, needs: 1, approverRoles: APPROVERS, forbid: aiForbidden(a) });
    a.guardrailPending = ap.id; return { ok: true, guardrail: v, pending: true };
  }, () => post<Res<{ guardrail: string; pending: boolean }>>(`/ai/systems/${enc(id)}/guardrail`, { guardrail }));
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
    // A draft only PROPOSES the class: the tier and guardrail it implies are applied when a second person confirms (an approved/confirmed state is never silently overwritten).
    a.euClass = cls; a.euRationale = rat;
    a.euDraft = { tier: (cls === "High-risk" || cls === "Prohibited") ? "High" : cls === "Limited risk" ? "Medium" : "Low", guardrail: cls === "Prohibited" ? "Blocked" : cls === "High-risk" ? "Restricted" : cls === "Limited risk" ? "Standard" : "Controlled" };
    a.euState = { state: "Draft", draftBy: getActor().name, by: "", at: "" };
    return { ok: true };
  }, () => post<Res>(`/ai/systems/${enc(id)}/eu-classification`, q));
}
/** Prototype: aiEuConfirm. Confirmer: admin/owner role, not the drafter and not the system owner. Applies the tier and guardrail the draft proposed. */
export function confirmEu(id: string) {
  return viaApi<Res>(() => {
    const a = aiFind(id); if (!a) return NOT_FOUND; aiInit(a);
    assertRole("confirming a classification", "admin", "owner");
    const st = a.euState || {}; const me = getActor();
    if (st.state !== "Draft") return fail("There is no draft classification to confirm");
    assertNotSelf("a different person than the drafter or the system owner must confirm this classification", st.draftBy, a.owner);
    if (a.euDraft) { a.tier = a.euDraft.tier; a.guardrail = a.euDraft.guardrail; delete a.euDraft; }
    a.euState = { state: "Confirmed", draftBy: st.draftBy || a.owner, by: me.name + " (" + (me.base === "owner" ? "Owner" : "Admin") + ")", at: todayGB() };
    return { ok: true };
  }, () => post<Res>(`/ai/systems/${enc(id)}/eu-classification/confirm`, { cls: aiFind(id)?.euDraftClass })); // the class the confirmer saw
}

/* ---- impact assessment (FRIA / DPIA), submitter != approver ---- */
export function saveFria(id: string, input: { status: string; summary: string }) {
  return viaApi<Res>(() => {
    const g = gate(id, "Only the AI system owner or an admin can record this"); if (isFail(g)) return g;
    const a = g.a, st = pickOf(input.status, AI_FRIA_STATUSES, "Not started"), prev = a.fria || {};
    if (prev.review === "Submitted") return fail("This assessment is awaiting approval and cannot be edited");
    // Immutable approvals: an approved assessment is kept as a version and the edit starts a new draft that needs approval again.
    if (prev.review === "Approved") { a.friaVersions = [...(a.friaVersions || []), { ...prev }]; }
    a.fria = { status: st, date: st === "Complete" ? todayGB() : (prev.date || ""), by: getActor().name, summary: clampText(input.summary, 2000), review: "Draft", submittedBy: "", approvedBy: "", version: (prev.review === "Approved" ? (prev.version || 1) + 1 : (prev.version || 1)) };
    return { ok: true };
  }, () => post<Res>(`/ai/systems/${enc(id)}/impact-assessment`, input));
}
export function submitFria(id: string) {
  return viaApi<Res>(() => {
    const g = gate(id, "Only the AI system owner or an admin can submit this"); if (isFail(g)) return g;
    const a = g.a; a.fria = a.fria || {};
    if (a.fria.review === "Approved" || a.fria.review === "Submitted") return fail("This assessment is already " + String(a.fria.review).toLowerCase());
    a.fria.review = "Submitted"; a.fria.submittedBy = getActor().name; return { ok: true };
  }, () => post<Res>(`/ai/systems/${enc(id)}/impact-assessment/submit`, {}));
}
/** Approver: admin/owner role, not the submitter, not whoever recorded it, not the system owner. */
export function approveFria(id: string) {
  return viaApi<Res>(() => {
    const a = aiFind(id); if (!a) return NOT_FOUND; aiInit(a);
    assertRole("approving an impact assessment", "admin", "owner");
    const f = a.fria || {};
    if (f.review !== "Submitted") return fail("Nothing is awaiting approval");
    assertNotSelf("a different person than the submitter, the author or the system owner must approve this impact assessment", ...aiForbidden(a, f.submittedBy, f.by));
    f.review = "Approved"; f.status = "Complete"; f.approvedBy = getActor().name; f.date = f.date || todayGB();
    a.evidence = "D-07 AI system impact assessment " + nowStamp().slice(0, 10) + ".pdf";
    return { ok: true };
  }, () => post<Res>(`/ai/systems/${enc(id)}/impact-assessment/approve`, {}));
}
export function returnFria(id: string, reason = "") {
  return viaApi<Res>(() => {
    const a = aiFind(id); if (!a) return NOT_FOUND; aiInit(a);
    assertRole("reviewing an impact assessment", "admin", "owner");
    const f = a.fria || {};
    if (f.review !== "Submitted") return fail("Nothing is awaiting review");
    assertNotSelf("a different person than the submitter or the system owner must review this", ...aiForbidden(a, f.submittedBy));
    f.review = "Changes requested"; return { ok: true };
  }, () => post<Res>(`/ai/systems/${enc(id)}/impact-assessment/return`, { reason }));
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
/** Production: signals are addressed by their server id. */
const sigPath = (id: string, si: number, what: string) => `/ai/systems/${enc(id)}/signals/${enc(String(signalOf(aiFind(id) ?? { signals: [] }, si)?.id ?? si))}/${what}`;
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
  }, () => post<Res<{ ref: string }>>(sigPath(id, si, "risk"), {}));
}
/** Prototype: aiSignalIssue. */
export function signalRaiseIssue(id: string, si: number) {
  return viaApi<Res<{ ref: string }>>(() => {
    const g = gate(id, SIG_MSG); if (isFail(g)) return g;
    const a = g.a, s = signalOf(a, si); if (!s) return fail("Signal not found");
    const rid = nextId("R-", 60, DATA.issues);
    DATA.issues.unshift({ id: rid, title: "AI signal: " + String(s.text).slice(0, 56) + " — " + a.name, sev: s.sev === "Review" ? "Medium" : "Low", status: "Open", owner: a.owner, due: "Due 14d" });
    s.status = "Issue raised"; s.ref = rid; return { ok: true, ref: rid };
  }, () => post<Res<{ ref: string }>>(sigPath(id, si, "issue"), {}));
}
export function signalDismiss(id: string, si: number, reason = "") {
  return viaApi<Res>(() => {
    const g = gate(id, SIG_MSG); if (isFail(g)) return g;
    const s = signalOf(g.a, si); if (!s) return fail("Signal not found");
    s.status = "Dismissed"; return { ok: true };
  }, () => post<Res>(sigPath(id, si, "dismiss"), { reason }));
}
