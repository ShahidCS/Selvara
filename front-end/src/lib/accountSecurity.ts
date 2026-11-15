/* Account security for the demo sign-in (DEMO ONLY: no backend; see lib/session.ts). Per-account state kept in this browser: password changes,
   sessions, the last sign-in, security alerts, password reset links, re-authentication, the company lockout preset and the sign-in challenge.
   The real service keeps all of this server-side; nothing here is a control on its own. Rules: docs/security/SOD_MATRIX.md section 12. */
import { secureHex, randInt } from "./security";
import { bumpData } from "./store";

const MIN = 60_000;
export async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---------- lockout presets (company setting) ---------- */
export type LockoutPreset = "standard" | "strict" | "pci";
export const LOCKOUT: Record<LockoutPreset, { label: string; attempts: number; lockMs: number; note: string }> = {
  standard: { label: "Standard", attempts: 5, lockMs: 5 * MIN, note: "5 failed attempts lock the account for 5 minutes" },
  strict: { label: "Strict", attempts: 5, lockMs: 30 * MIN, note: "5 failed attempts lock the account for 30 minutes" },
  pci: { label: "PCI DSS v4", attempts: 10, lockMs: 30 * MIN, note: "10 failed attempts lock the account for 30 minutes (PCI DSS v4.0.1 requirement 8.3.4)" },
};
export const isPreset = (v: unknown): v is LockoutPreset => v === "standard" || v === "strict" || v === "pci";

/* ---------- persisted state ---------- */
export interface Sess { id: string; email: string; device: string; ip: string; startedAt: number; lastSeen: number; revokedAt?: number; revokedWhy?: string }
export interface Notice { id: string; email: string; at: number; text: string; read?: boolean }
export interface ResetLink { token: string; email: string; code: string; expires: number; used?: boolean; codeFails: number }
interface State {
  pw: Record<string, { salt: string; hash: string; changedAt: number }>;
  sessions: Sess[]; notices: Notice[]; resets: ResetLink[];
  last: Record<string, { at: number; ip: string; device: string }>;
  failedSince: Record<string, number>;
  /** Reset requests per account (times), for the per-account limit. */
  asks: Record<string, number[]>;
  current: string | null;
  lockout: LockoutPreset;
}
const KEY = "selvara.demo.account";
const fresh = (): State => ({ pw: {}, sessions: [], notices: [], resets: [], last: {}, failedSince: {}, asks: {}, current: null, lockout: "standard" });
let S: State | null = null;
export function acct(): State {
  if (S) return S;
  S = fresh();
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
    const o = raw ? JSON.parse(raw) : null;
    if (o && typeof o === "object") S = { ...fresh(), ...o, lockout: isPreset(o.lockout) ? o.lockout : "standard" };
  } catch { /* unreadable: fresh */ }
  return S as State;
}
export function saveAcct() {
  const s = acct();
  s.sessions = s.sessions.slice(-200); s.notices = s.notices.slice(-300); s.resets = s.resets.filter((r) => !r.used && r.expires > Date.now()).slice(-50);
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* memory only */ }
  bumpData();
}
/** Test helper. */
export function resetAcct() { S = fresh(); recentAuth = 0; challenges.clear(); try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

/* ---------- devices and sessions ---------- */
export function deviceLabel(ua = typeof navigator === "undefined" ? "" : navigator.userAgent): string {
  const b = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "an unknown system";
  return `${b} on ${os}`;
}
export function startSession(email: string, ip: string): Sess {
  const s = acct(); const now = Date.now();
  // a first sign-in for a demo account finds one older synthetic session elsewhere, so "sign out other sessions" has something to end
  if (email.endsWith("@demo.selvara.test") && !s.sessions.some((x) => x.email === email)) {
    s.sessions.push({ id: secureHex(8), email, device: "Safari on iOS", ip: "198.51.100." + (2 + randInt(250)), startedAt: now - 2 * 86_400_000, lastSeen: now - 3 * 3_600_000 });
  }
  const sess: Sess = { id: secureHex(8), email, device: deviceLabel(), ip, startedAt: now, lastSeen: now };
  s.sessions.push(sess); s.current = sess.id; saveAcct(); return sess;
}
export const currentSession = (): Sess | null => { const s = acct(); return s.sessions.find((x) => x.id === s.current && !x.revokedAt) || null; };
export const activeSessions = (email: string) => acct().sessions.filter((x) => x.email === email && !x.revokedAt).sort((a, b) => b.lastSeen - a.lastSeen);
export function endCurrentSession(why = "Signed out") { const c = currentSession(); if (c) { c.revokedAt = Date.now(); c.revokedWhy = why; } acct().current = null; saveAcct(); }
/** Ends every session of the account except `keep`; returns how many ended. */
export function revokeSessions(email: string, why: string, keep?: string): number {
  let n = 0; const now = Date.now();
  acct().sessions.forEach((x) => { if (x.email === email && !x.revokedAt && x.id !== keep) { x.revokedAt = now; x.revokedWhy = why; n++; } });
  saveAcct(); return n;
}

/* ---------- alerts to the account owner ---------- */
export function notify(email: string, text: string) { acct().notices.push({ id: secureHex(6), email, at: Date.now(), text }); saveAcct(); }
export const noticesFor = (email: string) => acct().notices.filter((n) => n.email === email).sort((a, b) => b.at - a.at);

/* ---------- re-authentication before sensitive changes ---------- */
export const REAUTH_MS = 5 * MIN;
let recentAuth = 0;
export const markRecentAuth = () => { recentAuth = Date.now(); };
export const clearRecentAuth = () => { recentAuth = 0; };
export const hasRecentAuth = () => Date.now() - recentAuth < REAUTH_MS;

/* ---------- sign-in challenge (proof of work) ---------- */
/** Leading zero hex digits the answer's SHA-256 must have. 3 hex digits = about 4,000 hashes: a moment for a person, real cost for a script at scale. */
export const CHALLENGE = { DIGITS: 3, TTL_MS: 2 * MIN, AFTER_FAILS: 3 };
const challenges = new Map<string, number>();
export function issueChallenge(): { seed: string; digits: number } {
  const seed = secureHex(16); challenges.set(seed, Date.now() + CHALLENGE.TTL_MS);
  return { seed, digits: CHALLENGE.DIGITS };
}
export async function solveChallenge(seed: string, digits = CHALLENGE.DIGITS): Promise<number> {
  const want = "0".repeat(digits);
  for (let n = 0; n < 5_000_000; n++) if ((await sha256(seed + ":" + n)).startsWith(want)) return n;
  throw new Error("Could not complete the check.");
}
/** Single use: a seed is consumed whether or not the answer is right. */
export async function verifyChallenge(c: { seed: string; nonce: number } | undefined): Promise<boolean> {
  if (!c || typeof c.seed !== "string" || !Number.isInteger(c.nonce)) return false;
  const exp = challenges.get(c.seed); challenges.delete(c.seed);
  if (!exp || exp < Date.now()) return false;
  return (await sha256(c.seed + ":" + c.nonce)).startsWith("0".repeat(CHALLENGE.DIGITS));
}

/* ---------- password reset links ---------- */
export const RESET = { TTL_MS: 15 * MIN, MAX_PER_HOUR: 3, CODE_TRIES: 5 };
export function createReset(email: string): ResetLink {
  const s = acct();
  s.resets.forEach((r) => { if (r.email === email) r.used = true; }); // a new link replaces older ones
  const link: ResetLink = { token: secureHex(16), email, code: String(100000 + randInt(900000)), expires: Date.now() + RESET.TTL_MS, codeFails: 0 };
  s.resets.push(link); saveAcct(); return link;
}
export const findReset = (token: string) => acct().resets.find((r) => r.token === token && !r.used && r.expires > Date.now()) || null;
/** Records a reset request for the account; false when it already had the maximum in the last hour (the answer to the person stays the same). */
export function allowResetFor(email: string, now = Date.now()): boolean {
  const s = acct(); const list = (s.asks[email] || []).filter((t) => now - t < 3_600_000);
  if (list.length >= RESET.MAX_PER_HOUR) { s.asks[email] = list; return false; }
  list.push(now); s.asks[email] = list; saveAcct(); return true;
}
/** Shown once after sign-in: when and where the previous sign-in was, and failed attempts since. In memory only. */
export interface Welcome { previous: { at: number; ip: string; device: string } | null; failedSince: number; shown?: boolean }
let welcome: Welcome | null = null;
export const setWelcome = (w: Welcome | null) => { welcome = w; bumpData(); };
export const getWelcome = () => welcome;
/** The one-line summary shown after sign-in. */
export function welcomeText(w: Welcome): string {
  const when = w.previous ? `Last sign-in ${new Date(w.previous.at).toISOString().slice(0, 16).replace("T", " ")} UTC from ${w.previous.ip} (${w.previous.device}).` : "This is your first sign-in on record.";
  return w.failedSince ? `${when} ${w.failedSince} failed sign-in attempt${w.failedSince === 1 ? "" : "s"} since then.` : when;
}
