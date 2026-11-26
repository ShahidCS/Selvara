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

describe("EDGE-3: a blank email", () => {
  it("is refused with a clear message on every entry point, not a crash or a generic answer", async () => {
    for (const email of ["", "   "]) {
      expect(await join({ email })).toEqual({ status: 400, body: { error: "Enter a valid work email address." } });
      expect(await call("POST", "auth/password/reset-request", { email })).toEqual({ status: 400, body: { error: "Enter a valid work email address." } });
    }
  });
});

describe("EDGE-4: a single space as the password", () => {
  it("is refused by the server's password policy, whatever the client does", async () => {
    for (const password of [" ", "            ", " ".repeat(3)]) {
      const r = await join({ password });
      expect(r.status).toBe(400); expect((r.body as { error: string }).error.length).toBeGreaterThan(10); // a policy message, e.g. "Use at least 12 characters."
    }
  });
});

describe("EDGE-5: Unicode in a person's name", () => {
  const nameOf = async () => (await store.profileByEmail("test@example.com"))?.person;
  it("accepts names in any one alphabet, with accents and emoji, and stores them in NFC form", async () => {
    expect((await join({ name: "José García" })).status).toBe(202); // decomposed accents
    expect(await nameOf()).toBe("José García".normalize("NFC"));
  });
  it("counts characters, not bytes or UTF-16 units: one emoji is not a full name", async () => {
    expect((await join({ name: "😀" })).status).toBe(400);
    expect((await join({ name: "李明" })).status).toBe(202); // two characters is a full name
  });
  it("refuses invisible and direction-changing characters, and lookalike letters from another alphabet", async () => {
    for (const name of ["Jordan‮A", "Jor​dan Avery", "Jоrdan Avery", "Jordan Αvery"]) { // RLO, zero-width space, Cyrillic о, Greek Α
      expect((await join({ name }, `198.51.100.${name.length}`)).status, JSON.stringify(name)).toBe(400);
    }
  });
});

describe("EDGE-5: the shared name rule (client and server)", () => {
  it("allows emoji, including joined emoji sequences, next to a real name", async () => {
    const { nameBlock } = await import("@/lib/rules");
    expect(nameBlock("Ana Silva 😀")).toBeNull();
    expect(nameBlock("Ana Silva 👨\u200d👩\u200d👧")).toBeNull(); // zero-width joiners inside an emoji sequence
    expect(nameBlock("Анна Петрова")).toBeNull(); expect(nameBlock("Ελένη Παππά")).toBeNull(); expect(nameBlock("محمد علي")).toBeNull();
  });
});
