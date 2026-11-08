/* Access API stubs (requests + recertification reviews). Mock mode mutates the in-memory queues the prototype used and returns what the
 * caller needs for wsLog / toast; the caller then does wsLog / toast / bumpData.
 * The real API MUST enforce who may approve/deny (not the requester), who may review, and write the audit entry itself.
 * Creating a request lives in components/modules/work/RequestModals.tsx (AccessRequestForm, shared with My Work). */
import { DATA } from "@/lib/data";
import { modAllowed } from "@/lib/rbac";
import { ACCESS_REQUESTS, ACCESS_REVIEWS } from "@/lib/requests";
import { apiFetch, viaApi } from "./http";

/* eslint-disable @typescript-eslint/no-explicit-any */
const post = <T,>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });

export const ACCESS_VIEWS: [string, string][] = [["inventory", "Account inventory"], ["requests", "Access requests"], ["reviews", "Access reviews"]];
/** UI gate only. The source had no per-action gate beyond module access (access: super, admin, owner, employee); deny by default otherwise. */
export const canActOnAccess = (roleId: string) => modAllowed(roleId, "ws", "access");

export type AccessDecision = "Approved" | "Denied";
/** Prototype: accDecide. Only a Pending request can be decided; returns null otherwise. */
export function decideRequest(id: string, d: AccessDecision) {
  return viaApi<{ user: string; system: string } | null>(() => {
    if (d !== "Approved" && d !== "Denied") return null;
    const r = ACCESS_REQUESTS.find((x) => x.id === id);
    if (!r || r.status !== "Pending") return null;
    r.status = d;
    return { user: r.user as string, system: r.system as string };
  }, () => post<{ user: string; system: string } | null>(`/access/requests/${encodeURIComponent(id)}/decision`, { decision: d }));
}

/** Prototype: accDoCreateReview. Freezes the account scope from DATA.access at creation time. */
export function createReview(input: { name: string; scope: string }) {
  return viaApi<{ id: string }>(() => {
    let id = "";
    do { id = "REV-" + Math.floor(100 + Math.random() * 900); } while (ACCESS_REVIEWS.some((x) => x.id === id)); // demo id only
    ACCESS_REVIEWS.unshift({ id, name: input.name, scope: input.scope || "All accounts", status: "Open", accounts: DATA.access.map((a) => ({ user: a.user, system: a.system, level: a.level, decision: "" })) });
    return { id };
  }, () => post<{ id: string }>("/access/reviews", input));
}

export type ReviewDecision = "Keep" | "Revoke";
/** Prototype: accReviewDecide. Only an open review and an undecided account can be decided. */
export function decideReviewAccount(reviewId: string, index: number, d: ReviewDecision) {
  return viaApi<{ user: string } | null>(() => {
    if (d !== "Keep" && d !== "Revoke") return null;
    const rv = ACCESS_REVIEWS.find((x) => x.id === reviewId);
    const a = rv && rv.status === "Open" ? rv.accounts[index] : null;
    if (!a || a.decision) return null;
    a.decision = d;
    return { user: a.user as string };
  }, () => post<{ user: string } | null>(`/access/reviews/${encodeURIComponent(reviewId)}/accounts/${index}/decision`, { decision: d }));
}

/** Prototype: accCompleteReview. Only an open review with every account decided can be completed. */
export function completeReview(reviewId: string) {
  return viaApi<{ name: string; revocations: number } | null>(() => {
    const rv = ACCESS_REVIEWS.find((x) => x.id === reviewId);
    if (!rv || rv.status !== "Open" || !rv.accounts.every((a: any) => a.decision)) return null;
    rv.status = "Complete";
    return { name: rv.name as string, revocations: rv.accounts.filter((a: any) => a.decision === "Revoke").length };
  }, () => post<{ name: string; revocations: number } | null>(`/access/reviews/${encodeURIComponent(reviewId)}/complete`, {}));
}
