/* Server-only. The production authentication API (contract: docs/security/CONTROLS.md). Every rule the demonstration build shows in the browser is
   enforced here: generic errors, account lockout presets, network blocking (24 hours at most), the proof-of-work challenge, address reputation,
   trusted office networks, TOTP through Supabase Auth, recovery codes, passkeys for platform super admins, sessions (HttpOnly cookie, idle and
   absolute limits), re-authentication, password reset with the second factor, requests to join with admin approval, owner alerts and an
   append-only audit log. Since slice 2a (docs/architecture/BACKEND_FOUNDATION.md) a session belongs to one company and the person's role comes
   from their membership there (or from platform staff), checked again on every request; join requests, lockout settings and the member list are
   per company. Handlers take a plain request and return a plain response, so they are tested without a network. */
import { CHALLENGE, CUSTOM_BOUNDS, LOCKOUT, MFA, REAUTH_MS, RESET, type LockoutRule } from "@/lib/accountSecurity";
import { checkPassword, POLICY } from "@/lib/credentials";
import { IP_POLICY, LEVEL_LABEL, REPUTATION } from "@/lib/ipGuard";
import { generateRecoveryCodes } from "@/lib/me";
import { approvalBlock, INVITE_TTL_H, isAssignableRole, isPrivilegedRole, nameBlock, reasonBlock, ROLE_REQUEST_TTL_H, roleChangeBlock, secondAdminBlock } from "@/lib/rules";
import { isEmail } from "@/lib/security";
import { checkRegistration, verifyAssertion } from "@/lib/webauthn";
import { randomId, same, seal, sha256Hex, unseal } from "./crypto";
import { logFailure } from "./errors";
import type { Company, Lockout, Log, Outcome } from "./directory";
import type { Deps, Profile, SessionRow } from "./types";

export interface Req { method: string; path: string[]; body: Record<string, unknown>; headers: Record<string, string | undefined>; cookies: Record<string, string>; ip: string }
export interface Res { status: number; body?: unknown; cookies?: string[] }
const ok = (body?: unknown, cookies?: string[]): Res => ({ status: body === undefined ? 204 : 200, body, cookies });
const err = (status: number, error: string): Res => ({ status, body: { error } });
export const SIGNIN_FAILED = "Email or password is incorrect.";
export const NO_COMPANY = "Your account is not an active member of any company yet. Ask a company admin to approve your request to join.";
const THROTTLED = "Too many attempts. Wait a few minutes, then try again.";
export const COOKIE = "__Host-sv";
const MIN = 60_000;
const s = (v: unknown, max = 300) => String(v ?? "").slice(0, max);
const norm = (e: unknown) => s(e, 254).trim().toLowerCase();
const PRIVILEGED = new Set(["admin", "super", "support"]);

/* ---------- access: which company and role a person works with ---------- */
/** What a session may do: a company role (in `company`) or a platform role (no company). Never taken from the request. */
export interface Access { role: string; platform: boolean; company: Company | null }
/** At sign-in: platform staff work on the platform; everyone else in the company they used last, or the first of their active companies. */
async function accessAtSignIn(d: Deps, userId: string): Promise<Access | null> {
  const pr = await d.dir.platformRole(userId); if (pr) return { role: pr, platform: true, company: null };
  const list = await d.dir.companiesOf(userId); if (!list.length) return null;
  const last = await d.store.kvGet<string>("lastCompany", userId);
  const pick = list.find((c) => c.company.id === last) || list[0];
  return { role: pick.role, platform: false, company: pick.company };
}
/** For a running session: the membership must still be active (a removed or suspended person loses access at their next request). */
async function accessOf(d: Deps, userId: string, tenantId: string | null | undefined): Promise<Access | null> {
  if (!tenantId) { const pr = await d.dir.platformRole(userId); return pr ? { role: pr, platform: true, company: null } : null; }
  const m = await d.dir.membership(tenantId, userId);
  return m && m.status === "Active" ? { role: m.role, platform: false, company: m.company } : null;
}
const isSuper = (a: Access) => a.platform && a.role === "super";
const companyView = (c: Company | null) => (c ? { ref: c.ref, name: c.name } : null);

/* ---------- audit and alerts ---------- */
/** Who did it, for the audit log: workspace events go to the company's log, platform events to the platform log. */
interface Actor { name: string; id?: string; tenantId?: string | null; platform?: boolean }
const actorOf = (p: Profile, a: Access | null): Actor => ({ name: p.person, id: p.id, tenantId: a?.company?.id ?? null, platform: !!a?.platform });
const entry = (d: Deps, r: Req, a: Actor, action: string, target: string, cat = "Access") =>
  ({ at: d.now(), actor: a.name, actorId: a.id ?? null, tenantId: a.tenantId ?? null, action, target, cat, space: a.platform ? "admin" as const : "ws" as const, ip: r.ip });
async function audit(d: Deps, r: Req, a: Actor, action: string, target: string) { await d.store.audit(entry(d, r, a, action, target)); }
const notify = (d: Deps, userId: string, text: string) => d.store.insertNotice({ id: randomId(9), userId, at: d.now(), text });

/* ---------- network guard ---------- */
interface IpRec { fails: number[]; level: number; until: number; lastBlockAt: number; blocks: number; acts: Record<string, number[]> }
const ipRec = async (d: Deps, ip: string): Promise<IpRec> => (await d.store.kvGet<IpRec>("ip", ip)) || { fails: [], level: 0, until: 0, lastBlockAt: 0, blocks: 0, acts: {} };
async function trusted(d: Deps, ip: string) {
  const nets = (await d.store.kvGet<string[]>("settings", "trusted")) || [];
  return nets.some((n) => (n.endsWith("/24") ? ip.startsWith(n.slice(0, n.lastIndexOf(".") + 1)) : n === ip));
}
const reputable = (ip: string) => !REPUTATION.some((r) => ip.startsWith(r.prefix));
async function blocked(d: Deps, ip: string): Promise<boolean> { if (await trusted(d, ip)) return false; return (await ipRec(d, ip)).until > d.now(); }
async function ipFail(d: Deps, r: Req) {
  const rec = await ipRec(d, r.ip); const now = d.now();
  rec.fails = rec.fails.filter((t) => now - t < IP_POLICY.WINDOW_MS); rec.fails.push(now);
  const threshold = reputable(r.ip) ? IP_POLICY.THRESHOLD : Math.ceil(IP_POLICY.THRESHOLD / 2);
  if (rec.fails.length >= threshold && !(await trusted(d, r.ip))) {
    const next = rec.lastBlockAt && now - rec.lastBlockAt < IP_POLICY.RESET_MS ? Math.min(rec.level + 1, IP_POLICY.LADDER.length) : 1;
    rec.level = next; rec.until = now + IP_POLICY.LADDER[next - 1]; rec.lastBlockAt = now; rec.blocks += 1; rec.fails = [];
    await d.store.audit({ at: now, actor: "Sign-in protection", action: "auth.ip.blocked", target: `${r.ip}: ${LEVEL_LABEL[next - 1]}`, cat: "Security", space: "admin", ip: r.ip });
  }
  await d.store.kvSet("ip", r.ip, rec, IP_POLICY.RESET_MS);
}
async function allow(d: Deps, ip: string, act: string, max: number, windowMs: number): Promise<boolean> {
  const rec = await ipRec(d, ip); const now = d.now(); const list = (rec.acts[act] || []).filter((t) => now - t < windowMs);
  if (list.length >= max) return false;
  list.push(now); rec.acts[act] = list; await d.store.kvSet("ip", ip, rec, IP_POLICY.RESET_MS); return true;
}
const BLOCKED_MSG = "Sign-in from your network is blocked for a while after repeated failed attempts.";

/* ---------- account lockout ---------- */
const ruleOf = (st: Lockout | null | undefined): LockoutRule => {
  if (st?.preset === "custom" && st.custom) return { label: "Custom", attempts: st.custom.attempts, lockMs: st.custom.minutes * MIN, note: "" };
  return LOCKOUT[(st?.preset as keyof typeof LOCKOUT) || "standard"] || LOCKOUT.standard;
};
/** Platform staff: strict. Everyone else: the strictest lockout of the companies they belong to (fewest attempts, then the longest lock). */
async function lockRule(d: Deps, p: Profile | null): Promise<LockoutRule> {
  if (!p) return LOCKOUT.standard;
  if (await d.dir.platformRole(p.id)) return LOCKOUT.strict;
  const rules = (await d.dir.lockoutsOf(p.id)).map(ruleOf);
  return rules.reduce((a, b) => (b.attempts < a.attempts || (b.attempts === a.attempts && b.lockMs > a.lockMs) ? b : a), rules[0] ?? LOCKOUT.standard);
}
async function locked(d: Deps, email: string) { const f = await d.store.kvGet<{ n: number; until: number }>("lock", email); return !!f && f.until > d.now(); }
async function accountFail(d: Deps, email: string, p: Profile | null) {
  const rule = await lockRule(d, p);
  const f = (await d.store.kvGet<{ n: number; until: number }>("lock", email)) || { n: 0, until: 0 }; f.n += 1;
  if (f.n >= rule.attempts) { f.until = d.now() + rule.lockMs; f.n = 0; if (p) await notify(d, p.id, `Your account was locked for ${rule.lockMs / MIN} minutes after ${rule.attempts} failed sign-in attempts.`); }
  await d.store.kvSet("lock", email, f, 24 * 60 * MIN);
  if (p) await d.store.kvSet("failedSince", p.id, ((await d.store.kvGet<number>("failedSince", p.id)) || 0) + 1);
}
const lockCount = async (d: Deps, email: string) => (await d.store.kvGet<{ n: number }>("lock", email))?.n || 0;

/* ---------- challenge ---------- */
async function challengeNeeded(d: Deps, r: Req, email: string) {
  if (await trusted(d, r.ip)) return false;
  const rec = await ipRec(d, r.ip); const recent = rec.fails.filter((t) => d.now() - t < IP_POLICY.WINDOW_MS).length;
  return !reputable(r.ip) || recent >= CHALLENGE.AFTER_FAILS || (await lockCount(d, email)) >= CHALLENGE.AFTER_FAILS;
}
async function challengeOk(d: Deps, c: unknown): Promise<boolean> {
  const v = c as { seed?: unknown; nonce?: unknown } | undefined; if (!v || typeof v.seed !== "string" || !Number.isInteger(v.nonce)) return false;
  const live = await d.store.kvGet<number>("challenge", v.seed); await d.store.kvDel("challenge", v.seed);
  return !!live && (await sha256Hex(`${v.seed}:${v.nonce}`)).startsWith("0".repeat(CHALLENGE.DIGITS));
}

/* ---------- sessions ---------- */
interface Ticket { userId: string; email: string; access: string; refresh: string; method: "totp" | "enroll" | "passkey"; factorId?: string; challenge?: string; register?: boolean; tries: number; alerted?: boolean; expires: number }
async function loadTicket(d: Deps, id: unknown): Promise<Ticket | null> {
  if (typeof id !== "string" || id.length > 100) return null;
  const raw = await d.store.kvGet<string>("ticket", id); if (!raw) return null;
  const t = await unseal<Ticket>(d.secret, raw); return t && t.expires > d.now() && t.tries < MFA.TRIES ? t : null;
}
const saveTicket = async (d: Deps, id: string, t: Ticket) => d.store.kvSet("ticket", id, await seal(d.secret, t), MFA.TICKET_MS);
const device = (r: Req) => { const ua = r.headers["user-agent"] || ""; const b = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser"; const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "an unknown system"; return `${b} on ${os}`; };
const cookie = (v: string, maxAgeS: number) => `${COOKIE}=${v}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeS}`;
async function finish(d: Deps, r: Req, ticketId: string, t: Ticket, extra: Record<string, unknown> = {}): Promise<Res> {
  await d.store.kvDel("ticket", ticketId); await d.store.kvDel("lock", t.email);
  const rec = await ipRec(d, r.ip); rec.fails = []; await d.store.kvSet("ip", r.ip, rec, IP_POLICY.RESET_MS);
  await d.auth.signOut({ access: t.access, refresh: t.refresh }); // the Supabase session was only for the MFA step
  const p = await d.store.profileById(t.userId) as Profile;
  const acc = await accessAtSignIn(d, p.id); if (!acc) return err(409, NO_COMPANY);
  const previous = await d.store.kvGet<{ at: number; ip: string; device: string }>("last", p.id); const failedSince = (await d.store.kvGet<number>("failedSince", p.id)) || 0;
  await d.store.kvSet("last", p.id, { at: d.now(), ip: r.ip, device: device(r) }); await d.store.kvSet("failedSince", p.id, 0);
  if (failedSince >= CHALLENGE.AFTER_FAILS) await notify(d, p.id, `Signed in after ${failedSince} failed attempts since your last sign-in. If you did not make them, change your password.`);
  const sid = randomId(32); const now = d.now(); const absolute = POLICY.absoluteHours * 60 * MIN;
  await d.store.insertSession({ idHash: await sha256Hex(sid), userId: p.id, device: device(r), ip: r.ip, createdAt: now, lastSeen: now, expiresAt: now + absolute, tenantId: acc.company?.id ?? null });
  await d.store.kvSet("reauth", await sha256Hex(sid), now, REAUTH_MS);
  await audit(d, r, actorOf(p, acc), "auth.signed_in", p.person);
  return ok({ roleId: acc.role, who: p.person, person: p.person, company: companyView(acc.company), previous, failedSince, ...extra }, [cookie(sid, absolute / 1000)]);
}
/** The signed-in session, person and access, enforcing the idle limit (15 minutes for privileged roles, 30 otherwise), the absolute limit and the
 *  membership: a session whose person is no longer an active member of its company (or no longer platform staff) ends. */
export async function current(d: Deps, r: Req): Promise<Ctx | null> {
  const sid = r.cookies[COOKIE]; if (!sid || sid.length > 100) return null;
  const h = await sha256Hex(sid); const row = await d.store.sessionByHash(h); if (!row || row.revokedAt) return null;
  const p = await d.store.profileById(row.userId); if (!p || p.status !== "Active") return null;
  const a = await accessOf(d, p.id, row.tenantId);
  if (!a) { await d.store.updateSession(h, { revokedAt: d.now(), revokedWhy: "Access removed" }); return null; }
  const idle = (PRIVILEGED.has(a.role) ? POLICY.idleMinutesPrivileged : POLICY.idleMinutes) * MIN;
  if (row.expiresAt <= d.now() || d.now() - row.lastSeen > idle) { await d.store.updateSession(h, { revokedAt: d.now(), revokedWhy: "Expired" }); return null; }
  await d.store.updateSession(h, { lastSeen: d.now() }); row.lastSeen = d.now();
  return { s: row, p, a };
}
export interface Ctx { s: SessionRow; p: Profile; a: Access }
const recentAuth = async (d: Deps, s: SessionRow) => { const at = await d.store.kvGet<number>("reauth", s.idHash); return !!at && d.now() - at < REAUTH_MS; };

/* ---------- handlers ---------- */
type H = (d: Deps, r: Req) => Promise<Res>;
const challenge: H = async (d) => { const seed = randomId(16); await d.store.kvSet("challenge", seed, 1, CHALLENGE.TTL_MS); return ok({ seed, digits: CHALLENGE.DIGITS }); };

const signIn: H = async (d, r) => {
  const email = norm(r.body.email); const password = s(r.body.password, 1024);
  if (await blocked(d, r.ip)) return err(403, BLOCKED_MSG);
  if (await locked(d, email)) { await ipFail(d, r); return err(423, THROTTLED); }
  if ((await challengeNeeded(d, r, email)) && !(await challengeOk(d, r.body.challenge))) return err(428, "Challenge required.");
  const p = isEmail(email) ? await d.store.profileByEmail(email) : null;
  const res = p && p.status !== "Rejected" ? await d.auth.signInWithPassword(email, password) : null;
  if (!p || !res) { await ipFail(d, r); await accountFail(d, email, p); return (await blocked(d, r.ip)) ? err(403, BLOCKED_MSG) : err(401, SIGNIN_FAILED); }
  if (p.status === "Pending") { await d.auth.signOut(res); return err(409, "Your request to join is waiting for a company admin to approve it."); }
  if (p.status === "Rejected") { await d.auth.signOut(res); return err(409, "Your request to join was not approved. Ask a company admin."); }
  const acc = await accessAtSignIn(d, p.id); if (!acc) { await d.auth.signOut(res); return err(409, NO_COMPANY); }
  const tid = randomId(24); const t: Ticket = { userId: p.id, email, access: res.access, refresh: res.refresh, method: "totp", tries: 0, expires: d.now() + MFA.TICKET_MS };
  if (isSuper(acc)) {
    const keys = await d.store.passkeysOf(p.id); t.method = "passkey"; t.challenge = randomId(32); t.register = keys.length === 0;
    await saveTicket(d, tid, t);
    return ok({ step: "passkey", ticket: tid, register: t.register, challenge: t.challenge, rpId: d.site.rpId, allow: keys.map((k) => k.id), email, name: p.person });
  }
  const factor = await d.auth.verifiedTotpFactor(res);
  if (!factor) { const en = await d.auth.enrollTotp(res, email); t.method = "enroll"; t.factorId = en.factorId; await saveTicket(d, tid, t); return ok({ step: "enroll", ticket: tid, secret: en.secret, uri: en.uri }); }
  t.factorId = factor; await saveTicket(d, tid, t);
  return ok({ step: "mfa", ticket: tid, method: "totp" });
};
async function wrongSecond(d: Deps, r: Req, tid: string, t: Ticket): Promise<Res> {
  t.tries += 1; await ipFail(d, r); const p = await d.store.profileById(t.userId); await accountFail(d, t.email, p);
  if (!t.alerted && t.method !== "enroll" && p) { t.alerted = true; await notify(d, p.id, "Someone entered your correct password but then failed the second step. If this was not you, change your password now."); }
  if (await locked(d, t.email)) { await d.store.kvDel("ticket", tid); return err(423, THROTTLED); }
  if (t.tries >= MFA.TRIES) { await d.store.kvDel("ticket", tid); return err(400, "Too many wrong codes. Start again."); }
  await saveTicket(d, tid, t);
  return (await blocked(d, r.ip)) ? err(403, BLOCKED_MSG) : err(400, "That code is not correct.");
}
const verify: H = async (d, r) => {
  const tid = s(r.body.ticket, 100); const t = await loadTicket(d, tid); if (!t || t.method === "passkey") return err(400, "This sign-in has expired. Start again.");
  if (await blocked(d, r.ip)) return err(403, BLOCKED_MSG);
  const code = s(r.body.code, 20).trim();
  if (r.body.recovery === true && t.method === "totp") {
    const left = await redeemRecovery(d, t.userId, code); if (left < 0) return wrongSecond(d, r, tid, t);
    await notify(d, t.userId, `A recovery code was used to sign in. ${left} left.`);
    return finish(d, r, tid, t, { recoveryLeft: left });
  }
  if (!/^\d{6}$/.test(code) || !(await d.auth.verifyTotp(t, t.factorId as string, code))) return wrongSecond(d, r, tid, t);
  if (t.method === "enroll") {
    const codes = generateRecoveryCodes(MFA.RECOVERY_CODES); await storeRecovery(d, t.userId, codes);
    await d.store.kvSet("mfa", t.userId, { enrolledAt: d.now() });
    await notify(d, t.userId, "An authenticator app was added to your account and new recovery codes were issued.");
    return finish(d, r, tid, t, { recoveryCodes: codes });
  }
  return finish(d, r, tid, t);
};
async function storeRecovery(d: Deps, userId: string, codes: string[]) {
  await d.store.replaceRecovery(userId, await Promise.all(codes.map(async (c) => { const salt = randomId(8); return { userId, salt, hash: await sha256Hex(salt + ":" + c.toUpperCase().replace(/[^A-Z0-9]/g, "")) }; })));
}
async function redeemRecovery(d: Deps, userId: string, code: string): Promise<number> {
  const n = code.toUpperCase().replace(/[^A-Z0-9]/g, ""); if (n.length < 8) return -1;
  const rows = await d.store.recoveryOf(userId);
  for (const row of rows) if (!row.usedAt && same(await sha256Hex(row.salt + ":" + n), row.hash)) { await d.store.markRecoveryUsed(userId, row.hash); return rows.filter((x) => !x.usedAt).length - 1; }
  return -1;
}
const passkeyStep: H = async (d, r) => {
  const tid = s(r.body.ticket, 100); const t = await loadTicket(d, tid); if (!t || t.method !== "passkey" || !t.challenge) return err(400, "This sign-in has expired. Start again.");
  if (await blocked(d, r.ip)) return err(403, BLOCKED_MSG);
  const reg = r.body.register as { id: string; publicKey: string; clientDataJSON: string } | undefined;
  const as = r.body.assertion as { id: string; authenticatorData: string; clientDataJSON: string; signature: string } | undefined;
  const p = await d.store.profileById(t.userId) as Profile;
  if (reg) {
    if (!t.register || typeof reg.id !== "string" || typeof reg.publicKey !== "string" || !checkRegistration(s(reg.clientDataJSON, 4096), { challenge: t.challenge, origin: d.site.origin })) return wrongSecond(d, r, tid, t);
    await d.store.insertPasskey({ id: s(reg.id, 512), userId: t.userId, publicKey: s(reg.publicKey, 1024), signCount: 0, createdAt: d.now(), label: device(r) });
    await notify(d, t.userId, `A passkey was added to your account (${device(r)}).`); await audit(d, r, actorOf(p, await accessAtSignIn(d, p.id)), "auth.passkey.added", p.person);
    return finish(d, r, tid, t);
  }
  if (!as) return wrongSecond(d, r, tid, t);
  const key = (await d.store.passkeysOf(t.userId)).find((k) => k.id === as.id); if (!key) return wrongSecond(d, r, tid, t);
  const count = await verifyAssertion(as, { ...key }, { challenge: t.challenge, origin: d.site.origin, rpId: d.site.rpId });
  if (count === null) return wrongSecond(d, r, tid, t);
  await d.store.updatePasskey(key.id, { signCount: count });
  return finish(d, r, tid, t);
};
/** Readiness of the module database: 200 when DATABASE_URL works and the schema is current, 503 otherwise (the reason goes to the log only). */
const ready: H = async (d, r) => {
  if (!d.db) return err(503, "The database is not configured.");
  try { await d.db.ensureSchema(); return ok({ ready: true }); }
  catch (e) { logFailure("GET system/ready", e, r.headers["x-vercel-id"]); return err(503, "The database is not ready."); }
};
/** The session's person, role and company, and the other companies they may switch to. */
const sessionInfo: H = async (d, r) => {
  const c = await current(d, r); if (!c) return err(401, "Signed out.");
  const companies = c.a.platform ? [] : (await d.dir.companiesOf(c.p.id)).map((x) => ({ ...companyView(x.company), role: x.role }));
  return ok({ roleId: c.a.role, who: c.p.person, company: companyView(c.a.company), companies });
};
const signOut: H = async (d, r) => {
  const c = await current(d, r);
  if (c) { await d.store.updateSession(c.s.idHash, { revokedAt: d.now(), revokedWhy: "Signed out" }); await audit(d, r, actorOf(c.p, c.a), "auth.signed_out", c.p.person); }
  return ok(undefined, [cookie("", 0)]);
};
/** A request to join names the company by its code. The answer is the same whether or not the email or the code is known, so neither can be
 *  probed. A new person's account stays unconfirmed in Supabase (it cannot sign in) until an admin of that company approves; a person who is
 *  already active elsewhere keeps their password and gets a pending membership. Platform staff cannot join a company this way. */
const join: H = async (d, r) => {
  const name = s(r.body.name, 80).trim(); const email = norm(r.body.email); const password = s(r.body.password, 1024); const code = s(r.body.company, 40).trim().toLowerCase();
  const invite = s(r.body.invite, 100).trim();
  const bad = nameBlock(name); if (bad) return err(400, bad);
  if (!isEmail(email)) return err(400, "Enter a valid work email address.");
  if (!invite && !/^[a-z0-9][a-z0-9-]{2,39}$/.test(code)) return err(400, "Enter your company code. Your company admin can tell you what it is.");
  const pw = checkPassword(password, { email, name }); if (!pw.ok) return err(400, pw.errors[0] || "Choose a stronger password.");
  if (await blocked(d, r.ip)) return err(403, BLOCKED_MSG);
  if (!(await allow(d, r.ip, "join", IP_POLICY.JOIN_MAX, IP_POLICY.JOIN_WINDOW_MS))) return err(429, "Too many requests to join from your network. Try again in an hour.");
  if (invite) { await joinByInvite(d, r, { name, email, password, token: invite }); return { status: 202 }; }
  const tenantId = await d.dir.companyByCode(code); if (!tenantId) return { status: 202 };
  const existing = await d.store.profileByEmail(email);
  let userId = existing?.id;
  if (!existing || existing.status === "Rejected") {
    if (existing) { await d.auth.setPassword(existing.id, password); await d.store.updateProfile(existing.id, { status: "Pending", requestedAt: d.now(), person: name }); }
    else { userId = await d.auth.createUser(email, password, name); await d.store.insertProfile({ id: userId, email, person: name, status: "Pending", requestedAt: d.now() }); }
  } else if (await d.dir.platformRole(existing.id)) return { status: 202 };
  const who = existing && existing.status === "Active" ? existing.person : name;
  await d.dir.requestToJoin(tenantId, userId as string, d.now(), entry(d, r, { name: `${who} (not signed in)`, id: userId, tenantId }, "team.join.requested", `${who} <${email}>`));
  return { status: 202 };
};
/** Joining with an invitation link (slice 2c): the token's hash names one pending invitation, and the email must be the invited one. The answer
 *  is the same 202 whatever happens, so neither the token nor the email nor a password can be tested this way. A new account is confirmed at
 *  once (an admin invited it); a person who already has an active account proves it with their own password, which is never changed here. */
async function joinByInvite(d: Deps, r: Req, i: { name: string; email: string; password: string; token: string }): Promise<void> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(i.token)) return;
  const inv = await d.dir.invitationByToken(await sha256Hex(i.token));
  if (!inv || inv.email !== i.email || inv.expiresAt <= d.now()) return;
  const existing = await d.store.profileByEmail(i.email);
  if (existing && (await d.dir.platformRole(existing.id))) return;
  let userId: string; let who = i.name;
  if (existing?.status === "Active") {
    const t = await d.auth.signInWithPassword(i.email, i.password); if (!t || t.userId !== existing.id) return;
    await d.auth.signOut(t); userId = existing.id; who = existing.person;
  } else if (existing) { userId = existing.id; await d.auth.setPassword(userId, i.password); await d.store.updateProfile(userId, { person: i.name }); }
  else { userId = await d.auth.createUser(i.email, i.password, i.name); await d.store.insertProfile({ id: userId, email: i.email, person: i.name, status: "Pending", requestedAt: d.now() }); }
  const done = await d.dir.acceptInvitation(inv.tenantId, userId, inv.id, d.now(), entry(d, r, { name: `${who} (not signed in)`, id: userId, tenantId: inv.tenantId }, "member.invitation.accepted", `${who} <${i.email}> as ${inv.role}`));
  if (done && existing?.status !== "Active") { await d.auth.confirmUser(userId); await d.store.updateProfile(userId, { status: "Active", decidedBy: "Invitation", reason: "Accepted an invitation" }); }
}
const resetRequest: H = async (d, r) => {
  const email = norm(r.body.email); if (!isEmail(email)) return err(400, "Enter a valid work email address.");
  if (await blocked(d, r.ip)) return err(403, BLOCKED_MSG);
  if (!(await allow(d, r.ip, "reset", RESET.MAX_PER_HOUR, 60 * MIN))) return err(429, "Too many reset requests from your network. Try again in an hour.");
  const p = await d.store.profileByEmail(email);
  if (p && p.status === "Active" && (await allow(d, "acct:" + p.id, "reset", RESET.MAX_PER_HOUR, 60 * MIN))) {
    await d.auth.sendResetEmail(email, `${d.site.origin}/login`);
    await notify(d, p.id, "A password reset was requested for your account. If this was not you, you can ignore it: your password has not changed.");
    await audit(d, r, actorOf(p, await accessAtSignIn(d, p.id)), "auth.password.reset_requested", p.person);
  }
  return { status: 202 };
};
/** The reset link from Supabase's email brings a short recovery session; the page sends it as `token` (base64url JSON of access and refresh). */
async function recoveryOf(d: Deps, token: unknown): Promise<{ userId: string; t: { access: string; refresh: string }; used: string } | null> {
  try {
    const t = JSON.parse(Buffer.from(s(token, 8192), "base64url").toString()) as { access: string; refresh: string };
    if (typeof t.access !== "string" || typeof t.refresh !== "string") return null;
    const used = await sha256Hex(t.access); if (await d.store.kvGet("resetUsed", used)) return null;
    const userId = await d.auth.userOfRecovery(t); return userId ? { userId, t, used } : null;
  } catch { return null; }
}
const resetCheck: H = async (d, r) => ok({ valid: !!(await recoveryOf(d, r.path[3])) });
const resetDo: H = async (d, r) => {
  const rec = await recoveryOf(d, r.body.token); if (!rec) return err(400, "This link is not valid or has expired. Ask for a new one.");
  const p = await d.store.profileById(rec.userId); if (!p || p.status !== "Active") return err(400, "This link is not valid or has expired. Ask for a new one.");
  const tries = ((await d.store.kvGet<number>("resetTries", rec.used)) || 0);
  if (tries >= RESET.CODE_TRIES) return err(400, "Too many wrong codes. Ask for a new link.");
  const code = s(r.body.code, 20).trim(); const factor = await d.auth.verifiedTotpFactor(rec.t);
  if (!factor) return err(400, "This account has no second factor yet, so it cannot be reset. Ask a company admin.");
  const second = (/^\d{6}$/.test(code) && (await d.auth.verifyTotp(rec.t, factor, code))) || (await redeemRecovery(d, rec.userId, code)) >= 0;
  if (!second) { await d.store.kvSet("resetTries", rec.used, tries + 1, RESET.TTL_MS * 4); return err(400, tries + 1 >= RESET.CODE_TRIES ? "Too many wrong codes. Ask for a new link." : "That code is not correct."); }
  const pw = checkPassword(s(r.body.password, 1024), { email: p.email, name: p.person }); if (!pw.ok) return err(400, pw.errors[0] || "Choose a stronger password.");
  await d.auth.setPassword(p.id, s(r.body.password, 1024)); await d.store.kvSet("resetUsed", rec.used, 1, 24 * 60 * MIN);
  await d.auth.signOut(rec.t);
  let ended = 0; for (const x of await d.store.sessionsOf(p.id)) if (!x.revokedAt) { ended++; await d.store.updateSession(x.idHash, { revokedAt: d.now(), revokedWhy: "Password reset" }); }
  await d.store.kvDel("lock", p.email);
  await notify(d, p.id, `Your password was reset${ended ? ` and ${ended} session${ended === 1 ? " was" : "s were"} signed out` : ""}. If this was not you, contact your administrator now.`);
  await audit(d, r, actorOf(p, await accessAtSignIn(d, p.id)), "auth.password.reset", p.person);
  return ok();
};

/* ---------- signed-in endpoints ---------- */
const signed = (h: (d: Deps, r: Req, c: Ctx) => Promise<Res>): H => async (d, r) => { const c = await current(d, r); return c ? h(d, r, c) : err(401, "Sign in first."); };
const security = signed(async (d, r, { s: me, p, a }) => {
  const sessions = (await d.store.sessionsOf(p.id)).filter((x) => !x.revokedAt && x.expiresAt > d.now());
  const recovery = await d.store.recoveryOf(p.id); const mfa = await d.store.kvGet<{ enrolledAt: number }>("mfa", p.id);
  return ok({
    email: p.email, person: p.person, demo: false, thisSignIn: await d.store.kvGet("last", p.id),
    sessions: sessions.map((x) => ({ id: x.idHash.slice(0, 16), device: x.device, ip: x.ip, startedAt: x.createdAt, current: x.idHash === me.idHash, expiresAt: x.expiresAt })),
    notices: (await d.store.noticesOf(p.id, 20)).map((n) => ({ id: n.id, at: n.at, text: n.text })),
    mfa: mfa ? { enrolledAt: mfa.enrolledAt, codesLeft: recovery.filter((x) => !x.usedAt).length } : null,
    passkeys: (await d.store.passkeysOf(p.id)).map((k) => ({ id: k.id, label: k.label, createdAt: k.createdAt })), passkeyRequired: isSuper(a),
  });
});
const reauth = signed(async (d, r, { s: me, p }) => {
  if (await blocked(d, r.ip)) return err(403, BLOCKED_MSG);
  const res = await d.auth.signInWithPassword(p.email, s(r.body.password, 1024));
  if (!res) { await ipFail(d, r); await accountFail(d, p.email, p); return err(400, "That password is not correct."); }
  await d.auth.signOut(res); await d.store.kvSet("reauth", me.idHash, d.now(), REAUTH_MS); return ok();
});
const changePassword = signed(async (d, r, { s: me, p, a }) => {
  const res = await d.auth.signInWithPassword(p.email, s(r.body.current, 1024));
  if (!res) { await ipFail(d, r); await accountFail(d, p.email, p); return err(400, "That password is not correct."); }
  await d.auth.signOut(res);
  const next = s(r.body.next, 1024); const pw = checkPassword(next, { email: p.email, name: p.person }); if (!pw.ok) return err(400, pw.errors[0] || "Choose a stronger password.");
  if (next === s(r.body.current, 1024)) return err(400, "Choose a password you are not using now.");
  await d.auth.setPassword(p.id, next); await d.store.kvSet("reauth", me.idHash, d.now(), REAUTH_MS);
  let ended = 0; for (const x of await d.store.sessionsOf(p.id)) if (!x.revokedAt && x.idHash !== me.idHash) { ended++; await d.store.updateSession(x.idHash, { revokedAt: d.now(), revokedWhy: "Password changed" }); }
  await notify(d, p.id, `Your password was changed${ended ? ` and ${ended} other session${ended === 1 ? " was" : "s were"} signed out` : ""}. If this was not you, reset it now.`);
  await audit(d, r, actorOf(p, a), "auth.password.changed", p.person); return ok();
});
const newCodes = signed(async (d, r, { s: me, p, a }) => {
  if (!(await recentAuth(d, me))) return err(403, "Confirm your password first.");
  if (!(await d.store.kvGet("mfa", p.id))) return err(400, "Add an authenticator app first.");
  const codes = generateRecoveryCodes(MFA.RECOVERY_CODES); await storeRecovery(d, p.id, codes);
  await notify(d, p.id, "New recovery codes were issued. The old ones no longer work."); await audit(d, r, actorOf(p, a), "recovery.codes.regenerated", p.person);
  return ok({ codes });
});
const revokeOthers = signed(async (d, r, { s: me, p, a }) => {
  let n = 0; for (const x of await d.store.sessionsOf(p.id)) if (!x.revokedAt && x.idHash !== me.idHash) { n++; await d.store.updateSession(x.idHash, { revokedAt: d.now(), revokedWhy: "Signed out from another session" }); }
  if (n) await notify(d, p.id, `${n} other session${n === 1 ? " was" : "s were"} signed out from ${device(r)}.`);
  await audit(d, r, actorOf(p, a), "session.others.revoked", p.person); return ok(n);
});
const passkeyOptions = signed(async (d, r, { s: me, p }) => {
  if (!(await recentAuth(d, me))) return err(403, "Confirm your password first.");
  const challenge = randomId(32); await d.store.kvSet("pkadd", me.idHash, challenge, 5 * MIN);
  return ok({ challenge, rpId: d.site.rpId, exclude: (await d.store.passkeysOf(p.id)).map((k) => k.id), email: p.email, name: p.person });
});
const passkeyAdd = signed(async (d, r, { s: me, p, a }) => {
  const challenge = await d.store.kvGet<string>("pkadd", me.idHash); await d.store.kvDel("pkadd", me.idHash);
  if (!challenge || !checkRegistration(s(r.body.clientDataJSON, 4096), { challenge, origin: d.site.origin })) return err(400, "That passkey could not be verified.");
  await d.store.insertPasskey({ id: s(r.body.id, 512), userId: p.id, publicKey: s(r.body.publicKey, 1024), signCount: 0, createdAt: d.now(), label: device(r) });
  await notify(d, p.id, `A passkey was added to your account (${device(r)}).`); await audit(d, r, actorOf(p, a), "auth.passkey.added", p.person); return ok();
});
const passkeyDelete = signed(async (d, r, { s: me, p, a }) => {
  if (!(await recentAuth(d, me))) return err(403, "Confirm your password first.");
  const keys = await d.store.passkeysOf(p.id); const id = s(r.path[2], 512);
  if (!keys.some((k) => k.id === id)) return err(404, "Passkey not found.");
  if (isSuper(a) && keys.length <= 1) return err(400, "Platform super admins must keep at least one passkey.");
  await d.store.deletePasskey(id); await notify(d, p.id, "A passkey was removed from your account."); await audit(d, r, actorOf(p, a), "auth.passkey.removed", p.person); return ok();
});

/** Switches the session to another company the person is an active member of (D1: one company per session). Platform staff reach a company
 *  only through an elevated session, never this way. Audited in the company switched to. */
const switchCompany = signed(async (d, r, { s: me, p, a }) => {
  if (a.platform) return err(403, "Platform staff open a company workspace only through an elevated session.");
  const code = s(r.body.company, 40).trim().toLowerCase();
  const to = (await d.dir.companiesOf(p.id)).find((x) => x.company.ref === code); if (!to) return err(404, "Company not found.");
  await d.store.updateSession(me.idHash, { tenantId: to.company.id }); await d.store.kvSet("lastCompany", p.id, to.company.id);
  const next: Access = { role: to.role, platform: false, company: to.company };
  await audit(d, r, actorOf(p, next), "auth.company.switched", `${a.company?.ref ?? "none"} → ${to.company.ref}`);
  return ok({ roleId: next.role, company: companyView(next.company) });
});

/* ---------- company admin endpoints (the session's company only) ---------- */
type AdminCtx = Ctx & { company: Company };
const admin = (h: (d: Deps, r: Req, c: AdminCtx) => Promise<Res>) => signed(async (d, r, c) => (c.a.role === "admin" && !c.a.platform && c.a.company ? h(d, r, { ...c, company: c.a.company }) : err(403, "Not permitted.")));
const memberList = admin(async (d, _r, { p: me, company }) => ok((await d.dir.members(company.id, me.id)).filter((m) => m.status !== "Removed")
  .map((m) => ({ id: m.userId, name: m.person, email: m.email, role: m.role, status: m.status, since: m.since, me: m.userId === me.id }))));
const joinList = admin(async (d, _r, { p: me, company }) => ok((await d.dir.members(company.id, me.id, "Pending")).map((x) => ({ id: x.userId, name: x.person, email: x.email, requestedAt: x.since }))));
const joinDecide = admin(async (d, r, { p: me, a, company }) => {
  const id = s(r.path[2], 100); const decision = r.path[3]; const why = s(r.body.reason).trim();
  if (decision !== "approve" && decision !== "reject") return err(404, "Not found.");
  if (why.length < 10) return err(400, "Give a reason of at least 10 characters.");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return err(404, "Request not found.");
  if (id === me.id) return err(403, "Segregation of duties: you cannot decide your own request to join.");
  const m = await d.dir.membership(company.id, id); if (!m) return err(404, "Request not found."); // another company's person: not found, never forbidden
  if (m.status !== "Pending") return err(409, "That request has already been decided.");
  const p = await d.store.profileById(id); if (!p) return err(404, "Request not found.");
  const approve = decision === "approve";
  const done = await d.dir.decide(company.id, me.id, id, approve ? "Active" : "Removed", why, d.now(),
    entry(d, r, actorOf(me, a), approve ? "team.join.approved" : "team.join.rejected", `${p.person} <${p.email}> as Employee; reason: ${why}`));
  if (!done) return err(409, "That request has already been decided.");
  // A new person's account becomes usable with their first approval; a rejection leaves it unconfirmed (it still cannot sign in).
  if (approve && p.status !== "Active") { await d.auth.confirmUser(p.id); await d.store.updateProfile(p.id, { status: "Active", decidedBy: me.person, reason: why }); }
  return ok({ id, status: approve ? "Active" : "Rejected" });
});
/** The company's lockout setting, for the Team & Settings page. */
const lockoutGet = admin(async (d, _r, { p: me, company }) => ok({ lockout: await d.dir.lockoutOf(company.id, me.id) }));
const lockoutSet = admin(async (d, r, { p: me, a, company }) => {
  const preset = s(r.body.lockout, 20); const custom = r.body.custom as { attempts?: unknown; minutes?: unknown } | undefined;
  if (!["standard", "strict", "pci", "custom"].includes(preset)) return err(400, "Choose one of the listed presets.");
  let value: Lockout = { preset };
  if (preset === "custom") {
    const n = Number(custom?.attempts), m = Number(custom?.minutes);
    if (!Number.isInteger(n) || !Number.isInteger(m) || n < CUSTOM_BOUNDS.attempts[0] || n > CUSTOM_BOUNDS.attempts[1] || m < CUSTOM_BOUNDS.minutes[0] || m > CUSTOM_BOUNDS.minutes[1]) return err(400, "Custom lockout: 3 to 10 attempts and 15 to 60 minutes.");
    value = { preset, custom: { attempts: n, minutes: m } };
  }
  await d.dir.setLockout(company.id, me.id, value, d.now(), entry(d, r, actorOf(me, a), "team.lockout.changed", preset === "custom" ? `custom: ${value.custom!.attempts} attempts, ${value.custom!.minutes} minutes` : preset));
  return ok();
});

/* ---------- role changes, invitations and the four-eyes requests behind them (slice 2c) ---------- */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOUR = 3600_000;
const inviteLink = (d: Deps, token: string) => `${d.site.origin}/login#invite=${token}`;
const outcome = (o: Outcome): Res => ("error" in o ? err(o.code, o.error) : ok({ status: o.status }));
const logFor = (d: Deps, r: Req, c: Ctx): Log => (action, target) => entry(d, r, actorOf(c.p, c.a), action, target);
/** Grants or changes a member's role. Employee-level roles change at once; admin and owner need a second admin (SOD_MATRIX section 3, Team). */
const roleChange = admin(async (d, r, c) => {
  const { p: me, company } = c; const id = s(r.path[2], 100); const to = s(r.body.role, 20);
  if (!UUID_RE.test(id)) return err(404, "Member not found.");
  const m = await d.dir.membership(company.id, id); if (!m || m.status !== "Active") return err(404, "Member not found."); // another company's person: not found
  const who = await d.store.profileById(id); if (!who) return err(404, "Member not found.");
  const admins = await d.dir.admins(company.id, me.id);
  const why = roleChangeBlock({ self: id === me.id, from: m.role, to, valid: isAssignableRole(to), fromIsAdmin: m.role === "admin", toIsAdmin: to === "admin", admins: admins.length,
    pending: await d.dir.pendingApproval(company.id, me.id, "team-role", id, d.now()) });
  if (why) return err(id === me.id ? 403 : isAssignableRole(to) ? 409 : 400, why);
  if (!isPrivilegedRole(to)) {
    const done = await d.dir.setRole(company.id, me.id, id, m.role, to, d.now(), entry(d, r, actorOf(me, c.a), "member.role.changed", `${who.person}: ${m.role} → ${to}`));
    return done ? ok({ pending: false }) : err(409, "The member's role changed meanwhile, or no admin would remain. Reload and try again.");
  }
  const none = secondAdminBlock(admins.filter((x) => x !== me.id && x !== id).length); if (none) return err(409, none);
  const title = `Grant ${to} to ${who.person}`;
  const ap = await d.dir.requestApproval(company.id, me.id, { kind: "team-role", title, subject: id, payload: { userId: id, name: who.person, from: m.role, to }, needs: 1, approverRoles: ["admin"], forbid: [id], ttlMs: ROLE_REQUEST_TTL_H * HOUR },
    d.now(), entry(d, r, actorOf(me, c.a), "approval.team-role.requested", title));
  return { status: 202, body: { pending: true, id: ap } };
});
/** The company's four-eyes requests, with what the viewer may do on each (the shared rule explains a refusal before it happens). */
const approvalList = admin(async (d, _r, { p: me, a, company }) => {
  const now = d.now();
  return ok((await d.dir.approvals(company.id, me.id)).filter((x) => x.kind.startsWith("team-")).map((x) => {
    const status = x.status === "Pending" && x.expiresAt <= now ? "Expired" : x.status;
    const block = status === "Pending" ? approvalBlock({ key: me.id, base: a.role }, { status, expiresAt: x.expiresAt, approverRoles: x.approverRoles, requestedBy: x.requestedBy, forbid: x.forbid, votes: x.votes.map((v) => v.by) }, now) : null;
    return { id: x.id, kind: x.kind, title: x.title, requestedBy: x.requestedByName, status, createdAt: x.createdAt, expiresAt: x.expiresAt, reason: x.decidedReason ?? null,
      votes: x.votes.map((v) => ({ by: v.byName, at: v.at, reason: v.reason })), mine: x.requestedBy === me.id, block };
  }));
});
const approvalDecide = admin(async (d, r, c) => {
  const id = s(r.path[2], 100); const decision = r.path[3];
  if (!["approve", "reject", "withdraw"].includes(decision)) return err(404, "Not found.");
  if (!UUID_RE.test(id)) return err(404, "Request not found.");
  const actor = { id: c.p.id, role: c.a.role };
  if (decision === "withdraw") { const o = await d.dir.withdrawApproval(c.company.id, actor, id, d.now(), logFor(d, r, c)); return outcome(o); }
  const why = s(r.body.reason).trim(); const short = reasonBlock(why); if (short) return err(400, short);
  const o = await d.dir.decideApproval(c.company.id, actor, id, decision === "approve", why, d.now(), logFor(d, r, c));
  return outcome(o);
});
const inviteList = admin(async (d, _r, { p: me, company }) => {
  const now = d.now();
  return ok((await d.dir.invitations(company.id, me.id)).map((i) => ({ ...i, status: i.status === "Pending" && i.expiresAt <= now ? "Expired" : i.status })));
});
/** Invites a person by email. The link is shown once, to the admin, who sends it to the person; only its hash is stored. An admin or owner
 *  invitation is created only when a second admin approves it, and then an admin creates its link. */
const inviteCreate = admin(async (d, r, c) => {
  const { p: me, company } = c; const email = norm(r.body.email); const role = s(r.body.role, 20); const now = d.now();
  if (!isEmail(email)) return err(400, "Enter a valid email address.");
  if (!isAssignableRole(role)) return err(400, "Choose a valid role.");
  const ex = await d.store.profileByEmail(email);
  if (ex && (await d.dir.membership(company.id, ex.id))?.status === "Active") return err(409, "That person is already a member.");
  if ((await d.dir.pendingApproval(company.id, me.id, "team-invite", email, now)) || (await d.dir.invitations(company.id, me.id)).some((i) => i.email === email && i.status === "Pending" && i.expiresAt > now))
    return err(409, "An invitation for this email is already pending.");
  if (isPrivilegedRole(role)) {
    const none = secondAdminBlock((await d.dir.admins(company.id, me.id)).filter((x) => x !== me.id).length); if (none) return err(409, none);
    const title = `Invite ${email} as ${role}`;
    const id = await d.dir.requestApproval(company.id, me.id, { kind: "team-invite", title, subject: email, payload: { email, role }, needs: 1, approverRoles: ["admin"], forbid: [], ttlMs: INVITE_TTL_H * HOUR },
      now, entry(d, r, actorOf(me, c.a), "approval.team-invite.requested", title));
    return { status: 202, body: { pending: true, id } };
  }
  const token = randomId(32);
  const id = await d.dir.createInvitation(company.id, me.id, { email, role, tokenHash: await sha256Hex(token) }, now, entry(d, r, actorOf(me, c.a), "member.invited", `${email} (${role})`));
  if (!id) return err(409, "An invitation for this email is already pending.");
  return ok({ pending: false, id, link: inviteLink(d, token), expiresAt: now + INVITE_TTL_H * HOUR });
});
/** `link` replaces the invitation's link (the old one stops working) and shows the new one once; `revoke` ends the invitation. */
const inviteAction = admin(async (d, r, c) => {
  const id = s(r.path[2], 100); const action = r.path[3]; const now = d.now();
  if (action !== "link" && action !== "revoke") return err(404, "Not found.");
  if (!UUID_RE.test(id)) return err(404, "Invitation not found.");
  const i = (await d.dir.invitations(c.company.id, c.p.id)).find((x) => x.id === id); if (!i) return err(404, "Invitation not found.");
  if (i.status !== "Pending" || i.expiresAt <= now) return err(409, "This invitation is no longer pending.");
  if (action === "revoke") {
    const done = await d.dir.revokeInvitation(c.company.id, c.p.id, id, now, entry(d, r, actorOf(c.p, c.a), "member.invitation.revoked", `${i.email} (${i.role}); ${id}`));
    return done ? ok() : err(409, "This invitation is no longer pending.");
  }
  const token = randomId(32);
  const v = await d.dir.setInvitationLink(c.company.id, c.p.id, id, await sha256Hex(token), now, entry(d, r, actorOf(c.p, c.a), "member.invitation.link_created", `${i.email} (${i.role}); ${id}`));
  return v ? ok({ link: inviteLink(d, token), expiresAt: v.expiresAt }) : err(409, "This invitation is no longer pending.");
});

/** Method + path -> handler. Paths are relative to /api. */
export const ROUTES: Record<string, H> = {
  "POST auth/challenge": challenge, "POST auth/sign-in": signIn, "POST auth/sign-in/verify": verify, "POST auth/sign-in/passkey": passkeyStep,
  "GET system/ready": ready, "GET auth/session": sessionInfo, "POST auth/sign-out": signOut, "POST auth/join-requests": join,
  "POST auth/password/reset-request": resetRequest, "GET auth/password/reset/:token": resetCheck, "POST auth/password/reset": resetDo,
  "GET me/security": security, "POST auth/company": switchCompany, "GET team/members": memberList, "POST me/reauth": reauth, "POST me/password": changePassword, "POST me/recovery-codes": newCodes,
  "POST me/sessions/revoke-others": revokeOthers, "POST me/passkeys/options": passkeyOptions, "POST me/passkeys": passkeyAdd, "DELETE me/passkeys/:id": passkeyDelete,
  "GET team/join-requests": joinList, "POST team/join-requests/:id/:decision": joinDecide, "POST team/settings": lockoutSet, "GET team/settings": lockoutGet,
  "POST team/members/:id/role": roleChange, "GET team/approvals": approvalList, "POST team/approvals/:id/:decision": approvalDecide,
  "GET team/invitations": inviteList, "POST team/invitations": inviteCreate, "POST team/invitations/:id/:action": inviteAction,
};
/** Finds the handler for a request; `:name` segments match anything. */
export function route(method: string, path: string[]): H | null { return match(method, path)?.[1] ?? null; }
function match(method: string, path: string[]): [string, H] | null {
  for (const [k, h] of Object.entries(ROUTES)) {
    const [m, p] = k.split(" "); const parts = p.split("/");
    if (m === method && parts.length === path.length && parts.every((x, i) => x.startsWith(":") || x === path[i])) return [k, h];
  }
  return null;
}
/** Origin check for every state-changing request (the cookie is SameSite=Strict too): a request from another site is refused. */
export async function handle(d: Deps, r: Req): Promise<Res> {
  const found = match(r.method, r.path); if (!found) return err(404, "Not found.");
  const [key, h] = found;
  if (r.method !== "GET") {
    if (r.headers.origin !== d.site.origin) return err(403, "Cross-site request refused.");
    if (!/^application\/json/.test(r.headers["content-type"] || "")) return err(415, "Send JSON.");
  }
  // The person sees a generic message; the function log gets the route pattern, the failing step and Supabase's code (errors.ts), never values.
  try { return await h(d, r); } catch (e) { logFailure(key, e, r.headers["x-vercel-id"]); return err(500, "Something went wrong. Please try again."); }
}
