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

/* Production programme, group 3 (Risk, Issues, My Work, Overview, Reports) through `handle`, as /api runs it, against the in-memory stand-ins.
   Checked against the inventory in docs/architecture/inventory/group3-risk-issues-work-overview-reports.md. Synthetic people only. */
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
  const aud = await member("aud@acme.example", "auditor", "Remy Auditor");
  return { jordan, casey, owen, ana, priya, aud };
}
type Risk = { id: string; title: string; status: string; review: string; acceptance?: { by: string; board?: { ref: string } }; pendingAcceptance?: { approvalId: string }; invalidatedAcceptance?: unknown; history: { a: string }[]; owner: string; linked: string[]; actions: { done: boolean; cancelled?: boolean }[] };
const risks = async (cookie: string) => body<{ risks: Risk[]; parties: { id: string; links: string[] }[]; snapshots: { id: string; hash: string }[]; approvals: { id: string; kind: string; status: string }[] }>(await call("GET", "ws/data/risk", {}, cookie));
const riskOf = async (cookie: string, id: string) => (await risks(cookie)).risks.find((r) => r.id === id)!;
async function control(cookie: string) { return body<{ id: string }>(await call("POST", "ws/controls", { title: "Backups are encrypted", domain: "Operations" }, cookie)).id; }


describe("risk register", () => {
  it("creates a draft owned by a member; editors only; review workflow with states and segregation of duties", async () => {
    const { jordan, casey, ana, priya, owen } = await team();
    expect((await call("POST", "ws/risks", { title: "Ransomware on file shares" }, priya.cookie)).status).toBe(403);
    expect((await call("POST", "ws/risks", { title: "" }, ana.cookie)).body).toEqual({ error: "Risk title is required." });
    const r = await call("POST", "ws/risks", { title: "Ransomware on file shares", cat: "Technology", ownerId: owen.id, l: 4, i: 5, rl: 2, ri: 3, treat: "Mitigate" }, ana.cookie);
    expect(r.body).toEqual({ ok: true, id: "RK-01" });
    expect(store.notices.some((n) => n.userId === owen.id && /owner of risk RK-01/.test(n.text))).toBe(true);
    const x = await riskOf(ana.cookie, "RK-01");
    expect(x).toMatchObject({ status: "Open", review: "Draft", owner: "Owen Hart", cl: 3, ci: 4, team: "Engineering" });
    // submit needs a mapped control
    expect((await call("POST", "ws/risks/RK-01/submit", {}, ana.cookie)).body).toEqual({ error: "Map at least one control before submitting" });
    const cid = await control(jordan.cookie);
    expect((await call("POST", "ws/risks/RK-01/controls", { controlId: "NOPE-1" }, ana.cookie)).body).toEqual({ error: "Control not found" });
    expect((await call("POST", "ws/risks/RK-01/controls", { controlId: cid }, ana.cookie)).status).toBe(200);
    expect((await call("POST", "ws/risks/RK-01/controls", { controlId: cid }, ana.cookie)).body).toEqual({ error: "Control already mapped" });
    expect((await call("POST", "ws/risks/RK-01/approve", {}, jordan.cookie)).body).toEqual({ error: "Only a risk awaiting approval can be decided." });
    expect((await call("POST", "ws/risks/RK-01/submit", {}, ana.cookie)).status).toBe(200);
    expect((await call("POST", "ws/risks/RK-01/submit", {}, ana.cookie)).body).toEqual({ error: "The risk is already awaiting approval." });
    expect((await riskOf(ana.cookie, "RK-01")).status).toBe("In review");
    expect((await call("POST", "ws/risks/RK-01/approve", {}, owen.cookie)).body).toEqual({ error: "Not permitted: approving risks requires admin." });
    // an admin who edited it cannot approve
    expect((await call("POST", "ws/risks/RK-01/score", { field: "cl", value: 3 }, jordan.cookie)).status).toBe(200);
    expect((await call("POST", "ws/risks/RK-01/approve", {}, jordan.cookie)).body).toEqual({ error: "Segregation of duties: you edited or submitted this risk, so a different person must approve it." });
    expect((await call("POST", "ws/risks/RK-01/request-changes", { note: "" }, casey.cookie)).status).toBe(400);
    expect((await call("POST", "ws/risks/RK-01/request-changes", { note: "Residual looks optimistic" }, casey.cookie)).status).toBe(200);
    expect(await riskOf(ana.cookie, "RK-01")).toMatchObject({ review: "Changes requested", status: "Open" });
    expect(store.notices.some((n) => n.userId === ana.id && /asked for changes/.test(n.text))).toBe(true);
    expect((await call("POST", "ws/risks/RK-01/submit", {}, ana.cookie)).status).toBe(200);
    expect((await call("POST", "ws/risks/RK-01/approve", {}, casey.cookie)).status).toBe(200);
    expect(await riskOf(ana.cookie, "RK-01")).toMatchObject({ review: "Approved", status: "Open" });
    for (const a of ["risk.created", "risk.control.mapped", "risk.submitted", "risk.scored", "risk.changes_requested", "risk.approved"]) expect(log(a).length, a).toBeGreaterThan(0);
    // other companies and roles without the module see nothing
    const other = await member("zed@other.example", "admin", "Zed Other", OTHER);
    expect((await risks(other.cookie)).risks).toEqual([]);
    expect((await call("GET", "ws/data/risk", {}, priya.cookie)).status).toBe(403);
  });

  it("treatment actions, closing rules and reopening", async () => {
    const { jordan, casey, ana, owen } = await team();
    await call("POST", "ws/risks", { title: "Weak vendor offboarding", ownerId: owen.id }, ana.cookie);
    expect((await call("POST", "ws/risks/RK-01/actions", { text: "Revoke vendor accounts", ownerId: casey.id, due: day(10) }, ana.cookie)).status).toBe(200);
    expect(store.notices.some((n) => n.userId === casey.id && /treatment action on risk RK-01/.test(n.text))).toBe(true);
    expect((await call("POST", "ws/risks/RK-01/close", {}, jordan.cookie)).body).toEqual({ error: "Close or cancel the open actions first." });
    expect((await call("POST", "ws/risks/RK-01/actions/0/cancel", { reason: "short" }, ana.cookie)).status).toBe(400);
    expect((await call("POST", "ws/risks/RK-01/actions/0/toggle", {}, ana.cookie)).body).toEqual({ ok: true, done: true, text: "Revoke vendor accounts" });
    expect((await call("POST", "ws/risks/RK-01/actions/0/cancel", { reason: "No longer needed at all" }, ana.cookie)).body).toEqual({ error: "This action is already done or cancelled." });
    expect((await call("POST", "ws/risks/RK-01/actions/5/toggle", {}, ana.cookie)).status).toBe(404);
    expect((await call("POST", "ws/risks/RK-01/close", {}, ana.cookie)).body).toEqual({ error: "Not permitted: closing a risk requires admin or owner." }); // SOD_MATRIX: owner/admin
    await call("POST", "ws/risks/RK-01/score", { field: "l", value: 3 }, casey.cookie);
    expect((await call("POST", "ws/risks/RK-01/close", {}, casey.cookie)).body).toEqual({ error: "Segregation of duties: you last edited this risk, so a different person must close it." });
    expect((await call("POST", "ws/risks/RK-01/close", {}, owen.cookie)).body).toEqual({ error: "Segregation of duties: you own this risk, so a different person must close it." });
    expect((await call("POST", "ws/risks/RK-01/close", { reason: "Vendor removed" }, jordan.cookie)).status).toBe(200);
    expect((await call("POST", "ws/risks/RK-01/close", {}, casey.cookie)).body).toEqual({ error: "This risk is already closed." });
    expect((await call("POST", "ws/risks/RK-01/reopen", {}, casey.cookie)).body).toEqual({ error: "Only an accepted risk can be reopened." });
    expect(log("risk.closed")[0].target).toBe("RK-01 — Vendor removed");
  });

  it("ladder acceptance below 15: authority rank, segregation, expiry, invalidation on re-scoring, and the expiry job", async () => {
    const { jordan, casey, ana, owen } = await team();
    await call("POST", "ws/risks", { title: "Shadow IT tools", ownerId: owen.id, l: 3, i: 3, rl: 2, ri: 3 }, ana.cookie); // residual 6 Medium
    expect((await call("POST", "ws/risks/RK-01/accept", { by: "Department head", why: "Within appetite" }, ana.cookie)).body).toEqual({ error: "Segregation of duties: you own, edited or submitted this risk, so a different person must record its acceptance." });
    expect((await call("POST", "ws/risks/RK-01/accept", { by: "Risk owner", why: "Within appetite" }, jordan.cookie)).body).toEqual({ error: "Residual rating needs at least Department head to accept." });
    expect((await call("POST", "ws/risks/RK-01/accept", { by: "Board / CEO", why: "Within appetite" }, jordan.cookie)).status).toBe(400);
    expect((await call("POST", "ws/risks/RK-01/accept", { by: "CISO", why: "Within appetite", until: day(400) }, jordan.cookie)).status).toBe(400);
    expect((await call("POST", "ws/risks/RK-01/accept", { by: "CISO", why: "Within appetite", until: day(30) }, jordan.cookie)).status).toBe(200);
    expect(await riskOf(ana.cookie, "RK-01")).toMatchObject({ status: "Accepted", treat: "Accept", acceptance: { by: "CISO" } });
    expect((await call("POST", "ws/risks/RK-01/close", {}, casey.cookie)).body).toEqual({ error: "Reopen the accepted risk before closing it." });
    // residual moves into High: the acceptance no longer holds
    // 2x5 = 10 is still Medium: the acceptance holds; 3x5 = 15 is High: it no longer does
    expect(body<{ invalidated: string }>(await call("POST", "ws/risks/RK-01/score", { field: "ri", value: 5 }, casey.cookie)).invalidated).toBe("");
    expect(body<{ invalidated: string }>(await call("POST", "ws/risks/RK-01/score", { field: "rl", value: 3 }, casey.cookie)).invalidated).toBe("residual rose to High (15), above the accepted band");
    expect(await riskOf(ana.cookie, "RK-01")).toMatchObject({ status: "Open", treat: "Mitigate" });
    expect(log("risk.acceptance.invalidated").length).toBe(1);
    // accept again, then let it run out: recorded once by the system, owner told
    await call("POST", "ws/risks/RK-01/score", { field: "rl", value: 1 }, casey.cookie);
    expect((await call("POST", "ws/risks/RK-01/accept", { by: "CISO", why: "Within appetite", until: day(2) }, jordan.cookie)).status).toBe(200);
    clock += 4 * 86400_000;
    ana.cookie = await signIn("ana@acme.example"); owen.cookie = await signIn("owen@acme.example"); casey.cookie = await signIn("casey@acme.example");
    await risks(ana.cookie); await risks(ana.cookie);
    expect(log("risk.acceptance.expired").length).toBe(1); expect(log("risk.acceptance.expired")[0].actor).toBe("System");
    expect(store.notices.some((n) => n.userId === owen.id && /acceptance of risk RK-01/.test(n.text))).toBe(true);
    const w = body<{ reviews: { t: string }[] }>(await call("GET", "ws/data/work", {}, owen.cookie));
    expect(w.reviews.some((x) => /acceptance expired/.test(x.t))).toBe(true);
    expect((await call("POST", "ws/risks/RK-01/reopen", { reason: "Expired, re-assess" }, casey.cookie)).status).toBe(200);
    expect((await riskOf(ana.cookie, "RK-01")).invalidatedAcceptance).toBeTruthy();
  });

  it("Board acceptance above 15: admin records evidence, a second admin or owner verifies; residual changes cancel it", async () => {
    const { jordan, casey, ana, owen } = await team(); const lee = await member("lee@acme.example", "analyst", "Lee Park");
    await call("POST", "ws/risks", { title: "Core banking outage", ownerId: owen.id, l: 5, i: 5, rl: 4, ri: 4 }, ana.cookie); // residual 16
    const board = { ref: "brd-2026-04", date: day(-5), body: "Board of Directors", minutes: "Minutes item 5" };
    expect((await call("POST", "ws/risks/RK-01/accept", { why: "Board accepted the exposure for this year", until: day(90), board }, lee.cookie)).body).toEqual({ error: "Only a company admin can record Board-approved acceptance." });
    expect((await call("POST", "ws/risks/RK-01/accept", { why: "too short", until: day(90), board }, jordan.cookie)).status).toBe(400);
    expect((await call("POST", "ws/risks/RK-01/accept", { why: "Board accepted the exposure for this year", until: day(90), board: { ...board, date: day(-100) } }, jordan.cookie)).status).toBe(400);
    expect((await call("POST", "ws/risks/RK-01/accept", { why: "Board accepted the exposure for this year", until: day(90), board }, jordan.cookie)).body).toMatchObject({ ok: true, pending: true });
    const ap = (await risks(ana.cookie)).approvals.find((a) => a.kind === "risk.board-evidence")!;
    expect((await call("POST", "ws/risks/RK-01/board-evidence/decision", { decision: "approve", reason: "Minutes checked" }, jordan.cookie)).body).toEqual({ error: "Segregation of duties: you recorded, own or last edited this risk, so you cannot verify its Board evidence." });
    expect((await call("POST", "ws/risks/RK-01/board-evidence/decision", { decision: "approve", reason: "Minutes checked" }, owen.cookie)).status).toBe(403); // the owner
    expect((await call("POST", "ws/risks/RK-01/board-evidence/decision", { decision: "approve", reason: "short" }, casey.cookie)).status).toBe(400);
    expect((await call("POST", "ws/risks/RK-01/board-evidence/decision", { decision: "approve", reason: "Minutes and register checked" }, casey.cookie)).status).toBe(200);
    const x = await riskOf(ana.cookie, "RK-01");
    expect(x).toMatchObject({ status: "Accepted", acceptance: { by: "Board / CEO", board: { ref: "BRD-2026-04" } } });
    expect((await risks(ana.cookie)).approvals.find((a) => a.id === ap.id)!.status).toBe("Approved");
    // a second recording on another risk is cancelled when its residual changes before verification
    await call("POST", "ws/risks", { title: "Data centre flood", ownerId: owen.id, l: 5, i: 5, rl: 4, ri: 5 }, ana.cookie);
    await call("POST", "ws/risks/RK-02/accept", { why: "Board accepted the exposure for this year", until: day(90), board }, jordan.cookie);
    await call("POST", "ws/risks/RK-02/score", { field: "ri", value: 4 }, ana.cookie);
    const y = await riskOf(ana.cookie, "RK-02");
    expect(y.pendingAcceptance).toBeUndefined(); expect(log("risk.acceptance.pending_cancelled").length).toBe(1);
    expect((await risks(ana.cookie)).approvals.filter((a) => a.kind === "risk.board-evidence" && a.status === "Withdrawn").length).toBe(1);
    // the recorder withdraws; nobody else can
    await call("POST", "ws/risks/RK-02/accept", { why: "Board accepted the exposure for this year", until: day(90), board }, jordan.cookie);
    expect((await call("POST", "ws/risks/RK-02/board-evidence/withdraw", {}, casey.cookie)).status).toBe(403);
    expect((await call("POST", "ws/risks/RK-02/board-evidence/withdraw", {}, jordan.cookie)).status).toBe(200);
    // expiry after 72 hours is recorded by the system
    await call("POST", "ws/risks/RK-02/accept", { why: "Board accepted the exposure for this year", until: day(90), board }, jordan.cookie);
    clock += 73 * 3600_000; ana.cookie = await signIn("ana@acme.example"); await risks(ana.cookie);
    expect((await riskOf(ana.cookie, "RK-02")).pendingAcceptance).toBeUndefined();
    expect(log("risk.board-evidence.expired")[0].actor).toBe("System");
  });

  it("interested parties and snapshots", async () => {
    const { jordan, ana, owen } = await team();
    await call("POST", "ws/risks", { title: "Regulatory fine", ownerId: owen.id }, ana.cookie);
    const p = body<{ id: string }>(await call("POST", "ws/risk-parties", { party: "Regulators", req: "Timely reporting" }, ana.cookie));
    expect((await call("POST", "ws/risk-parties", { party: "regulators" }, ana.cookie)).body).toEqual({ error: "That interested party is already listed." });
    expect((await call("POST", `ws/risk-parties/${p.id}/links`, { riskId: "RK-99" }, ana.cookie)).status).toBe(404);
    expect((await call("POST", `ws/risk-parties/${p.id}/links`, { riskId: "RK-01" }, ana.cookie)).status).toBe(200);
    expect((await risks(ana.cookie)).parties[0].links).toEqual(["RK-01"]);
    expect((await call("POST", `ws/risk-parties/${p.id}/links/RK-01/delete`, {}, ana.cookie)).status).toBe(200);
    expect((await call("POST", "ws/risks/snapshots", { scope: "all" }, ana.cookie)).status).toBe(403);
    const s = body<{ hash: string; count: number }>(await call("POST", "ws/risks/snapshots", { scope: "all" }, jordan.cookie));
    expect(s.count).toBe(1); expect(s.hash).toMatch(/^[0-9a-f]{12}$/);
    const list = await risks(jordan.cookie); expect(list.snapshots[0]).not.toHaveProperty("content");
    const full = body<{ sha256: string; content: { id: string }[] }>(await call("GET", `ws/risks/snapshots/${list.snapshots[0].id}`, {}, jordan.cookie));
    expect(full.content[0].id).toBe("RK-01"); expect(full.sha256.startsWith(s.hash)).toBe(true);
    expect((await call("POST", "ws/exports", { action: "risk.register.exported" }, ana.cookie)).status).toBe(204);
    expect(log("risk.register.exported")[0].target).toBe("1 risks");
  });

  it("import: new rows apply at once; updates wait for a different admin; rows are checked again; never sets a status", async () => {
    const { jordan, casey, ana, owen } = await team();
    const rows = [{ id: "RK-07", title: "=cmd|calc", cat: "people", owner: "Owen Hart", l: 9, i: 0, rl: 2, ri: 2, treat: "Avoid", status: "Closed", due: day(20), controls: "MFA" }, { title: "" }, { id: "bad id!", title: "Phishing" }];
    const r1 = body<{ nNew: number; nUpd: number }>(await call("POST", "ws/risks/import", { fileName: "reg.csv", rows }, ana.cookie));
    expect(r1).toEqual({ nNew: 2, nUpd: 0 });
    const list = (await risks(ana.cookie)).risks;
    expect(list.map((x) => x.id).sort()).toEqual(["RK-01", "RK-07"]);
    expect(list.find((x) => x.id === "RK-07")).toMatchObject({ title: "'=cmd|calc", cat: "People", owner: "Owen Hart", l: 5, i: 1, status: "Open", review: "Draft", imported: true });
    // an update is staged
    const r2 = body<{ staged: boolean; approvalId: string }>(await call("POST", "ws/risks/import", { fileName: "reg2.csv", rows: [{ id: "RK-07", title: "Phishing of staff", l: 3, i: 3, rl: 1, ri: 1, status: "Closed" }] }, ana.cookie));
    expect(r2.staged).toBe(true);
    expect((await riskOf(ana.cookie, "RK-07")).title).toBe("'=cmd|calc");
    expect((await call("POST", `ws/risk-imports/${r2.approvalId}/approve`, { reason: "Checked the file" }, owen.cookie)).status).toBe(403); // admin only
    expect((await call("POST", `ws/risk-imports/${r2.approvalId}/approve`, { reason: "short" }, jordan.cookie)).status).toBe(400);
    expect(body<{ nUpd: number }>(await call("POST", `ws/risk-imports/${r2.approvalId}/approve`, { reason: "Checked the file" }, jordan.cookie)).nUpd).toBe(1);
    const x = await riskOf(ana.cookie, "RK-07");
    expect(x).toMatchObject({ title: "Phishing of staff", status: "Open" }); expect(x.history.some((h) => /status kept/.test(h.a))).toBe(true);
    expect((await call("POST", `ws/risk-imports/${r2.approvalId}/approve`, { reason: "Checked the file" }, casey.cookie)).body).toEqual({ error: "Request is approved." }); // applied once
    // the importer withdraws a staged import; an admin who imported cannot approve their own
    const r3 = body<{ approvalId: string }>(await call("POST", "ws/risks/import", { fileName: "reg3.csv", rows: [{ id: "RK-07", title: "x" }] }, jordan.cookie));
    expect((await call("POST", `ws/risk-imports/${r3.approvalId}/approve`, { reason: "Checked the file" }, jordan.cookie)).status).toBe(403);
    expect((await call("POST", `ws/risk-imports/${r3.approvalId}/withdraw`, {}, casey.cookie)).status).toBe(403);
    expect((await call("POST", `ws/risk-imports/${r3.approvalId}/withdraw`, {}, jordan.cookie)).status).toBe(200);
    expect(log("risk.import.withdrawn").length).toBe(1);
    expect((await call("POST", "ws/risks/import", { fileName: "x", rows: Array.from({ length: 5001 }, () => ({ title: "x" })) }, ana.cookie)).status).toBe(400);
  });
});

describe("issues", () => {
  it("create, edit core fields (admin/owner only), status moves, closure verification by a different person, tasks, links, delete", async () => {
    const { jordan, casey, owen, ana, priya } = await team();
    expect((await call("POST", "ws/issues", { title: "x" }, priya.cookie)).status).toBe(403);
    expect((await call("POST", "ws/issues", { title: "Encrypt backups", sev: "High", ownerId: owen.id, due: "soon" }, ana.cookie)).status).toBe(400);
    const id = body<{ id: string }>(await call("POST", "ws/issues", { title: "Encrypt backups", sev: "High", ownerId: owen.id, due: day(-3) }, ana.cookie)).id;
    expect(id).toBe("R-61");
    const iss = async () => body<{ issues: { id: string; due: string; status: string; owner: string; sev: string; tasks: { done: boolean }[]; linkedControls: string[] }[] }>(await call("GET", "ws/data/issues", {}, ana.cookie)).issues.find((x) => x.id === id)!;
    expect((await iss()).due).toBe("Overdue 3d");
    expect(store.notices.some((n) => n.userId === owen.id && /assigned you issue R-61/.test(n.text))).toBe(true);
    expect((await call("POST", `ws/issues/${id}`, { title: "Encrypt backups", sev: "Low", ownerId: owen.id, due: day(-3) }, ana.cookie)).status).toBe(403);
    expect((await call("POST", `ws/issues/${id}`, { title: "Encrypt all backups", sev: "High", ownerId: casey.id, due: day(5) }, jordan.cookie)).status).toBe(200);
    expect(await iss()).toMatchObject({ owner: "Casey Morgan", due: "Due 5d" });
    expect((await call("POST", `ws/issues/${id}/status`, { status: "Closed" }, ana.cookie)).body).toEqual({ error: "High/Critical issues are closed only after a different person verifies the fix." });
    expect((await call("POST", `ws/issues/${id}/status`, { status: "In progress" }, ana.cookie)).status).toBe(200);
    expect((await call("POST", `ws/issues/${id}/closure`, { note: "short" }, ana.cookie)).status).toBe(400);
    expect((await call("POST", `ws/issues/${id}/closure`, { note: "Backups now use KMS keys" }, ana.cookie)).status).toBe(200);
    expect((await call("POST", `ws/issues/${id}`, { title: "Encrypt all backups", sev: "Low", ownerId: casey.id, due: day(5) }, jordan.cookie)).body).toEqual({ error: "Withdraw the pending closure before changing owner, due date or severity." });
    expect((await call("POST", `ws/issues/${id}/closure/decision`, { decision: "verify", note: "Checked KMS settings" }, ana.cookie)).status).toBe(403); // the proposer
    expect((await call("POST", `ws/issues/${id}/closure/decision`, { decision: "verify", note: "Checked KMS settings" }, casey.cookie)).status).toBe(403); // the owner
    expect((await call("POST", `ws/issues/${id}/closure/decision`, { decision: "verify", note: "Checked KMS settings" }, owen.cookie)).status).toBe(200);
    expect((await iss()).status).toBe("Closed");
    expect(log("issue.closed.verified")[0].target).toMatch(/proposed by Ana Silva, verified by Owen Hart/);
    expect((await call("POST", `ws/issues/${id}/status`, { status: "Open" }, ana.cookie)).body).toEqual({ error: "Not permitted: reopening an issue requires admin or owner." });
    // tasks, root cause and links are all recorded
    expect((await call("POST", `ws/issues/${id}/tasks`, { text: "Rotate keys" }, ana.cookie)).status).toBe(200);
    expect((await call("POST", `ws/issues/${id}/tasks/0/toggle`, {}, ana.cookie)).status).toBe(200);
    expect((await call("POST", `ws/issues/${id}/rca`, { rootCause: "No policy", corrective: "Policy added" }, ana.cookie)).status).toBe(200);
    expect((await call("POST", `ws/issues/${id}/links`, { kind: "control", value: "NOPE" }, ana.cookie)).status).toBe(404);
    const cid = await control(jordan.cookie);
    expect((await call("POST", `ws/issues/${id}/links`, { kind: "control", value: cid }, ana.cookie)).status).toBe(200);
    for (const a of ["issue.task.added", "issue.task.done", "issue.rca.saved", "issue.linked"]) expect(log(a).length, a).toBe(1);
    // delete: an analyst cannot; a High issue that is open cannot be deleted; a closed one can by an admin
    expect((await call("POST", `ws/issues/${id}/delete`, {}, ana.cookie)).status).toBe(403);
    expect((await call("POST", `ws/issues/${id}/delete`, {}, jordan.cookie)).status).toBe(200);
    expect(body<{ issues: unknown[] }>(await call("GET", "ws/data/issues", {}, ana.cookie)).issues).toEqual([]);
    // Medium closes directly; the closer being the creator is noted
    const m = body<{ id: string }>(await call("POST", "ws/issues", { title: "Tidy firewall rules", sev: "Medium", ownerId: ana.id }, ana.cookie)).id;
    expect((await call("POST", `ws/issues/${m}/status`, { status: "Closed" }, ana.cookie)).status).toBe(200);
    expect(log("issue.status.changed").at(-1)!.target).toMatch(/closer is the creator/);
  });
});

describe("review findings (group 3 cross-check)", () => {
  it("closes the gaps: severity cannot drop to bypass verification, acceptance needs the role's rank, no close or accept while submitted, owners are working roles, reassignment notifies", async () => {
    const { jordan, casey, owen, ana, priya } = await team();
    const vendor = await member("vee@acme.example", "vendor", "Vee Vendor");
    expect((await call("POST", "ws/issues", { title: "x", ownerId: vendor.id }, ana.cookie)).body).toEqual({ error: "Choose a member whose role can work on this." });
    expect((await call("POST", "ws/risks", { title: "x", ownerId: vendor.id }, ana.cookie)).status).toBe(400);
    const id = body<{ id: string }>(await call("POST", "ws/issues", { title: "Open admin port", sev: "High", ownerId: ana.id }, jordan.cookie)).id;
    expect((await call("POST", `ws/issues/${id}`, { title: "Open admin port", sev: "Low", ownerId: ana.id }, jordan.cookie)).body).toEqual({ error: "An open High or Critical issue keeps its severity until a different person verifies the fix." });
    expect((await call("POST", `ws/issues/${id}`, { title: "Open admin port", sev: "Critical", ownerId: priya.id }, jordan.cookie)).status).toBe(200);
    expect(store.notices.some((n) => n.userId === priya.id && /assigned you issue/.test(n.text))).toBe(true);
    // residual 12 (High): an analyst may not record its acceptance; an owner may
    await call("POST", "ws/risks", { title: "Legacy VPN", ownerId: jordan.id, l: 4, i: 4, rl: 3, ri: 4 }, casey.cookie);
    const lee = await member("lee@acme.example", "analyst", "Lee Park");
    expect((await call("POST", "ws/risks/RK-01/accept", { by: "CISO", why: "Accepted until replacement" }, lee.cookie)).body).toEqual({ error: "Not permitted: a High residual is accepted by an owner or admin." });
    const cid = body<{ id: string }>(await call("POST", "ws/controls", { title: "VPN MFA" }, jordan.cookie)).id;
    await call("POST", "ws/risks/RK-01/controls", { controlId: cid }, ana.cookie); await call("POST", "ws/risks/RK-01/submit", {}, ana.cookie);
    expect((await call("POST", "ws/risks/RK-01/accept", { by: "CISO", why: "Accepted until replacement" }, owen.cookie)).body).toEqual({ error: "The risk is awaiting approval. Decide the review first." });
    expect((await call("POST", "ws/risks/RK-01/close", {}, owen.cookie)).body).toEqual({ error: "The risk is awaiting approval. Decide the review first." });
    await call("POST", "ws/risks/RK-01/approve", {}, jordan.cookie);
    expect((await call("POST", "ws/risks/RK-01/accept", { by: "CISO", why: "Accepted until replacement" }, owen.cookie)).status).toBe(200);
  });
});

describe("reports", () => {
  it("generates real packs, schedules internal recipients at once and external ones after a different admin", async () => {
    const { jordan, casey, owen, ana } = await team();
    expect((await call("GET", "ws/data/reports", {}, ana.cookie)).status).toBe(403);
    await call("POST", "ws/risks", { title: "Data leak, via export", ownerId: owen.id, l: 5, i: 5 }, jordan.cookie);
    const g = body<{ fileName: string; content: string }>(await call("POST", "ws/reports/generate", { name: "Risk register export" }, owen.cookie));
    expect(g.fileName).toBe("risk-register-export.csv"); expect(g.content).toMatch(/RK-01,"Data leak, via export"/);
    const e = body<{ content: string }>(await call("POST", "ws/reports/generate", { name: "Executive security posture" }, owen.cookie));
    expect(e.content).toMatch(/1 open, 1 above appetite/);
    expect((await call("POST", "ws/reports/generate", { name: "Something else" }, owen.cookie)).status).toBe(400);
    expect((await call("POST", "ws/reports/schedules", { name: "Risk register export", freq: "Monthly", detail: "1st", recip: "Board, jordan@acme.example" }, owen.cookie)).body).toMatchObject({ pending: false });
    const ext = body<{ pending: boolean }>(await call("POST", "ws/reports/schedules", { name: "Executive security posture", freq: "Quarterly", recip: "auditor@firm.example, someone@gmail.com" }, owen.cookie));
    expect(ext.pending).toBe(true);
    expect((await call("POST", "ws/reports/schedules", { name: "Executive security posture", freq: "Quarterly", recip: "auditor@firm.example" }, owen.cookie)).body).toEqual({ error: "A schedule for this pack is already awaiting approval." });
    const data = async () => body<{ schedules: { id: string; name: string; external: boolean }[]; approvals: { id: string; status: string }[] }>(await call("GET", "ws/data/reports", {}, jordan.cookie));
    const ap = (await data()).approvals[0];
    expect((await call("POST", `ws/report-approvals/${ap.id}/approve`, { reason: "Auditor engagement signed" }, owen.cookie)).status).toBe(403); // owner, and the requester
    expect((await call("POST", `ws/report-approvals/${ap.id}/approve`, { reason: "Auditor engagement signed" }, jordan.cookie)).body).toEqual({ status: "Approved" });
    const sc = (await data()).schedules;
    expect(sc.map((x) => [x.name, x.external])).toEqual([["Executive security posture", true], ["Risk register export", false]]);
    // replacing or removing the external one needs a reason
    expect((await call("POST", "ws/reports/schedules", { name: "Executive security posture", freq: "Monthly", recip: "Board" }, owen.cookie)).status).toBe(400);
    expect((await call("POST", `ws/reports/schedules/${sc[0].id}/delete`, {}, casey.cookie)).status).toBe(400);
    expect((await call("POST", `ws/reports/schedules/${sc[0].id}/delete`, { reason: "Audit engagement ended" }, casey.cookie)).status).toBe(200);
    for (const a of ["report.generated", "report.scheduled", "report.schedule_requested", "report.distribution.applied", "report.unscheduled"]) expect(log(a).length, a).toBeGreaterThan(0);
  });
});

describe("my work and overview", () => {
  it("lists what is really assigned and waiting; overview gives figures only for modules the role cannot open", async () => {
    const { jordan, casey, owen, ana, priya, aud } = await team();
    await call("POST", "ws/issues", { title: "Patch VPN", sev: "High", ownerId: priya.id, due: day(-1) }, ana.cookie);
    await call("POST", "ws/risks", { title: "VPN exposure", ownerId: owen.id }, ana.cookie);
    await call("POST", "ws/risks/RK-01/actions", { text: "Patch the VPN gateway", ownerId: priya.id, due: day(3) }, ana.cookie);
    const w = body<{ issues: { id: string }[]; actions: { riskId: string }[]; kpis: { assigned: number; overdue: number; dueWeek: number } }>(await call("GET", "ws/data/work", {}, priya.cookie));
    expect(w.issues.map((x) => x.id)).toEqual(["R-61"]); expect(w.actions[0].riskId).toBe("RK-01");
    expect(w.kpis).toMatchObject({ assigned: 2, overdue: 1, dueWeek: 1 });
    // a submitted risk is waiting for an admin who did not edit it
    const cid = await control(jordan.cookie);
    await call("POST", "ws/risks/RK-01/controls", { controlId: cid }, ana.cookie); await call("POST", "ws/risks/RK-01/submit", {}, ana.cookie);
    const wj = body<{ reviews: { t: string; path: string }[] }>(await call("GET", "ws/data/work", {}, casey.cookie));
    expect(wj.reviews.some((r) => /Approve risk RK-01/.test(r.t) && r.path === "/ws/risk")).toBe(true);
    // the employee sees figures, never titles or owners
    const o = body<{ risks: { title: string; owner: string }[]; issues: { title: string; due: string }[]; controls: { title: string }[] }>(await call("GET", "ws/data/overview", {}, priya.cookie));
    expect(o.risks).toHaveLength(1); expect(o.risks[0]).toMatchObject({ title: "", owner: "" });
    expect(o.issues[0]).toMatchObject({ title: "", due: "Overdue 1d" }); expect(o.controls[0].title).toBe("");
    // an external auditor receives no company-wide figures at all (F1-01): their Overview lists their engagements
    expect(body<Record<string, unknown>>(await call("GET", "ws/data/overview", {}, aud.cookie))).toEqual({});
    expect(body<Record<string, unknown>>(await call("GET", "ws/data/overview", {}, jordan.cookie))).toEqual({});
    expect((await call("GET", "ws/data/work", {}, aud.cookie)).status).toBe(403);
    // vendor request from My Work, with limits
    expect((await call("POST", "ws/vendor-requests", { name: "", reason: "x" }, priya.cookie)).status).toBe(400);
    expect((await call("POST", "ws/vendor-requests", { name: "Northstar Analytics", reason: "Marketing attribution", crit: "Critical" }, priya.cookie)).body).toEqual({ id: "VR-01" });
    expect((await call("POST", "ws/vendor-requests", { name: "northstar analytics", reason: "Again" }, ana.cookie)).status).toBe(400);
    expect((await call("POST", "ws/overview/board-pack", {}, aud.cookie)).status).toBe(204);
    expect(log("overview.boardpack.exported")[0].cat).toBe("System");
    // the employee's figures carry no N/A reasons, names or custom requirement text
    await call("POST", "ws/frameworks/iso27001/scope", { on: true }, jordan.cookie);
    const fw = body<{ frameworks: { state: Record<string, { na: Record<string, unknown> }> } }>(await call("GET", "ws/data/overview", {}, priya.cookie)).frameworks;
    expect(JSON.stringify(fw)).not.toMatch(/Jordan|byId/);
    // a treatment action on a risk the employee cannot open shows no risk title
    expect(body<{ actions: { risk: string }[] }>(await call("GET", "ws/data/work", {}, priya.cookie)).actions[0].risk).toBe("");
  });
});
