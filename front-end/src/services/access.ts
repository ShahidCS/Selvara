/* Access API stubs (requests + recertification reviews). Mock mode mutates the in-memory queues the prototype used and returns what the
 * caller needs for wsLog / toast; the caller then does wsLog / toast / bumpData.
 * The real API MUST enforce who may approve/deny (not the requester), who may review, and write the audit entry itself.
 * Creating a request lives in features/work/RequestModals.tsx (AccessRequestForm, shared with My Work). */
import { DATA } from "@/lib/data";
import { decideApproval, registerKind, settle } from "@/lib/approvalFlow";
import { requestApproval } from "@/lib/approvals";
import { wsLog } from "@/lib/audit";
import { ACCESS_REQUESTS, ACCESS_REVIEWS } from "@/lib/requests";
import { clampText } from "@/lib/security";
import { assertNotSelf, assertRole, getActor, hasRole, isMe, isSamePerson, SodError } from "@/lib/sod";
import { bumpData } from "@/lib/store";
import { isPrivilegedLevel, isPrivilegedSystem } from "@/lib/teamRoles";
import { eligibleApprovers } from "./mfa";
import { viaApi } from "./http";
import { wsPost } from "./ws";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Production: the server decides and records it (under /api/ws), then the workspace reloads. */
const post = <T,>(path: string, body: unknown) => wsPost<T>(`/ws${path}`, body);

export const ACCESS_VIEWS: [string, string][] = [["inventory", "Account inventory"], ["requests", "Access requests"], ["reviews", "Access reviews"]];
/** UI gate only. The source had no per-action gate beyond module access (access: super, admin, owner, employee); deny by default otherwise. */
/** Only admin and owner decide requests and reviews (deny by default). Employees, analysts etc. can only REQUEST access. UI gate; the service asserts again. */
export const canActOnAccess = (roleId: string) => hasRole(roleId, "admin", "owner");
export const KIND_ACCESS = "access-request";
export const LEVELS = ["Read", "Write", "Admin"];
const todayStamp = () => new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
/** Seed requests carry no requester field: the beneficiary raised them. */
export const requesterOf = (r: any): string => String(r.requester || r.user);
export const isPrivilegedRequest = (r: any): boolean => isPrivilegedLevel(r.level) || isPrivilegedSystem(r.system);

/** Creates an access request (employees may request, for themselves only). Prototype: accDoRequest. */
export function createRequest(input: { system: string; level: string; user: string; reason: string }) {
  return viaApi<{ id: string; system: string }>(() => {
    const me = getActor();
    const system = clampText(input.system, 100); if (!system) throw new SodError("System is required.");
    if (!LEVELS.includes(input.level)) throw new SodError("Choose a valid access level.");
    const user = clampText(input.user, 100) || me.name;
    if (hasRole(me.roleId, "employee") && !isSamePerson(user, me.name)) throw new SodError("Employees can only request access for themselves.");
    const reason = clampText(input.reason, 300);
    if (isPrivilegedLevel(input.level) && reason.length < 10) throw new SodError("Admin-level access needs a reason of at least 10 characters.");
    const id = "AR-" + String(ACCESS_REQUESTS.length + 3).padStart(2, "0");
    ACCESS_REQUESTS.unshift({ id, user, requester: me.name, system, level: input.level, reason: reason || "—", status: "Pending" });
    wsLog("access.requested", `${system} (${input.level}) for ${user}`, "Access"); bumpData();
    return { id, system };
  }, () => post<{ id: string; system: string }>("/access/requests", input));
}

/** Reason the signed-in person cannot decide this request (null = may). For disabling buttons. */
export function whyCannotDecideRequest(r: any): string | null {
  if (!canActOnAccess(getActor().roleId)) return "Only admins and owners decide access requests.";
  const s = sodReasonLocal(r); if (s) return s;
  if (r.stage === "second" && r.firstApprover && isSamePerson(r.firstApprover, getActor().name)) return "Segregation of duties: a different admin or owner must give the second approval.";
  return null;
}
const sodReasonLocal = (r: any): string | null =>
  isMe(requesterOf(r)) ? "Segregation of duties: you cannot decide a request you raised."
  : isMe(r.user) ? "Segregation of duties: you cannot decide a request for your own access." : null;

const grantFor = (r: any) => {
  if (DATA.access.some((g) => isSamePerson(g.user, r.user) && g.system === r.system && g.level === r.level)) return;
  DATA.access.unshift({ user: r.user, system: r.system, level: r.level, status: "Active", granted: todayStamp() });
  wsLog("access.granted", `${r.user} → ${r.system} (${r.level}); request ${r.id}`, "Access");
};
registerKind(KIND_ACCESS, {
  describe: (a) => `${a.payload.system} (${a.payload.level})`,
  apply: (a) => {
    const r = ACCESS_REQUESTS.find((x) => x.id === a.payload.reqId); if (!r) return;
    r.status = "Approved"; r.stage = ""; r.decidedBy = a.approvals.map((x) => x.by).concat([String(a.payload.firstApprover)]).join(", "); grantFor(r);
    wsLog("access.request.approved", `${r.user} → ${r.system}; two approvers: ${r.decidedBy}`, "Access");
  },
  closed: (a) => {
    const r = ACCESS_REQUESTS.find((x) => x.id === a.payload.reqId); if (!r) return;
    r.status = a.status === "Expired" ? "Expired" : "Denied"; r.stage = ""; r.decisionReason = a.decidedReason || a.status;
    wsLog("access.request." + (a.status === "Expired" ? "expired" : "denied"), `${r.user} → ${r.system}${a.decidedReason ? "; reason: " + a.decidedReason : ""}`, "Access");
  },
});

export type AccessDecision = "Approved" | "Denied";
/** Prototype: accDecide. Admin/owner only; approver is neither the requester nor the beneficiary; Admin-level or privileged systems need TWO approvers (approvals engine). */
export function decideRequest(id: string, d: AccessDecision, reason: string) {
  return viaApi<{ user: string; system: string; pending: boolean } | null>(() => {
    settle();
    assertRole("decide access requests", "admin", "owner");
    if (d !== "Approved" && d !== "Denied") return null;
    const r = ACCESS_REQUESTS.find((x) => x.id === id);
    if (!r || r.status !== "Pending") return null;
    assertNotSelf("you cannot decide a request you raised", requesterOf(r));
    assertNotSelf("you cannot decide a request for your own access", r.user);
    const why = clampText(reason, 300); if (why.length < 10) throw new SodError("Give a reason of at least 10 characters.");
    const me = getActor().name;
    if (r.approvalId) { // second stage of a two-approver request
      if (r.firstApprover && isSamePerson(r.firstApprover, me)) throw new SodError("Segregation of duties: a different admin or owner must give the second approval.");
      decideApproval(r.approvalId, d === "Approved", why);
      return { user: r.user as string, system: r.system as string, pending: false };
    }
    if (d === "Denied") {
      r.status = "Denied"; r.decidedBy = me; r.decisionReason = why;
      wsLog("access.request.denied", `${r.user} → ${r.system}; by ${me}; reason: ${why}`, "Access"); bumpData();
      return { user: r.user as string, system: r.system as string, pending: false };
    }
    if (!isPrivilegedRequest(r)) {
      r.status = "Approved"; r.decidedBy = me; r.decisionReason = why; grantFor(r);
      wsLog("access.request.approved", `${r.user} → ${r.system}; by ${me}; reason: ${why}`, "Access"); bumpData();
      return { user: r.user as string, system: r.system as string, pending: false };
    }
    // privileged: this is approver 1; a different admin/owner must approve as approver 2
    if (!eligibleApprovers(["admin", "owner"], requesterOf(r), r.user).length) throw new SodError("No eligible second approver (not you, not the requester, not the beneficiary).");
    const ap = requestApproval({ kind: KIND_ACCESS, title: `Second approval: ${r.user} → ${r.system} (${r.level})`, subject: r.user, needs: 1, approverRoles: ["admin", "owner"], forbid: [requesterOf(r), r.user], ttlHours: 72, domain: "ws",
      payload: { reqId: r.id, system: r.system, level: r.level, firstApprover: me, firstReason: why } });
    r.approvalId = ap.id; r.stage = "second"; r.firstApprover = me;
    wsLog("access.request.approval.first", `${r.user} → ${r.system} (${r.level}); first approver ${me}; reason: ${why}; second approver required (${ap.id})`, "Access"); bumpData();
    return { user: r.user as string, system: r.system as string, pending: true };
  }, async () => {
    const r = ACCESS_REQUESTS.find((x) => x.id === id);
    if (r?.stage === "second" && r.approvalId) { // the second approver decides the four-eyes request itself
      await wsPost(`/ws/approvals/${encodeURIComponent(r.approvalId)}/${d === "Approved" ? "approve" : "reject"}`, { reason });
      return { user: r.user, system: r.system, pending: false };
    }
    const out = await post<{ user: string; system: string; stage: string }>(`/access/requests/${encodeURIComponent(id)}/decision`, { decision: d, reason });
    return { user: out.user, system: out.system, pending: out.stage === "second" };
  });
}

const SEED_REVIEW_CREATOR = "Casey Morgan";
/** Seed reviews have no creator on record; they are attributed to a fixed demo creator so the creator/completer rule can be shown. */
export const reviewCreator = (rv: any): string => String(rv.createdBy || SEED_REVIEW_CREATOR);
export const reviewHasPrivileged = (rv: any): boolean => rv.accounts.some((a: any) => isPrivilegedLevel(a.level));

/** Prototype: accDoCreateReview. Freezes the account scope from DATA.access at creation time. Admin/owner only. */
export function createReview(input: { name: string; scope: string }) {
  return viaApi<{ id: string }>(() => {
    assertRole("create an access review", "admin", "owner");
    let id = "";
    do { id = "REV-" + Math.floor(100 + Math.random() * 900); } while (ACCESS_REVIEWS.some((x) => x.id === id)); // demo id only
    ACCESS_REVIEWS.unshift({ id, name: input.name, scope: input.scope || "All accounts", status: "Open", createdBy: getActor().name, accounts: DATA.access.map((a) => ({ user: a.user, system: a.system, level: a.level, decision: "" })) });
    wsLog("access.review.created", `${input.name}; by ${getActor().name}`, "Access"); bumpData();
    return { id };
  }, () => post<{ id: string }>("/access/reviews", input));
}

export type ReviewDecision = "Keep" | "Revoke";
/** Reason the signed-in person cannot decide this account row (null = may). */
export function whyCannotReview(a: any): string | null {
  if (!canActOnAccess(getActor().roleId)) return "Only admins and owners review access.";
  return isMe(a.user) ? "Segregation of duties: you cannot decide on your own access." : null;
}
/** Prototype: accReviewDecide. Reviewer is never the account holder under review. */
export function decideReviewAccount(reviewId: string, index: number, d: ReviewDecision) {
  return viaApi<{ user: string } | null>(() => {
    assertRole("decide an access review item", "admin", "owner");
    if (d !== "Keep" && d !== "Revoke") return null;
    const rv = ACCESS_REVIEWS.find((x) => x.id === reviewId);
    const a = rv && rv.status === "Open" ? rv.accounts[index] : null;
    if (!a || a.decision) return null;
    assertNotSelf("you cannot decide on your own access", a.user);
    a.decision = d; a.decidedBy = getActor().name;
    wsLog("access.review.decision", `${a.user} → ${a.system}: ${d}; reviewer ${a.decidedBy}; review ${reviewId}`, "Access"); bumpData();
    return { user: a.user as string };
  }, () => post<{ user: string } | null>(`/access/reviews/${encodeURIComponent(reviewId)}/accounts/${index}/decision`, { decision: d }));
}

/** Prototype: accCompleteReview. Open review, every account decided; a review with privileged accounts is completed by someone other than its creator.
 *  Revoke decisions are applied now: the grant is set to Revoked and removed from DATA.access. */
export function completeReview(reviewId: string) {
  return viaApi<{ name: string; revocations: number; revoked: number } | null>(() => {
    assertRole("complete an access review", "admin", "owner");
    const rv = ACCESS_REVIEWS.find((x) => x.id === reviewId);
    if (!rv || rv.status !== "Open" || !rv.accounts.every((a: any) => a.decision)) return null;
    if (reviewHasPrivileged(rv)) assertNotSelf("a review with privileged accounts must be completed by someone other than its creator", reviewCreator(rv));
    rv.status = "Complete"; rv.completedBy = getActor().name;
    let revoked = 0; let manual = 0;
    rv.accounts.forEach((a: any) => {
      if (a.decision !== "Revoke") return;
      const i = DATA.access.findIndex((g) => isSamePerson(g.user, a.user) && String(g.system).toLowerCase() === String(a.system).toLowerCase() && g.level === a.level);
      if (i >= 0) {
        DATA.access[i].status = "Revoked"; DATA.access.splice(i, 1); a.revoked = true; revoked++;
        wsLog("access.revoked", `${a.user} → ${a.system} (${a.level}); access review ${rv.id}; follow-up: confirm removal in the source system`, "Access");
      } else { manual++; wsLog("access.revoke.unmatched", `${a.user} → ${a.system} (${a.level}); no matching grant in the inventory, manual revocation task; review ${rv.id}`, "Access"); }
    });
    wsLog("access.review.completed", `${rv.name}; ${rv.accounts.filter((a: any) => a.decision === "Revoke").length} revocation(s), ${revoked} applied${manual ? ", " + manual + " need manual follow-up" : ""}; completed by ${rv.completedBy}`, "Access");
    bumpData();
    return { name: rv.name as string, revocations: rv.accounts.filter((a: any) => a.decision === "Revoke").length, revoked };
  }, () => post<{ name: string; revocations: number; revoked: number } | null>(`/access/reviews/${encodeURIComponent(reviewId)}/complete`, {}));
}
