import { useEffect } from "react";
import { Chip, Icon, Page, StatusChip, Table } from "@/components/ui";
import { MFA_REQUESTS, TENANT_ADMINS } from "@/lib/platform";
import { useApp, useData } from "@/lib/store";
import { useGo } from "@/lib/route";
import { useLayer } from "@/hooks/useLayer";
import { useElevation } from "@/lib/elevation";
import { hasRole } from "@/lib/sod";
import * as svc from "@/services/mfa";
import { ResetRequestForm } from "./ResetRequestForm";
import { PendingApprovals } from "./PendingApprovals";

const cn = svc.custName;

/** Prototype: REND.mfa. Four-eyes: the requester cannot approve their own request (button disabled AND refused by the service). */
export default function MfaModule() {
  useData();
  const L = useLayer(); const go = useGo();
  const roleId = useApp((s) => s.role);
  const can = svc.canMfa(roleId);
  const needsElev = hasRole(roleId, "super"); // support only queues a request; deciding needs an elevated super admin
  const elev = useElevation();
  useEffect(() => { svc.syncMfa(); const iv = setInterval(svc.syncMfa, 30_000); return () => clearInterval(iv); }, []);
  const history = MFA_REQUESTS.filter((r) => r.status !== svc.PENDING);
  const lock = "Elevate to make changes";
  return (
    <Page mod="mfa" acts={<button className="btn btn-secondary" onClick={() => go("/admin/adminlog")}><Icon name="log" />Audit log</button>}>
      <div className="scroll" style={{ flex: "1 1 auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingRight: 2 }}>
          {!can ? <p className="field help" role="status" style={{ margin: 0 }}>Read-only: your role cannot raise or decide MFA resets.</p> : null}
          <PendingApprovals kinds={[svc.KIND_ADMIN]} title="Pending approval" subjectLabel="Admin" />
          <div className="card">
            <div className="c-head"><h3>Customer admins</h3><div className="r"><span className="tag">{TENANT_ADMINS.length} admins</span></div></div>
            <div className="c-body flush" style={{ padding: 0 }}>
              <Table cols={[{ t: "Admin" }, { t: "Customer" }, { t: "Role" }, { t: "MFA" }, { t: "Last sign-in" }, { t: "" }]}>
                {TENANT_ADMINS.map((a) => (
                  <tr key={a.id}>
                    <td className="strong">{a.name}<div style={{ fontSize: 12, color: "var(--muted)" }}>{a.email}</div></td>
                    <td>{cn(a.custId)}</td><td>{a.role}</td>
                    <td>{a.mfa === "Enrolled" ? <StatusChip s="Active" /> : a.mfa === "Reset pending" ? <Chip cls="warn" icon="clock">Reset pending</Chip> : <Chip cls="neutral" icon="dot">Not enrolled</Chip>} </td>
                    <td>{a.last}</td>
                    <td className="r"><button className="btn btn-ghost sm" disabled={a.mfa === "Reset pending" || !can || (needsElev && !elev.active)} title={needsElev && !elev.active ? lock : undefined} aria-label={`Reset MFA for ${a.name}`} onClick={() => L.openModal("Reset MFA, " + a.name, (close) => <ResetRequestForm adminId={a.id} close={close} />)}><Icon name="refresh" />Reset MFA</button></td>
                  </tr>
                ))}
              </Table>
            </div>
          </div>
          <div className="card">
            <div className="c-head"><h3>Reset history</h3><div className="r"><span className="tag">{history.length}</span></div></div>
            <div className="c-body flush" style={{ padding: 0 }}>
              {history.length ? (
                <Table cols={[{ t: "Request" }, { t: "Admin" }, { t: "Customer" }, { t: "Reason" }, { t: "Verified by" }, { t: "Ticket" }, { t: "Decision" }, { t: "Decided by" }]}>
                  {history.slice().reverse().map((r) => (
                    <tr key={r.id}>
                      <td className="strong num">{r.id}</td><td>{r.subject}</td><td>{cn(r.custId)}</td><td style={{ fontSize: 12 }}>{r.reason}</td><td style={{ fontSize: 12 }}>{r.method || "—"}</td><td className="num" style={{ fontSize: 12 }}>{r.ticket || "—"}</td>
                      <td>{r.status === "Approved" ? <Chip cls="ok" icon="check">Approved</Chip> : r.status === "Rejected" ? <Chip cls="bad" icon="x">Rejected</Chip> : <Chip cls="neutral" icon={r.status === "Expired" ? "clock" : "x"}>{r.status}</Chip>}</td>
                      <td style={{ fontSize: 12 }}>{r.decidedBy || "—"}<div style={{ fontSize: 11, color: "var(--muted)" }}>{r.decidedAt || ""}</div></td>
                    </tr>
                  ))}
                </Table>
              ) : <div className="empty" style={{ padding: 22 }}><div className="ei"><Icon name="check" /></div><h4>No resets yet</h4></div>}
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
