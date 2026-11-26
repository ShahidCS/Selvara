import { beforeEach, describe, expect, it, vi } from "vitest";
import { COOKIE, handle, type Req, type Res } from "@/server/core";
import { MemoryAuth, MemoryStore } from "@/server/memory";
import { MemoryDirectory } from "@/server/directory";
import { MemoryPlatform } from "@/server/platform";
import { MemorySupport } from "@/server/support";
import { MemoryWsStore } from "@/server/ws/store";
import { MemoryFileStore } from "@/server/ws/files";
import type { Deps } from "@/server/types";
import { totpAt } from "@/lib/totp";
import { endOfLocalDay, exceptionStateOf, localDayOf, validTimeZone } from "@/lib/rulesWs";

/* EDGE-16 (owner's decision 2026-11-26): time is stored in UTC; "today" is each viewer's own day; a chosen expiry date ends at the end of that
   day where it was chosen, kept as a UTC instant. Synthetic people only. */
describe("EDGE-16: the time-zone helpers", () => {
  it("accept only real IANA zones", () => {
    expect(validTimeZone("America/Los_Angeles")).toBe("America/Los_Angeles"); expect(validTimeZone("Pacific/Kiritimati")).toBe("Pacific/Kiritimati");
    for (const bad of ["Not/AZone", "../../etc/passwd", "", "x".repeat(80), "UTC; drop table"]) expect(validTimeZone(bad), bad).toBeUndefined();
  });
  it("tell the viewer's day and when a day ends there, across daylight saving", () => {
    const at = Date.parse("2027-01-06T04:00:00Z"); // 20:00 on 5 January in Los Angeles, 18:00 on 6 January at UTC+14
    expect(localDayOf(at)).toBe("2027-01-06"); expect(localDayOf(at, "America/Los_Angeles")).toBe("2027-01-05"); expect(localDayOf(at, "Pacific/Kiritimati")).toBe("2027-01-06");
    expect(endOfLocalDay("2027-01-06", "America/Los_Angeles")).toBe(Date.parse("2027-01-07T08:00:00Z"));
    expect(endOfLocalDay("2027-01-06", "Pacific/Kiritimati")).toBe(Date.parse("2027-01-06T10:00:00Z"));
    expect(endOfLocalDay("2027-03-14", "America/New_York")).toBe(Date.parse("2027-03-15T04:00:00Z")); // the day clocks go forward (EDT)
    expect(endOfLocalDay("2027-11-07", "America/New_York")).toBe(Date.parse("2027-11-08T05:00:00Z")); // the day clocks go back (EST)
    expect(endOfLocalDay("2027-01-06")).toBe(Date.parse("2027-01-07T00:00:00Z")); // no zone: UTC
  });
  it("an exception with an instant expires exactly then; an older one still by its UTC date", () => {
    const end = endOfLocalDay("2027-01-06", "America/Los_Angeles");
    expect(exceptionStateOf("Approved", "2027-01-06", "2027-01-07", { now: end - 1, expiresAt: end })).toBe("Active");
    expect(exceptionStateOf("Approved", "2027-01-06", "2027-01-07", { now: end, expiresAt: end })).toBe("Expired");
    expect(exceptionStateOf("Approved", "2027-01-06", "2027-01-07")).toBe("Expired");
  });
});

const ORIGIN = "https://app.example.test"; const PW = "Lantern-orbit-Quince-71";
let clock = 0; let d: Deps; let auth: MemoryAuth; let store: MemoryStore; let dir: MemoryDirectory; let ACME = "";
const used = new Map<string, number>();
beforeEach(() => {
  clock = Date.parse("2027-01-05T20:00:00Z"); used.clear(); auth = new MemoryAuth(() => clock); store = new MemoryStore(() => clock); dir = new MemoryDirectory(store);
  const plat = new MemoryPlatform(store, dir); ACME = dir.addCompany("acme-eu", "Acme Test Co");
  d = { auth, store, dir, plat, sup: new MemorySupport(store, dir, plat), ws: new MemoryWsStore(store), files: new MemoryFileStore(), site: { origin: ORIGIN, rpId: "app.example.test" }, secret: "x".repeat(40), now: () => clock };
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
const call = (method: string, path: string, body: Record<string, unknown>, cookie?: string, tz?: string): Promise<Res> =>
  handle(d, { method, path: path.split("/").filter(Boolean), body, ip: "198.51.100.7", cookies: cookie ? { [COOKIE]: cookie } : {},
    headers: { origin: ORIGIN, "content-type": "application/json", "user-agent": "Mozilla/5.0 Chrome/140", ...(tz ? { "x-time-zone": tz } : {}) } } as Req);
async function member(email: string, role: string) {
  const id = await auth.createUser(email, PW, email.split("@")[0]); await auth.confirmUser(id);
  await store.insertProfile({ id, email, person: email.split("@")[0], status: "Active", requestedAt: clock }); dir.addMember(ACME, id, role);
  const st = await call("POST", "auth/sign-in", { email, password: PW });
  const s = auth.secretOf(email)!; const step = Math.floor(clock / 30_000); if ((used.get(email) ?? -1) >= step) clock = (step + 1) * 30_000 + 1_000; used.set(email, Math.floor(clock / 30_000));
  const v = await call("POST", "auth/sign-in/verify", { ticket: (st.body as { ticket: string }).ticket, code: await totpAt(s, clock) });
  return { id, cookie: v.cookies![0].match(new RegExp(`${COOKIE}=([^;]*)`))![1] };
}

describe("EDGE-16: on the server", () => {
  it("an expiry of 'tomorrow' for someone in Los Angeles at 20:00 is accepted, and ends at the end of that day there", async () => {
    clock = Date.parse("2027-01-06T04:00:00Z"); // 20:00 on 5 January in Los Angeles; already 6 January in UTC
    const jordan = await member("jordan@acme.example", "admin");
    const cid = ((await call("POST", "ws/controls", { title: "Quarterly access review", domain: "Identity & Access" }, jordan.cookie)).body as { id: string }).id;
    const ask = (tz?: string) => call("POST", `ws/controls/${cid}/exceptions`, { reason: "Vendor patch not yet released", compensating: "WAF rule blocks the exploit path for now", expires: "2027-01-06" }, jordan.cookie, tz);
    expect(await ask()).toEqual({ status: 400, body: { error: "The expiry must be in the future." } }); // no zone: UTC, where 6 January is today
    expect((await ask("America/Los_Angeles")).status).toBe(200); // in Los Angeles it is tomorrow
    const ctl = ((await call("GET", "ws/data/controls", {}, jordan.cookie)).body as { controls: { id: string; exceptions?: { expires: string; expiresAt?: number }[] }[] }).controls.find((c) => c.id === cid)!;
    expect(ctl.exceptions![0]).toEqual(expect.objectContaining({ expires: "2027-01-06", expiresAt: Date.parse("2027-01-07T08:00:00Z") }));
  });
  it("'Due today' counts from the viewer's own day, and a forged zone is ignored", async () => {
    clock = Date.parse("2027-01-05T12:00:00Z"); // 02:00 on 6 January at UTC+14
    const jordan = await member("jordan@acme.example", "admin");
    await call("POST", "ws/issues", { title: "Rotate the backup key", sev: "Medium", ownerId: jordan.id, due: "2027-01-06" }, jordan.cookie);
    const due = async (tz?: string) => ((await call("GET", "ws/data/issues", {}, jordan.cookie, tz)).body as { issues: { title: string; due: string }[] }).issues.find((i) => i.title === "Rotate the backup key")!.due;
    expect(await due("Pacific/Kiritimati")).toBe("Due today");
    expect(await due()).toBe("Due 1d");
    expect(await due("Not/AZone")).toBe("Due 1d");
  });
});
