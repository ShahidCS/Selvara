/* Platform-admin Exchange Rates & Tax stubs (Held/Applied workflow, manual edit, refresh). Mock mode mutates RATE_ROWS, the module's own deep copy of
 * the seed RATES (as the prototype's RATE.rows); the caller does toast / bumpData.
 * The prototype has NO audit entry for any rate or tax change; ported as-is and flagged (docs/checklist/rates.md).
 * The real API MUST: authorize super/support server-side, keep feed ingestion and the Held thresholds server-side (the client never decides a rate
 * is "Applied"), store the previous applied rate so a rejection can restore it, lock the rate in force into each invoice at issue time, audit every
 * override, and store rates as fixed-precision decimals. */
import { RATES } from "@/lib/platform";
import { modAllowed } from "@/lib/rbac";
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

/** Deny by default: module access (support and super both). The source had no per-action gate. UI gate only. */
export const ratesCanManage = (roleId: string) => modAllowed(roleId, "admin", "rates");
function guard() { if (!ratesCanManage(appStore.get().role)) throw new ApiError(403, "Not authorized"); }
const rowOf = (code: string) => { const r = RATE_ROWS.find((x) => x.code === code); if (!r) throw new ApiError(404, "Unknown country"); return r; };

/** Prototype: rateApprove. Only a Held row may be approved/rejected. NOTE (source): reject also sets "Applied" and keeps the held new rate. */
export function decideRate(code: string, ok: boolean) {
  return viaApi<RateRow>(() => {
    guard(); const r = rowOf(code); if (r.status !== "Held") throw new ApiError(409, "Rate is not held");
    r.status = "Applied"; r.reason = ""; return r;
  }, () => post<RateRow>(`/rates/${encodeURIComponent(code)}/${ok ? "approve" : "reject"}`, {}));
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
export function saveRate(code: string, v: { currency: string; rate: number; taxType: string; taxRate: number; eff: string }) {
  return viaApi<RateRow>(() => {
    guard(); const r = rowOf(code);
    if (!/^[A-Z]{3}$/.test(v.currency) || !Number.isFinite(v.rate) || v.rate <= 0 || v.rate > MAX_RATE || !Number.isFinite(v.taxRate) || v.taxRate < 0 || v.taxRate > MAX_TAX || !TAX_TYPES.includes(v.taxType)) throw new ApiError(400, "Invalid rate");
    r.currency = v.currency; r.rate = v.rate; r.tax.type = v.taxType; r.tax.rate = v.taxRate; r.tax.eff = v.eff; return r;
  }, () => post<RateRow>(`/rates/${encodeURIComponent(code)}`, v));
}
/** Prototype: ratesRefresh. The demo changes nothing; a real refresh is a server-side feed run. */
export function refreshRates() {
  return viaApi<void>(() => { guard(); }, () => post<void>("/rates/refresh", {}));
}
