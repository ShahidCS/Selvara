/* Platform-admin Billing stubs (pricing catalogue, invoice mark-paid / retry / void). Mock mode mutates the in-memory CUSTOMERS and the shared PLANS
 * (the workspace Billing view reads the same price list, as in the prototype); the caller does adminLog / toast.
 * Money: the prototype stores amounts as plain numbers in major units and never computes totals on the client except MRR (a sum of integers).
 * Ported as-is; the real API MUST hold amounts as integer minor units, compute tax/totals/balance server-side, and make each invoice transition
 * idempotent (client request id + state precondition) and audited in the same transaction. This UI never collects card numbers. */
import seed from "@/data/billingAdminSeed.json";
import { adminLog } from "@/lib/adminAudit";
import { createAdminApproval, decideAdminApproval, withdrawAdminApproval } from "@/lib/adminApprovals";
import type { Approval } from "@/lib/approvals";
import { ELEV_REASON_MIN, assertElevated, ticketNote, validTicket } from "@/lib/elevation";
import { money, nowStampUTC } from "@/lib/format";
import { CUSTOMERS, RATES } from "@/lib/platform";
import { modAllowed } from "@/lib/rbac";
import { clampText } from "@/lib/security";
import { SOD, SodError, assertRole, getActor } from "@/lib/sod";
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

/** Module access (support and super): browsing. Every MUTATION also needs an active elevation (docs/security/SOD_MATRIX.md section 2). */
export const billingCanManage = (roleId: string) => modAllowed(roleId, "admin", "billing");
/** Deny by default for mutations: module access, role (super / super2 / support as the source allowed), then elevation. Support can never elevate. */
function guard(what = "billing changes", ...roles: string[]) {
  if (!billingCanManage(appStore.get().role)) throw new ApiError(403, "Not authorized");
  assertRole(what, ...(roles.length ? roles : ["super", "support"])); assertElevated();
}
const audit = (action: string, object: string, o: { tenant?: string; before?: string; after?: string; basis?: string } = {}) =>
  adminLog(action, object, { ...o, after: (o.after || "") + ticketNote(), categories: ["Billing"] });
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
    guard("pricing changes");
    const ok = (n: unknown, max: number) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= max;
    if (!Object.keys(PLANS).every((k) => ok(v.plans[k], MAX_PRICE)) || !PLAN_MODULES.every((k) => ok(v.modules[k], MAX_PRICE)) || !USAGE_KEYS.every(([k]) => ok(v.usage[k], MAX_UNIT_PRICE))) throw new ApiError(400, "Invalid pricing");
    Object.keys(PLANS).forEach((pn) => { PLANS[pn].price = v.plans[pn]; });
    PLAN_MODULES.forEach((m) => { MODULE_PRICING[m] = v.modules[m]; });
    USAGE_KEYS.forEach(([k]) => { USAGE_PRICING[k] = v.usage[k]; });
    audit("pricing.updated", "Plan, module and usage pricing");
  }, () => post<void>("/billing/pricing", v));
}

/** Prototype: invoiceAction (looked up by invoice id instead of array index). "Mark paid" is no longer a plain action: it is a manual override and goes
 *  through financeRequest (dual control). Only Retry / Void remain here, with elevation + audit. Void on anything not already "Void" (source). */
export type InvoiceAction = "Retry" | "Void";
export function invoiceAction(cid: string, invId: string, action: InvoiceAction) {
  return viaApi<{ id: string; name: string }>(() => {
    guard(action === "Void" ? "voiding an invoice" : "payment retries"); const c = findCustomer(cid); if (!c) throw new ApiError(404, "Unknown customer");
    const iv = c.invoices.find((x: any) => x.id === invId); if (!iv) throw new ApiError(404, "Unknown invoice");
    if (action === "Retry" && iv.status !== "Past due") throw new SodError("Invoice is not past due.");
    if (action === "Void" && iv.status === "Void") throw new SodError("Invoice is already void.");
    if (action === "Void") { audit("invoice.voided", iv.id + ", " + c.name, { tenant: cid, before: iv.status, after: "Void" }); iv.status = "Void"; }
    else audit("invoice.payment_retried", iv.id + ", " + c.name, { tenant: cid });
    return { id: iv.id, name: c.name };
  }, () => post<{ id: string; name: string }>(`/billing/${encodeURIComponent(cid)}/invoices/${encodeURIComponent(invId)}/${action.toLowerCase()}`, {}));
}

/* ---------- finance dual control: credit, refund, write-off, manual mark paid (docs/security/SOD_MATRIX.md section 3) ---------- */
export type FinanceKind = "credit" | "refund" | "writeoff" | "markpaid";
export const FINANCE_LABEL: Record<FinanceKind, string> = { credit: "Credit", refund: "Refund", writeoff: "Write-off", markpaid: "Mark paid (manual override)" };
export const FINANCE_KINDS = Object.keys(FINANCE_LABEL) as FinanceKind[];
export interface FinanceInput { kind: FinanceKind; cid: string; invId: string; amount: number; reason: string; ticket: string }
interface FinancePayload { kind: FinanceKind; cid: string; invId: string; amount: number; cur: string; usd: number | null; reason: string; ticket: string; summary: string }
export type FinanceOutcome = { outcome: "applied"; message: string } | { outcome: "pending"; approval: Approval; message: string };
const r2 = (n: number) => Math.round(n * 100) / 100;
const invTotal = (iv: any) => r2((Number(iv.amount) || 0) + (Number(iv.tax) || 0));
/** USD value using the billing screens' rate logic (RATES list, rate = units per 1 USD). A currency without an applied rate gives null, which is
 *  treated as ABOVE the threshold (deny by default: it goes to a second approver). */
export function toUsd(amount: number, cur: string): number | null {
  if (cur === "USD") return amount;
  const row = rateForCurrency(cur);
  if (!row || row.status === "Held" || !Number.isFinite(row.rate) || row.rate <= 0) return null;
  return r2(amount / row.rate);
}
/** True when one elevated super admin may complete the action alone. Write-offs never can. */
export const needsSecondApprover = (kind: FinanceKind, usd: number | null) => kind === "writeoff" || usd === null || usd > SOD.FINANCE_DUAL_USD;

function financeTarget(kind: FinanceKind, cid: string, invId: string, amount: number) {
  const c = findCustomer(cid); if (!c) throw new ApiError(404, "Unknown customer");
  const iv = c.invoices.find((x: any) => x.id === invId); if (!iv) throw new ApiError(404, "Unknown invoice");
  const total = invTotal(iv);
  if (iv.status === "Void") throw new SodError("Invoice is void.");
  if (kind === "markpaid" || kind === "writeoff") { if (iv.status !== "Past due") throw new SodError("Invoice is not past due."); if (amount !== total) throw new SodError("This action covers the full invoice total."); }
  if (kind === "refund") { if (iv.status !== "Paid") throw new SodError("Only paid invoices can be refunded."); if (amount > r2(total - (iv.refunded || 0))) throw new SodError("Refund exceeds the amount still refundable."); }
  if (kind === "credit" && amount > total) throw new SodError("Credit exceeds the invoice total.");
  return { c, iv, total };
}
function applyFinance(p: FinancePayload, approver?: string, initiator = getActor().name) {
  const { c, iv } = financeTarget(p.kind, p.cid, p.invId, p.amount);
  const before = iv.status;
  if (p.kind === "markpaid") { iv.status = "Paid"; if (c.invoices.every((x: any) => x.status !== "Past due")) { c.balance = 0; if (c.status === "Past due") c.status = "Active"; } }
  else if (p.kind === "writeoff") { iv.status = "Written off"; c.balance = Math.max(0, r2((c.balance || 0) - p.amount)); if (c.invoices.every((x: any) => x.status !== "Past due") && c.status === "Past due") c.status = "Active"; }
  else if (p.kind === "refund") iv.refunded = r2((iv.refunded || 0) + p.amount);
  else { iv.credited = r2((iv.credited || 0) + p.amount); c.balance = Math.max(0, r2((c.balance || 0) - p.amount)); }
  adminLog("invoice." + p.kind + ".applied", p.invId + ", " + c.name, {
    tenant: p.cid, before, after: `${p.summary}; reason: ${p.reason}; ticket ${p.ticket}; initiator ${initiator}${approver ? "; second approver " + approver : "; single elevated super admin (<= USD " + SOD.FINANCE_DUAL_USD + ")"}`, categories: ["Billing"],
  });
}
/** Credit, refund, write-off or manual mark paid. Reason (>= 15 chars) and ticket are required. <= USD threshold: applied by this elevated super admin and audited;
 *  above it (or unknown USD value) and every write-off: a pending approval that a DIFFERENT elevated super admin must approve. */
export function financeRequest(i: FinanceInput) {
  return viaApi<FinanceOutcome>(() => {
    guard(FINANCE_LABEL[i.kind] + " requests", "super");
    if (!FINANCE_KINDS.includes(i.kind)) throw new ApiError(400, "Unknown action");
    const reason = clampText(i.reason, 300); if (reason.length < ELEV_REASON_MIN) throw new SodError(`Enter a reason of at least ${ELEV_REASON_MIN} characters.`);
    const ticket = String(i.ticket || "").trim(); if (!validTicket(ticket)) throw new SodError("Enter a ticket reference such as FIN-1234.");
    const amount = r2(Number(i.amount)); if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_PRICE * 1000) throw new SodError("Enter an amount greater than 0.");
    const { c, iv } = financeTarget(i.kind, i.cid, i.invId, amount);
    const cur = String(iv.cur || c.currency); const usd = toUsd(amount, cur);
    const summary = `${FINANCE_LABEL[i.kind]} ${money(amount, cur)}${usd !== null && cur !== "USD" ? " (about " + money(usd, "USD") + ")" : ""}`;
    const p: FinancePayload = { kind: i.kind, cid: i.cid, invId: i.invId, amount, cur, usd, reason, ticket, summary };
    if (!needsSecondApprover(i.kind, usd)) { applyFinance(p); return { outcome: "applied" as const, message: summary + " applied on " + i.invId }; }
    const approval = createAdminApproval({ kind: "billing." + i.kind, title: `${summary} on ${i.invId}, ${c.name} (${ticket})`, subject: i.cid + "/" + i.invId, payload: { ...p }, ticket });
    return { outcome: "pending" as const, approval, message: summary + " sent for approval by a second super admin" };
  }, () => post<FinanceOutcome>(`/billing/${encodeURIComponent(i.cid)}/invoices/${encodeURIComponent(i.invId)}/${i.kind}`, i));
}
const PREFIX = "billing.";
/** Approve or reject a pending finance request (different elevated super admin; reason >= 10 chars). Approval applies the change. */
export function decideFinance(id: string, ok: boolean, reason: string) {
  return viaApi<Approval>(() => decideAdminApproval(PREFIX, id, ok, reason,
    (a) => { const p = a.payload as unknown as FinancePayload; financeTarget(p.kind, p.cid, p.invId, p.amount); },
    (a) => applyFinance(a.payload as unknown as FinancePayload, getActor().name, a.requestedBy)),
  () => post<Approval>(`/billing/approvals/${encodeURIComponent(id)}/${ok ? "approve" : "reject"}`, { reason }));
}
export function withdrawFinance(id: string) {
  return viaApi<Approval>(() => withdrawAdminApproval(PREFIX, id), () => post<Approval>(`/billing/approvals/${encodeURIComponent(id)}/withdraw`, {}));
}
/** Prototype: the "due" set for issueInvoices (everyone not on Trial). Nothing is generated in the demo. */
export const dueCustomers = () => Object.values(CUSTOMERS).filter((c: any) => c.status !== "Trial");
export function issueInvoices() {
  return viaApi<number>(() => {
    guard("issuing invoices"); const n = dueCustomers().length;
    audit("invoices.issued", n + " customers, " + nowStampUTC().slice(0, 7), { basis: "Contract" }); return n;
  }, () => post<number>("/billing/invoices/issue", {}));
}
/** Prototype: resendInvoice (log + toast only). Authorization and existence check only. */
export function resendInvoice(cid: string, invId: string) {
  return viaApi<{ email: string; name: string }>(() => {
    guard("resending invoices"); const c = findCustomer(cid); if (!c || !c.invoices.some((x: any) => x.id === invId)) throw new ApiError(404, "Unknown invoice");
    audit("invoice.resent", invId + ", " + c.name + " (" + c.contact.email + ")", { tenant: cid });
    return { email: c.contact.email, name: c.name };
  }, () => post<{ email: string; name: string }>(`/billing/${encodeURIComponent(cid)}/invoices/${encodeURIComponent(invId)}/resend`, {}));
}
