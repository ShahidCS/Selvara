/* Tenant user directory for the platform-admin Customers module (synthetic seed). Every user is scoped to a single custId.
 * Mutable; call bumpData() after changes (adminLog does it). Prototype: USERS / USERSEQ / usersFor. */
import seed from "@/data/tenantUsers.json";
export interface TenantUser { id: string; name: string; email: string; custId: string; role: string; status: string; mfa: string; country: string; city?: string; last: string }
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
export const USERS: TenantUser[] = clone(seed.USERS) as TenantUser[];
let USERSEQ: number = seed.USERSEQ;
export const usersFor = (cid: string) => USERS.filter((u) => u.custId === cid);
/** Prototype: "U-" + (++USERSEQ). Demo id only. */
export const nextUserId = () => "U-" + (++USERSEQ);
