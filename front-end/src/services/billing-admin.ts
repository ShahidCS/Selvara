/* Platform-admin Billing stubs (pricing catalogue, invoice mark-paid / retry / void). Mock mode mutates the in-memory CUSTOMERS and the shared PLANS
 * (the workspace Billing view reads the same price list, as in the prototype); the caller does adminLog / toast.
 * Money: the prototype stores amounts as plain numbers in major units and never computes totals on the client except MRR (a sum of integers).
 * Ported as-is; the real API MUST hold amounts as integer minor units, compute tax/totals/balance server-side, and make each invoice transition
 * idempotent (client request id + state precondition) and audited in the same transaction. This UI never collects card numbers. */
import seed from "@/data/billingAdminSeed.json";
import { CUSTOMERS, RATES } from "@/lib/platform";
import { modAllowed } from "@/lib/rbac";
import { appStore } from "@/lib/store";
import { ApiError, apiFetch, viaApi } from "./http";
import { PLANS } from "./billing";
import { PLAN_MODULES, findCustomer } from "./customers";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const MODULE_PRICING: Record<string, number> = JSON.parse(JSON.stringify(seed.MODULE_PRICING));
export const USAGE_PRICING: Record<string, number> = JSON.parse(JSON.stringify(seed.USAGE_PRICING));
export const USAGE_KEYS: [string, string][] = [["screenings", "Per screening"], ["idv", "Per identity verification"], ["storageGB", "Per GB / month"]];
/** Sane upper bounds for manual price entry (added: the source only clamped at 0). */
export const MAX_PRICE = 1_000_000; export const MAX_UNIT_PRICE = 1000;

/** Deny by default: module access (support and super both). The source had no per-action gate. UI gate only. */
export const billingCanManage = (roleId: string) => modAllowed(roleId, "admin", "billing");
function guard() { if (!billingCanManage(appStore.get().role)) throw new ApiError(403, "Not authorized"); }
const post = <T,>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });

/** Tax line shown on billing screens. Reads the applied seed RATES list (the prototype's billing screens read RATES, not the Rates module's editable copy). */
export const rateForCurrency = (cur: string) => RATES.find((r: any) => r.currency === cur);

export interface PricingInput { plans: Record<string, number>; modules: Record<string, number>; usage: Record<string, number> }
/** Prototype: billingSavePricing. Integers for plan/module prices, 2 decimals for usage prices; non-numeric -> 0 (source). Out of range is rejected (added). */
export function parsePricing(raw: { plans: Record<string, string>; modules: Record<string, string>; usage: Record<string, string> }): PricingInput | string {
  const out: PricingInput = { plans: {}, modules: {}, usage: {} };
  for (const k of Object.keys(PLANS)) { const v = Math.max(0, parseInt(raw.plans[k], 10) || 0); if (v > MAX_PRICE) return `Prices cannot exceed ${MAX_PRICE.toLocaleString("en-US")}.`; out.plans[k] = v; }
  for (const k of PLAN_MODULES) { const v = Math.max(0, parseInt(raw.modules[k], 10) || 0); if (v > MAX_PRICE) return `Prices cannot exceed ${MAX_PRICE.toLocaleString("en-US")}.`; out.modules[k] = v; }
  for (const [k] of USAGE_KEYS) { const f = Math.max(0, parseFloat(raw.usage[k]) || 0); if (!Number.isFinite(f) || f > MAX_UNIT_PRICE) return `Usage prices cannot exceed ${MAX_UNIT_PRICE.toLocaleString("en-US")}.`; out.usage[k] = Math.round(f * 100) / 100; }
  return out;
}
export function savePricing(v: PricingInput) {
  return viaApi<void>(() => {
    guard();
    const ok = (n: unknown, max: number) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= max;
    if (!Object.keys(PLANS).every((k) => ok(v.plans[k], MAX_PRICE)) || !PLAN_MODULES.every((k) => ok(v.modules[k], MAX_PRICE)) || !USAGE_KEYS.every(([k]) => ok(v.usage[k], MAX_UNIT_PRICE))) throw new ApiError(400, "Invalid pricing");
    Object.keys(PLANS).forEach((pn) => { PLANS[pn].price = v.plans[pn]; });
    PLAN_MODULES.forEach((m) => { MODULE_PRICING[m] = v.modules[m]; });
    USAGE_KEYS.forEach(([k]) => { USAGE_PRICING[k] = v.usage[k]; });
  }, () => post<void>("/billing/pricing", v));
}

export type InvoiceAction = "Paid" | "Retry" | "Void";
/** Prototype: invoiceAction (looked up by invoice id instead of array index). Preconditions are the source's UI conditions, enforced here:
 *  Paid / Retry only on "Past due", Void on anything not already "Void". Mark paid clears the balance when no other invoice is "Past due" (source). */
export function invoiceAction(cid: string, invId: string, action: InvoiceAction) {
  return viaApi<{ id: string; name: string }>(() => {
    guard(); const c = findCustomer(cid); if (!c) throw new ApiError(404, "Unknown customer");
    const iv = c.invoices.find((x: any) => x.id === invId); if (!iv) throw new ApiError(404, "Unknown invoice");
    if ((action === "Paid" || action === "Retry") && iv.status !== "Past due") throw new ApiError(409, "Invoice is not past due");
    if (action === "Void" && iv.status === "Void") throw new ApiError(409, "Invoice already void");
    if (action === "Paid") { iv.status = "Paid"; if (c.invoices.every((x: any) => x.status !== "Past due")) { c.balance = 0; if (c.status === "Past due") c.status = "Active"; } }
    else if (action === "Void") iv.status = "Void";
    return { id: iv.id, name: c.name };
  }, () => post<{ id: string; name: string }>(`/billing/${encodeURIComponent(cid)}/invoices/${encodeURIComponent(invId)}/${action.toLowerCase()}`, {}));
}
/** Prototype: the "due" set for issueInvoices (everyone not on Trial). Nothing is generated in the demo. */
export const dueCustomers = () => Object.values(CUSTOMERS).filter((c: any) => c.status !== "Trial");
export function issueInvoices() {
  return viaApi<number>(() => { guard(); return dueCustomers().length; }, () => post<number>("/billing/invoices/issue", {}));
}
/** Prototype: resendInvoice (log + toast only). Authorization and existence check only. */
export function resendInvoice(cid: string, invId: string) {
  return viaApi<{ email: string; name: string }>(() => {
    guard(); const c = findCustomer(cid); if (!c || !c.invoices.some((x: any) => x.id === invId)) throw new ApiError(404, "Unknown invoice");
    return { email: c.contact.email, name: c.name };
  }, () => post<{ email: string; name: string }>(`/billing/${encodeURIComponent(cid)}/invoices/${encodeURIComponent(invId)}/resend`, {}));
}
