import { useEffect, useRef, useState, type FormEvent } from "react";
import { Empty, FormActions, FormMessage, FormSection, Page } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import { wsLog } from "@/lib/audit";
import { bumpData, setModState, useApp } from "@/lib/store";
import { useGo } from "@/lib/route";
import { clampText } from "@/lib/security";
import { FAIL_MSG, uiMessage } from "@/lib/grcSod";
import * as svc from "@/features/assistant/services/assistant";
import { AUTONOMY } from "@/features/assistant/lib/autonomy";

/** `/ws/assistant/new`: create an agent. It stays disabled until a different admin or owner approves enabling it. Selects are checked against their allow-lists in the service. */
export function AgentFormPage() {
  const role = useApp((s) => s.role);
  const L = useLayer(); const go = useGo();
  const [name, setName] = useState(""); const [trig, setTrig] = useState(svc.AGENT_TRIGGERS[0]); const [runs, setRuns] = useState(svc.AGENT_RUNS_AS[0]);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const dirty = !busy && (name !== "" || trig !== svc.AGENT_TRIGGERS[0] || runs !== svc.AGENT_RUNS_AS[0]);
  const { allowLeave } = useUnsavedGuard(dirty, L);
  const ref = useRef<HTMLInputElement>(null); useEffect(() => { ref.current?.focus(); }, []);
  const back = { href: "/ws/assistant", label: "AI Assistant" };
  if (!svc.asstCanManage(role)) return <Page title="Create agent" back={back}><Empty icon="assistant" title="You cannot do this">Only an admin or owner can create agents.</Empty></Page>;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = clampText(name, 80);
    if (!n) { setErr("Agent name is required."); return; }
    setBusy(true);
    try {
      await svc.createAgent({ name: n, trigger: trig, runsAs: runs });
      wsLog("assistant.agent.created", n + " (pending approval)", "System"); allowLeave(); L.toast("Agent created; a different admin or owner must approve enabling it");
      setModState("assistant.view", "agents"); bumpData(); go("/ws/assistant");
    } catch (x) { setBusy(false); setErr(""); L.toast(uiMessage(x) || FAIL_MSG, false); }
  };
  return (
    <Page title="Create agent" sub="A new agent stays disabled until a different admin or owner approves enabling it." back={back}>
      <div className="scroll rec-scroll"><form className="rec-form" onSubmit={submit} noValidate>
        <FormSection n={1} title="Agent" note="What it is called and what starts it.">
          <div className="field"><label htmlFor="ag-name">Agent name <span style={{ color: "var(--bad-ink)" }}>*</span></label><input ref={ref} className="input" id="ag-name" maxLength={80} placeholder="e.g. Control test monitor" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!err} aria-describedby={err ? "ag-err" : undefined} /></div>
          <div className="field"><label htmlFor="ag-trig">Trigger</label><select className="select" id="ag-trig" value={trig} onChange={(e) => setTrig(e.target.value)}>{svc.AGENT_TRIGGERS.map((x) => <option key={x}>{x}</option>)}</select></div>
        </FormSection>
        <FormSection n={2} title="Access and autonomy" note="Least privilege: what it runs as. Every new agent starts at the lowest autonomy level.">
          <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field"><label htmlFor="ag-auto">Autonomy</label><input className="input" id="ag-auto" readOnly value={svc.AGENT_AUTONOMY[0]} /></div>
            <div className="field"><label htmlFor="ag-runs">Runs as</label><select className="select" id="ag-runs" value={runs} onChange={(e) => setRuns(e.target.value)}>{svc.AGENT_RUNS_AS.map((x) => <option key={x}>{x}</option>)}</select></div>
          </div>
          <p className="field help">A person approves each change it suggests. After {AUTONOMY.TRACK_MIN} approved suggestions with no recent rejection, it can be raised to &quot;Acts (logged)&quot;, where it acts within its scope and records every action to the audit log; a different admin or owner must approve that.</p>
        </FormSection>
        {err ? <FormMessage id="ag-err">{err}</FormMessage> : null}
        <FormActions><button type="button" className="btn btn-secondary" onClick={() => go("/ws/assistant")}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy}>Create agent</button></FormActions>
      </form></div>
    </Page>
  );
}
