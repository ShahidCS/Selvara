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

/* Security fix F1-01: an external auditor sees only what is shared with their engagements (the engagement's framework and the controls,
   evidence and policies management lists on it), only while their access is live. Everything else does not exist for them (404).
   Through `handle`, as /api runs it, against the in-memory stand-ins. Synthetic people only. */
const ORIGIN = "https://app.example.test";
let clock = 1_800_000_000_000; let d: Deps; let auth: MemoryAuth; let store: MemoryStore; let dir: MemoryDirectory; let ws: MemoryWsStore; let files: MemoryFileStore; let ACME = "";
const used = new Map<string, number>();
beforeEach(() => {
  clock = 1_800_000_000_000; used.clear(); auth = new MemoryAuth(() => clock); store = new MemoryStore(() => clock); dir = new MemoryDirectory(store);
  const plat = new MemoryPlatform(store, dir); ws = new MemoryWsStore(store); files = new MemoryFileStore();
  ACME = dir.addCompany("acme-eu", "Acme Test Co");
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
const cookieOf = (v: Res) => v.cookies![0].match(new RegExp(`${COOKIE}=([^;]*)`))![1];
async function member(email: string, role: string, person: string) {
  const id = await auth.createUser(email, PW, person); await auth.confirmUser(id);
  await store.insertProfile({ id, email, person, status: "Active", requestedAt: clock }); dir.addMember(ACME, id, role);
  return { id, cookie: await signIn(email) };
}
async function signIn(email: string) {
  const st = await call("POST", "auth/sign-in", { email, password: PW });
  return cookieOf(await call("POST", "auth/sign-in/verify", { ticket: (st.body as { ticket: string }).ticket, code: await code(email) }));
}
const log = (action: string) => store.auditLog.filter((x) => x.action === action);
const body = <T,>(r: Res) => r.body as T;
const day = (n: number) => new Date(clock + n * 86400_000).toISOString().slice(0, 10);
const pdf = new TextEncoder().encode("%PDF-1.7\nsynthetic test file\n");

/** A company with two controls, two evidence items (one with a file), two policies, a test on each control and two external auditors. */
async function setup() {
  const jordan = await member("jordan@acme.example", "admin", "Jordan Avery");
  const ana = await member("ana@acme.example", "analyst", "Ana Silva");
  const mo = await member("morgan@auditfirm.example", "auditor", "Morgan Blake");
  const kim = await member("kim@otherfirm.example", "auditor", "Kim Park");
  await call("POST", "ws/controls/adopt", { ids: ["GOV-1", "IAM-1"] }, jordan.cookie);
  const t1 = body<{ id: string }>(await call("POST", "ws/tests", { name: "Board minutes check", control: "GOV-1" }, jordan.cookie)).id;
  const t2 = body<{ id: string }>(await call("POST", "ws/tests", { name: "MFA coverage", control: "IAM-1" }, jordan.cookie)).id;
  const ev1 = body<{ id: string }>(await call("POST", "ws/evidence", { name: "Board minutes Q3", type: "Report" }, jordan.cookie)).id;
  const ev2 = body<{ id: string }>(await call("POST", "ws/evidence", { name: "MFA export", type: "Report" }, jordan.cookie)).id;
  const f1 = body<{ id: string }>(await call("POST", `ws/evidence/${ev1}/files`, { name: "minutes.pdf" }, jordan.cookie, pdf)).id;
  const f2 = body<{ id: string }>(await call("POST", `ws/evidence/${ev2}/files`, { name: "mfa.pdf" }, jordan.cookie, pdf)).id;
  const p1 = body<{ id: string }>(await call("POST", "ws/policies", { name: "Information security", body: "Text" }, jordan.cookie)).id;
  const p2 = body<{ id: string }>(await call("POST", "ws/policies", { name: "Acceptable use", body: "Text" }, jordan.cookie)).id;
  const { id: aud } = body<{ id: string }>(await call("POST", "ws/audits", { name: "ISO 27001 surveillance", fw: "ISO 27001" }, jordan.cookie));
  return { jordan, ana, mo, kim, t1, t2, ev1, ev2, f1, f2, p1, p2, aud };
}
const share = (aud: string, kind: string, id: string, cookie: string, on = true) => call("POST", `ws/audits/${aud}/shared`, { kind, id, on }, cookie);
const ids = async (path: string, key: string, cookie: string) => body<Record<string, { id: string }[]>>(await call("GET", `ws/data/${path}`, {}, cookie))[key].map((x) => x.id).sort();
type Fw = { library: { id: string }[]; state: Record<string, unknown>; custom: { id: string }[] };

describe("auditor scope (F1-01)", () => {
  it("an auditor sees only the engagement's framework and what management shared, while access is live", async () => {
    const s = await setup(); const { jordan, mo } = s;
    // before access: nothing at all, even with items shared
    expect((await share(s.aud, "controls", "GOV-1", jordan.cookie)).status).toBe(200);
    expect(await ids("controls", "controls", mo.cookie)).toEqual([]);
    expect(body<Fw>(await call("GET", "ws/data/frameworks", {}, mo.cookie)).library).toEqual([]);
    // with live access: ISO 27001 and the shared items only
    expect((await call("POST", `ws/audits/${s.aud}/auditor-access`, { auditorId: mo.id, until: day(30) }, jordan.cookie)).status).toBe(200);
    expect((await share(s.aud, "evidence", s.ev1, jordan.cookie)).status).toBe(200);
    expect((await share(s.aud, "policies", s.p1, jordan.cookie)).status).toBe(200);
    expect(store.notices.some((n) => n.userId === mo.id && n.text.includes(`shared ${s.ev1}`))).toBe(true); // told once access is live
    expect(await ids("controls", "controls", mo.cookie)).toEqual(["GOV-1"]);
    expect(await ids("controls", "tests", mo.cookie)).toEqual([s.t1]); // only tests supporting a visible control
    expect(await ids("evidence", "evidence", mo.cookie)).toEqual([s.ev1]);
    expect(await ids("policies", "policies", mo.cookie)).toEqual([s.p1]);
    const fw = body<Fw>(await call("GET", "ws/data/frameworks", {}, mo.cookie));
    expect(fw.library.map((f) => f.id)).toEqual(["iso27001"]); expect(Object.keys(fw.state).every((k) => k === "iso27001")).toBe(true); expect(fw.custom).toEqual([]);
    // the engagement lists what is shared
    const a = body<{ audits: { id: string; shared: Record<string, string[]> }[] }>(await call("GET", "ws/data/audits", {}, mo.cookie)).audits[0];
    expect(a.shared).toEqual({ controls: ["GOV-1"], evidence: [s.ev1], policies: [s.p1] });
    // management keeps seeing everything
    expect(await ids("controls", "controls", jordan.cookie)).toEqual(["GOV-1", "IAM-1"]);
    expect(await ids("evidence", "evidence", jordan.cookie)).toEqual([s.ev1, s.ev2].sort());
    // an engagement without a known framework shares no framework
    const { id: pen } = body<{ id: string }>(await call("POST", "ws/audits", { name: "Penetration test", fw: "-" }, jordan.cookie));
    await call("POST", `ws/audits/${pen}/auditor-access`, { auditorId: mo.id, until: day(30) }, jordan.cookie);
    expect(body<Fw>(await call("GET", "ws/data/frameworks", {}, mo.cookie)).library.map((f) => f.id)).toEqual(["iso27001"]);
  });

  it("out-of-scope details, actions and files answer 404 before anything else; in-scope ones stay read-only", async () => {
    const s = await setup(); const { jordan, mo } = s;
    await call("POST", `ws/audits/${s.aud}/auditor-access`, { auditorId: mo.id, until: day(30) }, jordan.cookie);
    await share(s.aud, "controls", "GOV-1", jordan.cookie); await share(s.aud, "evidence", s.ev1, jordan.cookie); await share(s.aud, "policies", s.p1, jordan.cookie);
    const out: [string, string, Record<string, unknown>?][] = [
      ["POST", "ws/controls/IAM-1/attestation", { note: "x" }], ["POST", "ws/controls/IAM-1/exceptions/EX-1", { decision: "withdraw" }], ["POST", `ws/tests/${s.t2}/run`],
      ["POST", "ws/frameworks/soc2/scope", { on: true }], ["POST", "ws/frameworks/soc2/requirements/CC1.1/na", { reason: "Not relevant to us at all" }], ["POST", "ws/frameworks/soc2/requirements/CC1.1/map", { control: "GOV-1" }],
      ["PATCH", `ws/evidence/${s.ev2}`, { name: "x" }], ["POST", `ws/evidence/${s.ev2}/review`, { decision: "Accepted" }], ["POST", `ws/evidence/${s.ev2}/delete-requests/withdraw`],
      ["POST", `ws/evidence/${s.ev2}/files/${s.f2}/download`], ["POST", `ws/evidence/${s.ev2}/files/${s.f2}/nope`],
      ["PATCH", `ws/policies/${s.p2}`, { name: "x" }], ["POST", `ws/policies/${s.p2}/acknowledge`], ["POST", `ws/policies/${s.p2}/exceptions/PX-1`, { decision: "approve" }],
      ["POST", "ws/controls/NOPE-9/attestation", { note: "x" }],
    ];
    for (const [m, p, b] of out) expect((await call(m, p, b ?? {}, mo.cookie)).status, p).toBe(404);
    expect((await call("POST", `ws/evidence/${s.ev2}/files`, { name: "x.pdf" }, mo.cookie, pdf)).status).toBe(404);
    // in scope: reading and downloading work, changing is refused by role
    const link = body<{ url: string }>(await call("POST", `ws/evidence/${s.ev1}/files/${s.f1}/download`, {}, mo.cookie));
    expect(link.url).toMatch(/^https:\/\/storage\.example\.test\//);
    expect((await call("POST", "ws/controls/GOV-1/attestation", { note: "Looks fine" }, mo.cookie)).status).toBe(403);
    expect((await call("POST", `ws/tests/${s.t1}/run`, {}, mo.cookie)).status).toBe(403);
    expect((await call("POST", `ws/evidence/${s.ev1}/review`, { decision: "Accepted" }, mo.cookie)).status).toBe(403);
    expect((await call("POST", "ws/frameworks/iso27001/scope", { on: true }, mo.cookie)).status).toBe(403);
    // auditors do not acknowledge policies, even one shared with them
    expect((await call("POST", `ws/policies/${s.p1}/acknowledge`, {}, mo.cookie)).body).toEqual({ error: "Auditors do not acknowledge policies: acknowledgement is for the company's own members." });
    expect(log("policy.acknowledged")).toEqual([]);
  });

  it("another auditor's engagement shares nothing with them; ended or expired access removes the scope", async () => {
    const s = await setup(); const { jordan, mo, kim } = s;
    await call("POST", `ws/audits/${s.aud}/auditor-access`, { auditorId: mo.id, until: day(3) }, jordan.cookie);
    await share(s.aud, "controls", "GOV-1", jordan.cookie); await share(s.aud, "evidence", s.ev1, jordan.cookie);
    expect(await ids("controls", "controls", kim.cookie)).toEqual([]);
    expect(await ids("evidence", "evidence", kim.cookie)).toEqual([]);
    expect(body<Fw>(await call("GET", "ws/data/frameworks", {}, kim.cookie)).library).toEqual([]);
    expect((await call("POST", `ws/evidence/${s.ev1}/files/${s.f1}/download`, {}, kim.cookie)).status).toBe(404);
    // access runs out: nothing remains
    clock += 5 * 86400_000; const m2 = await signIn("morgan@auditfirm.example");
    expect(await ids("controls", "controls", m2)).toEqual([]);
    expect(await ids("evidence", "evidence", m2)).toEqual([]);
    expect((await call("POST", `ws/evidence/${s.ev1}/files/${s.f1}/download`, {}, m2)).status).toBe(404);
    // ended by completing the engagement: the same
    const j2 = await signIn("jordan@acme.example");
    const { id: two } = body<{ id: string }>(await call("POST", "ws/audits", { name: "SOC 2 Type II", fw: "SOC 2" }, j2));
    await call("POST", `ws/audits/${two}/auditor-access`, { auditorId: mo.id, until: day(30) }, j2);
    await share(two, "controls", "IAM-1", j2);
    expect(await ids("controls", "controls", m2)).toEqual(["IAM-1"]);
    expect((await call("POST", `ws/audits/${two}/auditor-access/end`, {}, j2)).status).toBe(200);
    expect(await ids("controls", "controls", m2)).toEqual([]);
    expect(body<Fw>(await call("GET", "ws/data/frameworks", {}, m2)).library).toEqual([]);
  });

  it("only management shares, with known ids, on an engagement that is not complete; every change is audited", async () => {
    const s = await setup(); const { jordan, ana, mo } = s;
    await call("POST", `ws/audits/${s.aud}/auditor-access`, { auditorId: mo.id, until: day(30) }, jordan.cookie);
    expect((await share(s.aud, "controls", "GOV-1", ana.cookie)).status).toBe(403); // an analyst cannot open Audits
    expect((await share(s.aud, "controls", "GOV-1", mo.cookie)).status).toBe(403); // nor can the auditor share with themselves
    expect((await share(s.aud, "controls", "NOPE-9", jordan.cookie)).status).toBe(400);
    expect((await share(s.aud, "evidence", "EV-1", jordan.cookie)).status).toBe(400);
    expect((await share(s.aud, "risks", "RK-01", jordan.cookie)).status).toBe(400);
    expect((await share(s.aud, "controls", "", jordan.cookie)).status).toBe(400);
    expect((await share("AUD-99", "controls", "GOV-1", jordan.cookie)).status).toBe(404);
    expect((await share(s.aud, "controls", "GOV-1", jordan.cookie)).status).toBe(200);
    expect((await share(s.aud, "controls", "GOV-1", jordan.cookie)).status).toBe(200); // already shared: no second entry
    expect(log("audit.shared.added")).toHaveLength(1); expect(log("audit.shared.added")[0].target).toContain("controls GOV-1");
    expect((await share(s.aud, "controls", "GOV-1", jordan.cookie, false)).status).toBe(200);
    expect(log("audit.shared.removed")).toHaveLength(1);
    expect(await ids("controls", "controls", mo.cookie)).toEqual([]);
    await share(s.aud, "policies", s.p1, jordan.cookie);
    expect((await call("POST", `ws/audits/${s.aud}/auditor-access/end`, {}, jordan.cookie)).status).toBe(200);
    expect((await share(s.aud, "controls", "GOV-1", jordan.cookie)).body).toEqual({ error: "This engagement is complete and locked." });
    expect((await share(s.aud, "policies", s.p1, jordan.cookie, false)).status).toBe(400);
  });

  it("an auditor gets no member list or member ids; names on shared records stay", async () => {
    const s = await setup(); const { jordan, ana, mo } = s;
    await call("POST", `ws/audits/${s.aud}/auditor-access`, { auditorId: mo.id, until: day(30) }, jordan.cookie);
    await share(s.aud, "controls", "GOV-1", jordan.cookie); await share(s.aud, "evidence", s.ev1, jordan.cookie); await share(s.aud, "policies", s.p1, jordan.cookie);
    await call("POST", "ws/controls/GOV-1/attestation", { note: "Reviewed the board minutes" }, jordan.cookie);
    const owen = await member("owen@acme.example", "owner", "Owen Hart");
    expect((await call("POST", `ws/evidence/${s.ev1}/review`, { decision: "Accepted" }, owen.cookie)).status).toBe(200);
    await call("POST", "ws/frameworks/iso27001/requirements/A.5.2/na", { reason: "Not relevant to this company at all" }, jordan.cookie);
    expect(body<unknown[]>(await call("GET", "ws/members", {}, mo.cookie))).toEqual([]);
    expect(body<unknown[]>(await call("GET", "ws/members", {}, ana.cookie)).length).toBe(5); // other roles keep the pickers
    const ctl = body<{ members: unknown[]; controls: { owner: string; ownerId: string; attestation: { by: string; byId: string } }[] }>(await call("GET", "ws/data/controls", {}, mo.cookie));
    expect(ctl.members).toEqual([]);
    expect(ctl.controls[0]).toMatchObject({ owner: "Jordan Avery", ownerId: "", attestation: { by: "Jordan Avery", byId: "" } });
    const ev = body<{ evidence: { by: string; review: { by: string } }[] }>(await call("GET", "ws/data/evidence", {}, mo.cookie));
    expect(ev.evidence[0]).toMatchObject({ by: "Jordan Avery", review: { by: "Owen Hart", byId: "" } });
    for (const path of ["controls", "evidence", "policies", "frameworks", "audits"]) {
      const text = JSON.stringify((await call("GET", `ws/data/${path}`, {}, mo.cookie)).body);
      for (const who of [jordan.id, ana.id, owen.id, s.kim.id]) expect(text, path).not.toContain(who);
    }
    expect(body<{ members: unknown[] }>(await call("GET", "ws/data/controls", {}, jordan.cookie)).members.length).toBe(5); // management unchanged
  });

  it("framework mappings, test links and policy mappings name only the controls shared with the auditor", async () => {
    const s = await setup(); const { jordan, mo } = s;
    await call("POST", `ws/audits/${s.aud}/auditor-access`, { auditorId: mo.id, until: day(30) }, jordan.cookie);
    await share(s.aud, "controls", "GOV-1", jordan.cookie); await share(s.aud, "policies", s.p1, jordan.cookie);
    for (const c of ["GOV-1", "IAM-1"]) await call("POST", `ws/policies/${s.p1}/controls`, { control: c }, jordan.cookie);
    await call("POST", "ws/frameworks/iso27001/requirements/A.5.1/map", { control: "IAM-1" }, jordan.cookie); // A.5.1 now maps GOV-1 and IAM-1
    const all = (st: Record<string, { reqCtrl: Record<string, string[]> }>) => Object.values(st.iso27001.reqCtrl).flat();
    type St = { state: Record<string, { reqCtrl: Record<string, string[]> }> };
    expect(all(body<St>(await call("GET", "ws/data/frameworks", {}, jordan.cookie)).state)).toEqual(expect.arrayContaining(["GOV-1", "IAM-1"]));
    const mine = body<St>(await call("GET", "ws/data/frameworks", {}, mo.cookie)).state;
    expect(new Set(all(mine))).toEqual(new Set(["GOV-1"]));
    expect(mine.iso27001.reqCtrl["A.5.1"]).toEqual(["GOV-1"]);
    expect(body<{ policies: { mappedControls: string[] }[] }>(await call("GET", "ws/data/policies", {}, mo.cookie)).policies[0].mappedControls).toEqual(["GOV-1"]);
    expect(body<{ policies: { id: string; mappedControls: string[] }[] }>(await call("GET", "ws/data/policies", {}, jordan.cookie)).policies.find((p) => p.id === s.p1)!.mappedControls).toEqual(["GOV-1", "IAM-1"]);
    // a test supporting a shared and an unshared control names only the shared one
    const t = body<{ id: string }>(await call("POST", "ws/tests", { name: "Joint check", control: "GOV-1" }, jordan.cookie)).id;
    const rec = await ws.tx({ id: jordan.id, name: "Jordan Avery", role: "admin", tenantId: ACME, ip: "" }, clock, async (x) => { const r = (await x.get<{ controls: string[] }>("test", t))!; r.data.controls.push("IAM-1"); await x.update("test", t, r.data, r.version); return r.data; });
    expect(rec.controls).toEqual(["GOV-1", "IAM-1"]);
    const tests = body<{ tests: { id: string; controls: string[] }[] }>(await call("GET", "ws/data/controls", {}, mo.cookie)).tests;
    expect(tests.find((x) => x.id === t)!.controls).toEqual(["GOV-1"]);
  });

  it("the auditor's Overview carries no company-wide figures", async () => {
    const s = await setup(); const { jordan, mo } = s;
    await call("POST", "ws/risks", { title: "Synthetic risk", ownerId: jordan.id }, jordan.cookie);
    await call("POST", `ws/audits/${s.aud}/auditor-access`, { auditorId: mo.id, until: day(30) }, jordan.cookie);
    expect(body(await call("GET", "ws/data/overview", {}, mo.cookie))).toEqual({});
  });
});
