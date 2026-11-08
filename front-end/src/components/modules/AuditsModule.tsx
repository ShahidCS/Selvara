import { Fragment } from "react";
import { Icon, Page, Table, activate } from "@/components/ui";
import { DATA } from "@/lib/data";
import { useApp, useData } from "@/lib/store";
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
      ? <button className="btn btn-secondary" onClick={() => L.toast("Opened auditor information requests")}><Icon name="evidence" />Information requests</button>
      : <button className="btn btn-primary" onClick={newAudit}><Icon name="plus" />New audit</button>}>
      <div className="card" style={{ flex: "1 1 auto" }}><div className="c-body scroll">
        {auditorView ? (
          <div className="card" style={{ background: "var(--accent-weak)", borderColor: "transparent", marginBottom: 12 }}><div className="c-body" style={{ padding: 14 }}>
            <div style={{ fontWeight: 600 }}><Icon name="audits" /> Audits assigned to you</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>As external auditor, you can review evidence, raise information requests, assess controls and record findings. You cannot change the organisation&apos;s own records.</div>
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
                  const open = a.findings.filter((f: any) => f.status !== "Closed").length;
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
