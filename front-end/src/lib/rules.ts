/* Shared rules (decision D3, docs/architecture/BACKEND_FOUNDATION.md section 7). Pure functions with no imports and no state: the server calls
 * them to enforce, the browser calls them to explain (disabled buttons, the demonstration). One rule, two callers, no drift. People are compared
 * by a key the caller chooses: the server passes user ids, the demonstration passes name keys (`personKey` in sod.ts). An empty key never
 * matches anything. Contract: docs/security/SOD_MATRIX.md. */

/** Reasons for approvals, rejections and decisions: at least this many characters. */
export const REASON_MIN = 10;
/** Invitations and requests about a member's role stay open this long. */
export const INVITE_TTL_H = 72;
export const ROLE_REQUEST_TTL_H = 72;

/** Company roles a membership can hold (migration 0003, memberships.role). */
export const COMPANY_ROLES = ["admin", "owner", "analyst", "employee", "auditor", "vendor", "viewer"] as const;
export type CompanyRole = (typeof COMPANY_ROLES)[number];
export const isCompanyRole = (r: unknown): r is CompanyRole => typeof r === "string" && (COMPANY_ROLES as readonly string[]).includes(r);
/** Roles a company admin may grant or invite to (the Trust Center visitor is not a team role). */
export const ASSIGNABLE_ROLES = ["admin", "owner", "analyst", "employee", "auditor", "vendor"] as const;
export const isAssignableRole = (r: unknown): boolean => typeof r === "string" && (ASSIGNABLE_ROLES as readonly string[]).includes(r);
export const ROLE_LABEL: Record<string, string> = { admin: "Company Admin", owner: "Control, Policy and Risk Owner", analyst: "Risk Analyst", employee: "Employee", auditor: "External Auditor", vendor: "Vendor Contact", viewer: "Trust Center Visitor" };
/** Admin, owner and super roles need a second admin to be granted (SOD_MATRIX section 3, Team). Works for role ids and role names. */
export const isPrivilegedRole = (role: string): boolean => /admin|owner|super/i.test(role);

const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a === b;

export interface Decider { key: string; base: string }
export interface ApprovalFacts { status: string; expiresAt: number; approverRoles: string[]; requestedBy: string; forbid: string[]; votes: string[] }
/** Why this person cannot approve or reject this request, or null when they may. The requester, the people the request forbids (the subject,
 *  the owner) and anyone who already voted never can. */
export function approvalBlock(d: Decider, a: ApprovalFacts, now: number): string | null {
  if (a.status !== "Pending") return `Request is ${a.status.toLowerCase()}.`;
  if (a.expiresAt <= now) return "Request has expired.";
  if (!a.approverRoles.includes(d.base)) return `Only ${a.approverRoles.join(" / ")} can approve.`;
  if (same(d.key, a.requestedBy)) return "Segregation of duties: you cannot approve your own request.";
  if (a.forbid.some((f) => same(d.key, f))) return "Segregation of duties: you are the subject or owner of this request.";
  if (a.votes.some((v) => same(d.key, v))) return "You have already approved this request.";
  return null;
}
/** Only the requester withdraws, and only while the request is pending. */
export function withdrawBlock(d: Decider, a: Pick<ApprovalFacts, "status" | "requestedBy">): string | null {
  if (!same(d.key, a.requestedBy)) return "Only the requester can withdraw a request.";
  if (a.status !== "Pending") return `Request is ${a.status.toLowerCase()}.`;
  return null;
}
export const reasonBlock = (reason: string): string | null => (reason.trim().length < REASON_MIN ? `Give a reason of at least ${REASON_MIN} characters.` : null);

export interface RoleChange { self: boolean; from: string; to: string; valid: boolean; fromIsAdmin: boolean; toIsAdmin: boolean; admins: number; pending: boolean }
/** Why a company admin cannot change this member's role, or null. Nobody changes their own role; the last admin cannot be demoted; one open
 *  request per member. Whether a second admin must approve is `isPrivilegedRole(to)`. */
export function roleChangeBlock(c: RoleChange): string | null {
  if (c.self) return "Segregation of duties: nobody changes their own role.";
  if (!c.valid) return "Choose a valid role.";
  if (c.from === c.to) return "That is already their role.";
  if (c.fromIsAdmin && !c.toIsAdmin && c.admins <= 1) return "The last remaining admin cannot be demoted.";
  if (c.pending) return "A role change is already pending for this person.";
  return null;
}
/** A privileged grant or invitation needs another admin who could approve it: not the requester and not the person concerned. */
export const secondAdminBlock = (eligible: number): string | null => (eligible < 1 ? "No eligible second admin (not you, not the member) to approve this." : null);

/** Names people type (join requests, profiles): letters and the usual punctuation, never markup. */
export function nameBlock(name: string): string | null {
  const n = name.trim();
  if (n.length < 2) return "Enter your full name.";
  if (/[<>"`{}[\]\\]/.test(n) || /\p{Cc}/u.test(n)) return "Enter your name without symbols such as < > { } or quotes.";
  return null;
}

/* ---------- platform (Admin Console, slice 3a) ---------- */
export const ELEVATION_MAX_MIN = 60;
export const ELEVATION_REASON_MIN = 15;
/** A ticket reference such as SEC-1234 (also used in audit text, so only this shape is accepted). */
export const TICKET_RE = /^[A-Z]{2,6}-\d{1,6}$/;
/** Why an elevation cannot start with these details, or null. A reason, a ticket and at most 60 minutes. */
export function elevationBlock(e: { reason: string; ticket: string; minutes: number }): string | null {
  if (e.reason.trim().length < ELEVATION_REASON_MIN) return `Enter a reason of at least ${ELEVATION_REASON_MIN} characters.`;
  if (!TICKET_RE.test(e.ticket.trim())) return "Enter a ticket reference such as SEC-1234.";
  if (!Number.isInteger(e.minutes) || e.minutes < 1 || e.minutes > ELEVATION_MAX_MIN) return `Choose a duration of ${ELEVATION_MAX_MIN} minutes or less.`;
  return null;
}
/** A company code people type to join: 3 to 40 lower-case letters, digits and hyphens. */
export const COMPANY_CODE_RE = /^[a-z0-9][a-z0-9-]{2,39}$/;
export function companyBlock(c: { ref: string; name: string }): string | null {
  if (!COMPANY_CODE_RE.test(c.ref)) return "Company code: 3 to 40 lower-case letters, digits and hyphens, starting with a letter or digit.";
  const n = c.name.trim();
  if (n.length < 2 || n.length > 120) return "Company name: 2 to 120 characters.";
  if (/[<>"`{}[\]\\]/.test(n) || /\p{Cc}/u.test(n)) return "Enter the company name without symbols such as < > { } or quotes.";
  return null;
}

/* ---------- support access (slice 3b) ---------- */
/** A company's support grant lasts at most this long (migration 0007 checks it too). */
export const SUPPORT_GRANT_MAX_H = 8;
export const SUPPORT_GRANT_HOURS = [1, 4, 8] as const;
/** Why a company admin cannot give a support grant with these details, or null. */
export function supportGrantBlock(g: { reason: string; hours: number; live: boolean }): string | null {
  if (g.live) return "A support grant is already live. Revoke it first to give a new one.";
  if (!Number.isInteger(g.hours) || g.hours < 1 || g.hours > SUPPORT_GRANT_MAX_H) return `Choose a duration of ${SUPPORT_GRANT_MAX_H} hours or less.`;
  return reasonBlock(g.reason);
}
