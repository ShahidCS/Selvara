/* Sign-in in mock mode (no backend): the browser holds the accounts and does the checks, so the flow can be shown and tested end to end. In production
   (NEXT_PUBLIC_API_MODE=http) the same steps run on the server through services/authApi.ts and this file is not used for accounts.
   Two kinds of account, kept apart:
   - Real accounts: people who asked to join and were approved by a company admin. Own password, an authenticator app (TOTP, RFC 6238) enrolled at
     the first sign-in and required at every sign-in, and single-use recovery codes.
   - Demo accounts: one shared synthetic account per persona, ONLY in mock mode, documented in README.md. Limited: labelled as demo everywhere, a
     one-hour session, the second step shows its own code on screen, and the shared password cannot be changed or reset.
   Passwords are compared as salted SHA-256 hashes here; the server uses a slow KDF (Argon2id). Rules: docs/security/SOD_MATRIX.md section 12. */
import { ROLES, roleOf, setSessionPerson } from "./rbac";
import { newSecret, otpauthUri, verifyTotp } from "./totp";
import { checkRegistration, newChallenge, verifyAssertion, type StoredPasskey } from "./webauthn";
import { generateRecoveryCodes } from "./me";
import { SodError, baseRole } from "./sod";
import { clampText, isEmail, secureHex } from "./security";
import { checkPassword, THROTTLED_MSG } from "./credentials";
import { appStore, bumpData, persist } from "./store";
import { wsLog } from "./audit";
import { adminLog } from "./adminAudit";
import { elevationActive, endElevation } from "./elevation";
import { allowAction, allowJoin, clientIp, ipBlockMessage, isTrusted, recentFailures, recordIpFailure, recordIpSuccess, reputationOf } from "./ipGuard";
import { CHALLENGE, LOCKOUT, MFA, ruleFor, RESET, acct, hasRecentAuth, allowResetFor, dropTicket, getTicket, hashCodes, newTicket, redeemRecoveryCode, type Ticket, clearRecentAuth, createReset, currentSession, deviceLabel, endCurrentSession, findReset, markRecentAuth, notify, revokeSessions, saveAcct, setWelcome, sha256, startSession, verifyChallenge } from "./accountSecurity";

/** Sign-in events go to the audit log of the space the person works in. */
function logAuth(action: string) {
  const r = roleOf(appStore.get().role);
  if (r.spaces.includes("ws")) wsLog(action, r.person, "Access"); else adminLog(action, r.person, { categories: ["Account"] });
}

/** Demo accounts exist only when the app runs without an API (the public demonstration). A production build has none. */
export const DEMO_ENABLED = (process.env.NEXT_PUBLIC_API_MODE || "mock") !== "http";
export const DEMO_DOMAIN = "demo.selvara.test";
/** "Jordan Avery" -> "jordan.avery@demo.selvara.test". */
export const demoEmail = (person: string) => person.toLowerCase().replace(/[^a-z ]/g, "").trim().split(/\s+/).join(".") + "@" + DEMO_DOMAIN;
export interface DemoAccount { email: string; roleId: string; person: string; roleName: string }
export const DEMO_ACCOUNTS: DemoAccount[] = ROLES.map((r) => ({ email: demoEmail(r.person), roleId: r.id, person: r.person, roleName: r.name }));
/** SHA-256 of "selvara-demo-account:" + the shared demo password. */
const DEMO_HASH = "c41d1a8e807d77066e922a9f54a0bd6abca4807b003cfff3bd159f165ed81368";
/** Role a person who joins through a request receives. Anything more is a separate, approved role change. */
export const JOIN_ROLE = "employee";
export const JOIN = { REASON_MIN: 10, MAX_FAILS: 5, LOCK_MS: 5 * 60_000 };
export const SIGNIN_FAILED = "Email or password is incorrect.";

const norm = (email: string) => String(email ?? "").trim().toLowerCase();

/* ---------- people who asked to join ---------- */
export type JoinStatus = "Pending" | "Active" | "Rejected";
export interface JoinRequest { id: string; name: string; email: string; salt: string; hash: string; status: JoinStatus; requestedAt: number; decidedBy?: string; decidedAt?: number; reason?: string }
const KEY = "selvara.demo.members";
let MEMBERS: JoinRequest[] | null = null;
function members(): JoinRequest[] {
  if (MEMBERS) return MEMBERS;
  MEMBERS = [];
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (Array.isArray(list)) MEMBERS = list.filter((m) => m && typeof m.email === "string" && typeof m.hash === "string" && typeof m.name === "string").slice(0, 200);
  } catch { /* unreadable: start empty */ }
  return MEMBERS;
}
export function saveJoinRequests() { try { localStorage.setItem(KEY, JSON.stringify(members())); } catch { /* storage unavailable: kept in memory */ } bumpData(); }
export const joinRequests = (): JoinRequest[] => members();
/** Test helper: forget every join request (memory and storage). */
export function resetMembers() { MEMBERS = []; try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

export interface JoinInput { name: string; email: string; password: string }
/** Ask to join as an Employee. The answer never says whether the email is already known (no account enumeration); a duplicate is ignored. */
export async function requestToJoin(input: JoinInput): Promise<void> {
  const name = clampText(input.name, 80); const email = norm(input.email);
  if (name.length < 2) throw new Error("Enter your full name.");
  if (!isEmail(email)) throw new Error("Enter a valid work email address.");
  const pw = checkPassword(String(input.password ?? ""), { email, name });
  if (!pw.ok) throw new Error(pw.errors[0] || "Choose a stronger password.");
  const ip = clientIp(); const blocked = ipBlockMessage(ip); if (blocked) throw new Error(blocked);
  if (!allowJoin(ip)) throw new Error("Too many requests to join from your network. Try again in an hour.");
  if (email.endsWith("@" + DEMO_DOMAIN) || members().some((m) => m.email === email && m.status !== "Rejected")) return;
  const salt = secureHex(16);
  members().push({ id: "JR-" + secureHex(4).toUpperCase(), name, email, salt, hash: await sha256(salt + ":" + String(input.password)), status: "Pending", requestedAt: Date.now() });
  saveJoinRequests();
  wsLog("team.join.requested", `${name} <${email}>`, "Access", `${name} (not signed in)`);
}

/* ---------- passwords ---------- */
/** True when `password` is the account's current password (a changed or reset password first, then the account's original one). */
export async function verifyPassword(email: string, password: string): Promise<boolean> {
  const o = acct().pw[email]; const pw = String(password ?? "");
  if (o) return (await sha256(o.salt + ":" + pw)) === o.hash;
  if (DEMO_ENABLED && DEMO_ACCOUNTS.some((a) => a.email === email)) return (await sha256("selvara-demo-account:" + pw)) === DEMO_HASH;
  const m = members().find((x) => x.email === email);
  return !!m && (await sha256(m.salt + ":" + pw)) === m.hash;
}
async function setPassword(email: string, password: string) { const salt = secureHex(16); acct().pw[email] = { salt, hash: await sha256(salt + ":" + password), changedAt: Date.now() }; saveAcct(); }
/** The account a sign-in email names, if it may sign in at all (demo persona, or a member whose request was approved). */
function accountOf(email: string): { email: string; person: string; roleId: string; who: string | null; status: JoinStatus | "Demo" } | null {
  const d = DEMO_ENABLED ? DEMO_ACCOUNTS.find((a) => a.email === email) : undefined;
  if (d) return { email, person: d.person, roleId: d.roleId, who: null, status: "Demo" };
  const m = members().find((x) => x.email === email && x.status !== "Rejected") || members().find((x) => x.email === email);
  return m ? { email, person: m.name, roleId: JOIN_ROLE, who: m.name, status: m.status } : null;
}
/** The signed-in person's account. */
export function currentAccount(): { email: string; person: string } | null {
  const s = appStore.get(); if (!s.signedIn) return null;
  if (s.who) { const m = members().find((x) => x.name === s.who && x.status === "Active"); return m ? { email: m.email, person: m.name } : null; }
  const d = DEMO_ENABLED ? DEMO_ACCOUNTS.find((a) => a.roleId === s.role) : undefined; return d ? { email: d.email, person: d.person } : null;
}
/** True when the signed-in account is a shared demo account (limited: see the header of this file). */
export const isDemoAccount = (email?: string) => !!(email || currentAccount()?.email)?.endsWith("@" + DEMO_DOMAIN);
const platformOnly = (roleId: string) => !roleOf(roleId).spaces.includes("ws");
/** Lockout for an account: the company preset for workspace accounts; platform accounts are always strict. */
export const lockoutFor = (roleId: string) => (platformOnly(roleId) ? LOCKOUT.strict : ruleFor(acct().lockout));

/* ---------- sign in and out ---------- */
/** Thrown when the sign-in needs the challenge step first. It is not a failed attempt. */
export class ChallengeRequired extends Error { constructor() { super("Confirm you are not an automated script to continue."); this.name = "ChallengeRequired"; } }
const fails = new Map<string, { n: number; until: number }>();
const blockNotified = new Set<string>();
/** Test helper: forget account locks and alerts already sent about blocks (in memory). */
export function resetSignInState() { fails.clear(); blockNotified.clear(); }
/** The challenge is needed on hosting, VPN or proxy addresses, and after 3 recent failures from the address or on the account (never on a trusted office network). */
export function challengeNeeded(email: string, ip = clientIp()): boolean {
  if (isTrusted(ip)) return false;
  return !!reputationOf(ip) || recentFailures(ip) >= CHALLENGE.AFTER_FAILS || (fails.get(norm(email))?.n || 0) >= CHALLENGE.AFTER_FAILS;
}
function fail(email: string, ip: string): never {
  recordIpFailure(ip);
  const acc = accountOf(email);
  if (acc) { const s = acct(); s.failedSince[email] = (s.failedSince[email] || 0) + 1; saveAcct(); }
  const blocked = ipBlockMessage(ip); if (blocked) { if (acc) noteBlock(email, ip); throw new Error(blocked); }
  const pol = lockoutFor(acc?.roleId || "employee");
  const f = fails.get(email) || { n: 0, until: 0 }; f.n += 1;
  if (f.n >= pol.attempts) {
    f.until = Date.now() + pol.lockMs; f.n = 0;
    if (acc) notify(email, `Your account was locked for ${pol.lockMs / 60_000} minutes after ${pol.attempts} failed sign-in attempts. If they were not you, change your password once you can sign in.`);
  }
  fails.set(email, f);
  throw new Error(SIGNIN_FAILED);
}
function noteBlock(email: string, ip: string) {
  const key = email + "|" + ip; if (blockNotified.has(key)) return; blockNotified.add(key);
  notify(email, "Sign-in attempts to your account came from a network address that is now blocked after repeated failures.");
}
function start(acc: { email: string; roleId: string; who: string | null; status: string }, ip: string) {
  setSessionPerson(acc.who ? { roleId: acc.roleId, person: acc.who } : null);
  appStore.set({ role: acc.roleId, who: acc.who, signedIn: true, groupsOpen: {} }); persist();
  startSession(acc.email, ip, acc.status === "Demo"); markRecentAuth();
  logAuth("auth.signed_in");
}
/** After a correct password: the second step. `enroll` gives a new authenticator secret to add; `demo` shows its own code (demo accounts only). */
export type SignInStep =
  | { step: "mfa"; ticket: string; method: "totp" }
  | { step: "mfa"; ticket: string; method: "demo"; demoCode: string }
  | { step: "enroll"; ticket: string; secret: string; uri: string }
  /** Platform super admins: a passkey (added at the first sign-in). `demoCode` is a fallback in the demonstration build only, for devices without passkeys. */
  | { step: "passkey"; ticket: string; register: boolean; challenge: string; rpId: string; allow: string[]; email: string; name: string; demoCode?: string };
/** Step one: email and password (and the challenge answer when asked). Errors are generic, except for a proven password on a request that is not
 *  approved. Nobody is signed in until the second step succeeds (completeSignIn). */
export async function signIn(emailIn: string, password: string, challenge?: { seed: string; nonce: number }): Promise<SignInStep> {
  const email = norm(emailIn); const ip = clientIp();
  const blocked = ipBlockMessage(ip); // checked first: a blocked network cannot try any account
  if (blocked) { if (accountOf(email)) noteBlock(email, ip); throw new Error(blocked); }
  const f = fails.get(email);
  if (f && f.until > Date.now()) { recordIpFailure(ip); throw new Error(ipBlockMessage(ip) || THROTTLED_MSG); } // still counts against the network
  if (challengeNeeded(email, ip) && !(await verifyChallenge(challenge))) throw new ChallengeRequired();
  const acc = accountOf(email);
  if (!acc || !(await verifyPassword(email, password))) fail(email, ip);
  if (acc.status === "Pending") throw new Error("Your request to join is waiting for a company admin to approve it.");
  if (acc.status === "Rejected") throw new Error("Your request to join was not approved. Ask a company admin.");
  if (needsPasskey(acc.roleId)) {
    const keys = acct().passkeys[email] || []; const challenge = newChallenge();
    const demoCode = acc.status === "Demo" ? String(100000 + Math.floor(Math.random() * 900000)) : undefined;
    const t = newTicket({ email, method: "passkey", webauthn: { challenge, register: keys.length === 0 }, demoCode });
    return { step: "passkey", ticket: t.id, register: keys.length === 0, challenge, rpId: site().rpId, allow: keys.map((k) => k.id), email, name: acc.person, demoCode };
  }
  if (acc.status === "Demo") {
    const t = newTicket({ email, method: "demo", demoCode: String(100000 + Math.floor(Math.random() * 900000)) });
    return { step: "mfa", ticket: t.id, method: "demo", demoCode: t.demoCode as string };
  }
  if (!acct().mfa[email]) { const secret = newSecret(); const t = newTicket({ email, method: "enroll", secret }); return { step: "enroll", ticket: t.id, secret, uri: otpauthUri(secret, email) }; }
  return { step: "mfa", ticket: newTicket({ email, method: "totp" }).id, method: "totp" };
}
export interface SignInResult { roleId: string; person: string; previous: { at: number; ip: string; device: string } | null; failedSince: number; recoveryCodes?: string[]; recoveryLeft?: number }
/** Step two: the authenticator code (or a recovery code, `recovery: true`), or the first code from a newly added authenticator. A wrong code counts
 *  as a failed sign-in for the account and the address; the owner is alerted the first time a correct password is followed by a wrong code. */
export async function completeSignIn(ticketId: string, code: string, opts: { recovery?: boolean } = {}): Promise<SignInResult> {
  const t = getTicket(ticketId); if (!t) throw new Error("This sign-in has expired. Start again.");
  const ip = clientIp(); const blocked = ipBlockMessage(ip); if (blocked) { dropTicket(t.id); throw new Error(blocked); }
  const acc = accountOf(t.email); if (!acc) throw new Error("This sign-in has expired. Start again.");
  let recoveryCodes: string[] | undefined; let recoveryLeft: number | undefined;
  const wrong = (): never => {
    t.tries += 1; recordIpFailure(ip);
    const s = acct(); s.failedSince[t.email] = (s.failedSince[t.email] || 0) + 1; saveAcct();
    if (!t.alerted && t.method !== "enroll") { t.alerted = true; notify(t.email, "Someone entered your correct password but then failed the second step. If this was not you, change your password now."); }
    const pol = lockoutFor(acc.roleId); const fl = fails.get(t.email) || { n: 0, until: 0 }; fl.n += 1;
    if (fl.n >= pol.attempts) { fl.until = Date.now() + pol.lockMs; fl.n = 0; dropTicket(t.id); fails.set(t.email, fl); throw new Error(THROTTLED_MSG); }
    fails.set(t.email, fl);
    if (t.tries >= MFA.TRIES) { dropTicket(t.id); throw new Error("Too many wrong codes. Start again."); }
    throw new Error(ipBlockMessage(ip) || "That code is not correct.");
  };
  if (t.method === "demo" || t.method === "passkey") { if (!t.demoCode || String(code).trim() !== t.demoCode) wrong(); } // passkey tickets accept a code only as the demo fallback
  else if (t.method === "enroll") {
    const step = await verifyTotp(t.secret as string, code); if (step === null) wrong();
    recoveryCodes = generateRecoveryCodes(MFA.RECOVERY_CODES);
    acct().mfa[t.email] = { secret: t.secret as string, lastStep: step as number, enrolledAt: Date.now(), codes: await hashCodes(recoveryCodes) }; saveAcct();
    notify(t.email, "An authenticator app was added to your account and new recovery codes were issued.");
  } else {
    const f = acct().mfa[t.email];
    if (opts.recovery) {
      const left = await redeemRecoveryCode(f, code); if (left < 0) wrong();
      recoveryLeft = left; notify(t.email, `A recovery code was used to sign in. ${left} left.`);
    } else {
      const step = await verifyTotp(f.secret, code, f.lastStep); if (step === null) wrong();
      f.lastStep = step as number; saveAcct();
    }
  }
  return finish(t, acc, ip, { recoveryCodes, recoveryLeft });
}
/** The end of every successful second step: counters cleared, last sign-in recorded, the session started. */
function finish(t: Ticket, acc: NonNullable<ReturnType<typeof accountOf>>, ip: string, extra: { recoveryCodes?: string[]; recoveryLeft?: number } = {}): SignInResult {
  dropTicket(t.id); fails.delete(t.email); recordIpSuccess(ip);
  const s = acct(); const previous = s.last[t.email] || null; const failedSince = s.failedSince[t.email] || 0;
  s.last[t.email] = { at: Date.now(), ip, device: deviceLabel() }; s.failedSince[t.email] = 0; saveAcct();
  if (failedSince >= CHALLENGE.AFTER_FAILS) notify(t.email, `Signed in after ${failedSince} failed attempts since your last sign-in. If you did not make them, change your password.`);
  start(acc, ip);
  setWelcome({ previous, failedSince });
  return { roleId: acc.roleId, person: acc.person, previous, failedSince, ...extra };
}

/* ---------- passkeys (platform super admins) ---------- */
const site = () => (typeof location === "undefined" ? { rpId: "localhost", origin: "http://localhost" } : { rpId: location.hostname, origin: location.origin });
/** Platform super admins must use a passkey as their second step (SOD_MATRIX §2). */
export const needsPasskey = (roleId: string) => baseRole(roleId) === "super";
/** Finish the passkey step: either the new passkey (first sign-in) or a signature from an existing one. A failure counts like a wrong code. */
export async function completePasskey(ticketId: string, p: { register: { id: string; publicKey: string; clientDataJSON: string } } | { assertion: { id: string; authenticatorData: string; clientDataJSON: string; signature: string } }): Promise<SignInResult> {
  const t = getTicket(ticketId); if (!t || t.method !== "passkey" || !t.webauthn) throw new Error("This sign-in has expired. Start again.");
  const ip = clientIp(); const blocked = ipBlockMessage(ip); if (blocked) { dropTicket(t.id); throw new Error(blocked); }
  const acc = accountOf(t.email); if (!acc) throw new Error("This sign-in has expired. Start again.");
  const s = acct(); const keys = s.passkeys[t.email] || [];
  const refuse = (): never => { t.tries += 1; recordIpFailure(ip); notifyOnce(t); if (t.tries >= MFA.TRIES) dropTicket(t.id); throw new Error("That passkey could not be verified. Try again."); };
  if ("register" in p) {
    if (!t.webauthn.register || !checkRegistration(p.register.clientDataJSON, { challenge: t.webauthn.challenge, origin: site().origin })) refuse();
    s.passkeys[t.email] = [...keys, { id: p.register.id, publicKey: p.register.publicKey, signCount: 0, createdAt: Date.now(), label: deviceLabel() }]; saveAcct();
    notify(t.email, `A passkey was added to your account (${deviceLabel()}).`);
    logAuthFor(acc, "auth.passkey.added");
  } else {
    const key = keys.find((k) => k.id === p.assertion.id); if (!key) refuse();
    const count = await verifyAssertion(p.assertion, key as StoredPasskey, { challenge: t.webauthn.challenge, origin: site().origin, rpId: site().rpId });
    if (count === null) refuse();
    (key as StoredPasskey).signCount = count as number; saveAcct();
  }
  return finish(t, acc, ip);
}
function notifyOnce(t: Ticket) { if (!t.alerted) { t.alerted = true; notify(t.email, "Someone entered your correct password but then failed the second step. If this was not you, change your password now."); } }
function logAuthFor(acc: { roleId: string; person: string }, action: string) {
  if (roleOf(acc.roleId).spaces.includes("ws")) wsLog(action, acc.person, "Access", acc.person); else adminLog(action, acc.person, { actor: acc.person, role: roleOf(acc.roleId).name, categories: ["Account"] });
}
/** The signed-in person's passkeys. */
export const myPasskeys = (): StoredPasskey[] => { const me = currentAccount(); return me ? acct().passkeys[me.email] || [] : []; };
/** Remove a passkey: the password confirmed within 5 minutes; a super admin's last passkey cannot be removed. */
export function removePasskey(id: string) {
  const me = currentAccount(); if (!me) throw new Error("Sign in first.");
  if (!hasRecentAuth()) throw new SodError("Confirm your password first.");
  const keys = acct().passkeys[me.email] || []; const k = keys.find((x) => x.id === id); if (!k) throw new SodError("Passkey not found.");
  if (needsPasskey(appStore.get().role) && keys.length <= 1) throw new SodError("Platform super admins must keep at least one passkey.");
  acct().passkeys[me.email] = keys.filter((x) => x.id !== id); saveAcct();
  notify(me.email, "A passkey was removed from your account."); logAuth("auth.passkey.removed");
}
/** Add another passkey from the account page: the password confirmed within 5 minutes. Returns the challenge to sign. */
export function startAddPasskey(): { challenge: string; rpId: string; exclude: string[]; email: string; name: string } {
  const me = currentAccount(); if (!me) throw new Error("Sign in first.");
  if (!hasRecentAuth()) throw new SodError("Confirm your password first.");
  pendingAdd = newChallenge();
  return { challenge: pendingAdd, rpId: site().rpId, exclude: (acct().passkeys[me.email] || []).map((k) => k.id), email: me.email, name: me.person };
}
let pendingAdd: string | null = null;
export function finishAddPasskey(r: { id: string; publicKey: string; clientDataJSON: string }) {
  const me = currentAccount(); if (!me || !pendingAdd) throw new Error("Start again.");
  const ok = checkRegistration(r.clientDataJSON, { challenge: pendingAdd, origin: site().origin }); pendingAdd = null;
  if (!ok) throw new SodError("That passkey could not be verified.");
  const s = acct(); s.passkeys[me.email] = [...(s.passkeys[me.email] || []), { id: r.id, publicKey: r.publicKey, signCount: 0, createdAt: Date.now(), label: deviceLabel() }]; saveAcct();
  notify(me.email, `A passkey was added to your account (${deviceLabel()}).`); logAuth("auth.passkey.added");
}
export type { Ticket };
export function signOut(audit = true) {
  if (elevationActive()) endElevation("ended", "on sign-out"); // privileged access never outlives the session
  if (audit && appStore.get().signedIn) logAuth("auth.signed_out");
  endCurrentSession(); clearRecentAuth(); setWelcome(null);
  setSessionPerson(null);
  appStore.set({ signedIn: false, who: null, groupsOpen: {} }); persist();
}
/** Re-applies the signed-in person after a page load (called once the persisted state is read). A session ended elsewhere (sign out other sessions,
 *  a password reset) or a `who` that is no longer an active member signs out. */
export function restoreSession() {
  const s = appStore.get();
  if (!s.signedIn) { setSessionPerson(null); return; }
  if (s.who) {
    const ok = members().some((m) => m.name === s.who && m.status === "Active");
    if (!ok || s.role !== JOIN_ROLE) { signOut(false); return; }
    setSessionPerson({ roleId: JOIN_ROLE, person: s.who });
  } else setSessionPerson(null);
  const a = acct();
  if (a.current && !currentSession()) { signOut(false); return; }
  const me = currentAccount();
  if (!a.current && me) startSession(me.email, clientIp(), isDemoAccount(me.email)); // a stored sign-in from before sessions were recorded
}

/* ---------- sensitive changes (re-authentication) ---------- */
/** Confirms the signed-in person's password; valid for 5 minutes. A wrong password counts as a failed attempt. */
export async function reauthenticate(password: string): Promise<void> {
  const me = currentAccount(); if (!me) throw new Error("Sign in first.");
  const ip = clientIp(); const blocked = ipBlockMessage(ip); if (blocked) throw new Error(blocked);
  if (!(await verifyPassword(me.email, password))) {
    recordIpFailure(ip);
    const f = fails.get(me.email) || { n: 0, until: 0 }; f.n += 1; fails.set(me.email, f);
    throw new Error("That password is not correct.");
  }
  markRecentAuth();
}
/** Change the password: needs the current one; ends every other session; alerts the owner; audited. */
export async function changePassword(current: string, next: string): Promise<void> {
  const me = currentAccount(); if (!me) throw new Error("Sign in first.");
  if (isDemoAccount(me.email)) throw new SodError("Demo accounts are shared: their password cannot be changed.");
  await reauthenticate(current);
  const pw = checkPassword(String(next ?? ""), { email: me.email, name: me.person });
  if (!pw.ok) throw new Error(pw.errors[0] || "Choose a stronger password.");
  if (await verifyPassword(me.email, next)) throw new Error("Choose a password you are not using now.");
  await setPassword(me.email, next);
  const ended = revokeSessions(me.email, "Password changed", acct().current || undefined);
  notify(me.email, `Your password was changed${ended ? ` and ${ended} other session${ended === 1 ? " was" : "s were"} signed out` : ""}. If this was not you, reset it now.`);
  logAuth("auth.password.changed");
}
/** Ends every other session of the signed-in person. Safe direction: no re-authentication needed. */
export function signOutOtherSessions(): number {
  const me = currentAccount(); if (!me) throw new Error("Sign in first.");
  const n = revokeSessions(me.email, "Signed out from another session", acct().current || undefined);
  if (n) notify(me.email, `${n} other session${n === 1 ? " was" : "s were"} signed out from ${deviceLabel()}.`);
  logAuth("session.others.revoked");
  return n;
}

/* ---------- password reset ---------- */
export const RESET_SENT = "If an account uses that email, we have sent a link to reset its password. The link works once, for 15 minutes.";
/** Ask for a reset link. The answer is always the same; the demo returns what the email would contain (a link token and the code the person's
 *  authenticator would show) whether or not the account exists, so the page reveals nothing. Rate limited per address and per account; never locks. */
export const DEMO_RESET_NOTE = "Demo accounts are shared: their password cannot be reset. Use a real account (Request to join) to try a reset.";
/** Ask for a reset link. The answer is always the same and never says whether the account exists. In mock mode the result carries the link the
 *  email would contain (a random one that leads nowhere when there is no account), so the page reveals nothing either. Demo accounts get no link.
 *  Rate limited per address and per account; never locks the account. */
export function requestReset(emailIn: string): { token: string } {
  const email = norm(emailIn); const ip = clientIp();
  const blocked = ipBlockMessage(ip); if (blocked) throw new Error(blocked);
  if (!isEmail(email)) throw new Error("Enter a valid work email address.");
  if (!allowAction(ip, "reset", RESET.MAX_PER_HOUR, 3_600_000)) throw new Error("Too many reset requests from your network. Try again in an hour.");
  const acc = accountOf(email);
  if (acc && acc.status === "Active" && allowResetFor(email)) {
    const link = createReset(email);
    notify(email, "A password reset was requested for your account. If this was not you, you can ignore it: your password has not changed.");
    wsLog("auth.password.reset_requested", acc.person, "Access", acc.person);
    return { token: link.token };
  }
  return { token: secureHex(16) };
}
export const resetLinkValid = (token: string) => !!findReset(token);
/** Finish a reset: the link (single use, 15 minutes) AND the second factor are both needed; every session ends and nobody is signed in. */
export async function completeReset(token: string, code: string, next: string): Promise<void> {
  const link = findReset(token);
  if (!link) throw new Error("This link is not valid or has expired. Ask for a new one.");
  const acc = accountOf(link.email); if (!acc || acc.status !== "Active") throw new Error("This link is not valid or has expired. Ask for a new one.");
  // a reset never skips the second factor: the authenticator code, or a recovery code
  const f = acct().mfa[link.email];
  if (!f) throw new Error("This account has no second factor yet, so it cannot be reset. Ask a company admin.");
  const c = String(code ?? "").trim();
  const step = /^\d{6}$/.test(c) ? await verifyTotp(f.secret, c, f.lastStep) : null;
  const ok = step !== null || (await redeemRecoveryCode(f, c)) >= 0;
  if (!ok) {
    link.codeFails += 1; if (link.codeFails >= RESET.CODE_TRIES) link.used = true; saveAcct();
    throw new Error(link.used ? "Too many wrong codes. Ask for a new link." : "That code is not correct.");
  }
  if (step !== null) { f.lastStep = step; saveAcct(); }
  const pw = checkPassword(String(next ?? ""), { email: link.email, name: acc.person });
  if (!pw.ok) throw new Error(pw.errors[0] || "Choose a stronger password.");
  await setPassword(link.email, next);
  acct().resets.forEach((r) => { if (r.email === link.email) r.used = true; });
  const ended = revokeSessions(link.email, "Password reset");
  fails.delete(link.email);
  notify(link.email, `Your password was reset${ended ? ` and ${ended} session${ended === 1 ? " was" : "s were"} signed out` : ""}. If this was not you, contact your administrator now.`);
  wsLog("auth.password.reset", acc.person, "Access", acc.person);
}

/** Name shown for the signed-in person. */
export const currentPerson = () => roleOf(appStore.get().role).person;

/* ---------- recovery codes and server sessions ---------- */
/** New recovery codes for a real account: the password confirmed within 5 minutes, the old codes replaced, the owner alerted. Returned once. */
export async function regenerateRecoveryCodes(): Promise<string[]> {
  const me = currentAccount(); if (!me) throw new Error("Sign in first.");
  if (isDemoAccount(me.email)) throw new SodError("Demo accounts have no recovery codes.");
  if (!hasRecentAuth()) throw new SodError("Confirm your password first.");
  const f = acct().mfa[me.email]; if (!f) throw new SodError("Add an authenticator app first.");
  const codes = generateRecoveryCodes(MFA.RECOVERY_CODES); f.codes = await hashCodes(codes); saveAcct();
  notify(me.email, "New recovery codes were issued. The old ones no longer work.");
  logAuth("recovery.codes.regenerated");
  return codes;
}
/** Production: after the server signs someone in, mirror who they are in the client (display and UI gating only; the server decides). */
export function applyServerSession(roleId: string, person: string | null) {
  setSessionPerson(person ? { roleId, person } : null);
  appStore.set({ role: roleId, who: person, signedIn: true, groupsOpen: {} }); persist();
}

