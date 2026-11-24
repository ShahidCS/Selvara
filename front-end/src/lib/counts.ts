import { DATA } from "./data";
import { custList, MFA_REQUESTS } from "./platform";
import { API_ON } from "./rbac";
import { wsMeta } from "@/services/ws";
import { scoped } from "@/services/audits";

/** Count badge next to a nav item (prototype: countFor). */
export function countFor(k: string): number {
  if (k === "work") return API_ON ? (wsMeta.get().work?.kpis.assigned ?? 0) + (wsMeta.get().work?.kpis.approvals ?? 0) : DATA.issues.filter((i) => i.owner.includes("Avery")).length || 5;
  if (k === "issues") return DATA.issues.filter((i) => i.status !== "Closed").length;
  if (k === "controls") return scoped("controls", DATA.controls).filter((c) => c.status === "Fail" || c.status === "Needs evidence").length;
  if (k === "billing") return custList().filter((c) => c.status === "Past due").length;
  if (k === "mfa") return MFA_REQUESTS.filter((r) => r.status === "Pending approval").length;
  return 0;
}
