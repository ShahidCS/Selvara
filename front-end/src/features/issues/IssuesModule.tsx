import { DataTable, Icon, KpiStrip, KpiTile, Page, StatusChip, activate, type DTColumn } from "@/components/ui";
import { DATA } from "@/lib/data";
import { useApp, useData, useModState } from "@/lib/store";
import { ISSUE_SEVS, ISSUE_STATUSES, isHighSev, whyCannotWrite } from "@/features/issues/services/issues";
import { useLayer } from "@/hooks/useLayer";
import { DueText, openIssueDrawer, openIssueForm } from "./IssueLayers";

/* Hook for other modules: `useIssueDrawer()` opens the issue drawer by id (see issues/IssueLayers.tsx). */
export { useIssueDrawer } from "./IssueLayers";

const COLS = ISSUE_STATUSES;
/* eslint-disable @typescript-eslint/no-explicit-any */
type Issue = any;
const SEV_RANK = (sev: string) => { const i = ISSUE_SEVS.indexOf(sev); return i < 0 ? 99 : i; };
/** Overdue first (most overdue first), then by date. */
const dueRank = (due: string) => { const m = /Overdue (\d+)d/.exec(due); if (m) return -Number(m[1]); const t = Date.parse(due); return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t; };
const isOpen = (i: Issue) => i.status !== "Closed";

export default function IssuesModule() {
  useData();
  const L = useLayer();
  useApp((s) => s.role);
  const writeWhy = whyCannotWrite();
  const [view, setView] = useModState<"table" | "kanban">("issues.view", "table");
  const open = (id: string) => openIssueDrawer(L, id);
  const cols: DTColumn<Issue>[] = [
    { key: "id", header: "ID", value: (i) => i.id, locked: true, render: (i) => <span className="strong num">{i.id}</span> },
    { key: "title", header: "Issue", value: (i) => i.title, render: (i) => i.title },
    { key: "sev", header: "Severity", value: (i) => i.sev, sortBy: (i) => SEV_RANK(i.sev), render: (i) => <StatusChip s={i.sev} /> },
    { key: "owner", header: "Owner", value: (i) => i.owner, render: (i) => i.owner },
    { key: "due", header: "Due", value: (i) => i.due, sortBy: (i) => dueRank(i.due), render: (i) => <DueText due={i.due} /> },
    { key: "status", header: "Status", value: (i) => i.status, render: (i) => <StatusChip s={i.status} /> },
  ];
  const owners = Array.from(new Set(DATA.issues.map((i: Issue) => String(i.owner)))).sort();
  const live = DATA.issues.filter(isOpen);
  return (
    <Page mod="issues" acts={<button className="btn btn-primary" disabled={!!writeWhy} title={writeWhy || undefined} onClick={() => openIssueForm(L, null)}><Icon name="plus" />New issue</button>}>
      <KpiStrip label="Issue summary">
        <KpiTile label="Open issues" value={live.length} caption={`${DATA.issues.length} in total`} />
        <KpiTile label="Overdue" value={live.filter((i: Issue) => /Overdue/.test(i.due)).length} delta={live.some((i: Issue) => /Overdue/.test(i.due)) ? { tone: "bad", text: "Needs action" } : { tone: "good", text: "None" }} caption="Past their due date" />
        <KpiTile label="High or critical" value={live.filter((i: Issue) => isHighSev(i.sev)).length} caption="Open, by severity" />
        <KpiTile label="In progress" value={live.filter((i: Issue) => i.status === "In progress").length} caption="Being worked on" />
      </KpiStrip>
      <div className="card" style={{ flex: "1 1 auto" }}>
        <div className="c-head"><h3>Remediation</h3><div className="r"><div className="seg" role="tablist">
          <button role="tab" aria-selected={view === "table"} onClick={() => setView("table")}><Icon name="rows" />Table</button>
          <button role="tab" aria-selected={view === "kanban"} onClick={() => setView("kanban")}><Icon name="grid" />Kanban</button>
        </div></div></div>
        <div className={`c-body ${view === "table" ? "flush" : ""} scroll`} style={view === "table" ? { padding: 0 } : undefined} id="issBody">
          {view === "table" ? (
            <DataTable<Issue> id="issues" label="Issues" rows={DATA.issues} rowKey={(i) => i.id} columns={cols}
              tabs={COLS.map((c) => ({ key: c, label: c, match: (i: Issue) => i.status === c }))}
              filters={[{ key: "sev", label: "Severity", options: ISSUE_SEVS, get: (i: Issue) => i.sev }, { key: "owner", label: "Owner", options: owners, get: (i: Issue) => i.owner }]}
              exportName="issues" onOpen={(i) => open(i.id)}
              rowActions={(i) => [{ label: "Open issue", run: () => open(i.id) }, { label: "Copy ID", run: () => { void navigator.clipboard?.writeText(i.id); L.toast("Issue ID copied"); } }]} />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, alignItems: "start" }}>
              {COLS.map((c) => {
                const items = DATA.issues.filter((i) => i.status === c);
                return (
                  <div key={c} style={{ background: "var(--surface-2)", borderRadius: 10, padding: 10 }}>
                    <div className="sectitle" style={{ margin: "2px 0 8px" }}>{c} <span className="tag">{items.length}</span></div>
                    {items.length ? items.map((i) => (
                      <div key={i.id} className="card clickable" style={{ boxShadow: "var(--shadow-sm)", marginBottom: 8 }} {...activate(() => open(i.id))}>
                        <div className="c-body" style={{ padding: 11 }}>
                          <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 6 }}>{i.title}</div>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}><StatusChip s={i.sev} /><span className="tag num">{i.id}</span></div>
                        </div>
                      </div>
                    )) : <div style={{ color: "var(--faint)", fontSize: 12, padding: 8 }}>Nothing here.</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}
