/* Questionnaires API stubs (source lines 3443-3478). Caller does wsLog/toast/bumpData.
 * CONTRACT (docs/SOD_MATRIX.md section 3): SENDING a questionnaire externally ("Mark complete" in the source) is a four-eyes step: the author submits it for review and
 * a reviewer (admin/owner) who is not the author and has not edited it approves the send (approvals engine). VERIFYING an answer publishes it to the PUBLIC Trust Center
 * chatbot, so it needs admin/owner, a verifier who is not the answer's author/editor, and is audited. Violations throw SodError.
 * The real API MUST enforce this, vendor-portal isolation (a vendor sees only its own questionnaire), required-answer checks and progress arithmetic. */
import { DATA } from "@/lib/data";
import { wsLog } from "@/lib/audit";
import { getApproval, requestApproval } from "@/lib/approvals";
import { payloadStr, registerApprovalHandler } from "@/lib/approvalKit";
import { assertNotSelf, assertRole, getActor, sodReason, SodError } from "@/lib/sod";
import { clampText } from "@/lib/security";
import { ANSWER_LIB, VENDOR_Q } from "@/lib/trustData";
import { apiFetch, viaApi } from "./http";

/* eslint-disable @typescript-eslint/no-explicit-any */
const stillPending = (id?: string) => !!id && getApproval(id)?.status === "Pending";
/** Questionnaire work (import, answer, submit for review): the workspace roles that can open the module. Vendors only use the portal view. */
const work = (what: string) => assertRole(what, "admin", "owner", "employee");
/** Lazily gives every record a stable id (the source addressed them by array index only). */
const qid = (q: any): string => { if (!q.qid) q.qid = "Q-" + (globalThis.crypto?.randomUUID?.() || String(Date.now())).slice(0, 8); return q.qid; };
/** Everyone who wrote or changed this questionnaire: they can never be its reviewer. */
export const qContributors = (q: any): string[] => [q.author, ...(q.editors || [])].filter(Boolean);

registerApprovalHandler("q.send", {
  apply: (ap) => {
    const q = DATA.questionnaires.find((x) => x.qid === payloadStr(ap, "qid")); if (!q) throw new SodError("Questionnaire not found.");
    const b = parseInt(String(q.prog).split("/")[1], 10);
    q.prog = b + " / " + b; q.status = "Complete"; q.due = "Submitted"; q.sentBy = ap.requestedBy; q.reviewedBy = ap.approvals.map((x) => x.by).join(", "); delete q.pendingSend;
    wsLog("questionnaire.completed", `${q.name} (sent externally; author ${q.author || ap.requestedBy}; reviewed by ${q.reviewedBy})`, "Vendor");
  },
  closed: (ap) => { const q = DATA.questionnaires.find((x) => x.qid === payloadStr(ap, "qid")); if (q) delete q.pendingSend; },
});

const send = <T,>(method: string, path: string, body?: unknown) =>
  apiFetch<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

/** source qPct */
export function qPct(prog: unknown): number {
  const [a, b] = String(prog).split("/").map((x) => parseInt(x, 10));
  return b ? Math.round((a / b) * 100) : 0;
}
export const splitProg = (prog: unknown): [number, number] => {
  const [a, b] = String(prog).split("/").map((x) => parseInt(x, 10));
  return [a, b];
};
/** Why the signed-in person cannot verify this answer (null = may). Shared with the UI so the button shows the same reason. */
export function verifyBlockReason(a: { author?: string; editedBy?: string }): string | null {
  if (!["admin", "owner"].includes(getActor().base)) return "Only admin or owner can verify answers (verified answers feed the public chatbot).";
  return sodReason("you wrote or edited this answer, so a different admin or owner must verify it", a.author, a.editedBy);
}
export function verifyAnswer(i: number) {
  return viaApi(() => {
    assertRole("verifying an answer (it is published to the public Trust Center chatbot)", "admin", "owner");
    const a = ANSWER_LIB[i]; if (!a) throw new SodError("Answer not found.");
    if (a.verified) return a;
    assertNotSelf("you wrote or edited this answer, so a different admin or owner must verify it", a.author, a.editedBy);
    a.verified = true; a.verifiedBy = getActor().name; return a;
  }, () => send<any>("POST", `/answer-library/${i}/verify`, {}));
}
export function addAnswer(q: string, a: string) {
  return viaApi(() => { work("adding an answer"); ANSWER_LIB.unshift({ q, a, verified: false, uses: 0, author: getActor().name }); return { q }; }, () => send<any>("POST", "/answer-library", { q, a }));
}
export function importQuestionnaire(name: string, total: number, due: string) {
  return viaApi(() => { work("importing a questionnaire"); const q: any = { name, prog: "0 / " + total, status: "Not started", due: due || "TBD", author: getActor().name, editors: [] }; qid(q); DATA.questionnaires.unshift(q); return { name }; },
    () => send<any>("POST", "/questionnaires", { name, total, due }));
}
export function advanceQuestionnaire(i: number) {
  return viaApi(() => {
    work("answering questions");
    const q = DATA.questionnaires[i]; if (!q) throw new SodError("Questionnaire not found.");
    if (q.status === "Complete") throw new SodError("This questionnaire has already been sent.");
    if (stillPending(q.pendingSend)) throw new SodError("This questionnaire is awaiting review and cannot be edited.");
    let [a, b] = splitProg(q.prog);
    a = Math.min(b, a + 10);
    q.prog = a + " / " + b; q.status = a >= b ? "Complete" : "In progress";
    const me = getActor().name; q.editors = Array.from(new Set([...(q.editors || []), me])); qid(q);
    return { q, a, b };
  }, () => send<any>("POST", `/questionnaires/${i}/advance`, {}));
}
/** Source "Mark complete" (sent to the customer). Now: submit for review. A reviewer other than the author/editors approves the send. */
export function requestSend(i: number) {
  return viaApi<{ name: string; prog: string }>(() => {
    work("submitting a questionnaire for review");
    const q = DATA.questionnaires[i]; if (!q) throw new SodError("Questionnaire not found.");
    if (q.status === "Complete") throw new SodError("This questionnaire has already been sent.");
    if (stillPending(q.pendingSend)) throw new SodError("This questionnaire is already awaiting review.");
    const me = getActor().name; q.editors = Array.from(new Set([...(q.editors || []), me]));
    const ap = requestApproval({ kind: "q.send", title: `Send questionnaire "${clampText(q.name, 100)}" externally (${q.prog})`, subject: q.name, payload: { qid: qid(q) }, needs: 1, approverRoles: ["admin", "owner"], forbid: qContributors(q) });
    q.pendingSend = ap.id; return { name: q.name as string, prog: String(q.prog) };
  }, () => send<any>("POST", `/questionnaires/${i}/send-for-review`, {}));
}
/** Store the answers; returns how many required questions are still unanswered. */
const storeAnswers = (answers: string[]) => {
  VENDOR_Q.forEach((q, i) => { if (answers[i] !== undefined) q.a = answers[i]; });
  return VENDOR_Q.filter((q) => q.required && !q.a.trim()).length;
};
export function saveVendorAnswers(answers: string[]) {
  return viaApi(() => storeAnswers(answers), () => send<number>("PUT", "/vendor-questionnaire/answers", { answers }));
}
export function submitVendorQuestionnaire(answers: string[]) {
  return viaApi(() => storeAnswers(answers), () => send<number>("POST", "/vendor-questionnaire/submit", { answers }));
}
