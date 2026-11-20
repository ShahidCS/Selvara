/* Server-only. The billing ledger, exchange rates and tax, and the payment provider (production programme group 8, migration 0010).
   Owner decision: an internal ledger, plus an option to collect payments with Stripe (or a similar provider), on only when its keys are set.
   - Money is integer minor units (cents). Tax, totals and balances are computed here, never typed. An invoice locks the rate and tax in force
     when it is issued. Payments, credits, refunds, write-offs and voids are ledger entries; an invoice's outstanding amount and a company's
     balance are derived from them.
   - Rates come from two public feeds (the European Central Bank's daily reference rates and open.er-api.com), cross-checked. A rate that
     moved more than 3 % from the applied one, where the feeds disagree by more than 1 %, or whose feed is older than 48 hours is held for a
     person; releasing a held rate is a request another super admin approves. Tax rates are reference values a super admin changes by request.
   - Stripe: hosted Checkout (no card data reaches Selvara), a webhook verified with Stripe's signature on the raw body, events processed once;
     refunds go back through Stripe when the payment came from Stripe. Plain HTTPS calls: dependencies are managed by Dependabot.
   Everything is a draft for finance and compliance review (tax treatment, invoice wording, numbering, retention). */
import { createHmac, timingSafeEqual } from "node:crypto";
import seedRates from "@/data/platform.json";
import plans from "@/data/plans.json";
import { httpsNet, type Net } from "./integrations/net";
import type { PRec, PTx } from "./platstore";
import { WsRefused } from "./ws/store";

export const DAY = 86_400_000;
export const FINANCE_DUAL_USD_CENTS = 100_000; // above USD 1,000 a second super admin approves (SOD_MATRIX, finance)
export const CYCLES: Record<string, number> = { Monthly: 1, Quarterly: 3, Annual: 12 };
export const METHODS = ["Invoice and bank transfer", "Card (Stripe)"];
export const DUE_DAYS = 30;

/* ---------------- price list ---------------- */
export interface PriceList { version: number; plans: Record<string, { monthly: number; seats: number }>; at: number; by: string }
export const REFERENCE_PRICES: PriceList = { version: 1, at: 0, by: "Reference catalogue", plans: Object.fromEntries(Object.entries((plans as unknown as { PLANS: Record<string, { price: number; seats: number }> }).PLANS).map(([k, v]) => [k, { monthly: Math.round(v.price * 100), seats: v.seats }])) };
export async function priceList(t: PTx): Promise<PRec<PriceList> | { id: string; tenantId: null; data: PriceList; version: 0 }> {
  return (await t.get<PriceList>("billing-price", "current")) ?? { id: "current", tenantId: null, data: REFERENCE_PRICES, version: 0 };
}

/* ---------------- rates and tax ---------------- */
export interface Rate {
  code: string; country: string; currency: string; region: string; rate: number; taxType: string; taxRate: number; taxEffective: string;
  status: "Reference" | "Applied" | "Held"; source: string; at: number;
  candidate?: { rate: number; ecb: number | null; er: number | null; at: number; reason: string }; previous?: { rate: number; until: number };
}
const MONTHS: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
const isoOf = (gb: string) => { const m = /^(\d{1,2}) (\w{3}) (\d{4})$/.exec(gb.trim()); return m ? `${m[3]}-${MONTHS[m[2]] ?? "01"}-${m[1].padStart(2, "0")}` : ""; };
/** The reference catalogue (countries, currencies, tax types and rates): shown until a super admin refreshes; never used for billing as is. */
export const REFERENCE_RATES: Rate[] = (seedRates as unknown as { RATES: { country: string; code: string; currency: string; rate: number; tax: { type: string; rate: number; eff: string }; region?: string }[] }).RATES.map((r) => ({
  code: r.code, country: r.country, currency: r.currency, region: r.region ?? (r.code === "US" ? "Americas" : ""), rate: r.rate, taxType: r.tax.type, taxRate: r.tax.rate, taxEffective: isoOf(r.tax.eff),
  status: r.currency === "USD" ? "Applied" : "Reference", source: r.currency === "USD" ? "Base currency" : "Reference catalogue (refresh before use)", at: 0,
}));
export async function ratesOf(t: PTx): Promise<{ stored: PRec<Rate>[]; all: Rate[] }> {
  const stored = await t.list<Rate>("billing-rate");
  const by = new Map(stored.map((x) => [x.id, x.data]));
  return { stored, all: [...REFERENCE_RATES.map((r) => by.get(r.code) ?? r), ...stored.filter((x) => !REFERENCE_RATES.some((r) => r.code === x.id)).map((x) => x.data)] };
}
/** The applied rate for a currency (units per USD), or null when there is none in force. */
export async function appliedRate(t: PTx, currency: string): Promise<number | null> {
  if (currency === "USD") return 1;
  const r = (await ratesOf(t)).all.find((x) => x.currency === currency && x.status === "Applied" && x.rate > 0) ?? (await ratesOf(t)).all.find((x) => x.currency === currency && x.status === "Held" && x.rate > 0 && x.at > 0);
  return r ? r.rate : null; // a held rate keeps its last applied value; a reference value is never used
}
export const usdCents = (minor: number, rate: number | null) => (rate ? Math.round(minor / rate) : null);

const ECB = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const ER = "https://open.er-api.com/v6/latest/USD";
export interface FeedResult { ecb: Record<string, number> | null; ecbAt: number; er: Record<string, number> | null; erAt: number; errors: string[] }
/** Both feeds, as units per USD. A feed that fails is reported; the other is still used. */
export async function readFeeds(net: Net = httpsNet): Promise<FeedResult> {
  const out: FeedResult = { ecb: null, ecbAt: 0, er: null, erAt: 0, errors: [] };
  try {
    const r = await net(ECB); if (r.status !== 200) throw new Error();
    const day = /time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(r.text)?.[1]; const eur: Record<string, number> = { EUR: 1 };
    for (const m of r.text.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) eur[m[1]] = Number(m[2]);
    if (!eur.USD || !day) throw new Error();
    out.ecb = Object.fromEntries(Object.entries(eur).map(([k, v]) => [k, v / eur.USD])); out.ecbAt = Date.parse(`${day}T16:00:00Z`);
  } catch { out.errors.push("The European Central Bank feed could not be read."); }
  try {
    const r = await net(ER); if (r.status !== 200) throw new Error();
    const j = JSON.parse(r.text) as { result?: string; rates?: Record<string, number>; time_last_update_unix?: number };
    if (j.result !== "success" || !j.rates?.USD) throw new Error();
    out.er = j.rates; out.erAt = Number(j.time_last_update_unix ?? 0) * 1000;
  } catch { out.errors.push("The open.er-api.com feed could not be read."); }
  return out;
}
/** What the hold rules say about one currency: the value to apply, or why it is held. */
export function judge(cur: Rate, f: FeedResult, now: number): { apply: number | null; candidate?: Rate["candidate"] } {
  const ecb = f.ecb?.[cur.currency] ?? null; const er = f.er?.[cur.currency] ?? null;
  const fresh = (v: number | null, at: number) => (v && now - at <= 48 * 3600_000 ? v : null);
  const a = fresh(ecb, f.ecbAt); const b = fresh(er, f.erAt);
  const value = a && b ? (a + b) / 2 : a ?? b;
  const hold = (reason: string, v: number | null) => ({ apply: null, candidate: { rate: Number((v ?? 0).toFixed(6)), ecb, er, at: now, reason } });
  if (!value) return hold(ecb || er ? "The only feed with this currency is older than 48 hours." : "Neither feed has this currency.", ecb ?? er);
  if (a && b && Math.abs(a - b) / ((a + b) / 2) > 0.01) return hold(`The feeds disagree by ${((Math.abs(a - b) / ((a + b) / 2)) * 100).toFixed(2)} % (more than 1 %).`, value);
  if (cur.status !== "Reference" && cur.rate > 0 && cur.at > 0 && Math.abs(value - cur.rate) / cur.rate > 0.03) return hold(`Moved ${((Math.abs(value - cur.rate) / cur.rate) * 100).toFixed(2)} % from the applied rate (more than 3 %).`, value);
  return { apply: Number(value.toFixed(6)) };
}

/* ---------------- accounts, invoices, ledger ---------------- */
export interface Account {
  tenantId: string; ref: string; company: string; plan: string; cycle: string; currency: string; country: string; contact: { name: string; email: string }; address: string; method: string;
  status: "Active" | "Trial"; trialEnds?: string; nextPeriod: string; pendingPlan?: { plan: string; requestedBy: string; at: number; source: string }; createdBy: string; at: number;
}
export interface Invoice {
  id: string; tenantId: string; ref: string; company: string; from: string; to: string; issuedAt: number; dueAt: number; currency: string;
  lines: { text: string; qty: number; unit: number; amount: number }[]; subtotal: number; taxType: string; taxRate: number; tax: number; total: number;
  rate: { perUsd: number; source: string; lockedAt: number }; status: "Open" | "Paid" | "Void" | "Written off";
  paid: number; credited: number; refunded: number; writtenOff: number; providerPaid: number; checkout?: { id: string; url: string; at: number };
}
export interface Entry { id: string; invoiceId: string; type: "payment" | "credit" | "refund" | "writeoff" | "void" | "markpaid"; amount: number; currency: string; at: number; by: string; reason: string; ticket: string; approvalId?: string; provider?: string }
export const outstanding = (i: Invoice) => (i.status === "Open" ? Math.max(0, i.total - i.paid - i.credited) : 0);
export const pastDue = (i: Invoice, now: number) => i.status === "Open" && outstanding(i) > 0 && now > i.dueAt;
export const shown = (i: Invoice, now: number) => (pastDue(i, now) ? "Past due" : i.status);
export const money = (minor: number, cur: string) => `${(minor / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;
const addMonths = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const dayBefore = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) - DAY).toISOString().slice(0, 10);

/** Issues the invoice of an account's next period (if it starts on or before `upTo`), locking today's rate and tax. Null when not due. */
export async function issueFor(t: PTx, acc: PRec<Account>, upTo: string, by: string): Promise<{ invoice?: Invoice; skipped?: string }> {
  const a = acc.data; if (a.status === "Trial" && a.trialEnds && a.trialEnds > upTo) return { skipped: "on trial" };
  if (a.nextPeriod > upTo) return { skipped: "not due yet" };
  const prices = (await priceList(t)).data; const plan = a.pendingPlan?.plan && prices.plans[a.pendingPlan.plan] ? a.pendingPlan.plan : a.plan;
  const p = prices.plans[plan]; if (!p) return { skipped: `plan ${plan} has no price` };
  const months = CYCLES[a.cycle] ?? 1; const rate = await appliedRate(t, a.currency);
  if (!rate) return { skipped: `no applied exchange rate for ${a.currency}` };
  const tax = (await ratesOf(t)).all.find((x) => x.code === a.country);
  if (!tax) return { skipped: `no tax rule for country ${a.country}` };
  const unit = Math.round(p.monthly * rate); const subtotal = unit * months; const taxMinor = Math.round((subtotal * tax.taxRate) / 100);
  const from = a.nextPeriod; const to = dayBefore(addMonths(from, months));
  const year = from.slice(0, 4); const id = `INV-${year}-${String(await t.next(`invoice-${year}`, 0)).padStart(5, "0")}`;
  const inv: Invoice = {
    id, tenantId: a.tenantId, ref: a.ref, company: a.company, from, to, issuedAt: t.now, dueAt: t.now + DUE_DAYS * DAY, currency: a.currency,
    lines: [{ text: `${plan} plan, ${a.cycle.toLowerCase()} (${from} to ${to})`, qty: months, unit, amount: subtotal }], subtotal, taxType: tax.taxType, taxRate: tax.taxRate, tax: taxMinor, total: subtotal + taxMinor,
    rate: { perUsd: rate, source: a.currency === "USD" ? "Base currency" : "Applied rate", lockedAt: t.now }, status: "Open", paid: 0, credited: 0, refunded: 0, writtenOff: 0, providerPaid: 0,
  };
  await t.insert("billing-invoice", id, a.tenantId, inv);
  a.nextPeriod = addMonths(from, months); if (a.pendingPlan) { a.plan = plan; delete a.pendingPlan; } if (a.status === "Trial") { a.status = "Active"; delete a.trialEnds; }
  await t.update("billing-account", acc.id, a, acc.version);
  await t.audit("invoice.issued", `${id} ${a.ref}: ${money(inv.total, inv.currency)} (${a.cycle}, ${from} to ${to}; rate ${rate}; ${tax.taxType} ${tax.taxRate} %) by ${by}`, "Billing", a.tenantId);
  return { invoice: inv };
}

/** The ledger effect of a finance action, checked again at the moment it is applied. */
export type FinanceKind = "credit" | "refund" | "markpaid" | "writeoff" | "void";
export function financeBlock(kind: FinanceKind, inv: Invoice, amount: number): string | null {
  if (kind === "void") return inv.status !== "Open" ? "Only an open invoice can be voided." : inv.paid > 0 ? "This invoice has payments: refund them instead of voiding it." : null;
  if (amount <= 0) return "Enter an amount greater than 0.";
  if (kind === "credit") return inv.status !== "Open" ? "Only an open invoice can be credited." : amount > outstanding(inv) ? `A credit cannot exceed the amount still due (${money(outstanding(inv), inv.currency)}).` : null;
  if (kind === "refund") return inv.paid - inv.refunded <= 0 ? "Nothing has been paid on this invoice." : amount > inv.paid - inv.refunded ? `A refund cannot exceed what was paid and not refunded (${money(inv.paid - inv.refunded, inv.currency)}).` : null;
  if (kind === "markpaid" || kind === "writeoff") return inv.status !== "Open" || outstanding(inv) <= 0 ? "Nothing is due on this invoice." : amount !== outstanding(inv) ? "This action covers the full amount still due." : null;
  return null;
}
export async function applyFinance(t: PTx, rec: PRec<Invoice>, kind: FinanceKind, amount: number, meta: { by: string; reason: string; ticket: string; approvalId?: string; provider?: string }) {
  const inv = rec.data; const bad = financeBlock(kind, inv, amount); if (bad) throw new WsRefused(bad, 409);
  if (kind === "credit") inv.credited += amount;
  if (kind === "refund") inv.refunded += amount;
  if (kind === "markpaid") { inv.paid += amount; }
  if (kind === "writeoff") { inv.writtenOff += outstanding(inv); inv.status = "Written off"; }
  if (kind === "void") inv.status = "Void";
  if (inv.status === "Open" && outstanding(inv) === 0 && inv.total > 0) inv.status = "Paid";
  const id = `E-${await t.next("billing-entry", 0)}`;
  await t.insert("billing-entry", id, inv.tenantId, { id, invoiceId: inv.id, type: kind, amount: kind === "void" ? inv.total : amount, currency: inv.currency, at: t.now, by: meta.by, reason: meta.reason, ticket: meta.ticket, approvalId: meta.approvalId, provider: meta.provider } satisfies Entry);
  await t.update("billing-invoice", rec.id, inv, rec.version);
  await t.audit(`invoice.${kind}.applied`, `${inv.id} ${inv.ref}: ${money(kind === "void" ? inv.total : amount, inv.currency)}; reason: ${meta.reason}; ticket ${meta.ticket}${meta.approvalId ? `; approved (${meta.approvalId})` : ""}; by ${meta.by}`, "Billing", inv.tenantId);
  return inv;
}

/* ---------------- payment provider (Stripe) ---------------- */
export interface Payments { mode: "test" | "live"; checkout(inv: Invoice, amount: number, site: string, idempotency: string): Promise<{ id: string; url: string }>; refund(paymentIntent: string, amount: number, idempotency: string): Promise<string>; webhookSecret: string }
export function stripeFromEnv(e: Record<string, string | undefined>, net: Net = httpsNet): Payments | undefined {
  const key = e.STRIPE_SECRET_KEY; const whsec = e.STRIPE_WEBHOOK_SECRET; if (!key || !whsec || !/^(sk|rk)_(test|live)_/.test(key)) return undefined;
  const call = async (path: string, form: Record<string, string>, idem: string) => {
    const r = await net(`https://api.stripe.com/v1/${path}`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded", "idempotency-key": idem }, body: new URLSearchParams(form).toString() });
    if (r.status !== 200) throw new WsRefused(`The payment provider refused the request (${r.status}).`, 502);
    return JSON.parse(r.text) as Record<string, unknown>;
  };
  return {
    mode: key.includes("_live_") ? "live" : "test", webhookSecret: whsec,
    async checkout(inv, amount, site, idem) {
      const j = await call("checkout/sessions", {
        mode: "payment", "line_items[0][quantity]": "1", "line_items[0][price_data][currency]": inv.currency.toLowerCase(), "line_items[0][price_data][unit_amount]": String(amount),
        "line_items[0][price_data][product_data][name]": `Invoice ${inv.id}`, client_reference_id: inv.id, "metadata[invoice]": inv.id, "metadata[tenant]": inv.tenantId,
        "payment_intent_data[metadata][invoice]": inv.id, success_url: `${site}/ws/billingws?paid=${encodeURIComponent(inv.id)}`, cancel_url: `${site}/ws/billingws`,
      }, idem);
      return { id: String(j.id), url: String(j.url) };
    },
    async refund(pi, amount, idem) { const j = await call("refunds", { payment_intent: pi, amount: String(amount) }, idem); return String(j.id); },
  };
}
/** Stripe's webhook signature: `t=<seconds>,v1=<hex HMAC-SHA256 of "t.body">`, within 5 minutes. */
export function stripeSignatureOk(header: string | undefined, raw: Uint8Array, secret: string, now: number): boolean {
  const parts = Object.fromEntries(String(header ?? "").split(",").map((p) => p.split("=").map((x) => x.trim())).filter((p) => p.length === 2)) as Record<string, string>;
  const ts = Number(parts.t); if (!ts || Math.abs(now / 1000 - ts) > 300) return false;
  const want = createHmac("sha256", secret).update(`${ts}.`).update(Buffer.from(raw)).digest();
  const sigs = String(header).split(",").filter((p) => p.trim().startsWith("v1=")).map((p) => Buffer.from(p.trim().slice(3), "hex"));
  return sigs.some((s) => s.length === want.length && timingSafeEqual(s, want));
}
