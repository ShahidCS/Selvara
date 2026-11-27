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
import { RETENTION_DEFS, resolveRetention, retentionChange } from "@/lib/retention";

/* EDGE-19, PR 1 of the purge job: retention periods and legal holds per company on the server (migration 0016). Longer applies at once;
   shorter waits for a second admin and never goes below the minimum; a hold applies at once; releasing it waits for an admin other than the
   one who placed it and other than the requester. Synthetic people only. */
describe("retention rules (lib/retention.ts)", () => {
  it("resolves stored settings against the defaults and refuses what breaks the minimum", () => {
    const rows = resolveRetention({ issues: { months: 48 }, risks: { months: 2 }, nonsense: { months: 5 } });
    expect(rows.map((r) => r.id)).toEqual(RETENTION_DEFS.map((d) => d.id));
    expect(rows.find((r) => r.id === "issues")!.months).toBe(48);
    expect(rows.find((r) => r.id === "risks")!.months).toBe(84); // a stored value under the floor is ignored
    expect(retentionChange("issues", 6, 36)).toEqual({ error: "Closed issues: at least 12 months (the minimum)." });
    expect(retentionChange("issues", 24, 36)).toEqual({ months: 24, shorter: true });
    expect(retentionChange("issues", 48, 36)).toEqual({ months: 48, shorter: false });
    expect(retentionChange("issues", 36, 36)).toMatchObject({ error: expect.stringMatching(/already/) });
    expect(retentionChange("nope", 36, 36)).toMatchObject({ error: "Unknown record type." });
  });
});

const ORIGIN = "https://app.example.test"; const PW = "Lantern-orbit-Quince-71";
let clock = 1_800_000_000_000; let d: Deps; let auth: MemoryAuth; let store: MemoryStore; let dir: MemoryDirectory; let ACME = "";
const used = new Map<string, number>();
beforeEach(() => {
  clock = 1_800_000_000_000; used.clear(); auth = new MemoryAuth(() => clock); store = new MemoryStore(() => clock); dir = new MemoryDirectory(store);
  const plat = new MemoryPlatform(store, dir); ACME = dir.addCompany("acme-eu", "Acme Test Co");
  d = { auth, store, dir, plat, sup: new MemorySupport(store, dir, plat), ws: new MemoryWsStore(store), files: new MemoryFileStore(), site: { origin: ORIGIN, rpId: "app.example.test" }, secret: "x".repeat(40), now: () => clock };
});
const call = (method: string, path: string, body: Record<string, unknown> = {}, cookie?: string): Promise<Res> =>
  handle(d, { method, path: path.split("/"), body, ip: "198.51.100.7", cookies: cookie ? { [COOKIE]: cookie } : {}, headers: { origin: ORIGIN, "content-type": "application/json", "user-agent": "Mozilla/5.0 Chrome/140" } } as Req);
async function member(email: string, role: string, person: string) {
  const id = await auth.createUser(email, PW, person); await auth.confirmUser(id);
  await store.insertProfile({ id, email, person, status: "Active", requestedAt: clock }); dir.addMember(ACME, id, role);
  const st = await call("POST", "auth/sign-in", { email, password: PW });
  const step = Math.floor(clock / 30_000); if ((used.get(email) ?? -1) >= step) clock = (step + 1) * 30_000 + 1_000; used.set(email, Math.floor(clock / 30_000));
  const v = await call("POST", "auth/sign-in/verify", { ticket: (st.body as { ticket: string }).ticket, code: await totpAt(auth.secretOf(email)!, clock) });
  return v.cookies![0].match(new RegExp(`${COOKIE}=([^;]*)`))![1];
}
type Row = { id: string; months: number; hold: { by: string } | null; pendingMonths: number | null; releaseRequested: boolean };
const rows = async (cookie: string) => (await call("GET", "team/retention", {}, cookie)).body as Row[];
const row = async (cookie: string, id: string) => (await rows(cookie)).find((x) => x.id === id)!;
const log = (action: string) => store.auditLog.filter((x) => x.action === action).map((x) => x.target);
const pendingId = async (cookie: string, kind: string) => ((await call("GET", "team/approvals", {}, cookie)).body as { id: string; kind: string; status: string }[]).find((x) => x.kind === kind && x.status === "Pending")!.id;
const WHY = "Agreed with the compliance lead";

describe("retention periods and legal holds on the server", () => {
  it("admins only; defaults until changed; longer at once, shorter after a second admin; never below the minimum", async () => {
    const jordan = await member("jordan@acme.example", "admin", "Jordan Avery");
    const priya = await member("priya@acme.example", "employee", "Priya Nair");
    expect((await call("GET", "team/retention", {}, priya)).status).toBe(403);
    expect((await rows(jordan)).map((r) => [r.id, r.months])).toEqual(RETENTION_DEFS.map((x) => [x.id, x.months]));
    expect((await call("POST", "team/retention/issues", { months: 48, reason: "short" }, jordan)).status).toBe(400);
    expect((await call("POST", "team/retention/issues", { months: 48, reason: WHY }, jordan)).status).toBe(200);
    expect((await row(jordan, "issues")).months).toBe(48);
    expect(log("team.retention.changed")).toEqual([`Closed issues: 36 → 48 months; reason: ${WHY}`]);
    expect(body(await call("POST", "team/retention/issues", { months: 6, reason: WHY }, jordan)).error).toMatch(/at least 12 months/);
    expect(body(await call("POST", "team/retention/issues", { months: 24, reason: WHY }, jordan)).error).toMatch(/No other company admin/);
    const casey = await member("casey@acme.example", "admin", "Casey Morgan");
    const req = await call("POST", "team/retention/issues", { months: 24, reason: WHY }, jordan); expect(req.status).toBe(202);
    expect((await row(jordan, "issues"))).toMatchObject({ months: 48, pendingMonths: 24 });
    expect((await call("POST", "team/retention/issues", { months: 20, reason: WHY }, jordan)).status).toBe(409); // one at a time
    const id = await pendingId(jordan, "team-retention");
    expect((await call("POST", `team/approvals/${id}/approve`, { reason: "Checked with the regulator list" }, jordan)).status).not.toBe(200); // not the requester
    expect((await call("POST", `team/approvals/${id}/approve`, { reason: "Checked with the regulator list" }, casey)).status).toBe(200);
    expect((await row(jordan, "issues"))).toMatchObject({ months: 24, pendingMonths: null });
    expect(log("team.retention.changed").at(-1)).toMatch(/^Closed issues: 48 → 24 months; requested by Jordan Avery, approved by Casey Morgan/);
  });
  it("a legal hold applies at once; releasing it needs an admin other than the placer and the requester", async () => {
    const jordan = await member("jordan@acme.example", "admin", "Jordan Avery");
    const casey = await member("casey@acme.example", "admin", "Casey Morgan");
    expect((await call("POST", "team/retention/evidence/hold", { reason: WHY }, jordan)).status).toBe(200);
    expect((await row(casey, "evidence")).hold).toMatchObject({ by: "Jordan Avery" });
    expect((await call("POST", "team/retention/evidence/hold", { reason: WHY }, casey)).status).toBe(409); // already held
    // Casey asks to release Jordan's hold: Jordan placed it and Casey asked, so nobody can approve
    expect(body(await call("POST", "team/retention/evidence/release", { reason: WHY }, casey)).error).toMatch(/other than you and the one who placed/);
    const sam = await member("sam@acme.example", "admin", "Sam Lee");
    expect((await call("POST", "team/retention/evidence/release", { reason: WHY }, casey)).status).toBe(202);
    expect((await row(casey, "evidence")).releaseRequested).toBe(true);
    const id = await pendingId(casey, "team-hold");
    expect((await call("POST", `team/approvals/${id}/approve`, { reason: "The litigation has ended" }, jordan)).status).not.toBe(200); // the placer
    expect((await call("POST", `team/approvals/${id}/approve`, { reason: "The litigation has ended" }, sam)).status).toBe(200);
    expect((await row(casey, "evidence")).hold).toBeNull();
    expect(log("team.retention.hold_placed")).toEqual([`Control evidence; reason: ${WHY}`]);
    expect(log("team.retention.hold_released")[0]).toMatch(/^Control evidence; requested by Casey Morgan, approved by Sam Lee/);
  });
});
const body = (r: Res) => r.body as { error: string };
