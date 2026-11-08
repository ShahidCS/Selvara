import { Icon, Page, StatusChip, Table, activate } from "@/components/ui";
import { DATA } from "@/lib/data";
import { useData, useModState } from "@/lib/store";
import { useLayer } from "@/hooks/useLayer";
import { DueText, openIssueDrawer, openIssueForm } from "./issues/IssueLayers";

/* Hook for other modules: `useIssueDrawer()` opens the issue drawer by id (see issues/IssueLayers.tsx). */
export { useIssueDrawer } from "./issues/IssueLayers";

const COLS = ["Open", "In progress", "Closed"];

export default function IssuesModule() {
  useData();
  const L = useLayer();
  const [view, setView] = useModState<"table" | "kanban">("issues.view", "table");
  const open = (id: string) => openIssueDrawer(L, id);
  return (
    <Page mod="issues" acts={<button className="btn btn-primary" onClick={() => openIssueForm(L, null)}><Icon name="plus" />New issue</button>}>
      <div className="card" style={{ flex: "1 1 auto" }}>
        <div className="c-head"><h3>Remediation</h3><div className="r"><div className="seg" role="tablist">
          <button role="tab" aria-selected={view === "table"} onClick={() => setView("table")}><Icon name="rows" />Table</button>
          <button role="tab" aria-selected={view === "kanban"} onClick={() => setView("kanban")}><Icon name="grid" />Kanban</button>
        </div></div></div>
        <div className={`c-body ${view === "table" ? "flush" : ""} scroll`} style={view === "table" ? { padding: 0 } : undefined} id="issBody">
          {view === "table" ? (
            <Table cols={[{ t: "ID" }, { t: "Issue" }, { t: "Severity" }, { t: "Owner" }, { t: "Due" }, { t: "Status" }, { t: "" }]}>
              {DATA.issues.map((i) => (
                <tr key={i.id} className="clickable" {...activate(() => open(i.id))}>
                  <td className="strong num">{i.id}</td><td>{i.title}</td><td><StatusChip s={i.sev} /></td><td>{i.owner}</td><td><DueText due={i.due} /></td><td><StatusChip s={i.status} /></td>
                  <td className="r"><Icon name="chevron" /></td>
                </tr>
              ))}
            </Table>
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
