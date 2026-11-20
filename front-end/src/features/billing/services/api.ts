/* Admin Console billing in production (programme group 8a). The server decides every rule (platform staff only, changes by an elevated
   super admin, a second super admin above USD 1,000 and for every write-off and price change); these calls only carry the choice. */
import { apiFetch } from "@/services/http";
import type { InvoiceLike } from "@/lib/billingText";

const post = <T,>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
export type Pending = { pending: true; id: string };
export const isPending = (x: unknown): x is Pending => !!x && typeof x === "object" && (x as Pending).pending === true;

export interface Account { tenantId: string; ref: string; company: string; plan: string; cycle: string; currency: string; country: string; contact: { name: string; email: string }; address: string; method: string; status: "Active" | "Trial"; trialEnds?: string; nextPeriod: string; pendingPlan?: { plan: string; requestedBy: string }; balance: number; pastDue: number; lastInvoice: string | null }
export interface Invoice extends InvoiceLike { tenantId: string; ref: string; company: string; rate: { perUsd: number; source: string }; checkout?: { url: string; at: number }; providerPaid: number; writtenOff: number }
export interface Entry { id: string; invoiceId: string; type: string; review?: string; amount: number; currency: string; at: number; by: string; reason: string; ticket: string; approvalId?: string; provider?: string }
export interface PlanRequest { id: string; tenantId: string; plan: string; at: number; byName?: string; company?: string }
export interface Billing {
  accounts: Account[]; invoices: Invoice[]; entries: Entry[]; companies: { id: string; ref: string; name: string; status: string; hasAccount: boolean }[];
  prices: { version: number; plans: Record<string, { monthly: number; seats: number }>; at: number; by: string }; methods: string[]; payments: { mode: "test" | "live" } | null; planRequests: PlanRequest[]; thresholdUsd: number;
}
export const billing = () => apiFetch<Billing>("/admin/billing");
export interface AccountForm { tenantId: string; plan: string; cycle: string; currency: string; country: string; method: string; contactName: string; contactEmail: string; address: string; trialDays: number; reason: string; ticket: string }
export const saveAccount = (f: AccountForm) => post<unknown>("/admin/billing/accounts", f);
export const changePrices = (plans: Record<string, { monthly: number; seats: number }>, reason: string, ticket: string) => post<Pending>("/admin/billing/pricing", { plans, reason, ticket });
export const issue = (upTo: string) => post<{ issued: string[]; skipped: string[] }>("/admin/billing/issue", { upTo });
export type FinanceKind = "credit" | "refund" | "markpaid" | "writeoff" | "void";
export const finance = (id: string, kind: FinanceKind, amount: string, reason: string, ticket: string) => post<Invoice | Pending>(`/admin/billing/invoices/${encodeURIComponent(id)}/${kind}`, { amount, reason, ticket });
export const paymentLink = (id: string) => post<{ url: string }>(`/admin/billing/invoices/${encodeURIComponent(id)}/payment-link/create`, {});
export const decidePlan = (id: string, accept: boolean, reason: string) => post<{ accepted: boolean }>(`/admin/billing/plan-requests/${encodeURIComponent(id)}/${accept ? "accept" : "decline"}`, { reason });
export interface RateRow { code: string; country: string; currency: string; status: string; taxType: string; taxRate: number }
export const ratesList = () => apiFetch<{ rates: RateRow[] }>("/admin/rates");
