/* Commitments API stubs (source lines 3479-3495). Caller does wsLog/toast/bumpData.
 * CONTRACT (docs/security/SOD_MATRIX.md section 3): starting and closing the incident clock needs admin/owner (assertRole -> SodError) and is audited in the workspace and
 * admin logs by the caller (actor, summary, outcome). A real API must own the incident clock (server timestamps, notification duties, admin-log entry) and run real contract analysis. */
import { DATA } from "@/lib/data";
import { nowStamp } from "@/lib/format";
import { INCIDENT } from "@/lib/trustData";
import { assertRole, getActor, SodError } from "@/lib/sod";
import { viaApi } from "@/services/http";
import { wsPost } from "@/services/ws";

export interface AnalysisRow { commitment: string; clause: string; finding: string }

export function startIncident(summary: string) {
  return viaApi(() => {
    assertRole("starting the incident clock", "admin", "owner");
    if (INCIDENT.active) throw new SodError("An incident is already active.");
    INCIDENT.active = true; INCIDENT.started = nowStamp(); INCIDENT.startedBy = getActor().name; INCIDENT.summary = summary || undefined; delete INCIDENT.closedBy; return INCIDENT;
  }, () => wsPost<unknown>("/ws/incidents", { summary }));
}
export function closeIncident(outcome = "") {
  return viaApi(() => {
    assertRole("closing the incident", "admin", "owner");
    if (!INCIDENT.active) throw new SodError("There is no active incident.");
    INCIDENT.active = false; INCIDENT.closedBy = getActor().name; return INCIDENT;
  }, () => wsPost<unknown>("/ws/incidents/close", { outcome }));
}
export function importContract(name: string, detail: string) {
  return viaApi(() => { assertRole("importing a contract", "admin", "owner"); DATA.commitments.unshift({ name, detail: detail || "Imported contract", status: "Review" }); return { name }; },
    () => wsPost<unknown>("/ws/commitments", { name, detail }));
}
/** The demonstration's analysis is static text (null here); production compares each commitment with the standard terms. */
export function runContractAnalysis() {
  return viaApi<AnalysisRow[] | null>(() => null, () => wsPost<AnalysisRow[]>("/ws/commitments/analysis", {}));
}
/** Production: an admin or owner other than the importer marks a commitment reviewed, with a note. */
export const reviewCommitment = (id: string, note: string) => wsPost<unknown>(`/ws/commitments/${encodeURIComponent(id)}/review`, { note });
