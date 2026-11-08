/* MFA reset service (prototype: mfaRequestSubmit, mfaApprove). MFA reset is an account-takeover vector, so the rules live HERE, not only in the UI:
 * deny by default (role gate), four-eyes (the requester can never approve their own request), state guards (only "Pending approval" can be decided,
 * no second request while a reset is pending), enum-checked reason/method, out-of-band identity confirmation required.
 * The real API MUST re-enforce all of it server-side with the actor taken from the authenticated session (never from the client), require step-up
 * authentication for both the requester and the approver, verify identity out-of-band (callback to a number on file, not one supplied in the ticket),
 * notify the affected admin and their other admins, expire pending requests, rate-limit requests per admin/customer, and make the reset itself
 * force re-enrolment at next sign-in. Dual control is NOT a client-side feature. */
import { MFA_REQUESTS, TENANT_ADMINS, CUSTOMERS } from "@/lib/platform";
import { adminLog } from "@/lib/adminAudit";
import { getMe } from "@/lib/audit";
import { nowStamp } from "@/lib/format";
import { modAllowed } from "@/lib/rbac";
import { appStore, bumpData } from "@/lib/store";
import { apiFetch, viaApi } from "./http";

export const MFA_REASONS = ["Lost authenticator device", "New device enrolment", "Suspected compromise, rotate", "Admin left and returned"];
export const MFA_METHODS = ["Phone callback", "Manager confirmation", "Video ID check", "In-person"];
export const PENDING = "Pending approval";
const post = <T,>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });

/** Role gate (module access, deny by default). */
export const canMfa = (roleId: string) => modAllowed(roleId, "admin", "mfa");
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
/** Four-eyes: the signed-in persona raised this request, so they may not approve it. */
export const isRequester = (r: { by?: string }) => !!r.by && norm(r.by) === norm(getMe().name);
export const custName = (id: string): string => (CUSTOMERS[id] ? CUSTOMERS[id].name : id);

export interface MfaResult { ok: boolean; subject?: string; custName?: string; why?: "forbidden" | "notfound" | "state" | "self" | "invalid" | "unconfirmed" }

export function requestReset(input: { adminId: string; reason: string; method: string; confirmed: boolean }) {
  return viaApi<MfaResult>(() => {
    if (!canMfa(appStore.get().role)) return { ok: false, why: "forbidden" };
    const a = TENANT_ADMINS.find((x) => x.id === input.adminId);
    if (!a) return { ok: false, why: "notfound" };
    if (input.confirmed !== true) return { ok: false, why: "unconfirmed" };
    if (!MFA_REASONS.includes(input.reason) || !MFA_METHODS.includes(input.method)) return { ok: false, why: "invalid" };
    if (a.mfa === "Reset pending" || MFA_REQUESTS.some((r) => r.status === PENDING && r.subject === a.name && r.custId === a.custId)) return { ok: false, why: "state" };
    let n = 109 + MFA_REQUESTS.length; while (MFA_REQUESTS.some((r) => r.id === "MR-" + n)) n++;
    const cn = custName(a.custId);
    const before = "MFA " + a.mfa;
    a.mfa = "Reset pending";
    MFA_REQUESTS.push({ id: "MR-" + n, subject: a.name, custId: a.custId, kind: "Admin", reason: input.reason, method: input.method, by: getMe().name, at: nowStamp(), status: PENDING });
    adminLog("mfa.reset.requested", a.name + ", " + cn, { tenant: a.custId, before, after: "MFA Reset pending", categories: ["Authentication", "Identity"] });
    bumpData();
    return { ok: true, subject: a.name, custName: cn };
  }, () => post<MfaResult>("/mfa/resets", input));
}

export function decideReset(rid: string, approve: boolean) {
  return viaApi<MfaResult>(() => {
    if (!canMfa(appStore.get().role)) return { ok: false, why: "forbidden" };
    const r = MFA_REQUESTS.find((x) => x.id === rid);
    if (!r) return { ok: false, why: "notfound" };
    if (r.status !== PENDING) return { ok: false, why: "state" };
    if (approve && isRequester(r)) return { ok: false, why: "self" }; // four-eyes (source: Approve disabled for the requester; Reject stays available, ported as-is)
    r.status = approve ? "Approved" : "Rejected"; r.decidedBy = getMe().name; r.decidedAt = nowStamp().slice(0, 10);
    const a = TENANT_ADMINS.find((x) => x.name === r.subject && x.custId === r.custId);
    if (a) a.mfa = approve ? "Not enrolled" : "Enrolled";
    adminLog(approve ? "mfa.reset.approved" : "mfa.reset.rejected", r.subject + ", " + custName(r.custId), { tenant: r.custId, before: "Reset pending", after: approve ? "Reset approved" : "Reset rejected", categories: ["Authentication", "Identity"] });
    bumpData();
    return { ok: true, subject: r.subject, custName: custName(r.custId) };
  }, () => post<MfaResult>(`/mfa/resets/${encodeURIComponent(rid)}/${approve ? "approve" : "reject"}`, {}));
}
