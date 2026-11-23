import { beforeEach, describe, expect, it } from "vitest";
import { COOKIE, handle, type Req, type Res } from "@/server/core";
import { MemoryAuth, MemoryStore } from "@/server/memory";
import { MemoryDirectory } from "@/server/directory";
import { MemoryPlatform } from "@/server/platform";
import { MemorySupport } from "@/server/support";
import { MemoryWsStore } from "@/server/ws/store";
import { MemoryFileStore } from "@/server/ws/files";
import type { Deps } from "@/server/types";
import { totpAt } from "@/lib/totp";

/* Production programme, group 4 (Vendors, the Vendor role's questionnaires, Questionnaires, Trust Center, Commitments) through `handle`, as /api runs it, against the in-memory stand-ins.
   Checked against the inventory in docs/architecture/inventory/group4-vendors-portal-questionnaires-trust-commitments.md. Synthetic people only. */
const ORIGIN = "https://app.example.test";
let clock = 1_800_000_000_000; let d: Deps; let auth: MemoryAuth; let store: MemoryStore; let dir: MemoryDirectory; let ws: MemoryWsStore; let files: MemoryFileStore; let ACME = ""; let OTHER = "";
const used = new Map<string, number>();
beforeEach(() => {
  clock = 1_800_000_000_000; used.clear(); auth = new MemoryAuth(() => clock); store = new MemoryStore(() => clock); dir = new MemoryDirectory(store);
  const plat = new MemoryPlatform(store, dir); ws = new MemoryWsStore(store); files = new MemoryFileStore();
  ACME = dir.addCompany("acme-eu", "Acme Test Co"); OTHER = dir.addCompany("other-co", "Other Test Co");
  d = { auth, store, dir, plat, sup: new MemorySupport(store, dir, plat), ws, files, site: { origin: ORIGIN, rpId: "app.example.test" }, secret: "x".repeat(40), now: () => clock };
});
const PW = "Lantern-orbit-Quince-71";
async function call(method: string, path: string, body: Record<string, unknown> = {}, cookie?: string, raw?: Uint8Array): Promise<Res> {
  const r: Req = { method, path: path.split("/").filter(Boolean), body, ip: "198.51.100.7", cookies: cookie ? { [COOKIE]: cookie } : {}, raw,
    headers: { origin: ORIGIN, "content-type": raw ? "application/octet-stream" : "application/json", "user-agent": "Mozilla/5.0 Chrome/140" } };
  return handle(d, r);
}
async function code(email: string) {
  const secret = auth.secretOf(email)!; const step = Math.floor(clock / 30_000);
  if ((used.get(email) ?? -1) >= step) clock = (step + 1) * 30_000 + 1_000;
  used.set(email, Math.floor(clock / 30_000)); return totpAt(secret, clock);
}
async function member(email: string, role: string, person: string, company = ACME) {
  const id = await auth.createUser(email, PW, person); await auth.confirmUser(id);
  await store.insertProfile({ id, email, person, status: "Active", requestedAt: clock }); dir.addMember(company, id, role);
  const st = await call("POST", "auth/sign-in", { email, password: PW });
  const v = await call("POST", "auth/sign-in/verify", { ticket: (st.body as { ticket: string }).ticket, code: await code(email) });
  return { id, cookie: v.cookies![0].match(new RegExp(`${COOKIE}=([^;]*)`))![1] };
}
/** Signs in again (after the clock moves on, the earlier session has ended). */
async function signIn(email: string) {
  const st = await call("POST", "auth/sign-in", { email, password: PW });
  const v = await call("POST", "auth/sign-in/verify", { ticket: (st.body as { ticket: string }).ticket, code: await code(email) });
  return v.cookies![0].match(new RegExp(`${COOKIE}=([^;]*)`))![1];
}
const log = (action: string) => store.auditLog.filter((x) => x.action === action);
const body = <T,>(r: Res) => r.body as T;


const day = (n: number) => new Date(clock + n * 86400_000).toISOString().slice(0, 10);
async function team() {
  const jordan = await member("jordan@acme.example", "admin", "Jordan Avery");
  const casey = await member("casey@acme.example", "admin", "Casey Morgan");
  const owen = await member("owen@acme.example", "owner", "Owen Hart");
  const ana = await member("ana@acme.example", "analyst", "Ana Silva");
  const priya = await member("priya@acme.example", "employee", "Priya Nair");
  const vee = await member("vee@vendorco.example", "vendor", "Vee Contact");
  const val = await member("val@customer.example", "viewer", "Val Viewer");
  return { jordan, casey, owen, ana, priya, vee, val };
}
const four = (cookie: string, id: string, decision: string, reason = "Checked the documents") => call("POST", `ws/four-eyes/${id}/${decision}`, { reason }, cookie);
const vdata = async (cookie: string) => body<{ vendors: Record<string, unknown>[]; requests: { id: string; pendingApproval?: string }[]; approvals: { id: string; kind: string; status: string }[]; questionnaires: { id: string; status: string; answers: string[] }[]; contacts: { id: string }[] }>(await call("GET", "ws/data/vendors", {}, cookie));
const vendor = async (cookie: string, id: string) => (await vdata(cookie)).vendors.find((v) => v.id === id) as Record<string, unknown> & { certs: { status: string }[]; findings: { id: string; status: string }[] };

describe("vendors", () => {
  it("requests from My Work: another person approves; Critical needs two approvers; dismiss needs a reason and the requester is told", async () => {
    const { jordan, casey, owen, priya } = await team();
    await call("POST", "ws/vendor-requests", { name: "Northstar Analytics", reason: "Marketing attribution", crit: "Medium" }, priya.cookie);
    await call("POST", "ws/vendor-requests", { name: "Core Ledger", reason: "Payments ledger", crit: "Critical" }, jordan.cookie);
    await call("POST", "ws/vendor-requests", { name: "Spam Tools", reason: "Not needed really", crit: "Low" }, priya.cookie);
    expect((await call("GET", "ws/data/vendors", {}, priya.cookie)).status).toBe(403);
    const reqs = (await vdata(jordan.cookie)).requests; const [spam, core, north] = reqs;
    expect((await call("POST", `ws/vendor-requests/${north.id}/approve`, {}, jordan.cookie)).body).toMatchObject({ ok: true, pending: false, id: "V-001" });
    expect(store.notices.some((n) => n.userId === priya.id && /Northstar Analytics was approved/.test(n.text))).toBe(true);
    const v = await vendor(jordan.cookie, "V-001");
    expect(v).toMatchObject({ name: "Northstar Analytics", tier: "Medium", gate: "Pending", status: "Needs evidence", certs: [], findings: [], monitoring: [], apps: [] }); // nothing fabricated
    expect(v.due).toMatch(/^\d{2} \w{3} \d{4}$/);
    // Critical: the requester cannot start it; two others approve
    expect((await call("POST", `ws/vendor-requests/${core.id}/approve`, {}, jordan.cookie)).status).toBe(403);
    expect((await call("POST", `ws/vendor-requests/${core.id}/approve`, {}, casey.cookie)).body).toMatchObject({ pending: true });
    const ap = (await vdata(casey.cookie)).approvals.find((a) => a.kind === "vendor.request.critical")!;
    expect((await four(jordan.cookie, ap.id, "approve")).status).toBe(403); // the requester of the vendor
    expect((await four(casey.cookie, ap.id, "approve")).status).toBe(403); // already the first approver
    expect((await four(owen.cookie, ap.id, "approve")).body).toEqual({ status: "Approved" });
    expect(log("vendor.request.approved").at(-1)!.target).toMatch(/approved by Casey Morgan, Owen Hart/);
    expect((await vdata(casey.cookie)).vendors.map((x) => x.name)).toEqual(["Northstar Analytics", "Core Ledger"]);
    expect((await four(owen.cookie, ap.id, "approve")).status).toBe(403); // applied once
    expect((await call("POST", `ws/vendor-requests/${spam.id}/dismiss`, { reason: "short" }, casey.cookie)).status).toBe(400);
    expect((await call("POST", `ws/vendor-requests/${spam.id}/dismiss`, { reason: "We already use a similar tool" }, casey.cookie)).status).toBe(200);
    expect((await vdata(casey.cookie)).requests).toEqual([]);
    for (const a of ["vendor.request.approved", "vendor.request.approval_requested", "vendor.request.critical.applied", "vendor.request.dismissed"]) expect(log(a).length, a).toBeGreaterThan(0);
    const other = await member("zed@other.example", "admin", "Zed Other", OTHER);
    expect((await vdata(other.cookie)).vendors).toEqual([]); // another company sees none of it
  });

  it("gate, tier, waiver, certificates and findings follow the rules; nothing is self-approved", async () => {
    const { jordan, casey, owen } = await team();
    expect((await call("POST", "ws/vendors", { name: "Ledgerly", tier: "Critical", score: "101" }, jordan.cookie)).status).toBe(400);
    expect((await call("POST", "ws/vendors", { name: "Ledgerly", tier: "Critical", score: "82.5" }, jordan.cookie)).body).toMatchObject({ id: "V-001" });
    expect((await call("POST", "ws/vendors", { name: "ledgerly" }, casey.cookie)).status).toBe(400); // unique names
    expect((await call("POST", "ws/vendors/V-001/gate", { decision: "Approved" }, jordan.cookie)).status).toBe(403); // added it
    expect((await call("POST", "ws/vendors/V-001/gate", { decision: "Approved" }, casey.cookie)).body).toMatchObject({ pending: true });
    const gate = (await vdata(casey.cookie)).approvals.find((a) => a.kind === "vendor.gate")!;
    expect((await vendor(casey.cookie, "V-001")).gatePending).toBe(gate.id);
    expect((await four(jordan.cookie, gate.id, "approve")).status).toBe(403);
    await four(owen.cookie, gate.id, "approve");
    expect(await vendor(casey.cookie, "V-001")).toMatchObject({ gate: "Approved", status: "Active" });
    // tier change
    await call("POST", "ws/vendors/V-001/tier", { tier: "Low" }, casey.cookie);
    expect((await call("POST", "ws/vendors/V-001/tier", { tier: "Medium" }, casey.cookie)).status).toBe(400); // one pending
    const tier = (await vdata(casey.cookie)).approvals.find((a) => a.kind === "vendor.tier")!;
    await four(owen.cookie, tier.id, "approve");
    expect((await vendor(casey.cookie, "V-001")).tier).toBe("Low");
    // certificates with real dates turn Expiring and Expired by themselves
    expect((await call("POST", "ws/vendors/V-001/certificates", { type: "ISO 27001", expires: "TBD" }, casey.cookie)).status).toBe(400);
    await call("POST", "ws/vendors/V-001/certificates", { type: "ISO 27001", expires: day(30) }, casey.cookie);
    await call("POST", "ws/vendors/V-001/certificates", { type: "SOC 2", expires: day(200) }, casey.cookie);
    expect((await vendor(casey.cookie, "V-001")).certs.map((c) => c.status)).toEqual(["Expiring", "Valid"]);
    // waiver: a second person, ends on its date
    expect((await call("POST", "ws/vendors/V-001/waivers", { type: "Pen test", reason: "Scheduled next quarter", expires: day(400) }, casey.cookie)).status).toBe(400);
    await call("POST", "ws/vendors/V-001/waivers", { type: "Pen test", reason: "Scheduled next quarter", expires: day(10) }, casey.cookie);
    const w = (await vdata(casey.cookie)).approvals.find((a) => a.kind === "vendor.waiver")!;
    expect((await four(jordan.cookie, w.id, "approve")).status).toBe(403); // the adder is excluded
    await four(owen.cookie, w.id, "approve");
    expect((await vendor(casey.cookie, "V-001")).certs.map((c) => c.status)).toEqual(["Expiring", "Valid", "Waived"]);
    // findings close with a reason; blocking needs a reason
    await call("POST", "ws/vendors/V-001/findings", { title: "No pen test", sev: "High" }, casey.cookie);
    const f = (await vendor(casey.cookie, "V-001")).findings[0];
    expect((await call("POST", `ws/vendors/V-001/findings/${f.id}/close`, {}, casey.cookie)).status).toBe(400);
    expect((await call("POST", `ws/vendors/V-001/findings/${f.id}/close`, { reason: "Report received and reviewed" }, casey.cookie)).status).toBe(200);
    expect((await call("POST", "ws/vendors/V-001/gate", { decision: "Blocked" }, casey.cookie)).status).toBe(400);
    expect((await call("POST", "ws/vendors/V-001/gate", { decision: "Blocked", reason: "Sanctions screening hit" }, casey.cookie)).status).toBe(200);
    expect(await vendor(casey.cookie, "V-001")).toMatchObject({ gate: "Blocked", status: "In review", gateReason: "Sanctions screening hit" });
    await call("POST", "ws/vendors/V-001/reassessments", { score: "71", outcome: "Approved with conditions" }, casey.cookie);
    expect(await vendor(casey.cookie, "V-001")).toMatchObject({ score: 71, status: "Active" });
    // overdue review shows as "Overdue Nd"
    clock += 37 * 31 * 86400_000; const c2 = await signIn("casey@acme.example");
    expect((await vendor(c2, "V-001")).due).toMatch(/^Overdue \d+d$/);
    expect((await vendor(c2, "V-001")).certs.map((c) => c.status)).toEqual(["Expired", "Expired", "Expired"]);
  });

  it("the vendor's contact answers the questionnaire in their own workspace; it locks on submit and can be reopened", async () => {
    const { jordan, casey, vee, priya } = await team();
    await call("POST", "ws/vendors", { name: "VendorCo" }, jordan.cookie);
    expect((await call("POST", "ws/vendors/V-001/questionnaire", { contactId: priya.id }, jordan.cookie)).status).toBe(400); // not a Vendor-role member
    expect((await call("POST", "ws/vendors/V-001/questionnaire", { contactId: vee.id }, jordan.cookie)).status).toBe(200);
    expect(store.notices.some((n) => n.userId === vee.id && /security questionnaire for VendorCo/.test(n.text))).toBe(true);
    const mine = async (cookie: string) => body<{ assigned: { id: string; status: string; questions: unknown[] }[]; questionnaires: unknown[] }>(await call("GET", "ws/data/questionnaires", {}, cookie));
    const q = (await mine(vee.cookie)).assigned[0]; expect(q.questions).toHaveLength(5); expect((await mine(vee.cookie)).questionnaires).toEqual([]);
    expect((await mine(priya.cookie)).assigned).toEqual([]); // nobody else sees it
    expect((await call("POST", `ws/vendor-questionnaires/${q.id}/submit`, { answers: ["Yes", "", "", "", ""] }, vee.cookie)).body).toEqual({ error: "3 required questions still need answers" });
    expect((await call("POST", `ws/vendor-questionnaires/${q.id}/answers`, { answers: ["Yes"] }, priya.cookie)).status).toBe(404);
    expect((await call("POST", `ws/vendor-questionnaires/${q.id}/submit`, { answers: ["AES-256", "Yes, all staff", "ISO 27001", "Within 24 hours", ""] }, vee.cookie)).status).toBe(200);
    expect((await call("POST", `ws/vendor-questionnaires/${q.id}/answers`, { answers: ["x"] }, vee.cookie)).status).toBe(400); // locked
    expect((await vdata(casey.cookie)).questionnaires[0]).toMatchObject({ status: "Submitted", answers: ["AES-256", "Yes, all staff", "ISO 27001", "Within 24 hours", ""] });
    expect((await call("POST", `ws/vendor-questionnaires/${q.id}/reopen`, { note: "Attach the ISO certificate please" }, casey.cookie)).status).toBe(200);
    expect((await mine(vee.cookie)).assigned[0].status).toBe("Reopened");
    expect((await call("GET", "ws/data/vendors", {}, vee.cookie)).status).toBe(403);
  });
});

describe("questionnaires", () => {
  it("complete only through a review by someone who did not work on it; answers verified by another admin or owner", async () => {
    const { jordan, casey, owen, priya } = await team();
    const { qid } = body<{ qid: string }>(await call("POST", "ws/questionnaires", { name: "Globex, CAIQ", total: 15, due: day(20) }, priya.cookie));
    expect((await call("POST", `ws/questionnaires/${qid}/send-for-review`, {}, priya.cookie)).status).toBe(400); // not all answered
    await call("POST", `ws/questionnaires/${qid}/advance`, {}, priya.cookie); await call("POST", `ws/questionnaires/${qid}/advance`, {}, casey.cookie);
    const qs = async () => body<{ questionnaires: { qid: string; prog: string; status: string; pendingSend?: string }[]; approvals: { id: string }[]; answers: { id: string; verified: boolean }[] }>(await call("GET", "ws/data/questionnaires", {}, jordan.cookie));
    expect((await qs()).questionnaires[0]).toMatchObject({ prog: "15 / 15", status: "In progress" }); // never Complete by answering
    await call("POST", `ws/questionnaires/${qid}/send-for-review`, {}, priya.cookie);
    const ap = (await qs()).approvals[0];
    expect((await four(casey.cookie, ap.id, "approve")).status).toBe(403); // worked on it
    expect((await four(jordan.cookie, ap.id, "approve")).body).toEqual({ status: "Approved" });
    expect((await qs()).questionnaires[0]).toMatchObject({ status: "Complete", due: "Submitted" });
    // answer library
    const { id } = body<{ id: string }>(await call("POST", "ws/answer-library", { q: "Do you encrypt data at rest?", a: "Yes, AES-256." }, owen.cookie));
    expect((await call("POST", `ws/answer-library/${id}/verify`, {}, owen.cookie)).status).toBe(403);
    expect((await call("POST", `ws/answer-library/${id}/verify`, {}, priya.cookie)).status).toBe(403); // employees cannot verify
    expect((await call("POST", `ws/answer-library/${id}/verify`, {}, jordan.cookie)).status).toBe(200);
    await call("POST", `ws/answer-library/${id}`, { q: "Do you encrypt data at rest?", a: "Yes, AES-256 with KMS." }, casey.cookie);
    expect((await qs()).answers[0].verified).toBe(false); // an edit unpublishes it
    expect((await call("POST", `ws/answer-library/${id}/verify`, {}, casey.cookie)).status).toBe(403);
    // knowledge base files
    const kb = await call("POST", "ws/kb-docs", {}, priya.cookie, new TextEncoder().encode("policy text"));
    expect(kb.status).toBe(400); // no name
  });
});

describe("trust center", () => {
  it("publish needs a second person; access requests are by the member, never approved by the person who unblocked; NDA before private files", async () => {
    const { jordan, casey, owen, val, priya } = await team();
    const pub = body<{ id: string; pending: boolean }>(await call("POST", "ws/trust/resources", { name: "SOC 2 report", access: "Public" }, jordan.cookie));
    expect(pub.pending).toBe(true);
    const tdata = async (cookie: string) => body<Record<string, unknown> & { resources: { id: string; access: string; publishPending?: string }[]; requests: { id: string }[]; approvals: { id: string }[]; accounts: { id: string; nda: string; status: string }[]; public: { account: { nda: string } | null; faq: unknown[] } }>(await call("GET", "ws/data/trust", {}, cookie));
    const ap = (await tdata(jordan.cookie)).approvals[0];
    expect((await four(jordan.cookie, ap.id, "approve")).status).toBe(403);
    await four(casey.cookie, ap.id, "approve");
    expect((await tdata(jordan.cookie)).resources[0].access).toBe("Public");
    expect((await call("POST", "ws/trust/resources", { name: "soc 2 REPORT" }, jordan.cookie)).status).toBe(400); // unique
    const pen = body<{ id: string }>(await call("POST", "ws/trust/resources", { name: "Pen test summary" }, jordan.cookie)).id;
    // a viewer member requests access with their own address
    expect((await call("GET", "ws/data/trust", {}, val.cookie)).body).not.toHaveProperty("accounts");
    expect(body<{ queued: boolean }>(await call("POST", "ws/trust/access-requests", { resourceId: pen, reason: "Due diligence" }, val.cookie)).queued).toBe(true);
    expect(body<{ queued: boolean }>(await call("POST", "ws/trust/access-requests", { resourceId: pen }, val.cookie)).queued).toBe(false); // duplicate, same answer
    const rq = (await tdata(jordan.cookie)).requests[0];
    // block, then the person who unblocks cannot approve
    await call("POST", "ws/trust/blocked-domains", { domain: "customer.example" }, jordan.cookie);
    expect((await call("POST", `ws/trust/requests/${rq.id}/approve`, {}, casey.cookie)).body).toEqual({ error: "Blocked domain: this request cannot be approved." });
    expect((await call("POST", "ws/trust/blocked-domains/customer.example/delete", { reason: "short" }, jordan.cookie)).status).toBe(400);
    expect((await call("POST", "ws/trust/blocked-domains/customer.example/delete", { reason: "Confirmed a real customer" }, jordan.cookie)).status).toBe(200);
    expect((await call("POST", `ws/trust/requests/${rq.id}/approve`, {}, jordan.cookie)).status).toBe(403);
    expect((await call("POST", `ws/trust/requests/${rq.id}/approve`, {}, casey.cookie)).status).toBe(200);
    expect((await tdata(jordan.cookie)).accounts[0]).toMatchObject({ nda: "Pending", status: "Active" }); // never marked signed
    // files: none attached yet; then the viewer must accept the NDA
    expect((await call("GET", `ws/trust/resources/${pen}/link`, {}, val.cookie)).status).toBe(400);
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    expect((await call("POST", `ws/trust/resources/${pen}/file`, { name: "pentest.pdf" }, jordan.cookie, pdf)).status).toBe(200);
    expect((await call("GET", `ws/trust/resources/${pen}/link`, {}, val.cookie)).body).toEqual({ error: "Accept the NDA first." });
    expect((await call("GET", `ws/trust/resources/${pen}/link`, {}, priya.cookie)).status).toBe(403); // no Trust Center module
    expect((await call("POST", "ws/trust/nda", {}, val.cookie)).status).toBe(200);
    expect((await call("GET", `ws/trust/resources/${pen}/link`, {}, val.cookie)).body).toMatchObject({ url: expect.stringContaining("pentest.pdf") });
    // revoke needs a reason
    const acc = (await tdata(owen.cookie)).accounts[0];
    expect((await call("POST", `ws/trust/accounts/${acc.id}/revoke`, {}, owen.cookie)).status).toBe(400);
    expect((await call("POST", `ws/trust/accounts/${acc.id}/revoke`, { reason: "Contract ended" }, owen.cookie)).status).toBe(200);
    expect((await call("GET", `ws/trust/resources/${pen}/link`, {}, val.cookie)).status).toBe(403);
    // the chatbot answers only from verified answers
    await call("POST", "ws/answer-library", { q: "Where is customer data hosted?", a: "In the EU." }, owen.cookie);
    const ask = async () => body<{ ans: string | null }>(await call("POST", "ws/trust/questions", { q: "Where is my data hosted?" }, val.cookie));
    expect((await ask()).ans).toBeNull();
    const aid = body<{ answers: { id: string }[] }>(await call("GET", "ws/data/questionnaires", {}, jordan.cookie)).answers[0].id;
    await call("POST", `ws/answer-library/${aid}/verify`, {}, jordan.cookie);
    expect((await ask()).ans).toBe("In the EU.");
    expect((await tdata(val.cookie)).public.faq).toEqual([{ q: "Where is customer data hosted?", a: "In the EU." }]);
    for (const a of ["trust.resource.publish_requested", "trust.publish.applied", "trust.access.requested", "trust.domain.unblocked", "trust.access.approved", "trust.nda.accepted", "trust.document.viewed", "trust.account.revoked"]) expect(log(a).length, a).toBeGreaterThan(0);
  });
});

describe("review findings (group 4 cross-check)", () => {
  it("a block withdraws a pending Critical gate approval; a public file change needs approval again; unblocking a parent domain still bars approval; revoke clears access; denials are recorded", async () => {
    const { jordan, casey, owen, val } = await team();
    await call("POST", "ws/vendors", { name: "Ledgerly", tier: "Critical" }, owen.cookie);
    await call("POST", "ws/vendors/V-001/gate", { decision: "Approved" }, jordan.cookie);
    const gate = (await vdata(jordan.cookie)).approvals[0];
    await call("POST", "ws/vendors/V-001/gate", { decision: "Blocked", reason: "Sanctions hit found today" }, owen.cookie);
    expect((await four(casey.cookie, gate.id, "approve")).body).toEqual({ error: "Request is withdrawn." });
    expect((await vendor(casey.cookie, "V-001")).gate).toBe("Blocked");
    // trust: replacing a public file sends it back to "on request" until approved again
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    const id = body<{ id: string }>(await call("POST", "ws/trust/resources", { name: "SOC 2 summary", access: "Public" }, jordan.cookie)).id;
    expect((await call("POST", `ws/trust/resources/${id}/file`, { name: "soc2.pdf" }, casey.cookie, pdf)).status).toBe(400); // publication pending
    const tap = body<{ approvals: { id: string }[] }>(await call("GET", "ws/data/trust", {}, jordan.cookie)).approvals[0];
    await four(casey.cookie, tap.id, "approve");
    expect((await call("POST", `ws/trust/resources/${id}/file`, { name: "internal.pdf" }, owen.cookie, pdf)).status).toBe(200);
    const res = body<{ resources: { id: string; access: string }[] }>(await call("GET", "ws/data/trust", {}, val.cookie)).resources.find((x) => x.id === id)!;
    expect(res).toEqual({ id, name: "SOC 2 summary", access: "On request, NDA", status: "Active", file: { name: "internal.pdf" } }); // trimmed for visitors
    // a parent-domain unblock
    await call("POST", "ws/trust/blocked-domains", { domain: "customer.example" }, jordan.cookie);
    const valSub = await member("val2@sub.customer.example", "viewer", "Val Two");
    await call("POST", "ws/trust/access-requests", { resourceId: id }, valSub.cookie);
    const rq = body<{ requests: { id: string }[] }>(await call("GET", "ws/data/trust", {}, jordan.cookie)).requests[0];
    expect((await call("POST", `ws/trust/requests/${rq.id}/approve`, {}, casey.cookie)).status).toBe(403);
    expect(log("trust.access.approve.denied")).toHaveLength(1); // recorded although refused
    await call("POST", "ws/trust/blocked-domains/customer.example/delete", { reason: "Confirmed customer" }, casey.cookie);
    expect((await call("POST", `ws/trust/requests/${rq.id}/approve`, {}, casey.cookie)).body).toEqual({ error: "Segregation of duties: you unblocked this domain, so another admin or owner must approve its requests." });
    expect((await call("POST", `ws/trust/requests/${rq.id}/approve`, {}, jordan.cookie)).status).toBe(200);
    const a1 = (await call("GET", "ws/data/trust", {}, jordan.cookie)).body as { accounts: { id: string; access: string[] }[]; modeHist: unknown[] };
    expect(a1.modeHist.length).toBeGreaterThan(0);
    await call("POST", `ws/trust/accounts/${a1.accounts[0].id}/revoke`, { reason: "Contract ended" }, jordan.cookie);
    expect(((await call("GET", "ws/data/trust", {}, jordan.cookie)).body as { accounts: { access: string[] }[] }).accounts[0].access).toEqual([]);
  });
  it("an answer cannot be verified by anyone who ever edited it", async () => {
    const { jordan, casey, priya } = await team();
    const { id } = body<{ id: string }>(await call("POST", "ws/answer-library", { q: "Is data encrypted?", a: "Yes." }, priya.cookie));
    await call("POST", `ws/answer-library/${id}`, { q: "Is data encrypted?", a: "Yes, AES-256." }, casey.cookie);
    await call("POST", `ws/answer-library/${id}`, { q: "Is data encrypted?", a: "Yes, AES-256 at rest." }, priya.cookie);
    expect((await call("POST", `ws/answer-library/${id}/verify`, {}, casey.cookie)).status).toBe(403);
    expect((await call("POST", `ws/answer-library/${id}/verify`, {}, jordan.cookie)).status).toBe(200);
  });
});

describe("commitments", () => {
  it("real analysis against the standard terms, review by another person, and the company's incident clock", async () => {
    const { jordan, casey, priya } = await team();
    expect((await call("POST", "ws/commitments", { name: "x" }, priya.cookie)).status).toBe(403);
    const a = body<{ id: string }>(await call("POST", "ws/commitments", { name: "Globex MSA", detail: "Breach notice within 24 hours" }, jordan.cookie)).id;
    await call("POST", "ws/commitments", { name: "Initech MSA", detail: "99.5% uptime" }, jordan.cookie);
    const rows = body<{ commitment: string; finding: string }[]>(await call("POST", "ws/commitments/analysis", {}, casey.cookie));
    expect(rows.find((r) => r.commitment === "Globex MSA")!.finding).toMatch(/Stricter than our standard/);
    expect(rows.find((r) => r.commitment === "Initech MSA")!.finding).toMatch(/Looser than our standard/);
    expect((await call("POST", `ws/commitments/${a}/review`, { note: "Can meet 24h notice" }, jordan.cookie)).status).toBe(403);
    expect((await call("POST", `ws/commitments/${a}/review`, { note: "Can meet 24h notice" }, casey.cookie)).status).toBe(200);
    expect((await call("POST", "ws/incidents", { summary: "Suspected exposure" }, jordan.cookie)).status).toBe(200);
    expect((await call("POST", "ws/incidents", {}, casey.cookie)).status).toBe(400);
    const cd = async () => body<{ incident: { active: boolean; deadline?: string }; incidents: unknown[] }>(await call("GET", "ws/data/commitments", {}, casey.cookie));
    expect((await cd()).incident).toMatchObject({ active: true, deadline: expect.stringMatching(/UTC$/) });
    expect((await call("POST", "ws/incidents/close", { outcome: "short" }, casey.cookie)).status).toBe(400);
    expect((await call("POST", "ws/incidents/close", { outcome: "False alarm, no data left the system" }, casey.cookie)).status).toBe(200);
    expect((await cd()).incident.active).toBe(false); expect((await cd()).incidents).toHaveLength(1);
  });
});

describe("vendor logos (reference review R14)", () => {
  const PNG = "data:image/png;base64," + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]).toString("base64");
  it("accepts only a small PNG data URL, lets admins and owners set or remove it, and logs the change", async () => {
    const { jordan, owen, ana } = await team();
    await call("POST", "ws/vendors", { name: "Ledgerly", tier: "Low", score: "70" }, jordan.cookie);
    const set = (logo: unknown, c = jordan.cookie) => call("POST", "ws/vendors/V-001/logo", { logo }, c);
    for (const bad of ["data:image/svg+xml;base64,PHN2Zy8+", "data:image/png;base64," + Buffer.from("<script>alert(1)</script>").toString("base64"), "https://cdn.example.test/logo.png", 42,
      "data:image/png;base64," + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(70 * 1024)]).toString("base64")]) expect((await set(bad)).status).toBe(400);
    expect((await set(PNG, ana.cookie)).status).toBe(403);
    expect((await set(PNG, owen.cookie)).status).toBe(200);
    expect((await vdata(jordan.cookie)).vendors[0].logo).toBe(PNG);
    expect(log("vendor.logo.changed").at(-1)?.target).toBe("Ledgerly");
    expect((await set(null)).status).toBe(200);
    expect((await vdata(jordan.cookie)).vendors[0].logo).toBeUndefined();
    expect(log("vendor.logo.removed").length).toBe(1);
  });
});
