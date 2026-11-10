/* Trust Center API stubs (source lines 3326-3442). Mock mode mutates the in-memory state; the caller does wsLog/toast/bumpData.
 * CONTRACT (docs/security/SOD_MATRIX.md section 3, Trust): every admin action needs admin/owner (assertRole); making a resource PUBLIC is a four-eyes approval
 * (approver is not the editor/requester); BLOCKLISTED DOMAINS CANNOT BE APPROVED (enforced here, the source ignored the blocklist); approving an access request
 * needs an approver who is not the requester; the anonymous request-access form enqueues into the admin pending queue (rate limited, reason stored, clamped).
 * Violations throw SodError. The real API MUST enforce all of it plus tenant isolation, NDA before private documents are served, expiring links,
 * and rate limiting / bot protection + server-side answer filtering for the public chatbot. */
import { DATA } from "@/lib/data";
import { wsLog } from "@/lib/audit";
import { getApproval, requestApproval } from "@/lib/approvals";
import { payloadStr, registerApprovalHandler } from "@/lib/approvalKit";
import { assertNotSelf, assertRole, getActor, SodError } from "@/lib/sod";
import { nowStamp } from "@/lib/format";
import { clampText, isEmail } from "@/lib/security";
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
/** Domain part of an email, lower-cased ("M.Park@FreeMail.Example" -> "freemail.example"). */
export const domainOf = (who: string) => String(who ?? "").trim().toLowerCase().split("@").pop() || "";
/** Blocklist match on the whole domain or any parent domain (case-insensitive; the source compared case-sensitively with endsWith). */
export const isBlockedWho = (who: string) => { const d = domainOf(who); return TRUST.blocked.some((b) => { const x = String(b).trim().toLowerCase(); return !!x && (d === x || d.endsWith("." + x)); }); };
const gate = (what: string) => assertRole(what, "admin", "owner");
const stillPending = (id?: string) => !!id && getApproval(id)?.status === "Pending";
const APPROVERS = ["admin", "owner"];

registerApprovalHandler("trust.publish", {
  apply: (ap) => {
    const name = payloadStr(ap, "name"); const by = ap.approvals.map((x) => x.by).join(", ");
    if (payloadStr(ap, "mode") === "new") {
      DATA.trust.push({ name, access: "Public", status: "Active", editedBy: ap.requestedBy, approvedBy: by });
      wsLog("trust.resource.published", `${name} (public; approved by ${by}; requested by ${ap.requestedBy})`, "Policy");
    } else {
      const t = DATA.trust.find((x) => x.name === name); if (!t) throw new SodError("Resource not found.");
      t.access = "Public"; t.approvedBy = by; delete t.publishPending;
      wsLog("trust.visibility.changed", `${name} → Public (approved by ${by}; requested by ${ap.requestedBy})`, "Policy");
    }
  },
  closed: (ap) => { const t = DATA.trust.find((x) => x.name === payloadStr(ap, "name")); if (t) delete t.publishPending; },
});

/** Why this pending request cannot be approved by the signed-in person (null = may approve). Shared with the UI so the button shows the same reason. */
export function approveBlockReason(r: { who: string; enteredBy?: string }): string | null {
  if (isBlockedWho(r.who)) return "Blocked domain: this request cannot be approved. Unblock the domain first (audited) or deny the request.";
  const me = getActor();
  if (!["admin", "owner"].includes(me.base)) return "Only admin or owner can approve access requests.";
  if ([r.who, r.enteredBy].filter(Boolean).some((x) => me.name.toLowerCase() === String(x).toLowerCase())) return "Segregation of duties: you raised this request, so another admin or owner must approve it.";
  return null;
}
export function approveRequest(id: string) {
  return viaApi(() => {
    gate("approving a Trust Center access request");
    const r = TRUST.requests.find((x) => x.id === id);
    if (!r) return null;
    if (isBlockedWho(r.who)) { wsLog("trust.access.approve.denied", r.who + " (blocked domain)", "Policy"); throw new SodError("Blocked domain: this request cannot be approved."); }
    assertNotSelf("you raised this request, so another admin or owner must approve it", r.who, r.enteredBy);
    const actor = getActor().name;
    TRUST.requests = TRUST.requests.filter((x) => x.id !== id);
    TRUST.decisions.unshift({ at: today(), who: r.who, resource: r.resource, decision: "Approved", by: actor, note: "" });
    const acc = TRUST.accounts.find((a) => domainOf(r.who) === a.domain.toLowerCase());
    if (acc) { if (!acc.viewers.includes(r.who)) acc.viewers.push(r.who); acc.status = "Active"; }
    else TRUST.accounts.push({ company: r.company, domain: domainOf(r.who) || "—", nda: "Signed " + today(), viewers: [r.who], access: r.resource, status: "Active" });
    return r;
  }, () => send<(typeof TRUST.requests)[number] | null>("POST", `/trust/requests/${enc(id)}/approve`, {}));
}
export function denyRequest(id: string, note: string) {
  return viaApi(() => {
    gate("denying a Trust Center access request");
    const r = TRUST.requests.find((x) => x.id === id);
    if (!r) return null;
    TRUST.requests = TRUST.requests.filter((x) => x.id !== id);
    TRUST.decisions.unshift({ at: today(), who: r.who, resource: r.resource, decision: "Denied", by: getActor().name, note });
    return r;
  }, () => send<(typeof TRUST.requests)[number] | null>("POST", `/trust/requests/${enc(id)}/deny`, { note }));
}
export function revokeAccount(i: number) {
  return viaApi(() => {
    gate("revoking Trust Center access");
    const a = TRUST.accounts[i];
    if (!a) return null;
    a.status = "Revoked"; a.viewers = [];
    return a;
  }, () => send<(typeof TRUST.accounts)[number] | null>("POST", `/trust/accounts/${i}/revoke`, {}));
}
export function blockDomain(d: string) {
  return viaApi(() => { gate("blocking a domain"); if (!TRUST.blocked.includes(d)) TRUST.blocked.push(d); return d; }, () => send<string>("POST", "/trust/blocked-domains", { domain: d }));
}
export function unblockDomain(d: string) {
  return viaApi(() => { gate("unblocking a domain"); TRUST.blocked = TRUST.blocked.filter((x) => x !== d); return d; }, () => send<string>("DELETE", `/trust/blocked-domains/${enc(d)}`));
}
export function setChatbot(on: boolean) {
  return viaApi(() => { gate("changing the Trust Center chatbot"); TRUST.chatbot = on; return on; }, () => send<boolean>("PUT", "/trust/chatbot", { enabled: on }));
}
/** Make private is immediate. Make public is a four-eyes approval (approver != editor/requester); the resource stays access-controlled until then. */
export function toggleVisibility(i: number) {
  return viaApi<{ name: string; access: string; pending: boolean }>(() => {
    gate("changing resource visibility");
    const t = DATA.trust[i]; if (!t) throw new SodError("Resource not found.");
    if (t.access === "Public") { t.access = "On request, NDA"; t.editedBy = getActor().name; return { name: t.name, access: t.access, pending: false }; }
    if (stillPending(t.publishPending)) throw new SodError("Publishing is already awaiting approval.");
    const ap = requestApproval({ kind: "trust.publish", title: `Make "${clampText(t.name, 100)}" public`, subject: t.name, payload: { name: t.name, mode: "toggle" }, needs: 1, approverRoles: APPROVERS, forbid: [t.editedBy].filter(Boolean) });
    t.publishPending = ap.id; return { name: t.name, access: t.access, pending: true };
  }, () => send<{ name: string; access: string; pending: boolean }>("POST", `/trust/resources/${i}/visibility`, {}));
}
/** Publishing as "On request, NDA" is immediate; publishing as Public is a four-eyes approval and the resource is not listed until approved. */
export function publishResource(name: string, access: string) {
  return viaApi<{ name: string; pending: boolean }>(() => {
    gate("publishing a Trust Center resource");
    if (access === "Public") {
      if (approvalsPendingFor(name)) throw new SodError("Publishing is already awaiting approval.");
      requestApproval({ kind: "trust.publish", title: `Publish "${clampText(name, 100)}" publicly`, subject: name, payload: { name, mode: "new" }, needs: 1, approverRoles: APPROVERS });
      return { name, pending: true };
    }
    DATA.trust.push({ name, access: "On request, NDA", status: "Active", editedBy: getActor().name }); return { name, pending: false };
  }, () => send<{ name: string; pending: boolean }>("POST", "/trust/resources", { name, access }));
}
const approvalsPendingFor = (name: string) => DATA.trust.some((t) => t.name === name && stillPending(t.publishPending));
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
/* Anonymous request-access: rate limited (per email and overall), reason stored clamped to 300 chars, enqueued for admins. The reply never reveals whether the
 * address is blocked or already queued (no enumeration). Limits follow docs/architecture/SPEC_BOARDS.md 9.G2 (sign-up style: 3 per hour per email). The real API must
 * rate limit by IP/device too, add bot protection and verify the email address before notifying anyone. */
export const REQUEST_RATE = { windowMs: 3600_000, perEmail: 3, overall: 30, maxQueue: 200 } as const;
export const REQUEST_ACCESS_COPY = "You can send up to 3 requests per hour from one email address. Our security team reviews every request and will reply by email.";
const HITS = new Map<string, number[]>();
function rateOk(key: string, max: number, now: number): boolean { const arr = (HITS.get(key) || []).filter((t) => now - t < REQUEST_RATE.windowMs); HITS.set(key, arr); return arr.length < max; }
export function requestAccess(resourceIndex: number, email: string, reason: string) {
  return viaApi<{ queued: boolean }>(() => {
    const t = DATA.trust[resourceIndex]; if (!t) throw new SodError("Resource not found.");
    const em = clampText(email, 254).toLowerCase(); if (!isEmail(em)) throw new SodError("Enter a valid email address.");
    const now = Date.now();
    if (!rateOk("e:" + em, REQUEST_RATE.perEmail, now) || !rateOk("all", REQUEST_RATE.overall, now)) throw new SodError("Too many requests. Please wait an hour before trying again.");
    HITS.get("e:" + em)!.push(now); HITS.get("all")!.push(now);
    if (t.access === "Public" || TRUST.requests.length >= REQUEST_RATE.maxQueue || TRUST.requests.some((x) => x.who === em && x.resource === t.name)) return { queued: false };
    const n = TRUST.requests.reduce((m, x) => Math.max(m, parseInt(String(x.id).replace(/\D/g, ""), 10) || 0), 0) + 1;
    const label = domainOf(em).split(".")[0] || "";
    TRUST.requests.unshift({ id: "TR-" + n, who: em, company: label ? label.charAt(0).toUpperCase() + label.slice(1, 80) : "—", resource: t.name, reason: clampText(reason, 300) || "—", at: today() });
    return { queued: true };
  }, () => send<{ queued: boolean }>("POST", "/trust/access-requests", { resource: resourceIndex, email, reason }));
}
