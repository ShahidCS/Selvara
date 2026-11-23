/* R10: how many reviews and approvals are waiting for the signed-in person, for the pill in the header. The same figure as My Work's
   "Approvals waiting" tile: production takes My Work's figures from the server, the demo counts the demo review list. A display aid only. */
import { API_ON, modAllowed } from "./rbac";
import { wsMeta } from "@/services/ws";
import { WORK_REVIEWS } from "@/data/workReviews";

export function approvalsWaiting(role: string): number {
  if (!modAllowed(role, "ws", "work")) return 0;
  return API_ON ? (wsMeta.get().work?.kpis.approvals ?? 0) : WORK_REVIEWS.length;
}
