/* Platform-admin Customers & Usage stubs (plan/seat changes, module entitlements, onboarding, tenant users). Mock mode mutates the in-memory
 * CUSTOMERS / USERS / TENANT_ADMINS; the caller does adminLog / toast.
 * The real API MUST: authorize every call as a platform admin (support or super) server-side, scope every user operation to the customer (tenant)
 * in the URL and reject a user id that belongs to another tenant, validate enums/emails/lengths again, make onboarding idempotent (client request id),
 * send invitations itself with single-use expiring tokens, and write the audit entry in the same transaction as the change. */
import plans from "@/data/plans.json";
import { CUSTOMERS, REGION_TREE, TENANT_ADMINS, custList } from "@/lib/platform";
import { adminLog } from "@/lib/adminAudit";
import { ELEV_REASON_MIN, assertElevated, ticketNote } from "@/lib/elevation";
import { modAllowed } from "@/lib/rbac";
import { SodError, assertRole } from "@/lib/sod";
import { appStore } from "@/lib/store";
import { USERS, nextUserId, usersFor, type TenantUser } from "@/lib/tenantUsers";
import { clampText, isEmail } from "@/lib/security";
import { ApiError, apiFetch, viaApi } from "./http";
import { PLANS } from "./billing";

/* eslint-disable @typescript-eslint/no-explicit-any */
export { USERS, usersFor };
export type { TenantUser };
export const PLAN_MODULES: string[] = plans.PLAN_MODULES;
import { USER_ROLES } from "./team";
export { USER_ROLES };
export const ONBOARD_REGIONS = ["UAE", "Saudi Arabia", "Pakistan", "UK", "Ireland", "Singapore", "US"];
export const ONBOARD_CURRENCIES = ["AED", "SAR", "PKR", "USD", "GBP", "EUR", "SGD"];
export const ONBOARD_BILLING_METHODS = ["Card or bank debit (Stripe)", "Invoice and bank transfer"];
export const ONBOARD_CYCLES = ["Monthly", "Annual", "Quarterly"];
export const ONBOARD_PLANS = ["Starter", "Professional", "Enterprise"];
const post = <T,>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
const del = <T,>(path: string) => apiFetch<T>(path, { method: "DELETE" });

/** Module access (support and super both have it): browsing only. Every MUTATION additionally needs an active elevated session (docs/security/SOD_MATRIX.md section 2). */
export const customersCanManage = (roleId: string) => modAllowed(roleId, "admin", "customers");
/** Deny by default for every mutation: role (super / super2 / support as the source allowed), module access, then an active elevation.
 *  Support passes the role check but can never elevate, so it can browse but not change. */
function guard(what = "customer changes") {
  if (!customersCanManage(appStore.get().role)) throw new ApiError(403, "Not authorized");
  assertRole(what, "super", "support"); assertElevated();
}
const audit = (action: string, object: string, o: { tenant?: string; before?: string; after?: string; categories?: string[]; basis?: string } = {}) =>
  adminLog(action, object, { ...o, after: (o.after || "") + ticketNote(), categories: o.categories || ["Account"] });
const reasonOf = (r: unknown) => {
  const t = clampText(r, 300);
  if (t.length < ELEV_REASON_MIN) throw new SodError(`Enter a reason of at least ${ELEV_REASON_MIN} characters.`);
  return t;
};
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
/** Customer ids come from the URL / UI: always looked up as an own property of CUSTOMERS. */
export const findCustomer = (id: unknown): any | null => (typeof id === "string" && own(CUSTOMERS, id) ? CUSTOMERS[id] : null);
const must = (id: string) => { const c = findCustomer(id); if (!c) throw new ApiError(404, "Unknown customer"); return c; };

/** Prototype: custInit (lazy defaults for modules, limits, seatLimit; sets _pinit). */
export function custInit(c: any) {
  if (c._pinit) return c; c._pinit = true;
  const p = PLANS[c.plan] || PLANS.Professional;
  if (!c.modules) c.modules = p.modules.slice();
  if (!c.limits) c.limits = Object.assign({}, p.limits);
  if (!c.seatLimit) c.seatLimit = parseInt(String(c.seats).split("/")[1] || String(p.seats), 10) || p.seats;
  return c;
}
export const planOf = (c: any) => PLANS[c.plan] || PLANS.Professional;

/** Prototype: custDoChangePlan. Owner decision: downgrading below seats in use is BLOCKED (the prototype allowed it); a reason is required; elevation + audit.
 *  `mrr` is set to the USD list price even for non-USD customers (source). */
export function changePlan(id: string, pn: string, reason: string) {
  return viaApi<any>(() => {
    guard("plan changes"); const c = must(id); if (!own(PLANS, pn)) throw new ApiError(400, "Unknown plan");
    const why = reasonOf(reason);
    custInit(c); const p = PLANS[pn]; const used = Number(c.usage?.seatsUsed) || 0;
    if (p.seats < used) throw new SodError(`Cannot move to ${pn}: ${used} seats are in use and ${pn} includes ${p.seats}. Remove users first.`);
    const before = c.plan + ", " + c.seatLimit + " seats";
    c.plan = pn; c.seatLimit = p.seats; c.limits = Object.assign({}, p.limits);
    c.modules = Array.from(new Set(p.modules.concat(c.modules || []))); c.seats = c.usage.seatsUsed + " / " + p.seats; if (c.status !== "Trial") c.mrr = p.price;
    audit("customer.plan.changed", c.name + " → " + pn, { tenant: id, before, after: pn + ", " + p.seats + " seats; reason: " + why, categories: ["Billing"] });
    return c;
  }, () => post<any>(`/customers/${encodeURIComponent(id)}/plan`, { plan: pn, reason }));
}
/** Prototype: custToggleModule. Returns whether the module was enabled before (so the caller logs enabled/disabled). */
export function toggleModule(id: string, mod: string) {
  return viaApi<{ had: boolean }>(() => {
    guard("module changes"); const c = must(id); if (!PLAN_MODULES.includes(mod)) throw new ApiError(400, "Unknown module");
    custInit(c); const had = c.modules.includes(mod);
    c.modules = had ? c.modules.filter((x: string) => x !== mod) : c.modules.concat([mod]);
    audit("customer.module." + (had ? "disabled" : "enabled"), c.name + ": " + mod, { tenant: id, categories: ["Billing"] });
    return { had };
  }, () => post<{ had: boolean }>(`/customers/${encodeURIComponent(id)}/modules`, { module: mod }));
}

export interface OnboardInput { name: string; adminName: string; adminEmail: string; region: string; plan: string; currency: string; cycle: string; billingMethod: string; modules: string[]; reason: string }
/** Prototype: onboardSubmit (after validation). Creates a Trial tenant plus its Company Admin entry. Returns the new customer. */
export function onboard(input: OnboardInput) {
  return viaApi<any>(() => {
    guard("customer onboarding"); const why = reasonOf(input.reason);
    const name = clampText(input.name, 100), an = clampText(input.adminName, 100), ae = clampText(input.adminEmail, 254);
    if (!name || !an || !isEmail(ae)) throw new ApiError(400, "Invalid input");
    if (!ONBOARD_REGIONS.includes(input.region) || !ONBOARD_PLANS.includes(input.plan) || !ONBOARD_CURRENCIES.includes(input.currency) || !ONBOARD_CYCLES.includes(input.cycle) || !ONBOARD_BILLING_METHODS.includes(input.billingMethod)) throw new ApiError(400, "Invalid input");
    let n = custList().length + 101; while (own(CUSTOMERS, "cust-" + n)) n++; const id = "cust-" + n;
    const p = PLANS[input.plan] || PLANS.Professional;
    const mods = PLAN_MODULES.filter((m) => input.modules.includes(m));
    CUSTOMERS[id] = {
      id, name, plan: input.plan, cycle: input.cycle, billingMethod: input.billingMethod, region: input.region, currency: input.currency, contact: { name: an, email: ae }, address: input.region,
      seats: "0 / " + p.seats, seatLimit: p.seats, modules: mods.length ? mods : p.modules.slice(), limits: Object.assign({}, p.limits), status: "Trial", balance: 0, next: "Trial ends in 30 days", mrr: 0,
      usage: { apiCalls: [2, 3, 4, 5, 6, 7, 8], screenings: 0, idv: 0, storageGB: 2, seatsUsed: 0 }, invoices: [], _pinit: true,
    };
    TENANT_ADMINS.push({ id: "TA-" + (TENANT_ADMINS.length + 1), name: an, email: ae, custId: id, role: "Company Admin", mfa: "Not enrolled", last: "-" });
    audit("customer.onboarded", name + ", " + input.region, { tenant: id, after: "Plan " + input.plan + "; reason: " + why, basis: "Contract", categories: ["Account", "Billing"] });
    return CUSTOMERS[id];
  }, () => post<any>("/customers", input));
}

/* ---- tenant users (isolation by custId) ---- */
const userOf = (cid: string, uid: string) => { must(cid); const u = USERS.find((x) => x.id === uid); if (!u || u.custId !== cid) throw new ApiError(404, "Unknown user"); return u; };
export const findUser = (uid: string) => USERS.find((u) => u.id === uid);
export type UserAction = "resetmfa" | "resetpw" | "resend" | "verify" | "logout" | "suspend" | "activate";
/** Prototype: uAct state changes (resetmfa -> "Reset pending", suspend/activate). Others only log + toast in the caller. */
const USER_AUDIT: Record<UserAction, [string, string]> = {
  resetmfa: ["user.mfa.reset", ""], resetpw: ["user.password.reset", "Password reset email sent"], resend: ["user.invite.resent", ""], verify: ["user.verification.resent", ""],
  logout: ["user.session.revoked", "All sessions revoked"], suspend: ["user.suspended", "Suspended"], activate: ["user.reactivated", "Active"],
};
/** MFA resets are NOT done here any more: they need identity checks, a ticket and a second approver (docs/security/SOD_MATRIX.md section 4), i.e. the MFA Resets module. */
export const MFA_RESET_VIA_MODULE = "MFA resets need a request and a second approver. Use MFA Resets.";
export function userAction(cid: string, uid: string, kind: UserAction) {
  return viaApi<TenantUser>(() => {
    guard("tenant user changes"); if (kind === "resetmfa") throw new SodError(MFA_RESET_VIA_MODULE);
    const u = userOf(cid, uid); if (!own(USER_AUDIT, kind)) throw new ApiError(400, "Unknown action");
    if (kind === "suspend") u.status = "Suspended"; else if (kind === "activate") u.status = "Active";
    audit(USER_AUDIT[kind][0], u.name + ", " + must(cid).name, { tenant: cid, after: USER_AUDIT[kind][1] });
    return u;
  }, () => post<TenantUser>(`/customers/${encodeURIComponent(cid)}/users/${encodeURIComponent(uid)}/actions`, { kind }));
}
export function bulkUsers(cid: string, uids: string[], kind: "mfa" | "suspend") {
  return viaApi<number>(() => {
    guard("tenant user changes"); const c = must(cid); if (kind !== "suspend") throw new SodError(MFA_RESET_VIA_MODULE);
    let n = 0;
    uids.forEach((id) => { const u = USERS.find((x) => x.id === id); if (!u || u.custId !== cid) return; u.status = "Suspended"; n++; });
    audit("users.suspended.bulk", n + " users, " + c.name, { tenant: cid });
    return n;
  }, () => post<number>(`/customers/${encodeURIComponent(cid)}/users/bulk`, { ids: uids, kind }));
}
export function removeUser(cid: string, uid: string) {
  return viaApi<TenantUser>(() => {
    guard("tenant user removal"); const u = userOf(cid, uid); USERS.splice(USERS.indexOf(u), 1);
    audit("user.removed", u.name + ", " + must(cid).name, { tenant: cid }); return u;
  }, () => del<TenantUser>(`/customers/${encodeURIComponent(cid)}/users/${encodeURIComponent(uid)}`));
}
export interface UserInput { name: string; email: string; role: string; country: string }
function checkUser(v: UserInput): UserInput {
  const name = clampText(v.name, 100), email = clampText(v.email, 254);
  if (!name || !isEmail(email) || !(USER_ROLES as string[]).includes(v.role) || !own(REGION_TREE, v.country)) throw new ApiError(400, "Invalid input");
  return { name, email, role: v.role, country: v.country };
}
/** Prototype: uCreate (status Invited, MFA Not enrolled, no city, last "-"). */
export function createUser(cid: string, v: UserInput) {
  return viaApi<TenantUser>(() => {
    guard("tenant user changes"); const cu = must(cid); const c = checkUser(v);
    const u: TenantUser = { id: nextUserId(), name: c.name, email: c.email, custId: cid, role: c.role, status: "Invited", mfa: "Not enrolled", country: c.country, last: "-" };
    USERS.push(u); audit("user.created", u.name + " (" + u.role + "), " + cu.name, { tenant: cid }); return u;
  }, () => post<TenantUser>(`/customers/${encodeURIComponent(cid)}/users`, v));
}
/** Prototype: uSave (Object.assign of name/email/role/country). */
export function saveUser(cid: string, uid: string, v: UserInput) {
  return viaApi<TenantUser>(() => {
    guard("tenant user changes"); const u = userOf(cid, uid); Object.assign(u, checkUser(v));
    audit("user.updated", u.name + ", " + must(cid).name, { tenant: cid }); return u;
  }, () => post<TenantUser>(`/customers/${encodeURIComponent(cid)}/users/${encodeURIComponent(uid)}`, v));
}
/** Prototype: uDoRole. Returns the previous role, or null when nothing changed. */
export function changeUserRole(cid: string, uid: string, role: string) {
  return viaApi<{ from: string; to: string } | null>(() => {
    guard("tenant user role changes"); const u = userOf(cid, uid); if (!(USER_ROLES as string[]).includes(role)) throw new ApiError(400, "Unknown role");
    if (role === u.role) return null; const from = u.role; u.role = role;
    audit("user.role.changed", u.name + ": " + from + " → " + role, { tenant: cid, before: from, after: role }); return { from, to: role };
  }, () => post<{ from: string; to: string } | null>(`/customers/${encodeURIComponent(cid)}/users/${encodeURIComponent(uid)}/role`, { role }));
}
/** Bulk user export is a read (no elevation) but it moves personal data out of the console, so it is audited. */
export function auditUserExport(cid: string, n: number) {
  assertRole("user export", "super", "support");
  adminLog("users.exported", n + " users, " + must(cid).name, { tenant: cid, categories: ["Account"] });
}
