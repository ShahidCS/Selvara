import { API_ON } from "@/lib/rbac";
import { Chip, Empty, Icon, Page, StatusChip, Table, DocCard, DocGrid } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { bumpData, useApp, useData } from "@/lib/store";
import { useGo } from "@/lib/route";
import { safeFileName } from "@/lib/security";
import { iAm, uiMessage } from "@/lib/grcSod";
import * as svc from "@/features/evidence/services/evidence";
import { AttachFile, ConfirmRemoveFile, DeleteEvidence, NewVersion, ReasonModal } from "./EvidenceForms";

/** Review state as a chip with icon and words. One name for the waiting state everywhere: "Pending review" (tab, KPI and chip). */
export function ReviewChip({ status }: { status: string }) {
  if (status === "Accepted" || status === "Rejected") return <StatusChip s={status} />;
  return <Chip cls="warn" icon="clock">Pending review</Chip>;
}

/** An evidence item as a page (`/ws/evidence/:id`): review, attachments, version history and the two-person deletion. Same service calls as the old preview;
 *  the reason and choice dialogs (accept, reject, deletion request and decision, attach file, new version) remain dialogs. */
export function EvidenceDetail({ id }: { id: string }) {
  useData(); useApp((s) => s.role);
  const L = useLayer(); const go = useGo();
  const back = { href: "/ws/evidence", label: "Evidence" };
  const e = svc.findEvidence(id);
  if (!e) return <Page title="Evidence not found" back={back}><Empty icon="evidence" title="No such evidence">There is no evidence with the ID &ldquo;{id}&rdquo;. It may have been deleted, or the link may be wrong.</Empty></Page>;
  svc.evInit(e);
  const writeWhy = svc.whyCannotWrite();
  const reviewWhy = svc.whyCannotReview(e);
  const delWhy = svc.whyCannotRequestDelete(e);
  const pend = svc.pendingDelete(e);
  const decideWhy = pend ? svc.whyCannotDecideDelete(e) : null;
  const rv = e.review as { status: string; by?: string; at?: string; note?: string };
  const detach = (ai: number, file: string) => L.openModal("Remove file", (close) => <ConfirmRemoveFile file={file} evidence={e.name} close={close} run={async () => {
    try { await svc.removeAttachment(id, ai); L.toast(file + " removed"); bumpData(); } catch (x) { L.toast(uiMessage(x), false); }
  }} />);
  /** Production: a link valid for 60 seconds, served by the storage service as a download (never shown inline here). */
  const download = async (fileId: string) => { try { const { url } = await svc.attachmentLink(id, fileId); window.location.assign(url); } catch (x) { L.toast(uiMessage(x), false); } };
  const decide = (decision: "approve" | "reject") => L.openModal(decision === "approve" ? "Approve deletion" : "Reject deletion", (close) =>
    <ReasonModal title={`Deletion of ${e.name} requested by ${pend?.requestedBy}: ${e.deleteRequest?.reason}`} label={decision === "approve" ? "Approval reason" : "Reason"} min={10} confirm={decision === "approve" ? "Approve and delete" : "Reject"} danger={decision === "approve"} close={close}
      run={async (r) => { const done = await svc.decideDelete(id, decision, r); if (done) go("/ws/evidence"); return done ? "Evidence deleted (second admin approved)" : "Deletion rejected"; }} />);
  const review = (d: "Accepted" | "Rejected") => L.openModal(d === "Accepted" ? "Accept evidence" : "Reject evidence", (close) =>
    <ReasonModal title={`Collected by ${e.by}. You confirm you did not collect or change this evidence.`} label={d === "Accepted" ? "Review note (optional)" : "What needs fixing"} min={d === "Accepted" ? 0 : 10} confirm={d === "Accepted" ? "Accept" : "Reject"} close={close}
      run={async (r) => { await svc.reviewEvidence(id, d, r); return d === "Accepted" ? "Evidence accepted" : "Evidence rejected"; }} />);
  const btn = (label: string, icon: string, why: string | null, onClick: () => void, cls = "btn-ghost", size = "sm") => <button className={`btn ${cls}${size ? " " + size : ""}`} disabled={!!why} title={why || undefined} onClick={onClick}><Icon name={icon} />{label}</button>;

  return (
    <Page title={e.name} sub={`${e.id}, ${e.type}, v${e.ver}`} back={back} acts={<>
      {btn("Edit", "edit", writeWhy, () => go(`/ws/evidence/${encodeURIComponent(id)}/edit`), "btn-secondary", "")}
      {btn("Request deletion", "trash", delWhy, () => L.openModal("Request deletion", (close) => <DeleteEvidence id={id} close={close} />), "btn-ghost", "")}
    </>}>
      <div className="scroll rec-scroll">
        {pend ? (
          <div className="card" style={{ background: "var(--warn-bg)", borderColor: "var(--warn-ink)", marginBottom: 12 }} role="status"><div className="c-body" style={{ padding: 12 }}>
            <div style={{ fontWeight: 600 }}><Icon name="alert" /> Deletion requested by {pend.requestedBy}</div>
            <div style={{ fontSize: ".78125rem", color: "var(--muted)", margin: "3px 0 8px" }}>Reason: {e.deleteRequest?.reason}. A second admin must approve; nothing is deleted yet.</div>
            <div className="btngrp">
              {btn("Approve deletion", "check", decideWhy, () => decide("approve"), "btn-danger")}
              {btn("Reject", "x", decideWhy, () => decide("reject"), "btn-secondary")}
              {iAm(pend.requestedBy) ? btn("Withdraw", "back", null, async () => { try { await svc.withdrawDelete(id); L.toast("Request withdrawn"); bumpData(); } catch (x) { L.toast(uiMessage(x), false); } }) : null}
            </div>
            {decideWhy ? <p className="field help" style={{ margin: "6px 0 0" }}>{decideWhy}</p> : null}
          </div></div>
        ) : null}

        <div className="rec-grid">
          <div className="rec-main">
            <div className="card"><div className="c-head"><h3>Review</h3><ReviewChip status={rv.status} /></div><div className="c-body">
              <p className="field help" style={{ marginTop: 0 }}>{rv.status}{rv.by ? ` by ${rv.by} on ${rv.at}` : ""}{rv.note ? `: ${rv.note}` : ""}. A reviewer who did not collect, version or attach to this evidence accepts or rejects it.</p>
              <div className="btngrp" style={{ marginTop: 12 }}>
                {btn("Accept", "check", reviewWhy, () => review("Accepted"), "btn-primary")}
                {btn("Reject", "x", rv.status === "Rejected" ? "Already rejected." : reviewWhy, () => review("Rejected"), "btn-secondary")}
              </div>
              {reviewWhy ? <p className="field help" style={{ margin: "6px 0 0" }}>{reviewWhy}</p> : null}
            </div></div>

            <div className="card"><div className="c-head"><h3>Attachments</h3><span className="sub">{e.attachments.length}</span>
              <button className="btn btn-ghost sm" style={{ marginLeft: "auto" }} disabled={!!writeWhy} title={writeWhy || undefined} onClick={() => L.openModal("Attach file", (close) => <AttachFile id={id} close={close} />)}><Icon name="plus" />Attach file</button></div>
              <div className="c-body flush" style={{ padding: 0 }}>
                {e.attachments.length ? (
                  <DocGrid>
                    {e.attachments.map((a: { id?: string; name: string; size: string }, ai: number) => (
                      <DocCard key={ai} name={safeFileName(a.name)} meta={a.size} actions={<>{API_ON && a.id ? <button className="btn btn-ghost sm" aria-label={`Download ${safeFileName(a.name)}`} onClick={() => download(a.id!)}><Icon name="download" />Download</button> : null}<button className="btn btn-ghost sm" disabled={!!writeWhy} title={writeWhy || undefined} aria-label={`Remove ${safeFileName(a.name)}`} onClick={() => detach(ai, safeFileName(a.name))}><Icon name="x" />Remove</button></>} />
                    ))}
                  </DocGrid>
                ) : <Empty icon="evidence" title="No files attached">Attach the file this evidence refers to.</Empty>}
              </div></div>

            <div className="card"><div className="c-head"><h3>Version history</h3>
              <button className="btn btn-ghost sm" style={{ marginLeft: "auto" }} disabled={!!writeWhy} title={writeWhy || undefined} onClick={() => L.openModal("New version", (close) => <NewVersion id={id} close={close} />)}><Icon name="plus" />New version</button></div>
              <div className="c-body flush" style={{ padding: 0 }}>
                <Table cols={[{ t: "Version" }, { t: "Date" }, { t: "By" }, { t: "Note" }]}>
                  {e.history.slice().reverse().map((h: { ver: number; at: string; by: string; note: string }, i: number) => (
                    <tr key={i}><td className="strong num">v{h.ver}</td><td>{h.at}</td><td>{h.by}</td><td>{h.note}</td></tr>
                  ))}
                </Table>
              </div></div>
          </div>

          <aside className="rec-side">
            <div className="card"><div className="c-head"><h3>Details</h3></div><div className="c-body">
              <dl className="meta-grid"><dt>Type</dt><dd>{e.type}</dd><dt>Current version</dt><dd>v{e.ver}</dd><dt>Updated</dt><dd>{e.updated}</dd><dt>Collected by</dt><dd>{e.by}</dd><dt>ID</dt><dd className="num">{e.id}</dd></dl>
            </div></div>
            <div className="card"><div className="c-head"><h3>Notes</h3></div><div className="c-body"><p className="field help" style={{ margin: 0 }}>{e.note || "No notes."}</p></div></div>
          </aside>
        </div>
      </div>
    </Page>
  );
}
