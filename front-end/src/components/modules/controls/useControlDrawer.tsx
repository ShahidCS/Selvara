import { useCallback } from "react";
import { DATA, FW_ID, FW_SHORT, testsForControl } from "@/lib/data";
import { bumpData, setModState } from "@/lib/store";
import { wsLog } from "@/lib/audit";
import { downloadText } from "@/lib/format";
import { Icon, StatusChip, Table } from "@/components/ui";
import { useLayer, type LayerApi } from "@/components/shell/LayerProvider";
import * as svc from "@/services/controls";
import { FormHandle, newForm, val, useErrFlag, REQ } from "./modalForm";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const testChip = (r: string) => <StatusChip s={r === "Pass" ? "Pass" : r === "Fail" ? "Fail" : "Needs evidence"} />;

/* ---------------- control drawer (source ctrlDrawer) ---------------- */
export function openControlDrawer(L: LayerApi, id: string) {
  const c = DATA.controls.find((x) => x.id === id);
  if (!c) return;
  const tests = testsForControl(c.id);
  const att = c.attestation;
  const keys = Object.keys(c.map || {});
  const body = (
    <>
      <div style={{ marginBottom: 14 }}><StatusChip s={c.status} />{c.custom ? <> <span className="tag">Custom</span></> : null}</div>
      <dl className="meta-grid"><dt>Domain</dt><dd>{c.domain}</dd><dt>Owner</dt><dd>{c.owner}</dd><dt>Frameworks mapped</dt><dd>{keys.length}</dd><dt>Tests</dt><dd>{tests.length}</dd></dl>
      <div className="hr" /><div className="sectitle">Owner attestation</div>
      {att ? (
        <div className="card" style={{ boxShadow: "none", background: "var(--accent-weak)", borderColor: "transparent" }}><div className="c-body" style={{ padding: 11 }}>
          <div style={{ fontWeight: 500 }}><Icon name="check" /> Attested by {att.by}</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>{att.at} — &quot;{att.note}&quot;</div>
        </div></div>
      ) : <p className="field help">No current attestation. The control owner should confirm the control is designed and operating.</p>}
      <div style={{ marginTop: 8 }}><button className="btn btn-secondary sm" onClick={() => openAttestModal(L, id)}><Icon name="check" />Record attestation</button></div>
      <div className="hr" /><div className="sectitle">Framework and standard mappings</div>
      {keys.length ? keys.map((k) => (
        <div key={k} className="bar-row" style={{ marginBottom: 8 }}><span className="nm" style={{ width: 190 }}>{FW_ID[k] || k}</span>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{c.map[k].map((r: string, i: number) => <span key={i} className="tag num">{r}</span>)}</div></div>
      )) : <p className="field help">No mappings.</p>}
      <div style={{ marginTop: 8 }}><button className="btn btn-ghost sm" onClick={() => openMappingModal(L, id)}><Icon name="plus" />Add mapping</button></div>
      <div className="hr" /><div className="sectitle">Linked tests</div>
      {tests.length ? tests.map((t) => (
        <div key={t.id} className="listrow" role="button" tabIndex={0} style={{ border: "1px solid var(--line)", borderRadius: 8, marginBottom: 6, cursor: "pointer" }}
          onClick={() => { L.closeLayer(); setModState("controls.view", "tests"); openTestDrawer(L, t.id); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); L.closeLayer(); setModState("controls.view", "tests"); openTestDrawer(L, t.id); } }}>
          <div className="fi"><div className="lt">{t.name}</div><div className="lm">{t.id}, {t.cadence}</div></div>{testChip(t.result)}
        </div>
      )) : <p className="field help">No automated tests linked to this control.</p>}
      <div className="hr" /><div className="sectitle">Status rationale</div>
      <p className="field help">{c.status === "Pass" ? "All mapped tests pass and current evidence is attached." : c.status === "Needs evidence" ? "The control is implemented but current evidence has not been attached for this period." : "A mapped test is failing. Remediation is tracked as an open issue in the register."}</p>
    </>
  );
  const foot = (
    <>
      <button className="btn btn-secondary" onClick={() => ctrlJira(L, id)}><Icon name="ext" />Create Tasklane ticket</button>
      <button className="btn btn-secondary" onClick={() => ctrlWorkpaper(L, id)}><Icon name="download" />Export workpaper</button>
      <button className="btn btn-primary" onClick={() => { L.toast("Evidence request sent"); L.closeLayer(); }}>Request evidence</button>
    </>
  );
  L.openDrawer(c.id + ", " + c.title, c.domain + ", Owner " + c.owner, body, foot);
}

async function ctrlJira(L: LayerApi, id: string) {
  const { key } = await svc.createTicket(id);
  wsLog("control.jira.created", key + " for " + id, "Control");
  L.toast("Created Tasklane ticket " + key + " (demo)");
}
async function ctrlWorkpaper(L: LayerApi, id: string) {
  const txt = await svc.exportWorkpaper(id);
  downloadText(id + "-workpaper.txt", txt);
  wsLog("control.workpaper.exported", id, "Control");
  L.toast("Workpaper exported");
}

/* ---------------- attestation modal ---------------- */
function AttestBody({ h, c }: { h: FormHandle; c: any }) {
  const err = useErrFlag(h);
  return (
    <>
      <p style={{ margin: "0 0 8px" }}>The control owner confirms this control is designed appropriately and operating as intended for the current period.</p>
      <div className="field"><label htmlFor="ca-by">Attested by</label><input className="input" id="ca-by" defaultValue={c.owner} ref={(e) => { h.els.by = e; }} /></div>
      <div className="field"><label htmlFor="ca-note">Statement {REQ}</label><textarea className="input" id="ca-note" rows={2} style={{ resize: "vertical" }} placeholder="e.g. Reviewed configuration and evidence; control operating effectively" ref={(e) => { h.els.note = e; }} /></div>
      <p className="field help" id="ca-err" role={err ? "alert" : undefined} style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>A statement is required.</p>
    </>
  );
}
function openAttestModal(L: LayerApi, id: string) {
  const c = DATA.controls.find((x) => x.id === id)!;
  const h = newForm();
  const submit = async () => {
    const note = val(h, "note").trim();
    if (!note) { h.showErr?.(); return; }
    const att = await svc.attestControl(id, val(h, "by").trim(), note);
    wsLog("control.attested", id + " by " + att.by, "Control");
    L.closeLayer(); L.toast("Attestation recorded"); bumpData(); openControlDrawer(L, id);
  };
  L.openModal("Record attestation, " + id, <AttestBody h={h} c={c} />,
    <><button className="btn btn-secondary" onClick={L.closeLayer}>Cancel</button><button className="btn btn-primary" onClick={submit}>Attest</button></>);
}

/* ---------------- add-mapping modal ---------------- */
function MappingBody({ h }: { h: FormHandle }) {
  const err = useErrFlag(h);
  return (
    <>
      <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="field"><label htmlFor="cm-fw">Framework</label><select className="select" id="cm-fw" ref={(e) => { h.els.fw = e; }}>{DATA.frameworks.map((f) => <option key={f.id} value={f.id}>{FW_SHORT[f.id] || f.id}</option>)}</select></div>
        <div className="field"><label htmlFor="cm-ref">Requirement code {REQ}</label><input className="input" id="cm-ref" placeholder="e.g. A.8.9" ref={(e) => { h.els.ref = e; }} /></div>
      </div>
      <p className="field help" id="cm-err" role={err ? "alert" : undefined} style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>Requirement code is required.</p>
    </>
  );
}
function openMappingModal(L: LayerApi, id: string) {
  const h = newForm();
  const submit = async () => {
    const ref = val(h, "ref").trim();
    if (!ref) { h.showErr?.(); return; }
    const fw = val(h, "fw");
    await svc.addMapping(id, fw, ref);
    wsLog("control.mapping.added", id + " → " + FW_SHORT[fw] + " " + ref, "Control");
    L.closeLayer(); L.toast("Mapping added"); bumpData(); openControlDrawer(L, id);
  };
  L.openModal("Add mapping, " + id, <MappingBody h={h} />,
    <><button className="btn btn-secondary" onClick={L.closeLayer}>Cancel</button><button className="btn btn-primary" onClick={submit}>Add mapping</button></>);
}

/* ---------------- test drawer (source testDrawer) ---------------- */
export function openTestDrawer(L: LayerApi, id: string) {
  const t = DATA.tests.find((x) => x.id === id);
  if (!t) return;
  const body = (
    <>
      <div style={{ marginBottom: 12 }}>{testChip(t.result)}</div>
      <div className="sectitle" style={{ marginTop: 0 }}>Test logic</div>
      <p className="field help" style={{ fontFamily: "var(--mono,monospace)", background: "var(--surface-2)", padding: 10, borderRadius: 8 }}>{t.logic}</p>
      <div className="hr" /><div className="sectitle">Results by item</div>
      <Table cols={[{ t: "Item" }, { t: "Result" }]}>
        {t.items.map((it: any, i: number) => <tr key={i}><td>{it.item}</td><td>{testChip(it.result)}</td></tr>)}
      </Table>
      <div className="hr" /><div className="sectitle">Controls this test supports</div>
      <div className="btngrp">{t.controls.map((c: string) => <button key={c} className="fchip" onClick={() => { L.closeLayer(); openControlDrawer(L, c); }}><Icon name="controls" />{c}</button>)}</div>
      <div className="hr" /><dl className="meta-grid"><dt>Cadence</dt><dd>{t.cadence}</dd><dt>Last run</dt><dd>{t.last}</dd><dt>Source</dt><dd>{t.source}</dd></dl>
    </>
  );
  const foot = (
    <>
      <button className="btn btn-secondary" onClick={async () => { await svc.runTest(id); wsLog("test.run", t.name, "Control"); L.closeLayer(); L.toast("Ran " + t.id + " (demo)"); bumpData(); }}><Icon name="refresh" />Run now</button>
      <button className="btn btn-ghost" onClick={async () => { await svc.deactivateTest(id); wsLog("test.deactivated", id, "Control"); L.closeLayer(); L.toast("Test deactivated"); bumpData(); }}><Icon name="x" />Deactivate</button>
    </>
  );
  L.openDrawer(t.name, t.id + " · " + t.source, body, foot);
}

/** Returns `(controlId) => void` that opens the control drawer (source `ctrlDrawer(id)`). */
export function useControlDrawer() {
  const L = useLayer();
  return useCallback((id: string) => openControlDrawer(L, id), [L]);
}
/** Returns `(testId) => void` that opens the test drawer (source `testDrawer(id)`). */
export function useTestDrawer() {
  const L = useLayer();
  return useCallback((id: string) => openTestDrawer(L, id), [L]);
}
