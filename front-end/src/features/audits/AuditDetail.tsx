import Link from "next/link";
import { adminLog } from "@/lib/adminAudit";
import { Chip, Empty, Icon, Kpi, Page, StatusChip, Table } from "@/components/ui";
import { useApp, useData, useModState, bumpData } from "@/lib/store";
import { wsLog } from "@/lib/audit";
import { downloadText } from "@/lib/format";
import { safeFileName } from "@/lib/security";
import { useGo } from "@/lib/route";
import { useLayer } from "@/hooks/useLayer";
import * as svc from "@/services/audits";
import { AddPbcForm, AuditReportBody, openDraftFinding, openEndAccess, openRaiseIr, openRejectFinding, openRespondIr } from "./AuditModals";
import { hasRole } from "@/lib/sod";
import { attempt } from "./util";

/* eslint-disable @typescript-eslint/no-explicit-any */
const TABS: [string, string][] = [["over", "Overview"], ["pbc", "Requests (PBC)"], ["ir", "Information requests"], ["tests", "Control testing"], ["findings", "Findings"]];
const STAGE_TONE: Record<string, string> = { Planned: "info", Fieldwork: "warn", Reporting: "warn", Complete: "ok" };
export const StageChip = ({ st }: { st: string }) => <Chip cls={STAGE_TONE[st] || "neutral"} icon={st === "Complete" ? "check" : "clock"}>{st}</Chip>;
/** Management (admin/owner base roles, so admin2 too) owns the organisation's audit records. Auditors and everyone else are read-only (deny by default). The API must enforce this again. */
export const auditCanManage = (role: string) => hasRole(role, "admin", "owner");
const pbcTone = (s: string) => (s === "Received" ? "Done" : s === "Outstanding" ? "Overdue" : "Pending");

export function AuditNotFound() {
  return <Page title="Audit not found" back={{ href: "/ws/audits", label: "Audits" }}><Empty icon="audits" title="No such audit">There is no audit with that ID, or it is not assigned to you. It may have been removed, or the link may be wrong.</Empty></Page>;
}

export function AuditDetail({ id }: { id: string }) {
  useData();
  const L = useLayer(); const go = useGo();
  const role = useApp((s) => s.role);
  const [tab, setTab] = useModState("audits.tab", "over");
  const a = svc.findAudit(id);
  if (!a || (role === "auditor" && !/External/.test(a.lead))) return <AuditNotFound />; // auditors only see external engagements (the API must scope per engagement)
  svc.auditInit(a);
  const canManage = auditCanManage(role);
  const manageWhy = svc.whyCannotManage();
  const audWhy = svc.whyCannotAuditorAct(a);
  const completeWhy = svc.whyCannotComplete(a);
  const dis = (why: string | null) => ({ disabled: !!why, title: why || undefined });
  const open = a.findings.filter(svc.isOpenFinding).length;

  const grant = () => attempt(L, async () => {
    await svc.grantAuditorAccess(id);
    wsLog("audit.auditor.access.granted", a.name + " → " + a.auditor, "Audit"); L.toast("Auditor access granted for " + a.auditor); bumpData();
  });
  const end = () => openEndAccess(L, id, svc.needsCloseReason(a));
  const freeze = () => attempt(L, async () => {
    await svc.freezePopulations(id);
    wsLog("audit.populations.frozen", a.name, "Audit"); L.toast("Populations frozen for " + a.name); bumpData();
  });
  const advance = () => attempt(L, async () => {
    const r = await svc.advanceStage(id);
    if (r) { wsLog("audit.stage.advanced", `${a.id} ${a.name} → ${r.stage}`, "Audit"); L.toast(a.name + " moved to " + r.stage); bumpData(); }
  });
  const cycle = (pid: string) => attempt(L, async () => {
    const r = await svc.cyclePbc(id, pid);
    if (r) { wsLog("audit.pbc.updated", a.name + ": " + r.id + " " + r.status, "Audit"); bumpData(); }
  });
  const promote = (fid: string) => attempt(L, async () => {
    const r = await svc.promoteFinding(id, fid);
    if (r) { L.toast("Issue " + r.iid + " created from finding"); bumpData(); }
  });
  const addPbc = () => L.openModal("Add request, " + a.name, (close) => <AddPbcForm L={{ ...L, closeLayer: close }} id={id} onAdded={() => setTab("pbc")} />);
  const report = () => L.openModal("Audit report, " + a.name, <AuditReportBody id={id} />,
    <>
      <button className="btn btn-secondary" onClick={L.closeLayer}>Close</button>
      <button className="btn btn-primary" onClick={() => attempt(L, async () => {
        const txt = await svc.exportReport(id);
        downloadText(safeFileName(a.id + "-report.txt", "audit-report.txt"), txt);
        adminLog("audit.report.generated", a.name, { categories: ["Audit"], basis: "Legal obligation" });
        wsLog("audit.report.generated", a.name, "Audit"); L.closeLayer(); L.toast("Report exported (demo)");
      })}><Icon name="download" />Export</button>
    </>);

  let body;
  if (tab === "over") {
    body = (
      <div style={{ maxWidth: 820 }}>
        <div className="kpis">
          <Kpi icon="audits" label="Stage" value={a.stage} tone="neutral" />
          <Kpi icon="controls" label="Progress" value={a.progress + "%"} tone="accent" />
          <Kpi icon="evidence" label="Requests" value={a.pbc.filter((p: any) => p.status === "Received").length + "/" + a.pbc.length + " in"} tone="info" />
          <Kpi icon="alert" label="Open findings" value={open} tone={open ? "bad" : "good"} />
        </div>
        <dl className="meta-grid" style={{ marginTop: 14 }}>
          <dt>Scope</dt><dd>{a.scope}</dd><dt>Framework</dt><dd>{a.fw}</dd><dt>Auditor</dt><dd>{a.auditor}</dd><dt>Lead</dt><dd>{a.lead}</dd><dt>Timeline</dt><dd>{a.period}</dd><dt>Opened</dt><dd>{a.opened}</dd>
        </dl>
        <div className="card" style={{ boxShadow: "none", background: "var(--surface-2)", marginTop: 14 }}><div className="c-body">
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <div className="sectitle" style={{ margin: 0, flex: "1 1 auto" }}>Auditor access &amp; populations</div>
            {a.auditorAccess === "granted" ? <Chip cls="ok" icon="check">Auditor access granted</Chip> : a.auditorAccess === "ended" ? <Chip cls="neutral" icon="check">Auditor access ended</Chip> : <Chip cls="warn" icon="clock">Not yet shared with auditor</Chip>}
            {a.populationsFrozen ? <Chip cls="ok" icon="check">Populations frozen</Chip> : <Chip cls="neutral" icon="dot">Populations live</Chip>}
          </div>
          {canManage ? (
            <>
              <div className="btngrp">
                {a.auditorAccess === "none" ? <button className="btn btn-secondary sm" onClick={grant}><Icon name="ext" />Send to auditor</button> : null}
                {!a.populationsFrozen ? <button className="btn btn-secondary sm" onClick={freeze}><Icon name="check" />Freeze populations now</button> : null}
                {a.auditorAccess === "granted" && a.stage !== "Complete" ? <button className="btn btn-secondary sm" {...dis(completeWhy)} onClick={end}><Icon name="check" />Complete &amp; end auditor access</button> : null}
                {a.auditorAccess === "ended" && a.populationsFrozen ? <span className="field help" style={{ margin: 0, alignSelf: "center" }}>Engagement closed and locked.</span> : null}
              </div>
              {a.auditorAccess === "granted" && a.stage !== "Complete" && completeWhy ? <p className="field help" style={{ margin: "8px 0 0" }}>Cannot complete yet: {completeWhy}</p> : null}
              <p className="field help" style={{ margin: "8px 0 0" }}>Freezing populations locks the sampled records so evidence can’t change mid-audit. Ending access completes the engagement and revokes the external auditor’s read access.</p>
            </>
          ) : <p className="field help" style={{ margin: 0 }}>Read-only for your role. Management (admin/owner) manages auditor access, populations, stages and requests. Auditors may raise information requests and draft findings.</p>}
        </div></div>
      </div>
    );
  } else if (tab === "pbc") {
    body = (
      <>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
          <div className="sectitle" style={{ margin: 0 }}>Prepared-by-client requests</div>
          <button className="btn btn-secondary sm" style={{ marginLeft: "auto" }} {...dis(manageWhy)} onClick={addPbc}><Icon name="plus" />Add request</button>
        </div>
        {a.pbc.length ? (
          <Table cols={[{ t: "ID" }, { t: "Request" }, { t: "Owner" }, { t: "Status" }, { t: "" }]}>
            {a.pbc.map((p: any) => (
              <tr key={p.id}><td className="strong num">{p.id}</td><td>{p.item}</td><td>{p.owner}</td><td><StatusChip s={pbcTone(p.status)} /></td>
                <td className="r"><button className="btn btn-ghost sm" {...dis(manageWhy)} onClick={() => cycle(p.id)}><Icon name="check" />Advance</button></td></tr>
            ))}
          </Table>
        ) : <Empty icon="evidence" title="No requests yet">Add the evidence requests the auditor needs from the team.</Empty>}
      </>
    );
  } else if (tab === "ir") {
    body = (
      <>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
          <div className="sectitle" style={{ margin: 0 }}>Information requests</div>
          <button className="btn btn-secondary sm" style={{ marginLeft: "auto" }} {...dis(audWhy)} onClick={() => openRaiseIr(L, id, a.name)}><Icon name="plus" />Raise request</button>
        </div>
        {audWhy && role === "auditor" ? <p className="field help" style={{ margin: "0 0 8px" }}>{audWhy}</p> : null}
        {a.irs.length ? (
          <Table cols={[{ t: "ID" }, { t: "Request" }, { t: "Raised by" }, { t: "Status" }, { t: "Response" }, { t: "" }]}>
            {a.irs.map((r: any) => (
              <tr key={r.id}><td className="strong num">{r.id}</td><td>{r.item}</td><td>{r.by}<div style={{ fontSize: 11.5, color: "var(--muted)" }}>{r.at}</div></td>
                <td><StatusChip s={r.status === "Closed" ? "Done" : r.status === "Answered" ? "Approved" : "Pending"} /> <span style={{ fontSize: 12 }}>{r.status}</span></td><td>{r.response || "—"}</td>
                <td className="r"><div className="btngrp" style={{ justifyContent: "flex-end" }}>
                  {r.status === "Open" ? <button className="btn btn-ghost sm" {...dis(manageWhy)} onClick={() => openRespondIr(L, id, r.id)}><Icon name="check" />Respond</button> : null}
                  {r.status !== "Closed" ? <button className="btn btn-ghost sm" {...dis(audWhy)} onClick={() => attempt(L, async () => { await svc.closeInformationRequest(id, r.id); L.toast("Request closed"); bumpData(); })}><Icon name="x" />Close</button> : null}
                </div></td></tr>
            ))}
          </Table>
        ) : <Empty icon="evidence" title="No information requests">Auditors raise requests here; management responds.</Empty>}
      </>
    );
  } else if (tab === "tests") {
    body = (
      <>
        <div className="sectitle">Control tests</div>
        {a.tests.length ? (
          <Table cols={[{ t: "Test" }, { t: "Control" }, { t: "Result" }, { t: "Note" }]}>
            {a.tests.map((t: any) => (
              <tr key={t.id}><td className="strong num">{t.id}</td><td className="num">{t.ctrl}</td><td><StatusChip s={t.result === "Pass" ? "Pass" : t.result === "Exception" ? "Fail" : t.result} /></td><td>{t.note}</td></tr>
            ))}
          </Table>
        ) : <Empty icon="controls" title="No tests recorded">Control testing begins once fieldwork is underway.</Empty>}
      </>
    );
  } else {
    body = (
      <>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
          <div className="sectitle" style={{ margin: 0 }}>Findings</div>
          <button className="btn btn-secondary sm" style={{ marginLeft: "auto" }} {...dis(audWhy)} onClick={() => openDraftFinding(L, id, a.name)}><Icon name="plus" />Draft finding</button>
        </div>
        {audWhy && role === "auditor" ? <p className="field help" style={{ margin: "0 0 8px" }}>{audWhy}</p> : null}
        {a.findings.length ? (
          <Table cols={[{ t: "ID" }, { t: "Finding" }, { t: "Severity" }, { t: "Status" }, { t: "Linked issue" }, { t: "" }]}>
            {a.findings.map((f: any) => (
              <tr key={f.id}>
                <td className="strong num">{f.id}</td>
                <td><div>{f.title}</div><div style={{ fontSize: 11.5, color: "var(--muted)" }}>{f.rec}</div></td>
                <td><StatusChip s={f.sev} /></td><td><StatusChip s={f.status} />{f.status === "Draft" ? <div style={{ fontSize: 11.5, color: "var(--muted)" }}>by {f.draftedBy}</div> : null}{f.status === "Rejected" ? <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{f.rejectedReason}</div> : null}</td>
                <td className="num">{f.issue ? <Link href="/ws/issues" onClick={(e) => { e.preventDefault(); go("/ws/issues"); }}>{f.issue}</Link> : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                <td className="r">{f.issue || f.status === "Closed" || f.status === "Rejected" ? null : (
                  <div className="btngrp" style={{ justifyContent: "flex-end" }}>
                    <button className="btn btn-ghost sm" {...dis(manageWhy)} onClick={() => promote(f.id)}><Icon name="plus" />{f.status === "Draft" ? "Accept into issue" : "Create issue"}</button>
                    {f.status === "Draft" ? <button className="btn btn-ghost sm" {...dis(manageWhy)} onClick={() => openRejectFinding(L, id, f.id)}><Icon name="x" />Decline</button> : null}
                  </div>)}</td>
              </tr>
            ))}
          </Table>
        ) : <Empty icon="check" title="No findings">No findings have been raised for this audit.</Empty>}
      </>
    );
  }

  return (
    <Page title={a.name} sub={`${a.fw} · ${a.auditor} · ${a.lead}`} back={{ href: "/ws/audits", label: "Audits" }} acts={
      <>
        <StageChip st={a.stage} />
        <button className="btn btn-secondary" onClick={report}><Icon name="reports" />Generate report</button>
        {a.stage !== "Complete" ? <button className="btn btn-primary" {...dis(manageWhy)} onClick={advance}><Icon name="check" />Advance stage</button> : null}
      </>}>
      <div className="card" style={{ flex: "1 1 auto" }}>
        <div className="c-head" style={{ padding: "0 8px" }}>
          <div className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t[0]} className="tab" role="tab" aria-selected={tab === t[0]} onClick={() => setTab(t[0])}>
                {t[1]}{t[0] === "findings" && a.findings.length ? <> <span className="tag" style={{ marginLeft: 4 }}>{a.findings.length}</span></> : null}
              </button>
            ))}
          </div>
        </div>
        <div className="c-body scroll" id="audDtBody" role="tabpanel">{body}</div>
      </div>
    </Page>
  );
}
