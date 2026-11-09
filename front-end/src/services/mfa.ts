/* MFA reset service (contract: docs/SOD_MATRIX.md sections 3 and 4). MFA reset is an account-takeover vector, so the rules live HERE, not only in the UI:
 * deny by default (requester support/super, elevated), three explicit identity checks, ticket reference, reason enum + text, a NAMED second approver
 * (not the requester, not the subject), four-eyes through the approvals engine, 24 h expiry with audited expiry, requester may only WITHDRAW,
 * and the effects (factors removed, sessions revoked, forced re-enrolment, recovery codes invalidated, notification) are applied only on final approval.
 * The real API MUST re-enforce all of it server-side with the actor taken from the authenticated session (never from the client), require step-up
 * authentication for requester and approver, verify identity out-of-band against contact data on file (never data supplied in the ticket), notify the
 * affected admin at ALL contact points and their other admins, rate-limit requests per admin/customer, and expire requests itself. */
import { MFA_REQUESTS, TENANT_ADMINS, CUSTOMERS } from "@/lib/platform";
import { adminLog } from "@/lib/adminAudit";
import { settle, registerKind, TICKET_RE } from "@/lib/approvalFlow";
import { approvals, requestApproval } from "@/lib/approvals";
import type { Approval } from "@/lib/approvals";
import { assertElevated } from "@/lib/elevation";
import { nowStamp } from "@/lib/format";
import { modAllowed, ROLES } from "@/lib/rbac";
import { clampText } from "@/lib/security";
import { assertNotSelf, assertRole, getActor, hasRole, isSamePerson, SodError, SOD } from "@/lib/sod";
import { appStore, bumpData } from "@/lib/store";

export const MFA_REASONS = ["Lost authenticator device", "New device enrolment", "Suspected compromise, rotate", "Admin left and returned"];
export const MFA_CHECKS: { key: "callback" | "sponsor" | "idCheck"; label: string }[] = [
  { key: "callback", label: "Out-of-band call-back to a phone number already on file (not one supplied in the request) confirmed the person's identity." },
  { key: "sponsor", label: "The person's manager or sponsor confirmed the request." },
  { key: "idCheck", label: "A government/employee ID or a live video check was verified." },
];
export const MFA_EFFECTS = [
  "All active sessions are revoked immediately.",
  "All enrolled factors are removed.",
  "The person is notified at all contact points on file.",
  "Re-enrolment is forced at the next sign-in.",
  "Recovery codes are invalidated.",
];
export const PENDING = "Pending approval";
export const KIND_ADMIN = "mfa-reset-admin";
export const KIND_MEMBER = "mfa-reset-member";

/** Role gate (module access, deny by default). */
export const canMfa = (roleId: string) => modAllowed(roleId, "admin", "mfa");
export const custName = (id: string): string => (CUSTOMERS[id] ? CUSTOMERS[id].name : id);

export interface ResetFields {
  reason: string; reasonText: string; ticket: string; approver: string;
  checks: { callback: boolean; sponsor: boolean; idCheck: boolean };
}
export interface ResetClean { reason: string; reasonText: string; ticket: string; approver: string }
/** Shared by admin-level and member-level requests. Throws SodError with the first problem. */
export function validateResetFields(i: ResetFields, eligible: string[]): ResetClean {
  if (!i || !i.checks || i.checks.callback !== true || i.checks.sponsor !== true || i.checks.idCheck !== true) throw new SodError("Confirm all three identity checks before submitting.");
  if (!MFA_REASONS.includes(i.reason)) throw new SodError("Choose a valid reason.");
  const reasonText = clampText(i.reasonText, 300);
  if (reasonText.length < 10) throw new SodError("Describe the reason in at least 10 characters.");
  const ticket = clampText(i.ticket, 20);
  if (!TICKET_RE.test(ticket)) throw new SodError("Enter a ticket reference like SEC-1234.");
  const approver = eligible.find((n) => isSamePerson(n, i.approver));
  if (!approver) throw new SodError("Choose a named approver from the eligible people.");
  return { reason: i.reason, reasonText, ticket, approver };
}
/** People holding one of the base roles, minus the requester and the subject. */
export function eligibleApprovers(bases: string[], ...exclude: unknown[]): string[] {
  const me = getActor().name; const out: string[] = [];
  ROLES.forEach((r) => {
    if (!hasRole(r.id, ...bases)) return;
    if (isSamePerson(r.person, me) || exclude.some((x) => isSamePerson(r.person, x)) || out.some((o) => isSamePerson(o, r.person))) return;
    out.push(r.person);
  });
  return out;
}
export const eligibleAdminApprovers = (subject: string) => eligibleApprovers(["super"], subject);

/* ---------- demo seed: the one pending request in the seed data gets a real approval record (once) ---------- */
let seeded = false;
function ensureSeed() {
  if (seeded) return; seeded = true;
  MFA_REQUESTS.filter((r) => r.status === PENDING && !r.approvalId).forEach((r) => {
    const adm = TENANT_ADMINS.find((x) => x.name === r.subject && x.custId === r.custId);
    const now = Date.now();
    const a: Approval = {
      id: "AP-S" + r.id.replace(/\D/g, ""), kind: KIND_ADMIN, title: `Reset MFA for ${r.subject} (${custName(r.custId)})`, subject: r.subject,
      requestedBy: r.by, requestedByRole: "Platform Support", needs: 1, approverRoles: ["super"], forbid: [r.subject], approvals: [], status: "Pending",
      createdAt: now, expiresAt: now + SOD.MFA_RESET_REQUEST_TTL_H * 3600_000, ticket: "SUP-1042", domain: "admin",
      payload: { mrId: r.id, adminId: adm ? adm.id : "", custId: r.custId, reason: r.reason, reasonText: "Migrated from the pre-contract seed data", approver: "Dana Whitfield", prevMfa: "Enrolled" },
    };
    approvals.set((s) => ({ list: [a, ...s.list] }));
    r.approvalId = a.id; r.ticket = a.ticket; r.approver = "Dana Whitfield"; r.method = "Pre-contract seed (checks not recorded)"; r.expiresAt = a.expiresAt;
    adminLog("approval.mfa-reset-admin.requested", `${a.title} (${a.id}); demo seed with fresh 24 h expiry`, { tenant: r.custId, categories: ["Approval", "Authentication"], actor: r.by });
  });
}
/** Brings request rows and admin MFA state in line with the approvals engine (expiry, withdrawal, rejection, final approval). Safe to call often. */
export function syncMfa(): void { ensureSeed(); settle(); }

const stamp = () => nowStamp().slice(0, 10);
registerKind(KIND_ADMIN, {
  describe: (a) => `${a.payload.reason} · ticket ${a.ticket}`,
  apply: (a) => {
    const row = MFA_REQUESTS.find((x) => x.id === a.payload.mrId); const adm = TENANT_ADMINS.find((x) => x.id === a.payload.adminId);
    if (row) { row.status = "Approved"; row.decidedBy = a.approvals.map((x) => x.by).join(", "); row.decidedAt = stamp(); }
    if (adm) { adm.mfa = "Not enrolled"; adm.sessionsRevoked = true; adm.mustReenrol = true; adm.recoveryCodesValid = false; }
    adminLog("mfa.reset.approved", `${a.subject}, ${custName(String(a.payload.custId))}`, {
      tenant: String(a.payload.custId), before: "Reset pending", after: `Reset approved by ${a.approvals.map((x) => x.by).join(", ")}; ticket ${a.ticket}; effects applied: sessions revoked, factors removed, user notified, re-enrolment forced, recovery codes invalidated`,
      categories: ["Authentication", "Identity"],
    });
  },
  closed: (a) => {
    const row = MFA_REQUESTS.find((x) => x.id === a.payload.mrId); const adm = TENANT_ADMINS.find((x) => x.id === a.payload.adminId);
    const by = a.status === "Expired" ? "System (expired)" : getActor().name;
    if (row) { row.status = a.status; row.decidedBy = by; row.decidedAt = stamp(); }
    if (adm && adm.mfa === "Reset pending") adm.mfa = String(a.payload.prevMfa || "Enrolled");
    adminLog("mfa.reset." + a.status.toLowerCase(), `${a.subject}, ${custName(String(a.payload.custId))}`, {
      tenant: String(a.payload.custId), before: "Reset pending", after: `Reset ${a.status.toLowerCase()}; ticket ${a.ticket}${a.decidedReason ? "; reason: " + a.decidedReason : ""}`, categories: ["Authentication", "Identity"],
    });
  },
});

export interface MfaResult { subject: string; custName: string }

/** Raise an admin-level reset. Throws SodError (show its message only). */
export function requestReset(input: ResetFields & { adminId: string }): Promise<MfaResult> {
  return Promise.resolve().then(() => {
    syncMfa();
    assertRole("request an admin MFA reset", "support", "super");
    // support has no elevation concept (it cannot make changes): its request only queues; deciding it needs an elevated super admin
    if (hasRole(getActor().roleId, "super")) assertElevated();
    if (!canMfa(appStore.get().role)) throw new SodError("Not permitted.");
    const a = TENANT_ADMINS.find((x) => x.id === input.adminId);
    if (!a) throw new SodError("Admin not found.");
    assertNotSelf("you cannot raise a reset for yourself", a.name);
    const clean = validateResetFields(input, eligibleAdminApprovers(a.name));
    if (a.mfa === "Reset pending" || MFA_REQUESTS.some((r) => r.status === PENDING && r.subject === a.name && r.custId === a.custId)) throw new SodError("A reset is already pending for this admin.");
    let n = 109 + MFA_REQUESTS.length; while (MFA_REQUESTS.some((r) => r.id === "MR-" + n)) n++;
    const mrId = "MR-" + n; const cn = custName(a.custId); const before = "MFA " + a.mfa;
    const ap = requestApproval({
      kind: KIND_ADMIN, title: `Reset MFA for ${a.name} (${cn})`, subject: a.name, needs: 1, approverRoles: ["super"], forbid: [a.name], ttlHours: SOD.MFA_RESET_REQUEST_TTL_H,
      ticket: clean.ticket, domain: "admin",
      payload: { mrId, adminId: a.id, custId: a.custId, reason: clean.reason, reasonText: clean.reasonText, approver: clean.approver, prevMfa: a.mfa, checks: { callback: true, sponsor: true, idCheck: true } },
    });
    a.mfa = "Reset pending";
    MFA_REQUESTS.push({
      id: mrId, subject: a.name, custId: a.custId, kind: "Admin", reason: clean.reason, reasonText: clean.reasonText, method: "Call-back, sponsor, ID/video (all confirmed)",
      by: getActor().name, at: nowStamp(), status: PENDING, approvalId: ap.id, ticket: clean.ticket, approver: clean.approver, expiresAt: ap.expiresAt,
    });
    adminLog("mfa.reset.requested", `${a.name}, ${cn}`, { tenant: a.custId, before, after: `MFA Reset pending; ticket ${clean.ticket}; named approver ${clean.approver}; identity checks: call-back, sponsor, ID/video confirmed; expires ${SOD.MFA_RESET_REQUEST_TTL_H} h`, categories: ["Authentication", "Identity"] });
    bumpData();
    return { subject: a.name as string, custName: cn };
  });
}
