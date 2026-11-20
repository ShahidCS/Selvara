/* Mutable demo state for Trust Center admin, Questionnaires, Commitments and Reports (the prototype kept these as module-level `let`s).
 * Seed extracted from the source with scripts/extract-source.js (src/data/trustSeed.json). Mutate in an event handler, wsLog, then bumpData(). */
import seed from "@/data/trustSeed.json";

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export const TRUST_FAQ: { q: string; a: string }[] = clone(seed.TRUST_FAQ);
export const TRUST_SUBPROC: { name: string; purpose: string; region: string }[] = clone(seed.TRUST_SUBPROC);
export const TRUST_UPDATES: { at: string; title: string }[] = clone(seed.TRUST_UPDATES);
export interface TrustAccount { company: string; domain: string; nda: string; viewers: string[]; access: string; status: string }
export interface TrustRequest { id: string; who: string; company: string; resource: string; reason: string; at: string; enteredBy?: string }
export interface TrustDecision { at: string; who: string; resource: string; decision: string; by: string; note: string }
export interface TrustChat { at: string; who: string; q: string; a: string }
/** Reassignable collections live on one object so every module sees the current value. */
export const TRUST: {
  accounts: TrustAccount[]; requests: TrustRequest[]; decisions: TrustDecision[];
  activity: { at: string; who: string; what: string }[]; modeHist: { at: string; who: string; change: string }[];
  blocked: string[]; chatbot: boolean; chats: TrustChat[];
} = {
  accounts: clone(seed.TRUST_ACCOUNTS), requests: clone(seed.TRUST_REQUESTS), decisions: clone(seed.TRUST_DECISIONS),
  activity: clone(seed.TRUST_ACTIVITY), modeHist: clone(seed.TRUST_MODEHIST), blocked: clone(seed.TRUST_BLOCKED),
  chatbot: seed.TRUST_CHATBOT, chats: clone(seed.TRUST_CHATS),
};

/** `author`/`editedBy`: who wrote or last changed the answer (never allowed to verify it); `verifiedBy`: the different admin/owner who did. */
export interface AnswerLibEntry { q: string; a: string; verified: boolean; uses: number; author?: string; editedBy?: string; verifiedBy?: string }
export const ANSWER_LIB: AnswerLibEntry[] = clone(seed.ANSWER_LIB);
export const KB_DOCS: { name: string; type: string }[] = clone(seed.KB_DOCS);
/** Records a vendor's answer to question `i` (the source mutated VENDOR_Q on every input event). */
export function setVendorAnswer(i: number, answer: string) { VENDOR_Q[i].a = answer; }
export const VENDOR_Q: { q: string; a: string; required: boolean }[] = clone(seed.VENDOR_Q);

export const INCIDENT: { active: boolean; started: string | null; startedBy?: string; closedBy?: string } = { active: false, started: null };
export const STANDARD_TERMS: { term: string; val: string }[] = clone(seed.STANDARD_TERMS);

/** "On demand" was missing from the source list although the form branch and the seeded "Audit evidence pack" use it (made reachable). */
export const REPORT_FREQ: string[] = [...clone(seed.REPORT_FREQ), ...(seed.REPORT_FREQ.includes("On demand") ? [] : ["On demand"])];
export interface SchedPack { id?: string; name: string; freq: string; detail: string; recip: string; next: string; external?: boolean; approvedBy?: string; approvalId?: string }
export const SCHED_PACKS: SchedPack[] = (process.env.NEXT_PUBLIC_API_MODE || "mock") === "http" ? [] : clone(seed.SCHED_PACKS); // production: from the server
