import { useEffect, useState } from "react";
import { Chip, Icon, Table } from "@/components/ui";
import { LayerFoot, useLayer } from "@/hooks/useLayer";
import { decideApproval, handlerFor, hoursLeft, myRequest, settle, sodMessage, whyCannotDecide, withdrawApproval } from "@/lib/approvalFlow";
import { approvals } from "@/lib/approvals";
import type { Approval } from "@/lib/approvals";
import { useElevation } from "@/lib/elevation";
import { API_ON } from "@/lib/rbac";
import { SERVER_KINDS } from "@/lib/rulesWs";
import { wsPost } from "@/services/ws";
import { useApp, useData } from "@/lib/store";

/** Reason prompt for Approve / Reject (>= 10 characters, enforced again by the service). */
export function DecisionForm({ title, verb, onSubmit, close }: { title: string; verb: string; onSubmit: (reason: string) => void; close: () => void }) {
  const [reason, setReason] = useState(""); const [err, setErr] = useState(false);
  const go = () => { if (reason.trim().length < 10) { setErr(true); return; } onSubmit(reason.trim()); };
  return (
    <>
      <p style={{ margin: "0 0 8px" }}>{title}</p>
      <div className="field"><label htmlFor="dec-reason">Reason (at least 10 characters)</label><textarea className="input" id="dec-reason" data-focus rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={err} aria-describedby={err ? "dec-err" : undefined} /></div>
      <p className="field help" id="dec-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>Give a reason of at least 10 characters.</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className={`btn ${verb === "Reject" || verb === "Deny" ? "btn-danger" : "btn-primary"}`} onClick={go}>{verb}</button></LayerFoot>
    </>
  );
}

/** Four-eyes inbox for the approval kinds a module owns. Requester sees Withdraw only; others see Approve/Reject (disabled with the reason text). */
export function PendingApprovals({ kinds, title = "Pending approval", subjectLabel = "Subject" }: { kinds: string[]; title?: string; subjectLabel?: string }) {
  useData(); useApp((s) => s.role);
  const L = useLayer(); const elev = useElevation();
  useEffect(() => { settle(); const iv = setInterval(settle, 30_000); return () => clearInterval(iv); }, []);
  const all = approvals.get().list.filter((a) => kinds.includes(a.kind));
  const pending = all.filter((a) => a.status === "Pending");
  const recent = all.filter((a) => a.status !== "Pending").slice(0, 5);
  const decide = (a: Approval, ok: boolean) => L.openModal(`${ok ? "Approve" : "Reject"}: ${a.title}`, (close) => (
    <DecisionForm title={ok ? "Your approval is recorded in the audit log with this reason." : "The request ends as rejected."} verb={ok ? "Approve" : "Reject"} close={close}
      onSubmit={async (reason) => {
        try {
          if (API_ON && SERVER_KINDS.includes(a.kind)) { // production: the server decides and applies it
            const r = await wsPost<{ status: string; votes?: number; needs?: number }>(`/ws/approvals/${encodeURIComponent(a.id)}/${ok ? "approve" : "reject"}`, { reason }); close();
            L.toast(ok ? (r.status === "Approved" ? "Approved, change applied" : `Approval recorded (${r.votes}/${r.needs})`) : "Request rejected"); return;
          }
          const r = decideApproval(a.id, ok, reason); close(); L.toast(ok ? (r.status === "Approved" ? "Approved, change applied" : `Approval recorded (${r.approvals.length}/${r.needs})`) : "Request rejected");
        } catch (e) { L.toast(sodMessage(e, "Could not record the decision"), false); }
      }} />
  ));
  const withdrawIt = async (a: Approval) => {
    try { if (API_ON && SERVER_KINDS.includes(a.kind)) await wsPost(`/ws/approvals/${encodeURIComponent(a.id)}/withdraw`); else withdrawApproval(a.id); L.toast("Request withdrawn"); }
    catch (e) { L.toast(sodMessage(e, "Could not withdraw the request"), false); }
  };
  if (!pending.length && !recent.length) return null;
  return (
    <div className="card" style={pending.length ? { borderLeft: "3px solid var(--warn-ink)" } : undefined}>
      <div className="c-head"><h3>{title}</h3><div className="r"><span className={`chip ${pending.length ? "warn" : "neutral"}`}><Icon name="alert" />{pending.length} awaiting approval</span></div></div>
      <div className="c-body flush" style={{ padding: 0 }}>
        <Table cols={[{ t: "Request" }, { t: subjectLabel }, { t: "Details" }, { t: "Requested by" }, { t: "Approvals" }, { t: "Status" }, { t: "" }]}>
          {pending.concat(recent).map((a) => {
            const mine = myRequest(a); const live = a.status === "Pending";
            const why = live ? whyCannotDecide(a) : null; const adminLocked = a.domain === "admin" && !elev.active;
            const named = a.payload.approver ? String(a.payload.approver) : "";
            return (
              <tr key={a.id}>
                <td className="strong num" style={{ whiteSpace: "nowrap" }}>{a.id}</td><td>{a.subject || "—"}</td>
                <td style={{ fontSize: 12 }}>{handlerFor(a.kind)?.describe(a) || a.title}</td>
                <td style={{ fontSize: 12 }}>{a.requestedBy}<div style={{ fontSize: 11, color: "var(--muted)" }}>{new Date(a.createdAt).toISOString().slice(0, 16).replace("T", " ")} UTC</div></td>
                <td style={{ fontSize: 12 }}>{a.approvals.length}/{a.needs}{named ? <div style={{ fontSize: 11, color: "var(--muted)" }}>Named: {named}</div> : null}</td>
                <td>{live ? <Chip cls="warn" icon="clock">Pending, expires in {hoursLeft(a)} h</Chip> : <Chip cls={a.status === "Approved" ? "ok" : "neutral"} icon={a.status === "Approved" ? "check" : "x"}>{a.status}</Chip>}</td>
                <td className="r" style={{ whiteSpace: "nowrap" }}>
                  {live ? (mine ? (
                    <button className="btn btn-ghost sm" disabled={adminLocked} title={adminLocked ? "Elevate to make changes" : "Withdraw your request (this is not a rejection)"} aria-label={`Withdraw ${a.id}`} onClick={() => withdrawIt(a)}><Icon name="x" />Withdraw</button>
                  ) : (
                    <>
                      <button className="btn btn-ghost sm" disabled={!!why} title={why || undefined} aria-label={`Approve ${a.id}`} onClick={() => decide(a, true)}><Icon name="check" />Approve</button>
                      <button className="btn btn-ghost sm" disabled={!!why} title={why || undefined} aria-label={`Reject ${a.id}`} onClick={() => decide(a, false)}><Icon name="x" />Reject</button>
                    </>
                  )) : null}
                </td>
              </tr>
            );
          })}
        </Table>
      </div>
    </div>
  );
}
