/* Integrations API stubs. Mock mode performs the prototype's in-memory mutation; the caller then does wsLog / toast / bumpData.
 * The real API MUST enforce authorization, hold connector credentials/OAuth tokens server-side only, and request least-privilege (read-only) scopes. */
import seed from "@/data/integrationsSeed.json";
import { apiFetch, viaApi } from "./http";

export interface Integration { name: string; type: string; cat: string; status: string; order: number; scope: string; lastSync: string; records: string; health: string }
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
export const INTEGRATIONS: Integration[] = clone(seed.INTEGRATIONS) as Integration[];
const post = <T,>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
const enc = encodeURIComponent;

/** UI gate only (prototype: intCanManage, exact list). Deny by default. */
export const intCanManage = (roleId: string) => ["super", "admin", "owner", "analyst"].includes(roleId);
export const intFind = (name: string) => INTEGRATIONS.find((x) => x.name === name);

/** Prototype: intToggle. Returns the new status, or null when unknown. */
export function toggleIntegration(name: string) {
  return viaApi<{ name: string; connected: boolean } | null>(() => {
    const r = intFind(name); if (!r) return null;
    r.status = r.status === "Connected" ? "Not connected" : "Connected";
    if (r.status === "Connected") { r.lastSync = "just now"; r.health = "Healthy"; if (r.records === "—") r.records = "syncing…"; }
    else { r.lastSync = "—"; r.records = "—"; r.health = "—"; }
    return { name, connected: r.status === "Connected" };
  }, () => post(`/integrations/${enc(name)}/toggle`, {}));
}
/** Prototype: intSync (no status check in the source: syncing a disconnected connector marks it Healthy). */
export function syncIntegration(name: string) {
  return viaApi<boolean>(() => {
    const r = intFind(name); if (!r) return false;
    r.lastSync = "just now"; r.health = "Healthy"; return true;
  }, () => post<boolean>(`/integrations/${enc(name)}/sync`, {}));
}
/** Prototype: intSyncAll (connected connectors only). */
export function syncAllIntegrations() {
  return viaApi<number>(() => {
    const c = INTEGRATIONS.filter((x) => x.status === "Connected");
    c.forEach((r) => { r.lastSync = "just now"; r.health = "Healthy"; });
    return c.length;
  }, () => post<number>("/integrations/sync-all", {}));
}
