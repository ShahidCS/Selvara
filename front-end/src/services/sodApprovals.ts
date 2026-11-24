/* Four-eyes decision API stub shared by Vendors, AI, Trust, Questionnaires, Assistant, API and Reports (contract: docs/security/SOD_MATRIX.md).
 * Mock mode records the decision in the in-memory approvals engine and applies the approved change. The real API MUST re-check role,
 * "approver is not the requester/subject" and the second-approver count server-side, and write its own audit entry. */
import { approvals, type Approval } from "@/lib/approvals";
import { decideApproval } from "@/lib/approvalKit";
import { apiFetch, viaApi } from "./http";
import { wsPost } from "./ws";

/** Production routes for the kinds already on the server (programme groups); the rest are not reachable in production yet. */
export const SERVER_ROUTES: Record<string, string> = {
  "report.distribution": "/ws/report-approvals",
  "vendor.request.critical": "/ws/four-eyes", "vendor.gate": "/ws/four-eyes", "vendor.tier": "/ws/four-eyes", "vendor.waiver": "/ws/four-eyes", "trust.publish": "/ws/four-eyes", "trust.public-page": "/ws/four-eyes", "trust.section-controls": "/ws/four-eyes", "q.send": "/ws/four-eyes",
  ...Object.fromEntries(["ai.guardrail", "ai.archive", "ai.enable", "ai.mask", "assistant.agent.enable", "assistant.agent.autonomy", "assistant.agent.recertify", "assistant.mcp.grant", "api.key", "api.webhook", "integration.connect"].map((k) => [k, "/ws/four-eyes"])),
};

export type Decision = "approve" | "reject" | "withdraw";
export function decide(id: string, decision: Decision, reason: string) {
  return viaApi<Approval>(
    () => decideApproval(id, decision, reason),
    () => {
      const base = SERVER_ROUTES[approvals.get().list.find((a) => a.id === id)?.kind ?? ""];
      return base ? wsPost<Approval>(`${base}/${encodeURIComponent(id)}/${decision}`, { reason }) : apiFetch<Approval>(`/approvals/${encodeURIComponent(id)}/${decision}`, { method: "POST", body: JSON.stringify({ reason }) });
    },
  );
}
