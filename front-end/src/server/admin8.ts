/* Server-only. The Admin Console's billing, exchange rates and tax, admin-level MFA resets and sign-in blocks (production programme group 8a).
   Platform staff only: support reads (and may ask for an MFA reset), and only a platform super admin with a live elevation changes anything.
   Rules (docs/security/SOD_MATRIX.md, the Billing, Rates and MFA rows; decisions in docs/architecture/PRODUCTION_PROGRAMME.md, group 8):
   - Credits, refunds and manual "paid" marks above USD 1,000 (or in a currency without an applied rate), every write-off, voids above the
     threshold, every price-list change, releasing a held rate and every rate or tax override are requests another elevated super admin
     approves. Below the threshold one elevated super admin applies it. Every action needs a reason (15 characters) and a ticket.
   - Rejecting a held rate keeps the rate in force (safe direction): one elevated super admin, with a reason.
   - An admin-level MFA reset (a company admin or owner who lost their authenticator) is asked by support or an elevated super admin, after
     three identity checks, with a ticket and a named second super admin, who alone decides it. On approval the person's authenticators and
     recovery codes are removed and every session ends; they and the company's log are told.
   - Sign-in blocks are listed for staff and lifted by an elevated super admin with a reason.
   Everything is written to the platform's log; billing changes to a company also to the company's own log. */
import { reasonBlock } from "@/lib/rules";
import { applyFinance, appliedRate, stripeSignatureOk, DAY, FINANCE_DUAL_USD_CENTS, financeBlock, issueFor, METHODS, money, outstanding, priceList, ratesOf, readFeeds, judge, REFERENCE_RATES, shown, stripeFromEnv, usdCents, CYCLES,
  type Account, type Entry, type FinanceKind, type Invoice, type PriceList, type Rate } from "./billing";
import type { Ctx, Req, Res } from "./core";
import type { ApprovalRow } from "./directory";
import type { Tx } from "./db";
import type { PActor, PTx, PlatStore } from "./platstore";
import { MemoryPlatStore } from "./platstore";
import type { AuditRow, Deps } from "./types";
import { WsConflict, WsRefused } from "./ws/store";

type H = (d: Deps, r: Req) => Promise<Res>;
export interface Admin8Helpers { signed: (h: (d: Deps, r: Req, c: Ctx) => Promise<Res>) => H; entry: (d: Deps, r: Req, p: Ctx["p"], a: Ctx["a"], action: string, target: string) => AuditRow }
const ok = (body?: unknown): Res => ({ status: body === undefined ? 204 : 200, body });
const err = (status: number, error: string): Res => ({ status, body: { error } });
const s = (v: unknown, max = 300) => String(v ?? "").slice(0, max).trim();
const TICKET = /^[A-Z]{2,6}-\d{1,6}$/; const HOUR = 3600_000; const MIN_REASON = 15;
const ELEVATE = "Elevate to make changes.";
export const MFA_CHECKS = ["call-back", "sponsor", "id"]; export const MFA_REASONS = ["Lost or replaced phone", "Authenticator app removed", "Security key lost", "Locked out after device reset"];
const pstoreOf = (d: Deps): PlatStore => (d.pstore ??= new MemoryPlatStore(d.store));
const actorOf = (c: Ctx, r: Req): PActor => ({ id: c.p.id, name: c.p.person, ip: r.ip });
/** Runs a change: in the approval's own transaction (Pg), or in a unit of work of its own (the in-memory stand-in). */
const within = <T,>(d: Deps, q: Tx | null, a: PActor, work: (t: PTx) => Promise<T>) => (q ? work(pstoreOf(d).over(q, a, d.now())) : pstoreOf(d).tx(a, d.now(), work));
const answer = async (f: () => Promise<Res>): Promise<Res> => { try { return await f(); } catch (e) { if (e instanceof WsRefused) return err(e.status, e.message); if (e instanceof WsConflict) return err(409, e.message); throw e; } };
const meta = (r: Req) => { const reason = s(r.body.reason); const ticket = s(r.body.ticket, 12).toUpperCase(); return { reason, ticket, bad: reason.length < MIN_REASON ? `Give a reason of at least ${MIN_REASON} characters.` : !TICKET.test(ticket) ? "Enter a ticket reference such as FIN-1234." : null }; };
const minor = (v: unknown) => { const n = Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(n) && n > 0 && n <= 1e10 ? Math.round(n * 100) : 0; };
const invoiceView = (i: Invoice, now: number) => ({ ...i, status: shown(i, now), outstanding: outstanding(i), due: new Date(i.dueAt).toISOString().slice(0, 10), issued: new Date(i.issuedAt).toISOString().slice(0, 10) });

/* ---------------- what an approved group 8 request does (in the decision's transaction) ---------------- */
export async function applyGroup8(d: Deps, q: Tx | null, a: ApprovalRow, approvers: string, decider: PActor) {
  const p = a.payload as Record<string, unknown>; const by = `requested by ${a.requestedByName}; approved by ${approvers}`;
  if (a.kind.startsWith("billing.") && a.kind !== "billing.pricing") {
    await within(d, q, decider, async (t) => {
      const rec = await t.get<Invoice>("billing-invoice", String(p.invoiceId)); if (!rec) throw new WsRefused("The invoice no longer exists.", 409);
      const kind = a.kind.slice(8) as FinanceKind; const amount = kind === "void" ? 0 : Number(p.amount);
      let provider: string | undefined;
      if (kind === "refund") provider = await providerRefund(d, t, rec.data, amount, a.id);
      await applyFinance(t, rec, kind, amount, { by, reason: String(p.reason), ticket: String(p.ticket), approvalId: a.id, provider });
    });
  } else if (a.kind === "billing.pricing") {
    await within(d, q, decider, async (t) => {
      const cur = await priceList(t); const next: PriceList = { version: cur.data.version + 1, plans: p.plans as PriceList["plans"], at: t.now, by };
      if (cur.version === 0) await t.insert("billing-price", "current", null, next); else await t.update("billing-price", "current", next, cur.version);
      await t.audit("pricing.updated", `version ${next.version}: ${Object.entries(next.plans).map(([k, v]) => `${k} ${money(v.monthly, "USD")}/month, ${v.seats} seats`).join("; ")}; reason: ${p.reason}; ticket ${p.ticket}; ${by}`);
    });
  } else if (a.kind === "rates.release" || a.kind === "rates.override") {
    await within(d, q, decider, async (t) => {
      const rec = await t.get<Rate>("billing-rate", String(p.code)); const cur = rec?.data ?? REFERENCE_RATES.find((x) => x.code === p.code); if (!cur) throw new WsRefused("Rate not found.", 409);
      const next: Rate = { ...cur };
      if (a.kind === "rates.release") {
        if (cur.status !== "Held" || !cur.candidate || cur.candidate.at !== Number(p.candidateAt)) throw new WsRefused("The held rate changed since this was requested. Reject this request.", 409);
        next.previous = cur.rate > 0 && cur.at > 0 ? { rate: cur.rate, until: t.now } : undefined; next.rate = cur.candidate.rate; next.status = "Applied"; next.source = "Feeds (released by a person)"; next.at = t.now; delete next.candidate;
      } else {
        if (cur.status === "Held") throw new WsRefused("The rate is now held; resolve it first. Reject this request.", 409);
        const v = p.values as { currency: string; rate: number; taxType: string; taxRate: number; taxEffective: string };
        next.previous = cur.rate > 0 && cur.at > 0 ? { rate: cur.rate, until: t.now } : undefined;
        Object.assign(next, { currency: v.currency, rate: v.rate, taxType: v.taxType, taxRate: v.taxRate, taxEffective: v.taxEffective, status: "Applied", source: "Override (approved)", at: t.now });
      }
      if (rec) await t.update("billing-rate", rec.id, next, rec.version); else await t.insert("billing-rate", next.code, null, next);
      await t.audit(a.kind === "rates.release" ? "rate.held.released" : "rate.override.applied", `${next.country} ${next.currency}: ${cur.rate} → ${next.rate}; ${next.taxType} ${next.taxRate} % from ${next.taxEffective}; reason: ${p.reason}; ticket ${p.ticket}; ${by}`);
    });
  } else if (a.kind === "mfa-reset-admin") {
    const uid = String(p.userId);
    // the person's authenticators go (Supabase), then their recovery codes and every session, in every company
    await d.auth.resetMfa(uid); await d.store.replaceRecovery(uid, []);
    for (const ss of await d.store.sessionsOf(uid)) if (!ss.revokedAt) await d.store.updateSession(ss.idHash, { revokedAt: d.now(), revokedWhy: "MFA reset by the platform" });
    await d.store.insertNotice({ id: `n${d.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, userId: uid, at: d.now(), text: "Selvara's support team reset your multi-factor authentication. Sign in again and enrol a new authenticator. If you did not ask for this, contact your company admin at once." });
    await within(d, q, decider, (t) => t.audit("mfa.reset.approved", `${p.person} (${p.company}); ticket ${p.ticket}; identity checks: call-back, sponsor, ID; ${by}; effects: authenticators and recovery codes removed, sessions ended, person told`, "Authentication", String(p.tenantId)));
  } else throw new WsRefused("This request cannot be applied here.", 409);
}
/** A refund of a payment that came through the provider goes back through it (idempotent by the request id). */
async function providerRefund(d: Deps, t: PTx, inv: Invoice, amount: number, idem: string): Promise<string | undefined> {
  const pay = d.payments === undefined ? stripeFromEnv(process.env, d.net) : d.payments; if (!inv.providerPaid) return undefined;
  if (!pay) throw new WsRefused("This invoice was paid through the payment provider, which is not configured any more. Refund it there.", 409);
  const pi = (await t.list<Entry>("billing-entry", inv.tenantId)).map((x) => x.data).find((x) => x.invoiceId === inv.id && x.type === "payment" && x.provider?.startsWith("stripe:"))?.provider?.slice(7);
  if (!pi) return undefined;
  return `stripe:${await pay.refund(pi, Math.min(amount, inv.providerPaid), `refund-${idem}`)}`;
}

export function admin8Routes(h: Admin8Helpers): Record<string, H> {
  const staff = (fn: (d: Deps, r: Req, c: Ctx) => Promise<Res>) => h.signed(async (d, r, c) => (c.a.platform ? answer(() => fn(d, r, c)) : err(403, "Not permitted.")));
  const elevated = (fn: (d: Deps, r: Req, c: Ctx) => Promise<Res>) => staff(async (d, r, c) => {
    if (c.a.role !== "super") return err(403, "Not permitted.");
    return (await d.plat.elevation(c.p.id, d.now())) ? fn(d, r, c) : err(403, ELEVATE);
  });
  const second = async (d: Deps, c: Ctx) => ((await d.plat.superAdmins(c.p.id)).filter((x) => x !== c.p.id).length < 1 ? "No other platform super admin can approve this. Add a second one first." : null);
  /** A request another elevated super admin approves (one open request per kind and subject). */
  const request = async (d: Deps, r: Req, c: Ctx, kind: string, subject: string, title: string, payload: Record<string, unknown>, forbid: string[] = []) => {
    const none = await second(d, c); if (none) return err(409, none);
    if (await d.plat.pendingApproval(c.p.id, kind, subject, d.now())) return err(409, "A request for this item is already waiting for approval.");
    const id = await d.plat.requestApproval(c.p.id, { kind, title, subject, payload, ttlMs: 24 * HOUR, forbid }, d.now(), h.entry(d, r, c.p, c.a, `approval.${kind}.requested`, title));
    return { status: 202, body: { pending: true, id } } as Res;
  };
  const pay = (d: Deps) => (d.payments === undefined ? stripeFromEnv(process.env, d.net) : d.payments);

  /* ---------- billing ---------- */
  const billingData = staff(async (d, _r, c) => ok(await pstoreOf(d).tx(actorOf(c, _r), d.now(), async (t) => {
    const now = d.now(); const accounts = await t.list<Account>("billing-account"); const invoices = (await t.list<Invoice>("billing-invoice")).map((x) => x.data);
    const companies = await d.plat.companies(c.p.id); const p = pay(d);
    const requests = (await t.list<{ plan: string; by?: string; at: number; status?: string; company?: string }>("billing-plan-request")).map((x) => ({ id: x.id, tenantId: x.tenantId, ...x.data }));
    return {
      accounts: accounts.map((x) => { const mine = invoices.filter((i) => i.tenantId === x.id); return { ...x.data, balance: mine.reduce((n, i) => n + outstanding(i), 0), pastDue: mine.filter((i) => shown(i, now) === "Past due").length, lastInvoice: mine.at(-1)?.id ?? null }; }),
      invoices: invoices.map((i) => invoiceView(i, now)).reverse(), entries: (await t.list<Entry>("billing-entry")).map((x) => x.data).reverse().slice(0, 300),
      companies: companies.map((x) => ({ id: x.id, ref: x.ref, name: x.name, status: x.status, hasAccount: accounts.some((a) => a.id === x.id) })),
      prices: (await priceList(t)).data, methods: METHODS.filter((m) => m !== "Card (Stripe)" || !!p), payments: p ? { mode: p.mode } : null, planRequests: requests.filter((x) => !x.status).reverse(),
      thresholdUsd: FINANCE_DUAL_USD_CENTS / 100,
    };
  })));
  /** Sets up (or changes) a company's billing account: plan, cycle, currency, country (tax), contact, address, method. Changes apply from the next invoice. */
  const accountSave = elevated(async (d, r, c) => {
    const m = meta(r); if (m.bad) return err(400, m.bad);
    const tenantId = s(r.body.tenantId, 40); const co = (await d.plat.companies(c.p.id)).find((x) => x.id === tenantId); if (!co) return err(404, "Company not found.");
    const plan = s(r.body.plan, 40); const cycle = s(r.body.cycle, 20); const currency = s(r.body.currency, 3).toUpperCase(); const country = s(r.body.country, 2).toUpperCase(); const method = s(r.body.method, 40);
    const contact = { name: s(r.body.contactName, 80), email: s(r.body.contactEmail, 254).toLowerCase() }; const address = s(r.body.address, 300);
    return pstoreOf(d).tx(actorOf(c, r), d.now(), async (t) => {
      const prices = (await priceList(t)).data;
      if (!prices.plans[plan]) return err(400, "Choose a plan from the price list.");
      if (!CYCLES[cycle]) return err(400, "Choose Monthly, Quarterly or Annual.");
      if (!(await ratesOf(t)).all.some((x) => x.code === country)) return err(400, "Choose a country from the rates and tax list.");
      if (!(await ratesOf(t)).all.some((x) => x.currency === currency)) return err(400, "Choose a currency from the rates list.");
      if (!METHODS.includes(method) || (method === "Card (Stripe)" && !pay(d))) return err(400, "Choose a billing method that is configured.");
      if (!contact.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) return err(400, "Enter the billing contact's name and email.");
      const rec = await t.get<Account>("billing-account", tenantId); const today = new Date(t.now).toISOString().slice(0, 10);
      const trialDays = Math.max(0, Math.min(90, Number(r.body.trialDays) || 0));
      const next: Account = rec ? { ...rec.data, plan, cycle, currency, country, contact, address, method }
        : { tenantId, ref: co.ref, company: co.name, plan, cycle, currency, country, contact, address, method, status: trialDays ? "Trial" : "Active", trialEnds: trialDays ? new Date(t.now + trialDays * DAY).toISOString().slice(0, 10) : undefined, nextPeriod: trialDays ? new Date(t.now + trialDays * DAY).toISOString().slice(0, 10) : today, createdBy: c.p.person, at: t.now };
      if (rec) await t.update("billing-account", tenantId, next, rec.version); else await t.insert("billing-account", tenantId, tenantId, next);
      await t.audit(rec ? "billing.account.updated" : "billing.account.created", `${co.ref}: ${plan}, ${cycle}, ${currency}, tax country ${country}, ${method}${trialDays && !rec ? `, trial ${trialDays} days` : ""}; reason: ${m.reason}; ticket ${m.ticket}`, "Billing", tenantId);
      return ok(next);
    });
  });
  const pricing = elevated(async (d, r, c) => {
    const m = meta(r); if (m.bad) return err(400, m.bad);
    const raw = (r.body.plans ?? {}) as Record<string, { monthly?: unknown; seats?: unknown }>; const plans: PriceList["plans"] = {};
    for (const [k, v] of Object.entries(raw).slice(0, 10)) {
      const name = s(k, 40); const monthly = Math.round(Number(v?.monthly) * 100); const seats = Math.round(Number(v?.seats));
      if (!/^[A-Za-z][A-Za-z0-9 ]{1,39}$/.test(name) || !(monthly >= 0 && monthly <= 1e8) || !(seats >= 1 && seats <= 100000)) return err(400, "Each plan needs a name, a monthly price (0 to 1,000,000) and seats (1 or more).");
      plans[name] = { monthly, seats };
    }
    if (!Object.keys(plans).length) return err(400, "Give at least one plan.");
    return request(d, r, c, "billing.pricing", "price-list", `Change the price list: ${Object.entries(plans).map(([k, v]) => `${k} ${money(v.monthly, "USD")}/month`).join(", ")}`, { plans, reason: m.reason, ticket: m.ticket });
  });
  /** Issues every invoice due up to a day (each account's next period), locking today's rates and tax. */
  const issue = elevated(async (d, r, c) => {
    const upTo = s(r.body.upTo, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(upTo) || Number.isNaN(Date.parse(upTo))) return err(400, "Choose the last day to invoice up to.");
    if (Date.parse(`${upTo}T00:00:00Z`) > d.now() + 31 * DAY) return err(400, "Invoices can be issued at most a month ahead.");
    return pstoreOf(d).tx(actorOf(c, r), d.now(), async (t) => {
      const issued: string[] = []; const skipped: string[] = [];
      for (const acc of await t.list<Account>("billing-account")) {
        for (let n = 0; n < 12; n++) { const out = await issueFor(t, acc as never, upTo, c.p.person); if (out.invoice) { issued.push(out.invoice.id); const fresh = await t.get<Account>("billing-account", acc.id); if (fresh) Object.assign(acc, fresh); } else { if (n === 0 && out.skipped !== "not due yet") skipped.push(`${acc.data.ref}: ${out.skipped}`); break; } }
      }
      await t.audit("invoices.issued", `${issued.length} invoices up to ${upTo}${skipped.length ? `; skipped: ${skipped.join("; ")}` : ""}`);
      return ok({ issued, skipped });
    });
  });
  /** credit | refund | markpaid | writeoff | void: below the threshold at once, above it (and every write-off) a second super admin approves. */
  const finance = elevated(async (d, r, c) => {
    const kind = r.path[4] as FinanceKind; if (!["credit", "refund", "markpaid", "writeoff", "void"].includes(kind)) return err(404, "Not found.");
    const m = meta(r); if (m.bad) return err(400, m.bad);
    return pstoreOf(d).tx(actorOf(c, r), d.now(), async (t) => {
      const rec = await t.get<Invoice>("billing-invoice", s(r.path[3], 40)); if (!rec) return err(404, "Invoice not found.");
      const inv = rec.data; const amount = kind === "markpaid" || kind === "writeoff" ? outstanding(inv) : kind === "void" ? 0 : minor(r.body.amount);
      const bad = financeBlock(kind, inv, amount); if (bad) return err(400, bad);
      const usd = usdCents(kind === "void" ? inv.total : amount, inv.rate.perUsd);
      const dual = kind === "writeoff" || usd === null || usd > FINANCE_DUAL_USD_CENTS;
      if (dual) {
        const title = `${kind === "markpaid" ? "Mark paid" : kind[0].toUpperCase() + kind.slice(1)} ${money(kind === "void" ? inv.total : amount, inv.currency)} on ${inv.id} (${inv.ref})${usd !== null ? `, about ${money(usd, "USD")}` : ""}`;
        return request(d, r, c, `billing.${kind}`, inv.id, title, { invoiceId: inv.id, amount, reason: m.reason, ticket: m.ticket });
      }
      let provider: string | undefined; if (kind === "refund") provider = await providerRefund(d, t, inv, amount, `${inv.id}-${t.now}`);
      const out = await applyFinance(t, rec, kind, amount, { by: `${c.p.person} (single elevated super admin, below USD ${FINANCE_DUAL_USD_CENTS / 100})`, reason: m.reason, ticket: m.ticket, provider });
      return ok(invoiceView(out, t.now));
    });
  });
  /** A payment link (provider's hosted checkout) for what is still due, to send to the billing contact. */
  const payLink = elevated(async (d, r, c) => {
    const p = pay(d); if (!p) return err(409, "No payment provider is configured. Invoices are paid by bank transfer.");
    return pstoreOf(d).tx(actorOf(c, r), d.now(), async (t) => {
      const rec = await t.get<Invoice>("billing-invoice", s(r.path[3], 40)); if (!rec) return err(404, "Invoice not found.");
      const due = outstanding(rec.data); if (!due) return err(400, "Nothing is due on this invoice.");
      const ses = await p.checkout(rec.data, due, d.site.origin, `checkout-${rec.id}-${due}-${Math.floor(t.now / HOUR)}`);
      rec.data.checkout = { id: ses.id, url: ses.url, at: t.now }; await t.update("billing-invoice", rec.id, rec.data, rec.version);
      await t.audit("invoice.payment_link.created", `${rec.id} ${rec.data.ref}: ${money(due, rec.data.currency)} (${p.mode})`, "Billing", rec.data.tenantId);
      return ok({ url: ses.url });
    });
  });
  /** A company admin asked for another plan from the next period: accepted (it applies at the next invoice) or declined. */
  const planDecide = elevated(async (d, r, c) => {
    const accept = r.path[4] === "accept"; const why = s(r.body.reason); if (why.length < 10) return err(400, "Give a reason of at least 10 characters.");
    return pstoreOf(d).tx(actorOf(c, r), d.now(), async (t) => {
      const rq = await t.get<{ plan: string; at: number; status?: string; byName?: string }>("billing-plan-request", s(r.path[3], 60)); if (!rq || rq.data.status) return err(404, "Request not found.");
      const acc = rq.tenantId ? await t.get<Account>("billing-account", rq.tenantId) : null; if (!acc) return err(409, "This company has no billing account yet.");
      if (accept) { if (!(await priceList(t)).data.plans[rq.data.plan]) return err(400, "That plan is no longer on the price list."); acc.data.pendingPlan = { plan: rq.data.plan, requestedBy: rq.data.byName ?? "company admin", at: rq.data.at, source: rq.id }; await t.update("billing-account", acc.id, acc.data, acc.version); }
      // the request row is the company's; the platform's answer is kept beside it
      await t.insert("billing-plan-answer", rq.id, rq.tenantId, { accepted: accept, by: c.p.person, at: t.now, reason: why });
      await t.audit(accept ? "billing.plan_change.accepted" : "billing.plan_change.declined", `${acc.data.ref}: ${rq.data.plan} from the next period; ${why}`, "Billing", rq.tenantId);
      return ok({ accepted: accept });
    });
  });

  /* ---------- rates and tax ---------- */
  const ratesData = staff(async (d, r, c) => ok(await pstoreOf(d).tx(actorOf(c, r), d.now(), async (t) => {
    const { all } = await ratesOf(t); const last = (await t.get<{ at: number; by: string; errors: string[] }>("billing-rate-refresh", "last"))?.data ?? null;
    return { rates: all, lastRefresh: last, rules: { moveMax: 3, disagreeMax: 1, staleHours: 48 } };
  })));
  const refresh = elevated(async (d, r, c) => {
    const feeds = await readFeeds(d.net); // outside any transaction
    if (!feeds.ecb && !feeds.er) return err(502, feeds.errors.join(" "));
    return pstoreOf(d).tx(actorOf(c, r), d.now(), async (t) => {
      const { all } = await ratesOf(t); let applied = 0; let held = 0;
      for (const cur of all.filter((x) => x.currency !== "USD")) {
        const rec = await t.get<Rate>("billing-rate", cur.code); const v = judge(cur, feeds, t.now); const next: Rate = { ...cur };
        if (v.apply) { if (cur.status === "Applied" && cur.rate > 0 && cur.at > 0) next.previous = { rate: cur.rate, until: t.now }; Object.assign(next, { rate: v.apply, status: "Applied", source: feeds.ecb?.[cur.currency] && feeds.er?.[cur.currency] ? "ECB and open.er-api.com (agree)" : "One feed", at: t.now }); delete next.candidate; applied++; }
        else { next.status = "Held"; next.candidate = v.candidate; held++; }
        if (rec) await t.update("billing-rate", rec.id, next, rec.version); else await t.insert("billing-rate", cur.code, null, next);
      }
      const lr = await t.get("billing-rate-refresh", "last"); const info = { at: t.now, by: c.p.person, errors: feeds.errors };
      if (lr) await t.update("billing-rate-refresh", "last", info, lr.version); else await t.insert("billing-rate-refresh", "last", null, info);
      await t.audit("rates.refreshed", `${applied} applied, ${held} held for a person${feeds.errors.length ? `; ${feeds.errors.join(" ")}` : ""}`);
      return ok({ applied, held, errors: feeds.errors });
    });
  });
  const rateAction = elevated(async (d, r, c) => {
    const code = s(r.path[2], 2).toUpperCase(); const action = r.path[3]; const m = meta(r); if (m.bad) return err(400, m.bad);
    return pstoreOf(d).tx(actorOf(c, r), d.now(), async (t) => {
      const rec = await t.get<Rate>("billing-rate", code); const cur = rec?.data ?? REFERENCE_RATES.find((x) => x.code === code); if (!cur) return err(404, "Rate not found.");
      if (action === "release") {
        if (cur.status !== "Held" || !cur.candidate) return err(400, "This rate is not held.");
        return request(d, r, c, "rates.release", code, `Release the held ${cur.currency} rate for ${cur.country}: ${cur.rate || "none"} → ${cur.candidate.rate} (${cur.candidate.reason})`, { code, candidateAt: cur.candidate.at, reason: m.reason, ticket: m.ticket });
      }
      if (action === "reject") { // safe direction: the rate in force stays
        if (cur.status !== "Held" || !rec) return err(400, "This rate is not held.");
        const next: Rate = { ...cur, status: cur.at > 0 ? "Applied" : "Reference" }; const was = cur.candidate; delete next.candidate;
        await t.update("billing-rate", rec.id, next, rec.version);
        await t.audit("rate.held.rejected", `${cur.country} ${cur.currency}: kept ${cur.rate || "no rate"}, discarded ${was?.rate} (${was?.reason}); reason: ${m.reason}; ticket ${m.ticket}`);
        return ok(next);
      }
      if (action === "override") {
        if (cur.status === "Held") return err(400, "Resolve the held rate first.");
        const currency = s(r.body.currency, 3).toUpperCase(); const rate = Number(r.body.rate); const taxRate = Number(r.body.taxRate); const taxType = s(r.body.taxType, 20); const taxEffective = s(r.body.taxEffective, 10);
        if (!/^[A-Z]{3}$/.test(currency)) return err(400, "Enter a 3-letter currency code, for example USD.");
        if (!(rate > 0 && rate <= 10_000_000)) return err(400, "Enter a rate per 1 USD above 0.");
        if (!(taxRate >= 0 && taxRate <= 100)) return err(400, "Enter a tax rate from 0 to 100.");
        if (!["VAT", "GST", "GST/HST", "Sales tax", "WHT", "None"].includes(taxType)) return err(400, "Choose a tax type from the list.");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(taxEffective)) return err(400, "Choose the date the tax rate applies from.");
        return request(d, r, c, "rates.override", code, `Override ${cur.country}: ${currency} ${rate} per USD; ${taxType} ${taxRate} % from ${taxEffective}`, { code, values: { currency, rate, taxType, taxRate, taxEffective }, reason: m.reason, ticket: m.ticket });
      }
      return err(404, "Not found.");
    });
  });

  /* ---------- admin-level MFA resets ---------- */
  const mfaData = staff(async (d, _r, c) => {
    const admins = await d.plat.companyAdmins(c.p.id);
    const enrolled = await Promise.all(admins.slice(0, 300).map((a) => d.auth.mfaEnrolled(a.userId).catch(() => false)));
    const supers = await Promise.all((await d.plat.superAdmins(c.p.id)).map(async (id) => ({ id, name: (await d.store.profileById(id))?.person ?? "" })));
    const reqs = (await d.plat.approvals(c.p.id)).filter((a) => a.kind === "mfa-reset-admin");
    return ok({
      admins: admins.slice(0, 300).map((a, i) => ({ ...a, mfa: enrolled[i] ? "Enrolled" : "Not enrolled", pending: reqs.some((x) => x.status === "Pending" && x.expiresAt > d.now() && x.subject === a.userId) })),
      supers: supers.filter((x) => x.id !== c.p.id), checks: MFA_CHECKS, reasons: MFA_REASONS,
      requests: reqs.map((x) => ({ id: x.id, status: x.status === "Pending" && x.expiresAt <= d.now() ? "Expired" : x.status, title: x.title, requestedBy: x.requestedByName, mine: x.requestedBy === c.p.id, named: x.payload.namedName, namedId: x.payload.named, ticket: x.payload.ticket, reason: x.payload.reason, person: x.payload.person, company: x.payload.company, at: x.createdAt, expiresAt: x.expiresAt, decided: x.decidedReason ?? null })),
    });
  });
  /** Support (no elevation needed: it only asks) or an elevated super admin asks; the named super admin decides. */
  const mfaRequest = staff(async (d, r, c) => {
    if (c.a.role === "super" && !(await d.plat.elevation(c.p.id, d.now()))) return err(403, ELEVATE);
    const checks = Array.isArray(r.body.checks) ? r.body.checks.map(String) : [];
    if (!MFA_CHECKS.every((x) => checks.includes(x))) return err(400, "Confirm all three identity checks before submitting.");
    const reason = s(r.body.reason, 80); if (!MFA_REASONS.includes(reason)) return err(400, "Choose a reason from the list.");
    const details = s(r.body.details); if (details.length < 10) return err(400, "Describe what you verified (at least 10 characters).");
    const ticket = s(r.body.ticket, 20).toUpperCase(); if (!TICKET.test(ticket)) return err(400, "Enter a ticket reference like SEC-1234.");
    const userId = s(r.body.userId, 40); const tenantId = s(r.body.tenantId, 40); const named = s(r.body.named, 40);
    const who = (await d.plat.companyAdmins(c.p.id)).find((x) => x.userId === userId && x.tenantId === tenantId); if (!who) return err(404, "Admin not found.");
    if (userId === c.p.id) return err(403, "You cannot reset your own MFA.");
    const supers = await d.plat.superAdmins(c.p.id);
    if (!supers.includes(named) || named === c.p.id || named === userId) return err(400, "Choose a named approver from the eligible people.");
    if (await d.plat.pendingApproval(c.p.id, "mfa-reset-admin", userId, d.now())) return err(409, "A reset is already pending for this admin.");
    const namedName = (await d.store.profileById(named))?.person ?? "";
    const title = `Reset MFA of ${who.person} (${who.role}, ${who.company})`;
    const id = await d.plat.requestApproval(c.p.id, { kind: "mfa-reset-admin", title, subject: userId, ttlMs: 24 * HOUR, forbid: [userId],
      payload: { userId, tenantId, person: who.person, company: who.company, reason, details, ticket, named, namedName, checks: MFA_CHECKS } },
      d.now(), h.entry(d, r, c.p, c.a, "approval.mfa-reset-admin.requested", `${title}; ticket ${ticket}; named approver ${namedName}; identity checks: call-back, sponsor, ID`));
    await d.store.insertNotice({ id: `n${d.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, userId: named, at: d.now(), text: `${c.p.person} asks you to approve an MFA reset of ${who.person} (${who.company}), ticket ${ticket}.` });
    return { status: 202, body: { pending: true, id } };
  });
  /** The requester withdraws (safe direction: support may, without elevation). */
  const mfaWithdraw = staff(async (d, r, c) => {
    const o = await d.plat.withdrawApproval({ id: c.p.id, role: c.a.role }, s(r.path[3], 60), d.now(), (action, target) => h.entry(d, r, c.p, c.a, action, target));
    return "error" in o ? err(o.code, o.error) : ok({ status: o.status });
  });

  /* ---------- sign-in blocks ---------- */
  const blocks = staff(async (d) => {
    const idx = (await d.store.kvGet<string[]>("ipblocks", "index")) ?? []; const now = d.now(); const out = [];
    for (const ip of idx.slice(0, 500)) { const rec = await d.store.kvGet<{ level: number; until: number; blocks: number; lastBlockAt: number }>("ip", ip); if (rec && rec.until > now) out.push({ ip, level: rec.level, until: rec.until, blocks: rec.blocks, since: rec.lastBlockAt }); }
    return ok({ blocks: out.sort((a, b) => b.until - a.until) });
  });
  const lift = elevated(async (d, r, c) => {
    const ip = s(r.path[3], 64); const why = s(r.body.reason); if (why.length < MIN_REASON) return err(400, `Give a reason of at least ${MIN_REASON} characters (who asked, how you verified them, the ticket).`);
    const rec = await d.store.kvGet<{ level: number; until: number; fails: number[] }>("ip", ip); if (!rec || rec.until <= d.now()) return err(404, "That address is not blocked.");
    const was = rec.level; rec.until = 0; rec.level = 0; rec.fails = []; await d.store.kvSet("ip", ip, rec, 30 * DAY);
    await d.store.audit(h.entry(d, r, c.p, c.a, "auth.ip.unblocked", `${ip}: level ${was} lifted; reason: ${why}`));
    return ok({ ip });
  });
  void reasonBlock; void appliedRate; void ({} as Entry);

  return {
    "GET admin/billing": billingData, "POST admin/billing/accounts": accountSave, "POST admin/billing/pricing": pricing, "POST admin/billing/issue": issue,
    "POST admin/billing/invoices/:id/:action": finance, "POST admin/billing/invoices/:id/payment-link/create": payLink, "POST admin/billing/plan-requests/:id/:decision": planDecide,
    "GET admin/rates": ratesData, "POST admin/rates/refresh": refresh, "POST admin/rates/:code/:action": rateAction,
    "GET admin/mfa": mfaData, "POST admin/mfa/requests": mfaRequest, "POST admin/mfa/requests/:id/withdraw": mfaWithdraw,
    "GET admin/security/blocks": blocks, "POST admin/security/blocks/:ip/lift": lift,
  };
}

/** The payment provider's webhook (Stripe): authenticated by its signature over the raw body, never by a cookie. Each event once. */
export async function stripeWebhook(d: Deps, r: Req): Promise<Res> {
  const p = d.payments === undefined ? stripeFromEnv(process.env, d.net) : d.payments; if (!p) return err(404, "Not found.");
  if (!r.raw || !stripeSignatureOk(r.headers["stripe-signature"], r.raw, p.webhookSecret, d.now())) return err(400, "Invalid signature.");
  let ev: { id?: string; type?: string; livemode?: boolean; data?: { object?: Record<string, unknown> } };
  try { ev = JSON.parse(Buffer.from(r.raw).toString("utf8")); } catch { return err(400, "Send valid JSON."); }
  if (!ev.id || !/^evt_[A-Za-z0-9]{6,80}$/.test(ev.id)) return err(400, "Unknown event.");
  if (!!ev.livemode !== (p.mode === "live")) return err(400, "This event belongs to the other mode (test or live)."); // never mix test and live
  return answer(() => pstoreOf(d).tx({ id: null, name: "Payment provider", ip: r.ip, system: "billing-webhook" }, d.now(), async (t) => {
    if (await t.get("billing-provider-event", ev.id!)) return ok({ received: true, duplicate: true });
    await t.insert("billing-provider-event", ev.id!, null, { type: String(ev.type).slice(0, 80), at: t.now });
    const o = ev.data?.object ?? {};
    if (ev.type === "checkout.session.completed" && o.payment_status === "paid") {
      const invId = String((o.metadata as Record<string, string> | undefined)?.invoice ?? o.client_reference_id ?? "");
      const rec = await t.get<Invoice>("billing-invoice", invId); if (!rec) return ok({ received: true, ignored: "unknown invoice" });
      const inv = rec.data; const amount = Number(o.amount_total); const cur = String(o.currency ?? "").toUpperCase();
      if (cur !== inv.currency || !(amount > 0)) { await t.audit("invoice.payment.mismatch", `${inv.id}: ${amount} ${cur} does not match the invoice (${inv.currency})`, "Billing"); return ok({ received: true, ignored: "mismatch" }); }
      const take = Math.min(amount, inv.status === "Open" ? outstanding(inv) : 0);
      inv.paid += amount; inv.providerPaid += amount; if (inv.status === "Open" && outstanding(inv) === 0) inv.status = "Paid";
      const id = `E-${await t.next("billing-entry", 0)}`;
      await t.insert("billing-entry", id, inv.tenantId, { id, invoiceId: inv.id, type: "payment", amount, currency: inv.currency, at: t.now, by: "Payment provider", reason: `Card payment through the payment provider (${p.mode})`, ticket: "", provider: `stripe:${String(o.payment_intent ?? "")}` } satisfies Entry);
      await t.update("billing-invoice", rec.id, inv, rec.version);
      await t.audit("invoice.payment.received", `${inv.id} ${inv.ref}: ${money(amount, inv.currency)} through the payment provider${amount > take ? ` (${money(amount - take, inv.currency)} more than was due)` : ""}`, "Billing", inv.tenantId);
    }
    return ok({ received: true });
  }));
}
