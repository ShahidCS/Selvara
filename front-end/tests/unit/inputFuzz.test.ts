import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { COOKIE, ROUTES, RAW_ROUTES, handle, type Req } from "@/server/core";
import { MemoryAuth, MemoryStore } from "@/server/memory";
import { MemoryDirectory } from "@/server/directory";
import { MemoryPlatform } from "@/server/platform";
import { MemorySupport } from "@/server/support";
import { MemoryWsStore } from "@/server/ws/store";
import { MemoryFileStore } from "@/server/ws/files";
import type { Deps } from "@/server/types";
import { totpAt } from "@/lib/totp";

/* SEC-6 (ASVS V5.1): the server validates every input whatever the client sends. A signed-in company admin sends every route hostile values
   (wrong types, arrays, objects, huge strings, out-of-range numbers, odd path segments) in every body field the server reads. A validation
   gap shows as an unhandled exception (500); a handled refusal (4xx) or success is fine. Synthetic people only. */
const ORIGIN = "https://app.example.test"; const PW = "Lantern-orbit-Quince-71";
const SRC = path.resolve(__dirname, "../../src/server");
const files = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(d, e.name)) : e.name.endsWith(".ts") ? [path.join(d, e.name)] : []));
const FIELDS = [...new Set(files(SRC).flatMap((f) => [...fs.readFileSync(f, "utf8").matchAll(/\b(?:r\.body|body|b)\.([a-zA-Z_]\w*)/g)].map((m) => m[1])))];
const HOSTILE: [string, unknown][] = [
  ["array", ["a", 1, null]], ["object", { a: { b: [1] } }], ["huge string", "x".repeat(200_000)], ["number", -1e308], ["NaN-like", "NaN"],
  ["null", null], ["boolean", true], ["unicode", "‮\u0000😀ǅ￿"],
];
const SEGMENTS = ["probe1", "..%2F..%2Fetc", "x".repeat(5000), "__proto__", "constructor"];

async function setup() {
  let clock = 1_800_000_000_000; const used = new Map<string, number>();
  const auth = new MemoryAuth(() => clock); const store = new MemoryStore(() => clock); const dir = new MemoryDirectory(store); const plat = new MemoryPlatform(store, dir);
  const acme = dir.addCompany("acme-eu", "Acme Test Co");
  const d: Deps = { auth, store, dir, plat, sup: new MemorySupport(store, dir, plat), ws: new MemoryWsStore(store), files: new MemoryFileStore(),
    site: { origin: ORIGIN, rpId: "app.example.test" }, secret: "x".repeat(40), now: () => clock };
  const call = (method: string, p: string[], body: Record<string, unknown>, cookie?: string, raw?: Uint8Array) => handle(d, { method, path: p, body, ip: "198.51.100.7",
    cookies: cookie ? { [COOKIE]: cookie } : {}, raw, headers: { origin: ORIGIN, "content-type": raw ? "application/octet-stream" : "application/json", "user-agent": "Mozilla/5.0 Chrome/140" } } as Req);
  const code = (email: string) => { const s = auth.secretOf(email)!; const step = Math.floor(clock / 30_000); if ((used.get(email) ?? -1) >= step) clock = (step + 1) * 30_000 + 1_000; used.set(email, Math.floor(clock / 30_000)); return totpAt(s, clock); };
  const email = "jordan@acme.example";
  const id = await auth.createUser(email, PW, "Jordan Avery"); await auth.confirmUser(id);
  await store.insertProfile({ id, email, person: "Jordan Avery", status: "Active", requestedAt: clock }); dir.addMember(acme, id, "admin");
  const signIn = async () => {
    const st = await call("POST", ["auth", "sign-in"], { email, password: PW });
    if (!(st.body as { ticket?: string })?.ticket) throw new Error("sign-in: " + JSON.stringify(st));
    const v = await call("POST", ["auth", "sign-in", "verify"], { ticket: (st.body as { ticket: string }).ticket, code: await code(email) });
    if (!v.cookies) throw new Error("verify: " + JSON.stringify(v) + JSON.stringify(st.body).slice(0,200));
    return v.cookies![0].match(new RegExp(`${COOKIE}=([^;]*)`))![1];
  };
  return { call, cookie: await signIn() };
}

describe("SEC-6: hostile input never crashes a handler", () => {
  it("every route, every body field the server reads, every hostile value: no 500", { timeout: 600_000 }, async () => {
    vi.spyOn(console, "error").mockImplementation(() => {}); vi.spyOn(console, "warn").mockImplementation(() => {});
    const crashes: string[] = []; const hist: Record<string, number> = {};
    for (const key of Object.keys(ROUTES)) {
      if (key === "POST auth/sign-out") continue; // ends the session the probe uses
      const [method, p] = key.split(" "); const raw = RAW_ROUTES.has(key);
      const { call, cookie } = await setup();
      for (const seg of SEGMENTS) for (const [label, v] of HOSTILE) {
        const body = Object.fromEntries(FIELDS.map((f) => [f, v]));
        const pathParts = p.split("/").map((x) => (x.startsWith(":") ? seg : x));
        let status = 0;
        try { status = (await call(method, pathParts, raw ? { name: v } : body, cookie, raw ? new Uint8Array([0x25, 0x50, 0x44, 0x46]) : undefined)).status; }
        catch (e) { if ((e as Error).name !== "ResponseLeak") throw e; }
        hist[status] = (hist[status] || 0) + 1;
        if (status === 500) crashes.push(`${key} [${label}] seg=${seg.slice(0, 12)}`);
      }
    }
    expect(crashes).toEqual([]);
    // the probes reached the handlers: validation (400) and permission (403) refusals, not only missing sessions
    expect(hist[400]).toBeGreaterThan(1000); expect(hist[403]).toBeGreaterThan(500);
  });
});

describe("SEC-6: text fields take text", () => {
  it("an object or array in a text field is refused, not stored as [object Object]", async () => {
    const { call, cookie } = await setup();
    for (const bad of [{ a: 1 }, ["Access", "policy"]]) {
      const r = await call("POST", ["ws", "policies"], { name: bad }, cookie);
      expect(r.status, JSON.stringify(bad)).toBe(400);
      expect(r.body).toEqual({ error: "Policy name is required." });
    }
    expect((await call("POST", ["ws", "policies"], { name: "Access control policy" }, cookie)).status).toBe(200);
  });
});
