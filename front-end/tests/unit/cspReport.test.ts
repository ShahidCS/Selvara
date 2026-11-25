import { beforeEach, describe, expect, it } from "vitest";
import { COOKIE, handle, type Req, type Res } from "@/server/core";
import { MemoryAuth, MemoryStore } from "@/server/memory";
import { MemoryDirectory } from "@/server/directory";
import { MemoryPlatform } from "@/server/platform";
import { MemorySupport } from "@/server/support";
import { MemoryWsStore } from "@/server/ws/store";
import { MemoryFileStore } from "@/server/ws/files";
import { CSP_MAX_ROWS, CSP_PER_HOUR, MemoryCspReports, reduceReport } from "@/server/cspReport";
import type { Deps } from "@/server/types";
import { totpAt } from "@/lib/totp";

/* CSP violation reports (migration 0012): reduction, the anonymous endpoint and the staff list, through `handle` as /api runs it, against the
   in-memory stand-ins (the database enforces the same in 0012; tests/db covers it). Synthetic people and addresses only. */
const ORIGIN = "https://app.example.test";
let clock = 1_800_000_000_000; let d: Deps; let auth: MemoryAuth; let store: MemoryStore; let dir: MemoryDirectory; let csp: MemoryCspReports; let ACME = "";
const used = new Map<string, number>();
beforeEach(() => {
  clock = 1_800_000_000_000; used.clear(); auth = new MemoryAuth(() => clock); store = new MemoryStore(() => clock); dir = new MemoryDirectory(store);
  const plat = new MemoryPlatform(store, dir); csp = new MemoryCspReports();
  ACME = dir.addCompany("acme-eu", "Acme Test Co");
  d = { auth, store, dir, plat, sup: new MemorySupport(store, dir, plat), ws: new MemoryWsStore(store), files: new MemoryFileStore(), site: { origin: ORIGIN, rpId: "app.example.test" }, secret: "x".repeat(40), now: () => clock, csp };
});
const PW = "Lantern-orbit-Quince-71";
const call = (method: string, path: string, body: Record<string, unknown> = {}, cookie?: string, headers: Record<string, string> = { origin: ORIGIN, "content-type": "application/json" }, ip = "198.51.100.7"): Promise<Res> =>
  handle(d, { method, path: path.split("/").filter(Boolean), body, ip, cookies: cookie ? { [COOKIE]: cookie } : {}, headers: { "user-agent": "Mozilla/5.0 Chrome/140", ...headers } } as Req);
async function code(email: string) {
  const secret = auth.secretOf(email)!; const step = Math.floor(clock / 30_000);
  if ((used.get(email) ?? -1) >= step) clock = (step + 1) * 30_000 + 1_000;
  used.set(email, Math.floor(clock / 30_000)); return totpAt(secret, clock);
}
async function account(email: string, role: string, person: string) {
  const id = await auth.createUser(email, PW, person); await auth.confirmUser(id);
  await store.insertProfile({ id, email, person, status: "Active", requestedAt: clock });
  if (role === "support") dir.staff.set(id, "support"); else dir.addMember(ACME, id, role);
  const st = await call("POST", "auth/sign-in", { email, password: PW });
  const v = await call("POST", "auth/sign-in/verify", { ticket: (st.body as { ticket: string }).ticket, code: await code(email) });
  return { id, cookie: v.cookies![0].match(new RegExp(`${COOKIE}=([^;]*)`))![1] };
}
/** A browser's report: no origin header, its own content type, the Reporting API array wrapped by the API route. */
const report = (reports: unknown[], ip?: string) => call("POST", "csp-report", { reports }, undefined, { "content-type": "application/reports+json" }, ip);
const legacy = (r: Record<string, unknown>) => call("POST", "csp-report", { "csp-report": r }, undefined, { "content-type": "application/csp-report" });
const viol = (body: Record<string, unknown>) => ({ type: "csp-violation", url: `${ORIGIN}/ws/overview`, body: { documentURL: `${ORIGIN}/ws/overview?tab=x#frag`, effectiveDirective: "script-src-elem", blockedURL: "inline", disposition: "enforce", ...body } });

describe("CSP report reduction", () => {
  it("keeps the directive, the blocked origin or keyword, the page path and the file, and nothing else", () => {
    expect(reduceReport(viol({ blockedURL: "https://evil.example.test/x.js?token=abc", sourceFile: `${ORIGIN}/_next/static/chunks/app.js`, lineNumber: 12, sample: "alert(document.cookie)" }), ORIGIN))
      .toEqual({ directive: "script-src-elem", blocked: "https://evil.example.test", page: "/ws/overview", source: "/_next/static/chunks/app.js", line: 12 });
    expect(reduceReport({ "csp-report": { "document-uri": `${ORIGIN}/login?invite=SECRET`, "violated-directive": "style-src-attr 'self'", "blocked-uri": "inline", "script-sample": "color:red" } }, ORIGIN))
      .toEqual({ directive: "style-src-attr", blocked: "inline", page: "/login", source: "", line: 0 });
    expect(reduceReport(viol({ blockedURL: "eval" }), ORIGIN)?.blocked).toBe("eval");
    expect(reduceReport(viol({ blockedURL: "data:text/javascript,alert(1)" }), ORIGIN)?.blocked).toBe("data");
  });
  it("drops browser-extension noise, reports about other sites and malformed reports", () => {
    expect(reduceReport(viol({ blockedURL: "chrome-extension://abcdef/inject.js" }), ORIGIN)).toBeNull();
    expect(reduceReport(viol({ sourceFile: "moz-extension://1234/content.js" }), ORIGIN)).toBeNull();
    expect(reduceReport(viol({ documentURL: "https://other.example.test/page" }), ORIGIN)).toBeNull();
    expect(reduceReport(viol({ effectiveDirective: "script-src'; drop table" }), ORIGIN)).toBeNull();
    expect(reduceReport({ type: "deprecation", body: {} }, ORIGIN)).toBeNull();
    expect(reduceReport("nonsense", ORIGIN)).toBeNull();
  });
});

describe("CSP report endpoint", () => {
  it("takes both report formats without sign-in or origin, always answers 204, and counts identical reports", async () => {
    expect((await report([viol({}), viol({}), { type: "deprecation", body: {} }])).status).toBe(204);
    expect((await legacy({ "document-uri": `${ORIGIN}/ws/overview`, "effective-directive": "script-src-elem", "blocked-uri": "inline" })).status).toBe(204);
    expect(csp.rows).toHaveLength(1);
    expect(csp.rows[0]).toMatchObject({ directive: "script-src-elem", blocked: "inline", page: "/ws/overview", hits: 3 });
    // ordinary JSON is refused; nothing is echoed
    expect((await call("POST", "csp-report", { reports: [viol({})] }, undefined, { "content-type": "application/json" })).status).toBe(415);
    expect((await report([viol({ blockedURL: "https://evil.example.test/a.js" })])).body).toBeUndefined();
  });
  it("looks at no more than the hourly limit from one address and keeps at most the row cap", async () => {
    for (let i = 0; i < CSP_PER_HOUR; i++) await report([viol({ lineNumber: i + 1 })], "203.0.113.9");
    expect(csp.rows).toHaveLength(CSP_PER_HOUR);
    expect((await report([viol({ lineNumber: 9999 })], "203.0.113.9")).status).toBe(204);
    expect(csp.rows.find((r) => r.line === 9999)).toBeUndefined();
    // another address is still heard
    await report([viol({ lineNumber: 9999 })], "203.0.113.10");
    expect(csp.rows.find((r) => r.line === 9999)).toBeDefined();
    // the cap: new distinct rows stop at CSP_MAX_ROWS, existing ones are still counted
    for (let i = csp.rows.length; i < CSP_MAX_ROWS + 5; i++) await csp.add({ directive: "img-src", blocked: "https://x.example.test", page: "/", source: "", line: i }, clock);
    expect(csp.rows).toHaveLength(CSP_MAX_ROWS);
    // rows not seen for 30 days are removed
    clock += 31 * 86_400_000; await csp.add({ directive: "img-src", blocked: "data", page: "/", source: "", line: 0 }, clock);
    expect(csp.rows).toHaveLength(1);
  });
  it("is read by platform staff only", async () => {
    await report([viol({ blockedURL: "https://evil.example.test/a.js" })]);
    const sam = await account("sam@platform.example", "support", "Sam Hayes");
    const priya = await account("priya@acme.example", "admin", "Priya Nair");
    const got = await call("GET", "admin/security/csp-reports", {}, sam.cookie);
    expect(got.status).toBe(200);
    expect((got.body as { reports: { blocked: string; page: string }[] }).reports).toMatchObject([{ blocked: "https://evil.example.test", page: "/ws/overview" }]);
    expect((await call("GET", "admin/security/csp-reports", {}, priya.cookie)).status).toBe(403);
    expect((await call("GET", "admin/security/csp-reports")).status).toBe(401);
  });
});
