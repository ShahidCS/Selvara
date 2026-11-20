/* Decisions from the notifications panel (phase 5). Only approvals that are decided through the shared four-eyes path are offered inline:
   the kinds below are decided today by `ApprovalsPanel` (components/kit/sodKit) with `decide` (services/sodApprovals) and `whyCannotApprove`, and this
   module uses exactly those, so the role, requester, subject, second-person and reason rules cannot be skipped. Every other kind (access second
   stage, risk, policy, issue, control, evidence, people, team, MFA, platform) has module-specific rules and still opens its record.
   In-memory demo; the real API must enforce every rule again. */
import { approvals, whyCannotApprove, type Approval } from "./approvals";
import { hasApprovalHandler } from "./approvalKit";
import { API_ON, modAllowed } from "./rbac";
import { getActor, hasRole } from "./sod";
import { SERVER_KINDS } from "./rulesWs";

/** Approval kind prefix -> the workspace module that shows and decides it. */
const HOMES: [prefix: string, mod: string][] = [["ai.", "ai"], ["vendor.", "vendors"], ["api.", "api"], ["assistant.", "assistant"], ["report.", "reports"], ["trust.", "trust"], ["q.", "questionnaires"]];
export const inlineHome = (kind: string): string | null => HOMES.find(([p]) => kind.startsWith(p))?.[1] ?? null;

/** Pending workspace approvals the signed-in person may decide right now, from the panel. Anything they cannot decide (their own request, the subject,
 *  already approved by them, wrong role, expired) is not listed here: it would only be a disabled button. */
export function inlineApprovalsFor(role: string): Approval[] {
  const now = Date.now(); const me = getActor();
  if (me.roleId !== role) return [];
  return approvals.get().list.filter((a) => {
    const mod = inlineHome(a.kind);
    return !!mod && a.domain === "ws" && a.status === "Pending" && a.expiresAt > now && (hasApprovalHandler(a.kind) || (API_ON && SERVER_KINDS.includes(a.kind)))
      && modAllowed(role, "ws", mod) && hasRole(role, ...a.approverRoles) && whyCannotApprove(a) === null;
  });
}
