import { useState } from "react";
import { DATA } from "@/lib/data";
import { API_ON } from "@/lib/rbac";
import { Segmented } from "@/components/ui";
import { TEST_RESULTS } from "@/lib/rulesWs";
import { bumpData, useApp, useData } from "@/lib/store";
import { wsLog } from "@/lib/audit";
import { uiMessage } from "@/lib/grcSod";
import { useGo } from "@/lib/route";
import { Empty, Icon, Page, Table } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import * as svc from "@/features/controls/services/controls";
import { testChip } from "./controlDialogs";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** An automated test as a page (`/ws/controls/test/:id`). */
export function TestDetail({ id }: { id: string }) {
  useData(); useApp((s) => s.role);
  const L = useLayer(); const go = useGo();
  const back = { href: "/ws/controls", label: "Controls" };
  const t = DATA.tests.find((x) => x.id === id);
  if (!t) return <Page title="Test not found" back={back}><Empty icon="controls" title="No such test">There is no test with the ID &ldquo;{id}&rdquo;. It may have been deactivated, or the link may be wrong.</Empty></Page>;
  const runWhy = svc.whyCannotRunTests(), manageWhy = svc.whyCannotManage();
  const dis = (why: string | null) => ({ disabled: !!why, title: why || undefined });
  const run = async () => { try { await svc.runTest(id); wsLog("test.run", t.name, "Control"); L.toast(API_ON ? "Re-evaluated " + t.id + " from its latest result" : "Ran " + t.id + " (demo)"); bumpData(); } catch (e) { L.toast(uiMessage(e), false); } };
  const off = async () => { try { await svc.deactivateTest(id); wsLog("test.deactivated", id, "Control"); L.toast("Test deactivated"); go("/ws/controls"); bumpData(); } catch (e) { L.toast(uiMessage(e), false); } };

  return (
    <Page title={t.name} sub={`${t.id}, ${t.source}`} back={back} acts={<>
      {testChip(t.result)}
      {API_ON ? <button className="btn btn-primary" {...dis(runWhy)} onClick={() => L.openModal(`Record a result, ${t.id}`, (close) => <ResultForm id={t.id} close={close} />)}><Icon name="check" />Record result</button> : null}
      <button className="btn btn-secondary" {...dis(runWhy)} onClick={run}><Icon name="refresh" />Run now</button>
      <button className="btn btn-ghost" {...dis(manageWhy)} onClick={off}><Icon name="x" />Deactivate</button>
    </>}>
      <div className="scroll rec-scroll">
        <div className="rec-grid">
          <div className="rec-main">
            <div className="card"><div className="c-head"><h3>Test logic</h3></div><div className="c-body">
              <p className="field help" style={{ margin: 0, fontFamily: "var(--mono,monospace)", background: "var(--surface-2)", padding: 10, borderRadius: 8 }}>{t.logic}</p>
            </div></div>
            <div className="card"><div className="c-head"><h3>Results by item</h3></div><div className="c-body flush" style={{ padding: 0 }}>
              <Table cols={[{ t: "Item" }, { t: "Result" }]}>
                {t.items.length ? t.items.map((it: any, i: number) => <tr key={i}><td>{it.item}</td><td>{testChip(it.result)}</td></tr>) : <tr><td colSpan={2} style={{ color: "var(--muted)" }}>No results yet. Run the test to collect them.</td></tr>}
              </Table>
            </div></div>
          </div>
          <aside className="rec-side">
            <div className="card"><div className="c-head"><h3>Details</h3></div><div className="c-body">
              <dl className="meta-grid"><dt>Cadence</dt><dd>{t.cadence}</dd><dt>Last run</dt><dd>{t.last}</dd><dt>Source</dt><dd>{t.source}</dd></dl>
            </div></div>
            <div className="card"><div className="c-head"><h3>Controls this test supports</h3></div><div className="c-body">
              <div className="btngrp">{t.controls.map((c: string) => <button key={c} className="fchip" onClick={() => go(`/ws/controls/${encodeURIComponent(c)}`)}><Icon name="controls" />{c}</button>)}</div>
            </div></div>
          </aside>
        </div>
      </div>
    </Page>
  );
}

/** Production: a person records what a manual check found, with a note; linked controls follow the result. */
function ResultForm({ id, close }: { id: string; close: () => void }) {
  const L = useLayer();
  const [result, setResult] = useState<string>("Pass"); const [note, setNote] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const save = async () => {
    if (busy) return; setBusy(true);
    try { await svc.recordTestResult(id, result, note); close(); L.toast("Result recorded: " + result); } catch (e) { setErr(uiMessage(e)); setBusy(false); }
  };
  return (
    <>
      <div className="field"><Segmented<string> label="Result" value={result} onChange={setResult} options={TEST_RESULTS.map((r) => ({ value: r, label: r }))} /></div>
      <div className="field"><label htmlFor="tr-note">What you checked (at least 10 characters)</label><textarea className="input" id="tr-note" data-focus rows={3} maxLength={500} style={{ resize: "vertical" }} value={note} onChange={(e) => { setNote(e.target.value); setErr(""); }} aria-invalid={!!err} aria-describedby="tr-err" /></div>
      <p className="field help" id="tr-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      <div className="btngrp" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        <button className="btn btn-secondary" onClick={close}>Cancel</button>
        <button className="btn btn-primary" disabled={busy} onClick={save}>Record result</button>
      </div>
    </>
  );
}
