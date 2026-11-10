import { DATA, FW_ID, FW_SHORT } from "@/lib/data";
import { bumpData, useApp, useData, useModState } from "@/lib/store";
import { uiMessage } from "@/lib/grcSod";
import { wsLog } from "@/lib/audit";
import { downloadText } from "@/lib/format";
import { useGo } from "@/lib/route";
import { Empty, Icon, Page, StatusChip, Table } from "@/components/ui";
import { useLayer } from "@/components/shell/LayerProvider";
import * as svc from "@/features/controls/services/controls";
import { openControlDrawer, openTestDrawer, testChip } from "./useControlDrawer";
import { openCreateControl, openCreateTest } from "./createModals";

/* eslint-disable @typescript-eslint/no-explicit-any */
type View = "controls" | "tests" | "matrix";
const VIEWS: [View, string][] = [["controls", "Controls"], ["tests", "Tests"], ["matrix", "Matrix"]];
const STATUSES = ["All", "Pass", "Needs evidence", "Fail"];
const rowKey = (fn: () => void) => ({
  tabIndex: 0,
  onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } },
});

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

export default function ControlsModule() {
  useData();
  const L = useLayer();
  const go = useGo();
  useApp((s) => s.role);
  const manageWhy = svc.whyCannotManage(), runWhy = svc.whyCannotRunTests();
  const [view, setView] = useModState<View>("controls.view", "controls");
  const [q, setQ] = useModState("controls.q", "");
  const [status, setStatus] = useModState("controls.status", "All");
  const [fw, setFw] = useModState("controls.fw", "All");
  const [page0, setPage] = useModState("controls.page", 1);
  const per = 10;

  const seg = (
    <div className="seg" role="tablist">
      {VIEWS.map((v) => <button key={v[0]} role="tab" aria-selected={view === v[0]} onClick={() => setView(v[0])}>{v[1]}</button>)}
    </div>
  );

  const soa = async () => {
    downloadText("statement-of-applicability.csv", await svc.exportSoa());
    wsLog("controls.soa.exported", DATA.controls.length + " controls", "Control");
    L.toast("Statement of Applicability exported");
  };
  const matrixExport = async () => {
    downloadText("cross-framework-matrix.csv", await svc.exportMatrix());
    wsLog("controls.matrix.exported", DATA.controls.length + " controls", "Control");
    L.toast("Matrix exported");
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
      <button className="btn btn-primary" disabled={!!manageWhy} title={manageWhy || undefined} onClick={() => openCreateControl(L)}><Icon name="plus" />Add custom control</button>
    </>
  ) : view === "tests" ? (
    <>
      <button className="btn btn-secondary" disabled={!!runWhy} title={runWhy || undefined} onClick={syncAll}><Icon name="refresh" />Sync all</button>
      <button className="btn btn-primary" disabled={!!manageWhy} title={manageWhy || undefined} onClick={() => openCreateTest(L)}><Icon name="plus" />Build custom test</button>
    </>
  ) : (
    <button className="btn btn-secondary" onClick={matrixExport}><Icon name="download" />Export matrix (CSV)</button>
  );

  if (view === "tests") {
    return (
      <Page mod="controls" acts={acts}>
        <div className="card" style={{ flex: "1 1 auto" }}>
          <div className="c-head">{seg}<div className="r"><span className="tag" id="testCount">{DATA.tests.length} tests</span></div></div>
          <div className="c-body flush scroll" style={{ padding: 0 }} id="testsBody">
            <Table cols={[{ t: "Test" }, { t: "Source" }, { t: "Supports" }, { t: "Cadence" }, { t: "Last run" }, { t: "Result" }]}>
              {DATA.tests.map((t) => (
                <tr key={t.id} className="clickable" onClick={() => openTestDrawer(L, t.id)} {...rowKey(() => openTestDrawer(L, t.id))}>
                  <td><div className="strong">{t.name}</div><div style={{ fontSize: 11.5, color: "var(--muted)" }}>{t.id}</div></td>
                  <td>{t.source}</td>
                  <td>{t.controls.map((c: string, i: number) => <span key={c}>{i ? " " : ""}<span className="tag num">{c}</span></span>)}</td>
                  <td>{t.cadence}</td>
                  <td style={{ color: "var(--muted)" }}>{t.last}</td>
                  <td>{testChip(t.result)}</td>
                </tr>
              ))}
            </Table>
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

  const fwOpts = ["All"].concat(DATA.frameworks.map((f) => f.id));
  const all = DATA.controls.filter((c) =>
    (status === "All" || c.status === status) && (fw === "All" || (c.map && c.map[fw])) &&
    (!q || `${c.id} ${c.title} ${c.owner} ${c.domain}`.toLowerCase().includes(q.toLowerCase())));
  const tot = all.length, pages = Math.max(1, Math.ceil(tot / per));
  const page = Math.min(page0, pages);
  const rows = all.slice((page - 1) * per, page * per);

  return (
    <Page mod="controls" acts={acts}>
      <div className="card" style={{ flex: "1 1 auto" }}>
        <div className="c-head" style={{ flexWrap: "wrap", gap: 10 }}>
          {seg}
          <div className="field" style={{ flex: "0 0 auto" }}>
            <input className="input" id="ctrlQ" aria-label="Search controls" placeholder="Search controls, owners, domains" style={{ width: 200, height: 34 }} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
          <label className="vh" htmlFor="ctrlFw">Framework</label>
          <select className="select" id="ctrlFw" style={{ width: "auto", height: 34 }} value={fw} onChange={(e) => { setFw(e.target.value); setPage(1); }}>
            {fwOpts.map((o) => <option key={o} value={o}>{o === "All" ? "All frameworks" : FW_ID[o]}</option>)}
          </select>
          <div className="btngrp" id="ctrlFilters">
            {STATUSES.map((s) => (
              <button key={s} className="fchip" aria-pressed={status === s} onClick={() => { setStatus(s); setPage(1); }}>
                <Icon name={s !== "All" ? (s === "Pass" ? "check" : s === "Fail" ? "x" : "alert") : "filter"} />{s}
              </button>
            ))}
          </div>
          <div className="r"><span className="tag" id="ctrlCount">{`${tot} control${tot !== 1 ? "s" : ""}${fw !== "All" ? " mapped to " + FW_ID[fw] : ""}`}</span></div>
        </div>
        <div className="c-body flush scroll" id="ctrlBody" style={{ padding: 0 }}>
          {!rows.length ? (
            <Empty icon="search" title="No controls match" action={<button className="btn btn-secondary" onClick={() => { setQ(""); setStatus("All"); setFw("All"); }}>Clear filters</button>}>
              Nothing matches the current search and filter. Clear filters to see all controls.
            </Empty>
          ) : (
            <Table cols={[{ t: "Control" }, { t: "Title" }, { t: "Domain" }, { t: "Mapped to" }, { t: "Owner" }, { t: "Status" }]}>
              {rows.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => openControlDrawer(L, c.id)} {...rowKey(() => openControlDrawer(L, c.id))}>
                  <td className="strong num">{c.id}</td><td>{c.title}</td><td>{c.domain}</td>
                  <td style={{ maxWidth: 220 }}><FwChips c={c} /></td><td>{c.owner}</td><td><StatusChip s={c.status} /></td>
                </tr>
              ))}
            </Table>
          )}
        </div>
        <div className="pager" id="ctrlPager">
          {rows.length ? (
            <>
              <span>Showing {(page - 1) * per + 1} to {Math.min(page * per, tot)} of {tot}</span>
              <div className="r">
                <button className="btn btn-secondary sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><Icon name="chevl" />Prev</button>
                <span>{page} / {pages}</span>
                <button className="btn btn-secondary sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next<Icon name="chevron" /></button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </Page>
  );
}
