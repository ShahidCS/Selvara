/* Mutable demo state for Trust Center admin, Questionnaires, Commitments and Reports (the prototype kept these as module-level `let`s).
 * Seed extracted from the source with scripts/extract-source.js (src/data/trustSeed.json). Mutate in an event handler, wsLog, then bumpData(). */
import seed from "@/data/trustSeed.json";
import { sectionsOf, type TrustSections } from "@/lib/trustSections";

const PRODUCTION = (process.env.NEXT_PUBLIC_API_MODE || "mock") === "http"; // production fills these from the server (services/ws.ts)
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
/** The seed in the demonstration; empty in production. */
const demo = <T,>(x: T, empty: T): T => (PRODUCTION ? empty : clone(x));

export const TRUST_FAQ: { q: string; a: string }[] = demo(seed.TRUST_FAQ, []);
export const TRUST_SUBPROC: { name: string; purpose: string; region: string }[] = demo(seed.TRUST_SUBPROC, []);
export const TRUST_UPDATES: { at: string; title: string }[] = demo(seed.TRUST_UPDATES, []);
/** `people`: each viewer and their own NDA state (F1-02: the NDA is accepted per person, never for the whole account). Production sends
 *  `access` as document names for display and `accessIds` as the references. */
export interface TrustAccount { id?: string; company: string; domain: string; nda: string; viewers: string[]; people?: { email: string; nda: string }[]; access: string | string[]; accessIds?: string[]; status: string }
/** `resourceId` empty and `resource` "Documents under NDA": a request that names no document; the approver chooses which to grant. */
export interface TrustRequest { resourceId?: string; id: string; who: string; company: string; resource: string; reason: string; at: string; enteredBy?: string }
export interface TrustDecision { at: string; who: string; resource: string; decision: string; by: string; note: string }
export interface TrustChat { at: string; who: string; q: string; a: string }
/** Reassignable collections live on one object so every module sees the current value. */
export const TRUST: {
  accounts: TrustAccount[]; requests: TrustRequest[]; decisions: TrustDecision[];
  activity: { at: string; who: string; what: string }[]; modeHist: { at: string; who: string; change: string }[];
  blocked: string[]; chatbot: boolean; chats: TrustChat[];
  /** What visitors can see (F1-02). Defaults: everything except the live control status. */ sections: TrustSections;
} = {
  accounts: demo(seed.TRUST_ACCOUNTS, []), requests: demo(seed.TRUST_REQUESTS, []), decisions: demo(seed.TRUST_DECISIONS, []),
  activity: demo(seed.TRUST_ACTIVITY, []), modeHist: demo(seed.TRUST_MODEHIST, []), blocked: demo(seed.TRUST_BLOCKED, []),
  chatbot: seed.TRUST_CHATBOT, chats: demo(seed.TRUST_CHATS, []), sections: sectionsOf(null),
};

/** `author`/`editedBy`: who wrote or last changed the answer (never allowed to verify it); `verifiedBy`: the different admin/owner who did. */
export interface AnswerLibEntry { id?: string; q: string; a: string; verified: boolean; uses: number; author?: string; editedBy?: string; verifiedBy?: string }
export const ANSWER_LIB: AnswerLibEntry[] = demo(seed.ANSWER_LIB, []);
export const KB_DOCS: { id?: string; name: string; type: string }[] = demo(seed.KB_DOCS, []);
/** Records a vendor's answer to question `i` (the source mutated VENDOR_Q on every input event). */
export function setVendorAnswer(i: number, answer: string) { VENDOR_Q[i].a = answer; }
export const VENDOR_Q: { q: string; a: string; required: boolean }[] = demo(seed.VENDOR_Q, []);

export const INCIDENT: { active: boolean; started: string | null; startedBy?: string; closedBy?: string; summary?: string; deadline?: string; overdue?: boolean } = { active: false, started: null };
export const STANDARD_TERMS: { term: string; val: string }[] = demo(seed.STANDARD_TERMS, []);

/** "On demand" was missing from the source list although the form branch and the seeded "Audit evidence pack" use it (made reachable). */
export const REPORT_FREQ: string[] = [...clone(seed.REPORT_FREQ), ...(seed.REPORT_FREQ.includes("On demand") ? [] : ["On demand"])];
export interface SchedPack { id?: string; name: string; freq: string; detail: string; recip: string; next: string; external?: boolean; approvedBy?: string; approvalId?: string }
export const SCHED_PACKS: SchedPack[] = (process.env.NEXT_PUBLIC_API_MODE || "mock") === "http" ? [] : clone(seed.SCHED_PACKS); // production: from the server
