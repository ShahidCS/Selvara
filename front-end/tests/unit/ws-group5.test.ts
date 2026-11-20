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

/* Production programme, group 5 (Audits, auditor access, the company audit log) through `handle`, as /api runs it, against the in-memory stand-ins.
   Checked against the inventory in docs/architecture/inventory/group5-audits-auditor-auditlog-appsec.md. Synthetic people only. */
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
  const mo = await member("morgan@auditfirm.example", "auditor", "Morgan Blake");
  const kim = await member("kim@otherfirm.example", "auditor", "Kim Park");
  return { jordan, casey, owen, ana, priya, mo, kim };
}
type A = { id: string; stage: string; auditorAccess: string; lead: string; irs: { id: string; status: string }[]; findings: { id: string; status: string; issue: string }[]; pbc: { id: string; status: string }[]; snapshots: { id: string }[] };
const audits = async (cookie: string) => body<{ audits: A[]; auditors: { id: string }[] }>(await call("GET", "ws/data/audits", {}, cookie));
const audit = async (cookie: string, id: string) => (await audits(cookie)).audits.find((a) => a.id === id)!;

describe("audits", () => {
  it("an engagement shared with one named auditor for a period; findings become real issues; completion rules on every path", async () => {
    const { jordan, casey, owen, mo, kim, ana } = await team();
    expect((await call("POST", "ws/audits", { name: "x" }, ana.cookie)).status).toBe(403);
    const { id } = body<{ id: string }>(await call("POST", "ws/audits", { name: "ISO 27001 surveillance", fw: "ISO 27001", auditor: "BSI" }, jordan.cookie));
    expect(id).toBe("AUD-01");
    expect((await audits(mo.cookie)).audits).toEqual([]); // not shared yet
    expect((await call("POST", `ws/audits/${id}/auditor-access`, { auditorId: ana.id, until: day(30) }, jordan.cookie)).status).toBe(400); // not an auditor
    expect((await call("POST", `ws/audits/${id}/auditor-access`, { auditorId: mo.id, until: day(400) }, jordan.cookie)).status).toBe(400); // too long
    expect((await call("POST", `ws/audits/${id}/auditor-access`, { auditorId: mo.id, until: day(30) }, jordan.cookie)).status).toBe(200);
    expect(store.notices.some((n) => n.userId === mo.id && /auditor access to ISO 27001 surveillance/.test(n.text))).toBe(true);
    expect(await audit(mo.cookie, id)).toMatchObject({ auditorAccess: "granted", lead: "External, Morgan Blake", stage: "Fieldwork" });
    expect((await audits(kim.cookie)).audits).toEqual([]); // another firm sees nothing
    expect((await call("POST", `ws/audits/${id}/information-requests`, { item: "Access review export" }, kim.cookie)).status).toBe(404);
    // the auditor raises a request and drafts a finding; management cannot draft
    expect((await call("POST", `ws/audits/${id}/findings`, { title: "No access reviews in Q3", sev: "High" }, jordan.cookie)).status).toBe(403);
    await call("POST", `ws/audits/${id}/information-requests`, { item: "Access review export" }, mo.cookie);
    await call("POST", `ws/audits/${id}/findings`, { title: "No access reviews in Q3", sev: "High", rec: "Run quarterly reviews" }, mo.cookie);
    await call("POST", `ws/audits/${id}/findings`, { title: "Minor wording in the ISMS scope", sev: "Low" }, mo.cookie);
    const a1 = await audit(jordan.cookie, id);
    expect((await call("POST", `ws/audits/${id}/auditor-access/end`, {}, jordan.cookie)).status).toBe(400); // drafts waiting
    // management answers, accepts one finding into a real issue, declines the other
    await call("POST", `ws/audits/${id}/information-requests/${a1.irs[0].id}/respond`, { response: "Attached to PBC-1" }, casey.cookie);
    const iss = body<{ issue: string }>(await call("POST", `ws/audits/${id}/findings/${a1.findings[0].id}/issue`, {}, casey.cookie)).issue;
    const issues = body<{ issues: { id: string; dueDate: string; source: string; due: string }[] }>(await call("GET", "ws/data/issues", {}, casey.cookie)).issues;
    expect(issues.find((i) => i.id === iss)).toMatchObject({ source: `${id}/${a1.findings[0].id}`, due: "Due 14d" });
    expect(log("issue.created")).toHaveLength(1);
    expect((await call("POST", `ws/issues/${iss}/delete`, {}, owen.cookie)).status).toBe(403); // an audit finding references it (and it is open High)
    expect((await call("POST", `ws/audits/${id}/findings/${a1.findings[1].id}/reject`, { reason: "short" }, casey.cookie)).status).toBe(400);
    await call("POST", `ws/audits/${id}/findings/${a1.findings[1].id}/reject`, { reason: "Wording is outside the audit scope" }, casey.cookie);
    // the answered request does not block; an open finding needs a reason
    await call("POST", `ws/audits/${id}/pbc`, { item: "Access review export", ownerId: ana.id }, jordan.cookie);
    expect(store.notices.some((n) => n.userId === ana.id && /audit evidence/.test(n.text))).toBe(true);
    expect((await call("POST", `ws/audits/${id}/advance`, {}, jordan.cookie)).status).toBe(200); // Fieldwork → Reporting
    expect((await call("POST", `ws/audits/${id}/advance`, {}, jordan.cookie)).body).toEqual({ error: "Use “Complete & end auditor access” so the external auditor is revoked and the reason is recorded." });
    expect((await call("POST", `ws/audits/${id}/auditor-access/end`, {}, jordan.cookie)).status).toBe(400); // reason needed
    expect((await call("POST", `ws/audits/${id}/auditor-access/end`, { reason: "Remaining finding tracked as an issue" }, jordan.cookie)).status).toBe(200);
    const done = await audit(jordan.cookie, id);
    expect(done).toMatchObject({ stage: "Complete", auditorAccess: "ended" }); expect(done.irs[0].status).toBe("Closed");
    expect((await audits(mo.cookie)).audits).toEqual([]); // access ended
    expect((await call("POST", `ws/audits/${id}/pbc`, { item: "More" }, jordan.cookie)).body).toEqual({ error: "This engagement is complete and locked." });
    expect((await call("POST", `ws/audits/${id}/auditor-access`, { auditorId: mo.id, until: day(10) }, jordan.cookie)).status).toBe(400); // not on a completed engagement
    for (const a of ["audit.created", "audit.auditor.access.granted", "audit.ir.raised", "audit.finding.drafted", "audit.ir.answered", "audit.finding.promoted", "audit.finding.rejected", "audit.pbc.added", "audit.stage.advanced", "audit.auditor.access.ended"]) expect(log(a).length, a).toBeGreaterThan(0);
  });

  it("advancing to Complete without an auditor applies the same reason rule; access ends by itself; snapshots are shared while access runs", async () => {
    const { jordan, mo } = await team();
    const { id } = body<{ id: string }>(await call("POST", "ws/audits", { name: "Internal GDPR review" }, jordan.cookie));
    await call("POST", `ws/audits/${id}/pbc`, { item: "RoPA" }, jordan.cookie);
    for (let i = 0; i < 2; i++) await call("POST", `ws/audits/${id}/advance`, {}, jordan.cookie);
    expect((await call("POST", `ws/audits/${id}/advance`, {}, jordan.cookie)).status).toBe(400); // outstanding PBC needs a reason
    expect((await call("POST", `ws/audits/${id}/advance`, { reason: "RoPA follows in the next cycle" }, jordan.cookie)).status).toBe(200);
    const { id: id2 } = body<{ id: string }>(await call("POST", "ws/audits", { name: "SOC 2 Type II" }, jordan.cookie));
    await call("POST", `ws/audits/${id2}/auditor-access`, { auditorId: mo.id, until: day(3) }, jordan.cookie);
    await call("POST", "ws/risks", { title: "Shared risk", ownerId: jordan.id }, jordan.cookie);
    const snap = body<{ hash: string }>(await call("POST", "ws/risks/snapshots", { scope: "all" }, jordan.cookie));
    expect(body<{ snapshots: { shared: boolean }[] }>(await call("GET", "ws/data/risk", {}, jordan.cookie)).snapshots[0].shared).toBe(true);
    const a = await audit(mo.cookie, id2); expect(a.snapshots).toHaveLength(1);
    const content = body<{ sha256: string; content: { title: string }[] }>(await call("GET", `ws/audits/${id2}/snapshots/${a.snapshots[0].id}`, {}, mo.cookie));
    expect(content.sha256.startsWith(snap.hash)).toBe(true); expect(content.content[0].title).toBe("Shared risk");
    clock += 5 * 86400_000; const j2 = await signIn("jordan@acme.example"); const m2 = await signIn("morgan@auditfirm.example");
    expect((await audit(j2, id2)).auditorAccess).toBe("ended");
    expect(log("audit.auditor.access.expired")[0].actor).toBe("System");
    expect((await audits(m2)).audits).toEqual([]);
  });
});

describe("company audit log", () => {
  it("company admins read, verify and export their own log; exports are recorded and limited", async () => {
    const { jordan, owen, mo } = await team();
    await call("POST", "ws/audits", { name: "Log me" }, jordan.cookie);
    expect((await call("GET", "ws/data/auditlog", {}, owen.cookie)).status).toBe(403); // owners cannot open it (role table)
    expect((await call("GET", "ws/data/auditlog", {}, mo.cookie)).status).toBe(403);
    const d1 = body<{ entries: { action: string; cat: string }[]; firstBad: number | null }>(await call("GET", "ws/data/auditlog", {}, jordan.cookie));
    expect(d1.entries[0]).toMatchObject({ action: "audit.created", cat: "Audit" }); expect(d1.firstBad).toBeNull();
    expect(d1.entries.every((e) => !/other\.example/.test(JSON.stringify(e)))).toBe(true);
    expect(body<{ intact: boolean }>(await call("POST", "ws/auditlog/verify", {}, jordan.cookie)).intact).toBe(true);
    const f = body<{ fileName: string; content: string }>(await call("POST", "ws/auditlog/exports", { format: "csv" }, jordan.cookie));
    expect(f.fileName).toBe("workspace-audit-log.csv"); expect(f.content).toMatch(/audit\.created/);
    const p = body<{ content: string }>(await call("POST", "ws/auditlog/packages", {}, jordan.cookie));
    expect(JSON.parse(p.content).manifest.sha256).toMatch(/^[0-9a-f]{64}$/);
    for (let i = 0; i < 8; i++) await call("POST", "ws/auditlog/exports", { format: "json" }, jordan.cookie);
    expect((await call("POST", "ws/auditlog/exports", { format: "json" }, jordan.cookie)).body).toEqual({ error: "At most 10 exports an hour. Try again later." });
    for (const a of ["auditlog.chain.verified", "auditlog.exported", "evidence.package.generated"]) expect(log(a).length, a).toBeGreaterThan(0);
    const other = await member("zed@other.example", "admin", "Zed Other", OTHER);
    expect(body<{ entries: { action: string }[] }>(await call("GET", "ws/data/auditlog", {}, other.cookie)).entries.some((e) => e.action === "audit.created")).toBe(false);
    expect((await call("POST", "ws/exports", { action: "ropa.exported", target: "csv" }, jordan.cookie)).status).toBe(204);
  });
});
