/* Glue between the generic approvals engine (approvals.ts) and the platform-admin modules (Billing, Rates).
 * Dual control for admin finance / rate overrides: initiator and approver are different, BOTH are elevated super admins
 * (docs/security/SOD_MATRIX.md sections 2 and 3). Added file: the engine itself is not modified. UI-side demo; the real API enforces the same rules. */
import { approve, getApproval, reject, requestApproval, sweepExpired, whyCannotApprove, withdraw, approvals, type Approval } from "./approvals";
import { ELEVATE_TEXT, assertElevated, elevationLive } from "./elevation";
import { clampText } from "./security";
import { SodError, assertRole, getActor, isSamePerson } from "./sod";

export const APPROVAL_REASON_MIN = 10;

/** Pending admin-domain requests of one family ("billing." or "rates."), newest first. */
export function pendingAdminApprovals(prefix: string): Approval[] {
  const now = Date.now(); // pure (safe while rendering): expired requests are hidden here and swept/audited by sweepExpired() on the next action
  return approvals.get().list.filter((a) => a.domain === "admin" && a.status === "Pending" && a.expiresAt > now && a.kind.startsWith(prefix));
}
/** Creates the four-eyes request. Initiator must be an elevated super admin; one open request per subject. */
export function createAdminApproval(o: { kind: string; title: string; subject: string; payload: Record<string, unknown>; ticket: string }): Approval {
  assertRole("starting a change that needs a second approver", "super"); assertElevated();
  sweepExpired();
  if (approvals.get().list.some((a) => a.domain === "admin" && a.status === "Pending" && a.kind === o.kind && a.subject === o.subject)) throw new SodError("A request for this item is already waiting for approval.");
  return requestApproval({ kind: o.kind, title: o.title, subject: o.subject, payload: o.payload, approverRoles: ["super"], forbid: [getActor().name], needs: 1, ticket: o.ticket, domain: "admin" });
}
/** Reason a button must be disabled for the current person (null = may act): engine reasons first, then the elevation gate. */
export function approvalBlockReason(a: Approval): string | null {
  return whyCannotApprove(a) || (elevationLive() ? null : ELEVATE_TEXT);
}
export const isRequester = (a: Approval) => isSamePerson(getActor().name, a.requestedBy);

/** Approve or reject. `precheck` re-validates the target before approval; `apply` makes the change once the request is Approved. Reason >= 10 chars either way. */
export function decideAdminApproval(prefix: string, id: string, ok: boolean, reasonRaw: string, precheck: (a: Approval) => void, apply: (a: Approval) => void): Approval {
  assertRole("approving or rejecting", "super"); assertElevated();
  const a = getApproval(id); if (!a || a.domain !== "admin" || !a.kind.startsWith(prefix)) throw new SodError("Request not found.");
  const why = whyCannotApprove(a); if (why) throw new SodError(why);
  const reason = clampText(reasonRaw, 300);
  if (reason.length < APPROVAL_REASON_MIN) throw new SodError(`Give a reason of at least ${APPROVAL_REASON_MIN} characters.`);
  if (!ok) return reject(id, reason);
  precheck(a);
  const r = approve(id, reason);
  if (r.status === "Approved") apply(r);
  return r;
}
/** Requester withdraws their own pending request (not a rejection). */
export function withdrawAdminApproval(prefix: string, id: string): Approval {
  assertRole("withdrawing a request", "super"); assertElevated();
  const a = getApproval(id); if (!a || a.domain !== "admin" || !a.kind.startsWith(prefix)) throw new SodError("Request not found.");
  return withdraw(id);
}
