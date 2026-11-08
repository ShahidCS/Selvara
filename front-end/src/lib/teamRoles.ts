/* Workspace role helpers shared by People and Team (ADD-only shared lib). Seed people carry job titles, not platform roles, so the effective
 * workspace role is: explicit `wsRole` (set by an approved role change) > demo seed mapping > matching persona > Employee/Vendor Contact. */
import { DATA } from "./data";
import { ROLES } from "./rbac";
import { isSamePerson } from "./sod";

/* eslint-disable @typescript-eslint/no-explicit-any */
const SEED_ROLES: Record<string, string> = { "U-01": "Company Admin", "U-05": "Company Admin", "U-02": "Control, Policy and Risk Owner" };
export const ADMIN_ROLE = "Company Admin";
export function memberRole(p: any): string {
  if (p.wsRole) return String(p.wsRole);
  if (SEED_ROLES[p.id]) return SEED_ROLES[p.id];
  const persona = ROLES.find((r) => r.spaces.includes("ws") && isSamePerson(r.person, p.name));
  return persona ? persona.name : p.contractor ? "Vendor Contact" : "Employee";
}
/** admin, owner and super-style roles need a second approver to be granted (SOD_MATRIX section 3, Team). */
export const isPrivilegedRoleName = (name: string): boolean => /admin|owner|super/i.test(name);
/** Access level that counts as privileged (Admin / Super admin). */
export const isPrivilegedLevel = (level: unknown): boolean => /^(super\s*admin|admin)/i.test(String(level ?? "").trim());
/** Systems treated as privileged regardless of the requested level. */
const PRIV_SYSTEM = /identity admin|iam|production|privileged|vault|root|domain admin/i;
export const isPrivilegedSystem = (system: unknown): boolean => {
  const s = String(system ?? "");
  return PRIV_SYSTEM.test(s) || DATA.access.some((a: any) => a.system === s && isPrivilegedLevel(a.level));
};
export const holdsPrivilegedAccess = (name: string): boolean => DATA.access.some((a: any) => isSamePerson(a.user, name) && isPrivilegedLevel(a.level));
export const adminCount = (): number => DATA.people.filter((p: any) => memberRole(p) === ADMIN_ROLE).length;
