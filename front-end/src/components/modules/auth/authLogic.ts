/* Sign-in & Security gallery: pure rules (prototype lines 2093-2096, 2112-2126, 2142-2155). DEMO ONLY: nothing here talks to a server.
 * Passwords, OTPs and phone numbers live only in component state and are dropped on unmount; never stored, logged or put in a URL. */
export const AUTH_TABS: [string, string][] = [["signin", "Sign in"], ["create", "Create account"], ["password", "Set password"], ["mfa", "MFA enrollment"], ["reset", "Reset password"]];
export type AuthView = "signin" | "challenge" | "create" | "password" | "resetpw" | "mfa" | "reset";
export const AUTH_SPECIAL = /[ !"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~]/;
export const AUTH_ALLOWED = /^[A-Za-z0-9 !"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~]*$/;
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** Upper bound on password length (the source had none). ASVS 2.1.2 requires accepting at least 64; this only caps input size. */
export const PW_MAX = 128;

export type EmailState = "none" | "ok" | "bad";
/** Prototype: authEmailCheck (state part). `force` is true after a failed submit. */
export function emailState(raw: string, force: boolean): EmailState {
  const v = raw.trim();
  if (v.indexOf("@") < 0) return force ? "bad" : "none";
  return EMAIL_RE.test(v) ? "ok" : "bad";
}
export const emailMessage = (raw: string) => (raw.trim().indexOf("@") < 0 ? "Enter your work email address." : "Enter a valid email address (e.g. name@company.example).");

export interface PwChecks { len: boolean; upper: boolean; lower: boolean; number: boolean; special: boolean; match: boolean; met: number; allowed: boolean }
/** Prototype: authPwCheck. */
export function pwChecks(v: string, c: string): PwChecks {
  const ok = { len: v.length >= 12, upper: /[A-Z]/.test(v), lower: /[a-z]/.test(v), number: /[0-9]/.test(v), special: AUTH_SPECIAL.test(v), match: !!v && v === c };
  const met = (["len", "upper", "lower", "number", "special"] as const).filter((k) => ok[k]).length;
  return { ...ok, met, allowed: AUTH_ALLOWED.test(v) };
}
export const REQS: [keyof PwChecks, string][] = [
  ["len", "At least 12 characters"], ["upper", "An uppercase letter (A–Z)"], ["lower", "A lowercase letter (a–z)"],
  ["number", "A number (0–9)"], ["special", "A special character ( ! @ # $ % & * )"], ["match", "Both passwords match"],
];
/** Prototype: authSetPw validation order and messages. Returns [message, fieldToFocus] or null when valid. */
export function pwSubmitError(v: string, c: string): [string, "pw" | "pw2"] | null {
  if (v.length < 12 || !/[A-Z]/.test(v) || !/[a-z]/.test(v) || !/[0-9]/.test(v) || !AUTH_SPECIAL.test(v)) return ["Your password does not meet all the requirements yet.", "pw"];
  if (!AUTH_ALLOWED.test(v)) return ["Remove characters that are not allowed.", "pw"];
  if (v !== c) return ["Both passwords must match.", "pw2"];
  return null;
}
