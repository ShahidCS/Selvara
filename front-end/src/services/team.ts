/* Team & Settings stubs. Mock mode keeps TEAM_SETTINGS in memory; the caller does wsLog / toast / bumpData.
 * The real API MUST authorize every settings change and invitation server-side (tenant admin only), send the invitation e-mail itself with a
 * single-use expiring token, and never trust the role chosen in the client. */
import seed from "@/data/teamSeed.json";
import roles from "@/data/userRoles.json";
import { modAllowed } from "@/lib/rbac";
import { apiFetch, viaApi } from "./http";

export interface TeamSettings { reviewCycle: string; appetite: string; controlSla: string; critSla: string; approvers: string[]; baseline: string[] }
export const TEAM_SETTINGS: TeamSettings = JSON.parse(JSON.stringify(seed.TEAM_SETTINGS));
export const USER_ROLES: string[] = roles.USER_ROLES;
export const REVIEW_CYCLES = ["Monthly", "Quarterly", "Annually"];
export const APPETITES = ["Low", "Moderate", "High"];
const post = <T,>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });

/** UI gate only. The source had no per-action gate (module access only); deny by default = same rule as module access. */
export const teamCanManage = (roleId: string) => modAllowed(roleId, "ws", "team");

export function setSetting(key: "reviewCycle" | "appetite" | "controlSla" | "critSla", value: string) {
  return viaApi<void>(() => { TEAM_SETTINGS[key] = value; }, () => post<void>("/team/settings", { [key]: value }));
}
export function saveSettings() {
  return viaApi<void>(() => undefined, () => post<void>("/team/settings/save", { ...TEAM_SETTINGS }));
}
export function addApprover(name: string) {
  return viaApi<void>(() => { TEAM_SETTINGS.approvers.push(name); }, () => post<void>("/team/approvers", { name }));
}
export function removeApprover(i: number) {
  return viaApi<string | null>(() => { const a = TEAM_SETTINGS.approvers[i]; if (a === undefined) return null; TEAM_SETTINGS.approvers.splice(i, 1); return a; }, () => apiFetch<string | null>(`/team/approvers/${i}`, { method: "DELETE" }));
}
/** Prototype: teamDoInvite only logged and toasted (no member record is created). */
export function inviteMember(input: { email: string; role: string }) {
  return viaApi<{ email: string; role: string }>(() => ({ email: input.email, role: USER_ROLES.includes(input.role) ? input.role : USER_ROLES[0] }), () => post<{ email: string; role: string }>("/team/invitations", input));
}
