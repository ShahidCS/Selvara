/* Commitments API stubs (source lines 3479-3495). Caller does wsLog/toast/bumpData.
 * CONTRACT (docs/security/SOD_MATRIX.md section 3): starting and closing the incident clock needs admin/owner (assertRole -> SodError) and is audited in the workspace and
 * admin logs by the caller (actor, summary, outcome). A real API must own the incident clock (server timestamps, notification duties, admin-log entry) and run real contract analysis. */
import { DATA } from "@/lib/data";
import { nowStamp } from "@/lib/format";
import { INCIDENT } from "@/lib/trustData";
import { assertRole, getActor, SodError } from "@/lib/sod";
import { apiFetch, viaApi } from "./http";

const send = <T,>(method: string, path: string, body?: unknown) =>
  apiFetch<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export function startIncident(summary: string) {
  return viaApi(() => {
    assertRole("starting the incident clock", "admin", "owner");
    if (INCIDENT.active) throw new SodError("An incident is already active.");
    INCIDENT.active = true; INCIDENT.started = nowStamp(); INCIDENT.startedBy = getActor().name; delete INCIDENT.closedBy; return INCIDENT;
  }, () => send<unknown>("POST", "/incidents", { summary }));
}
export function closeIncident() {
  return viaApi(() => {
    assertRole("closing the incident", "admin", "owner");
    if (!INCIDENT.active) throw new SodError("There is no active incident.");
    INCIDENT.active = false; INCIDENT.closedBy = getActor().name; return INCIDENT;
  }, () => send<unknown>("POST", "/incidents/close", {}));
}
export function importContract(name: string, detail: string) {
  return viaApi(() => { assertRole("importing a contract", "admin", "owner"); DATA.commitments.unshift({ name, detail: detail || "Imported contract", status: "Review" }); return { name }; },
    () => send<unknown>("POST", "/commitments", { name, detail }));
}
export function runContractAnalysis() {
  return viaApi(() => true, () => send<boolean>("POST", "/commitments/analysis", {}));
}
