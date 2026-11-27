import { Chip, DataTable, Icon, KpiStrip, KpiTile, Page, type DTColumn } from "@/components/ui";
import { DATA, FRAMEWORK_REQS } from "@/lib/data";
import { setModState, useApp, useData } from "@/lib/store";
import { useFwEdits, REQ_PAGE, fwAssessed, fwCanAdmin, fwLegend, fwReadiness, fwScopeIn, fwScore, fwSnoozed, NOT_ASSESSED } from "@/lib/frameworks";
import { useGo, useRoute } from "@/lib/route";
import { uiMessage } from "@/lib/grcSod";
import { useLayer } from "@/hooks/useLayer";
import * as fw from "./services/frameworks";
import { FwDetail } from "./FwDetail";
import { FwAdd } from "./FwAdd";
import { FwSegsBar, readinessTone } from "./FwSegsBar";
import { scoped } from "@/services/audits";

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
  const run = (p: Promise<unknown>, done?: () => void) => { p.then(() => done?.()).catch((e) => L.toast(uiMessage(e), false)); };
  /* Each change says what happened and offers Undo (the same toggle again), since it changes the readiness and gap figures at once. */
  const toggleSnooze = (f: Fw, undo = false) => { if (!fwCanAdmin()) return; const was = fwSnoozed(f.id);
    run(fw.toggleSnooze(f.id), undo ? undefined : () => L.toast(`${f.name} ${was ? "resumed" : "snoozed"}`, true, { action: { label: "Undo", run: () => toggleSnooze(f, true) } })); };
  const toggleScope = (f: Fw, undo = false) => { if (!fwCanAdmin()) return; const was = fwScopeIn(f.id);
    run(fw.toggleScope(f.id), undo ? undefined : () => L.toast(`${f.name} ${was ? "taken out of scope" : "brought into scope"}`, true, { action: { label: "Undo", run: () => toggleScope(f, true) } })); };

  const frameworks: Fw[] = scoped("frameworks", DATA.frameworks); // an external auditor: their engagements' frameworks only
  const rows: Fw[] = [...frameworks].sort((a, b) => (KORD[a.kind] || 3) - (KORD[b.kind] || 3) || (a.name < b.name ? -1 : 1));
  const regions = Array.from(new Set(frameworks.map((f) => f.region).filter(Boolean))).sort() as string[];
  const inScope = frameworks.filter((f) => fwScopeIn(f.id));
  const assessed = inScope.filter((f) => fwAssessed(f.id));
  const avg = assessed.length ? Math.round(assessed.reduce((a, f) => a + fwReadiness(f.id), 0) / assessed.length) : null;
  const gaps = inScope.reduce((a, f) => { const sc = fwScore(f.id); return a + (sc ? sc.cnt["Not met"] + sc.cnt["Not assessed"] : f.gaps || 0); }, 0);
  const snoozed = frameworks.filter((f) => fwSnoozed(f.id)).length;

  const cols: DTColumn<Fw>[] = [
    { key: "name", header: "Name", width: 340, value: (f) => f.name, locked: true, render: (f) => {
      const cat = FRAMEWORK_REQS[f.id];
      return (<>
        <div className="fw-name" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><span className="strong">{f.name}</span><Chip cls={f.kind === "Regulation" ? "info" : "neutral"}>{f.kind}</Chip>
          {f.reqEdition ? <Chip cls="warn" icon="alert" title={`Requirements reflect an earlier edition: ${f.reqEdition}`}>Earlier edition</Chip> : null}</div>
        {f.title ? <div className="fw-full">{f.title}</div> : null}
        {f.publisher || f.version ? <div className="fw-src">{[f.publisher, f.version].filter(Boolean).join(" · ")}</div> : null}
        <div style={{ fontSize: ".75rem", color: "var(--muted)", marginTop: 2 }}>{cat ? cat.r.length + " requirements, " : ""}{f.mapped} mapped controls{f.audit ? ", " + f.audit : ""}</div>
      </>);
    } },
    { key: "region", header: "Region", width: 80, value: (f) => f.region || "-", render: (f) => f.region || "-" },
    { key: "ready", header: "Readiness", width: 170, value: (f) => pctOf(f), render: (f) => {
      const p = pctOf(f);
      return (<div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}><FwSegsBar fwId={f.id} />{fwAssessed(f.id) ? <span className="num" style={{ fontSize: ".8125rem", fontWeight: 600, color: readinessTone(p), width: 38, textAlign: "right" }}>{p}%</span> : <span className="num" title={NOT_ASSESSED} aria-label={NOT_ASSESSED} style={{ fontSize: ".8125rem", color: "var(--muted)", width: 38, textAlign: "right" }}>—</span>}</div>
        <div style={{ fontSize: ".71875rem", color: "var(--muted)", marginTop: 3 }}>{fwLegend(f.id)}</div>
      </div>);
    } },
    { key: "status", header: "Status", width: 100, value: (f) => (fwSnoozed(f.id) ? "Snoozed" : "Active"), render: (f) => { const sn = fwSnoozed(f.id); return <Chip cls={sn ? "neutral" : "ok"} icon={sn ? "clock" : "check"}>{sn ? "Snoozed" : "Active"}</Chip>; } },
    { key: "scope", header: "Scope", width: 120, value: (f) => (fwScopeIn(f.id) ? "In scope" : "Out of scope"), render: (f) => { const on = fwScopeIn(f.id); return <Chip cls={on ? "ok" : "neutral"} icon={on ? "check" : "dot"}>{on ? "In scope" : "Out of scope"}</Chip>; } },
    // I5: every row action in the labelled Actions column, in the same order on every row
    { key: "act", header: "Actions", align: "end", locked: true, width: admin ? 250 : 100, render: (f) => {
      const sn = fwSnoozed(f.id); const on = fwScopeIn(f.id);
      return (<div className="row-acts">
        {admin ? <button className="btn btn-ghost sm" aria-label={`${f.name}: ${sn ? "snoozed. Resume" : "active. Snooze"}`} onClick={() => toggleSnooze(f)}>{sn ? "Resume" : "Snooze"}</button> : null}
        {admin ? <button className="btn btn-ghost sm" aria-label={`${f.name}: ${on ? "in scope. Take out of scope" : "out of scope. Bring into scope"}`} data-tour="frameworks-scope" aria-pressed={on} onClick={() => toggleScope(f)}>{on ? "Take out" : "Bring in"}</button> : null}
        <button className="btn btn-ghost sm" aria-label={`Details for ${f.name}`} onClick={() => open(f.id)}>Details</button>
      </div>);
    } },
  ];

  return (
    <Page mod="frameworks" acts={<button className="btn btn-primary" data-tour="frameworks-add" onClick={() => go("/ws/frameworks/new")}><Icon name="plus" />Add framework</button>}>
      <KpiStrip label="Library summary">
        <KpiTile label="In the library" value={frameworks.length} caption={`${inScope.length} in scope`} />
        <KpiTile label="Average readiness" value={avg === null ? "—" : avg + "%"} caption={avg === null ? "Not assessed yet" : `${assessed.length} assessed frameworks in scope`} />
        <KpiTile label="Open gaps" value={gaps} delta={gaps ? { tone: "watch", text: "To close" } : { tone: "good", text: "None" }} caption="Not met or not assessed" />
        <KpiTile label="Snoozed" value={snoozed} caption="Paused, not scored as due" />
      </KpiStrip>
      {/* Regulatory content stays draft until a person qualified in compliance has reviewed it (organisation rule) */}
      <p className="banner info" role="note" data-tour="frameworks-draft">Requirement-to-control mappings and applicability decisions are drafts. Qualified compliance staff review them before anyone relies on them.</p>
      <div className="card" data-tour="frameworks-table">
        <div className="c-body flush scroll" style={{ padding: 0 }}>
          <DataTable<Fw> id="frameworks" label="Frameworks" rows={rows} rowKey={(f) => f.id} columns={cols} searchText={(f) => `${f.name} ${f.title || ""} ${f.publisher || ""} ${f.id} ${f.region || ""}`}
            tabs={KINDS.map((k) => ({ key: k, label: k + "s", match: (f: Fw) => f.kind === k }))}
            filters={[{ key: "region", label: "Region", options: regions, get: (f: Fw) => f.region || "" }]}
            onOpen={(f) => open(f.id)} exportName="frameworks" />
        </div>
      </div>
    </Page>
  );
}
