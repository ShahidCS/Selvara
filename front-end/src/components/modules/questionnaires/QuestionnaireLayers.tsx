import { useState } from "react";
import { Icon, Ring, StatusChip } from "@/components/ui";
import { LayerFoot } from "@/hooks/useLayer";
import type { LayerApi } from "@/components/shell/LayerProvider";
import { DATA } from "@/lib/data";
import { wsLog } from "@/lib/audit";
import { bumpData, setModState, useData } from "@/lib/store";
import { clampText } from "@/lib/security";
import * as svc from "@/services/questionnaires";

const Req = () => <span style={{ color: "var(--bad-ink)" }}>*</span>;
const FAIL = "Something went wrong. Please try again.";

/* ---- drawer (source qDrawer / qAdvance / qComplete) ---- */
function DrawerBody({ i, L }: { i: number; L: LayerApi }) {
  useData();
  const q = DATA.questionnaires[i];
  if (!q) return <p className="field help">Questionnaire not found.</p>;
  const [a, b] = svc.splitProg(q.prog);
  const pct = svc.qPct(q.prog);
  const advance = async () => {
    try {
      const out = await svc.advanceQuestionnaire(i);
      wsLog("questionnaire.updated", q.name + " " + q.prog, "Vendor");
      L.closeLayer(); L.toast("Progress updated"); bumpData();
      if (out.a < out.b) openQuestionnaireDrawer(L, i);
    } catch { L.toast(FAIL, false); }
  };
  const complete = async () => {
    try {
      await svc.completeQuestionnaire(i);
      wsLog("questionnaire.completed", q.name, "Vendor");
      L.closeLayer(); L.toast(q.name + " marked complete"); bumpData();
    } catch { L.toast(FAIL, false); }
  };
  return (
    <>
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 12 }}>
        <Ring pct={pct} size={76} color="var(--accent)" />
        <div><div style={{ fontSize: 13, color: "var(--muted)" }}>Completion</div><div style={{ fontSize: 22, fontWeight: 600 }}>{pct}%</div><div style={{ marginTop: 4 }}><StatusChip s={q.status === "Complete" ? "Completed" : q.status} /></div></div>
      </div>
      <dl className="meta-grid"><dt>Answered</dt><dd>{a} of {b}</dd><dt>Remaining</dt><dd>{b - a}</dd><dt>Due</dt><dd>{q.due}</dd></dl>
      <div className="hr"></div><div className="sectitle">Actions</div>
      <div className="btngrp">
        {q.status !== "Complete" ? (
          <>
            <button className="btn btn-secondary sm" onClick={advance}><Icon name="check" />Answer next 10</button>
            <button className="btn btn-primary sm" onClick={complete}><Icon name="check" />Mark complete</button>
          </>
        ) : <button className="btn btn-secondary sm" onClick={() => L.toast("Exported responses (demo)")}><Icon name="download" />Export responses</button>}
      </div>
    </>
  );
}
export function openQuestionnaireDrawer(L: LayerApi, i: number) {
  const q = DATA.questionnaires[i];
  if (!q) return;
  L.openDrawer(q.name, "Due " + q.due, <DrawerBody i={i} L={L} />);
}

/* ---- add answer (source qAddAnswer / qDoAddAnswer) ---- */
export function AddAnswerForm({ L }: { L: LayerApi }) {
  const [q, setQ] = useState(""); const [a, setA] = useState(""); const [err, setErr] = useState(false);
  const submit = async () => {
    const qq = clampText(q, 300), aa = clampText(a, 2000);
    if (!qq || !aa) { setErr(true); return; }
    try {
      await svc.addAnswer(qq, aa);
      wsLog("answer.added", qq.slice(0, 40), "Vendor");
      L.closeLayer(); L.toast("Answer added to library");
      setModState("questionnaires.view", "library"); bumpData();
    } catch { L.toast(FAIL, false); }
  };
  return (
    <>
      <div>
        <div className="field"><label htmlFor="qa-q">Question <Req /></label><input className="input" id="qa-q" data-focus maxLength={300} placeholder="e.g. Do you run background checks?" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="field"><label htmlFor="qa-a">Answer <Req /></label><textarea className="input" id="qa-a" rows={3} maxLength={2000} style={{ resize: "vertical" }} value={a} onChange={(e) => setA(e.target.value)} /></div>
        <p className="field help" id="qa-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>Question and answer are required.</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={() => L.closeLayer()}>Cancel</button><button className="btn btn-primary" onClick={submit}>Add to library</button></LayerFoot>
    </>
  );
}

/* ---- import questionnaire (source qImport / qDoImport) ---- */
export function ImportForm({ L }: { L: LayerApi }) {
  const [name, setName] = useState(""); const [total, setTotal] = useState("120"); const [due, setDue] = useState("30 Nov 2026"); const [err, setErr] = useState(false);
  const submit = async () => {
    const n = clampText(name, 160);
    if (!n) { setErr(true); return; }
    const tot = Math.min(100000, Math.max(1, parseInt(total, 10) || 120));
    try {
      await svc.importQuestionnaire(n, tot, clampText(due, 40));
      wsLog("questionnaire.imported", n, "Vendor");
      L.closeLayer(); L.toast("Questionnaire imported"); bumpData();
    } catch { L.toast(FAIL, false); }
  };
  return (
    <>
      <div>
        <div className="field"><label htmlFor="qi-name">Name <Req /></label><input className="input" id="qi-name" data-focus maxLength={160} placeholder="e.g. Acme, CAIQ" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div className="field"><label htmlFor="qi-total">Total questions</label><input className="input" id="qi-total" type="number" min={1} max={100000} value={total} onChange={(e) => setTotal(e.target.value)} /></div>
          <div className="field"><label htmlFor="qi-due">Due</label><input className="input" id="qi-due" maxLength={40} value={due} onChange={(e) => setDue(e.target.value)} /></div>
        </div>
        <p className="field help" id="qi-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>Name is required.</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={() => L.closeLayer()}>Cancel</button><button className="btn btn-primary" onClick={submit}>Import</button></LayerFoot>
    </>
  );
}
