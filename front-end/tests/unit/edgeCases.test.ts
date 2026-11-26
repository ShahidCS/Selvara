import { beforeEach, describe, expect, it, vi } from "vitest";
import { COOKIE, handle, type Req, type Res } from "@/server/core";
import { MemoryAuth, MemoryStore } from "@/server/memory";
import { MemoryDirectory } from "@/server/directory";
import { MemoryPlatform } from "@/server/platform";
import { MemorySupport } from "@/server/support";
import { MemoryWsStore } from "@/server/ws/store";
import { MemoryFileStore } from "@/server/ws/files";
import type { Deps } from "@/server/types";

/* Phase B edge cases (EDGE-n) on the production API, through `handle` as /api runs it. Synthetic people only. */
const ORIGIN = "https://app.example.test"; const PW = "Lantern-orbit-Quince-71";
let clock = 1_800_000_000_000; let d: Deps; let auth: MemoryAuth; let store: MemoryStore; let dir: MemoryDirectory; let ACME = "";
beforeEach(() => {
  clock = 1_800_000_000_000; auth = new MemoryAuth(() => clock); store = new MemoryStore(() => clock); dir = new MemoryDirectory(store);
  const plat = new MemoryPlatform(store, dir); ACME = dir.addCompany("acme-eu", "Acme Test Co");
  d = { auth, store, dir, plat, sup: new MemorySupport(store, dir, plat), ws: new MemoryWsStore(store), files: new MemoryFileStore(), site: { origin: ORIGIN, rpId: "app.example.test" }, secret: "x".repeat(40), now: () => clock };
  vi.spyOn(console, "warn").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {});
});
const call = (method: string, path: string, body: Record<string, unknown> = {}, ip = "198.51.100.7", cookie?: string): Promise<Res> =>
  handle(d, { method, path: path.split("/").filter(Boolean), body, ip, cookies: cookie ? { [COOKIE]: cookie } : {}, headers: { origin: ORIGIN, "content-type": "application/json", "user-agent": "Mozilla/5.0 Chrome/140" } } as Req);
const join = (b: Record<string, unknown>, ip = "198.51.100.7") => call("POST", "auth/join-requests", { name: "John Doe", email: "test@example.com", password: PW, company: "acme-eu", ...b }, ip);

describe("EDGE-2: a double-tapped sign-up", () => {
  it("two simultaneous requests make one account and one pending request, and both get the same answer", async () => {
    const [a, b] = await Promise.all([join({}), join({})]);
    expect([a.status, b.status]).toEqual([202, 202]);
    expect([...auth.users.values()].filter((u) => u.email === "test@example.com")).toHaveLength(1);
    const pending = await dir.members(ACME, "", "Pending");
    expect(pending.filter((m) => m.email === "test@example.com")).toHaveLength(1);
  });
});
