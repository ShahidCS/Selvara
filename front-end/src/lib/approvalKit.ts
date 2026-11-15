/* Glue between the four-eyes approvals engine (lib/approvals.ts, not edited) and the module services that APPLY an approved change.
 * Contract: docs/security/SOD_MATRIX.md section 1 (approval is a separate audited step) and section 3.
 * A module registers a handler per approval `kind`; `decideApproval` records the decision through the engine and, when the last required
 * approver has signed, runs `apply` exactly once. In mock mode this all happens in memory: the real API must do the same server-side. */
import { approve, reject, withdraw, approvals, type Approval } from "./approvals";
import { wsLog } from "./audit";
import { SodError } from "./sod";
import { bumpData } from "./store";

export interface ApprovalHandler {
  /** Apply the approved change. Re-validate the target here (it may have changed or disappeared since the request). */
  apply: (a: Approval) => void;
  /** Clean up pending markers when the request is rejected or withdrawn. */
  closed?: (a: Approval, how: "rejected" | "withdrawn") => void;
}
const handlers = new Map<string, ApprovalHandler>();
export const registerApprovalHandler = (kind: string, h: ApprovalHandler): void => { handlers.set(kind, h); };
export const hasApprovalHandler = (kind: string): boolean => handlers.has(kind);

/** Never trust a stored payload field's type: read strings defensively. */
export const payloadStr = (a: Approval, k: string): string => { const v = a.payload[k]; return typeof v === "string" ? v : ""; };

const touch = () => { approvals.set((s) => ({ list: [...s.list] })); bumpData(); };

/** Approve / reject / withdraw. Approve and reject need a reason of at least 10 characters (engine rule for approve; enforced here for reject too). */
export function decideApproval(id: string, decision: "approve" | "reject" | "withdraw", reason: string): Approval {
  const r = String(reason || "").trim();
  if (decision === "withdraw") {
    const a = withdraw(id); handlers.get(a.kind)?.closed?.(a, "withdrawn"); touch(); return a;
  }
  if (r.length < 10) throw new SodError("Give a reason of at least 10 characters.");
  if (decision === "reject") {
    const a = reject(id, r); handlers.get(a.kind)?.closed?.(a, "rejected"); touch(); return a;
  }
  // refuse BEFORE recording anything if the change could not be applied afterwards (an approval recorded and never applied would be stranded)
  const pending = approvals.get().list.find((x) => x.id === id);
  if (pending && !handlers.has(pending.kind)) throw new SodError("This approval cannot be applied in this session.");
  const a = approve(id, r);
  if (a.status === "Approved" && a.payload.applied !== true) {
    const h = handlers.get(a.kind);
    if (!h) throw new SodError("This approval cannot be applied in this session.");
    try { h.apply(a); } catch (e) {
      if (e instanceof SodError) throw e;
      throw new SodError("Approved, but the change could not be applied. Ask the requester to submit it again.");
    }
    a.payload.applied = true;
    wsLog(`${a.kind}.applied`, `${a.title} (${a.id})`, "Approval");
  }
  touch(); return a;
}
