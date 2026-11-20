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

/* ---------- policies (group 2) ---------- */
export const POLICY_CYCLES = [6, 12, 24] as const;
export const POLICY_EMERGENCY_DAYS = 5;
export const POLICY_EFFECTIVE_MAX_DAYS = 90;
/** Who may edit content: an admin or owner who owns the policy, and only while the working version is a draft. */
export function policyEditBlock(role: string, isOwner: boolean, owner: string, workStatus: string | null): string | null {
  return roleBlock(role, "editing a policy", "admin", "owner")
    || (isOwner ? null : `Only the policy owner (${owner}) can edit content. An admin can reassign ownership.`)
    || (workStatus && workStatus !== "Draft" ? `Content is locked while the version is ${workStatus.toLowerCase()}.` : null);
}
export function policySubmitBlock(role: string, isOwner: boolean, owner: string, workStatus: string | null): string | null {
  if (!workStatus) return "There is no draft to submit.";
  if (workStatus !== "Draft") return `The version is already ${workStatus.toLowerCase()}.`;
  return roleBlock(role, "submitting a policy", "admin", "owner") || (isOwner ? null : `Only the policy owner (${owner}) can submit it.`);
}
/** The named approver: an admin or owner who neither wrote the version nor submitted it (production also excludes the owner and the submitter). */
export const policyApproverBlock = (isEditor: boolean, isOwnerOrSubmitter: boolean): string | null =>
  isEditor ? "Segregation of duties: the approver cannot be the author or a last editor."
    : isOwnerOrSubmitter ? "Segregation of duties: the approver cannot be the policy owner or the person who submitted it." : null;
export function policyApproveBlock(p: { role: string; workStatus: string | null; approver: string | null; isEditor: boolean; actsAsApprover: boolean }): string | null {
  if (p.workStatus !== "In review") return "Only a version in review can be approved.";
  return roleBlock(p.role, "approving a policy", "admin", "owner") || (p.approver ? null : "No approver has been named yet.")
    || (p.isEditor ? "Segregation of duties: the author or a last editor cannot approve their own policy." : null)
    || (p.actsAsApprover ? null : `Only the named approver (${p.approver}) can do this.`);
}
export function policyPublishBlock(p: { role: string; workStatus: string | null; approver: string | null; isEditor: boolean; actsAsApprover: boolean; effective?: string; today: string }): string | null {
  if (p.workStatus !== "Approved") return "Only an approved version can be published.";
  return roleBlock(p.role, "publishing a policy", "admin", "owner")
    || (p.isEditor ? "Segregation of duties: the author or a last editor cannot publish their own policy." : null)
    || (p.actsAsApprover ? null : `Only the named approver (${p.approver}) can publish.`)
    || (p.effective && p.effective > p.today ? `The effective date (${p.effective}) has not been reached.` : null);
}
export function policyEmergencyBlock(role: string, workStatus: string | null): string | null {
  if (workStatus !== "Draft" && workStatus !== "In review") return "An emergency change needs a draft or in-review version.";
  return roleBlock(role, "an emergency change", "admin");
}
export function policyDecideExceptionBlock(status: string, role: string, isPublisherOrAuthor: boolean): string | null {
  if (status !== "Pending") return `The exception is already ${status.toLowerCase()}.`;
  return roleBlock(role, "retrospective approval", "admin", "owner") || (isPublisherOrAuthor ? "Segregation of duties: the person who published the emergency change or its authors cannot approve it." : null);
}
export function policyEffectiveBlock(eff: string, nowMs: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eff) || Number.isNaN(Date.parse(eff + "T00:00:00Z"))) return "Enter a valid effective date.";
  if (eff < isoDayOf(nowMs)) return "The effective date cannot be in the past.";
  if (Date.parse(eff + "T00:00:00Z") > nowMs + POLICY_EFFECTIVE_MAX_DAYS * 86400_000) return "The effective date can be at most 90 days ahead.";
  return null;
}
export const cleanVer = (v: unknown) => { const m = /^(\d+)\.(\d+)/.exec(String(v ?? "")); return m ? `${m[1]}.${m[2]}` : "0.1"; };
export const bumpMinor = (v: string) => { const m = /^(\d+)\.(\d+)$/.exec(cleanVer(v)) as RegExpExecArray; return `${m[1]}.${Number(m[2]) + 1}`; };
/** `days` business days after `from` (weekends skipped), as YYYY-MM-DD. */
export function addBusinessDaysIso(fromMs: number, days: number): string {
  const d = new Date(fromMs); let n = 0;
  while (n < days) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) n++; }
  return d.toISOString().slice(0, 10);
}
/** `months` months after the ISO day (clamped to the month's last day). */
export function addMonthsIso(iso: string, months: number): string {
  const [y, m, dd] = iso.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(dd, last)); return t.toISOString().slice(0, 10);
}

/* ---------- delegation of a named approver slot (group 2; SOD_MATRIX section 9) ---------- */
export const DELEGATION_MAX_DAYS = 14;
export function delegationBlock(d: { role: string; toRole: string | null; self: boolean; days: number; reason: string; live: boolean; loop: boolean }): string | null {
  return roleBlock(d.role, "delegating approvals", "admin", "owner")
    || (!d.toRole || !["admin", "owner"].includes(d.toRole) ? "Choose another admin or owner." : null)
    || (d.self ? "Segregation of duties: you cannot delegate to yourself." : null)
    || (!Number.isInteger(d.days) || d.days < 1 || d.days > DELEGATION_MAX_DAYS ? `Choose 1 to ${DELEGATION_MAX_DAYS} days.` : null)
    || (d.reason.trim().length < 10 ? "Give a reason of at least 10 characters." : null)
    || (d.live ? "You already have an active delegation. End it before starting another." : null)
    || (d.loop ? "That person has delegated to you. End that delegation first." : null);
}

/* ---------- people (group 2) ---------- */
export const MFA_RESET_REASONS = ["Lost authenticator device", "New device enrolment", "Suspected compromise, rotate", "Admin left and returned"] as const;
export const MFA_RESET_TTL_H = 24;
export const OFFBOARD_TTL_H = 72;
export const TICKET_REF = /^[A-Z]{2,6}-\d{1,6}$/;
export function mfaResetFieldsBlock(f: { checks: boolean[]; reason: string; details: string; ticket: string }): string | null {
  if (f.checks.length !== 3 || !f.checks.every(Boolean)) return "Confirm all three identity checks before submitting.";
  if (!(MFA_RESET_REASONS as readonly string[]).includes(f.reason)) return "Choose a valid reason.";
  if (f.details.trim().length < 10) return "Describe the reason in at least 10 characters.";
  if (!TICKET_REF.test(f.ticket.trim())) return "Enter a ticket reference like SEC-1234.";
  return null;
}

/* ---------- access (group 2) ---------- */
export const ACCESS_LEVELS = ["Read", "Write", "Admin"] as const;
export const ACCESS_SECOND_TTL_H = 72;
export const isPrivilegedLevel = (level: string) => /^(super\s*admin|admin)/i.test(level);
export const isPrivilegedSystem = (system: string) => /identity admin|iam|production|privileged|vault|root|domain admin/i.test(system);
export function accessRequestBlock(r: { system: string; level: string; reason: string; forOther: boolean; employee: boolean }): string | null {
  if (!r.system.trim()) return "System is required.";
  if (!(ACCESS_LEVELS as readonly string[]).includes(r.level)) return "Choose a valid access level.";
  if (r.employee && r.forOther) return "Employees can only request access for themselves.";
  if (r.level === "Admin" && r.reason.trim().length < 10) return "Admin-level access needs a reason of at least 10 characters.";
  return null;
}
export function accessDecideBlock(d: { role: string; isRequester: boolean; isBeneficiary: boolean; isFirstApprover: boolean }): string | null {
  return (["admin", "owner"].includes(d.role) ? null : "Only admins and owners decide access requests.")
    || (d.isRequester ? "Segregation of duties: you cannot decide a request you raised." : null)
    || (d.isBeneficiary ? "Segregation of duties: you cannot decide a request for your own access." : null)
    || (d.isFirstApprover ? "Segregation of duties: a different admin or owner must give the second approval." : null);
}

/* ---------- risk (group 3) ---------- */
export const RISK_BOARD_THRESHOLD = 15;
export const RISK_APPETITE_SCORE = 11;
export const RISK_CATEGORIES = ["Technology", "People", "Third party", "AI", "Operational", "Compliance", "AML"] as const;
export const RISK_TREATMENTS = ["Mitigate", "Transfer", "Accept", "Avoid"] as const;
export const RISK_SCORES = ["l", "i", "cl", "ci", "rl", "ri"] as const;
export const RISK_BOARD_TTL_H = 72;
export const RISK_IMPORT_TTL_H = 72;
export const RISK_IMPORT_MAX_ROWS = 5000;
/** Category -> owning team, and the lowest authority that may accept each residual band (ISO/IEC 27005 ladder). */
export const RISK_CAT_TEAM: Record<string, string> = { Technology: "Engineering", People: "Security", "Third party": "Vendor risk", AI: "Data science", Operational: "Operations", Compliance: "Compliance", AML: "Financial crime" };
export const RISK_ACCEPT_AUTH: Record<string, string> = { Low: "Risk owner", Medium: "Department head", High: "CISO", Extreme: "Board / CEO" };
export const RISK_ACCEPT_RANK: Record<string, number> = { "Risk owner": 0, "Department head": 1, CISO: 2, "Board / CEO": 3 };
/** Rating band of a 5x5 score: Low 1-5, Medium 6-10, High 11-19, Extreme 20-25. */
export const riskBand = (score: number): "Low" | "Medium" | "High" | "Extreme" => (score >= 20 ? "Extreme" : score >= 11 ? "High" : score >= 6 ? "Medium" : "Low");
export const riskScore = (v: unknown) => Math.max(1, Math.min(5, Math.trunc(Number(v)) || 1));
export const riskEditBlock = (role: string) => roleBlock(role, "changing risks", "admin", "owner", "analyst");
export const riskApproveRoleBlock = (role: string) => roleBlock(role, "approving risks", "admin");
/** Submitting for approval: from a draft (or after changes were requested), with at least one mapped control. */
export function riskSubmitBlock(review: string, mapped: number): string | null {
  if (review !== "Draft" && review !== "Changes requested") return review === "Submitted" ? "The risk is already awaiting approval." : "The risk is already approved. Change it first.";
  return mapped ? null : "Map at least one control before submitting";
}
/** Approving or requesting changes: only a submitted risk, by an admin who neither last edited nor submitted it (approve). */
export function riskDecideBlock(p: { role: string; review: string; isEditorOrSubmitter: boolean; approve: boolean }): string | null {
  if (p.review !== "Submitted") return "Only a risk awaiting approval can be decided.";
  return riskApproveRoleBlock(p.role) || (p.approve && p.isEditorOrSubmitter ? "Segregation of duties: you edited or submitted this risk, so a different person must approve it." : null);
}
/** Ladder acceptance (residual at most 15): the chosen authority must rank at least the residual band's authority; Board / CEO is never chosen here. */
export function riskLadderBlock(by: string, residual: number): string | null {
  if (!(by in RISK_ACCEPT_RANK)) return "Choose an accepting authority.";
  if (by === "Board / CEO") return `Board / CEO acceptance applies only above ${RISK_BOARD_THRESHOLD} and needs Board approval evidence.`;
  const need = RISK_ACCEPT_AUTH[riskBand(residual)];
  return RISK_ACCEPT_RANK[by] < RISK_ACCEPT_RANK[need] ? `Residual rating needs at least ${need} to accept.` : null;
}
export const riskAcceptSodBlock = (isOwnerEditorOrSubmitter: boolean) =>
  isOwnerEditorOrSubmitter ? "Segregation of duties: you own, edited or submitted this risk, so a different person must record its acceptance." : null;
/** Closing: no open treatment actions; never the last editor; never the owner when the risk has actions. */
export function riskCloseBlock(p: { openActions: number; isLastEditor: boolean; isOwner: boolean; hasActions: boolean }): string | null {
  if (p.openActions) return "Close or cancel the open actions first.";
  if (p.isLastEditor) return "Segregation of duties: you last edited this risk, so a different person must close it.";
  if (p.hasActions && p.isOwner) return "Segregation of duties: you own this risk, so a different person must close it.";
  return null;
}

/* ---------- issues (group 3) ---------- */
export const ISSUE_SEVERITIES = ["Critical", "High", "Medium", "Low"] as const;
export const ISSUE_STATES = ["Open", "In progress", "Closed"] as const;
export const ISSUE_CLOSE_TTL_H = 24 * 14;
export const isHighSeverity = (sev: unknown) => sev === "High" || sev === "Critical";
export const issueWriteBlock = (role: string) => roleBlock(role, "changing issues", "admin", "owner", "analyst");
export const issueCoreBlock = (role: string) => roleBlock(role, "changing owner, due date or severity", "admin", "owner");
/** "Overdue 3d", "Due today" or "Due 5d" for a due date (YYYY-MM-DD) on a given day: the text every screen reads. */
export function issueDueText(due: string, today: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return due || "";
  const d = Math.round((Date.parse(due + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86400_000);
  return d < 0 ? `Overdue ${-d}d` : d === 0 ? "Due today" : `Due ${d}d`;
}
export function issueDeleteBlock(p: { sev: string; status: string; referenced: boolean; role: string }): string | null {
  if (isHighSeverity(p.sev) && p.status !== "Closed") return "High/Critical issues cannot be deleted; close them through verification.";
  if (p.referenced) return "An audit finding references this issue.";
  return roleBlock(p.role, "deleting an issue", "admin", "owner");
}

/* ---------- reports (group 3) ---------- */
export const REPORT_FREQS = ["Weekly", "Monthly", "Quarterly", "Bi-annually", "Yearly", "Custom", "On demand"] as const;
export const REPORT_CATALOGUE = [
  { name: "Executive security posture", cat: "Executive", updated: "Monthly" },
  { name: "ISO 27001 Statement of Applicability", cat: "Audit", updated: "On demand" },
  { name: "Risk register export", cat: "Risk", updated: "On demand" },
  { name: "Access recertification pack", cat: "Audit", updated: "Quarterly" },
  { name: "Vendor risk summary", cat: "Third party", updated: "Monthly" },
] as const;
export const REPORT_INTERNAL_GROUPS = ["board", "exec team", "executive team", "exec", "leadership", "management", "risk committee", "audit committee", "security team", "compliance team", "all staff", "employees", "ciso", "cfo", "ceo"];
export const REPORT_DIST_TTL_H = 24;
export const reportRoleBlock = (role: string) => (["admin", "owner"].includes(role) ? null : "Only admin or owner can schedule or generate reports.");
/** Recipients outside the company: anything that is not a known internal group or an address on one of the company's own email domains. */
export function externalRecipientsOf(recip: string, ownDomains: Set<string>): string[] {
  return String(recip || "").split(/[,;\n]/).map((t) => t.trim()).filter((t) => t && t !== "—").filter((t) => {
    if (REPORT_INTERNAL_GROUPS.includes(t.toLowerCase())) return false;
    const at = t.lastIndexOf("@"); return !(at > 0 && ownDomains.has(t.slice(at + 1).toLowerCase()));
  });
}

/** Four-eyes kinds the server owns in production: the browser's engine shows them but never decides or applies them there. */
export const SERVER_KINDS = ["control.exception", "evidence.delete", "policy.emergency", "mfa-reset-member", "offboard", "access-request", "risk.board-evidence", "risk.import", "issue.close", "report.distribution"];
