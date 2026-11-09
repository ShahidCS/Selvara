/* Credential policy (OWASP ASVS v4 2.1, NIST SP 800-63B). Contract: docs/SOD_MATRIX.md section 6.
 * Rules: min 12 / max 128 characters, NO composition rules, all Unicode and spaces allowed, NFKC-normalised. Rejected: common/breached
 * passwords, values containing the account email local part / name / company (>= 4 chars), repeated characters and simple sequences.
 * The strength score is ADVISORY only (never a composition checklist). Pure functions: the password is never stored, logged or sent,
 * and its length is never logged. The server MUST re-enforce all of this (see docs/SECURITY.md "Credential policy"). */
import common from "@/data/commonPasswords.json";

export const POLICY = {
  minLength: 12, maxLength: 128,
  lockoutAttempts: 5, resetTokenMinutes: 15, recoveryCodes: 10,
  idleMinutesPrivileged: 15, idleMinutes: 30, absoluteHours: 12,
} as const;
export const LENGTH_COPY = `at least ${POLICY.minLength}, up to ${POLICY.maxLength} characters`;
export const SESSION_COPY = `Sessions end after ${POLICY.idleMinutesPrivileged} minutes idle for privileged roles (${POLICY.idleMinutes} minutes otherwise) and after ${POLICY.absoluteHours} hours at most. Sensitive actions ask you to confirm again.`;
export const THROTTLED_MSG = "Too many attempts. Wait a few minutes, then try again.";
export const RESET_ACK = "If that account exists, we have sent instructions to the email address.";

export interface PwContext { email?: string; name?: string; company?: string }
export interface PwResult { ok: boolean; errors: string[]; score: 0 | 1 | 2 | 3 | 4; feedback: string[] }
export const SCORE_LABELS = ["Weak", "Weak", "Fair", "Good", "Strong"] as const;

/** NFKC normalisation (compare and store the normalised form on the server). */
export const normalisePassword = (pw: string): string => String(pw ?? "").normalize("NFKC");
const cpLen = (s: string) => Array.from(s).length;
const BLOCK = new Set<string>((common as { list: string[] }).list);
const LEET: Record<string, string> = { "@": "a", "4": "a", "0": "o", "1": "l", "!": "i", "3": "e", "$": "s", "5": "s", "7": "t" };
const fold = (s: string) => s.toLowerCase().replace(/[@40 1!3$57]/g, (c) => LEET[c] ?? (c === " " ? "" : c));
const KEYROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890", "0987654321", "poiuytrewq", "lkjhgfdsa", "mnbvcxz", "abcdefghijklmnopqrstuvwxyz", "zyxwvutsrqponmlkjihgfedcba"];

/** True when the value is on the local common/breached list (also with trailing digits/symbols removed and look-alike letters folded). */
export function isCommon(pw: string): boolean {
  const n = normalisePassword(pw).toLowerCase();
  if (BLOCK.has(n) || BLOCK.has(n.replace(/\s+/g, ""))) return true;
  const f = fold(n);
  if (BLOCK.has(f)) return true;
  const stem = fold(n.replace(/[^\p{L}]+$/u, ""));
  return stem.length >= 6 && stem !== f && BLOCK.has(stem);
}
/** Repeated single character, repeating short pattern, or a run of ascending/descending characters (abcdefgh1234, 123456789012, qwertyuiop). */
export function isTrivial(pw: string): boolean {
  const chars = Array.from(normalisePassword(pw).toLowerCase()); const n = chars.length;
  if (n < 4) return false;
  if (new Set(chars).size === 1) return true;
  for (let p = 2; p <= 4 && p * 3 <= n; p++) if (chars.every((c, i) => c === chars[i % p])) return true;
  let near = 0; for (let i = 1; i < n; i++) if (Math.abs(chars[i].codePointAt(0)! - chars[i - 1].codePointAt(0)!) <= 1) near++;
  if (near / (n - 1) >= 0.8) return true;
  const s = chars.join("");
  return KEYROWS.some((row) => { for (let i = 0; i + 8 <= row.length; i++) if (s.includes(row.slice(i, i + 8))) return true; return false; });
}
/** True when the password contains the email local part, a name part or the company (each >= 4 chars, look-alike spellings folded). */
export function containsContext(pw: string, ctx: PwContext = {}): boolean {
  const f = fold(normalisePassword(pw)); const parts: string[] = [];
  const local = (ctx.email || "").split("@")[0];
  if (local) parts.push(local);
  if (ctx.name) { parts.push(ctx.name); parts.push(...ctx.name.split(/[\s,.-]+/)); }
  if (ctx.company) { parts.push(ctx.company); parts.push(...ctx.company.split(/[\s,.-]+/)); }
  return parts.some((p) => { const q = fold(normalisePassword(p).trim()); return q.length >= 4 && f.includes(q); });
}
/** Advisory estimate 0-4 from length, variety and blocklist hits. NOT a composition requirement. */
export function estimate(pw: string, blocked: boolean): 0 | 1 | 2 | 3 | 4 {
  const s = normalisePassword(pw); const chars = Array.from(s);
  if (!chars.length || blocked) return 0;
  const pool = (/[a-z]/.test(s) ? 26 : 0) + (/[A-Z]/.test(s) ? 26 : 0) + (/[0-9]/.test(s) ? 10 : 0) + (/[^\p{L}\p{N}\s]/u.test(s) ? 33 : 0) + (/\s/.test(s) ? 2 : 0) + (/[^\x00-\x7f]/.test(s) ? 40 : 0);
  const eff = Math.min(chars.length, new Set(chars).size * 3);
  const bits = eff * Math.log2(Math.max(pool, 2)) * 0.6;
  const sc = bits < 30 ? 1 : bits < 48 ? 2 : bits < 66 ? 3 : 4;
  return (chars.length < POLICY.minLength ? Math.min(sc, 1) : sc) as 0 | 1 | 2 | 3 | 4;
}

export function checkPassword(pw: string, ctx: PwContext = {}): PwResult {
  const errors: string[] = []; const feedback: string[] = [];
  const raw = String(pw ?? "");
  if (raw.length > POLICY.maxLength * 4) return { ok: false, errors: [`Use ${LENGTH_COPY}.`], score: 0, feedback: [] }; // skip heavy work on absurd input
  const n = normalisePassword(raw); const len = cpLen(n);
  if (len < POLICY.minLength) errors.push(`Use at least ${POLICY.minLength} characters.`);
  if (len > POLICY.maxLength) errors.push(`Use at most ${POLICY.maxLength} characters.`);
  const common = len > 0 && isCommon(n); const trivial = len > 0 && isTrivial(n); const ctxHit = len > 0 && containsContext(n, ctx);
  if (common) errors.push("This password is on a list of common or breached passwords. Choose a different one.");
  if (trivial) errors.push("Avoid repeated characters and simple sequences.");
  if (ctxHit) errors.push("Do not include your name, email or company.");
  const score = estimate(n, common || trivial || ctxHit);
  if (!errors.length && score <= 1) feedback.push("Add another word or two: a longer phrase is stronger than symbols.");
  else if (!errors.length && score === 2) feedback.push("A longer passphrase makes this stronger.");
  if (len >= POLICY.minLength && len <= POLICY.maxLength && !errors.length) feedback.push("Spaces and any language are fine; a passphrase works well.");
  return { ok: errors.length === 0, errors, score, feedback };
}
