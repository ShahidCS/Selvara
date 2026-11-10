import { useEffect, useState } from "react";
import { Icon, Table } from "@/components/ui";
import { LayerFoot } from "@/components/shell/LayerProvider";
import { useLayer } from "@/hooks/useLayer";
import { APPROVAL_REASON_MIN, approvalBlockReason, isRequester, pendingAdminApprovals } from "@/lib/adminApprovals";
import { sweepExpired, type Approval } from "@/lib/approvals";
import { fmtUtc, sodMessage, useElevation } from "@/lib/elevation";
import { useData } from "@/lib/store";

/** Reason prompt for Approve / Reject (>= 10 characters; the service checks it again). */
function DecideForm({ a, ok, run, close }: { a: Approval; ok: boolean; run: (id: string, ok: boolean, reason: string) => Promise<unknown>; close: () => void }) {
  const L = useLayer(); const [reason, setReason] = useState("");
  const short = reason.trim().length < APPROVAL_REASON_MIN;
  const go = async () => {
    try { await run(a.id, ok, reason); close(); L.toast(ok ? "Approved" : "Rejected"); }
    catch (e) { L.toast(sodMessage(e, "Could not record the decision"), false); }
  };
  return (
    <>
      <p style={{ margin: "0 0 10px" }}>{a.title}</p>
      <p className="field help" style={{ margin: "0 0 10px" }}>Requested by {a.requestedBy}{a.ticket ? ", ticket " + a.ticket : ""}. Your decision and reason are written to the admin audit log.</p>
      <div className="field"><label htmlFor="apReason">Reason (at least {APPROVAL_REASON_MIN} characters)</label><textarea className="input" id="apReason" data-focus maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className={"btn " + (ok ? "btn-primary" : "btn-danger")} disabled={short} onClick={go}>{ok ? "Approve" : "Reject"}</button></LayerFoot>
    </>
  );
}

/** Pending four-eyes requests of one family. Approve/Reject are for a different elevated super admin and are disabled with the reason otherwise
 *  (engine `whyCannotApprove`, then "Elevate to make changes"); the requester sees Withdraw instead. Rendered only when something is pending. UI is not the control. */
export function PendingApprovals({ prefix, title, run, withdraw }: {
  prefix: string; title: string; run: (id: string, ok: boolean, reason: string) => Promise<unknown>; withdraw: (id: string) => Promise<unknown>;
}) {
  useData(); const L = useLayer(); const el = useElevation(); void el.active; // re-render when elevation changes
  useEffect(() => { sweepExpired(); }, []);
  const list = pendingAdminApprovals(prefix);
  if (!list.length) return null;
  const doWithdraw = async (a: Approval) => {
    try { await withdraw(a.id); L.toast("Request withdrawn"); } catch (e) { L.toast(sodMessage(e, "Could not withdraw the request"), false); }
  };
  const open = (a: Approval, ok: boolean) => L.openModal((ok ? "Approve" : "Reject") + " " + a.id, (close) => <DecideForm a={a} ok={ok} run={run} close={close} />);
  return (
    <div className="card" style={{ flex: "0 0 auto", marginBottom: 14 }} aria-label={title}>
      <div className="c-head"><h3>{title} ({list.length})</h3></div>
      <div className="c-body flush" style={{ padding: 0 }}>
        <Table cols={[{ t: "Request" }, { t: "Requested by" }, { t: "Ticket" }, { t: "Expires" }, { t: "" }]}>
          {list.map((a) => {
            const mine = isRequester(a); const block = approvalBlockReason(a);
            return (
              <tr key={a.id}>
                <td><div className="strong">{a.title}</div><div className="meta num">{a.id}</div></td>
                <td>{a.requestedBy}</td><td className="num">{a.ticket || "-"}</td><td className="num">{fmtUtc(a.expiresAt)}</td>
                <td className="r" style={{ whiteSpace: "nowrap" }}>
                  {mine ? <button className="btn btn-ghost sm" disabled={!el.active} title={el.active ? undefined : "Elevate to make changes"} onClick={() => doWithdraw(a)}><Icon name="x" />Withdraw</button> : <>
                    <button className="btn btn-primary sm" aria-label={`Approve ${a.id}`} disabled={!!block} title={block || undefined} onClick={() => open(a, true)}><Icon name="check" />Approve</button>
                    <button className="btn btn-ghost sm" aria-label={`Reject ${a.id}`} disabled={!!block} title={block || undefined} onClick={() => open(a, false)}><Icon name="x" />Reject</button></>}
                </td>
              </tr>
            );
          })}
        </Table>
      </div>
    </div>
  );
}
