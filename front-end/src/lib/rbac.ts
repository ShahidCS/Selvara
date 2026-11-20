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

/** Production (NEXT_PUBLIC_API_MODE=http) works on real company data from the server. Decision D4 (docs/architecture/BACKEND_FOUNDATION.md
 *  section 10): a module whose data and rules are not on the server yet is hidden there, instead of showing the demonstration company's data or
 *  offering actions the server does not have. Each module joins this list when its server slice ships. The account page (/auth) is always
 *  reachable. The demonstration (mock mode) shows every module. */
export const API_ON = (process.env.NEXT_PUBLIC_API_MODE || "mock") === "http";
export const SERVER_READY: Record<"ws" | "admin", readonly string[]> = { ws: ["team"], admin: ["customers", "elevation", "adminlog"] };
const ready = (space: string, key: string, apiOn: boolean) => !apiOn || (SERVER_READY[space as "ws" | "admin"] ?? []).includes(key);

/** Deny by default: the role must list the module (or "*"), and in production the module must have a server API. */
export function modAllowed(roleId: string, space: string, key: string, apiOn: boolean = API_ON): boolean {
  const m = (ROLE_MODS[roleId] || {})[space];
  if (!m || !ready(space, key, apiOn)) return false;
  return m === "*" || (m as string[]).indexOf(key) >= 0;
}
export function firstMod(roleId: string, space: "ws" | "admin", apiOn: boolean = API_ON): string | null {
  const m = (ROLE_MODS[roleId] || {})[space];
  if (!m) return null;
  if (apiOn) return SERVER_READY[space].find((k) => modAllowed(roleId, space, k, true)) ?? null;
  if (m === "*") return NAV[space]?.[0]?.items?.[0]?.[0] || null;
  return (m as string[])[0] || null;
}
/** Path (not hash) of the role's landing page. In production, a role with no module on the server yet lands on its account page. */
export function landingPath(roleId: string, currentSpace: string, apiOn: boolean = API_ON): string {
  const spaces = allowedSpaces(roleId);
  const sp = (spaces.includes(currentSpace) ? currentSpace : spaces[0]) as "ws" | "admin";
  const mod = sp === "ws" && modAllowed(roleId, sp, "overview", apiOn) ? "overview" : sp === "admin" && modAllowed(roleId, sp, "customers", apiOn) ? "customers" : firstMod(roleId, sp, apiOn);
  if (!mod && apiOn) return "/auth";
  return `/${sp}/${mod || "overview"}`;
}
/** Who may administer framework scope/mappings (prototype: fwCanAdmin). */
export const fwCanAdmin = (roleId: string) => ["super", "admin", "owner"].includes(roleId.replace(/2$/, ""));
