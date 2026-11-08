/* Add-risk and add-action modals (source riskFormBody/riskRead/riskCreate/riskSave 2771-2783 and riskAddAction/riskDoAddAction 2708-2709). */
import { useState } from "react";
import { LayerFoot, useLayer } from "@/components/shell/LayerProvider";
import { wsLog } from "@/lib/audit";
import { Lb, RISK_CATS, RISK_TREATS } from "@/lib/risk";
import { bumpData, setModState } from "@/lib/store";
import { attempt } from "../issues/util";
import * as svc from "@/services/risks";
import { K_SEL, K_TAB } from "./nav";

const Req = () => <span style={{ color: "var(--bad-ink)" }}>*</span>;
const grid2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } as const;
const ScaleOpts = () => <>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} · {Lb[n - 1]}</option>)}</>;

/** "Add risk" modal. Current score starts between inherent and residual (cl/ci computed in the service). */
export function AddRiskForm({ close }: { close: () => void }) {
  const L = useLayer();
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState(""); const [cat, setCat] = useState(RISK_CATS[0]); const [owner, setOwner] = useState("J. Avery");
  const [l, setL] = useState(3), [i, setI] = useState(3), [rl, setRl] = useState(2), [ri, setRi] = useState(2); const [treat, setTreat] = useState(RISK_TREATS[0]);
  const [err, setErr] = useState(false);
  const save = () => attempt(L, async () => {
    if (!title.trim()) { setErr(true); return; }
    const res = await svc.createRisk({ title, desc, cat, owner, l, i, rl, ri, treat });
    if (!res.ok) { L.toast(res.msg); return; }
    wsLog("risk.created", title.trim().slice(0, 200), "Risk"); close(); L.toast("Risk " + res.id + " added as draft");
    setModState(K_TAB, "reg"); setModState<string | null>(K_SEL, res.id); bumpData();
  });
  const num = (set: (n: number) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => set(Number(e.target.value));
  return (
    <>
      <div>
        <div className="field"><label htmlFor="rk-title">Risk title <Req /></label><input className="input" id="rk-title" data-focus maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Unencrypted data at rest in analytics store" aria-invalid={err} aria-describedby={err ? "rk-err" : undefined} /></div>
        <div className="field"><label htmlFor="rk-desc">Description</label><textarea className="input" id="rk-desc" rows={2} maxLength={1000} style={{ resize: "vertical" }} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
        <div className="grid2" style={grid2}>
          <div className="field"><label htmlFor="rk-cat">Category</label><select className="select" id="rk-cat" value={cat} onChange={(e) => setCat(e.target.value)}>{RISK_CATS.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="field"><label htmlFor="rk-owner">Owner</label><input className="input" id="rk-owner" maxLength={100} value={owner} onChange={(e) => setOwner(e.target.value)} /></div>
        </div>
        <div className="sectitle">Inherent (before controls)</div>
        <div className="grid2" style={grid2}>
          <div className="field"><label htmlFor="rk-l">Likelihood</label><select className="select" id="rk-l" value={l} onChange={num(setL)}><ScaleOpts /></select></div>
          <div className="field"><label htmlFor="rk-i">Impact</label><select className="select" id="rk-i" value={i} onChange={num(setI)}><ScaleOpts /></select></div>
        </div>
        <div className="sectitle">Residual (after treatment)</div>
        <div className="grid2" style={grid2}>
          <div className="field"><label htmlFor="rk-rl">Likelihood</label><select className="select" id="rk-rl" value={rl} onChange={num(setRl)}><ScaleOpts /></select></div>
          <div className="field"><label htmlFor="rk-ri">Impact</label><select className="select" id="rk-ri" value={ri} onChange={num(setRi)}><ScaleOpts /></select></div>
        </div>
        <div className="field"><label htmlFor="rk-treat">Treatment decision</label><select className="select" id="rk-treat" value={treat} onChange={(e) => setTreat(e.target.value)}>{RISK_TREATS.map((t) => <option key={t}>{t}</option>)}</select></div>
        <p className="field help">Current score starts between inherent and residual; adjust it in the risk detail. New risks enter as Draft.</p>
        <p className="field help" id="rk-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>Risk title is required.</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={save}>Add as draft</button></LayerFoot>
    </>
  );
}

export function AddActionForm({ id, close }: { id: string; close: () => void }) {
  const L = useLayer();
  const [text, setText] = useState(""); const [owner, setOwner] = useState(""); const [due, setDue] = useState(""); const [err, setErr] = useState(false);
  const add = () => attempt(L, async () => {
    if (!text.trim()) { setErr(true); return; }
    const res = await svc.addAction(id, { text, owner, due });
    if (!res.ok) { L.toast(res.msg); return; }
    wsLog("risk.action.added", id + ": " + res.text, "Risk"); close(); bumpData();
  });
  return (
    <>
      <div>
        <div className="field"><label htmlFor="rka-text">Action <Req /></label><input className="input" id="rka-text" data-focus maxLength={300} placeholder="e.g. Enforce patch SLA on edge services" value={text} onChange={(e) => setText(e.target.value)} aria-invalid={err} aria-describedby={err ? "rka-err" : undefined} /></div>
        <div className="grid2" style={grid2}>
          <div className="field"><label htmlFor="rka-owner">Owner</label><input className="input" id="rka-owner" maxLength={100} value={owner} onChange={(e) => setOwner(e.target.value)} /></div>
          <div className="field"><label htmlFor="rka-due">Due date</label><input className="input" type="date" id="rka-due" value={due} onChange={(e) => setDue(e.target.value)} /></div>
        </div>
        <p className="field help" id="rka-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>Action is required.</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={add}>Add</button></LayerFoot>
    </>
  );
}
