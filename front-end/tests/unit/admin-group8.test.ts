import { beforeEach, describe, expect, it } from "vitest";
import { createHash, createHmac } from "node:crypto";
import { MemoryPlatStore } from "@/server/platstore";
import type { Payments } from "@/server/billing";
import type { NetResponse } from "@/server/integrations/net";
import { COOKIE, handle, type Req, type Res } from "@/server/core";
import { MemoryAuth, MemoryStore } from "@/server/memory";
import { MemoryDirectory } from "@/server/directory";
import { MemoryPlatform } from "@/server/platform";
import { MemorySupport } from "@/server/support";
import { MemoryWsStore } from "@/server/ws/store";
import { MemoryFileStore } from "@/server/ws/files";
import type { Deps } from "@/server/types";
import { totpAt } from "@/lib/totp";
import { toB64u } from "@/lib/webauthn";
/* Production programme group 8a (Admin Console billing ledger, rates and tax, admin-level MFA resets, sign-in blocks; a company's own
   billing; the payment provider's webhook) through `handle`, against the in-memory stand-ins, stand-in rate feeds and a stand-in provider.
   Checked against docs/architecture/inventory/group8-admin-billing-email.md. Synthetic people, companies and amounts only. */
const ORIGIN = "https://app.example.test";
let clock = 1_800_000_000_000; let d: Deps; let auth: MemoryAuth; let store: MemoryStore; let dir: MemoryDirectory; let plat: MemoryPlatform; let sup: MemorySupport; let ws: MemoryWsStore; let files: MemoryFileStore; let ACME = ""; let OTHER = "";
const feeds: { re: RegExp; res: NetResponse }[] = []; const checkouts: string[] = [];
const expired: string[] = [];
const PAY: Payments = { mode: "test", webhookSecret: "whsec_test", checkout: async (inv, amount) => { checkouts.push(`${inv.id}:${amount}`); return { id: `cs_test_${checkouts.length}`, url: `https://checkout.stripe.example/c/cs_test_${checkouts.length}` }; }, expire: async (id) => { expired.push(id); }, refund: async () => "re_test_1" };
beforeEach(() => {
  clock = 1_800_000_000_000; auth = new MemoryAuth(() => clock); used.clear(); store = new MemoryStore(() => clock); dir = new MemoryDirectory(store); plat = new MemoryPlatform(store, dir); sup = new MemorySupport(store, dir, plat); ws = new MemoryWsStore(store); files = new MemoryFileStore();
  ACME = dir.addCompany("acme-eu", "Acme Test Co");
  OTHER = dir.addCompany("other-co", "Other Test Co"); feeds.length = 0; checkouts.length = 0; expired.length = 0;
  d = { auth, store, dir, plat, sup, ws, files, site: { origin: ORIGIN, rpId: "app.example.test" }, secret: "x".repeat(40), now: () => clock, pstore: new MemoryPlatStore(store),
    net: async (url: string): Promise<NetResponse> => feeds.find((f) => f.re.test(url))?.res ?? { status: 404, headers: {}, text: "" }, payments: PAY };
});
const PW = "Lantern-orbit-Quince-71";
async function call(method: string, path: string, body: Record<string, unknown> = {}, o: { cookie?: string; ip?: string; origin?: string | null } = {}): Promise<Res> {
  const r: Req = { method, path: path.split("/").filter(Boolean), body, ip: o.ip ?? "198.51.100.7", cookies: o.cookie ? { [COOKIE]: o.cookie } : {},
    headers: { origin: o.origin === null ? undefined : o.origin ?? ORIGIN, "content-type": "application/json", "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/140" } };
  return handle(d, r);
}
const cookieOf = (res: Res) => res.cookies?.[0]?.match(new RegExp(`${COOKIE}=([^;]*)`))?.[1] || "";
const used = new Map<string, number>();
async function code(email: string): Promise<string> { // the next unused authenticator code: a person waits for the next 30-second step
  const secret = auth.secretOf(email)!; const step = Math.floor(clock / 30_000);
  if ((used.get(email) ?? -1) >= step) clock = (step + 1) * 30_000 + 1_000;
  used.set(email, Math.floor(clock / 30_000)); return totpAt(secret, clock);
}
/** An active account with an authenticator, signed in once; returns its session cookie and recovery codes. */
/** Company roles become an active membership of `company` (Acme by default); super and support become platform staff. */
async function account(email: string, role = "employee", person = "Alex Kim", company?: string) {
  const id = await auth.createUser(email, PW, person); await auth.confirmUser(id);
  await store.insertProfile({ id, email, person, status: "Active", requestedAt: clock });
  if (role === "super" || role === "support") dir.staff.set(id, role); else dir.addMember(company ?? ACME, id, role);
  const st = await call("POST", "auth/sign-in", { email, password: PW }); expect(st.body).toEqual(expect.objectContaining({ step: "enroll" }));
  const v = await call("POST", "auth/sign-in/verify", { ticket: (st.body as { ticket: string }).ticket, code: await code(email) });
  expect(v.status).toBe(200);
  return { id, cookie: cookieOf(v), codes: (v.body as { recoveryCodes: string[] }).recoveryCodes };
}
async function superAdmin(email: string, person: string) {
  const id = await auth.createUser(email, PW, person); await auth.confirmUser(id);
  await store.insertProfile({ id, email, person, status: "Active", requestedAt: clock }); dir.staff.set(id, "super");
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", kp.publicKey));
  const st = (await call("POST", "auth/sign-in", { email, password: PW })).body as { ticket: string; challenge: string };
  const cd = toB64u(new TextEncoder().encode(JSON.stringify({ type: "webauthn.create", challenge: st.challenge, origin: ORIGIN })));
  const res = await call("POST", "auth/sign-in/passkey", { ticket: st.ticket, register: { id: toB64u(crypto.getRandomValues(new Uint8Array(16))), publicKey: toB64u(spki), clientDataJSON: cd } });
  expect(res.status).toBe(200); return { id, cookie: cookieOf(res) };
}
const elevate = (cookie: string) => call("POST", "admin/elevation", { reason: "Monthly billing run for customers", ticket: "FIN-101", minutes: 60 }, { cookie });
const body = <T,>(r: Res) => r.body as T;
const log = (a: string) => store.auditLog.filter((x) => x.action === a);
const M = { reason: "Agreed with the customer on the phone", ticket: "FIN-1234" };
const approvals = async (cookie: string) => body<{ id: string; kind: string; status: string; block: string | null }[]>(await call("GET", "admin/approvals", {}, { cookie }));
const decide = (cookie: string, id: string, decision = "approve") => call("POST", `admin/approvals/${id}/${decision}`, { reason: "Checked the ticket and the amount" }, { cookie });
type Inv = { id: string; status: string; total: number; tax: number; subtotal: number; outstanding: number; currency: string; tenantId: string };
const billing = async (cookie: string) => body<{ invoices: Inv[]; accounts: { tenantId: string; balance: number; plan: string }[] }>(await call("GET", "admin/billing", {}, { cookie }));
function rateFeeds() {
  const day = new Date(clock).toISOString().slice(0, 10);
  feeds.push({ re: /ecb\.europa\.eu/, res: { status: 200, headers: {}, text: `<gesmes:Envelope><Cube><Cube time='${day}'><Cube currency='USD' rate='1.1000'/><Cube currency='GBP' rate='0.8800'/></Cube></Cube></gesmes:Envelope>` } });
  feeds.push({ re: /open\.er-api\.com/, res: { status: 200, headers: {}, text: JSON.stringify({ result: "success", time_last_update_unix: Math.floor(clock / 1000), rates: { USD: 1, PKR: 280, AED: 3.6725, SAR: 3.75, GBP: 0.83, EUR: 0.909 } }) } });
}
async function team() {
  const dana = await superAdmin("dana@platform.example", "Dana Whitfield");
  const ravi = await superAdmin("ravi@platform.example", "Ravi Shah");
  const sam = await account("sam@platform.example", "support", "Sam Hayes");
  const jordan = await account("jordan@acme.example", "admin", "Jordan Avery");
  expect((await elevate(dana.cookie)).status).toBe(200); expect((await elevate(ravi.cookie)).status).toBe(200);
  return { dana, ravi, sam, jordan };
}
const setup = (cookie: string, over: Record<string, unknown> = {}) => call("POST", "admin/billing/accounts", { tenantId: ACME, plan: "Professional", cycle: "Monthly", currency: "PKR", country: "PK", method: "Invoice and bank transfer", contactName: "Accounts Team", contactEmail: "accounts@acme.example", address: "1 Test Street", ...M, ...over }, { cookie });

describe("Admin Console billing ledger and rates", () => {
  it("issues invoices from the price list with locked live rates and computed tax; finance actions follow the threshold and four-eyes rules", async () => {
    const t = await team();
    expect((await call("GET", "admin/billing", {}, { cookie: t.jordan.cookie })).status).toBe(403); // company members never
    expect((await setup(t.sam.cookie)).status).toBe(403); // support reads only
    expect((await setup(t.dana.cookie)).status).toBe(200);
    // the reference catalogue is never used for money: no applied PKR rate yet
    expect(body<{ issued: string[]; skipped: string[] }>(await call("POST", "admin/billing/issue", { upTo: new Date(clock).toISOString().slice(0, 10) }, { cookie: t.dana.cookie })).skipped[0]).toMatch(/no applied exchange rate for PKR/);
    rateFeeds();
    const rf = body<{ applied: number; held: number }>(await call("POST", "admin/rates/refresh", {}, { cookie: t.dana.cookie }));
    const rates = body<{ rates: { code: string; status: string; rate: number; candidate?: { reason: string } }[] }>(await call("GET", "admin/rates", {}, { cookie: t.sam.cookie })).rates;
    expect(rates.find((r) => r.code === "PK")).toMatchObject({ status: "Applied", rate: 280 });
    expect(rates.find((r) => r.code === "GB")!.status).toBe("Held"); // the feeds disagree (0.8 vs 0.83)
    expect(rates.find((r) => r.code === "GB")!.candidate!.reason).toMatch(/disagree/);
    expect(rf.held).toBeGreaterThan(0);
    const out = body<{ issued: string[] }>(await call("POST", "admin/billing/issue", { upTo: new Date(clock).toISOString().slice(0, 10) }, { cookie: t.dana.cookie }));
    expect(out.issued).toHaveLength(1);
    let inv = (await billing(t.dana.cookie)).invoices[0];
    expect([inv.currency, inv.subtotal, inv.tax, inv.total]).toEqual(["PKR", 165000 * 280, Math.round(165000 * 280 * 0.18), 165000 * 280 + Math.round(165000 * 280 * 0.18)]);
    expect(body<{ issued: string[] }>(await call("POST", "admin/billing/issue", { upTo: new Date(clock).toISOString().slice(0, 10) }, { cookie: t.dana.cookie })).issued).toHaveLength(0); // never twice for one period
    expect(log("invoice.issued").some((x) => x.tenantId === ACME)).toBe(true); // the company's own log too
    // a small credit (under USD 1,000) at once; credits are cumulative and never exceed what is due
    expect((await call("POST", `admin/billing/invoices/${inv.id}/credit`, { amount: 28000, ...M }, { cookie: t.dana.cookie })).status).toBe(200); // 28,000 PKR ≈ USD 100
    inv = (await billing(t.dana.cookie)).invoices[0]; expect(inv.outstanding).toBe(inv.total - 2_800_000);
    expect((await call("POST", `admin/billing/invoices/${inv.id}/credit`, { amount: 99_999_999, ...M }, { cookie: t.dana.cookie })).status).toBe(409);
    // splitting cannot avoid the second approver: what one person applied alone on this invoice counts (USD 100 + USD 1,000 > USD 1,000)
    expect((await call("POST", `admin/billing/invoices/${inv.id}/credit`, { amount: 280000, ...M }, { cookie: t.dana.cookie })).status).toBe(202);
    // marking the rest paid is above USD 1,000: a request the requester cannot approve
    expect((await call("POST", `admin/billing/invoices/${inv.id}/markpaid`, { reason: "short", ticket: "FIN-1" }, { cookie: t.dana.cookie })).status).toBe(400);
    expect((await call("POST", `admin/billing/invoices/${inv.id}/markpaid`, M, { cookie: t.dana.cookie })).status).toBe(202);
    const ap = (await approvals(t.ravi.cookie)).find((a) => a.kind === "billing.markpaid" && a.status === "Pending")!;
    expect((await decide(t.dana.cookie, ap.id)).status).toBe(403);
    expect((await decide(t.ravi.cookie, ap.id)).status).toBe(200);
    inv = (await billing(t.dana.cookie)).invoices[0]; expect([inv.status, inv.outstanding]).toEqual(["Paid", 0]);
    expect((await billing(t.dana.cookie)).accounts[0].balance).toBe(0);
    expect((await call("POST", `admin/billing/invoices/${inv.id}/void`, M, { cookie: t.dana.cookie })).status).toBe(409); // paid: refund instead
    // releasing a held rate is four-eyes; rejecting keeps the rate in force
    expect((await call("POST", "admin/rates/GB/release", M, { cookie: t.dana.cookie })).status).toBe(202);
    const rel = (await approvals(t.ravi.cookie)).find((a) => a.kind === "rates.release")!;
    expect((await decide(t.ravi.cookie, rel.id)).status).toBe(200);
    expect(body<{ rates: { code: string; status: string }[] }>(await call("GET", "admin/rates", {}, { cookie: t.sam.cookie })).rates.find((r) => r.code === "GB")!.status).toBe("Applied");
    // a tax override (0 % is allowed) needs a second super admin too
    expect((await call("POST", "admin/rates/AE/override", { currency: "KWD", rate: 0.31, taxType: "VAT", taxRate: 0, taxEffective: "2027-01-01", ...M }, { cookie: t.dana.cookie })).status).toBe(400); // three decimals: refused
    expect((await call("POST", "admin/rates/AE/override", { currency: "AED", rate: 3.6725, taxType: "VAT", taxRate: 0, taxEffective: "2027-01-01", ...M }, { cookie: t.dana.cookie })).status).toBe(202);
  });
  it("lets a company admin pay through the provider's hosted page; only a correctly signed webhook records the payment, once", async () => {
    const t = await team(); rateFeeds(); await call("POST", "admin/rates/refresh", {}, { cookie: t.dana.cookie });
    await setup(t.dana.cookie, { currency: "USD", country: "US", plan: "Starter", method: "Card (Stripe)" });
    await call("POST", "admin/billing/issue", { upTo: new Date(clock).toISOString().slice(0, 10) }, { cookie: t.dana.cookie });
    const ws = body<{ invoices: { id: string; outstanding: number; status: string }[]; account: { plan: string } }>(await call("GET", "ws/data/billingws", {}, { cookie: t.jordan.cookie }));
    expect(ws.account.plan).toBe("Starter"); const inv = ws.invoices[0]; expect(inv.outstanding).toBe(49000);
    const other = await account("lee@other.example", "admin", "Lee Park", OTHER);
    expect(body<{ invoices: unknown[] }>(await call("GET", "ws/data/billingws", {}, { cookie: other.cookie })).invoices).toEqual([]); // another company sees none
    expect((await call("POST", `ws/billing/invoices/${inv.id}/pay`, {}, { cookie: other.cookie })).status).toBe(404);
    expect(body<{ url: string }>(await call("POST", `ws/billing/invoices/${inv.id}/pay`, {}, { cookie: t.jordan.cookie })).url).toMatch(/^https:\/\/checkout\.stripe\.example/);
    // a second payment page closes the first, so the invoice is never payable twice
    expect(body<{ url: string }>(await call("POST", `ws/billing/invoices/${inv.id}/pay`, {}, { cookie: t.jordan.cookie })).url).toContain("cs_test_2");
    expect(expired).toEqual(["cs_test_1"]);
    const ev = (id: string, livemode = false, o: Record<string, unknown> = {}) => JSON.stringify({ id, type: "checkout.session.completed", livemode, data: { object: { id: "cs_test_2", payment_status: "paid", amount_total: 49000, currency: "usd", payment_intent: "pi_test_1", metadata: { invoice: inv.id }, ...o } } });
    const hook = (raw: string, secret = "whsec_test", at = clock) => {
      const ts = Math.floor(at / 1000); const sig = createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
      return handle(d, { method: "POST", path: ["billing", "stripe", "webhook"], body: {}, raw: new TextEncoder().encode(raw), ip: "203.0.113.5", cookies: {}, headers: { "content-type": "application/json", "stripe-signature": `t=${ts},v1=${sig}` } });
    };
    expect((await hook(ev("evt_1TestEvent0001"), "whsec_wrong")).status).toBe(400);
    expect((await hook(ev("evt_1TestEvent0001"), "whsec_test", clock - 10 * 60_000)).status).toBe(400); // too old
    expect((await hook(ev("evt_1TestEvent0001", true))).status).toBe(400); // a live event to a test setup
    expect((await hook(ev("evt_1TestEvent0001"))).status).toBe(200);
    expect(body<{ duplicate?: boolean }>(await hook(ev("evt_1TestEvent0001"))).duplicate).toBe(true);
    const after = body<{ invoices: { status: string; outstanding: number }[] }>(await call("GET", "ws/data/billingws", {}, { cookie: t.jordan.cookie })).invoices[0];
    expect(after).toMatchObject({ status: "Paid", outstanding: 0 });
    expect(log("invoice.payment.received").filter((x) => !x.tenantId).length).toBe(1); // once in the platform log (and once in the company's own)
    expect(log("invoice.payment.received").filter((x) => x.tenantId === ACME).length).toBe(1);
    // a second payment (an old page, or after a manual mark) is recorded apart for review and never counted on the paid invoice
    expect((await hook(ev("evt_1TestEvent0002", false, { id: "cs_test_1" }))).status).toBe(200);
    expect(body<{ invoices: { outstanding: number; status: string }[] }>(await call("GET", "ws/data/billingws", {}, { cookie: t.jordan.cookie })).invoices[0]).toMatchObject({ status: "Paid", outstanding: 0 });
    const entries = body<{ entries: { type: string; review?: string }[] }>(await call("GET", "admin/billing", {}, { cookie: t.dana.cookie })).entries;
    expect(entries.filter((e) => e.type === "unmatched")).toEqual([expect.objectContaining({ review: "the invoice is paid" })]);
    expect(log("invoice.payment.review").filter((x) => !x.tenantId).length).toBe(1);
    // a payment in another currency is recorded for review too, not applied
    expect((await hook(ev("evt_1TestEvent0003", false, { currency: "eur" }))).status).toBe(200);
    expect(log("invoice.payment.review").filter((x) => !x.tenantId).length).toBe(2);
  });
  it("takes a company's plan change as a request for the next period, which the platform accepts", async () => {
    const t = await team(); rateFeeds(); await call("POST", "admin/rates/refresh", {}, { cookie: t.dana.cookie });
    await setup(t.dana.cookie, { currency: "USD", country: "US", plan: "Starter" });
    expect((await call("POST", "ws/billing/plan-request", { plan: "Enterprise" }, { cookie: t.jordan.cookie })).status).toBe(200);
    expect((await call("POST", "ws/billing/plan-request", { plan: "Professional" }, { cookie: t.jordan.cookie })).status).toBe(400); // one at a time
    expect((await billing(t.dana.cookie)).accounts[0].plan).toBe("Starter"); // nothing changes at once
    const rq = body<{ planRequests: { id: string }[] }>(await call("GET", "admin/billing", {}, { cookie: t.dana.cookie })).planRequests[0];
    expect((await call("POST", `admin/billing/plan-requests/${rq.id}/accept`, { reason: "Contract amendment signed" }, { cookie: t.dana.cookie })).status).toBe(200);
    expect((await call("POST", `admin/billing/plan-requests/${rq.id}/decline`, { reason: "Changed my mind on this" }, { cookie: t.dana.cookie })).status).toBe(409); // decided once
    expect(body<{ planRequests: unknown[] }>(await call("GET", "admin/billing", {}, { cookie: t.dana.cookie })).planRequests).toEqual([]); // no longer waiting
    await call("POST", "admin/billing/issue", { upTo: new Date(clock).toISOString().slice(0, 10) }, { cookie: t.dana.cookie });
    expect((await billing(t.dana.cookie)).invoices[0].subtotal).toBe(980000); // Enterprise
  });
});

describe("Admin Console MFA resets and sign-in blocks", () => {
  it("resets a company admin's MFA only after the named super admin approves; support may ask", async () => {
    const t = await team(); const casey = await superAdmin("casey@platform.example", "Casey Morgan"); await elevate(casey.cookie);
    const mfa = body<{ admins: { userId: string; tenantId: string; mfa: string }[] }>(await call("GET", "admin/mfa", {}, { cookie: t.sam.cookie }));
    const target = mfa.admins.find((a) => a.userId === t.jordan.id)!; expect(target.mfa).toBe("Enrolled");
    const ask = (b: Record<string, unknown>) => call("POST", "admin/mfa/requests", { userId: t.jordan.id, tenantId: ACME, checks: ["call-back", "sponsor", "id"], reason: "Lost or replaced phone", details: "Called back on the number on file", ticket: "SEC-77", named: t.ravi.id, ...b }, { cookie: t.sam.cookie });
    expect((await ask({ checks: ["call-back"] })).status).toBe(400);
    expect((await ask({})).status).toBe(202);
    const ap = (await approvals(t.dana.cookie)).find((a) => a.kind === "mfa-reset-admin")!;
    expect(ap.block).toMatch(/named approver \(Ravi Shah\)/);
    expect((await decide(t.dana.cookie, ap.id)).status).toBe(403); // elevated, but not the named approver
    expect((await decide(t.ravi.cookie, ap.id)).status).toBe(200);
    expect(await auth.mfaEnrolled(t.jordan.id)).toBe(false);
    expect((await call("GET", "auth/session", {}, { cookie: t.jordan.cookie })).status).toBe(401); // every session ended
    expect(log("mfa.reset.approved").some((x) => x.tenantId === ACME)).toBe(true);
  });
  it("lists sign-in blocks for staff and lets an elevated super admin lift one with a reason", async () => {
    const t = await team();
    const solve = async () => { // the sign-in challenge (proof of work) a browser solves after a few failures
      const c = body<{ seed: string; digits: number }>(await call("POST", "auth/challenge", {}));
      for (let n = 0; ; n++) if (createHash("sha256").update(`${c.seed}:${n}`).digest("hex").startsWith("0".repeat(c.digits))) return { seed: c.seed, nonce: n };
    };
    for (let i = 0; i < 12; i++) await call("POST", "auth/sign-in", { email: "nobody@example.test", password: "wrong-password-1", challenge: await solve() }, { ip: "203.0.113.24" });
    const list = body<{ blocks: { ip: string }[] }>(await call("GET", "admin/security/blocks", {}, { cookie: t.sam.cookie })).blocks;
    expect(list.map((x) => x.ip)).toEqual(["203.0.113.24"]);
    expect((await call("POST", "admin/security/blocks/203.0.113.24/lift", { reason: "Customer verified on a call, ticket SEC-9" }, { cookie: t.sam.cookie })).status).toBe(403);
    expect((await call("POST", "admin/security/blocks/203.0.113.24/lift", { reason: "short" }, { cookie: t.dana.cookie })).status).toBe(400);
    expect((await call("POST", "admin/security/blocks/203.0.113.24/lift", { reason: "Customer verified on a call, ticket SEC-9" }, { cookie: t.dana.cookie })).status).toBe(200);
    expect(body<{ blocks: unknown[] }>(await call("GET", "admin/security/blocks", {}, { cookie: t.sam.cookie })).blocks).toEqual([]);
  });
});

/* EDGE-19: account erasure. Platform super admins only, each elevated; a second one approves; the account is blocked at once and erased
   after 14 days unless cancelled. The database part (workspace records, the audit chain) is covered in tests/db (0014, 0015). */
describe("account erasure", () => {
  const erasures = async (cookie: string) => body<{ userId: string; status: string; person: string; pseudonym: string; email: string; due: boolean }[]>(await call("GET", "admin/erasures", {}, { cookie }));
  const ask = (cookie: string, email: string) => call("POST", "admin/erasures", { email, reason: "Erasure request from the person by email", ticket: "PRIV-12" }, { cookie });
  const makeDue = async (userId: string) => { // the 14 days have passed (sessions and elevations would have expired in a real wait)
    await (d.pstore as MemoryPlatStore).tx({ id: null, name: "test", ip: "test" }, clock, async (t) => { const r = (await t.get<{ dueAt: number }>("account-erasure", userId))!; await t.update("account-erasure", userId, { ...r.data, dueAt: clock - 1 }, r.version); });
  };
  it("only for people no longer in a company; asked and approved by two different elevated super admins; blocked at once", async () => {
    const t = await team();
    const priya = await account("priya@acme.example", "employee", "Priya Nair");
    expect((await ask(t.sam.cookie, "priya@acme.example")).status).toBe(403);   // support
    expect((await ask(t.jordan.cookie, "priya@acme.example")).status).toBe(403); // a company admin
    expect((await ask(t.dana.cookie, "dana@platform.example")).status).toBe(409); // platform staff (and herself)
    expect(body<{ error: string }>(await ask(t.dana.cookie, "priya@acme.example")).error).toMatch(/still an active member of a company/);
    dir.memberships.find((m) => m.userId === priya.id)!.status = "Removed"; // offboarded by her company
    expect((await call("POST", "admin/erasures", { email: "priya@acme.example", reason: "short", ticket: "PRIV-12" }, { cookie: t.dana.cookie })).status).toBe(400);
    const req = await ask(t.dana.cookie, "priya@acme.example"); expect(req.status).toBe(202);
    expect((await ask(t.dana.cookie, "priya@acme.example")).status).toBe(409); // one open request
    const a = (await approvals(t.dana.cookie)).find((x) => x.kind === "platform-account-erase")!;
    expect(a.block).toMatch(/requester|own request|cannot approve/i);
    expect((await decide(t.dana.cookie, a.id)).status).toBe(403); // never the requester
    expect((await decide(t.ravi.cookie, a.id)).status).toBe(200);
    // blocked at once: her session ended, and she cannot sign in
    expect((await call("GET", "auth/session", {}, { cookie: priya.cookie })).status).toBe(401);
    expect((await call("POST", "auth/sign-in", { email: "priya@acme.example", password: PW })).status).toBe(401); // the password is no longer accepted
    const [e] = await erasures(t.ravi.cookie);
    expect(e).toMatchObject({ userId: priya.id, status: "Scheduled", person: "Priya Nair", email: "p•••@acme.example", due: false });
    expect(e.pseudonym).toMatch(/^Former member · M-[0-9a-f]{8}$/);
    expect(log("privacy.erasure.scheduled")).toHaveLength(1);
    // not before the 14 days; support cannot complete
    expect(body<{ error: string }>(await call("POST", `admin/erasures/${priya.id}/complete`, {}, { cookie: t.ravi.cookie })).error).toMatch(/14 days end on/);
    expect((await call("POST", `admin/erasures/${priya.id}/complete`, {}, { cookie: t.sam.cookie })).status).toBe(403);
  });
  it("can be cancelled during the 14 days (unblocked); once completed, nothing of the person is left", async () => {
    const t = await team();
    const priya = await account("priya@acme.example", "employee", "Priya Nair");
    dir.memberships.find((m) => m.userId === priya.id)!.status = "Removed";
    const approveLatest = async () => { const a = (await approvals(t.dana.cookie)).find((x) => x.kind === "platform-account-erase" && x.status === "Pending")!; expect((await decide(t.ravi.cookie, a.id)).status).toBe(200); };
    expect((await ask(t.dana.cookie, "priya@acme.example")).status).toBe(202); await approveLatest();
    expect((await call("POST", `admin/erasures/${priya.id}/cancel`, { reason: "short" }, { cookie: t.dana.cookie })).status).toBe(400);
    expect((await call("POST", `admin/erasures/${priya.id}/cancel`, { reason: "The person withdrew the request by email" }, { cookie: t.dana.cookie })).status).toBe(204);
    expect((await call("POST", "auth/sign-in", { email: "priya@acme.example", password: PW })).status).toBe(409); // unblocked: the password works again (409: no company now)
    expect((await erasures(t.dana.cookie))[0].status).toBe("Cancelled");
    // asked again, approved, and completed after the 14 days
    expect((await ask(t.dana.cookie, "priya@acme.example")).status).toBe(202); await approveLatest();
    await makeDue(priya.id);
    expect(JSON.stringify(store.auditLog)).toMatch(/Priya Nair|priya@acme\.example/); // before: the log names her
    const done = await call("POST", `admin/erasures/${priya.id}/complete`, {}, { cookie: t.dana.cookie });
    expect(done.status).toBe(200); expect(body<{ status: string }>(done).status).toBe("Completed");
    const p = (await store.profileById(priya.id))!;
    expect(p).toMatchObject({ status: "Erased", email: `erased-${priya.id.replace(/-/g, "")}@erased.invalid` }); expect(p.person).toMatch(/^Former member · M-/);
    expect(store.passkeys.concat().some((x) => x.userId === priya.id) || store.recovery.some((x) => x.userId === priya.id)).toBe(false);
    expect([...store.sessions.values()].some((x) => x.userId === priya.id)).toBe(false);
    expect(JSON.stringify(store.auditLog)).not.toMatch(/Priya Nair|priya@acme\.example/); // the log keeps the pseudonym and the masked address only
    expect(log("privacy.erasure.completed").at(-1)!.target).toMatch(/^Former member · M-[0-9a-f]{8} \(p•••@acme\.example\): \d+ audit entr/);
    expect((await call("POST", "auth/sign-in", { email: "priya@acme.example", password: PW })).status).toBe(401);
    expect((await call("POST", `admin/erasures/${priya.id}/complete`, {}, { cookie: t.dana.cookie })).status).toBe(404); // once
    expect((await erasures(t.ravi.cookie))[0]).toMatchObject({ status: "Completed", person: p.person });
  });
});
