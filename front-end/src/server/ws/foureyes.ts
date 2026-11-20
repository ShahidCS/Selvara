/* Server-only. One decision route for the four-eyes requests of modules that apply a change when the last approver signs (production
   programme group 4: vendors, trust, questionnaires). Each module registers its kinds: the module a person must be able to open, and what
   happens on the final approval. The engine's rules are the shared ones (lib/rules.ts): not the requester, not a forbidden person, one vote
   each, an approver role, not expired, a reason of at least 10 characters for approve and reject; only the requester withdraws. The change
   is applied in the same unit of work as the final approval, once. Pending markers are never stored: screens derive them from the requests. */
import { approvalBlock, reasonBlock } from "@/lib/rules";
import type { ApprovalRow } from "../directory";
import type { Deps } from "../types";
import { invalid, missing, modAllowed, ok, refuse, str, sweepApprovals, txt, wsRoute, type WsHelpers } from "./common";
import type { WsTx } from "./store";

export interface FourEyesKind { mod: string; apply: (d: Deps, t: WsTx, a: ApprovalRow, by: string) => Promise<void> }
const KINDS = new Map<string, FourEyesKind>();
export const registerFourEyes = (kind: string, k: FourEyesKind) => { KINDS.set(kind, k); };
export const fourEyesKinds = () => [...KINDS.keys()];
/** Pending (and not expired) requests of these kinds, for markers such as "Awaiting approval". */
export async function pendingOf(t: WsTx, kinds: string[]) { return (await t.approvals(kinds)).filter((a) => a.status === "Pending" && a.expiresAt > t.now); }

export function fourEyesRoutes(h: WsHelpers) {
  const decide = wsRoute(h, null, async (d, r, c) => {
    const me = c.actor; const decision = r.path[3];
    if (!["approve", "reject", "withdraw"].includes(decision)) return missing("Action");
    return d.ws.tx(me, d.now(), async (t) => {
      const kinds = fourEyesKinds(); await sweepApprovals(t, kinds);
      const a = (await t.approval(str(r.path[2], 60), kinds)) ?? missing("Request");
      const k = KINDS.get(a.kind)!;
      if (!modAllowed(me.role, k.mod)) refuse("Not permitted.");
      if (decision === "withdraw") {
        if (a.requestedBy !== me.id) refuse("Only the requester can withdraw a request.");
        if (a.status !== "Pending") invalid(`Request is ${a.status.toLowerCase()}.`);
        await t.setApproval(a.id, "Withdrawn"); await t.audit(`approval.${a.kind}.withdrawn`, `${a.title} (${a.id})`, "Approval");
        return ok({ status: "Withdrawn" });
      }
      refuse(approvalBlock({ key: me.id, base: me.role }, { status: a.status, expiresAt: a.expiresAt, approverRoles: a.approverRoles, requestedBy: a.requestedBy, forbid: a.forbid, votes: a.votes.map((v) => v.by) }, t.now));
      const reason = txt(r.body.reason, 300); const bad = reasonBlock(reason); if (bad) invalid(bad);
      if (decision === "reject") {
        await t.setApproval(a.id, "Rejected", reason); await t.audit(`approval.${a.kind}.rejected`, `${a.title} (${a.id}); reason: ${reason}`, "Approval");
        await t.notify(a.requestedBy, `${me.name} rejected: ${a.title.slice(0, 120)}`);
        return ok({ status: "Rejected" });
      }
      await t.vote(a.id, reason);
      if (a.votes.length + 1 < a.needs) { await t.audit(`approval.${a.kind}.approval.recorded`, `${a.title} (${a.id})`, "Approval"); return ok({ status: "Pending", votes: a.votes.length + 1, needs: a.needs }); }
      await t.setApproval(a.id, "Approved", reason); await t.audit(`approval.${a.kind}.approved`, `${a.title} (${a.id}); reason: ${reason}`, "Approval");
      await k.apply(d, t, a, [...a.votes.map((v) => v.byName), me.name].join(", "));
      await t.audit(`${a.kind}.applied`, `${a.title} (${a.id})`, "Approval");
      await t.notify(a.requestedBy, `Approved by ${me.name}: ${a.title.slice(0, 120)}`);
      return ok({ status: "Approved" });
    });
  });
  return { "POST ws/four-eyes/:id/:decision": decide };
}
