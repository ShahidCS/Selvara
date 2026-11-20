/* A dialog that asks for one piece of text (a reason, a note, an outcome) before a change is sent. Production records the text with the
   change; the server checks it again. Server refusals are shown in the dialog in the server's own words. */
import { useState, type ReactNode } from "react";
import type { LayerApi } from "@/components/shell/LayerProvider";
import { LayerFoot, useLayer } from "@/components/shell/LayerProvider";
import { uiMessage } from "@/lib/grcSod";
import { bumpData } from "@/lib/store";

interface Opts { title: string; label: string; intro?: ReactNode; confirm: string; min?: number; max?: number; danger?: boolean; select?: { id: string; name: string }[]; selectLabel?: string; run: (text: string, pick: string) => Promise<string | void> }

function ReasonForm(o: Opts) {
  const L = useLayer();
  const [text, setText] = useState(""); const [pick, setPick] = useState(o.select?.[0]?.id ?? ""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const min = o.label ? o.min ?? 10 : 0;
  const go = async () => {
    if (text.trim().length < min) { setErr(min ? `Write at least ${min} characters.` : ""); if (min) return; }
    if (o.select && !pick) { setErr("Choose one from the list."); return; }
    setBusy(true);
    try { const msg = await o.run(text.trim(), pick); L.closeLayer(); L.toast(msg || "Done"); bumpData(); }
    catch (e) { setErr(uiMessage(e)); setBusy(false); }
  };
  return (
    <>
      <div>
        {o.intro ? <div style={{ margin: "0 0 10px", fontSize: 13 }}>{o.intro}</div> : null}
        {o.select ? (
          <div className="field"><label htmlFor="rd-pick">{o.selectLabel ?? "Choose"}</label>
            <select className="select" id="rd-pick" value={pick} onChange={(e) => setPick(e.target.value)}>{o.select.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        ) : null}
        {o.label ? <div className="field"><label htmlFor="rd-text">{o.label}{min ? <span style={{ color: "var(--bad-ink)" }}> *</span> : null}</label>
          <textarea className="input" id="rd-text" data-focus rows={3} maxLength={o.max ?? 300} style={{ resize: "vertical" }} value={text} onChange={(e) => { setText(e.target.value); setErr(""); }} aria-invalid={!!err} aria-describedby={err ? "rd-err" : undefined} /></div> : null}
        <p className="field help" id="rd-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={() => L.closeLayer()}>Cancel</button><button className={`btn ${o.danger ? "btn-danger" : "btn-primary"}`} disabled={busy} onClick={go}>{o.confirm}</button></LayerFoot>
    </>
  );
}
/** Opens the dialog; `run` sends the change and returns the toast text. */
export function askReason(L: LayerApi, o: Opts) { L.openModal(o.title, <ReasonForm {...o} />); }
