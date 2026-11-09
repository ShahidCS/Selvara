/* Platform-admin Exchange Rates & Tax stubs (Held/Applied workflow, manual edit, refresh). Mock mode mutates RATE_ROWS, the module's own deep copy of
 * the seed RATES (as the prototype's RATE.rows); the caller does toast / bumpData.
 * Owner decision (docs/SOD_MATRIX.md): every change needs an elevated super admin AND a second, different elevated super admin to approve it
 * (manual rate/tax override, and releasing or rejecting a feed-held rate). Every step is audited with the ticket. The prototype had no audit at all.
 * The real API MUST: authorize super/support server-side, keep feed ingestion and the Held thresholds server-side (the client never decides a rate
 * is "Applied"), store the previous applied rate so a rejection can restore it, lock the rate in force into each invoice at issue time, audit every
 * override, and store rates as fixed-precision decimals. */
import { adminLog } from "@/lib/adminAudit";
import { createAdminApproval, decideAdminApproval, withdrawAdminApproval } from "@/lib/adminApprovals";
import type { Approval } from "@/lib/approvals";
import { ELEV_REASON_MIN, assertElevated, ticketNote, validTicket } from "@/lib/elevation";
import { RATES } from "@/lib/platform";
import { modAllowed } from "@/lib/rbac";
import { SodError, assertRole, getActor } from "@/lib/sod";
import { appStore } from "@/lib/store";
import { clampText } from "@/lib/security";
import { ApiError, apiFetch, viaApi } from "./http";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface RateRow { country: string; code: string; currency: string; rate: number; tax: { type: string; rate: number; eff: string }; status: string; reason: string; region?: string }
export const RATE_ROWS: RateRow[] = JSON.parse(JSON.stringify(RATES));
export const REGIONS = ["All", "MENA", "Europe", "APAC", "Americas", "Africa"];
export const TAX_TYPES = ["VAT", "GST", "GST/HST", "Sales tax", "WHT"];
/** Held-for-review thresholds (copy in the "Rate rules" panel). The source states them in text only; no client code evaluates them. */
export const RATE_THRESHOLDS = { movePct: 3, feedDisagreePct: 1, staleHours: 48 } as const;
/** Added validation bounds for manual overrides (the source accepted any number). */
export const MAX_RATE = 10_000_000; export const MAX_TAX = 100;
const post = <T,>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });

/** Module access (support and super): browsing. Every MUTATION needs an elevated session; requesting/approving needs a super admin (support can never elevate). */
export const ratesCanManage = (roleId: string) => modAllowed(roleId, "admin", "rates");
function guard(what = "rate changes", ...roles: string[]) {
  if (!ratesCanManage(appStore.get().role)) throw new ApiError(403, "Not authorized");
  assertRole(what, ...(roles.length ? roles : ["super", "support"])); assertElevated();
}
const PREFIX = "rates.";
const rowOf = (code: string) => { const r = RATE_ROWS.find((x) => x.code === code); if (!r) throw new ApiError(404, "Unknown country"); return r; };

/** Prototype: rateApprove / rateReject (Held rows). Now a REQUEST: releasing or rejecting a held rate is a manual override of the feed hold, so a second
 *  elevated super admin must approve it before anything changes. NOTE (source, kept): reject also sets "Applied" and keeps the held new rate. */
export function requestHeldDecision(code: string, ok: boolean, reason: string, ticket: string) {
  return viaApi<Approval>(() => {
    guard("rate decisions", "super"); const r = rowOf(code); if (r.status !== "Held") throw new SodError("Rate is not held.");
    const { why, tk } = reasonTicket(reason, ticket);
    return createAdminApproval({ kind: ok ? "rates.heldapprove" : "rates.heldreject", title: `${ok ? "Release" : "Reject"} held ${r.country} rate ${r.rate} ${r.currency} (${tk})`, subject: code, payload: { code, ok, reason: why, ticket: tk }, ticket: tk });
  }, () => post<Approval>(`/rates/${encodeURIComponent(code)}/${ok ? "approve" : "reject"}`, { reason, ticket }));
}
function reasonTicket(reason: string, ticket: string) {
  const why = clampText(reason, 300); if (why.length < ELEV_REASON_MIN) throw new SodError(`Enter a reason of at least ${ELEV_REASON_MIN} characters.`);
  const tk = String(ticket || "").trim(); if (!validTicket(tk)) throw new SodError("Enter a ticket reference such as FIN-1234.");
  return { why, tk };
}
export interface RateEdit { currency: string; rate: string; taxType: string; taxRate: string; eff: string }
/** Prototype: rateSave inputs. Blank / non-numeric / 0 keeps the old value (source `parseFloat(x)||old`). Added: reject negative, non-finite and absurd values,
 *  and a currency that is not a 3-letter code. Returns an error message or the parsed edit. */
export function parseRateEdit(r: RateRow, e: RateEdit): { currency: string; rate: number; taxType: string; taxRate: number; eff: string } | string {
  const cur = clampText(e.currency, 8).toUpperCase();
  if (cur && !/^[A-Z]{3}$/.test(cur)) return "Enter a 3-letter currency code, for example USD.";
  const rate = parseFloat(e.rate), tax = parseFloat(e.taxRate);
  if (e.rate.trim() && Number.isFinite(rate) && (rate < 0 || rate > MAX_RATE)) return `Enter an exchange rate greater than 0 and no more than ${MAX_RATE.toLocaleString("en-US")}.`;
  if (e.taxRate.trim() && Number.isFinite(tax) && (tax < 0 || tax > MAX_TAX)) return `Enter a tax rate between 0 and ${MAX_TAX}.`;
  if (!TAX_TYPES.includes(e.taxType)) return "Choose a tax type from the list.";
  return { currency: cur || r.currency, rate: rate || r.rate, taxType: e.taxType, taxRate: tax || r.tax.rate, eff: clampText(e.eff, 20) || r.tax.eff };
}
type RateValues = { currency: string; rate: number; taxType: string; taxRate: number; eff: string };
function checkValues(v: RateValues) {
  if (!/^[A-Z]{3}$/.test(v.currency) || !Number.isFinite(v.rate) || v.rate <= 0 || v.rate > MAX_RATE || !Number.isFinite(v.taxRate) || v.taxRate < 0 || v.taxRate > MAX_TAX || !TAX_TYPES.includes(v.taxType)) throw new ApiError(400, "Invalid rate");
}
/** Manual rate / tax override. ALWAYS needs a second elevated super admin (different person) before taking effect: this only creates the request;
 *  the row keeps its current values until `decideRates(..., true)` runs. Numeric bounds as before. */
export function requestRateOverride(code: string, v: RateValues, reason: string, ticket: string) {
  return viaApi<Approval>(() => {
    guard("rate overrides", "super"); const r = rowOf(code); checkValues(v);
    if (r.status === "Held") throw new SodError("Resolve the held rate first.");
    const { why, tk } = reasonTicket(reason, ticket);
    const summary = `${r.rate} ${r.currency}, ${r.tax.type} ${r.tax.rate}% to ${v.rate} ${v.currency}, ${v.taxType} ${v.taxRate}%`;
    return createAdminApproval({ kind: "rates.override", title: `${r.country} override: ${summary} (${tk})`, subject: code, payload: { code, v: { ...v }, reason: why, ticket: tk, summary }, ticket: tk });
  }, () => post<Approval>(`/rates/${encodeURIComponent(code)}/overrides`, { ...v, reason, ticket }));
}
function applyRate(a: Approval) {
  const code = String(a.payload.code); const r = rowOf(code); const by = getActor().name; const note = `${a.id}; ticket ${a.ticket}; initiator ${a.requestedBy}; second approver ${by}${ticketNote()}`;
  if (a.kind === "rates.override") {
    const v = a.payload.v as RateValues; checkValues(v); const before = `${r.rate} ${r.currency}, ${r.tax.type} ${r.tax.rate}% from ${r.tax.eff}`;
    r.currency = v.currency; r.rate = v.rate; r.tax.type = v.taxType; r.tax.rate = v.taxRate; r.tax.eff = v.eff;
    adminLog("rate.override.applied", r.country, { before, after: `${a.payload.summary}; reason: ${a.payload.reason}; ${note}`, categories: ["Billing"] });
  } else {
    r.status = "Applied"; r.reason = "";
    adminLog(a.kind === "rates.heldapprove" ? "rate.held.released" : "rate.held.rejected", r.country, { before: "Held", after: `Applied; reason: ${a.payload.reason}; ${note}`, categories: ["Billing"] });
  }
}
/** Approve (applies the change) or reject (nothing changes). Different elevated super admin; reason >= 10 chars. */
export function decideRates(id: string, ok: boolean, reason: string) {
  return viaApi<Approval>(() => decideAdminApproval(PREFIX, id, ok, reason, (a) => {
    const r = rowOf(String(a.payload.code));
    if (a.kind === "rates.override") { if (r.status === "Held") throw new SodError("The rate is now held; the request is out of date."); checkValues(a.payload.v as RateValues); }
    else if (r.status !== "Held") throw new SodError("Rate is not held.");
  }, applyRate), () => post<Approval>(`/rates/approvals/${encodeURIComponent(id)}/${ok ? "approve" : "reject"}`, { reason }));
}
export function withdrawRates(id: string) {
  return viaApi<Approval>(() => withdrawAdminApproval(PREFIX, id), () => post<Approval>(`/rates/approvals/${encodeURIComponent(id)}/withdraw`, {}));
}
/** Prototype: ratesRefresh. The demo changes nothing; a real refresh is a server-side feed run. */
export function refreshRates() {
  return viaApi<void>(() => { guard("rate refresh"); adminLog("rates.refresh.requested", "Primary feed", { after: "Held thresholds unchanged" + ticketNote(), categories: ["Billing"] }); }, () => post<void>("/rates/refresh", {}));
}
