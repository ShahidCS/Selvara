import { Chip, DataTable, Icon, KpiStrip, KpiTile, Page, type DTColumn } from "@/components/ui";
import { DATA } from "@/lib/data";
import { setModState, useApp, useData } from "@/lib/store";
import { isOpenFinding, whyCannotManage } from "@/services/audits";
import { useGo, useRoute } from "@/lib/route";
import { AuditDetail, StageChip } from "./AuditDetail";
import { AuditFormPage } from "./AuditFormPage";

export { StageChip };
/* eslint-disable @typescript-eslint/no-explicit-any */
type Audit = any;

export default function AuditsModule({ param: propParam }: { param?: string | null }) {
  useData();
  const go = useGo();
  const role = useApp((s) => s.role);
  const { param: routeParam } = useRoute();
  const param = propParam ?? routeParam;
  if (param === "new") return <AuditFormPage />;
  if (param) return <AuditDetail id={param} />;

  const auditorView = role === "auditor";
  const pool = auditorView ? DATA.audits.filter((a) => /External/.test(a.lead)) : DATA.audits;
  const pctOf = (a: Audit) => Math.max(0, Math.min(100, Number(a.progress) || 0));
  const openCount = (a: Audit) => a.findings.filter(isOpenFinding).length;
  const cols: DTColumn<Audit>[] = [
    { key: "name", header: "Audit", value: (a) => a.name, locked: true, render: (a) => <span className="strong">{a.name}</span> },
    { key: "fw", header: "Framework", value: (a) => a.fw, render: (a) => a.fw },
    { key: "auditor", header: "Auditor", value: (a) => a.auditor, render: (a) => a.auditor },
    { key: "progress", header: "Progress", value: (a) => pctOf(a), render: (a) => <span style={{ whiteSpace: "nowrap" }}><span className="bar-track" style={{ width: 100, display: "inline-block", verticalAlign: "middle" }}><span className="bar-fill" style={{ width: pctOf(a) + "%", background: "var(--accent)" }} /></span> <span className="num" style={{ marginLeft: 6 }}>{pctOf(a)}%</span></span> },
    { key: "open", header: "Open findings", value: (a) => openCount(a), align: "end", render: (a) => (openCount(a) ? <Chip cls="bad" icon="alert">{openCount(a)} open</Chip> : <span className="num">0</span>) },
  ];
  const newAudit = () => go("/ws/audits/new");
  const totalOpen = pool.reduce((n: number, a: Audit) => n + (a.findings || []).filter(isOpenFinding).length, 0);
  const outstanding = pool.reduce((n: number, a: Audit) => n + (a.pbc || []).filter((p: { status: string }) => p.status === "Outstanding").length, 0);
  return (
    <Page mod="audits" acts={auditorView
      ? <button className="btn btn-secondary" data-tour="audits-requests" disabled={!pool.length} onClick={() => { setModState("audits.tab", "ir"); go("/ws/audits/" + encodeURIComponent(pool[0].id)); }}><Icon name="evidence" />Information requests</button>
      : <button className="btn btn-primary" data-tour={whyCannotManage() ? undefined : "audits-add"} disabled={!!whyCannotManage()} title={whyCannotManage() || undefined} onClick={newAudit}><Icon name="plus" />New audit</button>}>
      <KpiStrip label="Audit summary">
        <KpiTile label="In fieldwork" value={pool.filter((a: Audit) => a.stage === "Fieldwork").length} caption={`${pool.length} audits in total`} />
        <KpiTile label="Open findings" value={totalOpen} delta={totalOpen ? { tone: "bad", text: "Needs action" } : undefined} caption="Not yet closed or declined" />
        <KpiTile label="Outstanding requests" value={outstanding} delta={outstanding ? { tone: "watch", text: "Chase owners" } : undefined} caption="Evidence requests (PBC) outstanding" />
        <KpiTile label="Complete" value={pool.filter((a: Audit) => a.stage === "Complete").length} caption="Engagements closed" />
      </KpiStrip>
      <div className="card" data-tour="audits-table"><div className="c-body scroll">
        {auditorView ? (
          <div className="card" role="note" data-tour="audits-auditor-note" style={{ background: "var(--surface-2)", borderColor: "var(--line)", marginBottom: 12 }}><div className="c-body" style={{ padding: 14 }}>
            <div style={{ fontWeight: 600, display: "flex", gap: 6, alignItems: "center" }}><Icon name="eye" /> Audits assigned to you</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>As external auditor you have read-only access to each engagement&apos;s framework and the controls, evidence and policies management shares with it, while your access is live. You can raise information requests and draft findings; management accepts a finding into an issue. You cannot advance stages, freeze populations, end access, create issues or change management requests.</div>
          </div></div>
        ) : null}
        <DataTable<Audit> id="audits" label="Audits" rows={pool} rowKey={(a) => a.id} columns={cols} searchText={(a) => `${a.name} ${a.fw} ${a.auditor}`}
          tabs={DATA.auditStages.map((st: string) => ({ key: st, label: st, match: (a: Audit) => a.stage === st }))}
          onOpen={(a) => go("/ws/audits/" + encodeURIComponent(a.id))} exportName="audits" />
      </div></div>
    </Page>
  );
}
