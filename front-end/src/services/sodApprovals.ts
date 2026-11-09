/* Four-eyes decision API stub shared by Vendors, AI, Trust, Questionnaires, Assistant, API and Reports (contract: docs/SOD_MATRIX.md).
 * Mock mode records the decision in the in-memory approvals engine and applies the approved change. The real API MUST re-check role,
 * "approver is not the requester/subject" and the second-approver count server-side, and write its own audit entry. */
import type { Approval } from "@/lib/approvals";
import { decideApproval } from "@/lib/approvalKit";
import { apiFetch, viaApi } from "./http";

export type Decision = "approve" | "reject" | "withdraw";
export function decide(id: string, decision: Decision, reason: string) {
  return viaApi<Approval>(
    () => decideApproval(id, decision, reason),
    () => apiFetch<Approval>(`/approvals/${encodeURIComponent(id)}/${decision}`, { method: "POST", body: JSON.stringify({ reason }) }),
  );
}
