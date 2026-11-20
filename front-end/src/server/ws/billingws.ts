/* Server-only. A company's own billing (production programme group 8a; inventory group 8, section 1.6): its billing account, invoices and
   payments as the platform keeps them (migration 0010, read through the company's own rows only). Company admins only. Decisions:
   - A plan change is a request for the next period: the platform accepts it (it applies at the next invoice) or declines it. Nothing changes
     at once, and nothing is charged pro rata.
   - Paying: when the platform has a payment provider configured, an open invoice is paid on the provider's hosted page (no card data
     reaches Selvara); the payment is recorded only when the provider confirms it (the webhook). Otherwise invoices are paid by bank transfer.
   - The card shown is the provider's, never typed here; there is no "update payment method" form in production. */
import { outstanding, priceList, REFERENCE_PRICES, shown, stripeFromEnv, type Account, type Entry, type Invoice, type PriceList } from "../billing";
import { MemoryPlatStore, type PlatStore } from "../platstore";
import { randomBytes } from "node:crypto";
import type { Deps } from "../types";
import { expireEarlier } from "../admin8";
import { invalid, missing, ok, refuse, str, txt, wsRoute, type WsHelpers } from "./common";

const pstoreOf = (d: Deps): PlatStore => (d.pstore ??= new MemoryPlatStore(d.store));
const pay = (d: Deps) => (d.payments === undefined ? stripeFromEnv(process.env, d.net) : d.payments);

export function billingWsRoutes(h: WsHelpers) {
  const admin = (role: string) => refuse(role === "admin" ? null : "Only a company admin can see and change billing.");
  const data = wsRoute(h, "billingws", async (d, _r, c) => {
    admin(c.actor.role);
    return ok(await pstoreOf(d).company(c.actor.tenantId, c.actor.id, d.now(), async (v) => {
      const now = d.now(); const acc = (await v.list<Account>("billing-account"))[0]?.data ?? null;
      const invoices = (await v.list<Invoice>("billing-invoice")).map((x) => x.data);
      const answers = new Map((await v.list<{ accepted: boolean; by: string; at: number; reason: string }>("billing-plan-answer")).map((x) => [x.id, x.data]));
      const prices = (await v.prices<PriceList>()) ?? REFERENCE_PRICES;
      return {
        account: acc ? { plan: acc.plan, cycle: acc.cycle, currency: acc.currency, status: acc.status, trialEnds: acc.trialEnds ?? null, nextPeriod: acc.nextPeriod, contact: acc.contact, method: acc.method, pendingPlan: acc.pendingPlan?.plan ?? null } : null,
        invoices: invoices.map((i) => ({ id: i.id, from: i.from, to: i.to, issued: new Date(i.issuedAt).toISOString().slice(0, 10), due: new Date(i.dueAt).toISOString().slice(0, 10), currency: i.currency, lines: i.lines, subtotal: i.subtotal, taxType: i.taxType, taxRate: i.taxRate, tax: i.tax, total: i.total, paid: i.paid, credited: i.credited, refunded: i.refunded, outstanding: outstanding(i), status: shown(i, now) })).reverse(),
        payments: (await v.list<Entry>("billing-entry")).map((x) => x.data).filter((e) => ["payment", "markpaid", "refund", "credit"].includes(e.type)).map((e) => ({ id: e.id, invoiceId: e.invoiceId, type: e.type, amount: e.amount, currency: e.currency, at: new Date(e.at).toISOString().slice(0, 10) })).reverse(),
        requests: (await v.list<{ plan: string; at: number; byName?: string }>("billing-plan-request")).map((x) => ({ id: x.id, plan: x.data.plan, at: new Date(x.data.at).toISOString().slice(0, 10), by: x.data.byName ?? "", answer: answers.get(x.id) ?? null })).reverse(),
        plans: Object.entries(prices.plans).map(([name, p]) => ({ name, monthlyUsd: p.monthly, seats: p.seats })), canPay: !!pay(d),
      };
    }));
  });
  const planRequest = wsRoute(h, "billingws", async (d, r, c) => {
    admin(c.actor.role);
    const plan = txt(r.body.plan, 40);
    return pstoreOf(d).company(c.actor.tenantId, c.actor.id, d.now(), async (v) => {
      const acc = (await v.list<Account>("billing-account"))[0]?.data; if (!acc) invalid("Your company has no billing account yet. The Selvara team sets it up.");
      const prices = (await v.prices<PriceList>()) ?? REFERENCE_PRICES; if (!prices.plans[plan]) invalid("Choose a plan from the list.");
      if (plan === acc!.plan && !acc!.pendingPlan) invalid("That is already your plan.");
      const answered = new Set((await v.list("billing-plan-answer")).map((x) => x.id));
      if ((await v.list("billing-plan-request")).some((x) => !answered.has(x.id))) invalid("A plan change is already waiting for the Selvara team.");
      const id = `PR-${c.actor.tenantId.slice(0, 8)}-${d.now().toString(36)}`;
      await v.request("billing-plan-request", id, { plan, at: d.now(), byName: c.actor.name, company: acc!.company });
      await d.ws.tx(c.actor, d.now(), (t) => t.audit("billing.plan_change.requested", `${acc!.plan} → ${plan} from the next period (${id})`, "System"));
      return ok({ id, plan });
    });
  });
  /** The provider's hosted payment page for what is still due on one of the company's invoices. */
  const payInvoice = wsRoute(h, "billingws", async (d, r, c) => {
    admin(c.actor.role);
    const p = pay(d); if (!p) invalid("Card payment is not set up. Pay by bank transfer, using the invoice number as the reference.");
    const inv = await pstoreOf(d).company(c.actor.tenantId, c.actor.id, d.now(), async (v) => (await v.list<Invoice>("billing-invoice")).find((x) => x.id === str(r.path[3], 40))?.data ?? null);
    if (!inv) return missing("Invoice");
    const due = outstanding(inv!); if (!due) invalid("Nothing is due on this invoice.");
    const earlier = await pstoreOf(d).company(c.actor.tenantId, c.actor.id, d.now(), async (v) => (await v.list<{ invoiceId: string; session: string }>("billing-checkout")).map((x) => x.data));
    await expireEarlier(p!, inv!, earlier);
    const ses = await p!.checkout(inv!, due, d.site.origin, `checkout-${inv!.id}-${due}-${Math.floor(d.now() / 3600_000)}`);
    await pstoreOf(d).company(c.actor.tenantId, c.actor.id, d.now(), (v) => v.request("billing-checkout", `CO-${inv!.id}-${d.now().toString(36)}-${randomBytes(3).toString("hex")}`, { invoiceId: inv!.id, session: ses.id, at: d.now(), byName: c.actor.name }));
    await d.ws.tx(c.actor, d.now(), (t) => t.audit("invoice.payment_started", `${inv!.id}: payment page opened by ${c.actor.name} (${p!.mode})`, "System"));
    return ok({ url: ses.url });
  });
  void priceList;
  return { "GET ws/data/billingws": data, "POST ws/billing/plan-request": planRequest, "POST ws/billing/invoices/:id/pay": payInvoice };
}
