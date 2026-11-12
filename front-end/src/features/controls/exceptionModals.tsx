import { useState } from "react";
import { LayerFoot } from "@/components/shell/LayerProvider";
import type { LayerApi } from "@/components/shell/LayerProvider";
import { clampText } from "@/lib/security";
import { uiMessage } from "@/lib/grcSod";
import * as svc from "@/features/controls/services/controls";
import { DATA } from "@/lib/data";

export const Req = () => <span style={{ color: "var(--bad-ink)" }}>*</span>;
export const Err = ({ t }: { t: string }) => <p className="field help" role="alert" style={{ color: "var(--bad-ink)", display: t ? "block" : "none" }}>{t}</p>;

function ReasonForm({ L, label, confirm, run, done }: { L: LayerApi; label: string; confirm: string; run: (r: string) => Promise<string>; done: () => void }) {
  const [reason, setReason] = useState(""); const [err, setErr] = useState("");
  const submit = async () => {
    if (clampText(reason, 500).length < 10) { setErr("Give a reason of at least 10 characters."); return; }
    try { const m = await run(clampText(reason, 500)); L.closeLayer(); L.toast(m); done(); } catch (e) { L.toast(uiMessage(e), false); }
  };
  return (
    <>
      <div><div className="field"><label htmlFor="cx-r">{label} <Req /></label><textarea className="input" id="cx-r" data-focus rows={3} maxLength={500} style={{ resize: "vertical" }} value={reason} onChange={(e) => setReason(e.target.value)} /></div><Err t={err} /></div>
      <LayerFoot><button className="btn btn-secondary" onClick={L.closeLayer}>Cancel</button><button className="btn btn-primary" onClick={submit}>{confirm}</button></LayerFoot>
    </>
  );
}
export const openReasonModal = (L: LayerApi, title: string, label: string, confirm: string, run: (r: string) => Promise<string>, done: () => void) =>
  L.openModal(title, <ReasonForm L={L} label={label} confirm={confirm} run={run} done={done} />);

/** Manual status change (only for controls without automated tests). */
function StatusForm({ L, id, done }: { L: LayerApi; id: string; done: () => void }) {
  const c = DATA.controls.find((x) => x.id === id);
  const [status, setStatus] = useState(c ? c.status : "Needs evidence"); const [reason, setReason] = useState(""); const [err, setErr] = useState("");
  const submit = async () => {
    if (clampText(reason, 500).length < 10) { setErr("Give a reason of at least 10 characters."); return; }
    try { await svc.setControlStatus(id, status, clampText(reason, 500)); L.closeLayer(); L.toast("Status updated"); done(); } catch (e) { L.toast(uiMessage(e), false); }
  };
  return (
    <>
      <div>
        <div className="field"><label htmlFor="cs-st">Status</label><select className="select" id="cs-st" data-focus value={status} onChange={(e) => setStatus(e.target.value)}>{svc.CONTROL_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div className="field"><label htmlFor="cs-r">Reason <Req /></label><textarea className="input" id="cs-r" rows={2} maxLength={500} style={{ resize: "vertical" }} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <Err t={err} />
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={L.closeLayer}>Cancel</button><button className="btn btn-primary" onClick={submit}>Save status</button></LayerFoot>
    </>
  );
}
export const openStatusModal = (L: LayerApi, id: string, done: () => void) => L.openModal("Change status, " + id, <StatusForm L={L} id={id} done={done} />);
