import { DATA, FW_ID, FW_SHORT } from "@/lib/data";
import { bumpData, useApp, useData, useModState } from "@/lib/store";
import { uiMessage } from "@/lib/grcSod";
import { wsLog } from "@/lib/audit";
import { downloadText } from "@/lib/format";
import { useGo, useRoute } from "@/lib/route";
import { DataTable, Icon, Page, StatusChip, type DTColumn } from "@/components/ui";
import { useLayer } from "@/components/shell/LayerProvider";
import * as svc from "@/features/controls/services/controls";
import { testChip } from "./controlDialogs";
import { AdoptForm } from "./AdoptForm";
import { ModuleTip } from "@/components/kit/ModuleTip";
import { API_ON } from "@/lib/rbac";
import { ControlDetail } from "./ControlDetail";
import { TestDetail } from "./TestDetail";
import { ControlFormPage, ExceptionFormPage, TestFormPage } from "./ControlForms";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Control = any;
type Test = any;
type View = "controls" | "tests" | "matrix";
const VIEWS: [View, string][] = [["controls", "Controls"], ["tests", "Tests"], ["matrix", "Matrix"]];
const STATUSES = ["All", "Pass", "Needs evidence", "Fail"];

function FwChips({ c, lim = 6 }: { c: any; lim?: number }) {
  const keys = Object.keys(c.map || {});
  const shown = keys.slice(0, lim), rest = keys.slice(lim);
  return (
    <>
      {shown.map((k, i) => <span key={k}>{i ? " " : ""}<span className="tag">{FW_SHORT[k] || k}</span></span>)}
      {rest.length ? <> <span className="tag" style={{ color: "var(--ink-2)", cursor: "default" }} title={rest.map((k) => FW_SHORT[k] || k).join(", ")}>+{rest.length}</span></> : null}
    </>
  );
}

/** `/ws/controls` is the register (controls, tests, matrix); `/new`, `/:id`, `/:id/exception`, `/test/new` and `/test/:id` are pages. */
export default function ControlsModule() {
  const route = useRoute();
  const { param, sub } = route;
  if (param === "new") return <ControlFormPage />;
  if (param === "test") return sub === "new" ? <TestFormPage /> : sub ? <TestDetail id={sub} /> : <ControlsList />;
  if (param && sub === "exception") return <ExceptionFormPage id={param} />;
  if (param) return <ControlDetail id={param} />;
  return <ControlsList />;
}

function ControlsList() {
  useData();
  const L = useLayer();
  const go = useGo();
  useApp((s) => s.role);
  const manageWhy = svc.whyCannotManage(), runWhy = svc.whyCannotRunTests();
  const [view, setView] = useModState<View>("controls.view", "controls");

  const seg = (
    <div className="seg" role="tablist">
      {VIEWS.map((v) => <button key={v[0]} role="tab" aria-selected={view === v[0]} onClick={() => setView(v[0])}>{v[1]}</button>)}
    </div>
  );

  const soa = async () => {
    try {
      downloadText("statement-of-applicability.csv", await svc.exportSoa());
      wsLog("controls.soa.exported", DATA.controls.length + " controls", "Control");
      L.toast("Statement of Applicability exported");
    } catch (e) { L.toast(uiMessage(e), false); }
  };
  const matrixExport = async () => {
    try {
      downloadText("cross-framework-matrix.csv", await svc.exportMatrix());
      wsLog("controls.matrix.exported", DATA.controls.length + " controls", "Control");
      L.toast("Matrix exported");
    } catch (e) { L.toast(uiMessage(e), false); }
  };
  const syncAll = async () => {
    try {
      await svc.syncAllTests();
      wsLog("tests.synced", DATA.tests.length + " tests", "Control");
      L.toast("All tests synced (demo)"); bumpData();
    } catch (e) { L.toast(uiMessage(e), false); }
  };

  const acts = view === "controls" ? (
    <>
      <button className="btn btn-secondary" onClick={() => go("/ws/frameworks")}><Icon name="frameworks" />Frameworks</button>
      <button className="btn btn-secondary" onClick={soa}><Icon name="download" />Export SoA</button>
      {API_ON && !manageWhy ? <button className="btn btn-secondary" onClick={() => L.openModal("Adopt controls from the library", (close) => <AdoptForm close={close} />)}><Icon name="controls" />Adopt from library</button> : null}
      {!manageWhy ? <button className="btn btn-primary" onClick={() => go("/ws/controls/new")}><Icon name="plus" />Add custom control</button> : null}
    </>
  ) : view === "tests" ? (
    <>
      <button className="btn btn-secondary" disabled={!!runWhy} title={runWhy || undefined} onClick={syncAll}><Icon name="refresh" />Sync all</button>
      {!manageWhy ? <button className="btn btn-primary" onClick={() => go("/ws/controls/test/new")}><Icon name="plus" />Build custom test</button> : null}
    </>
  ) : (
    <button className="btn btn-secondary" onClick={matrixExport}><Icon name="download" />Export matrix (CSV)</button>
  );

  const cols: DTColumn<Control>[] = [
    { key: "id", header: "Control", nowrap: true, value: (c) => c.id, locked: true, render: (c) => <span className="strong num">{c.id}</span> },
    { key: "title", header: "Title", value: (c) => c.title, render: (c) => c.title },
    { key: "domain", header: "Domain", value: (c) => c.domain, render: (c) => c.domain },
    { key: "map", header: "Mapped to", value: (c) => Object.keys(c.map || {}).map((k) => FW_SHORT[k] || k).join(" "), render: (c) => <div style={{ maxWidth: 220 }}><FwChips c={c} /></div> },
    { key: "owner", header: "Owner", value: (c) => c.owner, render: (c) => c.owner },
    { key: "status", header: "Status", value: (c) => c.status, render: (c) => <StatusChip s={c.status} /> },
  ];
  /* Roles that cannot create see why, in text, instead of a faded create button whose reason is only a hover title. */
  const manageNote = manageWhy && view !== "matrix" ? <p className="field help" role="note" style={{ margin: 0 }}>{manageWhy}</p> : null;
  const testLabel = (r: string) => (r === "Pass" ? "Pass" : r === "Fail" ? "Fail" : "Needs evidence");
  const testTabs = ["Pass", "Needs evidence", "Fail"].filter((x) => DATA.tests.some((t: Test) => testLabel(t.result) === x));
  const testCols: DTColumn<Test>[] = [
    { key: "name", header: "Test", value: (t) => t.name, locked: true, render: (t) => <><div className="strong">{t.name}</div><div style={{ fontSize: 11.5, color: "var(--muted)" }}>{t.id}</div></> },
    { key: "source", header: "Source", value: (t) => t.source, render: (t) => t.source },
    { key: "supports", header: "Supports", value: (t) => t.controls.join(" "), render: (t) => <>{t.controls.map((c: string, i: number) => <span key={c}>{i ? " " : ""}<span className="tag num">{c}</span></span>)}</> },
    { key: "cadence", header: "Cadence", value: (t) => t.cadence, render: (t) => t.cadence },
    { key: "last", header: "Last run", value: (t) => t.last, render: (t) => <span style={{ color: "var(--muted)" }}>{t.last}</span> },
    { key: "result", header: "Result", value: (t) => t.result, render: (t) => testChip(t.result) },
  ];

  if (view === "tests") {
    return (
      <Page mod="controls" acts={acts}>
        {manageNote}
        <div className="card" style={{ flex: "1 1 auto" }}>
          <div className="c-head">{seg}</div>
          <div className="c-body flush scroll" style={{ padding: 0 }} id="testsBody">
            <DataTable<Test> id="tests" label="Tests" rows={DATA.tests} rowKey={(t) => t.id} columns={testCols} searchText={(t) => `${t.id} ${t.name} ${t.source} ${t.controls.join(" ")}`}
              tabs={testTabs.map((x) => ({ key: x, label: x, match: (t: Test) => testLabel(t.result) === x }))}
              filters={[{ key: "source", label: "Source", options: Array.from(new Set<string>(DATA.tests.map((t: Test) => String(t.source)))), get: (t: Test) => t.source }]}
              onOpen={(t) => go(`/ws/controls/test/${encodeURIComponent(t.id)}`)} exportName="tests" />
          </div>
        </div>
      </Page>
    );
  }

  if (view === "matrix") {
    const fws = svc.MATRIX_FWS;
    return (
      <Page mod="controls" acts={acts}>
        <div className="card" style={{ flex: "1 1 auto" }}>
          <div className="c-head">{seg}<div className="r"><span className="tag">Cross-framework matrix</span></div></div>
          <div className="c-body scroll" id="matrixBody">
            <div className="xscroll">
              <table className="tbl" style={{ minWidth: 820 }}>
                <thead><tr><th scope="col">Control</th><th scope="col">Domain</th>{fws.map((f) => <th scope="col" key={f}>{FW_SHORT[f]}</th>)}</tr></thead>
                <tbody>
                  {DATA.controls.map((c) => (
                    <tr key={c.id}>
                      <td className="strong num">{c.id}</td><td style={{ color: "var(--muted)" }}>{c.domain}</td>
                      {fws.map((f) => {
                        const refs: string[] | undefined = (c.map || {})[f];
                        return <td key={f}>{refs ? refs.map((r, i) => <span key={i}>{i ? " " : ""}<span className="tag num">{r}</span></span>) : <span style={{ color: "var(--faint)" }}>—</span>}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Page>
    );
  }

  return (
    <Page mod="controls" acts={acts}>
      <ModuleTip mod="controls" force={API_ON && !DATA.controls.length} />
      {manageNote}
      <div className="card" style={{ flex: "1 1 auto" }}>
        <div className="c-head" style={{ flexWrap: "wrap", gap: 10 }}>
          {seg}
        </div>
        <div className="c-body flush scroll" id="ctrlBody" style={{ padding: 0 }}>
          <DataTable<Control> id="controls" label="Controls" rows={DATA.controls} rowKey={(c) => c.id} columns={cols} searchText={(c) => `${c.id} ${c.title} ${c.owner} ${c.domain}`}
            tabs={STATUSES.filter((x) => x !== "All").map((x) => ({ key: x, label: x, match: (c: Control) => c.status === x }))}
            filters={[{ key: "fw", label: "Framework", options: DATA.frameworks.map((f) => f.id), labels: FW_ID, get: () => "", test: (c: Control, want: string) => !!(c.map && c.map[want]) }]}
            onOpen={(c) => go(`/ws/controls/${encodeURIComponent(c.id)}`)} exportName="controls" />
        </div>
      </div>
    </Page>
  );
}
