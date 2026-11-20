/* Support access in production (NEXT_PUBLIC_API_MODE=http, slice 3b). A company admin gives the platform a read-only, time-boxed support grant;
   platform staff open a support session on it to read that company's members, sign-in setting and audit log. The server and the database decide
   every rule (migration 0007); these calls only carry the choice. */
import { apiFetch } from "./http";

const post = <T,>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });

/* ---------- the company's side (Team & Settings) ---------- */
export interface SupportGrant { id: string; reason: string; grantedBy: string; createdAt: number; expiresAt: number; revokedAt: number | null; revokedBy: string | null; status: "Live" | "Expired" | "Revoked" }
export interface SupportLogLine { at: number; actor: string; action: string; target: string }
export const getCompanySupport = () => apiFetch<{ grants: SupportGrant[]; log: SupportLogLine[]; maxHours: number }>("/team/support");
export const giveGrant = (reason: string, hours: number) => post<{ id: string; expiresAt: number }>("/team/support/grants", { reason, hours });
export const revokeGrant = (id: string) => post<void>(`/team/support/grants/${encodeURIComponent(id)}/revoke`, {});

/* ---------- the platform's side (Customers & Usage) ---------- */
export interface LiveGrant { id: string; companyId: string; ref: string; name: string; reason: string; grantedBy: string; createdAt: number; expiresAt: number }
export interface SupportSession { id: string; company: { id: string; ref: string; name: string }; ticket: string; reason: string; startedAt: number; expiresAt: number }
export const getPlatformSupport = () => apiFetch<{ grants: LiveGrant[]; session: SupportSession | null }>("/admin/support");
export const openSession = (ref: string, reason: string, ticket: string, minutes: number) => post<{ session: SupportSession }>("/admin/support/open", { ref, reason, ticket, minutes });
export const closeSession = () => post<void>("/admin/support/close", {});
export type SupportWhat = "members" | "settings" | "audit";
export type SupportView = { company: { ref: string; name: string } } & (
  | { what: "members"; members: { name: string; email: string; role: string; status: string; since: number }[] }
  | { what: "settings"; lockout: { preset: string; custom?: { attempts: number; minutes: number } } }
  | { what: "audit"; entries: SupportLogLine[] });
export const viewCompany = (what: SupportWhat) => apiFetch<SupportView>(`/admin/support/view/${what}`);
