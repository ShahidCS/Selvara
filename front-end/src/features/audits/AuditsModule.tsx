import { DataTable, Icon, Page, type DTColumn } from "@/components/ui";
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
    { key: "open", header: "Open findings", value: (a) => openCount(a), align: "end", render: (a) => <span className="num">{openCount(a) ? <span style={{ color: "var(--bad-ink)", fontWeight: 500 }}>{openCount(a)}</span> : "0"}</span> },
  ];
  const newAudit = () => go("/ws/audits/new");
  return (
    <Page mod="audits" acts={auditorView
      ? <button className="btn btn-secondary" disabled={!pool.length} onClick={() => { setModState("audits.tab", "ir"); go("/ws/audits/" + encodeURIComponent(pool[0].id)); }}><Icon name="evidence" />Information requests</button>
      : <button className="btn btn-primary" disabled={!!whyCannotManage()} title={whyCannotManage() || undefined} onClick={newAudit}><Icon name="plus" />New audit</button>}>
      <div className="card" style={{ flex: "1 1 auto" }}><div className="c-body scroll">
        {auditorView ? (
          <div className="card" style={{ background: "var(--accent-weak)", borderColor: "transparent", marginBottom: 12 }}><div className="c-body" style={{ padding: 14 }}>
            <div style={{ fontWeight: 600 }}><Icon name="audits" /> Audits assigned to you</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>As external auditor you have read-only access to the organisation&apos;s records. You can raise information requests and draft findings; management accepts a finding into an issue. You cannot advance stages, freeze populations, end access, create issues or change management requests.</div>
          </div></div>
        ) : null}
        <DataTable<Audit> id="audits" label="Audits" rows={pool} rowKey={(a) => a.id} columns={cols} searchText={(a) => `${a.name} ${a.fw} ${a.auditor}`}
          tabs={DATA.auditStages.map((st: string) => ({ key: st, label: st, match: (a: Audit) => a.stage === st }))}
          onOpen={(a) => go("/ws/audits/" + encodeURIComponent(a.id))} exportName="audits" />
      </div></div>
    </Page>
  );
}
