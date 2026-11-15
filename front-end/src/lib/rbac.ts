import rolesJson from "@/data/roles.json";
import navJson from "@/data/nav.json";

export interface Role { id: string; name: string; person: string; initials: string; spaces: string[]; tenant: string | null }
export const ROLES: Role[] = rolesJson.ROLES as Role[];
export const ROLE_MODS = rolesJson.ROLE_MODS as Record<string, Record<string, string | string[]>>;
export const SCOPES: string[] = rolesJson.SCOPES;
export type NavItem = [key: string, label: string, icon: string];
export interface NavGroup { g: string; items: NavItem[] }
export const NAV = navJson.NAV as unknown as Record<"ws" | "admin", NavGroup[]>;
export const TITLE = navJson.TITLE as unknown as Record<string, [string, string]>;

/** The signed-in person when they are not one of the seeded personas (an approved join request, `lib/session.ts`). They hold the role's permissions
 *  unchanged; only the name and initials differ, so audit entries and separation-of-duties checks name the real person. */
let PERSON: { roleId: string; person: string; initials: string } | null = null;
export function setSessionPerson(p: { roleId: string; person: string } | null): void {
  PERSON = p ? { roleId: p.roleId, person: p.person, initials: p.person.split(/\s+/).map((w) => w[0] || "").join("").slice(0, 2).toUpperCase() } : null;
}
export const roleOf = (id: string): Role => {
  const r = ROLES.find((x) => x.id === id) || ROLES[0];
  return PERSON && PERSON.roleId === r.id ? { ...r, person: PERSON.person, initials: PERSON.initials } : r;
};
export const allowedSpaces = (roleId: string) => roleOf(roleId).spaces;
export function modAllowed(roleId: string, space: string, key: string): boolean {
  const m = (ROLE_MODS[roleId] || {})[space];
  if (!m) return false;
  return m === "*" || (m as string[]).indexOf(key) >= 0;
}
export function firstMod(roleId: string, space: "ws" | "admin"): string | null {
  const m = (ROLE_MODS[roleId] || {})[space];
  if (!m) return null;
  if (m === "*") return NAV[space]?.[0]?.items?.[0]?.[0] || null;
  return (m as string[])[0] || null;
}
/** Path (not hash) of the role's landing page. */
export function landingPath(roleId: string, currentSpace: string): string {
  const spaces = allowedSpaces(roleId);
  const sp = (spaces.includes(currentSpace) ? currentSpace : spaces[0]) as "ws" | "admin";
  const mod = sp === "ws" && modAllowed(roleId, sp, "overview") ? "overview" : sp === "admin" && modAllowed(roleId, sp, "customers") ? "customers" : firstMod(roleId, sp);
  return `/${sp}/${mod || "overview"}`;
}
/** Who may administer framework scope/mappings (prototype: fwCanAdmin). */
export const fwCanAdmin = (roleId: string) => ["super", "admin", "owner"].includes(roleId.replace(/2$/, ""));
