import { useState } from "react";
import { useLayer } from "@/hooks/useLayer";
import { LayerFoot } from "@/components/shell/LayerProvider";
import { wsLog } from "@/lib/audit";
import { bumpData, setModState } from "@/lib/store";
import { clampText } from "@/lib/security";
import * as svc from "@/services/assistant";
import { attempt } from "../sodKit";

/** Prototype: asstNewAgent / asstDoNewAgent. Selects are checked against their allow-lists in the service. */
export function AgentForm({ close }: { close: () => void }) {
  const L = useLayer();
  const [name, setName] = useState(""); const [trig, setTrig] = useState(svc.AGENT_TRIGGERS[0]); const [auto, setAuto] = useState(svc.AGENT_AUTONOMY[0]); const [runs, setRuns] = useState(svc.AGENT_RUNS_AS[0]); const [err, setErr] = useState(false);
  const submit = () => attempt(L, async () => {
    const n = clampText(name, 80);
    if (!n) { setErr(true); return; }
    await svc.createAgent({ name: n, trigger: trig, autonomy: auto, runsAs: runs });
    wsLog("assistant.agent.created", n + " (pending approval)", "System"); close(); L.toast("Agent created; a different admin or owner must approve enabling it");
    setModState("assistant.view", "agents"); bumpData();
  });
  return (
    <>
      <div className="field"><label htmlFor="ag-name">Agent name <span style={{ color: "var(--bad-ink)" }}>*</span></label><input className="input" id="ag-name" data-focus maxLength={80} placeholder="e.g. Control test monitor" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={err} aria-describedby={err ? "ag-err" : undefined} /></div>
      <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="field"><label htmlFor="ag-trig">Trigger</label><select className="select" id="ag-trig" value={trig} onChange={(e) => setTrig(e.target.value)}>{svc.AGENT_TRIGGERS.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div className="field"><label htmlFor="ag-auto">Autonomy</label><select className="select" id="ag-auto" value={auto} onChange={(e) => setAuto(e.target.value)}>{svc.AGENT_AUTONOMY.map((x) => <option key={x}>{x}</option>)}</select></div>
      </div>
      <div className="field"><label htmlFor="ag-runs">Runs as</label><select className="select" id="ag-runs" value={runs} onChange={(e) => setRuns(e.target.value)}>{svc.AGENT_RUNS_AS.map((x) => <option key={x}>{x}</option>)}</select></div>
      <p className="field help">A new agent stays disabled until a different admin or owner approves enabling it.</p>
      <p className="field help">&quot;Acts (logged)&quot; agents operate within their granted scope and record every action to the immutable audit log.</p>
      <p className="field help" id="ag-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>Agent name is required.</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={submit}>Create agent</button></LayerFoot>
    </>
  );
}
