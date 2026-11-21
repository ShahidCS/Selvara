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

/* Guided tours: each person's preference is kept on their account (GET/PUT me/tours) and is theirs alone. Synthetic people only. */
const ORIGIN = "https://app.example.test";
let clock = 1_800_000_000_000; let d: Deps; let auth: MemoryAuth; let store: MemoryStore; let dir: MemoryDirectory; let ACME = "";
const used = new Map<string, number>();
beforeEach(() => {
  clock = 1_800_000_000_000; used.clear(); auth = new MemoryAuth(() => clock); store = new MemoryStore(() => clock); dir = new MemoryDirectory(store);
  const plat = new MemoryPlatform(store, dir);
  ACME = dir.addCompany("acme-eu", "Acme Test Co");
  d = { auth, store, dir, plat, sup: new MemorySupport(store, dir, plat), ws: new MemoryWsStore(store), files: new MemoryFileStore(), site: { origin: ORIGIN, rpId: "app.example.test" }, secret: "x".repeat(40), now: () => clock };
});
const PW = "Lantern-orbit-Quince-71";
async function call(method: string, path: string, body: Record<string, unknown> = {}, cookies: Record<string, string> = {}, raw?: Uint8Array, ip = "198.51.100.7"): Promise<Res> {
  const r: Req = { method, path: path.split("/").filter(Boolean), body, ip, cookies, raw, headers: { origin: ORIGIN, "content-type": raw ? "application/octet-stream" : "application/json", "user-agent": "Mozilla/5.0 Chrome/140" } };
  return handle(d, r);
}
async function code(email: string) {
  const secret = auth.secretOf(email)!; const step = Math.floor(clock / 30_000);
  if ((used.get(email) ?? -1) >= step) clock = (step + 1) * 30_000 + 1_000;
  used.set(email, Math.floor(clock / 30_000)); return totpAt(secret, clock);
}
async function member(email: string, role: string, person: string) {
  const id = await auth.createUser(email, PW, person); await auth.confirmUser(id);
  await store.insertProfile({ id, email, person, status: "Active", requestedAt: clock }); dir.addMember(ACME, id, role);
  const st = await call("POST", "auth/sign-in", { email, password: PW });
  const v = await call("POST", "auth/sign-in/verify", { ticket: (st.body as { ticket: string }).ticket, code: await code(email) });
  return { id, c: { [COOKIE]: v.cookies![0].match(new RegExp(`${COOKIE}=([^;]*)`))![1] } };
}
describe("guided tour preference", () => {
  it("starts at first visit only, keeps progress per person, and refuses anything else", async () => {
    const a = await member("jordan@acme.example", "admin", "Jordan Avery");
    const b = await member("priya@acme.example", "employee", "Priya Nair");
    expect((await call("GET", "me/tours")).status).toBe(401);
    expect((await call("GET", "me/tours", {}, a.c)).body).toEqual({ freq: "first", seen: {} });
    expect((await call("PUT", "me/tours", { freq: "updates", seen: { frameworks: 2 } }, a.c)).status).toBe(200);
    expect((await call("PUT", "me/tours", { seen: { risk: 1 } }, a.c)).body).toEqual({ freq: "updates", seen: { frameworks: 2, risk: 1 } });
    expect((await call("GET", "me/tours", {}, b.c)).body).toEqual({ freq: "first", seen: {} }); // another person's progress is not shared
    expect((await call("PUT", "me/tours", { freq: "always" }, a.c)).status).toBe(400);
    expect((await call("PUT", "me/tours", { seen: { "../x": 1 } }, a.c)).status).toBe(400);
    expect((await call("PUT", "me/tours", { seen: { risk: 1.5 } }, a.c)).status).toBe(400);
    expect((await call("PUT", "me/tours", { seen: ["risk"] }, a.c)).status).toBe(400);
    expect((await call("PUT", "me/tours", { reset: true, freq: "off" }, a.c)).body).toEqual({ freq: "off", seen: {} });
    expect(store.auditLog.some((x) => /tour/i.test(x.action))).toBe(false); // a display preference, not a record
  });
});
