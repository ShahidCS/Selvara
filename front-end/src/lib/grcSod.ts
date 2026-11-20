/* Shared helpers for the GRC modules (policies, evidence, controls, issues, audits). ADD-ONLY companion to src/lib/sod.ts.
 * Contract: docs/security/SOD_MATRIX.md. UI gating is NOT a control: the API must enforce every rule again. */
import { ROLES } from "./rbac";
import { getActor, hasRole, isSamePerson, SodError } from "./sod";

export const FAIL_MSG = "Something went wrong. Please try again.";

/** Toast text for a caught error: SodError messages are safe policy text; anything else becomes a generic message (ASVS 7.4.1). */
export const uiMessage = (e: unknown): string => (e instanceof SodError || isRefusal(e) ? (e as Error).message : FAIL_MSG);
/** A refusal from the production API (4xx): the server's own words, written for people and free of internal details (services/http.ts ApiError). */
const isRefusal = (e: unknown): boolean => { const st = e instanceof Error ? (e as Error & { status?: unknown }).status : undefined; return typeof st === "number" && st >= 400 && st < 500; };

/** Stricter-than-isSamePerson name match for SoD checks. Seed data and personas use different short forms
 * ("J. Avery" / "Jordan A." / "Jordan Avery"): same first initial and the same surname, or one surname is an initial of the other.
 * A false positive only makes a four-eyes check stricter, so it errs on the safe side. */
export function samePerson(a: unknown, b: unknown): boolean {
  if (isSamePerson(a, b)) return true;
  const parts = (n: unknown) => {
    const s = String(n ?? "").toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
    if (!s) return null;
    const p = s.split(" ");
    return { f: p[0], l: p[p.length - 1], one: p.length === 1 };
  };
  const x = parts(a), y = parts(b);
  if (!x || !y || x.one || y.one) return false;
  if (x.f[0] !== y.f[0]) return false;
  return x.l === y.l || (x.l.length === 1 && y.l.startsWith(x.l)) || (y.l.length === 1 && x.l.startsWith(y.l));
}
export const iAm = (name: unknown): boolean => samePerson(getActor().name, name);

/** Reason string (null = allowed) when the acting user is one of `others`. */
export function selfReason(what: string, ...others: unknown[]): string | null {
  const me = getActor().name;
  return others.some((o) => samePerson(me, o)) ? `Segregation of duties: ${what}.` : null;
}
/** Reason string when the acting user does not hold one of the base roles. */
export function roleReason(what: string, ...bases: string[]): string | null {
  return hasRole(getActor().roleId, ...bases) ? null : `Not permitted: ${what} requires ${bases.join(" or ")}.`;
}
/** Throw SodError for the first non-null reason (services call this; UI uses the same reason to disable buttons). */
export function guard(...reasons: (string | null | undefined)[]): void {
  const r = reasons.find((x) => !!x);
  if (r) throw new SodError(r);
}
/** Require a justification of at least `min` characters. */
export function reasonText(v: unknown, min: number, what = "A reason"): string {
  const s = String(v ?? "").trim().slice(0, 500);
  if (s.length < min) throw new SodError(`${what} of at least ${min} characters is required.`);
  return s;
}

export interface Person { roleId: string; name: string; roleName: string }
/** Workspace personas holding one of the base roles (the pool "named approver" / "successor" are chosen from). */
export function eligiblePeople(...bases: string[]): Person[] {
  const seen = new Set<string>();
  return ROLES.filter((r) => r.spaces.includes("ws") && r.tenant && hasRole(r.id, ...bases))
    .filter((r) => (seen.has(r.person) ? false : (seen.add(r.person), true)))
    .map((r) => ({ roleId: r.id, name: r.person, roleName: r.name }));
}
export const personByName = (name: string, ...bases: string[]) => eligiblePeople(...bases).find((p) => p.name === name);

/* ---- dates ---- */
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const p2 = (n: number) => String(n).padStart(2, "0");
export const isoDay = (d = new Date()): string => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const fmtDay = (d: Date): string => `${p2(d.getDate())} ${MON[d.getMonth()]} ${d.getFullYear()}`;
export const parseIso = (s: string): Date => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export function addMonths(d: Date, n: number): Date { const x = new Date(d.getTime()); x.setMonth(x.getMonth() + n); return x; }
export function addBusinessDays(d: Date, n: number): Date {
  const x = new Date(d.getTime()); let left = n;
  while (left > 0) { x.setDate(x.getDate() + 1); const w = x.getDay(); if (w !== 0 && w !== 6) left--; }
  return x;
}
/** Parse "01 Feb 2027" or ISO; null when it is not a date ("Not started"). */
export function parseDay(s: unknown): Date | null {
  const t = String(s ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return parseIso(t);
  const m = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/.exec(t);
  if (!m) return null;
  const mi = MON.findIndex((x) => x.toLowerCase() === m[2].toLowerCase());
  return mi < 0 ? null : new Date(Number(m[3]), mi, Number(m[1]));
}
