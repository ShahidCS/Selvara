import { Fragment } from "react";
import { Icon, Page, Table, activate } from "@/components/ui";
import { DATA } from "@/lib/data";
import { setModState, useApp, useData } from "@/lib/store";
import { isOpenFinding, whyCannotManage } from "@/services/audits";
import { useGo, useRoute } from "@/lib/route";
import { useLayer } from "@/hooks/useLayer";
import { AuditDetail, StageChip } from "./audits/AuditDetail";
import { NewAuditForm } from "./audits/AuditModals";

/* eslint-disable @typescript-eslint/no-explicit-any */
export { StageChip };

export default function AuditsModule({ param: propParam }: { param?: string | null }) {
  useData();
  const L = useLayer(); const go = useGo();
  const role = useApp((s) => s.role);
  const { param: routeParam } = useRoute();
  const param = propParam ?? routeParam;
  if (param) return <AuditDetail id={param} />;

  const auditorView = role === "auditor";
  const pool = auditorView ? DATA.audits.filter((a) => /External/.test(a.lead)) : DATA.audits;
  const newAudit = () => L.openModal("New audit", (close) => <NewAuditForm L={{ ...L, closeLayer: close }} go={go} />);
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
        <Table cols={[{ t: "Audit" }, { t: "Framework" }, { t: "Auditor" }, { t: "Progress" }, { t: "Open findings", r: true }, { t: "" }]}>
          {DATA.auditStages.map((st: string) => {
            const list = pool.filter((a) => a.stage === st);
            if (!list.length) return null;
            return (
              <Fragment key={st}>
                <tr><td colSpan={6} className="grouprow">{st} <span className="tag" style={{ marginLeft: 4 }}>{list.length}</span></td></tr>
                {list.map((a) => {
                  const open = a.findings.filter(isOpenFinding).length;
                  const pct = Math.max(0, Math.min(100, Number(a.progress) || 0));
                  return (
                    <tr key={a.id} className="clickable" {...activate(() => go("/ws/audits/" + encodeURIComponent(a.id)))}>
                      <td className="strong">{a.name}</td><td>{a.fw}</td><td>{a.auditor}</td>
                      <td style={{ minWidth: 120 }}><div className="bar-track" style={{ width: 100, display: "inline-block", verticalAlign: "middle" }}><span className="bar-fill" style={{ width: pct + "%", background: "var(--accent)" }} /></div> <span className="num" style={{ fontSize: 12 }}>{pct}%</span></td>
                      <td className="r num">{open ? <span style={{ color: "var(--bad-ink)", fontWeight: 500 }}>{open}</span> : "0"}</td>
                      <td className="r"><Icon name="chevron" /></td>
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}
        </Table>
      </div></div>
    </Page>
  );
}
