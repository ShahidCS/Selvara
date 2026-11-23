import { beforeEach, describe, expect, it } from "vitest";
import { COOKIE, handle, type Req, type Res } from "@/server/core";
import { MemoryAuth, MemoryStore } from "@/server/memory";
import { MemoryDirectory } from "@/server/directory";
import { MemoryPlatform } from "@/server/platform";
import { MemorySupport } from "@/server/support";
import { MemoryWsStore } from "@/server/ws/store";
import { MemoryFileStore } from "@/server/ws/files";
import type { Mailer, MailMessage } from "@/server/mail";
import { VCOOKIE } from "@/server/visitor";
import type { Deps } from "@/server/types";
import { totpAt } from "@/lib/totp";

/* Security fix F1-02: what the Trust Center shows to people outside the company. Sections the company does not publish are left out of
   what the server sends (the anonymous page and the Viewer/Vendor view); the live control status needs a second admin to be shown;
   documents under NDA are counted, never named, until granted; each viewer accepts the NDA for themselves; accounts reference documents by
   id, so a rename never changes access; records from before are migrated when read. Synthetic people, companies and addresses only. */
const ORIGIN = "https://app.example.test";
let clock = 1_800_000_000_000; let d: Deps; let auth: MemoryAuth; let store: MemoryStore; let dir: MemoryDirectory; let ws: MemoryWsStore; let ACME = "";
const used = new Map<string, number>(); const sent: MailMessage[] = [];
const MAIL: Mailer = { provider: "resend", from: "Selvara <no-reply@mail.example.test>", send: async (m) => { sent.push(m); } };
beforeEach(() => {
  clock = 1_800_000_000_000; used.clear(); sent.length = 0; auth = new MemoryAuth(() => clock); store = new MemoryStore(() => clock); dir = new MemoryDirectory(store);
  const plat = new MemoryPlatform(store, dir); ws = new MemoryWsStore(store);
  ACME = dir.addCompany("acme-eu", "Acme Test Co");
  d = { auth, store, dir, plat, sup: new MemorySupport(store, dir, plat), ws, files: new MemoryFileStore(), site: { origin: ORIGIN, rpId: "app.example.test" }, secret: "x".repeat(40), now: () => clock, mail: MAIL };
});
const PW = "Lantern-orbit-Quince-71";
type Cookies = Record<string, string>;
async function call(method: string, path: string, body: Record<string, unknown> = {}, cookies: Cookies = {}, raw?: Uint8Array): Promise<Res> {
  const r: Req = { method, path: path.split("/").filter(Boolean), body, ip: "198.51.100.7", cookies, raw, headers: { origin: ORIGIN, "content-type": raw ? "application/octet-stream" : "application/json", "user-agent": "Mozilla/5.0 Chrome/140" } };
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
  return { id, c: { [COOKIE]: v.cookies![0].match(new RegExp(`${COOKIE}=([^;]*)`))![1] } as Cookies };
}
const body = <T,>(r: Res) => r.body as T;
const log = (action: string) => store.auditLog.filter((x) => x.action === action);
const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj<<>>endobj\n");
type Page = Record<string, unknown> & { documents?: { id: string; name: string; open: boolean }[]; ndaCount?: number; visitor: { account: { nda: string; access: string[] } | null; requests: { resource: string }[] } | null };
type Data = { resources: { id: string; name: string }[]; approvals: { id: string; kind: string; status: string }[]; requests: { id: string }[]; sections: Record<string, boolean>; sectionsPending: string | null;
  accounts: { id: string; people: { email: string; nda: string }[]; access: string[]; accessIds: string[] }[]; modeHist: { change: string }[]; public: Record<string, unknown> };

async function setup() {
  const jordan = await member("jordan@acme.example", "admin", "Jordan Avery");
  const casey = await member("casey@acme.example", "owner", "Casey Morgan");
  const val = await member("val@customer.example", "viewer", "Val Viewer");
  const data = async (c: Cookies = jordan.c) => body<Data>(await call("GET", "ws/data/trust", {}, c));
  const approve = async (kind: string) => { const a = (await data()).approvals.find((x) => x.kind === kind && x.status === "Pending")!; expect((await call("POST", `ws/four-eyes/${a.id}/approve`, { reason: "Checked and agreed with the team" }, casey.c)).status).toBe(200); };
  for (const name of ["ISO certificate", "SOC 2 report", "Pen test summary"]) await call("POST", "ws/trust/resources", { name, access: "On request, NDA" }, jordan.c);
  const [iso, soc, pen] = (await data()).resources;
  for (const x of [iso, soc, pen]) expect((await call("POST", `ws/trust/resources/${x.id}/file`, { name: `${x.id}.pdf` }, jordan.c, PDF)).status).toBe(200);
  await call("POST", `ws/trust/resources/${iso.id}/visibility`, {}, jordan.c); await approve("trust.publish");
  await call("POST", "ws/trust/public-page", { enabled: true }, jordan.c); await approve("trust.public-page");
  const page = async (c: Cookies = {}) => body<Page>(await call("GET", "trust-public/acme-eu", {}, c));
  const visit = async (email: string) => {
    await call("POST", "trust-public/acme-eu/code", { email });
    const v = await call("POST", "trust-public/acme-eu/verify", { email, code: /is (\d{6})/.exec(sent[sent.length - 1].text)![1] });
    return { [VCOOKIE]: v.cookies![0].match(new RegExp(`${VCOOKIE}=([^;]*)`))![1] } as Cookies;
  };
  return { jordan, casey, val, data, approve, page, visit, iso, soc, pen };
}

describe("Trust Center sections (F1-02)", () => {
  it("leaves hidden sections out of the anonymous page and the member view; live control status is off by default", async () => {
    const { jordan, val, data, page } = await setup();
    const both = async () => [await page(), (await data(val.c)).public];
    expect((await data()).sections).toEqual({ faq: true, subprocessors: true, updates: true, documents: true, controls: false });
    for (const p of await both()) { for (const k of ["faq", "subprocessors", "updates", "documents", "ndaCount"]) expect(p, k).toHaveProperty(k); expect(p).not.toHaveProperty("controls"); }
    for (const section of ["faq", "subprocessors", "updates", "documents"]) expect((await call("POST", "ws/trust/sections", { section, on: false }, jordan.c)).body).toMatchObject({ on: false, pending: false });
    for (const p of await both()) for (const k of ["faq", "subprocessors", "updates", "documents", "ndaCount", "controls"]) expect(p, k).not.toHaveProperty(k);
    expect(JSON.stringify(await page())).not.toContain("ISO certificate");
    expect((await data(val.c)).resources).toEqual([]); // nothing to open either
    expect((await call("GET", `trust-public/acme-eu/documents/${(await data()).resources[0].id}/link`)).status).toBe(404);
    expect((await call("POST", "ws/trust/sections", { section: "faq", on: false }, jordan.c)).status).toBe(400); // already hidden
    expect((await call("POST", "ws/trust/sections", { section: "faq", on: true }, val.c)).status).toBe(403); // admins and owners only
    expect((await call("POST", "ws/trust/sections", { section: "faq", on: true }, jordan.c)).body).toMatchObject({ on: true, pending: false }); // on again at once
    expect(await page()).toHaveProperty("faq");
    expect(log("trust.section.changed").map((x) => x.target)).toContain("Frequently asked questions → hidden");
    expect((await data()).modeHist.map((x) => x.change)).toContain("Frequently asked questions hidden from visitors");
  });
  it("shows the live control status only after a different admin or owner approves; the requester cannot; hiding it is immediate", async () => {
    const { jordan, casey, val, data, page } = await setup();
    expect((await call("POST", "ws/trust/sections", { section: "controls", on: true }, jordan.c)).body).toMatchObject({ on: false, pending: true });
    expect((await call("POST", "ws/trust/sections", { section: "controls", on: true }, casey.c)).body).toEqual({ error: "Showing the live control status is already awaiting approval." });
    const ap = (await data()).approvals.find((x) => x.kind === "trust.section-controls")!;
    expect((await data()).sectionsPending).toBe(ap.id);
    expect((await call("POST", `ws/four-eyes/${ap.id}/approve`, { reason: "Approving my own request" }, jordan.c)).status).toBe(403);
    expect(await page()).not.toHaveProperty("controls");
    expect((await call("POST", `ws/four-eyes/${ap.id}/approve`, { reason: "Agreed to publish our posture" }, casey.c)).status).toBe(200);
    expect(await page()).toHaveProperty("controls"); expect((await data(val.c)).public).toHaveProperty("controls");
    expect((await data()).sections.controls).toBe(true);
    expect((await call("POST", "ws/trust/sections", { section: "controls", on: false }, jordan.c)).body).toMatchObject({ on: false, pending: false });
    expect(await page()).not.toHaveProperty("controls");
    expect(log("trust.section.requested")).toHaveLength(1); expect(log("trust.section.changed").map((x) => x.target)).toEqual([expect.stringMatching(/^Live control status → shown \(approved by Casey Morgan/), "Live control status → hidden"]);
  });
});

describe("Documents under NDA (F1-02)", () => {
  it("are counted, not named, until granted; the approver chooses which; names appear once granted", async () => {
    const { jordan, casey, data, page, visit, iso, soc, pen } = await setup();
    const names = (p: Page) => (p.documents ?? []).map((x) => x.name);
    expect(names(await page())).toEqual(["ISO certificate"]); expect((await page()).ndaCount).toBe(2);
    const vc = await visit("buyer@customer.example");
    expect(names(await page(vc))).toEqual(["ISO certificate"]); expect((await page(vc)).ndaCount).toBe(2); // verified, nothing granted yet
    expect((await call("POST", "trust-public/acme-eu/requests", { reason: "short" }, vc)).status).toBe(400); // a reason is required
    expect((await call("POST", "trust-public/acme-eu/requests", { resourceId: soc.id, reason: "Vendor due diligence" }, vc)).status).toBe(404); // cannot name one
    expect((await call("POST", "trust-public/acme-eu/requests", { resourceId: "TRS-99", reason: "Vendor due diligence" }, vc)).status).toBe(404); // same answer
    expect(body<{ queued: boolean }>(await call("POST", "trust-public/acme-eu/requests", { reason: "Vendor due diligence" }, vc)).queued).toBe(true);
    expect((await page(vc)).visitor!.requests.map((x) => x.resource)).toEqual(["Documents under NDA"]);
    const rq = (await data()).requests[0];
    expect((await call("POST", `ws/trust/requests/${rq.id}/approve`, { resourceIds: [] }, casey.c)).body).toEqual({ error: "Select at least one document under NDA to grant." });
    expect((await call("POST", `ws/trust/requests/${rq.id}/approve`, { resourceIds: [iso.id] }, casey.c)).status).toBe(400); // public: nothing to grant
    expect((await call("POST", `ws/trust/requests/${rq.id}/approve`, { resourceIds: [soc.id] }, casey.c)).status).toBe(200);
    const after = await page(vc);
    expect(names(after)).toEqual(["ISO certificate", "SOC 2 report"]); expect(after.ndaCount).toBe(1); expect(JSON.stringify(after)).not.toContain("Pen test summary");
    expect(after.visitor!.account).toEqual({ company: "Customer", nda: "Pending", access: ["SOC 2 report"] });
    expect(after.visitor!.requests[0].resource).toBe("Documents under NDA: SOC 2 report");
    expect(names(await page())).toEqual(["ISO certificate"]); // still nothing named for anyone else
    expect((await call("GET", `trust-public/acme-eu/documents/${pen.id}/link`, {}, vc)).status).toBe(404); // not granted
    expect(log("trust.access.approved").at(-1)!.target).toContain("SOC 2 report");
    void jordan;
  });
  it("a member viewer sees the same: no names before the grant, then only what was granted", async () => {
    const { casey, val, data, soc } = await setup();
    const docs = async () => ((await data(val.c)).public as Page).documents!.map((x) => x.name);
    expect(await docs()).toEqual(["ISO certificate"]); expect((await data(val.c)).resources.map((x) => x.name)).toEqual(["ISO certificate"]);
    expect(body<{ queued: boolean }>(await call("POST", "ws/trust/access-requests", { reason: "Annual supplier review" }, val.c)).queued).toBe(true);
    await call("POST", `ws/trust/requests/${(await data()).requests[0].id}/approve`, { resourceIds: [soc.id] }, casey.c);
    expect(await docs()).toEqual(["ISO certificate", "SOC 2 report"]);
  });
});

describe("NDA per person and stable references (F1-02)", () => {
  it("one person's NDA never covers a colleague at the same company", async () => {
    const { casey, data, page, visit, soc } = await setup();
    const a = await visit("ana@customer.example"); const b = await visit("ben@customer.example");
    for (const c of [a, b]) {
      await call("POST", "trust-public/acme-eu/requests", { reason: "Vendor due diligence" }, c);
      const rq = (await data()).requests[0]; expect((await call("POST", `ws/trust/requests/${rq.id}/approve`, { resourceIds: [soc.id] }, casey.c)).status).toBe(200);
    }
    const acc = (await data()).accounts; expect(acc).toHaveLength(1); // one account for the company
    expect((await call("POST", "trust-public/acme-eu/nda", {}, a)).status).toBe(200);
    expect((await call("POST", "trust-public/acme-eu/nda", {}, a)).status).toBe(409); // already accepted, by them
    expect(body<{ url: string }>(await call("GET", `trust-public/acme-eu/documents/${soc.id}/link`, {}, a)).url).toBeTruthy();
    expect(body<{ error: string }>(await call("GET", `trust-public/acme-eu/documents/${soc.id}/link`, {}, b))).toEqual({ error: "Accept the NDA first." });
    expect((await page(b)).visitor!.account!.nda).toBe("Pending");
    expect((await data()).accounts[0].people).toEqual([{ email: "ana@customer.example", nda: expect.stringMatching(/^Accepted /) }, { email: "ben@customer.example", nda: "Pending" }]);
    expect((await call("POST", "trust-public/acme-eu/nda", {}, b)).status).toBe(200);
    expect((await call("GET", `trust-public/acme-eu/documents/${soc.id}/link`, {}, b)).status).toBe(200);
    // the address is not the stored reference: the account keeps a keyed hash for each visitor
    const stored = await ws.tx({ id: "", name: "t", role: "admin", tenantId: ACME, ip: "x" }, clock, async (t) => (await t.list<{ people: { key: string }[] }>("trust-account"))[0].data.people.map((p) => p.key));
    for (const k of stored) { expect(k).toMatch(/^e:[0-9a-f]{40}$/); expect(k).not.toContain("customer"); }
  });
  it("a rename never changes access", async () => {
    const { casey, data, visit, soc } = await setup();
    const vc = await visit("buyer@customer.example");
    await call("POST", "trust-public/acme-eu/requests", { reason: "Vendor due diligence" }, vc);
    await call("POST", `ws/trust/requests/${(await data()).requests[0].id}/approve`, { resourceIds: [soc.id] }, casey.c);
    await call("POST", "trust-public/acme-eu/nda", {}, vc);
    await ws.tx({ id: "", name: "t", role: "admin", tenantId: ACME, ip: "x" }, clock, async (t) => { const r = (await t.get<{ name: string }>("trust-resource", soc.id))!; await t.update("trust-resource", r.id, { ...r.data, name: "SOC 2 Type II report 2026" }, r.version); });
    expect((await call("GET", `trust-public/acme-eu/documents/${soc.id}/link`, {}, vc)).status).toBe(200);
    expect((await data()).accounts[0]).toMatchObject({ accessIds: [soc.id], access: ["SOC 2 Type II report 2026"] });
  });
  it("migrates accounts from before: names become ids, unknown names are dropped and logged, an account-wide NDA counts for nobody", async () => {
    const { val, data, page, visit, soc } = await setup();
    await ws.tx({ id: "", name: "t", role: "admin", tenantId: ACME, ip: "x" }, clock, async (t) => {
      await t.insert("trust-account", "TA-90", { id: "TA-90", company: "Customer", domain: "customer.example", nda: "Accepted 2026-10-01 by Val Viewer", viewers: ["buyer@customer.example", "val@customer.example"], access: ["SOC 2 report", "Retired policy"], status: "Active" });
    });
    const vc = await visit("buyer@customer.example");
    const p = await page(vc);
    expect(p.visitor!.account).toEqual({ company: "Customer", nda: "Pending", access: ["SOC 2 report"] });
    expect((await call("GET", `trust-public/acme-eu/documents/${soc.id}/link`, {}, vc)).body).toEqual({ error: "Accept the NDA first." });
    expect(log("trust.account.access.dropped").map((x) => x.target)).toEqual(['Customer: "Retired policy" matches no document, access removed']);
    const stored = await ws.tx({ id: "", name: "t", role: "admin", tenantId: ACME, ip: "x" }, clock, async (t) => (await t.get<{ access: string[]; people: { key: string; email: string }[] }>("trust-account", "TA-90"))!.data);
    expect(stored.access).toEqual([soc.id]); // saved back as ids
    expect(stored.people.find((x) => x.email === "val@customer.example")!.key).toBe(`u:${val.id}`); // a member is held by user id
    // the member viewer from the old record keeps the grant and accepts the NDA for themselves
    expect((await call("GET", `ws/trust/resources/${soc.id}/link`, {}, val.c)).body).toEqual({ error: "Accept the NDA first." });
    expect((await call("POST", "ws/trust/nda", {}, val.c)).status).toBe(200);
    expect((await call("GET", `ws/trust/resources/${soc.id}/link`, {}, val.c)).status).toBe(200);
    expect((await data()).accounts[0].people).toEqual([{ email: "buyer@customer.example", nda: "Pending" }, { email: "val@customer.example", nda: expect.stringMatching(/^Accepted /) }]);
    expect(log("trust.account.access.dropped")).toHaveLength(1); // migrated once
  });
});
