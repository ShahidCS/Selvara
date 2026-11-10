import { useState } from "react";
import { LayerFoot } from "@/components/shell/LayerProvider";
import type { LayerApi } from "@/components/shell/LayerProvider";
import { clampText } from "@/lib/security";
import { addMonths, isoDay, uiMessage } from "@/lib/grcSod";
import * as svc from "@/features/controls/services/controls";
import { DATA } from "@/lib/data";

const Req = () => <span style={{ color: "var(--bad-ink)" }}>*</span>;
const Err = ({ t }: { t: string }) => <p className="field help" role="alert" style={{ color: "var(--bad-ink)", display: t ? "block" : "none" }}>{t}</p>;

/** Request an exception / waiver: reason, expiry (max 12 months) and compensating-control note. A different person approves. */
function ExceptionForm({ L, id, done }: { L: LayerApi; id: string; done: () => void }) {
  const [reason, setReason] = useState(""); const [comp, setComp] = useState(""); const [exp, setExp] = useState(isoDay(addMonths(new Date(), 3))); const [err, setErr] = useState("");
  const submit = async () => {
    if (clampText(reason, 500).length < 10) { setErr("Give a reason of at least 10 characters."); return; }
    if (clampText(comp, 500).length < 20) { setErr("Describe the compensating control (at least 20 characters)."); return; }
    try { await svc.requestException(id, { reason: clampText(reason, 500), compensating: clampText(comp, 500), expires: exp }); L.closeLayer(); L.toast("Exception requested; a different approver must decide"); done(); } catch (e) { L.toast(uiMessage(e), false); }
  };
  return (
    <>
      <div>
        <p style={{ margin: "0 0 8px" }}>The approver must be an admin or owner other than you and the control owner. The exception expires automatically.</p>
        <div className="field"><label htmlFor="cx-reason">Why is an exception needed? <Req /></label><textarea className="input" id="cx-reason" data-focus rows={2} maxLength={500} style={{ resize: "vertical" }} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <div className="field"><label htmlFor="cx-comp">Compensating control <Req /></label><textarea className="input" id="cx-comp" rows={2} maxLength={500} style={{ resize: "vertical" }} value={comp} onChange={(e) => setComp(e.target.value)} /></div>
        <div className="field"><label htmlFor="cx-exp">Expires on (max 12 months) <Req /></label><input className="input" id="cx-exp" type="date" min={isoDay()} max={isoDay(addMonths(new Date(), 12))} value={exp} onChange={(e) => setExp(e.target.value)} /></div>
        <Err t={err} />
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={L.closeLayer}>Cancel</button><button className="btn btn-primary" onClick={submit}>Request exception</button></LayerFoot>
    </>
  );
}
export const openExceptionRequest = (L: LayerApi, id: string, done: () => void) => L.openModal("Request exception, " + id, <ExceptionForm L={L} id={id} done={done} />);

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
