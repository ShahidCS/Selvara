import { beforeEach, describe, expect, it } from "vitest";
import { COOKIE, handle, type Req, type Res } from "@/server/core";
import { MemoryAuth, MemoryStore } from "@/server/memory";
import { MemoryDirectory } from "@/server/directory";
import { MemoryPlatform } from "@/server/platform";
import { MemorySupport } from "@/server/support";
import { MemoryWsStore } from "@/server/ws/store";
import { MemoryFileStore } from "@/server/ws/files";
import { compose, mailerFromEnv, type Mailer, type MailMessage } from "@/server/mail";
import { VCOOKIE } from "@/server/visitor";
import type { Deps } from "@/server/types";
import { totpAt } from "@/lib/totp";

/* Production programme, group 8b (email; the standalone vendor portal) through `handle`, against the in-memory stand-ins and a stand-in mailer
   that keeps what would be sent (nothing leaves the test). Checked against docs/architecture/inventory/group8-admin-billing-email.md,
   section 6, and group 4, section 2B. Synthetic people, companies and addresses only. */
const ORIGIN = "https://app.example.test";
let clock = 1_800_000_000_000; let d: Deps; let auth: MemoryAuth; let store: MemoryStore; let dir: MemoryDirectory; let ACME = "";
const used = new Map<string, number>(); const sent: MailMessage[] = [];
const MAIL: Mailer = { provider: "resend", from: "Selvara <no-reply@mail.example.test>", send: async (m) => { sent.push(m); } };
beforeEach(() => {
  clock = 1_800_000_000_000; used.clear(); sent.length = 0; auth = new MemoryAuth(() => clock); store = new MemoryStore(() => clock); dir = new MemoryDirectory(store);
  const plat = new MemoryPlatform(store, dir);
  ACME = dir.addCompany("acme-eu", "Acme Test Co");
  d = { auth, store, dir, plat, sup: new MemorySupport(store, dir, plat), ws: new MemoryWsStore(store), files: new MemoryFileStore(), site: { origin: ORIGIN, rpId: "app.example.test" }, secret: "x".repeat(40), now: () => clock, mail: MAIL };
});
const PW = "Lantern-orbit-Quince-71";
async function call(method: string, path: string, body: Record<string, unknown> = {}, cookies: Record<string, string> = {}, raw?: Uint8Array, ip = "198.51.100.7"): Promise<Res> {
  const r: Req = { method, path: path.split("/").filter(Boolean), body, ip, cookies, raw, headers: { origin: ORIGIN, "content-type": raw ? "application/octet-stream" : "application/json", "user-agent": "Mozilla/5.0 Chrome/140" } };
  return handle(d, r);
}
async function code(email: string) {
  const secret = auth.secretOf(email)!; const step = Math.floor(clock / 30_000);
  if ((used.get(email) ?? -1) >= step) clock = (step + 1) * 30_000 + 1_000;
  used.set(email, Math.floor(clock / 30_000)); return totpAt(secret, clock);
}
async function member(email: string, role: string, person: string) {
  const id = await auth.createUser(email, PW, person); await auth.confirmUser(id);
  await store.insertProfile({ id, email, person, status: "Active", requestedAt: clock }); dir.addMember(ACME, id, role);
  const st = await call("POST", "auth/sign-in", { email, password: PW });
  const v = await call("POST", "auth/sign-in/verify", { ticket: (st.body as { ticket: string }).ticket, code: await code(email) });
  return { id, c: { [COOKIE]: v.cookies![0].match(new RegExp(`${COOKIE}=([^;]*)`))![1] } };
}
const log = (action: string) => store.auditLog.filter((x) => x.action === action);
const body = <T,>(r: Res) => r.body as T;
const last = () => sent[sent.length - 1];

describe("email (off until configured)", () => {
  it("reads only a complete configuration, escapes what it renders, and never puts a link where none is", () => {
    expect(mailerFromEnv({ MAIL_PROVIDER: "resend", MAIL_API_KEY: "k" })).toBeUndefined(); // no sender
    expect(mailerFromEnv({ MAIL_PROVIDER: "smtp", MAIL_API_KEY: "k", MAIL_FROM: "a@b.example" })).toBeUndefined();
    expect(mailerFromEnv({ MAIL_PROVIDER: "postmark", MAIL_API_KEY: "k", MAIL_FROM: "Selvara <no-reply@mail.example.test>" })?.provider).toBe("postmark");
    const m = compose("x@acme.example", { t: "invite", company: "<b>Acme</b>\r\nBcc: evil@example.test", role: "employee", link: "https://app.example.test/login#invite=abc\"><script>", expires: "2027-01-01 00:00 UTC" });
    expect(m.subject).not.toMatch(/[\r\n]/); expect(m.html).not.toContain("<b>Acme"); expect(m.html).not.toContain("<script>"); expect(m.html).toContain("&lt;b&gt;");
  });
  it("emails an invitation instead of showing the link, and shows the link when email is off", async () => {
    const jordan = await member("jordan@acme.example", "admin", "Jordan Avery");
    const r = body<{ emailed: boolean; link?: string }>(await call("POST", "team/invitations", { email: "new.person@acme.example", role: "employee" }, jordan.c));
    expect(r.emailed).toBe(true); expect(r.link).toBeUndefined();
    expect(last().to).toBe("new.person@acme.example"); expect(last().text).toMatch(/#invite=[A-Za-z0-9_-]{20,}/);
    expect(log("email.sent")[0].target).toBe("invite to n•••@acme.example"); // a masked address, never the message
    d.mail = null;
    const off = body<{ emailed: boolean; link?: string; mail?: string }>(await call("POST", "team/invitations", { email: "second@acme.example", role: "employee" }, jordan.c));
    expect(off).toMatchObject({ emailed: false, mail: "not configured" }); expect(off.link).toMatch(/#invite=/);
  });
  it("limits messages to one address to 10 an hour", async () => {
    const jordan = await member("jordan@acme.example", "admin", "Jordan Avery");
    const inv = body<{ id: string }>(await call("POST", "team/invitations", { email: "busy@acme.example", role: "employee" }, jordan.c));
    for (let i = 0; i < 9; i++) expect(body<{ emailed: boolean }>(await call("POST", `team/invitations/${inv.id}/link`, {}, jordan.c)).emailed).toBe(true);
    const r = body<{ emailed: boolean; link?: string; mail?: string }>(await call("POST", `team/invitations/${inv.id}/link`, {}, jordan.c));
    expect(r).toMatchObject({ emailed: false, mail: "rate limited" }); expect(r.link).toMatch(/#invite=/); // the admin still gets a working link
  });
  it("tells an applicant the outcome of their request to join", async () => {
    const jordan = await member("jordan@acme.example", "admin", "Jordan Avery");
    await call("POST", "auth/join-requests", { name: "Riley Shaw", email: "riley@acme.example", password: PW, company: "acme-eu" });
    const p = (await store.profileByEmail("riley@acme.example"))!;
    expect((await call("POST", `team/join-requests/${p.id}/approve`, { reason: "Confirmed with the hiring manager" }, jordan.c)).status).toBe(200);
    expect(last()).toMatchObject({ to: "riley@acme.example", subject: "You can now sign in to Acme Test Co" });
    expect(last().text).not.toContain("hiring manager"); // the admin's reason is not sent
  });
});

describe("standalone vendor portal", () => {
  const Q = ["G1", "A1", "A2", "D1", "D2", "C1", "I3", "F1", "R3", "B1", "S1", "X1"];
  const CRIT = ["G1", "A1", "A2", "D1", "D2", "C1", "I3", "F1", "R3"];
  const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj<<>>endobj\n");
  async function setup() {
    const jordan = await member("jordan@acme.example", "admin", "Jordan Avery");
    const v = body<{ id: string }>(await call("POST", "ws/vendors", { name: "Example Vendor Ltd", cat: "Cloud", tier: "High" }, jordan.c));
    return { jordan, vendorId: v.id ?? (body<{ vendors: { id: string }[] }>(await call("GET", "ws/data/vendors", {}, jordan.c)).vendors[0].id) };
  }
  const tokenOf = (m: MailMessage) => /#t=([A-Za-z0-9_-]+)/.exec(m.text)![1];
  const codeOf = (m: MailMessage) => /code for .* is (\d{6})/.exec(m.text)![1];
  it("sends by email, verifies the address and a code, and locks answers when submitted; a clarification reopens only the chosen questions", async () => {
    const { jordan, vendorId } = await setup();
    expect((await call("POST", `ws/vendors/${vendorId}/questionnaire/email`, { email: "someone@gmail.com" }, jordan.c)).status).toBe(400); // a personal address
    const s = body<{ id: string; emailed: boolean }>(await call("POST", `ws/vendors/${vendorId}/questionnaire/email`, { email: "contact@vendor.example" }, jordan.c));
    expect(s.emailed).toBe(true); expect(last().to).toBe("contact@vendor.example");
    const token = tokenOf(last());
    // the company's view never carries the link's hash
    const data = JSON.stringify(body(await call("GET", "ws/data/vendors", {}, jordan.c)));
    expect(data).not.toContain("tokenHash"); expect(data).toContain("contact@vendor.example");
    expect(body<{ customer: string; vendor: string }>(await call("POST", "vendor-portal/open", { token }))).toMatchObject({ customer: "Acme Test Co", vendor: "Example Vendor Ltd" });
    expect((await call("POST", "vendor-portal/open", { token: "x".repeat(43) })).status).toBe(404);
    // another address: the same answer as the right one, but no code is sent (the reply never reveals the invited address)
    const n0 = sent.length;
    expect(body<{ to: string }>(await call("POST", "vendor-portal/verify-email", { token, email: "other@vendor.example" })).to).toBe("o•••@vendor.example");
    expect(sent.length).toBe(n0);
    const n = sent.length;
    expect(body<{ to: string }>(await call("POST", "vendor-portal/verify-email", { token, email: "Contact@Vendor.example" })).to).toBe("c•••@vendor.example");
    expect(sent.length).toBe(n + 1); const otp = codeOf(last());
    expect((await call("POST", "vendor-portal/verify-code", { token, email: "contact@vendor.example", code: "000000" === otp ? "111111" : "000000" })).status).toBe(400);
    const signed = await call("POST", "vendor-portal/verify-code", { token, email: "contact@vendor.example", code: otp });
    expect(signed.status).toBe(200); const vc = { [VCOOKIE]: signed.cookies![0].match(new RegExp(`${VCOOKIE}=([^;]*)`))![1] };
    expect((await call("POST", "vendor-portal/verify-code", { token, email: "contact@vendor.example", code: otp })).status).toBe(400); // once
    // the visitor session opens the portal only, never the workspace
    expect((await call("GET", "ws/data/vendors", {}, vc)).status).toBe(401);
    const q = body<{ questions: { id: string }[]; status: string }>(await call("GET", "vendor-portal/questionnaire", {}, vc));
    expect(q.questions.map((x) => x.id)).toEqual(Q); expect(q.status).toBe("Sent");
    // answers: every one, and evidence for each critical "Yes"
    const items = Object.fromEntries(Q.map((id) => [id, { answer: "Y", comment: `Answer for ${id}` }]));
    await call("POST", "vendor-portal/draft", { items }, vc);
    expect(body<{ error: string }>(await call("POST", "vendor-portal/submit", {}, vc)).error).toBe(`${CRIT.length} "Yes" answers on required items still need evidence attached.`);
    expect((await call("POST", "vendor-portal/files/G1", { name: "cert.pdf" }, vc, new TextEncoder().encode("not a pdf"))).status).toBe(400); // content checked
    for (const id of CRIT) expect((await call("POST", `vendor-portal/files/${id}`, { name: `${id}.pdf` }, vc, PDF)).status).toBe(200);
    expect((await call("POST", "vendor-portal/submit", {}, vc)).status).toBe(200);
    expect(log("vendor.questionnaire.submitted")[0].actor).toBe("Vendor contact c•••@vendor.example");
    expect((await call("POST", "vendor-portal/draft", { items }, vc)).status).toBe(409); // locked
    expect((await call("POST", "vendor-portal/open", { token })).status).toBe(404); // the link cannot start a new sign-in after submitting
    // the company opens the evidence through a short link, and asks for a clarification on two questions
    const vq = body<{ questionnaires: { id: string; status: string; answers: string[] }[] }>(await call("GET", "ws/data/vendors", {}, jordan.c)).questionnaires[0];
    expect(vq.status).toBe("Submitted"); expect(vq.answers[0]).toMatch(/^Yes: Answer for G1 \[evidence: G1\.pdf\]$/);
    expect(body<{ url: string }>(await call("POST", `ws/vendor-questionnaires/${vq.id}/files/G1/link`, {}, jordan.c)).url).toBeTruthy();
    expect(body<{ emailed: boolean }>(await call("POST", `ws/vendor-questionnaires/${vq.id}/reopen`, { note: "Please confirm the certificate scope", questions: ["G1", "B1"] }, jordan.c)).emailed).toBe(true);
    expect(last().subject).toBe("Acme Test Co asks for a clarification");
    const token2 = tokenOf(last()); expect(token2).not.toBe(token);
    expect((await call("POST", "vendor-portal/open", { token })).status).toBe(404); // the old link stopped working
    const re = body<{ clarify: string[]; clarifyNote: string }>(await call("GET", "vendor-portal/questionnaire", {}, vc));
    expect(re).toMatchObject({ clarify: ["G1", "B1"], clarifyNote: "Please confirm the certificate scope" });
    await call("POST", "vendor-portal/draft", { items: { ...items, A1: { answer: "N", comment: "changed" } } }, vc); // A1 is not reopened: kept
    expect((await call("POST", "vendor-portal/submit", {}, vc)).status).toBe(400); // each reopened answer needs a new note, a Yes new evidence
    await call("POST", "vendor-portal/draft", { items: { G1: { answer: "Y", comment: "Scope covers all services" }, B1: { answer: "P", comment: "Partly, see note" } } }, vc);
    expect((await call("POST", "vendor-portal/submit", {}, vc)).status).toBe(400); // G1 Yes: new evidence
    await call("POST", "vendor-portal/files/G1", { name: "scope.pdf" }, vc, PDF);
    const v2 = body<{ version: number; items: Record<string, { answer: string }> }>(await call("POST", "vendor-portal/submit", {}, vc));
    expect(v2.version).toBe(2); expect(v2.items.A1.answer).toBe("Y");
    expect(log("vendor.questionnaire.clarified")).toHaveLength(1);
    // signing out ends the visitor session
    await call("POST", "vendor-portal/sign-out", {}, vc);
    expect((await call("GET", "vendor-portal/questionnaire", {}, vc)).status).toBe(401);
  });
  it("ends a link after three wrong addresses, and the company can send a new one", async () => {
    const { jordan, vendorId } = await setup();
    const s = body<{ id: string }>(await call("POST", `ws/vendors/${vendorId}/questionnaire/email`, { email: "contact@vendor.example" }, jordan.c));
    const token = tokenOf(last());
    for (let i = 0; i < 2; i++) expect((await call("POST", "vendor-portal/verify-email", { token, email: `guess${i}@vendor.example` })).status).toBe(200);
    expect((await call("POST", "vendor-portal/verify-email", { token, email: "guess3@vendor.example" })).status).toBe(404);
    expect((await call("POST", "vendor-portal/verify-email", { token, email: "contact@vendor.example" })).status).toBe(404);
    expect(log("vendor.portal.link_ended")).toHaveLength(1);
    expect((await call("POST", `ws/vendor-questionnaires/${s.id}/link`, {}, jordan.c)).status).toBe(200);
    expect((await call("POST", "vendor-portal/verify-email", { token: tokenOf(last()), email: "contact@vendor.example" })).status).toBe(200);
  });
  it("counts code tries atomically: guesses sent together cannot exceed five", async () => {
    const { jordan, vendorId } = await setup();
    await call("POST", `ws/vendors/${vendorId}/questionnaire/email`, { email: "contact@vendor.example" }, jordan.c);
    const token = tokenOf(last());
    await call("POST", "vendor-portal/verify-email", { token, email: "contact@vendor.example" }); const otp = codeOf(last());
    const wrong = otp === "000001" ? "000002" : "000001";
    const res = await Promise.all(Array.from({ length: 20 }, () => call("POST", "vendor-portal/verify-code", { token, email: "contact@vendor.example", code: wrong })));
    expect(res.every((x) => x.status === 400)).toBe(true);
    expect((await call("POST", "vendor-portal/verify-code", { token, email: "contact@vendor.example", code: otp })).status).toBe(400); // the code ended
  });
  it("is closed while email is off", async () => {
    const { jordan, vendorId } = await setup(); d.mail = null;
    expect((await call("POST", `ws/vendors/${vendorId}/questionnaire/email`, { email: "contact@vendor.example" }, jordan.c)).status).toBe(400);
  });
});

describe("public Trust Center (anonymous visitors)", () => {
  const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj<<>>endobj\n");
  type Data = { resources: { id: string; name: string; access: string }[]; approvals: { id: string; kind: string; status: string }[]; requests: { id: string; who: string }[]; publicPage: { on: boolean; pending: string | null } };
  async function setup() {
    const jordan = await member("jordan@acme.example", "admin", "Jordan Avery");
    const casey = await member("casey@acme.example", "owner", "Casey Morgan");
    const data = async () => body<Data>(await call("GET", "ws/data/trust", {}, jordan.c));
    const approve = async (kind: string) => { const a = (await data()).approvals.find((x) => x.kind === kind && x.status === "Pending")!; expect((await call("POST", `ws/four-eyes/${a.id}/approve`, { reason: "Checked and agreed with the team" }, casey.c)).status).toBe(200); };
    // two documents with files: one made public (four-eyes), one on request
    for (const name of ["ISO certificate", "SOC 2 report"]) await call("POST", "ws/trust/resources", { name, access: "On request, NDA" }, jordan.c);
    const [iso, soc] = (await data()).resources;
    for (const x of [iso, soc]) expect((await call("POST", `ws/trust/resources/${x.id}/file`, { name: `${x.id}.pdf` }, jordan.c, PDF)).status).toBe(200);
    await call("POST", `ws/trust/resources/${iso.id}/visibility`, {}, jordan.c); await approve("trust.publish");
    return { jordan, casey, data, approve, iso, soc };
  }
  it("is off until a second person approves turning it on; a visit never reveals whether a company exists", async () => {
    const { jordan, data, approve } = await setup();
    expect((await call("GET", "trust-public/acme-eu")).status).toBe(404);
    expect(body<{ error: string }>(await call("GET", "trust-public/no-such-co")).error).toBe("This Trust Center is not public.");
    expect(body<{ pending: boolean }>(await call("POST", "ws/trust/public-page", { enabled: true }, jordan.c)).pending).toBe(true);
    expect((await call("POST", `ws/four-eyes/${(await data()).approvals.find((x) => x.kind === "trust.public-page")!.id}/approve`, { reason: "My own request approved" }, jordan.c)).status).toBe(403);
    await approve("trust.public-page");
    const page = body<{ company: string; documents: { name: string; open: boolean }[]; visitor: unknown }>(await call("GET", "trust-public/acme-eu"));
    expect(page.company).toBe("Acme Test Co"); expect(page.visitor).toBeNull();
    // F1-02: the document under NDA is counted, never named, for an anonymous visitor
    expect(page.documents.map((x) => [x.name, x.open])).toEqual([["ISO certificate", true]]);
    expect((page as unknown as { ndaCount: number }).ndaCount).toBe(1); expect(JSON.stringify(page)).not.toContain("SOC 2 report");
    await call("POST", "ws/trust/public-page", { enabled: false }, jordan.c); // off at once
    expect((await call("GET", "trust-public/acme-eu")).status).toBe(404);
  });
  it("lets a verified visitor request a document, emails the decision, and opens it only after the NDA", async () => {
    const { jordan, casey, data, approve, iso, soc } = await setup();
    await call("POST", "ws/trust/public-page", { enabled: true }, jordan.c); await approve("trust.public-page");
    expect(body<{ url: string }>(await call("GET", `trust-public/acme-eu/documents/${iso.id}/link`)).url).toBeTruthy(); // public: anyone
    expect((await call("GET", `trust-public/acme-eu/documents/${soc.id}/link`)).status).toBe(401);
    expect((await call("POST", "trust-public/acme-eu/requests", { resourceId: soc.id })).status).toBe(401); // verify first
    expect((await call("POST", "trust-public/acme-eu/code", { email: "buyer@hotmail.com" })).status).toBe(400); // a personal address
    expect(body<{ to: string }>(await call("POST", "trust-public/acme-eu/code", { email: "buyer@customer.example" })).to).toBe("b•••@customer.example");
    const otp = /is (\d{6})/.exec(last().text)![1];
    const v = await call("POST", "trust-public/acme-eu/verify", { email: "buyer@customer.example", code: otp });
    const vc = { [VCOOKIE]: v.cookies![0].match(new RegExp(`${VCOOKIE}=([^;]*)`))![1] };
    expect((await call("GET", "ws/data/trust", {}, vc)).status).toBe(401); // a visitor is never a member
    expect((await call("POST", "trust-public/acme-eu/requests", { resourceId: soc.id, reason: "Vendor due diligence" }, vc)).status).toBe(404); // F1-02: not named to them
    expect(body<{ queued: boolean }>(await call("POST", "trust-public/acme-eu/requests", { reason: "Vendor due diligence" }, vc)).queued).toBe(true);
    const rq = (await data()).requests[0]; expect(rq.who).toBe("buyer@customer.example");
    expect((await call("POST", `ws/trust/requests/${rq.id}/approve`, { resourceIds: [soc.id] }, casey.c)).status).toBe(200);
    expect(last()).toMatchObject({ to: "buyer@customer.example", subject: "Acme Test Co Trust Center: SOC 2 report" });
    expect((await call("GET", `trust-public/acme-eu/documents/${soc.id}/link`, {}, vc)).status).toBe(403); // the NDA first
    expect((await call("POST", "trust-public/acme-eu/nda", {}, vc)).status).toBe(200);
    expect(body<{ url: string }>(await call("GET", `trust-public/acme-eu/documents/${soc.id}/link`, {}, vc)).url).toBeTruthy();
    expect(log("trust.nda.accepted")[0].actor).toBe("Visitor b•••@customer.example");
    // the session is bound to this company's page
    dir.addCompany("other-co", "Other Test Co");
    expect(body<{ visitor: unknown }>(await call("GET", "trust-public/acme-eu", {}, vc)).visitor).not.toBeNull();
  });
  it("emails subscribers when a document is made public, with a working unsubscribe link; the chatbot is rate-limited", async () => {
    const { jordan, approve, soc } = await setup();
    await call("POST", "ws/trust/public-page", { enabled: true }, jordan.c); await approve("trust.public-page");
    await call("POST", "trust-public/acme-eu/code", { email: "reader@customer.example" });
    const v = await call("POST", "trust-public/acme-eu/verify", { email: "reader@customer.example", code: /is (\d{6})/.exec(last().text)![1] });
    const vc = { [VCOOKIE]: v.cookies![0].match(new RegExp(`${VCOOKIE}=([^;]*)`))![1] };
    expect((await call("POST", "trust-public/acme-eu/subscribe", {}, vc)).status).toBe(200);
    await call("POST", `ws/trust/resources/${soc.id}/visibility`, {}, jordan.c); await approve("trust.publish");
    const upd = sent.find((m) => m.subject === "Acme Test Co Trust Center update")!; expect(upd.to).toBe("reader@customer.example"); expect(upd.text).toContain("SOC 2 report");
    const token = /#unsubscribe=([A-Za-z0-9_-]+)/.exec(upd.text)![1];
    expect(upd.headers?.["List-Unsubscribe"]).toBe(`<${ORIGIN}/trust/acme-eu#unsubscribe=${token}>`);
    expect((await call("POST", "trust-public/acme-eu/unsubscribe", { token })).status).toBe(200);
    expect((await call("POST", "trust-public/acme-eu/unsubscribe", { token })).status).toBe(404);
    for (let i = 0; i < 20; i++) expect((await call("POST", "trust-public/acme-eu/questions", { q: "Do you encrypt data at rest?" }, {}, undefined, "203.0.113.9")).status).toBe(200);
    expect((await call("POST", "trust-public/acme-eu/questions", { q: "One more?" }, {}, undefined, "203.0.113.9")).status).toBe(429);
  });
  it("refuses an admin approving their own visitor request, and a member's address", async () => {
    const { jordan, casey, approve, soc } = await setup();
    await call("POST", "ws/trust/public-page", { enabled: true }, jordan.c); await approve("trust.public-page");
    const visit = async (email: string) => { await call("POST", "trust-public/acme-eu/code", { email }); const v = await call("POST", "trust-public/acme-eu/verify", { email, code: /is (\d{6})/.exec(last().text)![1] }); return { [VCOOKIE]: v.cookies![0].match(new RegExp(`${VCOOKIE}=([^;]*)`))![1] }; };
    expect(body<{ queued: boolean }>(await call("POST", "trust-public/acme-eu/requests", { reason: "Checking our own page" }, await visit("jordan@acme.example"))).queued).toBe(true);
    const rq = body<{ requests: { id: string }[] }>(await call("GET", "ws/data/trust", {}, jordan.c)).requests[0];
    expect((await call("POST", `ws/trust/requests/${rq.id}/approve`, { resourceIds: [soc.id] }, jordan.c)).status).toBe(403); // their own address
    expect((await call("POST", `ws/trust/requests/${rq.id}/approve`, { resourceIds: [soc.id] }, casey.c)).status).toBe(403); // a member's address
  });
  it("keys limits on the company, says when a request is not queued, and lets an unsubscribed visitor subscribe again", async () => {
    const { jordan, approve, iso } = await setup();
    await call("POST", "ws/trust/public-page", { enabled: true }, jordan.c); await approve("trust.public-page");
    for (let i = 0; i < 20; i++) await call("POST", `trust-public/${i % 2 ? "ACME-EU" : "Acme-Eu"}/questions`, { q: "Anything?" }, {}, undefined, "203.0.113.30");
    expect((await call("POST", "trust-public/acme-eu/questions", { q: "One more?" }, {}, undefined, "203.0.113.30")).status).toBe(429);
    await call("POST", "trust-public/acme-eu/code", { email: "reader@customer.example" });
    const v = await call("POST", "trust-public/acme-eu/verify", { email: "reader@customer.example", code: /is (\d{6})/.exec(last().text)![1] });
    const vc = { [VCOOKIE]: v.cookies![0].match(new RegExp(`${VCOOKIE}=([^;]*)`))![1] };
    expect(body<{ queued: boolean; why: string }>(await call("POST", "trust-public/acme-eu/requests", { resourceId: iso.id }, vc)).why).toMatch(/public/);
    await call("POST", "trust-public/acme-eu/subscribe", {}, vc);
    const db = d.ws as unknown as { tx: Deps["ws"]["tx"] };
    const token = await db.tx({ id: "", name: "t", role: "admin", tenantId: ACME, ip: "x" }, clock, async (t) => (await t.list<{ token: string }>("trust-sub"))[0].data.token);
    await call("POST", "ws/trust/public-page", { enabled: false }, jordan.c); // even with the page off, a subscriber can leave
    expect((await call("POST", "trust-public/acme-eu/unsubscribe", { token })).status).toBe(200);
    await call("POST", "ws/trust/public-page", { enabled: true }, jordan.c); await approve("trust.public-page");
    expect(body<{ visitor: { subscribed: boolean } }>(await call("GET", "trust-public/acme-eu", {}, vc)).visitor.subscribed).toBe(false);
    expect((await call("POST", "trust-public/acme-eu/subscribe", {}, vc)).status).toBe(200);
  });
});
