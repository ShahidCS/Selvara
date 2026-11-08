/* Questionnaires API stubs (source lines 3443-3478). Caller does wsLog/toast/bumpData.
 * A real API must enforce: who may verify answers (verified answers feed the PUBLIC Trust Center chatbot), vendor-portal isolation (a vendor sees only
 * its own questionnaire), required-answer checks on submit, and progress arithmetic. */
import { DATA } from "@/lib/data";
import { ANSWER_LIB, VENDOR_Q } from "@/lib/trustData";
import { apiFetch, viaApi } from "./http";

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
export function verifyAnswer(i: number) {
  return viaApi(() => { const a = ANSWER_LIB[i]; if (a) a.verified = true; return a; }, () => send<any>("POST", `/answer-library/${i}/verify`, {}));
}
export function addAnswer(q: string, a: string) {
  return viaApi(() => { ANSWER_LIB.unshift({ q, a, verified: false, uses: 0 }); return { q }; }, () => send<any>("POST", "/answer-library", { q, a }));
}
export function importQuestionnaire(name: string, total: number, due: string) {
  return viaApi(() => { DATA.questionnaires.unshift({ name, prog: "0 / " + total, status: "Not started", due: due || "TBD" }); return { name }; },
    () => send<any>("POST", "/questionnaires", { name, total, due }));
}
export function advanceQuestionnaire(i: number) {
  return viaApi(() => {
    const q = DATA.questionnaires[i];
    let [a, b] = splitProg(q.prog);
    a = Math.min(b, a + 10);
    q.prog = a + " / " + b; q.status = a >= b ? "Complete" : "In progress";
    return { q, a, b };
  }, () => send<any>("POST", `/questionnaires/${i}/advance`, {}));
}
export function completeQuestionnaire(i: number) {
  return viaApi(() => {
    const q = DATA.questionnaires[i];
    const b = parseInt(String(q.prog).split("/")[1], 10);
    q.prog = b + " / " + b; q.status = "Complete"; q.due = "Submitted";
    return q;
  }, () => send<any>("POST", `/questionnaires/${i}/complete`, {}));
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
