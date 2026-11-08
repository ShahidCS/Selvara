/* Commitments API stubs (source lines 3479-3495). Caller does wsLog/toast/bumpData.
 * A real API must own the incident clock (server timestamps, notification duties, admin-log entry) and run real contract analysis. */
import { DATA } from "@/lib/data";
import { nowStamp } from "@/lib/format";
import { INCIDENT } from "@/lib/trustData";
import { apiFetch, viaApi } from "./http";

const send = <T,>(method: string, path: string, body?: unknown) =>
  apiFetch<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export function startIncident(summary: string) {
  return viaApi(() => { INCIDENT.active = true; INCIDENT.started = nowStamp(); return INCIDENT; }, () => send<any>("POST", "/incidents", { summary }));
}
export function closeIncident() {
  return viaApi(() => { INCIDENT.active = false; return INCIDENT; }, () => send<any>("POST", "/incidents/close", {}));
}
export function importContract(name: string, detail: string) {
  return viaApi(() => { DATA.commitments.unshift({ name, detail: detail || "Imported contract", status: "Review" }); return { name }; },
    () => send<any>("POST", "/commitments", { name, detail }));
}
export function runContractAnalysis() {
  return viaApi(() => true, () => send<boolean>("POST", "/commitments/analysis", {}));
}
