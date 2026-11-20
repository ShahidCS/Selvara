import { Chip, DataTable, Icon, KpiStrip, KpiTile, Page, type DTColumn } from "@/components/ui";
import { DATA, FRAMEWORK_REQS } from "@/lib/data";
import { setModState, useApp, useData } from "@/lib/store";
import { useFwEdits, REQ_PAGE, fwBand, fwCanAdmin, fwLegend, fwReadiness, fwScopeIn, fwScore, fwSnoozed, fwEdits } from "@/lib/frameworks";
import { useGo, useRoute } from "@/lib/route";
import { uiMessage } from "@/lib/grcSod";
import { ModuleTip } from "@/components/kit/ModuleTip";
import { API_ON } from "@/lib/rbac";
import { useLayer } from "@/hooks/useLayer";
import * as fw from "./services/frameworks";
import { FwDetail } from "./FwDetail";
import { FwAdd } from "./FwAdd";
import { FwSegsBar } from "./FwSegsBar";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Fw = any;
const KINDS = ["Standard", "Framework", "Regulation"];
/* Ported as-is: Standard=0 is falsy, so `|| 3` sorts Standards last (Frameworks, Regulations, Standards). See checklist open question. */
const KORD: Record<string, number> = { Standard: 0, Framework: 1, Regulation: 2 };
const pctOf = (f: Fw) => { const sc = fwScore(f.id); return sc ? sc.pct : f.pct; };

/** `/ws/frameworks` is the library register; `/new` and `/:id` are pages. */
export default function FrameworksModule() {
  const { param } = useRoute();
  if (param === "new") return <FwAddPage />;
  if (param) return <FwDetail fwId={param} />;
  return <FrameworksList />;
}

/** Opening a framework starts its requirement view from the top (filters, search, group and paging are kept per session otherwise). */
function resetReqView() {
  setModState("fw.reqf", "all"); setModState("fw.rq", ""); setModState("fw.grp", null); setModState("fw.limit", REQ_PAGE); setModState("fw.open", {});
}

function FwAddPage() {
  useApp((s) => s.role);
  const go = useGo();
  return (
    <Page title="Add a regulation, standard or guideline" back={{ href: "/ws/frameworks", label: "Frameworks" }}>
      <div className="scroll rec-scroll"><FwAdd onAdded={(id) => { resetReqView(); go(`/ws/frameworks/${encodeURIComponent(id)}`); }} /></div>
    </Page>
  );
}

function FrameworksList() {
  useData(); useFwEdits(); useApp((s) => s.role);
  const go = useGo();
  const admin = fwCanAdmin();
  const open = (id: string) => { resetReqView(); go(`/ws/frameworks/${encodeURIComponent(id)}`); };
  const L = useLayer();
  const run = (p: Promise<unknown>) => { p.catch((e) => L.toast(uiMessage(e), false)); };
  const toggleSnooze = (id: string) => { if (fwCanAdmin()) run(fw.toggleSnooze(id)); };
  const toggleScope = (id: string) => { if (fwCanAdmin()) run(fw.toggleScope(id)); };

  const rows: Fw[] = [...DATA.frameworks].sort((a, b) => (KORD[a.kind] || 3) - (KORD[b.kind] || 3) || (a.name < b.name ? -1 : 1));
  const regions = Array.from(new Set(DATA.frameworks.map((f) => f.region).filter(Boolean))).sort() as string[];
  const inScope = DATA.frameworks.filter((f) => fwScopeIn(f.id));
  const avg = inScope.length ? Math.round(inScope.reduce((a, f) => a + fwReadiness(f.id), 0) / inScope.length) : 0;
  const gaps = inScope.reduce((a, f) => { const sc = fwScore(f.id); return a + (sc ? sc.cnt["Not met"] + sc.cnt["Not assessed"] : f.gaps || 0); }, 0);
  const snoozed = DATA.frameworks.filter((f) => fwSnoozed(f.id)).length;

  const cols: DTColumn<Fw>[] = [
    { key: "name", header: "Name", value: (f) => f.name, locked: true, render: (f) => {
      const cat = FRAMEWORK_REQS[f.id];
      return (<>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><span className="strong">{f.name}</span><Chip cls={f.kind === "Regulation" ? "info" : "neutral"}>{f.kind}</Chip></div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{cat ? cat.r.length + " requirements, " : ""}{f.mapped} mapped controls{f.audit ? ", " + f.audit : ""}</div>
      </>);
    } },
    { key: "region", header: "Region", value: (f) => f.region || "-", render: (f) => f.region || "-" },
    { key: "ready", header: "Readiness", value: (f) => pctOf(f), render: (f) => {
      const p = pctOf(f);
      return (<div style={{ minWidth: 200 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}><FwSegsBar fwId={f.id} /><span className="num" style={{ fontSize: 13, fontWeight: 600, color: fwBand(p), width: 38, textAlign: "right" }}>{p}%</span></div>
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>{fwLegend(f.id)}</div>
      </div>);
    } },
    { key: "status", header: "Status", value: (f) => (fwSnoozed(f.id) ? "Snoozed" : "Active"), render: (f) => (admin
      ? <button className={`fchip sm ${fwSnoozed(f.id) ? "" : "on"}`} aria-label={`${f.name}: ${fwSnoozed(f.id) ? "snoozed" : "active"}, toggle`} onClick={() => toggleSnooze(f.id)} aria-pressed={!fwSnoozed(f.id)}>{fwSnoozed(f.id) ? "Snoozed" : "Active"}</button>
      : <Chip cls={fwSnoozed(f.id) ? "neutral" : "ok"}>{fwSnoozed(f.id) ? "Snoozed" : "Active"}</Chip>) },
    { key: "scope", header: "Scope", value: (f) => (fwScopeIn(f.id) ? "In scope" : "Out of scope"), render: (f) => (admin
      ? <button className={`fchip sm ${fwScopeIn(f.id) ? "on" : ""}`} aria-label={`${f.name}: ${fwScopeIn(f.id) ? "in scope" : "out of scope"}, toggle`} onClick={() => toggleScope(f.id)} aria-pressed={fwScopeIn(f.id)}>{fwScopeIn(f.id) ? "In scope" : "Out of scope"}</button>
      : <span style={{ fontSize: 13 }}>{fwScopeIn(f.id) ? "In scope" : "Out of scope"}</span>) },
    { key: "act", header: "Details", hideHeader: true, align: "end", locked: true, render: (f) => <button className="btn btn-ghost sm" aria-label={`Details for ${f.name}`} onClick={() => open(f.id)}>Details</button> },
  ];

  return (
    <Page mod="frameworks" acts={<button className="btn btn-secondary" onClick={() => go("/ws/frameworks/new")}><Icon name="plus" />Add framework</button>}>
      <ModuleTip mod="frameworks" force={API_ON && !Object.values(fwEdits.get().SCOPE).some(Boolean)} />
      <KpiStrip label="Library summary">
        <KpiTile label="In the library" value={DATA.frameworks.length} caption={`${inScope.length} in scope`} />
        <KpiTile label="Average readiness" value={avg + "%"} caption="Frameworks in scope" />
        <KpiTile label="Open gaps" value={gaps} delta={gaps ? { tone: "watch", text: "To close" } : { tone: "good", text: "None" }} caption="Not met or not assessed" />
        <KpiTile label="Snoozed" value={snoozed} caption="Paused, not scored as due" />
      </KpiStrip>
      <div className="banner warn" style={{ display: "block" }}>Requirement titles are paraphrased; licensed standard text is not reproduced. All requirement-to-control mappings and applicability decisions are draft content requiring review by qualified compliance staff before reliance.</div>
      <div className="card" style={{ flex: "1 1 auto" }}>
        <div className="c-body flush scroll" style={{ padding: 0 }}>
          <DataTable<Fw> id="frameworks" label="Frameworks" rows={rows} rowKey={(f) => f.id} columns={cols} searchText={(f) => `${f.name} ${f.id} ${f.region || ""}`}
            tabs={KINDS.map((k) => ({ key: k, label: k + "s", match: (f: Fw) => f.kind === k }))}
            filters={[{ key: "region", label: "Region", options: regions, get: (f: Fw) => f.region || "" }]}
            onOpen={(f) => open(f.id)} exportName="frameworks" />
        </div>
      </div>
    </Page>
  );
}
