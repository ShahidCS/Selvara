/* Platform-admin Customers & Usage stubs (plan/seat changes, module entitlements, onboarding, tenant users). Mock mode mutates the in-memory
 * CUSTOMERS / USERS / TENANT_ADMINS; the caller does adminLog / toast.
 * The real API MUST: authorize every call as a platform admin (support or super) server-side, scope every user operation to the customer (tenant)
 * in the URL and reject a user id that belongs to another tenant, validate enums/emails/lengths again, make onboarding idempotent (client request id),
 * send invitations itself with single-use expiring tokens, and write the audit entry in the same transaction as the change. */
import plans from "@/data/plans.json";
import { CUSTOMERS, REGION_TREE, TENANT_ADMINS, custList } from "@/lib/platform";
import { modAllowed } from "@/lib/rbac";
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

/** Deny by default: same rule as module access (support and super both have it). The source had no per-action gate. UI gate only. */
export const customersCanManage = (roleId: string) => modAllowed(roleId, "admin", "customers");
function guard() { if (!customersCanManage(appStore.get().role)) throw new ApiError(403, "Not authorized"); }
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

/** Prototype: custDoChangePlan. Downgrading below seatsUsed is allowed (source). `mrr` is set to the USD list price even for non-USD customers (source). */
export function changePlan(id: string, pn: string) {
  return viaApi<any>(() => {
    guard(); const c = must(id); if (!own(PLANS, pn)) throw new ApiError(400, "Unknown plan");
    custInit(c); const p = PLANS[pn];
    c.plan = pn; c.seatLimit = p.seats; c.limits = Object.assign({}, p.limits);
    c.modules = Array.from(new Set(p.modules.concat(c.modules || []))); c.seats = c.usage.seatsUsed + " / " + p.seats; if (c.status !== "Trial") c.mrr = p.price;
    return c;
  }, () => post<any>(`/customers/${encodeURIComponent(id)}/plan`, { plan: pn }));
}
/** Prototype: custToggleModule. Returns whether the module was enabled before (so the caller logs enabled/disabled). */
export function toggleModule(id: string, mod: string) {
  return viaApi<{ had: boolean }>(() => {
    guard(); const c = must(id); if (!PLAN_MODULES.includes(mod)) throw new ApiError(400, "Unknown module");
    custInit(c); const had = c.modules.includes(mod);
    c.modules = had ? c.modules.filter((x: string) => x !== mod) : c.modules.concat([mod]);
    return { had };
  }, () => post<{ had: boolean }>(`/customers/${encodeURIComponent(id)}/modules`, { module: mod }));
}

export interface OnboardInput { name: string; adminName: string; adminEmail: string; region: string; plan: string; currency: string; cycle: string; billingMethod: string; modules: string[] }
/** Prototype: onboardSubmit (after validation). Creates a Trial tenant plus its Company Admin entry. Returns the new customer. */
export function onboard(input: OnboardInput) {
  return viaApi<any>(() => {
    guard();
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
    return CUSTOMERS[id];
  }, () => post<any>("/customers", input));
}

/* ---- tenant users (isolation by custId) ---- */
const userOf = (cid: string, uid: string) => { must(cid); const u = USERS.find((x) => x.id === uid); if (!u || u.custId !== cid) throw new ApiError(404, "Unknown user"); return u; };
export const findUser = (uid: string) => USERS.find((u) => u.id === uid);
export type UserAction = "resetmfa" | "resetpw" | "resend" | "verify" | "logout" | "suspend" | "activate";
/** Prototype: uAct state changes (resetmfa -> "Reset pending", suspend/activate). Others only log + toast in the caller. */
export function userAction(cid: string, uid: string, kind: UserAction) {
  return viaApi<TenantUser>(() => {
    guard(); const u = userOf(cid, uid);
    if (kind === "resetmfa") u.mfa = "Reset pending"; else if (kind === "suspend") u.status = "Suspended"; else if (kind === "activate") u.status = "Active";
    return u;
  }, () => post<TenantUser>(`/customers/${encodeURIComponent(cid)}/users/${encodeURIComponent(uid)}/actions`, { kind }));
}
export function bulkUsers(cid: string, uids: string[], kind: "mfa" | "suspend") {
  return viaApi<number>(() => {
    guard(); must(cid); let n = 0;
    uids.forEach((id) => { const u = USERS.find((x) => x.id === id); if (!u || u.custId !== cid) return; if (kind === "mfa") u.mfa = "Reset pending"; else u.status = "Suspended"; n++; });
    return n;
  }, () => post<number>(`/customers/${encodeURIComponent(cid)}/users/bulk`, { ids: uids, kind }));
}
export function removeUser(cid: string, uid: string) {
  return viaApi<TenantUser>(() => {
    guard(); const u = userOf(cid, uid); USERS.splice(USERS.indexOf(u), 1); return u;
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
    guard(); must(cid); const c = checkUser(v);
    const u: TenantUser = { id: nextUserId(), name: c.name, email: c.email, custId: cid, role: c.role, status: "Invited", mfa: "Not enrolled", country: c.country, last: "-" };
    USERS.push(u); return u;
  }, () => post<TenantUser>(`/customers/${encodeURIComponent(cid)}/users`, v));
}
/** Prototype: uSave (Object.assign of name/email/role/country). */
export function saveUser(cid: string, uid: string, v: UserInput) {
  return viaApi<TenantUser>(() => {
    guard(); const u = userOf(cid, uid); Object.assign(u, checkUser(v)); return u;
  }, () => post<TenantUser>(`/customers/${encodeURIComponent(cid)}/users/${encodeURIComponent(uid)}`, v));
}
/** Prototype: uDoRole. Returns the previous role, or null when nothing changed. */
export function changeUserRole(cid: string, uid: string, role: string) {
  return viaApi<{ from: string; to: string } | null>(() => {
    guard(); const u = userOf(cid, uid); if (!(USER_ROLES as string[]).includes(role)) throw new ApiError(400, "Unknown role");
    if (role === u.role) return null; const from = u.role; u.role = role; return { from, to: role };
  }, () => post<{ from: string; to: string } | null>(`/customers/${encodeURIComponent(cid)}/users/${encodeURIComponent(uid)}/role`, { role }));
}
