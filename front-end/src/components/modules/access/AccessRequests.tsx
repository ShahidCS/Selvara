import { Chip, Empty, Icon, Table } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { sodMessage } from "@/lib/approvalFlow";
import { bumpData } from "@/lib/store";
import { ACCESS_REQUESTS } from "@/lib/requests";
import * as svc from "@/services/access";
import { DecisionForm } from "../mfa/PendingApprovals";

export function AccessRequests({ canAct }: { canAct: boolean }) {
  const L = useLayer();
  const decide = (r: { id: string; user: string; system: string }, d: svc.AccessDecision) => L.openModal(`${d === "Approved" ? "Approve" : "Deny"} ${r.id}`, (close) => (
    <DecisionForm title={`${r.user} → ${r.system}. Your decision and reason are written to the audit log.`} verb={d === "Approved" ? "Approve" : "Deny"} close={close}
      onSubmit={async (reason) => {
        try {
          const out = await svc.decideRequest(r.id, d, reason);
          close();
          if (!out) { L.toast("Request is no longer pending", false); bumpData(); return; }
          L.toast(out.pending ? "First approval recorded, a second approver is required" : "Request " + (d === "Approved" ? "approved" : "denied")); bumpData();
        } catch (e) { L.toast(sodMessage(e, "Could not record the decision"), false); }
      }} />
  ));
  if (!ACCESS_REQUESTS.length) return <Empty icon="access" title="No requests">No access requests are open.</Empty>;
  return (
    <Table cols={[{ t: "ID" }, { t: "User" }, { t: "System" }, { t: "Level" }, { t: "Reason" }, { t: "Status" }, { t: "" }]}>
      {ACCESS_REQUESTS.map((r, ri) => {
        const why = r.status === "Pending" && canAct ? svc.whyCannotDecideRequest(r) : null;
        const two = r.status === "Pending" && svc.isPrivilegedRequest(r);
        return (
          <tr key={r.id + ri}>
            <td className="strong num">{r.id}</td><td>{r.user}{r.requester && r.requester !== r.user ? <div style={{ fontSize: 11, color: "var(--muted)" }}>requested by {r.requester}</div> : null}</td><td>{r.system}</td><td>{r.level}</td><td>{r.reason}</td>
            <td>
              {r.status === "Approved" ? <Chip cls="ok" icon="check">Approved</Chip> : r.status === "Denied" ? <Chip cls="bad" icon="x">Rejected</Chip> : r.status === "Expired" ? <Chip cls="neutral" icon="clock">Expired</Chip> : <Chip cls="warn" icon="clock">{r.stage === "second" ? "Awaiting 2nd approver" : "Pending"}</Chip>}
              {two ? <div style={{ fontSize: 11, color: "var(--muted)" }}>Two approvers required{r.firstApprover ? `; first: ${r.firstApprover}` : ""}</div> : null}
            </td>
            <td className="r">{r.status === "Pending" ? (canAct ? (
              <div className="btngrp" style={{ justifyContent: "flex-end" }}>
                <button className="btn btn-ghost sm" disabled={!!why} title={why || undefined} aria-label={`Approve ${r.id}`} onClick={() => decide(r, "Approved")}><Icon name="check" />Approve</button>
                <button className="btn btn-ghost sm" disabled={!!why} title={why || undefined} aria-label={`Deny ${r.id}`} onClick={() => decide(r, "Denied")}><Icon name="x" />Deny</button>
              </div>
            ) : <span style={{ color: "var(--muted)", fontSize: 12 }}>Read-only</span>) : null}</td>
          </tr>
        );
      })}
    </Table>
  );
}
