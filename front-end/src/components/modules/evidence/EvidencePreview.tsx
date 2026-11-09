import { Icon, StatusChip, Table } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { bumpData, useApp, useData } from "@/lib/store";
import { safeFileName } from "@/lib/security";
import { iAm, uiMessage } from "@/lib/grcSod";
import * as svc from "@/services/evidence";
import { AttachFile, DeleteEvidence, EvidenceForm, NewVersion, ReasonModal } from "./EvidenceForms";

/** Right-hand preview card (source evShow). All values render as React text. */
export default function EvidencePreview({ id }: { id: string }) {
  useData(); useApp((s) => s.role);
  const L = useLayer();
  const e = svc.findEvidence(id);
  if (!e) return <EmptyPreview />;
  svc.evInit(e);
  const writeWhy = svc.whyCannotWrite();
  const reviewWhy = svc.whyCannotReview(e);
  const delWhy = svc.whyCannotRequestDelete(e);
  const pend = svc.pendingDelete(e);
  const decideWhy = pend ? svc.whyCannotDecideDelete(e) : null;
  const rv = e.review as { status: string; by?: string; at?: string; note?: string };
  const detach = async (ai: number) => {
    try { await svc.removeAttachment(id, ai); L.toast("File removed"); bumpData(); } catch (x) { L.toast(uiMessage(x), false); }
  };
  const decide = (decision: "approve" | "reject") => L.openModal(decision === "approve" ? "Approve deletion" : "Reject deletion", (close) =>
    <ReasonModal title={`Deletion of ${e.name} requested by ${pend?.requestedBy}: ${e.deleteRequest?.reason}`} label={decision === "approve" ? "Approval reason" : "Reason"} min={10} confirm={decision === "approve" ? "Approve and delete" : "Reject"} danger={decision === "approve"} close={close}
      run={async (r) => { const done = await svc.decideDelete(id, decision, r); return done ? "Evidence deleted (second admin approved)" : "Deletion rejected"; }} />);
  const review = (d: "Accepted" | "Rejected") => L.openModal(d === "Accepted" ? "Accept evidence" : "Reject evidence", (close) =>
    <ReasonModal title={`Collected by ${e.by}. You confirm you did not collect or change this evidence.`} label={d === "Accepted" ? "Review note (optional)" : "What needs fixing"} min={d === "Accepted" ? 0 : 10} confirm={d === "Accepted" ? "Accept" : "Reject"} close={close}
      run={async (r) => { await svc.reviewEvidence(id, d, r); return d === "Accepted" ? "Evidence accepted" : "Evidence rejected"; }} />);
  const btn = (label: string, icon: string, why: string | null, onClick: () => void, cls = "btn-ghost") => <button className={`btn ${cls} sm`} disabled={!!why} title={why || undefined} onClick={onClick}><Icon name={icon} />{label}</button>;
  return (
    <>
      <div className="c-head"><h3>{e.name}</h3><div className="r"><StatusChip s={rv.status === "Accepted" ? "Approved" : rv.status === "Rejected" ? "Rejected" : "Pending"} />
        {btn("Edit", "team", writeWhy, () => L.openModal("Edit evidence", (close) => <EvidenceForm id={id} close={close} />))}
        {btn("Request deletion", "x", delWhy, () => L.openModal("Request deletion", (close) => <DeleteEvidence id={id} close={close} />))}</div></div>
      <div className="c-body scroll">
        {pend ? (
          <div className="card" style={{ boxShadow: "none", background: "var(--surface-2)", marginBottom: 12 }} role="alert"><div className="c-body" style={{ padding: 11 }}>
            <div style={{ fontWeight: 600 }}><Icon name="alert" /> Deletion requested by {pend.requestedBy}</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", margin: "3px 0 8px" }}>Reason: {e.deleteRequest?.reason}. A second admin must approve; nothing is deleted yet.</div>
            <div className="btngrp">
              {btn("Approve deletion", "check", decideWhy, () => decide("approve"), "btn-danger")}
              {btn("Reject", "x", decideWhy, () => decide("reject"), "btn-secondary")}
              {iAm(pend.requestedBy) ? btn("Withdraw", "back", null, async () => { try { await svc.withdrawDelete(id); L.toast("Request withdrawn"); bumpData(); } catch (x) { L.toast(uiMessage(x), false); } }) : null}
            </div>
            {decideWhy ? <p className="field help" style={{ margin: "6px 0 0" }}>{decideWhy}</p> : null}
          </div></div>
        ) : null}
        <dl className="meta-grid"><dt>Type</dt><dd>{e.type}</dd><dt>Current version</dt><dd>v{e.ver}</dd><dt>Updated</dt><dd>{e.updated}</dd><dt>Collected by</dt><dd>{e.by}</dd><dt>Review</dt><dd>{rv.status}{rv.by ? ` by ${rv.by} on ${rv.at}` : ""}{rv.note ? `: ${rv.note}` : ""}</dd><dt>ID</dt><dd className="num">{e.id}</dd></dl>
        <div className="hr"></div><div className="sectitle">Review</div>
        <div className="btngrp">
          {btn("Accept", "check", reviewWhy, () => review("Accepted"), "btn-primary")}
          {btn("Reject", "x", rv.status === "Rejected" ? "Already rejected." : reviewWhy, () => review("Rejected"), "btn-secondary")}
        </div>
        {reviewWhy ? <p className="field help" style={{ margin: "6px 0 0" }}>{reviewWhy}</p> : null}
        <div className="hr"></div><div className="sectitle">Notes</div><p className="field help">{e.note}</p>
        <div className="hr"></div><div style={{ display: "flex", alignItems: "center" }}><div className="sectitle" style={{ margin: 0 }}>Attachments ({e.attachments.length})</div><button className="btn btn-ghost sm" style={{ marginLeft: "auto" }} disabled={!!writeWhy} title={writeWhy || undefined} onClick={() => L.openModal("Attach file", (close) => <AttachFile id={id} close={close} />)}><Icon name="plus" />Attach file</button></div>
        {e.attachments.length ? (
          <Table cols={[{ t: "File" }, { t: "Size" }, { t: "" }]}>
            {e.attachments.map((a: { name: string; size: string }, ai: number) => (
              <tr key={ai}><td className="strong"><Icon name="evidence" /> {safeFileName(a.name)}</td><td className="num" style={{ color: "var(--muted)" }}>{a.size}</td>
                <td className="r"><button className="btn btn-ghost sm" disabled={!!writeWhy} title={writeWhy || undefined} aria-label={`Remove ${safeFileName(a.name)}`} onClick={() => detach(ai)}><Icon name="x" />Remove</button></td></tr>
            ))}
          </Table>
        ) : <p className="field help">No files attached.</p>}
        <div className="hr"></div><div style={{ display: "flex", alignItems: "center" }}><div className="sectitle" style={{ margin: 0 }}>Version history</div><button className="btn btn-ghost sm" style={{ marginLeft: "auto" }} disabled={!!writeWhy} title={writeWhy || undefined} onClick={() => L.openModal("New version", (close) => <NewVersion id={id} close={close} />)}><Icon name="plus" />New version</button></div>
        <Table cols={[{ t: "Version" }, { t: "Date" }, { t: "By" }, { t: "Note" }]}>
          {e.history.slice().reverse().map((h: { ver: number; at: string; by: string; note: string }, i: number) => (
            <tr key={i}><td className="strong num">v{h.ver}</td><td>{h.at}</td><td>{h.by}</td><td>{h.note}</td></tr>
          ))}
        </Table>
      </div>
    </>
  );
}

export function EmptyPreview() {
  return (
    <div className="c-body"><div className="empty"><div className="ei"><Icon name="evidence" /></div><h4>Select evidence</h4><p>Choose an item on the left to preview its details, attachments and version history.</p></div></div>
  );
}
