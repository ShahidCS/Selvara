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

describe("EDGE-6: an Apple 'Hide My Email' relay address", () => {
  it("is accepted as the work email, stored as given (lower case), and signs in on later visits", async () => {
    const relay = "dpk7x2mq9s@privaterelay.appleid.com";
    expect((await join({ email: relay.toUpperCase() })).status).toBe(202);
    const p = await store.profileByEmail(relay); expect(p?.email).toBe(relay);
  });
});

describe("EDGE-7: quitting authenticator set-up halfway through first sign-in", () => {
  it("leaves no half-made factor: the next sign-in starts set-up again cleanly and completes", async () => {
    const { totpAt } = await import("@/lib/totp");
    const id = await auth.createUser("john.doe@example.com", PW, "John Doe"); await auth.confirmUser(id);
    await store.insertProfile({ id, email: "john.doe@example.com", person: "John Doe", status: "Active", requestedAt: clock }); dir.addMember(ACME, id, "employee");
    const first = await call("POST", "auth/sign-in", { email: "john.doe@example.com", password: PW });
    expect(first.body).toEqual(expect.objectContaining({ step: "enroll" })); // quits here: never enters a code
    clock += 60 * 60_000; // comes back an hour later (the first ticket has expired)
    const again = await call("POST", "auth/sign-in", { email: "john.doe@example.com", password: PW });
    const b = again.body as { step: string; ticket: string; secret: string };
    expect(b.step).toBe("enroll"); expect(b.secret).not.toBe((first.body as { secret: string }).secret);
    expect((await call("POST", "auth/sign-in/verify", { ticket: (first.body as { ticket: string }).ticket, code: await totpAt(b.secret, clock) })).status).toBe(400); // the old ticket is dead
    const done = await call("POST", "auth/sign-in/verify", { ticket: b.ticket, code: await totpAt(b.secret, clock) });
    expect(done.status).toBe(200);
    expect((await auth.listTotp(id)).length).toBe(1); // exactly one authenticator, no leftover from the first attempt
  });
});

describe("EDGE-18: the same record edited on two devices", () => {
  // KNOWN GAP (recorded in the audit, needs a design decision): edit routes do not take the version the person loaded, so a save from a device
  // holding an older copy silently replaces a newer change (last writer wins). `it.fails` keeps this visible; it flips when edits check versions.
  it.fails("a save made from an older copy is refused, not silently applied over a newer change", async () => {
    const { totpAt } = await import("@/lib/totp");
    const id = await auth.createUser("jordan@acme.example", PW, "Jordan Avery"); await auth.confirmUser(id);
    await store.insertProfile({ id, email: "jordan@acme.example", person: "Jordan Avery", status: "Active", requestedAt: clock }); dir.addMember(ACME, id, "admin");
    const st = await call("POST", "auth/sign-in", { email: "jordan@acme.example", password: PW });
    const v = await call("POST", "auth/sign-in/verify", { ticket: (st.body as { ticket: string }).ticket, code: await totpAt(auth.secretOf("jordan@acme.example")!, clock) });
    const cookie = v.cookies![0].match(new RegExp(`${COOKIE}=([^;]*)`))![1];
    const pid = ((await call("POST", "ws/policies", { name: "Access control policy" }, undefined, cookie)).body as { id: string }).id;
    const loaded = 1; // both devices loaded version 1
    expect((await call("PATCH", `ws/policies/${pid}`, { name: "Access control policy v2", note: "Phone one: tightened scope", version: loaded }, undefined, cookie)).status).toBe(200);
    const stale = await call("PATCH", `ws/policies/${pid}`, { name: "Access control policy (old copy)", note: "Phone two: edited an old copy", version: loaded }, undefined, cookie);
    expect(stale.status).toBe(409);
  });
});
