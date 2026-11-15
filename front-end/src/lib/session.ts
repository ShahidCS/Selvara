/* Demo sign-in (DEMO ONLY: there is no backend). Seeded synthetic accounts, one per persona, plus people who asked to join and were approved by a
   company admin. Passwords are compared as SHA-256 hashes; no password is stored in plain text. This is NOT an authentication control: the real
   API must authenticate on the server (hashing with a slow KDF such as Argon2id, rate limits, MFA, session management) and never trust the client.
   Demo account emails and the shared demo password are documented in README.md only, not shown in the product. */
import { ROLES, roleOf, setSessionPerson } from "./rbac";
import { clampText, isEmail, secureHex } from "./security";
import { checkPassword, THROTTLED_MSG } from "./credentials";
import { appStore, bumpData, persist } from "./store";
import { wsLog } from "./audit";
import { adminLog } from "./adminAudit";
import { elevationActive, endElevation } from "./elevation";
import { allowAction, allowJoin, clientIp, ipBlockMessage, isTrusted, recentFailures, recordIpFailure, recordIpSuccess, reputationOf } from "./ipGuard";
import { CHALLENGE, LOCKOUT, RESET, acct, allowResetFor, clearRecentAuth, createReset, currentSession, deviceLabel, endCurrentSession, findReset, markRecentAuth, notify, revokeSessions, saveAcct, setWelcome, sha256, startSession, verifyChallenge } from "./accountSecurity";

/** Sign-in events go to the audit log of the space the person works in. */
function logAuth(action: string) {
  const r = roleOf(appStore.get().role);
  if (r.spaces.includes("ws")) wsLog(action, r.person, "Access"); else adminLog(action, r.person, { categories: ["Account"] });
}

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
  if (DEMO_ACCOUNTS.some((a) => a.email === email)) return (await sha256("selvara-demo-account:" + pw)) === DEMO_HASH;
  const m = members().find((x) => x.email === email);
  return !!m && (await sha256(m.salt + ":" + pw)) === m.hash;
}
async function setPassword(email: string, password: string) { const salt = secureHex(16); acct().pw[email] = { salt, hash: await sha256(salt + ":" + password), changedAt: Date.now() }; saveAcct(); }
/** The account a sign-in email names, if it may sign in at all (demo persona, or a member whose request was approved). */
function accountOf(email: string): { email: string; person: string; roleId: string; who: string | null; status: JoinStatus | "Demo" } | null {
  const d = DEMO_ACCOUNTS.find((a) => a.email === email);
  if (d) return { email, person: d.person, roleId: d.roleId, who: null, status: "Demo" };
  const m = members().find((x) => x.email === email && x.status !== "Rejected") || members().find((x) => x.email === email);
  return m ? { email, person: m.name, roleId: JOIN_ROLE, who: m.name, status: m.status } : null;
}
/** The signed-in person's account. */
export function currentAccount(): { email: string; person: string } | null {
  const s = appStore.get(); if (!s.signedIn) return null;
  if (s.who) { const m = members().find((x) => x.name === s.who && x.status === "Active"); return m ? { email: m.email, person: m.name } : null; }
  const d = DEMO_ACCOUNTS.find((a) => a.roleId === s.role); return d ? { email: d.email, person: d.person } : null;
}
const platformOnly = (roleId: string) => !roleOf(roleId).spaces.includes("ws");
/** Lockout for an account: the company preset for workspace accounts; platform accounts are always strict. */
export const lockoutFor = (roleId: string) => LOCKOUT[platformOnly(roleId) ? "strict" : acct().lockout];

/* ---------- sign in and out ---------- */
/** Thrown when the sign-in needs the challenge step first. It is not a failed attempt. */
export class ChallengeRequired extends Error { constructor() { super("Confirm you are not an automated script to continue."); this.name = "ChallengeRequired"; } }
export interface SignInResult { roleId: string; person: string; previous: { at: number; ip: string; device: string } | null; failedSince: number }
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
function start(acc: { email: string; roleId: string; who: string | null }, ip: string) {
  setSessionPerson(acc.who ? { roleId: acc.roleId, person: acc.who } : null);
  appStore.set({ role: acc.roleId, who: acc.who, signedIn: true, groupsOpen: {} }); persist();
  startSession(acc.email, ip); markRecentAuth();
  logAuth("auth.signed_in");
}
/** Signs in with email and password (and the challenge answer when one was asked for). Errors are generic, except for a proven password on a request
 *  that is not approved. The account locks per the company preset; the network address is blocked per lib/ipGuard.ts. */
export async function signIn(emailIn: string, password: string, challenge?: { seed: string; nonce: number }): Promise<SignInResult> {
  const email = norm(emailIn); const ip = clientIp();
  const blocked = ipBlockMessage(ip); // checked first: a blocked network cannot try any account
  if (blocked) { if (accountOf(email)) noteBlock(email, ip); throw new Error(blocked); }
  const f = fails.get(email);
  if (f && f.until > Date.now()) { recordIpFailure(ip); throw new Error(ipBlockMessage(ip) || THROTTLED_MSG); } // still counts against the network
  if (challengeNeeded(email, ip) && !(await verifyChallenge(challenge))) throw new ChallengeRequired();
  const acc = accountOf(email);
  if (!acc || !(await verifyPassword(email, password))) fail(email, ip);
  fails.delete(email); recordIpSuccess(ip);
  if (acc.status === "Pending") throw new Error("Your request to join is waiting for a company admin to approve it.");
  if (acc.status === "Rejected") throw new Error("Your request to join was not approved. Ask a company admin.");
  const s = acct(); const previous = s.last[email] || null; const failedSince = s.failedSince[email] || 0;
  s.last[email] = { at: Date.now(), ip, device: deviceLabel() }; s.failedSince[email] = 0; saveAcct();
  if (failedSince >= CHALLENGE.AFTER_FAILS) notify(email, `Signed in after ${failedSince} failed attempts since your last sign-in. If you did not make them, change your password.`);
  start(acc, ip);
  setWelcome({ previous, failedSince });
  return { roleId: acc.roleId, person: acc.person, previous, failedSince };
}
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
  if (!a.current && me) startSession(me.email, clientIp()); // a stored sign-in from before sessions were recorded
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
export function requestReset(emailIn: string): { token: string; code: string } {
  const email = norm(emailIn); const ip = clientIp();
  const blocked = ipBlockMessage(ip); if (blocked) throw new Error(blocked);
  if (!isEmail(email)) throw new Error("Enter a valid work email address.");
  if (!allowAction(ip, "reset", RESET.MAX_PER_HOUR, 3_600_000)) throw new Error("Too many reset requests from your network. Try again in an hour.");
  const acc = accountOf(email);
  if (acc && (acc.status === "Demo" || acc.status === "Active") && allowResetFor(email)) {
    const link = createReset(email);
    notify(email, "A password reset was requested for your account. If this was not you, you can ignore it: your password has not changed.");
    wsLog("auth.password.reset_requested", acc.person, "Access", acc.person);
    return { token: link.token, code: link.code };
  }
  return { token: secureHex(16), code: String(100000 + Math.floor(Math.random() * 900000)) };
}
export const resetLinkValid = (token: string) => !!findReset(token);
/** Finish a reset: the link (single use, 15 minutes) AND the second factor are both needed; every session ends and nobody is signed in. */
export async function completeReset(token: string, code: string, next: string): Promise<void> {
  const link = findReset(token);
  if (!link) throw new Error("This link is not valid or has expired. Ask for a new one.");
  if (String(code ?? "").trim() !== link.code) {
    link.codeFails += 1; if (link.codeFails >= RESET.CODE_TRIES) link.used = true; saveAcct();
    throw new Error(link.used ? "Too many wrong codes. Ask for a new link." : "That code is not correct.");
  }
  const acc = accountOf(link.email); if (!acc) throw new Error("This link is not valid or has expired. Ask for a new one.");
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
