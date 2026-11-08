import { Empty, Icon, StatusChip, Table } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { wsLog } from "@/lib/audit";
import { bumpData } from "@/lib/store";
import { ACCESS_REQUESTS } from "@/lib/requests";
import * as svc from "@/services/access";

export function AccessRequests({ canAct }: { canAct: boolean }) {
  const L = useLayer();
  const decide = async (id: string, d: svc.AccessDecision) => {
    try {
      const r = await svc.decideRequest(id, d);
      if (!r) { L.toast("Request is no longer pending", false); bumpData(); return; }
      wsLog("access.request." + d.toLowerCase(), r.user + " → " + r.system, "Access");
      L.toast("Request " + d.toLowerCase()); bumpData();
    } catch { L.toast("Could not record the decision", false); }
  };
  if (!ACCESS_REQUESTS.length) return <Empty icon="access" title="No requests">No access requests are open.</Empty>;
  return (
    <Table cols={[{ t: "ID" }, { t: "User" }, { t: "System" }, { t: "Level" }, { t: "Reason" }, { t: "Status" }, { t: "" }]}>
      {ACCESS_REQUESTS.map((r, ri) => (
        <tr key={r.id + ri}>
          <td className="strong num">{r.id}</td><td>{r.user}</td><td>{r.system}</td><td>{r.level}</td><td>{r.reason}</td>
          <td><StatusChip s={r.status === "Approved" ? "Approved" : r.status === "Denied" ? "Rejected" : "Pending"} /></td>
          <td className="r">{r.status === "Pending" ? (canAct ? (
            <div className="btngrp" style={{ justifyContent: "flex-end" }}>
              <button className="btn btn-ghost sm" aria-label={`Approve ${r.id}`} onClick={() => decide(r.id, "Approved")}><Icon name="check" />Approve</button>
              <button className="btn btn-ghost sm" aria-label={`Deny ${r.id}`} onClick={() => decide(r.id, "Denied")}><Icon name="x" />Deny</button>
            </div>
          ) : <span style={{ color: "var(--muted)", fontSize: 12 }}>Read-only</span>) : null}</td>
        </tr>
      ))}
    </Table>
  );
}
