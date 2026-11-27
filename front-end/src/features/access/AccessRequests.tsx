import { Chip, DataTable, Empty, Icon, type DTColumn } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { sodMessage } from "@/lib/approvalFlow";
import { bumpData } from "@/lib/store";
import { ACCESS_REQUESTS } from "@/lib/requests";
import * as svc from "@/services/access";
import { DecisionForm } from "@/features/mfa";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Req = any;
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
  const cols: DTColumn<Req>[] = [
    { key: "id", header: "ID", nowrap: true, value: (r) => r.id, locked: true, render: (r) => <span className="strong num">{r.id}</span> },
    { key: "user", header: "User", value: (r) => r.user, render: (r) => <>{r.user}{r.requester && r.requester !== r.user ? <div style={{ fontSize: ".6875rem", color: "var(--muted)" }}>requested by {r.requester}</div> : null}</> },
    { key: "system", header: "System", value: (r) => r.system, render: (r) => r.system },
    { key: "level", header: "Level", value: (r) => r.level, render: (r) => r.level },
    { key: "reason", header: "Reason", value: (r) => r.reason, render: (r) => r.reason },
    { key: "status", header: "Status", value: (r) => r.status, render: (r) => {
      const two = r.status === "Pending" && svc.isPrivilegedRequest(r);
      return (
        <>
          {r.status === "Approved" ? <Chip cls="ok" icon="check">Approved</Chip> : r.status === "Denied" ? <Chip cls="bad" icon="x">Denied</Chip> : r.status === "Expired" ? <Chip cls="neutral" icon="clock">Expired</Chip> : <Chip cls="warn" icon="clock">{r.stage === "second" ? "Awaiting 2nd approver" : "Pending"}</Chip>}
          {two ? <div style={{ fontSize: ".6875rem", color: "var(--muted)" }}>Two approvers required{r.firstApprover ? `; first: ${r.firstApprover}` : ""}</div> : null}
        </>
      );
    } },
    { key: "act", header: "Actions", align: "end", locked: true, render: (r) => {
      const why = r.status === "Pending" && canAct ? svc.whyCannotDecideRequest(r) : null;
      return r.status === "Pending" ? (canAct ? (
        <div className="btngrp" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-ghost sm" disabled={!!why} title={why || undefined} aria-label={`Approve ${r.id}`} onClick={() => decide(r, "Approved")}><Icon name="check" />Approve</button>
          <button className="btn btn-ghost sm" disabled={!!why} title={why || undefined} aria-label={`Deny ${r.id}`} onClick={() => decide(r, "Denied")}><Icon name="x" />Deny</button>
        </div>
      ) : <span style={{ color: "var(--muted)", fontSize: ".75rem" }}>Read-only</span>) : null;
    } },
  ];
  return (
    <DataTable<Req> id="access-requests" label="Access requests" rows={ACCESS_REQUESTS} rowKey={(r) => `${r.id}|${ACCESS_REQUESTS.indexOf(r)}`} columns={cols} searchText={(r) => `${r.id} ${r.user} ${r.system} ${r.reason}`}
      tabs={["Pending", "Approved", "Denied", "Expired"].map((x) => ({ key: x, label: x, match: (r: Req) => r.status === x }))} />
  );
}
