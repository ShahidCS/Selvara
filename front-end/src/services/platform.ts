/* Admin Console in production (NEXT_PUBLIC_API_MODE=http, slice 3a). The server decides every rule: platform staff only, changes only by a
   platform super admin with a live elevation, and company changes through a request another super admin approves. These calls only carry
   the choice. */
import { apiFetch } from "./http";
import type { ApprovalItem } from "./team";

const post = <T,>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });

export interface ServerElevation { id: string; reason: string; ticket: string; startedAt: number; expiresAt: number }
export const getElevation = () => apiFetch<{ elevation: ServerElevation | null; canElevate: boolean }>("/admin/elevation");
export const startElevation = (reason: string, ticket: string, minutes: number) => post<{ elevation: ServerElevation }>("/admin/elevation", { reason, ticket, minutes });
export const endElevation = () => post<void>("/admin/elevation/end", {});

export interface PlatformCompany { id: string; ref: string; name: string; status: "Active" | "Suspended" | "Closed"; createdAt: number; members: number; admins: number; pendingInvites: number }
export const listCompanies = () => apiFetch<PlatformCompany[]>("/admin/companies");
/** A request another platform super admin approves; the company and its first admin's invitation exist only then. */
export const requestCompany = (ref: string, name: string, adminEmail: string) => post<{ pending: true; id: string }>("/admin/companies", { ref, name, adminEmail });
export const requestStatus = (ref: string, action: "suspend" | "reactivate", reason: string) => post<{ pending: true; id: string }>(`/admin/companies/${encodeURIComponent(ref)}/${action}`, { reason });
/** The first admin's invitation link, shown once (only its hash is stored); a new one replaces the old. */
export const adminLink = (ref: string) => post<{ emailed?: boolean; mail?: string; link?: string; email: string; expiresAt: number }>(`/admin/companies/${encodeURIComponent(ref)}/admin-link`, {});

export const listPlatformRequests = () => apiFetch<ApprovalItem[]>("/admin/approvals");
export const decidePlatformRequest = (id: string, decision: "approve" | "reject" | "withdraw", reason = "") => post<{ status: string }>(`/admin/approvals/${encodeURIComponent(id)}/${decision}`, { reason });

export interface PlatformAuditEntry { seq: number; at: number; actor: string; action: string; target: string; ip: string; chainN: number | null; hash: string | null }
export const platformAudit = () => apiFetch<{ entries: PlatformAuditEntry[]; verified: boolean; firstBad: number | null }>("/admin/audit");
