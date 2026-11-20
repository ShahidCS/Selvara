/* Shared workspace-module rules (production programme; decision D3 extended to every module). Pure functions with no imports from the browser
 * state: the server calls them to enforce, the demonstration's services call them to explain (disabled buttons) and to refuse. One rule, two
 * callers, no drift. The caller decides who the person is: the server by user id, the demonstration by name. Messages are the ones people see.
 * Contract: docs/security/SOD_MATRIX.md; inventory: docs/architecture/inventory/. */

/** "Not permitted: <what> requires admin or owner." when `role` (a base role) is not one of `bases`. */
export const roleBlock = (role: string, what: string, ...bases: string[]): string | null =>
  bases.includes(role) ? null : `Not permitted: ${what} requires ${bases.join(" or ")}.`;
/** A trimmed text of at least `min` characters, or the message. */
export const textBlock = (v: unknown, min: number, what = "A reason"): string | null =>
  String(v ?? "").trim().length >= min ? null : `${what} of at least ${min} characters is required.`;
export const isoDayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/* ---------- frameworks ---------- */
/** Framework administration (scope, snooze, add, requirement mapping and applicability): company admin or owner. */
export const fwAdminBlock = (role: string): string | null => (["admin", "owner", "super"].includes(role) ? null : "Only a company admin or control owner can change requirement mappings or applicability.");
export const FW_NA_MIN = 15;
export const fwNaBlock = (reason: string): string | null =>
  reason.trim().length >= FW_NA_MIN ? null : "Justify why it does not apply (at least 15 characters); auditors review this.";
export const FW_KINDS = ["Standard", "Framework", "Regulation"] as const;
export const FW_MAX_LINES = 300;
/** The id a new framework gets: the template's id, or custom- and a slug of its short name. */
export const fwIdFor = (short: string, template?: string | null) => template || "custom-" + short.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export function fwAddBlock(f: { short: string; exists: boolean; lines: string[] }): string | null {
  if (!f.short.trim()) return "Give the framework a short name.";
  if (f.exists) return "That framework is already in the library.";
  if (!f.lines.length) return "Add at least one requirement, one per line.";
  if (f.lines.length > FW_MAX_LINES) return `At most ${FW_MAX_LINES} requirements.`;
  return null;
}

/* ---------- controls and tests ---------- */
export const CONTROL_STATUSES = ["Pass", "Needs evidence", "Fail"] as const;
export const TEST_RESULTS = ["Pass", "Fail", "Needs data"] as const;
export const manageControlsBlock = (role: string) => roleBlock(role, "changing controls", "admin", "owner");
export const runTestsBlock = (role: string) => roleBlock(role, "running tests", "admin", "owner", "analyst");
export const ticketBlock = (role: string) => roleBlock(role, "creating tickets", "admin", "owner", "analyst");
export const attestBlock = (role: string, isOwner: boolean, owner: string) =>
  roleBlock(role, "attesting a control", "admin", "owner") || (isOwner ? null : `Only the control owner (${owner}) can attest.`);
/** Controls with linked automated tests take their status from the tests; a manual override is blocked (use an exception instead). */
export function setStatusBlock(role: string, isOwner: boolean, owner: string, linkedTests: number): string | null {
  if (linkedTests) return `Status follows ${linkedTests} automated test${linkedTests > 1 ? "s" : ""}; it cannot be overridden manually. Request an exception with a compensating control instead.`;
  return roleBlock(role, "changing control status", "admin", "owner") || (isOwner ? null : `Only the control owner (${owner}) can change the status.`);
}
export const requestExceptionBlock = (role: string) => roleBlock(role, "requesting an exception", "admin", "owner");
export const EXCEPTION_TTL_H = 24 * 14;
export const EXCEPTION_MAX_DAYS = 366;
/** The request's own details: reason, compensating control, an expiry in the future and at most 12 months away. */
export function exceptionInputBlock(x: { reason: string; compensating: string; expires: string }, nowMs: number): string | null {
  return textBlock(x.reason, 10) || textBlock(x.compensating, 20, "A compensating-control note")
    || (!/^\d{4}-\d{2}-\d{2}$/.test(x.expires) || Number.isNaN(Date.parse(x.expires + "T00:00:00Z")) ? "Enter a valid expiry date." : null)
    || (x.expires <= isoDayOf(nowMs) ? "The expiry must be in the future." : null)
    || (Date.parse(x.expires + "T00:00:00Z") > nowMs + EXCEPTION_MAX_DAYS * 86400_000 ? "An exception can last at most 12 months." : null);
}
export type ExceptionState = "Pending" | "Active" | "Expired" | "Rejected";
/** An exception's state from its request's status and its expiry date. */
export function exceptionStateOf(approvalStatus: string | null | undefined, expires: string, today: string): ExceptionState {
  if (!approvalStatus || approvalStatus === "Rejected" || approvalStatus === "Withdrawn") return "Rejected";
  if (approvalStatus === "Pending") return expires < today ? "Expired" : "Pending";
  if (approvalStatus === "Expired") return "Expired";
  return expires < today ? "Expired" : "Active";
}
export function decideExceptionBlock(state: ExceptionState, role: string, isRequesterOrOwner: boolean): string | null {
  if (state !== "Pending") return "This request is no longer pending.";
  return roleBlock(role, "approving an exception", "admin", "owner") || (isRequesterOrOwner ? "Segregation of duties: the requester and the control owner cannot approve the exception." : null);
}
/** A control's status from its linked tests: any failure fails it, all passing passes it, otherwise it needs evidence. */
export const statusFromTests = (results: string[]): string | null =>
  !results.length ? null : results.some((r) => r === "Fail") ? "Fail" : results.every((r) => r === "Pass") ? "Pass" : "Needs evidence";

/* ---------- evidence ---------- */
export const EVIDENCE_TYPES = ["Screenshot", "PDF", "Report", "Record", "CSV"] as const;
export const evidenceWriteBlock = (role: string) => roleBlock(role, "changing evidence", "admin", "owner", "analyst");
/** Accepting or rejecting: not once accepted, a writer, and never the collector or anyone who versioned or attached to it. */
export function evidenceReviewBlock(status: string, role: string, isContributor: boolean): string | null {
  if (status === "Accepted") return "Already accepted.";
  return roleBlock(role, "reviewing evidence", "admin", "owner", "analyst") || (isContributor ? "Segregation of duties: the collector or a contributor cannot accept their own evidence." : null);
}
export const EVIDENCE_DELETE_TTL_H = 72;
export const evidenceRequestDeleteBlock = (role: string, pending: boolean) =>
  roleBlock(role, "requesting evidence deletion", "admin") || (pending ? "A deletion request is already pending." : null);
export function evidenceDecideDeleteBlock(pending: boolean, role: string, isRequester: boolean): string | null {
  if (!pending) return "No pending deletion request.";
  return roleBlock(role, "approving evidence deletion", "admin") || (isRequester ? "Segregation of duties: the requesting admin cannot approve the deletion." : null);
}
/** Evidence files: what may be stored and how big (the upload route enforces it; Vercel caps a request at 4.5 MB). */
export const EVIDENCE_FILE_TYPES: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", txt: "text/plain", csv: "text/csv", md: "text/markdown", json: "application/json",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
export const EVIDENCE_FILE_MAX = 4 * 1024 * 1024;
export const EVIDENCE_FILES_PER_ITEM = 20;
