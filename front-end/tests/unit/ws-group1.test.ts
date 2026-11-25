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

/* Production programme, group 1 (Frameworks, Controls, Evidence) through `handle`, as /api runs it, against the in-memory stand-ins.
   Checked against the inventory in docs/architecture/inventory/group1-frameworks-controls-evidence.md. Synthetic people only. */
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
const log = (action: string) => store.auditLog.filter((x) => x.action === action);
const body = <T,>(r: Res) => r.body as T;

describe("workspace data is the company's own", () => {
  it("modules follow the roles table; another company's records are never visible", async () => {
    const jordan = await member("jordan@acme.example", "admin", "Jordan Avery");
    const priya = await member("priya@acme.example", "employee", "Priya Nair");
    const sam = await member("sam@acme.example", "analyst", "Sam Lee");
    const casey = await member("casey@other.example", "admin", "Casey Morgan", OTHER);
    expect((await call("GET", "ws/data/controls", {}, priya.cookie)).status).toBe(403); // employees have no controls module
    expect((await call("GET", "ws/data/evidence", {}, sam.cookie)).status).toBe(403); // analysts have no evidence module
    expect((await call("GET", "ws/data/frameworks", {}, sam.cookie)).status).toBe(403);
    expect((await call("POST", "ws/controls/adopt", { ids: ["GOV-1", "IAM-1"] }, jordan.cookie)).status).toBe(200);
    expect(body<{ controls: unknown[] }>(await call("GET", "ws/data/controls", {}, casey.cookie)).controls).toEqual([]);
    expect(body<{ controls: { id: string }[] }>(await call("GET", "ws/data/controls", {}, sam.cookie)).controls.map((c) => c.id)).toEqual(["GOV-1", "IAM-1"]);
    expect(body<{ name: string }[]>(await call("GET", "ws/members", {}, priya.cookie)).map((m) => m.name).sort()).toEqual(["Jordan Avery", "Priya Nair", "Sam Lee"]);
  });
});

describe("frameworks", () => {
  it("only admin or owner changes scope, snooze, mappings and applicability; every change is audited", async () => {
    const jordan = await member("jordan@acme.example", "admin", "Jordan Avery");
    const morgan = await member("morgan@acme.example", "auditor", "Morgan Blake");
    await call("POST", "ws/controls/adopt", { ids: ["IAM-1"] }, jordan.cookie);
    expect((await call("POST", "ws/frameworks/iso27001/scope", { on: false }, morgan.cookie)).status).toBe(404); // no engagement of theirs names it yet (F1-01)
    // an ISO 27001 engagement with live access puts the framework in the auditor's scope, read-only
    const { id: aud } = body<{ id: string }>(await call("POST", "ws/audits", { name: "ISO 27001 surveillance", fw: "ISO 27001" }, jordan.cookie));
    await call("POST", `ws/audits/${aud}/auditor-access`, { auditorId: morgan.id, until: new Date(clock + 30 * 86400_000).toISOString().slice(0, 10) }, jordan.cookie);
    expect((await call("POST", "ws/frameworks/iso27001/scope", { on: false }, morgan.cookie)).status).toBe(403);
    expect((await call("POST", "ws/frameworks/iso27001/scope", { on: true }, jordan.cookie)).status).toBe(204);
    expect((await call("POST", "ws/frameworks/iso27001/snooze", { on: true }, jordan.cookie)).status).toBe(204);
    expect((await call("POST", "ws/frameworks/nope/scope", { on: true }, jordan.cookie)).status).toBe(404);
    expect((await call("POST", "ws/frameworks/iso27001/requirements/A.5.1/na", { reason: "too short" }, jordan.cookie)).status).toBe(400);
    expect((await call("POST", "ws/frameworks/iso27001/requirements/A.5.1/na", { reason: "We have no such activity at all here" }, jordan.cookie)).status).toBe(204);
    const st = body<{ state: Record<string, { scope: boolean; snooze: boolean; na: Record<string, { by: string }> }> }>(await call("GET", "ws/data/frameworks", {}, morgan.cookie)).state.iso27001;
    expect([st.scope, st.snooze, st.na["A.5.1"].by]).toEqual([true, true, "Jordan Avery"]);
    expect((await call("POST", "ws/frameworks/iso27001/requirements/A.5.1/na", { on: false }, jordan.cookie)).status).toBe(204);
    expect(log("framework.req.applicable").length).toBe(1);
    expect(["framework.scope.in", "framework.snoozed", "framework.req.na"].every((a) => log(a).length === 1)).toBe(true);
  });
  it("mapping a control on a requirement keeps both sides in step", async () => {
    const jordan = await member("jordan@acme.example", "admin", "Jordan Avery");
    await call("POST", "ws/controls", { title: "Quarterly access review", domain: "Identity & Access" }, jordan.cookie);
    const cid = "IA-1";
    expect((await call("POST", "ws/frameworks/soc2/requirements/CC6.1/map", { control: "NOPE" }, jordan.cookie)).status).toBe(404);
    expect((await call("POST", "ws/frameworks/soc2/requirements/CC6.1/map", { control: cid }, jordan.cookie)).status).toBe(204);
    const c1 = body<{ controls: { id: string; map: Record<string, string[]> }[] }>(await call("GET", "ws/data/controls", {}, jordan.cookie)).controls.find((x) => x.id === cid)!;
    expect(c1.map.soc2).toEqual(["CC6.1"]);
    expect(body<{ state: Record<string, { reqCtrl: Record<string, string[]> }> }>(await call("GET", "ws/data/frameworks", {}, jordan.cookie)).state.soc2.reqCtrl["CC6.1"]).toEqual([cid]);
    await call("POST", "ws/frameworks/soc2/requirements/CC6.1/map", { control: cid, on: false }, jordan.cookie);
    expect(body<{ controls: { id: string; map: Record<string, string[]> }[] }>(await call("GET", "ws/data/controls", {}, jordan.cookie)).controls.find((x) => x.id === cid)!.map.soc2).toBeUndefined();
    // the other way: a control mapping that names a catalogue requirement counts towards readiness
    await call("POST", `ws/controls/${cid}/mappings`, { fw: "soc2", ref: "CC6.6" }, jordan.cookie);
    expect(body<{ state: Record<string, { reqCtrl: Record<string, string[]> }> }>(await call("GET", "ws/data/frameworks", {}, jordan.cookie)).state.soc2.reqCtrl["CC6.6"]).toEqual([cid]);
  });
  it("adds a custom framework with its version and requirements; a taken id is refused", async () => {
    const jordan = await member("jordan@acme.example", "admin", "Jordan Avery");
    expect((await call("POST", "ws/frameworks", { short: "", lines: ["x"] }, jordan.cookie)).status).toBe(400);
    expect((await call("POST", "ws/frameworks", { short: "Internal", name: "Internal Baseline", version: "2026", kind: "Framework", region: "EU", lines: ["Encrypt data at rest", "", "Review access quarterly"] }, jordan.cookie)).body).toEqual({ id: "custom-internal" });
    const c = body<{ custom: { id: string; version: string; reqs: string[][] }[] }>(await call("GET", "ws/data/frameworks", {}, jordan.cookie)).custom[0];
    expect([c.id, c.version, c.reqs.map((r) => r[0])]).toEqual(["custom-internal", "2026", ["R1", "R2"]]);
    expect((await call("POST", "ws/frameworks", { short: "Internal", lines: ["x"] }, jordan.cookie)).body).toEqual({ error: "That framework is already in the library." });
    expect((await call("POST", "ws/frameworks", { short: "ISO", template: "iso27001", lines: ["x"] }, jordan.cookie)).status).toBe(400);
  });
});

describe("controls and tests", () => {
  it("attestation and manual status: only the named owner (by id, not by name), with a reason; tests take over the status", async () => {
    const jordan = await member("jordan@acme.example", "admin", "Jordan Avery");
    const owen = await member("owen@acme.example", "owner", "Owen Hart");
    const twin = await member("owen.h@acme.example", "admin", "Owen Hart"); // same name, different person
    const sam = await member("sam@acme.example", "analyst", "Sam Lee");
    await call("POST", "ws/controls/adopt", { ids: ["GOV-1"], ownerId: owen.id }, jordan.cookie);
    expect((await call("POST", "ws/controls/GOV-1/attestation", { note: "Reviewed" }, twin.cookie)).body).toEqual({ error: "Only the control owner (Owen Hart) can attest." });
    expect((await call("POST", "ws/controls/GOV-1/attestation", { note: "Reviewed and in force" }, owen.cookie)).status).toBe(200);
    expect((await call("POST", "ws/controls/GOV-1/status", { status: "Pass", reason: "short" }, owen.cookie)).status).toBe(400);
    expect((await call("POST", "ws/controls/GOV-1/status", { status: "Pass", reason: "Policy approved by the board" }, owen.cookie)).status).toBe(200);
    // a test linked to it: the status now follows the test; a person records a manual result
    expect((await call("POST", "ws/tests", { name: "Board minutes check", control: "GOV-1" }, sam.cookie)).status).toBe(403);
    const t = body<{ id: string }>(await call("POST", "ws/tests", { name: "Board minutes check", control: "GOV-1", source: "Manual" }, jordan.cookie)).id;
    expect(t).toBe("TST-07");
    expect((await call("POST", "ws/controls/GOV-1/status", { status: "Fail", reason: "Testing the override block" }, owen.cookie)).body).toEqual({ error: "Status follows 1 automated test; it cannot be overridden manually. Request an exception with a compensating control instead." });
    expect((await call("POST", `ws/tests/${t}/result`, { result: "Fail", note: "Minutes for Q3 missing" }, sam.cookie)).status).toBe(200);
    expect(body<{ controls: { id: string; status: string }[] }>(await call("GET", "ws/data/controls", {}, sam.cookie)).controls[0].status).toBe("Fail");
    expect(log("control.status.followed-tests")[0].target).toBe("GOV-1: Pass → Fail (automated tests)");
    expect((await call("POST", `ws/tests/${t}/deactivate`, {}, sam.cookie)).status).toBe(403);
    expect((await call("POST", `ws/tests/${t}/deactivate`, {}, jordan.cookie)).status).toBe(200);
  });
  it("an exception needs another admin or owner who is neither the requester nor the control owner; one pending at a time; requester may withdraw", async () => {
    const jordan = await member("jordan@acme.example", "admin", "Jordan Avery");
    const owen = await member("owen@acme.example", "owner", "Owen Hart");
    const casey = await member("casey@acme.example", "admin", "Casey Morgan");
    await call("POST", "ws/controls/adopt", { ids: ["VUL-1"], ownerId: owen.id }, jordan.cookie);
    const day = (n: number) => new Date(clock + n * 86400_000).toISOString().slice(0, 10);
    const ask = (cookie: string, x: Record<string, unknown> = {}) => call("POST", "ws/controls/VUL-1/exceptions", { reason: "Vendor patch not yet released", compensating: "WAF rule blocks the exploit path for now", expires: day(30), ...x }, cookie);
    expect((await ask(jordan.cookie, { expires: day(400) })).body).toEqual({ error: "An exception can last at most 12 months." });
    expect((await ask(jordan.cookie, { compensating: "short" })).status).toBe(400);
    expect(body<string>(await ask(jordan.cookie))).toMatch(/^[0-9a-f-]{36}$/); // the request's id; the exception itself is EX-1
    const id = "EX-1";
    expect((await ask(jordan.cookie)).body).toEqual({ error: "An exception request for this control is already pending." });
    const decide = (cookie: string, decision: string, reason = "Risk accepted until the patch") => call("POST", `ws/controls/VUL-1/exceptions/${id}`, { decision, reason }, cookie);
    expect((await decide(jordan.cookie, "approve")).status).toBe(403); // the requester
    expect((await decide(owen.cookie, "approve")).body).toEqual({ error: "Segregation of duties: the requester and the control owner cannot approve the exception." });
    expect((await decide(casey.cookie, "approve", "short")).status).toBe(400);
    expect((await decide(casey.cookie, "approve")).status).toBe(200);
    expect(body<{ approvals: { status: string; approvals: { by: string }[] }[] }>(await call("GET", "ws/data/controls", {}, jordan.cookie)).approvals[0]).toEqual(expect.objectContaining({ status: "Approved", approvals: [expect.objectContaining({ by: "Casey Morgan" })] }));
    expect(log("control.exception.approved").length).toBe(1); expect(log("approval.control.exception.approved").length).toBe(1);
    // it runs out: recorded once
    clock += 31 * 86400_000; const s = await member("sam@acme.example", "analyst", "Sam Lee");
    await call("GET", "ws/data/controls", {}, s.cookie); await call("GET", "ws/data/controls", {}, s.cookie);
    expect(log("control.exception.expired").length).toBe(1);
  });
  it("adoption is idempotent; custom controls get fresh ids; asking for evidence notifies the owner", async () => {
    const jordan = await member("jordan@acme.example", "admin", "Jordan Avery");
    const owen = await member("owen@acme.example", "owner", "Owen Hart");
    expect(body<{ added: string[] }>(await call("POST", "ws/controls/adopt", { ids: ["GOV-1", "GOV-2"], ownerId: owen.id }, jordan.cookie)).added).toEqual(["GOV-1", "GOV-2"]);
    expect(body<{ added: string[] }>(await call("POST", "ws/controls/adopt", { ids: ["GOV-1"] }, jordan.cookie)).added).toEqual([]);
    expect(body<{ id: string }>(await call("POST", "ws/controls", { title: "Board oversight", domain: "Governance", ownerId: owen.id }, jordan.cookie)).id).toBe("G-1");
    expect((await call("POST", "ws/controls", { title: "x", ownerId: "not-a-member" }, jordan.cookie)).body).toEqual({ error: "Choose an active member of your company." });
    expect((await call("POST", "ws/controls/GOV-1/evidence-request", {}, jordan.cookie)).status).toBe(204);
    expect(store.notices.some((n) => n.userId === owen.id && /asked for evidence for control GOV-1/.test(n.text))).toBe(true);
  });
});

describe("evidence", () => {
  const pdf = new TextEncoder().encode("%PDF-1.7\nsynthetic test file\n");
  it("the collector and every contributor are excluded from review; any change resets it", async () => {
    const jordan = await member("jordan@acme.example", "admin", "Jordan Avery");
    const owen = await member("owen@acme.example", "owner", "Owen Hart");
    const morgan = await member("morgan@acme.example", "auditor", "Morgan Blake");
    const id = body<{ id: string }>(await call("POST", "ws/evidence", { name: "Access review Q3", type: "Report", note: "Synthetic" }, jordan.cookie)).id;
    expect(id).toBe("EV-209");
    expect((await call("POST", `ws/evidence/${id}/review`, { decision: "Accepted" }, morgan.cookie)).status).toBe(404); // not shared with an engagement of theirs: it does not exist for the auditor (F1-01)
    expect((await call("POST", `ws/evidence/${id}/review`, { decision: "Accepted" }, jordan.cookie)).body).toEqual({ error: "Segregation of duties: the collector or a contributor cannot accept their own evidence." });
    await call("POST", `ws/evidence/${id}/versions`, { note: "Added the Q3 export" }, owen.cookie); // owen is now a contributor
    expect((await call("POST", `ws/evidence/${id}/review`, { decision: "Accepted" }, owen.cookie)).status).toBe(403);
    const casey = await member("casey@acme.example", "admin", "Casey Morgan");
    expect((await call("POST", `ws/evidence/${id}/review`, { decision: "Rejected", note: "short" }, casey.cookie)).status).toBe(400);
    expect((await call("POST", `ws/evidence/${id}/review`, { decision: "Accepted", note: "Matches the system export" }, casey.cookie)).status).toBe(200);
    expect((await call("PATCH", `ws/evidence/${id}`, { name: "Access review Q3 (final)", type: "Report", note: "" }, jordan.cookie)).status).toBe(200);
    expect(body<{ evidence: { review: { status: string } }[] }>(await call("GET", "ws/data/evidence", {}, owen.cookie)).evidence[0].review.status).toBe("Pending review");
    expect(log("evidence.review.reset").length).toBe(1);
  });
  it("files: checked by type, size and content, stored under the company, downloadable through a short link, audited", async () => {
    const jordan = await member("jordan@acme.example", "admin", "Jordan Avery");
    const id = body<{ id: string }>(await call("POST", "ws/evidence", { name: "Firewall config", type: "PDF" }, jordan.cookie)).id;
    const up = (name: string, bytes: Uint8Array) => call("POST", `ws/evidence/${id}/files`, { name }, jordan.cookie, bytes);
    expect((await up("run.exe", pdf)).status).toBe(400);
    expect((await up("fake.pdf", new TextEncoder().encode("<html>not a pdf</html>"))).body).toEqual({ error: "The file's content is not a valid .pdf file." });
    expect((await up("big.pdf", new Uint8Array(4 * 1024 * 1024 + 1))).status).toBe(400);
    expect((await call("POST", `ws/evidence/${id}/files`, { name: "x.pdf" }, jordan.cookie)).status).toBe(415); // JSON, not bytes
    const f = body<{ id: string }>(await up("../../etc/firewall.pdf", pdf)).id;
    const [path] = [...files.files.keys()];
    expect(path.startsWith(`${ACME}/${id}/`)).toBe(true);
    const ev = body<{ evidence: { attachments: Record<string, unknown>[] }[] }>(await call("GET", "ws/data/evidence", {}, jordan.cookie)).evidence[0].attachments[0];
    expect(ev.name).toBe(".._.._etc_firewall.pdf".replace(/^\.+/, "")); expect(ev.path).toBeUndefined(); // the storage path stays on the server
    const link = body<{ url: string }>(await call("POST", `ws/evidence/${id}/files/${f}/download`, {}, jordan.cookie));
    expect(link.url).toMatch(/expires=60/);
    expect(log("evidence.attachment.downloaded").length).toBe(1);
    expect((await call("POST", `ws/evidence/${id}/files/${f}/remove`, {}, jordan.cookie)).status).toBe(204);
    expect(files.files.size).toBe(0);
  });
  it("deletion needs a second admin; the requester may withdraw; an approved deletion keeps a tombstone and deletes the files", async () => {
    const jordan = await member("jordan@acme.example", "admin", "Jordan Avery");
    const owen = await member("owen@acme.example", "owner", "Owen Hart");
    const casey = await member("casey@acme.example", "admin", "Casey Morgan");
    const id = body<{ id: string }>(await call("POST", "ws/evidence", { name: "Old screenshot", type: "Screenshot" }, jordan.cookie)).id;
    await call("POST", `ws/evidence/${id}/files`, { name: "old.pdf" }, jordan.cookie, pdf);
    expect((await call("POST", `ws/evidence/${id}/delete-requests`, { reason: "Superseded by EV-300 entirely" }, owen.cookie)).status).toBe(403);
    expect((await call("POST", `ws/evidence/${id}/delete-requests`, { reason: "too short" }, jordan.cookie)).status).toBe(400);
    expect((await call("POST", `ws/evidence/${id}/delete-requests`, { reason: "Superseded by a newer screenshot" }, jordan.cookie)).status).toBe(200);
    expect((await call("POST", `ws/evidence/${id}/delete-requests`, { reason: "Superseded by a newer screenshot" }, casey.cookie)).body).toEqual({ error: "A deletion request is already pending." });
    expect((await call("POST", `ws/evidence/${id}/delete-requests/approve`, { reason: "Checked the newer one" }, jordan.cookie)).status).toBe(403);
    expect((await call("POST", `ws/evidence/${id}/delete-requests/withdraw`, {}, casey.cookie)).status).toBe(403);
    expect((await call("POST", `ws/evidence/${id}/delete-requests/withdraw`, {}, jordan.cookie)).status).toBe(200);
    await call("POST", `ws/evidence/${id}/delete-requests`, { reason: "Superseded by a newer screenshot" }, jordan.cookie);
    expect((await call("POST", `ws/evidence/${id}/delete-requests/approve`, { reason: "Checked the newer one" }, casey.cookie)).status).toBe(200);
    expect(body<{ evidence: unknown[] }>(await call("GET", "ws/data/evidence", {}, jordan.cookie)).evidence).toEqual([]);
    expect([...ws.rows.values()].find((r) => r.kind === "evidence-tombstone")!.data).toEqual(expect.objectContaining({ id, requestedBy: "Jordan Avery", approvedBy: "Casey Morgan" }));
    expect(files.files.size).toBe(0);
    expect(log("evidence.deleted")[0].target).toMatch(/requested by Jordan Avery, approved by Casey Morgan/);
  });
});

describe("cross-check fixes", () => {
  it("a decision is refused when the evidence changed since the reviewer opened it", async () => {
    const jordan = await member("jordan@acme.example", "admin", "Jordan Avery");
    const casey = await member("casey@acme.example", "admin", "Casey Morgan");
    const id = body<{ id: string }>(await call("POST", "ws/evidence", { name: "Firewall review", type: "Report" }, jordan.cookie)).id;
    const seen = body<{ evidence: { _v: number }[] }>(await call("GET", "ws/data/evidence", {}, casey.cookie)).evidence[0]._v;
    await call("POST", `ws/evidence/${id}/versions`, { note: "Swapped in a different export" }, jordan.cookie); // changed after Casey looked
    expect((await call("POST", `ws/evidence/${id}/review`, { decision: "Accepted", seen }, casey.cookie)).status).toBe(409);
    const now = body<{ evidence: { _v: number }[] }>(await call("GET", "ws/data/evidence", {}, casey.cookie)).evidence[0]._v;
    expect((await call("POST", `ws/evidence/${id}/review`, { decision: "Accepted", seen: now }, casey.cookie)).status).toBe(200);
  });
  it("custom controls never take a library id; export entries are built by the server; vendors get no member list", async () => {
    const jordan = await member("jordan@acme.example", "admin", "Jordan Avery");
    const grace = await member("grace@acme.example", "vendor", "Grace Lin");
    expect(body<{ id: string }>(await call("POST", "ws/controls", { title: "Restore drills", domain: "Business Continuity" }, jordan.cookie)).id).toBe("BC-4"); // BC-1 to BC-3 are library controls
    await call("POST", "ws/exports", { action: "controls.soa.exported", target: "999999 controls" }, jordan.cookie);
    expect(log("controls.soa.exported")[0].target).toBe("1 controls");
    expect((await call("POST", "ws/exports", { action: "framework.gap.exported", target: "<script>" }, jordan.cookie)).status).toBe(400);
    expect((await call("POST", "ws/exports", { action: "control.workpaper.exported", target: "NOPE-1" }, jordan.cookie)).status).toBe(400);
    expect((await call("GET", "ws/members", {}, grace.cookie)).body).toEqual([]);
  });
});
