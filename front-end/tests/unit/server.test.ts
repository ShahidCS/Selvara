import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COOKIE, NO_COMPANY, handle, type Req, type Res } from "@/server/core";
import { MemoryAuth, MemoryStore } from "@/server/memory";
import { MemoryDirectory } from "@/server/directory";
import { MemoryPlatform } from "@/server/platform";
import { sha256Hex } from "@/server/crypto";
import type { Deps } from "@/server/types";
import { totpAt } from "@/lib/totp";
import { toB64u } from "@/lib/webauthn";
import { safeMessage, upstream } from "@/server/errors";

/* The production auth API (src/server), run through `handle` exactly as /api does, against in-memory stand-ins for Supabase Auth and Postgres. */
const ORIGIN = "https://app.example.test";
let clock = 1_800_000_000_000; let d: Deps; let auth: MemoryAuth; let store: MemoryStore; let dir: MemoryDirectory; let plat: MemoryPlatform; let ACME = "";
beforeEach(() => {
  clock = 1_800_000_000_000; auth = new MemoryAuth(() => clock); used.clear(); store = new MemoryStore(() => clock); dir = new MemoryDirectory(store); plat = new MemoryPlatform(store, dir);
  ACME = dir.addCompany("acme-eu", "Acme Test Co");
  d = { auth, store, dir, plat, site: { origin: ORIGIN, rpId: "app.example.test" }, secret: "x".repeat(40), now: () => clock };
});
const PW = "Lantern-orbit-Quince-71"; const NEW = "Copper-harbour-Violet-58";
async function call(method: string, path: string, body: Record<string, unknown> = {}, o: { cookie?: string; ip?: string; origin?: string | null } = {}): Promise<Res> {
  const r: Req = { method, path: path.split("/").filter(Boolean), body, ip: o.ip ?? "198.51.100.7", cookies: o.cookie ? { [COOKIE]: o.cookie } : {},
    headers: { origin: o.origin === null ? undefined : o.origin ?? ORIGIN, "content-type": "application/json", "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/140" } };
  return handle(d, r);
}
const cookieOf = (res: Res) => res.cookies?.[0]?.match(new RegExp(`${COOKIE}=([^;]*)`))?.[1] || "";
const used = new Map<string, number>();
async function code(email: string): Promise<string> { // the next unused authenticator code: a person waits for the next 30-second step
  const secret = auth.secretOf(email)!; const step = Math.floor(clock / 30_000);
  if ((used.get(email) ?? -1) >= step) clock = (step + 1) * 30_000 + 1_000;
  used.set(email, Math.floor(clock / 30_000)); return totpAt(secret, clock);
}
/** An active account with an authenticator, signed in once; returns its session cookie and recovery codes. */
/** Company roles become an active membership of `company` (Acme by default); super and support become platform staff. */
async function account(email: string, role = "employee", person = "Alex Kim", company?: string) {
  const id = await auth.createUser(email, PW, person); await auth.confirmUser(id);
  await store.insertProfile({ id, email, person, status: "Active", requestedAt: clock });
  if (role === "super" || role === "support") dir.staff.set(id, role); else dir.addMember(company ?? ACME, id, role);
  const st = await call("POST", "auth/sign-in", { email, password: PW }); expect(st.body).toEqual(expect.objectContaining({ step: "enroll" }));
  const v = await call("POST", "auth/sign-in/verify", { ticket: (st.body as { ticket: string }).ticket, code: await code(email) });
  expect(v.status).toBe(200);
  return { id, cookie: cookieOf(v), codes: (v.body as { recoveryCodes: string[] }).recoveryCodes };
}
async function signIn(email: string, password = PW, ip?: string) {
  const st = await call("POST", "auth/sign-in", { email, password }, { ip }); if (st.status !== 200) return st;
  return call("POST", "auth/sign-in/verify", { ticket: (st.body as { ticket: string }).ticket, code: await code(email) }, { ip });
}

describe("request hygiene", () => {
  it("refuses cross-site and non-JSON writes; unknown routes are 404", async () => {
    expect((await call("POST", "auth/sign-in", {}, { origin: "https://evil.example" })).status).toBe(403);
    expect((await call("POST", "auth/sign-in", {}, { origin: null })).status).toBe(403);
    expect((await handle(d, { method: "POST", path: ["auth", "sign-in"], body: {}, ip: "1", cookies: {}, headers: { origin: ORIGIN, "content-type": "text/plain" } })).status).toBe(415);
    expect((await call("GET", "nope")).status).toBe(404);
  });
});

describe("sign-in with MFA", () => {
  it("adds an authenticator at the first sign-in, issues a Secure HttpOnly SameSite=Strict session cookie and 10 recovery codes", async () => {
    const a = await account("alex.kim@company.example");
    expect(a.codes.length).toBe(10);
    const s = await call("GET", "auth/session", {}, { cookie: a.cookie });
    expect(s.body).toEqual({ roleId: "employee", who: "Alex Kim", company: { ref: "acme-eu", name: "Acme Test Co" }, companies: [{ ref: "acme-eu", name: "Acme Test Co", role: "employee" }] });
    const res = await signIn("alex.kim@company.example"); expect(res.cookies![0]).toMatch(/HttpOnly; Secure; SameSite=Strict/);
    expect([...store.sessions.values()].every((x) => x.idHash.length === 64 && x.idHash !== a.cookie)).toBe(true); // only a hash is stored
    expect(JSON.stringify(store.recovery)).not.toContain(a.codes[0]);
  });
  it("gives the same answer for a wrong password and an unknown email", async () => {
    await account("alex.kim@company.example");
    const a = await call("POST", "auth/sign-in", { email: "alex.kim@company.example", password: "wrong-password" });
    const b = await call("POST", "auth/sign-in", { email: "nobody@company.example", password: "wrong-password" }, { ip: "198.51.100.8" });
    expect([a.status, a.body]).toEqual([401, { error: "Email or password is incorrect." }]); expect([b.status, b.body]).toEqual([401, { error: "Email or password is incorrect." }]);
  });
  it("a wrong code alerts the owner once and five end the attempt; a recovery code works once", async () => {
    const a = await account("alex.kim@company.example");
    const st = await call("POST", "auth/sign-in", { email: "alex.kim@company.example", password: PW }, { ip: "198.51.100.20" });
    const t = (st.body as { ticket: string }).ticket;
    for (let i = 0; i < 4; i++) expect((await call("POST", "auth/sign-in/verify", { ticket: t, code: "000000" }, { ip: "198.51.100.20" })).status).toBe(400);
    expect(store.notices.filter((n) => n.text.startsWith("Someone entered your correct password")).length).toBe(1);
    const fifth = await call("POST", "auth/sign-in/verify", { ticket: t, code: "000000" }, { ip: "198.51.100.20" }); expect([423, 400]).toContain(fifth.status);
    await store.kvDel("lock", "alex.kim@company.example");
    const st2 = await call("POST", "auth/sign-in", { email: "alex.kim@company.example", password: PW });
    const r1 = await call("POST", "auth/sign-in/verify", { ticket: (st2.body as { ticket: string }).ticket, code: a.codes[0], recovery: true });
    expect(r1.status).toBe(200); expect((r1.body as { recoveryLeft: number }).recoveryLeft).toBe(9);
    const st3 = await call("POST", "auth/sign-in", { email: "alex.kim@company.example", password: PW });
    expect((await call("POST", "auth/sign-in/verify", { ticket: (st3.body as { ticket: string }).ticket, code: a.codes[0], recovery: true })).status).toBe(400);
  });
  it("sessions end when idle (15 minutes for privileged roles, 30 otherwise), on sign-out, and the ticket is sealed", async () => {
    const a = await account("alex.kim@company.example");
    clock += 29 * 60_000; expect((await call("GET", "auth/session", {}, { cookie: a.cookie })).status).toBe(200);
    clock += 31 * 60_000; expect((await call("GET", "auth/session", {}, { cookie: a.cookie })).status).toBe(401);
    const adm = await account("jordan@company.example", "admin", "Jordan Avery");
    clock += 16 * 60_000; expect((await call("GET", "auth/session", {}, { cookie: adm.cookie })).status).toBe(401);
    const b = await signIn("alex.kim@company.example");
    expect((await call("POST", "auth/sign-out", {}, { cookie: cookieOf(b) })).cookies![0]).toMatch(/Max-Age=0/);
    expect((await call("GET", "auth/session", {}, { cookie: cookieOf(b) })).status).toBe(401);
    const raw = [...store.kv.entries()].filter(([k]) => k.startsWith("ticket|")).map(([, v]) => String(v.v));
    expect(raw.every((x) => !x.includes("access"))).toBe(true);
  });
});

describe("anti-automation", () => {
  it("locks the account per the company preset (custom bounds enforced by the server)", async () => {
    const adm = await account("jordan@company.example", "admin", "Jordan Avery");
    expect((await call("POST", "team/settings", { lockout: "custom", custom: { attempts: 2, minutes: 30 } }, { cookie: adm.cookie })).status).toBe(400);
    expect((await call("POST", "team/settings", { lockout: "custom", custom: { attempts: 3, minutes: 30 } }, { cookie: adm.cookie })).status).toBe(204);
    await account("alex.kim@company.example");
    for (let i = 0; i < 3; i++) await call("POST", "auth/sign-in", { email: "alex.kim@company.example", password: "nope" }, { ip: `198.51.100.${30 + i}` });
    expect((await call("POST", "auth/sign-in", { email: "alex.kim@company.example", password: PW }, { ip: "198.51.100.40" })).status).toBe(423);
    clock += 31 * 60_000;
    expect((await call("POST", "auth/sign-in", { email: "alex.kim@company.example", password: PW }, { ip: "198.51.100.41" })).status).toBe(200);
  });
  it("asks for the challenge after 3 failures from an address and blocks it after 10, for at most 24 hours", async () => {
    const ip = "198.51.100.99";
    for (let i = 0; i < 3; i++) expect((await call("POST", "auth/sign-in", { email: `x${i}@company.example`, password: "nope" }, { ip })).status).toBe(401);
    expect((await call("POST", "auth/sign-in", { email: "y@company.example", password: "nope" }, { ip })).status).toBe(428);
    const solve = async () => { const c = (await call("POST", "auth/challenge", {}, { ip })).body as { seed: string; digits: number }; let n = 0; while (!(await sha256Hex(`${c.seed}:${n}`)).startsWith("0".repeat(c.digits))) n++; return { seed: c.seed, nonce: n }; };
    let status = 0; for (let i = 3; i < 10; i++) status = (await call("POST", "auth/sign-in", { email: `x${i}@company.example`, password: "nope", challenge: await solve() }, { ip })).status;
    expect(status).toBe(403);
    expect(store.auditLog.some((e) => e.action === "auth.ip.blocked" && e.target === `${ip}: 5 minutes`)).toBe(true);
    const rec = await store.kvGet<{ level: number; until: number }>("ip", ip); expect(rec!.until - clock).toBe(5 * 60_000);
    // already at the top level with 9 recent failures: one more blocks it again, for 24 hours and never longer
    clock += 6 * 60_000; await store.kvSet("ip", ip, { ...rec!, level: 4, until: 0, fails: Array.from({ length: 9 }, () => clock) });
    await call("POST", "auth/sign-in", { email: "z@company.example", password: "nope", challenge: await solve() }, { ip });
    expect((await store.kvGet<{ until: number }>("ip", ip))!.until - clock).toBe(24 * 3_600_000);
  }, 30_000); // each proof-of-work answer takes a random number of hashes
});

describe("requests to join and reset", () => {
  it("a request is answered the same way, cannot sign in until an admin approves, and the admin cannot approve their own", async () => {
    expect((await call("POST", "auth/join-requests", { name: "Rae Fox", email: "rae.fox@company.example", password: PW, company: "acme-eu" })).status).toBe(202);
    expect((await call("POST", "auth/join-requests", { name: "Rae Fox", email: "rae.fox@company.example", password: PW, company: "acme-eu" })).status).toBe(202);
    expect((await call("POST", "auth/join-requests", { name: "Rae Fox", email: "rae.fox@company.example", password: "password1", company: "acme-eu" })).status).toBe(400);
    expect((await call("POST", "auth/sign-in", { email: "rae.fox@company.example", password: PW })).status).toBe(401);
    const emp = await account("alex.kim@company.example");
    const id = (await store.profileByEmail("rae.fox@company.example"))!.id;
    expect((await call("POST", `team/join-requests/${id}/approve`, { reason: "Joined the team this week" }, { cookie: emp.cookie })).status).toBe(403);
    const adm = await account("jordan@company.example", "admin", "Jordan Avery");
    expect((await call("GET", "team/join-requests", {}, { cookie: adm.cookie })).body).toEqual([expect.objectContaining({ email: "rae.fox@company.example" })]);
    expect((await call("POST", `team/join-requests/${id}/approve`, { reason: "short" }, { cookie: adm.cookie })).status).toBe(400);
    expect((await call("POST", `team/join-requests/${id}/approve`, { reason: "Joined the team this week" }, { cookie: adm.cookie })).status).toBe(200);
    expect(store.auditLog.some((e) => e.action === "team.join.approved" && e.actor === "Jordan Avery")).toBe(true);
    expect((await call("POST", "auth/sign-in", { email: "rae.fox@company.example", password: PW })).body).toEqual(expect.objectContaining({ step: "enroll" }));
  });
  it("reset: the emailed recovery session plus the second factor; single use; every session ends", async () => {
    const a = await account("alex.kim@company.example");
    expect((await call("POST", "auth/password/reset-request", { email: "alex.kim@company.example" })).status).toBe(202);
    expect((await call("POST", "auth/password/reset-request", { email: "nobody@company.example" })).status).toBe(202);
    const token = auth.outbox.at(-1)!.token;
    expect((await call("GET", `auth/password/reset/${token}`)).body).toEqual({ valid: true });
    expect((await call("POST", "auth/password/reset", { token, code: "000000", password: NEW })).status).toBe(400);
    expect((await call("POST", "auth/password/reset", { token, code: a.codes[1], password: NEW })).status).toBe(204);
    expect((await call("GET", "auth/session", {}, { cookie: a.cookie })).status).toBe(401);
    expect((await call("GET", `auth/password/reset/${token}`)).body).toEqual({ valid: false });
    expect((await signIn("alex.kim@company.example", PW)).status).toBe(401);
    expect((await signIn("alex.kim@company.example", NEW)).status).toBe(200);
  });
});

describe("account endpoints", () => {
  it("security view, re-authentication window for new codes, password change ends other sessions", async () => {
    const a = await account("alex.kim@company.example"); const b = await signIn("alex.kim@company.example");
    const v = (await call("GET", "me/security", {}, { cookie: a.cookie })).body as { sessions: unknown[]; mfa: { codesLeft: number } };
    expect(v.sessions.length).toBe(2); expect(v.mfa.codesLeft).toBe(10);
    clock += 6 * 60_000;
    expect((await call("POST", "me/recovery-codes", {}, { cookie: a.cookie })).status).toBe(403);
    expect((await call("POST", "me/reauth", { password: "nope" }, { cookie: a.cookie })).status).toBe(400);
    expect((await call("POST", "me/reauth", { password: PW }, { cookie: a.cookie })).status).toBe(204);
    expect(((await call("POST", "me/recovery-codes", {}, { cookie: a.cookie })).body as { codes: string[] }).codes.length).toBe(10);
    expect((await call("POST", "me/password", { current: PW, next: NEW }, { cookie: a.cookie })).status).toBe(204);
    expect((await call("GET", "auth/session", {}, { cookie: cookieOf(b) })).status).toBe(401);
    expect(store.auditLog.some((e) => e.action === "auth.password.changed")).toBe(true);
  });
  it("a platform super admin's second step is a passkey, verified by the server", async () => {
    const id = await auth.createUser("dana@platform.example", PW, "Dana Whitfield"); await auth.confirmUser(id);
    await store.insertProfile({ id, email: "dana@platform.example", person: "Dana Whitfield", status: "Active", requestedAt: clock }); dir.staff.set(id, "super");
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const spki = new Uint8Array(await crypto.subtle.exportKey("spki", kp.publicKey)); const kid = toB64u(crypto.getRandomValues(new Uint8Array(16)));
    const st = (await call("POST", "auth/sign-in", { email: "dana@platform.example", password: PW })).body as { step: string; ticket: string; challenge: string; register: boolean };
    expect(st.step).toBe("passkey"); expect(st.register).toBe(true);
    const cd = (type: string, challenge: string, origin = ORIGIN) => toB64u(new TextEncoder().encode(JSON.stringify({ type, challenge, origin })));
    expect((await call("POST", "auth/sign-in/passkey", { ticket: st.ticket, register: { id: kid, publicKey: toB64u(spki), clientDataJSON: cd("webauthn.create", st.challenge, "https://evil.example") } })).status).toBe(400);
    expect((await call("POST", "auth/sign-in/passkey", { ticket: st.ticket, register: { id: kid, publicKey: toB64u(spki), clientDataJSON: cd("webauthn.create", st.challenge) } })).status).toBe(200);
    const st2 = (await call("POST", "auth/sign-in", { email: "dana@platform.example", password: PW })).body as { ticket: string; challenge: string; register: boolean };
    expect(st2.register).toBe(false);
    const ad = new Uint8Array(37); ad.set(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("app.example.test")))); ad[32] = 0x05; ad[36] = 1;
    const cdj = cd("webauthn.get", st2.challenge); const cdb = Uint8Array.from(Buffer.from(cdj, "base64url"));
    const data = new Uint8Array(69); data.set(ad); data.set(new Uint8Array(await crypto.subtle.digest("SHA-256", cdb)), 37);
    const raw = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, kp.privateKey, data));
    const int = (v: Uint8Array) => { let i = 0; while (i < v.length - 1 && v[i] === 0) i++; v = v.slice(i); return v[0] & 0x80 ? Uint8Array.from([0, ...v]) : v; };
    const r = int(raw.slice(0, 32)), s2 = int(raw.slice(32)); const der = Uint8Array.from([0x30, r.length + s2.length + 4, 2, r.length, ...r, 2, s2.length, ...s2]);
    const res = await call("POST", "auth/sign-in/passkey", { ticket: st2.ticket, assertion: { id: kid, authenticatorData: toB64u(ad), clientDataJSON: cdj, signature: toB64u(der) } });
    expect(res.status).toBe(200); expect((res.body as { roleId: string }).roleId).toBe("super");
    expect((await call("POST", "auth/sign-in/verify", { ticket: st2.ticket, code: "123456" })).status).toBe(400); // no code path for super admins
    expect(store.auditLog.find((e) => e.action === "auth.signed_in" && e.actor === "Dana Whitfield")!.space).toBe("admin");
  });
});

describe("companies: sessions belong to one company, roles come from memberships (slice 2a)", () => {
  it("a person with no active membership cannot sign in, and a removed member's session ends at their next request", async () => {
    const id = await auth.createUser("lee@company.example", PW, "Lee Park"); await auth.confirmUser(id);
    await store.insertProfile({ id, email: "lee@company.example", person: "Lee Park", status: "Active", requestedAt: clock });
    expect(await call("POST", "auth/sign-in", { email: "lee@company.example", password: PW })).toEqual(expect.objectContaining({ status: 409, body: { error: NO_COMPANY } }));
    const a = await account("alex.kim@company.example");
    dir.memberships.find((m) => m.userId === a.id)!.status = "Removed";
    expect((await call("GET", "auth/session", {}, { cookie: a.cookie })).status).toBe(401);
    expect([...store.sessions.values()].find((x) => x.userId === a.id)!.revokedWhy).toBe("Access removed");
  });

  it("a company admin sees and decides only their own company's requests and members, and another company's person is not found", async () => {
    const GLOBEX = dir.addCompany("globex-uk", "Globex Test Ltd");
    expect((await call("POST", "auth/join-requests", { name: "Rae Fox", email: "rae.fox@company.example", password: PW, company: "acme-eu" })).status).toBe(202);
    const rae = (await store.profileByEmail("rae.fox@company.example"))!.id;
    await account("alex.kim@company.example");
    const acmeAdmin = await account("jordan@company.example", "admin", "Jordan Avery");
    const globexAdmin = await account("casey@globex.example", "admin", "Casey Morgan", GLOBEX);
    expect((await call("GET", "team/join-requests", {}, { cookie: globexAdmin.cookie })).body).toEqual([]);
    expect(((await call("GET", "team/members", {}, { cookie: globexAdmin.cookie })).body as { name: string }[]).map((m) => m.name)).toEqual(["Casey Morgan"]);
    expect((await call("POST", `team/join-requests/${rae}/approve`, { reason: "Joined the team this week" }, { cookie: globexAdmin.cookie })).status).toBe(404);
    expect(((await call("GET", "team/members", {}, { cookie: acmeAdmin.cookie })).body as { name: string; status: string }[]).map((m) => `${m.name}:${m.status}`))
      .toEqual(["Alex Kim:Active", "Jordan Avery:Active", "Rae Fox:Pending"]);
    expect((await call("POST", `team/join-requests/${rae}/reject`, { reason: "Not a member of our staff" }, { cookie: acmeAdmin.cookie })).status).toBe(200);
    expect((await call("POST", "auth/sign-in", { email: "rae.fox@company.example", password: PW })).status).toBe(401); // still unconfirmed
    const e = store.auditLog.find((x) => x.action === "team.join.rejected")!;
    expect([e.tenantId, e.actorId, e.space]).toEqual([ACME, acmeAdmin.id, "ws"]);
  });

  it("an unknown company code gets the same answer and creates nothing; platform staff cannot join a company", async () => {
    expect((await call("POST", "auth/join-requests", { name: "Rae Fox", email: "rae.fox@company.example", password: PW, company: "no-such-co" })).status).toBe(202);
    expect(await store.profileByEmail("rae.fox@company.example")).toBeNull();
    expect(auth.users.size).toBe(0);
    expect((await call("POST", "auth/join-requests", { name: "Rae Fox", email: "rae.fox@company.example", password: PW })).status).toBe(400);
    const staff = await auth.createUser("sam@platform.example", PW, "Sam Hayes"); await auth.confirmUser(staff); dir.staff.set(staff, "support");
    await store.insertProfile({ id: staff, email: "sam@platform.example", person: "Sam Hayes", status: "Active", requestedAt: clock });
    expect((await call("POST", "auth/join-requests", { name: "Sam Hayes", email: "sam@platform.example", password: NEW, company: "acme-eu" })).status).toBe(202);
    expect(dir.memberships.some((m) => m.userId === staff)).toBe(false);
  });

  it("a member of two companies works in one at a time, switches with a fresh membership check, and keeps their password when joining another", async () => {
    const GLOBEX = dir.addCompany("globex-uk", "Globex Test Ltd");
    const a = await account("alex.kim@company.example", "admin");
    expect((await call("POST", "auth/join-requests", { name: "Alex Kim", email: "alex.kim@company.example", password: NEW, company: "globex-uk" })).status).toBe(202);
    expect(dir.memberships.find((m) => m.tenantId === GLOBEX && m.userId === a.id)!.status).toBe("Pending");
    expect((await call("POST", "auth/company", { company: "globex-uk" }, { cookie: a.cookie })).status).toBe(404); // pending is not a member yet
    dir.memberships.find((m) => m.tenantId === GLOBEX && m.userId === a.id)!.status = "Active";
    const sw = await call("POST", "auth/company", { company: "globex-uk" }, { cookie: a.cookie });
    expect(sw.body).toEqual({ roleId: "employee", company: { ref: "globex-uk", name: "Globex Test Ltd" } });
    expect((await call("GET", "team/members", {}, { cookie: a.cookie })).status).toBe(403); // an employee in Globex, though an admin in Acme
    expect((await call("GET", "team/settings", {}, { cookie: a.cookie })).status).toBe(403);
    expect(store.auditLog.find((x) => x.action === "auth.company.switched")!.tenantId).toBe(GLOBEX);
    expect((await signIn("alex.kim@company.example", NEW)).status).toBe(401); // the join request did not change the password
    const again = await signIn("alex.kim@company.example");
    expect((again.body as { company: { ref: string } }).company.ref).toBe("globex-uk"); // the company used last
  });

  it("lockout settings are per company, and a person gets the strictest of their companies", async () => {
    const GLOBEX = dir.addCompany("globex-uk", "Globex Test Ltd");
    const globexAdmin = await account("casey@globex.example", "admin", "Casey Morgan", GLOBEX);
    expect((await call("POST", "team/settings", { lockout: "custom", custom: { attempts: 3, minutes: 60 } }, { cookie: globexAdmin.cookie })).status).toBe(204);
    expect(dir.lockouts.get(ACME)).toBeUndefined();
    expect((await call("GET", "team/settings", {}, { cookie: globexAdmin.cookie })).body).toEqual({ lockout: { preset: "custom", custom: { attempts: 3, minutes: 60 } } });
    await account("alex.kim@company.example"); // Acme only: the standard preset (more than 3 attempts)
    for (let i = 0; i < 3; i++) await call("POST", "auth/sign-in", { email: "alex.kim@company.example", password: "nope" }, { ip: `198.51.100.${60 + i}` });
    expect((await call("POST", "auth/sign-in", { email: "alex.kim@company.example", password: PW }, { ip: "198.51.100.70" })).status).toBe(428); // not locked: only the challenge
    await store.kvDel("lock", "alex.kim@company.example");
    dir.addMember(GLOBEX, (await store.profileByEmail("alex.kim@company.example"))!.id, "viewer"); // now also in Globex: 3 attempts apply
    for (let i = 0; i < 3; i++) await call("POST", "auth/sign-in", { email: "alex.kim@company.example", password: "nope" }, { ip: `198.51.100.${80 + i}` });
    expect((await call("POST", "auth/sign-in", { email: "alex.kim@company.example", password: PW }, { ip: "198.51.100.90" })).status).toBe(423);
    expect(store.auditLog.find((x) => x.action === "team.lockout.changed")).toEqual(expect.objectContaining({ tenantId: GLOBEX, target: "custom: 3 attempts, 60 minutes" }));
  });
});

describe("role changes, invitations and four-eyes requests (slice 2c)", () => {
  const roleOf = (id: string, t = ACME) => dir.memberships.find((m) => m.tenantId === t && m.userId === id)?.role;
  const list = async (cookie: string) => (await call("GET", "team/approvals", {}, { cookie })).body as { id: string; status: string; block: string | null; mine: boolean; title: string }[];

  it("employee-level roles change at once; nobody changes their own; another company's member is not found; only known roles", async () => {
    const GLOBEX = dir.addCompany("globex-uk", "Globex Test Ltd");
    const admin = await account("jordan@company.example", "admin", "Jordan Avery");
    const alex = await account("alex.kim@company.example");
    const casey = await account("casey@globex.example", "employee", "Casey Morgan", GLOBEX);
    expect((await call("POST", `team/members/${alex.id}/role`, { role: "analyst" }, { cookie: admin.cookie })).body).toEqual({ pending: false });
    expect(roleOf(alex.id)).toBe("analyst");
    expect(store.auditLog.find((x) => x.action === "member.role.changed")).toEqual(expect.objectContaining({ tenantId: ACME, actorId: admin.id, target: "Alex Kim: employee → analyst" }));
    expect((await call("POST", `team/members/${admin.id}/role`, { role: "employee" }, { cookie: admin.cookie })).status).toBe(403);
    expect((await call("POST", `team/members/${alex.id}/role`, { role: "super" }, { cookie: admin.cookie })).status).toBe(400);
    expect((await call("POST", `team/members/${alex.id}/role`, { role: "analyst" }, { cookie: admin.cookie })).status).toBe(409);
    expect((await call("POST", `team/members/${casey.id}/role`, { role: "analyst" }, { cookie: admin.cookie })).status).toBe(404);
    expect((await call("POST", `team/members/${admin.id}/role`, { role: "admin" }, { cookie: alex.cookie })).status).toBe(403); // not an admin
  });

  it("granting admin or owner needs a second admin: never the requester or the member, and the change applies only on approval", async () => {
    const jordan = await account("jordan@company.example", "admin", "Jordan Avery");
    const alex = await account("alex.kim@company.example");
    expect((await call("POST", `team/members/${alex.id}/role`, { role: "owner" }, { cookie: jordan.cookie })).body).toEqual({ error: "No eligible second admin (not you, not the member) to approve this." });
    const casey = await account("casey@company.example", "admin", "Casey Morgan");
    const req = await call("POST", `team/members/${alex.id}/role`, { role: "owner" }, { cookie: jordan.cookie });
    expect(req.status).toBe(202); const id = (req.body as { id: string }).id;
    expect(roleOf(alex.id)).toBe("employee"); // nothing changes on request
    expect((await call("POST", `team/members/${alex.id}/role`, { role: "analyst" }, { cookie: jordan.cookie })).body).toEqual({ error: "A role change is already pending for this person." });
    const mine = (await list(jordan.cookie)).find((x) => x.id === id)!;
    expect([mine.mine, mine.block]).toEqual([true, "Segregation of duties: you cannot approve your own request."]);
    expect((await call("POST", `team/approvals/${id}/approve`, { reason: "Owner of the ISMS from now on" }, { cookie: jordan.cookie })).status).toBe(403);
    expect((await call("POST", `team/approvals/${id}/approve`, { reason: "short" }, { cookie: casey.cookie })).status).toBe(400);
    expect((await list(casey.cookie)).find((x) => x.id === id)!.block).toBeNull();
    expect((await call("POST", `team/approvals/${id}/approve`, { reason: "Owner of the ISMS from now on" }, { cookie: casey.cookie })).body).toEqual({ status: "Approved" });
    expect(roleOf(alex.id)).toBe("owner");
    expect(store.auditLog.find((x) => x.action === "member.role.changed")!.target).toBe("Alex Kim: employee → owner; requested by Jordan Avery, approved by Casey Morgan");
    expect((await call("POST", `team/approvals/${id}/reject`, { reason: "Changed my mind about this" }, { cookie: casey.cookie })).status).toBe(409);
  });

  it("the subject cannot approve their own grant; only the requester withdraws; an expired request cannot be decided", async () => {
    const jordan = await account("jordan@company.example", "admin", "Jordan Avery");
    const casey = await account("casey@company.example", "admin", "Casey Morgan");
    const alex = await account("alex.kim@company.example");
    await account("riley@company.example", "admin", "Riley Quinn");
    const id = ((await call("POST", `team/members/${alex.id}/role`, { role: "admin" }, { cookie: jordan.cookie })).body as { id: string }).id;
    expect((await call("POST", `team/approvals/${id}/withdraw`, {}, { cookie: casey.cookie })).status).toBe(403);
    expect((await call("POST", `team/approvals/${id}/withdraw`, {}, { cookie: jordan.cookie })).body).toEqual({ status: "Withdrawn" });
    // a request about Casey herself: Casey may not approve it
    const own = ((await call("POST", `team/members/${casey.id}/role`, { role: "owner" }, { cookie: jordan.cookie })).body as { id: string }).id;
    expect((await call("POST", `team/approvals/${own}/approve`, { reason: "I agree with this change" }, { cookie: casey.cookie })).body).toEqual({ error: "Segregation of duties: you are the subject or owner of this request." });
    clock += 73 * 3600_000;
    const riley = await signIn("riley@company.example"); const rc = cookieOf(riley);
    expect((await list(rc)).find((x) => x.id === own)!.status).toBe("Expired");
    expect((await call("POST", `team/approvals/${own}/approve`, { reason: "Late but still agree" }, { cookie: rc })).body).toEqual({ error: "Request has expired." });
    expect(roleOf(casey.id)).toBe("admin");
    expect(store.auditLog.some((x) => x.action === "approval.team-role.expired")).toBe(true);
  });

  it("an invitation link admits the invited email once, with the invited role, and confirms a new account", async () => {
    const jordan = await account("jordan@company.example", "admin", "Jordan Avery");
    const res = await call("POST", "team/invitations", { email: "Rae.Fox@company.example", role: "analyst" }, { cookie: jordan.cookie });
    expect(res.status).toBe(200);
    const { link } = res.body as { link: string }; const token = link.split("#invite=")[1];
    expect(link.startsWith(`${ORIGIN}/login#invite=`)).toBe(true);
    expect(JSON.stringify(dir.invites)).not.toContain(token); // only the hash is stored
    expect((await call("POST", "team/invitations", { email: "rae.fox@company.example", role: "employee" }, { cookie: jordan.cookie })).status).toBe(409);
    // another email with the right link: nothing
    expect((await call("POST", "auth/join-requests", { name: "Mallory Test", email: "mallory@company.example", password: PW, invite: token })).status).toBe(202);
    expect(await store.profileByEmail("mallory@company.example")).toBeNull();
    expect((await call("POST", "auth/join-requests", { name: "Rae Fox", email: "rae.fox@company.example", password: PW, invite: token })).status).toBe(202);
    const rae = (await store.profileByEmail("rae.fox@company.example"))!;
    expect([rae.status, roleOf(rae.id)]).toEqual(["Active", "analyst"]);
    expect(((await call("POST", "auth/sign-in", { email: "rae.fox@company.example", password: PW })).body as { step: string }).step).toBe("enroll");
    expect(((await call("GET", "team/invitations", {}, { cookie: jordan.cookie })).body as { status: string }[])[0].status).toBe("Accepted");
    // used once
    expect((await call("POST", "auth/join-requests", { name: "Rae Fox", email: "rae.fox@company.example", password: NEW, invite: token })).status).toBe(202);
    expect((await signIn("rae.fox@company.example", NEW)).status).toBe(401);
    expect(store.auditLog.find((x) => x.action === "member.invitation.accepted")).toEqual(expect.objectContaining({ tenantId: ACME, actorId: rae.id }));
  });

  it("a new link replaces the old one, a revoked or expired invitation admits nobody, and an existing account must prove its password", async () => {
    const GLOBEX = dir.addCompany("globex-uk", "Globex Test Ltd");
    const jordan = await account("jordan@company.example", "admin", "Jordan Avery");
    const old = ((await call("POST", "team/invitations", { email: "casey@globex.example", role: "auditor" }, { cookie: jordan.cookie })).body as { link: string; id: string });
    const fresh = (await call("POST", `team/invitations/${old.id}/link`, {}, { cookie: jordan.cookie })).body as { link: string };
    await account("casey@globex.example", "employee", "Casey Morgan", GLOBEX);
    const casey = (await store.profileByEmail("casey@globex.example"))!.id;
    expect((await call("POST", "auth/join-requests", { name: "Casey Morgan", email: "casey@globex.example", password: PW, invite: old.link.split("#invite=")[1] }, { ip: "203.0.113.1" })).status).toBe(202);
    expect(roleOf(casey)).toBeUndefined(); // the replaced link
    expect((await call("POST", "auth/join-requests", { name: "Casey Morgan", email: "casey@globex.example", password: NEW, invite: fresh.link.split("#invite=")[1] }, { ip: "203.0.113.2" })).status).toBe(202);
    expect(roleOf(casey)).toBeUndefined(); // wrong password for the existing account
    expect((await call("POST", "auth/join-requests", { name: "Casey Morgan", email: "casey@globex.example", password: PW, invite: fresh.link.split("#invite=")[1] }, { ip: "203.0.113.3" })).status).toBe(202);
    expect([roleOf(casey), roleOf(casey, GLOBEX)]).toEqual(["auditor", "employee"]);
    const other = ((await call("POST", "team/invitations", { email: "lee@company.example", role: "employee" }, { cookie: jordan.cookie })).body as { link: string; id: string });
    expect((await call("POST", `team/invitations/${other.id}/revoke`, {}, { cookie: jordan.cookie })).status).toBe(204);
    expect((await call("POST", "auth/join-requests", { name: "Lee Park", email: "lee@company.example", password: PW, invite: other.link.split("#invite=")[1] }, { ip: "203.0.113.4" })).status).toBe(202);
    expect(await store.profileByEmail("lee@company.example")).toBeNull();
    const late = ((await call("POST", "team/invitations", { email: "kim@company.example", role: "employee" }, { cookie: jordan.cookie })).body as { link: string });
    clock += 73 * 3600_000;
    expect((await call("POST", "auth/join-requests", { name: "Kim Lee", email: "kim@company.example", password: PW, invite: late.link.split("#invite=")[1] }, { ip: "203.0.113.5" })).status).toBe(202);
    expect(await store.profileByEmail("kim@company.example")).toBeNull();
  });

  it("an admin invitation exists only after a second admin approves it; then an admin creates its link", async () => {
    const jordan = await account("jordan@company.example", "admin", "Jordan Avery");
    const casey = await account("casey@company.example", "admin", "Casey Morgan");
    const req = await call("POST", "team/invitations", { email: "pat@company.example", role: "admin" }, { cookie: jordan.cookie });
    expect([req.status, (req.body as { pending: boolean }).pending]).toEqual([202, true]);
    expect(dir.invites.length).toBe(0);
    expect((await call("POST", "team/invitations", { email: "pat@company.example", role: "employee" }, { cookie: casey.cookie })).status).toBe(409);
    expect((await call("POST", `team/approvals/${(req.body as { id: string }).id}/approve`, { reason: "Pat leads security operations" }, { cookie: casey.cookie })).body).toEqual({ status: "Approved" });
    const inv = ((await call("GET", "team/invitations", {}, { cookie: jordan.cookie })).body as { id: string; linkAt?: number; role: string }[])[0];
    expect([inv.role, inv.linkAt]).toEqual(["admin", undefined]);
    const { link } = (await call("POST", `team/invitations/${inv.id}/link`, {}, { cookie: jordan.cookie })).body as { link: string };
    await call("POST", "auth/join-requests", { name: "Pat Lane", email: "pat@company.example", password: PW, invite: link.split("#invite=")[1] });
    expect(roleOf((await store.profileByEmail("pat@company.example"))!.id)).toBe("admin");
  });

  it("names with markup are refused", async () => {
    expect((await call("POST", "auth/join-requests", { name: "<jordan>", email: "x@company.example", password: PW, company: "acme-eu" })).body).toEqual({ error: "Enter your name without symbols such as < > { } or quotes." });
  });
});

describe("Admin Console (slice 3a): elevation, companies through four-eyes, platform audit log", () => {
  /** A platform super admin signed in with a newly registered passkey (the first sign-in registers it and signs in). */
  async function superAdmin(email: string, person: string) {
    const id = await auth.createUser(email, PW, person); await auth.confirmUser(id);
    await store.insertProfile({ id, email, person, status: "Active", requestedAt: clock }); dir.staff.set(id, "super");
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const spki = new Uint8Array(await crypto.subtle.exportKey("spki", kp.publicKey));
    const st = (await call("POST", "auth/sign-in", { email, password: PW })).body as { ticket: string; challenge: string };
    const cd = toB64u(new TextEncoder().encode(JSON.stringify({ type: "webauthn.create", challenge: st.challenge, origin: ORIGIN })));
    const res = await call("POST", "auth/sign-in/passkey", { ticket: st.ticket, register: { id: toB64u(crypto.getRandomValues(new Uint8Array(16))), publicKey: toB64u(spki), clientDataJSON: cd } });
    expect(res.status).toBe(200); return { id, cookie: cookieOf(res) };
  }
  const elevate = (cookie: string, minutes = 30) => call("POST", "admin/elevation", { reason: "Customer onboarding for a new contract", ticket: "OPS-101", minutes }, { cookie });
  const requests = async (cookie: string) => (await call("GET", "admin/approvals", {}, { cookie })).body as { id: string; status: string; block: string | null; mine: boolean }[];

  it("only platform staff reach the Admin Console; support reads but never elevates or changes; changes need a live elevation", async () => {
    const admin = await account("jordan@company.example", "admin", "Jordan Avery");
    const sam = await account("sam@platform.example", "support", "Sam Hayes");
    const dana = await superAdmin("dana@platform.example", "Dana Whitfield");
    expect((await call("GET", "admin/companies", {}, { cookie: admin.cookie })).status).toBe(403);
    expect(((await call("GET", "admin/companies", {}, { cookie: sam.cookie })).body as { ref: string }[]).map((c) => c.ref)).toEqual(["acme-eu"]);
    expect((await elevate(sam.cookie)).status).toBe(403);
    expect((await call("POST", "admin/companies", { ref: "globex-uk", name: "Globex Test Ltd", adminEmail: "casey@globex.example" }, { cookie: sam.cookie })).status).toBe(403);
    expect((await call("POST", "admin/companies", { ref: "globex-uk", name: "Globex Test Ltd", adminEmail: "casey@globex.example" }, { cookie: dana.cookie })).body).toEqual({ error: "Elevate to make changes." });
    expect((await call("POST", "admin/elevation", { reason: "short", ticket: "OPS-101", minutes: 30 }, { cookie: dana.cookie })).status).toBe(400);
    expect((await call("POST", "admin/elevation", { reason: "Customer onboarding for a new contract", ticket: "ops 1", minutes: 30 }, { cookie: dana.cookie })).status).toBe(400);
    expect((await elevate(dana.cookie, 61)).status).toBe(400);
    expect((await elevate(dana.cookie, 15)).status).toBe(200);
    expect((await elevate(dana.cookie)).status).toBe(409); // one at a time
    expect(((await call("GET", "admin/elevation", {}, { cookie: dana.cookie })).body as { elevation: { ticket: string } }).elevation.ticket).toBe("OPS-101");
    clock += 15 * 60_000 + 1; // runs out by itself (the session's idle limit is 15 minutes too, so sign in again)
    const st = await call("POST", "auth/sign-in", { email: "dana@platform.example", password: PW }); expect(st.status).toBe(200);
    expect(((await call("GET", "admin/elevation", {}, { cookie: dana.cookie })).status)).toBe(401);
    expect(await plat.elevation(dana.id, clock)).toBeNull();
    const e = store.auditLog.find((x) => x.action === "platform.elevation.started")!;
    expect([e.space, e.tenantId, e.actorId, e.target]).toEqual(["admin", null, dana.id, "15 minutes; ticket OPS-101; reason: Customer onboarding for a new contract"]);
  });

  it("a company is created only when a second super admin approves; its first admin joins with a link from the platform", async () => {
    const dana = await superAdmin("dana@platform.example", "Dana Whitfield");
    await elevate(dana.cookie);
    const body = { ref: "globex-uk", name: "Globex Test Ltd", adminEmail: "Casey@Globex.example" };
    expect((await call("POST", "admin/companies", body, { cookie: dana.cookie })).body).toEqual({ error: "No other platform super admin can approve this. Add a second one first (docs/guides/SUPABASE.md section 5)." });
    const riley = await superAdmin("riley@platform.example", "Riley Quinn");
    expect((await call("POST", "admin/companies", { ...body, ref: "acme-eu" }, { cookie: dana.cookie })).status).toBe(409); // code taken
    expect((await call("POST", "admin/companies", { ...body, name: "<b>x</b>" }, { cookie: dana.cookie })).status).toBe(400);
    const req = await call("POST", "admin/companies", body, { cookie: dana.cookie }); expect(req.status).toBe(202);
    const id = (req.body as { id: string }).id;
    expect([...dir.companies.values()].some((c) => c.ref === "globex-uk")).toBe(false); // nothing until approved
    expect((await requests(dana.cookie)).find((x) => x.id === id)!.block).toBe("Segregation of duties: you cannot approve your own request.");
    expect((await call("POST", `admin/approvals/${id}/approve`, { reason: "Contract signed on 2026-11-18" }, { cookie: dana.cookie })).status).toBe(403);
    expect((await requests(riley.cookie)).find((x) => x.id === id)!.block).toBe("Elevate to make changes.");
    expect((await call("POST", `admin/approvals/${id}/approve`, { reason: "Contract signed on 2026-11-18" }, { cookie: riley.cookie })).status).toBe(403); // not elevated
    await elevate(riley.cookie);
    expect((await call("POST", `admin/approvals/${id}/approve`, { reason: "Contract signed on 2026-11-18" }, { cookie: riley.cookie })).body).toEqual({ status: "Approved" });
    const globex = [...dir.companies.values()].find((c) => c.ref === "globex-uk")!;
    expect(dir.invites.find((i) => i.tenantId === globex.id)).toEqual(expect.objectContaining({ email: "casey@globex.example", role: "admin", status: "Pending", tokenHash: null }));
    expect(store.auditLog.find((x) => x.action === "platform.company.created")).toEqual(expect.objectContaining({ space: "admin", tenantId: null, actorId: riley.id }));
    expect(store.auditLog.find((x) => x.action === "tenant.created")!.tenantId).toBe(globex.id); // the customer's own log shows it too
    const link = (await call("POST", "admin/companies/globex-uk/admin-link", {}, { cookie: dana.cookie })).body as { link: string; email: string };
    expect(link.email).toBe("casey@globex.example");
    await call("POST", "auth/join-requests", { name: "Casey Morgan", email: "casey@globex.example", password: PW, invite: link.link.split("#invite=")[1] });
    const casey = (await store.profileByEmail("casey@globex.example"))!;
    expect(dir.memberships.find((m) => m.tenantId === globex.id && m.userId === casey.id)).toEqual(expect.objectContaining({ role: "admin", status: "Active" }));
    expect((await call("POST", "admin/companies/globex-uk/admin-link", {}, { cookie: dana.cookie })).status).toBe(409); // used
  });

  it("suspending a company (four-eyes, with a reason) ends its members' access at their next request; reactivating restores it", async () => {
    const member = await account("alex.kim@company.example");
    const dana = await superAdmin("dana@platform.example", "Dana Whitfield"); const riley = await superAdmin("riley@platform.example", "Riley Quinn");
    await elevate(dana.cookie); await elevate(riley.cookie);
    expect((await call("POST", "admin/companies/acme-eu/suspend", { reason: "short" }, { cookie: dana.cookie })).status).toBe(400);
    const id = ((await call("POST", "admin/companies/acme-eu/suspend", { reason: "Unpaid invoices for three months" }, { cookie: dana.cookie })).body as { id: string }).id;
    expect((await call("POST", "admin/companies/acme-eu/suspend", { reason: "Unpaid invoices for three months" }, { cookie: riley.cookie })).status).toBe(409); // already requested
    expect((await call("GET", "auth/session", {}, { cookie: member.cookie })).status).toBe(200); // not yet
    expect((await call("POST", `admin/approvals/${id}/approve`, { reason: "Confirmed with finance today" }, { cookie: riley.cookie })).body).toEqual({ status: "Approved" });
    expect(dir.companies.get(ACME)!.status).toBe("Suspended");
    expect((await call("GET", "auth/session", {}, { cookie: member.cookie })).status).toBe(401);
    expect((await call("POST", "auth/sign-in", { email: "alex.kim@company.example", password: PW })).body).toEqual({ error: NO_COMPANY });
    expect(store.auditLog.find((x) => x.action === "tenant.suspended")).toEqual(expect.objectContaining({ tenantId: ACME, target: "acme-eu; reason: Unpaid invoices for three months" }));
    const back = ((await call("POST", "admin/companies/acme-eu/reactivate", { reason: "Invoices paid in full now" }, { cookie: riley.cookie })).body as { id: string }).id;
    expect((await call("POST", `admin/approvals/${back}/reject`, { reason: "Wait for the bank transfer" }, { cookie: riley.cookie })).status).toBe(403); // own request
    expect((await call("POST", `admin/approvals/${back}/approve`, { reason: "Payment received and checked" }, { cookie: dana.cookie })).body).toEqual({ status: "Approved" });
    expect((await signIn("alex.kim@company.example")).status).toBe(200);
  });

  it("the platform audit log lists only platform entries, newest first, for platform staff only", async () => {
    const admin = await account("jordan@company.example", "admin", "Jordan Avery");
    const dana = await superAdmin("dana@platform.example", "Dana Whitfield"); await elevate(dana.cookie);
    await call("POST", "admin/elevation/end", {}, { cookie: dana.cookie });
    const res = (await call("GET", "admin/audit", {}, { cookie: dana.cookie })).body as { entries: { action: string }[]; verified: boolean };
    expect(res.verified).toBe(true);
    expect(res.entries.slice(0, 2).map((x) => x.action)).toEqual(["platform.elevation.ended", "platform.elevation.started"]);
    expect(res.entries.some((x) => x.action === "auth.signed_in")).toBe(true);
    expect(res.entries.every((x) => !("tenantId" in x))).toBe(true);
    expect(store.auditLog.filter((x) => x.tenantId === ACME).length).toBeGreaterThan(0); // company entries exist, but are not listed
    expect(res.entries.length).toBe(store.auditLog.filter((x) => !x.tenantId).length);
    expect((await call("GET", "admin/audit", {}, { cookie: admin.cookie })).status).toBe(403);
  });
});

describe("failure logging (a 500 can be diagnosed from the function logs, without leaking values)", () => {
  afterEach(() => vi.restoreAllMocks());
  const logged = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => JSON.parse(String(c[0])) as Record<string, unknown>);

  it("logs the route, the failing step and Supabase's code and status, and the person still sees a generic message", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    store.kvSet = async () => { throw upstream("db.kv", { code: "42501", message: 'permission denied for table kv' }, 403); };
    const r: Req = { method: "POST", path: ["auth", "challenge"], body: {}, ip: "198.51.100.7", cookies: {}, headers: { origin: ORIGIN, "content-type": "application/json", "x-vercel-id": "fra1::abc-123" } };
    const res = await handle(d, r);
    expect(res).toEqual(expect.objectContaining({ status: 500, body: { error: "Something went wrong. Please try again." } }));
    expect(logged(spy)).toEqual([{ level: "error", event: "api.error", route: "POST auth/challenge", step: "db.kv", code: "42501", status: 403, message: "permission denied for table kv", requestId: "fra1::abc-123" }]);
  });

  it("logs the route pattern, never the real path, so an identifier in the URL stays out of the logs", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    store.sessionByHash = async () => { throw upstream("db.sessions", { code: "PGRST205", message: "Could not find the table 'public.sessions' in the schema cache" }, 404); };
    const id = "pk_" + "Q".repeat(40);
    expect((await call("DELETE", `me/passkeys/${id}`, {}, { cookie: "c".repeat(43) })).status).toBe(500);
    const out = JSON.stringify(logged(spy));
    expect(out).toContain('"route":"DELETE me/passkeys/:id"');
    expect(out).toContain('"code":"PGRST205"');
    expect(out).not.toContain(id);
    expect(out).not.toContain("c".repeat(43));
  });

  it("removes values Postgres quotes back, email addresses and anything shaped like a key or token", () => {
    expect(safeMessage('invalid input syntax for type uuid: "alex.kim@example.test"')).toBe('invalid input syntax for type uuid: "[redacted]"');
    expect(safeMessage("User alex.kim@example.test already registered")).toBe("User [email] already registered");
    expect(safeMessage("bad key sb_secret_AbCdEf123 and eyJhbGciOiJIUzI1NiJ9.e30.sig")).toBe("bad key [token] and [token]");
    expect(safeMessage("x".repeat(500))!.length).toBeLessThanOrEqual(160);
    expect(upstream("auth.create-user", { code: "email_exists", status: 422, message: "A user with this email address has already been registered" })).toEqual(expect.objectContaining({ step: "auth.create-user", code: "email_exists", status: 422 }));
  });

  it("an unexpected bug is logged as internal with its type, not its data", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    store.kvSet = async () => { throw new TypeError("Cannot read properties of undefined (reading 'x')"); };
    await call("POST", "auth/challenge");
    expect(logged(spy)[0]).toEqual(expect.objectContaining({ route: "POST auth/challenge", step: "internal", message: "TypeError: Cannot read properties of undefined (reading 'x')" }));
  });
});

describe("database readiness (GET /api/system/ready)", () => {
  afterEach(() => vi.restoreAllMocks());
  it("is 503 when the database is not configured, and does not need a session", async () => {
    expect(await call("GET", "system/ready")).toEqual(expect.objectContaining({ status: 503, body: { error: "The database is not configured." } }));
  });
  it("is 200 when the schema is current, and 503 with the reason only in the log when it is not", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    d.db = { ensureSchema: async () => {} } as unknown as Deps["db"];
    expect(await call("GET", "system/ready")).toEqual(expect.objectContaining({ status: 200, body: { ready: true } }));
    d.db = { ensureSchema: async () => { throw upstream("db.schema", { code: "SCHEMA_OUTDATED", message: "database schema 2, this server needs 3: run the missing migrations" }, 503); } } as unknown as Deps["db"];
    expect(await call("GET", "system/ready")).toEqual(expect.objectContaining({ status: 503, body: { error: "The database is not ready." } }));
    expect(JSON.stringify(spy.mock.calls)).toContain("SCHEMA_OUTDATED");
  });
});
