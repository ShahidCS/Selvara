/* Segregation-of-duties (SoD) and privileged-role helpers. Contract: docs/security/SOD_MATRIX.md.
 * UI gating is NOT a control: the same rules must be enforced by the API. Services call these helpers so the rule lives in one place. */
import { appStore } from "./store";
import { roleOf } from "./rbac";

export interface Actor { roleId: string; base: string; name: string; roleName: string }

/** Two demo personas share a base role (super/super2, admin/admin2) so dual control between peers can be demonstrated. */
export const baseRole = (roleId: string): string => roleId.replace(/2$/, "");
export const hasRole = (roleId: string, ...bases: string[]): boolean => bases.includes(baseRole(roleId));

export function getActor(): Actor {
  const id = appStore.get().role; const r = roleOf(id);
  return { roleId: id, base: baseRole(id), name: r.person, roleName: r.name };
}
/** "J. Avery", "Jordan Avery", "Avery, Jordan" -> "j avery". Seed data uses short names; personas use full names. */
export function personKey(name: unknown): string {
  const s = String(name ?? "").trim().toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ");
  if (!s) return "";
  const parts = s.split(" ");
  const last = parts[parts.length - 1];
  return (parts[0][0] || "") + " " + last;
}
export const isSamePerson = (a: unknown, b: unknown): boolean => !!personKey(a) && personKey(a) === personKey(b);
export const isMe = (name: unknown): boolean => isSamePerson(name, getActor().name);

export class SodError extends Error { constructor(msg: string) { super(msg); this.name = "SodError"; } }
/** Throws SodError when the acting user is any of `others` (e.g. requester, author, owner, subject). */
export function assertNotSelf(what: string, ...others: unknown[]): void {
  const me = getActor().name;
  if (others.some((o) => isSamePerson(me, o))) throw new SodError(`Segregation of duties: ${what}.`);
}
/** Same check, returned as a reason string for disabling buttons (null = allowed). */
export function sodReason(what: string, ...others: unknown[]): string | null {
  const me = getActor().name;
  return others.some((o) => isSamePerson(me, o)) ? `Segregation of duties: ${what}.` : null;
}
/** Deny-by-default role check for services. */
export function assertRole(what: string, ...bases: string[]): void {
  if (!hasRole(appStore.get().role, ...bases)) throw new SodError(`Not permitted: ${what} requires ${bases.join(" or ")}.`);
}
/** Thresholds that drive dual control (documented in docs/security/SOD_MATRIX.md). */
export const SOD = {
  RISK_BOARD_THRESHOLD: 15,        // residual score above this needs Board approval evidence
  RISK_MAX_ACCEPT_MONTHS: 12,
  FINANCE_DUAL_USD: 1000,          // credits/refunds/write-offs above this need a second approver
  ELEVATION_MAX_MIN: 60,
  MFA_RESET_REQUEST_TTL_H: 24,
  INVITE_TTL_H: 72,
} as const;
