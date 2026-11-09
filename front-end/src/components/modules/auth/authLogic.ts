/* Sign-in & Security gallery: pure rules (prototype lines 2093-2096, 2112-2126, 2142-2155). DEMO ONLY: nothing here talks to a server.
 * Passwords, OTPs and phone numbers live only in component state and are dropped on unmount; never stored, logged or put in a URL. */
export const AUTH_TABS: [string, string][] = [["signin", "Sign in"], ["create", "Create account"], ["password", "Set password"], ["mfa", "MFA enrollment"], ["reset", "Reset password"]];
export type AuthView = "signin" | "challenge" | "create" | "password" | "resetpw" | "mfa" | "reset";
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type EmailState = "none" | "ok" | "bad";
/** Prototype: authEmailCheck (state part). `force` is true after a failed submit. */
export function emailState(raw: string, force: boolean): EmailState {
  const v = raw.trim();
  if (v.indexOf("@") < 0) return force ? "bad" : "none";
  return EMAIL_RE.test(v) ? "ok" : "bad";
}
export const emailMessage = (raw: string) => (raw.trim().indexOf("@") < 0 ? "Enter your work email address." : "Enter a valid email address (e.g. name@company.example).");

import { POLICY, checkPassword, normalisePassword, type PwContext } from "@/lib/credentials";

/** Credential rules shown to the user (ASVS 2.1 / NIST 800-63B): length, not breached/common, not containing your details. No composition rules. */
export type RuleKey = "len" | "common" | "ctx";
export interface PwRule { key: RuleKey; label: string; met: boolean }
export interface PwState { rules: PwRule[]; match: boolean; score: 0 | 1 | 2 | 3 | 4; feedback: string[]; errors: string[]; ok: boolean; empty: boolean }
/** `breached` is the async service result (advisory in mock mode: the local blocklist is already part of checkPassword). */
export function pwState(v: string, c: string, ctx: PwContext, breached: boolean): PwState {
  const r = checkPassword(v, ctx); const n = Array.from(normalisePassword(v)).length; const empty = !v;
  const lenOk = n >= POLICY.minLength && n <= POLICY.maxLength;
  const hasCommon = r.errors.some((e) => e.startsWith("This password is on") || e.startsWith("Avoid repeated"));
  const hasCtx = r.errors.some((e) => e.startsWith("Do not include"));
  const rules: PwRule[] = [
    { key: "len", label: `${POLICY.minLength}–${POLICY.maxLength} characters (spaces and any language are fine)`, met: lenOk },
    { key: "common", label: "Not on a common or breached password list", met: !empty && !hasCommon && !breached },
    { key: "ctx", label: "Does not contain your name, email or company", met: !empty && !hasCtx },
  ];
  const errors = breached && !hasCommon ? [...r.errors, "This password is on a list of common or breached passwords. Choose a different one."] : r.errors;
  return { rules, match: !!v && v === c, score: breached ? 0 : r.score, feedback: r.feedback, errors, ok: errors.length === 0, empty };
}
/** Returns [message, fieldToFocus] or null when valid. Messages never include the password. */
export function pwSubmitError(st: PwState): [string, "pw" | "pw2"] | null {
  if (!st.ok) return [st.errors[0] || "Choose a different password.", "pw"];
  if (!st.match) return ["Both passwords must match.", "pw2"];
  return null;
}
