import { Icon, StatusChip, Table } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { wsLog } from "@/lib/audit";
import { bumpData } from "@/lib/store";
import { safeFileName } from "@/lib/security";
import * as svc from "@/services/evidence";
import { AttachFile, DeleteEvidence, EvidenceForm, NewVersion } from "./EvidenceForms";

/** Right-hand preview card (source evShow). All values render as React text. */
export default function EvidencePreview({ id }: { id: string }) {
  const L = useLayer();
  const e = svc.findEvidence(id);
  if (!e) return <EmptyPreview />;
  svc.evInit(e);
  const detach = async (ai: number) => {
    try {
      const f = await svc.removeAttachment(id, ai);
      wsLog("evidence.attachment.removed", (f ? f.name : "") + " from " + e.name, "Control");
      L.toast("File removed"); bumpData();
    } catch { L.toast("Something went wrong. Please try again.", false); }
  };
  return (
    <>
      <div className="c-head"><h3>{e.name}</h3><div className="r"><StatusChip s="Active" />
        <button className="btn btn-ghost sm" onClick={() => L.openModal("Edit evidence", (close) => <EvidenceForm id={id} close={close} />)}><Icon name="team" />Edit</button>
        <button className="btn btn-ghost sm" onClick={() => L.openModal("Delete evidence?", (close) => <DeleteEvidence id={id} close={close} />)}><Icon name="x" />Delete</button></div></div>
      <div className="c-body scroll">
        <dl className="meta-grid"><dt>Type</dt><dd>{e.type}</dd><dt>Current version</dt><dd>v{e.ver}</dd><dt>Updated</dt><dd>{e.updated}</dd><dt>Collected by</dt><dd>{e.by}</dd><dt>ID</dt><dd className="num">{e.id}</dd></dl>
        <div className="hr"></div><div className="sectitle">Notes</div><p className="field help">{e.note}</p>
        <div className="hr"></div><div style={{ display: "flex", alignItems: "center" }}><div className="sectitle" style={{ margin: 0 }}>Attachments ({e.attachments.length})</div><button className="btn btn-ghost sm" style={{ marginLeft: "auto" }} onClick={() => L.openModal("Attach file", (close) => <AttachFile id={id} close={close} />)}><Icon name="plus" />Attach file</button></div>
        {e.attachments.length ? (
          <Table cols={[{ t: "File" }, { t: "Size" }, { t: "" }]}>
            {e.attachments.map((a: { name: string; size: string }, ai: number) => (
              <tr key={ai}><td className="strong"><Icon name="evidence" /> {safeFileName(a.name)}</td><td className="num" style={{ color: "var(--muted)" }}>{a.size}</td>
                <td className="r"><button className="btn btn-ghost sm" aria-label={`Remove ${safeFileName(a.name)}`} onClick={() => detach(ai)}><Icon name="x" />Remove</button></td></tr>
            ))}
          </Table>
        ) : <p className="field help">No files attached.</p>}
        <div className="hr"></div><div style={{ display: "flex", alignItems: "center" }}><div className="sectitle" style={{ margin: 0 }}>Version history</div><button className="btn btn-ghost sm" style={{ marginLeft: "auto" }} onClick={() => L.openModal("New version", (close) => <NewVersion id={id} close={close} />)}><Icon name="plus" />New version</button></div>
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
