/* Trust Center API stubs (source lines 3326-3442). Mock mode mutates the in-memory state as the prototype did; the caller does wsLog/toast/bumpData.
 * A real API MUST enforce: who may publish/change visibility, approve/deny/revoke access, tenant isolation, NDA enforcement before private documents
 * are served, expiring links, blocked-domain rejection on approve, and rate limiting + server-side answer filtering for the public chatbot. */
import { DATA } from "@/lib/data";
import { nowStamp } from "@/lib/format";
import { ANSWER_LIB, TRUST, TRUST_FAQ } from "@/lib/trustData";
import { apiFetch, viaApi } from "./http";

const send = <T,>(method: string, path: string, body?: unknown) =>
  apiFetch<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
const enc = encodeURIComponent;
const today = () => nowStamp().slice(0, 10);

/** source trustBotAnswer: best keyword overlap among verified library answers + FAQ; null when nothing scores. Pure text matching, no generation. */
export function botAnswer(q: string): string | null {
  const ql = q.toLowerCase();
  let best: { a: string } | null = null, bestScore = 0;
  const pool = ANSWER_LIB.filter((a) => a.verified).concat(TRUST_FAQ.map((f) => ({ q: f.q, a: f.a, verified: true, uses: 0 })));
  pool.forEach((a) => {
    const words = a.q.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
    const score = words.filter((w) => ql.includes(w)).length;
    if (score > bestScore) { bestScore = score; best = a; }
  });
  return bestScore >= 1 && best ? (best as { a: string }).a : null;
}
export const isBlockedWho = (who: string) => TRUST.blocked.some((d) => who.endsWith("@" + d) || who.endsWith("." + d));

export function approveRequest(id: string, actor: string) {
  return viaApi(() => {
    const r = TRUST.requests.find((x) => x.id === id);
    if (!r) return null;
    TRUST.requests = TRUST.requests.filter((x) => x.id !== id);
    TRUST.decisions.unshift({ at: today(), who: r.who, resource: r.resource, decision: "Approved", by: actor, note: "" });
    const acc = TRUST.accounts.find((a) => r.who.endsWith("@" + a.domain));
    if (acc) { if (!acc.viewers.includes(r.who)) acc.viewers.push(r.who); acc.status = "Active"; }
    else TRUST.accounts.push({ company: r.company, domain: r.who.split("@")[1] || "—", nda: "Signed " + today(), viewers: [r.who], access: r.resource, status: "Active" });
    return r;
  }, () => send<any>("POST", `/trust/requests/${enc(id)}/approve`, {}));
}
export function denyRequest(id: string, note: string, actor: string) {
  return viaApi(() => {
    const r = TRUST.requests.find((x) => x.id === id);
    if (!r) return null;
    TRUST.requests = TRUST.requests.filter((x) => x.id !== id);
    TRUST.decisions.unshift({ at: today(), who: r.who, resource: r.resource, decision: "Denied", by: actor, note });
    return r;
  }, () => send<any>("POST", `/trust/requests/${enc(id)}/deny`, { note }));
}
export function revokeAccount(i: number) {
  return viaApi(() => {
    const a = TRUST.accounts[i];
    if (!a) return null;
    a.status = "Revoked"; a.viewers = [];
    return a;
  }, () => send<any>("POST", `/trust/accounts/${i}/revoke`, {}));
}
export function blockDomain(d: string) {
  return viaApi(() => { if (!TRUST.blocked.includes(d)) TRUST.blocked.push(d); return d; }, () => send<string>("POST", "/trust/blocked-domains", { domain: d }));
}
export function unblockDomain(d: string) {
  return viaApi(() => { TRUST.blocked = TRUST.blocked.filter((x) => x !== d); return d; }, () => send<string>("DELETE", `/trust/blocked-domains/${enc(d)}`));
}
export function setChatbot(on: boolean) {
  return viaApi(() => { TRUST.chatbot = on; return on; }, () => send<boolean>("PUT", "/trust/chatbot", { enabled: on }));
}
export function toggleVisibility(i: number) {
  return viaApi(() => {
    const t = DATA.trust[i];
    t.access = t.access === "Public" ? "On request, NDA" : "Public";
    return t;
  }, () => send<any>("POST", `/trust/resources/${i}/visibility`, {}));
}
export function publishResource(name: string, access: string) {
  return viaApi(() => { DATA.trust.push({ name, access, status: "Active" }); return { name }; }, () => send<{ name: string }>("POST", "/trust/resources", { name, access }));
}
/** Public-side actions (a real API must authenticate/rate-limit these; they are anonymous in the prototype). */
export function askQuestion(q: string, domain: string) {
  return viaApi(() => {
    const ans = TRUST.chatbot ? botAnswer(q) : null;
    const reply = ans || "Thanks — this one needs a person. Your question has been sent to the security team, who will reply by email.";
    TRUST.chats.unshift({ at: today(), who: domain, q, a: reply });
    return { ans, reply };
  }, () => send<{ ans: string | null; reply: string }>("POST", "/trust/questions", { q }));
}
export function subscribeUpdates(email: string) {
  return viaApi(() => email, () => send<string>("POST", "/trust/subscriptions", { email }));
}
export function requestAccess(resourceIndex: number, email: string, reason: string) {
  return viaApi(() => DATA.trust[resourceIndex], () => send<any>("POST", "/trust/access-requests", { resource: resourceIndex, email, reason }));
}
