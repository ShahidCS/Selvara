import { beforeEach, describe, expect, it, vi } from "vitest";
import { COOKIE, ROUTES, RAW_ROUTES, handle, type Req, type Res } from "@/server/core";
import { MemoryAuth, MemoryStore } from "@/server/memory";
import { MemoryDirectory } from "@/server/directory";
import { MemoryPlatform } from "@/server/platform";
import { MemorySupport } from "@/server/support";
import { MemoryWsStore } from "@/server/ws/store";
import { MemoryFileStore } from "@/server/ws/files";
import type { Deps } from "@/server/types";
import { totpAt } from "@/lib/totp";

/* SEC-9 (ASVS V4.1.1, V4.2.1): role checks are enforced on the server for every admin route, and an id-based route never reaches another
   company's record (IDOR). Synthetic people and records only. */
const ORIGIN = "https://app.example.test"; const PW = "Lantern-orbit-Quince-71"; const MARK = "ACME-PRIVATE-7Q";
let clock = 1_800_000_000_000; let d: Deps; let auth: MemoryAuth; let store: MemoryStore; let dir: MemoryDirectory; let ACME = ""; let OTHER = "";
const used = new Map<string, number>();
beforeEach(() => {
  clock = 1_800_000_000_000; used.clear(); auth = new MemoryAuth(() => clock); store = new MemoryStore(() => clock); dir = new MemoryDirectory(store);
  const plat = new MemoryPlatform(store, dir); ACME = dir.addCompany("acme-eu", "Acme Test Co"); OTHER = dir.addCompany("other-co", "Other Test Co");
  d = { auth, store, dir, plat, sup: new MemorySupport(store, dir, plat), ws: new MemoryWsStore(store), files: new MemoryFileStore(), site: { origin: ORIGIN, rpId: "app.example.test" }, secret: "x".repeat(40), now: () => clock };
  vi.spyOn(console, "warn").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {});
});
function call(method: string, path: string[], body: Record<string, unknown>, cookie: string): Promise<Res> {
  const raw = RAW_ROUTES.has(`${method} ${path.join("/")}`);
  return handle(d, { method, path, body, ip: "198.51.100.7", cookies: { [COOKIE]: cookie }, raw: raw ? new Uint8Array([1]) : undefined,
    headers: { origin: ORIGIN, "content-type": raw ? "application/octet-stream" : "application/json", "user-agent": "Mozilla/5.0 Chrome/140" } } as Req);
}
async function code(email: string) {
  const s = auth.secretOf(email)!; const step = Math.floor(clock / 30_000);
  if ((used.get(email) ?? -1) >= step) clock = (step + 1) * 30_000 + 1_000;
  used.set(email, Math.floor(clock / 30_000)); return totpAt(s, clock);
}
async function member(email: string, role: string, company: string) {
  const id = await auth.createUser(email, PW, email.split("@")[0]); await auth.confirmUser(id);
  await store.insertProfile({ id, email, person: email.split("@")[0], status: "Active", requestedAt: clock }); dir.addMember(company, id, role);
  const st = await call("POST", ["auth", "sign-in"], { email, password: PW }, "");
  const v = await call("POST", ["auth", "sign-in", "verify"], { ticket: (st.body as { ticket: string }).ticket, code: await code(email) }, "");
  return v.cookies![0].match(new RegExp(`${COOKIE}=([^;]*)`))![1];
}
const routes = (prefix: string) => Object.keys(ROUTES).filter((k) => k.split(" ")[1].startsWith(prefix));
const fill = (p: string, id: string) => p.split("/").map((x) => (x.startsWith(":") ? id : x));

describe("SEC-9: admin routes are enforced on the server", () => {
  it("no platform admin route answers a company admin or an employee", async () => {
    const admin = await member("jordan@acme.example", "admin", ACME); const emp = await member("priya@acme.example", "employee", ACME);
    const open: string[] = [];
    for (const k of routes("admin/")) for (const [who, c] of [["company admin", admin], ["employee", emp]] as const) {
      const [m, p] = k.split(" "); const r = await call(m, fill(p, "probe1"), {}, c);
      if (r.status < 300) open.push(`${k} as ${who} -> ${r.status}`);
    }
    expect(open).toEqual([]);
  });
  it("no company-admin change answers an employee", async () => {
    const emp = await member("priya@acme.example", "employee", ACME);
    const open: string[] = [];
    for (const k of routes("team/").filter((x) => !x.startsWith("GET "))) {
      const [m, p] = k.split(" "); const r = await call(m, fill(p, "probe1"), { reason: "Probe of a change by an employee", role: "admin", lockout: "strict", email: "x@acme.example", name: "Probe Person" }, emp);
      if (r.status < 300) open.push(`${k} -> ${r.status}`);
    }
    expect(open).toEqual([]);
  });
});

describe("SEC-9: no route reaches another company's records (IDOR)", () => {
  it("records created in one company are invisible and unchangeable from another company's admin", async () => {
    const acme = await member("jordan@acme.example", "admin", ACME); const other = await member("casey@other.example", "admin", OTHER);
    const made: string[] = [];
    for (const [p, b] of [["ws/policies", { name: `${MARK} policy` }], ["ws/risks", { title: `${MARK} risk`, score: 12 }], ["ws/issues", { title: `${MARK} issue`, sev: "High" }], ["ws/vendors", { name: `${MARK} vendor` }]] as const) {
      const r = await call("POST", p.split("/"), b, acme); const id = (r.body as { id?: string })?.id; if (id) made.push(id);
    }
    expect(made.length).toBeGreaterThanOrEqual(3);
    const leaks: string[] = [];
    for (const k of Object.keys(ROUTES).filter((x) => x.split(" ")[1].startsWith("ws/"))) {
      const [m, p] = k.split(" ");
      const ids = p.includes(":") ? made : ["-"];
      for (const id of ids) {
        const r = await call(m, fill(p, id), { reason: "Probe from another company admin", title: "changed", name: "changed", status: "Closed" }, other);
        if (JSON.stringify(r.body ?? "").includes(MARK)) leaks.push(`${k} (${id}) leaked ${MARK}`);
      }
    }
    expect(leaks).toEqual([]);
    // and nothing in Acme changed: its records still carry the marker
    const pol = await call("GET", ["ws", "data", "policies"], {}, acme);
    expect(JSON.stringify(pol.body)).toContain(`${MARK} policy`);
  });
});
