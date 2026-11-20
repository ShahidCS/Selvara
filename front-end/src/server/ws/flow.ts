/* Server-only. Decisions on the four-eyes requests People and Access raise (production programme group 2; inventory group 2, section 0.5): a
   member MFA reset (named approver; two approvers for a privileged person), the offboarding of a privileged person, and the second approval
   of privileged access. Rules of the demonstration's approval flow: no self-approval, not the subject, one vote per person, a reason of at
   least 10 characters, the named approver (or their live delegate) must decide, and with two approvers the named one must be among them. The
   change happens only on the final approval; an MFA reset then really resets (people.ts). */
import { approvalBlock, reasonBlock } from "@/lib/rules";
import { ACCESS_KINDS, grantFor, sweepAccess, type AccessRequest } from "./access";
import { approvalsView, invalid, membersOf, missing, modAllowed, ok, refuse, stepUp, str, txt, wsRoute, type WsHelpers } from "./common";
import { actsAs } from "./delegation";
import { PEOPLE_KINDS, applyMfaReset, endSessions, offboardIn, sweepPeople } from "./people";
import type { Actor } from "./store";

const KINDS = [...PEOPLE_KINDS, ...ACCESS_KINDS];
const VERB: Record<string, string> = { "mfa-reset-member": "person.mfa.reset", offboard: "person.offboard" };

export function flowRoutes(h: WsHelpers) {
  const list = wsRoute(h, "people", async (d, _r, c) => ok(await d.ws.tx(c.actor, d.now(), async (t) => {
    await sweepPeople(t); return approvalsView(t, PEOPLE_KINDS, new Map((await membersOf(d, c.actor)).map((m) => [m.id, m.name])));
  })));
  const decide = wsRoute(h, null, async (d, r, c) => {
    const me: Actor = c.actor; const id = str(r.path[2], 60); const decision = r.path[3];
    if (!["approve", "reject", "withdraw"].includes(decision)) return missing("Action");
    let after: (() => Promise<void>) | null = null;
    const res = await d.ws.tx(me, d.now(), async (t) => {
      await sweepPeople(t); await sweepAccess(t);
      const a = (await t.approval(id, KINDS)) ?? missing("Request");
      const mod = a.kind === "access-request" ? "access" : "people";
      if (!modAllowed(me.role, mod)) refuse("Not permitted.");
      const closed = async (status: string, why = "") => {
        if (a.kind === "access-request") {
          const rq = await t.get<AccessRequest>("access-request", String(a.payload.reqId));
          if (rq) { rq.data.status = status === "rejected" ? "Denied" : "Expired"; rq.data.decisionReason = why; rq.data.decidedBy = me.name; await t.update("access-request", rq.id, rq.data, rq.version); }
          await t.audit(status === "rejected" ? "access.request.denied" : "access.request.withdrawn", `${a.payload.system ? `${a.title.replace(/^Second approval: /, "")}` : a.title}${why ? `; reason: ${why}` : ""}`, "Access");
        } else await t.audit(`${VERB[a.kind]}.${status}`, `${a.payload.person ?? ""}${why ? `; reason: ${why}` : ""}`, "Access");
      };
      if (decision === "withdraw") {
        if (a.requestedBy !== me.id) refuse("Only the requester can withdraw a request.");
        if (a.status !== "Pending") invalid(`Request is ${a.status.toLowerCase()}.`);
        await t.setApproval(a.id, "Withdrawn"); await t.audit(`approval.${a.kind}.withdrawn`, `${a.title} (${a.id})`, "Approval"); await closed("withdrawn");
        return ok({ status: "Withdrawn" });
      }
      refuse(approvalBlock({ key: me.id, base: me.role }, { status: a.status, expiresAt: a.expiresAt, approverRoles: a.approverRoles, requestedBy: a.requestedBy, forbid: a.forbid, votes: a.votes.map((v) => v.by) }, t.now));
      if (a.kind === "access-request" && a.payload.firstApproverId === me.id) refuse("Segregation of duties: a different admin or owner must give the second approval.");
      const reason = txt(r.body.reason, 300); const bad = reasonBlock(reason); if (bad) invalid(bad);
      if (decision === "approve" && a.kind !== "access-request") await stepUp(d, c);
      const namedId = a.payload.approverId ? String(a.payload.approverId) : null;
      const meta = (await t.get<{ delegated: Record<string, string> }>("approval-meta", a.id)) ?? null;
      const as = namedId ? await actsAs(t, me, namedId, { requestedBy: a.requestedBy, forbid: a.forbid }) : { ok: true, onBehalfOf: null };
      if (namedId && a.needs < 2 && !as.ok) refuse(`Only the named approver (${a.payload.approver}) can decide this request.`);
      const final = a.votes.length + 1 >= a.needs;
      const namedVoted = !!namedId && (a.votes.some((v) => v.by === namedId) || Object.values(meta?.data.delegated ?? {}).includes(namedId));
      if (decision === "approve" && namedId && final && !as.ok && !namedVoted) refuse(`The named approver (${a.payload.approver}) must also approve this request.`);
      if (as.onBehalfOf) {
        const m = meta?.data ?? { delegated: {} }; m.delegated[me.id] = namedId!;
        if (meta) await t.update("approval-meta", a.id, m, meta.version); else await t.insert("approval-meta", a.id, m);
        await t.audit(`approval.${a.kind}.on_behalf`, `${a.title} (${a.id}): ${decision === "approve" ? "approved" : "rejected"} by ${me.name} on behalf of ${as.onBehalfOf} (delegation)`, "Approval");
      }
      if (decision === "reject") {
        await t.setApproval(a.id, "Rejected", reason); await t.audit(`approval.${a.kind}.rejected`, `${a.title} (${a.id}); reason: ${reason}`, "Approval"); await closed("rejected", reason);
        return ok({ status: "Rejected" });
      }
      await t.vote(a.id, reason);
      if (!final) { await t.audit(`approval.${a.kind}.approval.recorded`, `${a.title} (${a.id})`, "Approval"); return ok({ status: "Pending", votes: a.votes.length + 1, needs: a.needs }); }
      await t.setApproval(a.id, "Approved", reason); await t.audit(`approval.${a.kind}.approved`, `${a.title} (${a.id}); reason: ${reason}`, "Approval");
      const by = [...a.votes.map((v) => v.byName), me.name].join(", ");
      if (a.kind === "access-request") {
        const rq = (await t.get<AccessRequest>("access-request", String(a.payload.reqId))) ?? missing("Request");
        rq.data.status = "Approved"; rq.data.decidedBy = `${me.name}, ${a.payload.firstApprover}`; rq.data.decisionReason = reason; await t.update("access-request", rq.id, rq.data, rq.version);
        await grantFor(t, rq.data, `request ${rq.id}`);
        await t.audit("access.request.approved", `${rq.data.user} → ${rq.data.system}; two approvers: ${me.name}, ${a.payload.firstApprover}`, "Access");
      } else if (a.kind === "mfa-reset-member") {
        // applied before this unit of work commits: if it fails, the decision is undone too and can be made again (the reset is idempotent)
        await applyMfaReset(d, me.tenantId, String(a.payload.personId));
        await t.audit("person.mfa.reset", `${a.payload.person}; approved by ${by}; ticket ${a.payload.ticket}; effects applied: sessions revoked, factors removed, user notified, re-enrolment forced, recovery codes invalidated`, "Access");
      } else if (a.kind === "offboard") {
        const p = { id: String(a.payload.personId), name: String(a.payload.person), member: a.payload.member !== false };
        const to = { id: String(a.payload.transferToId), name: String(a.payload.transferTo) };
        await offboardIn(t, d, p, to, `; approved by ${by}`);
        if (p.member) after = async () => { await endSessions(d, p.id, me.tenantId, "Offboarded"); };
      }
      return ok({ status: "Approved" });
    });
    if (after) await after();
    return res;
  });
  return { "GET ws/data/people-approvals": list, "POST ws/approvals/:id/:decision": decide };
}
