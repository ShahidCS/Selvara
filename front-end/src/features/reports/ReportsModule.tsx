import { Icon, KpiStrip, KpiTile, LineChart, Page, Table } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { DATA } from "@/lib/data";
import { wsLog } from "@/lib/audit";
import { downloadText } from "@/lib/format";
import { metrics } from "@/lib/metrics";
import { safeFileName } from "@/lib/security";
import { bumpData, useApp, useData } from "@/lib/store";
import { hasRole } from "@/lib/sod";
import { SCHED_PACKS } from "@/lib/trustData";
import * as svc from "@/features/reports/services/reports";
import { ApprovalsPanel, attempt } from "@/components/kit/sodKit";
import { ConfirmRemoveSchedule, RemoveScheduleForm, ScheduleForm } from "./ReportLayers";
import { API_ON } from "@/lib/rbac";

const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"];

/** Reports: readiness trend, scheduled packs, stored reports (source REND.reports, lines 3496-3525). */
export default function ReportsModule() {
  useData();
  const L = useLayer();
  const can = hasRole(useApp((s) => s.role), "admin", "owner");
  const why = can ? undefined : "Only admin or owner can schedule or generate reports.";
  const M = metrics();
  const trend = [62, 66, 69, 71, 74, 76, M.compliance]; // demonstration history; production shows today's figure only (no stored history yet)
  const schedule = (initial?: string) => L.openModal("Schedule a report", <ScheduleForm L={L} initial={initial} />);

  const generate = (name: string) => attempt(L, async () => {
    const out = await svc.generateReport(name);
    // a draft as plain text or CSV (no HTML), file name sanitised
    const ok = downloadText(safeFileName(out.fileName, "report.txt"), out.content, out.type);
    wsLog("report.generated", name, "System");
    L.toast(ok ? "Generated " + name + (API_ON ? " (draft: review before you share it)" : " (demo)") : "Download not available in this view", ok);
  });
  const unschedule = (i: number) => SCHED_PACKS[i]?.external && API_ON ? L.openModal("Remove external schedule", <RemoveScheduleForm L={L} i={i} />) : L.openModal("Remove schedule", <ConfirmRemoveSchedule L={L} i={i} run={() => attempt(L, async () => {
    const r = await svc.removeSchedule(i);
    if (!r) return;
    wsLog("report.unscheduled", r.name, "System"); L.toast("Schedule removed"); bumpData();
  })} />);

  return (
    <Page mod="reports" acts={<button className="btn btn-primary" disabled={!can} title={why} onClick={() => schedule()}><Icon name="plus" />New schedule</button>}>
      <div className="scroll" style={{ overflow: "auto" }}>
        <KpiStrip label="Reporting summary">
          <KpiTile label="Weighted compliance" value={M.compliance + "%"} caption="Across frameworks in scope" />
          <KpiTile label="Scheduled packs" value={SCHED_PACKS.length} caption={`${SCHED_PACKS.filter((p) => p.external).length} sent outside the organisation`} />
          <KpiTile label="Stored reports" value={DATA.reports.length} caption="Generate now, on demand" />
        </KpiStrip>
        <ApprovalsPanel prefix="report." title="External distribution awaiting a different admin" />
        <div className="split" style={{ gridTemplateColumns: "1fr 1.2fr", marginBottom: 14 }}>
          <div className="card"><div className="c-head"><h3>Readiness trend</h3><span className="tag" style={{ marginLeft: "auto" }}>{M.compliance}% now</span></div>
            <div className="c-body">{API_ON ? <p className="field help" style={{ margin: 0 }}>Weighted compliance today is {M.compliance}%. The trend appears here once monthly figures have been recorded.</p>
              : <LineChart title="Weighted compliance over the last 7 months" data={trend.map((v, i) => ({ label: MONTHS[i], value: v }))} unit="%" />}</div></div>
          <div className="card"><div className="c-head"><h3>Scheduled packs</h3><button className="btn btn-ghost sm" style={{ marginLeft: "auto" }} disabled={!can} title={why} onClick={() => schedule()}><Icon name="plus" />Add</button></div>
            <div className="c-body flush scroll" style={{ padding: 0 }}>
              <Table cols={[{ t: "Pack and recipients" }, { t: "Frequency" }, { t: "Next" }, { t: "" }]}>
                {!SCHED_PACKS.length ? <tr><td colSpan={4} style={{ color: "var(--muted)" }}>No packs are scheduled yet.</td></tr> : null}
                {SCHED_PACKS.map((r, i) => (
                  <tr key={r.id ?? i}>
                    <td><div className="strong">{r.name}</div><div style={{ fontSize: 12, color: "var(--muted)" }}>To {r.recip}</div>{r.external ? <div style={{ fontSize: 11, color: "var(--muted)" }}>External · approved{r.approvedBy ? " by " + r.approvedBy : ""}</div> : null}</td>
                    <td>{r.freq}{r.detail ? <div style={{ fontSize: 11, color: "var(--muted)" }}>{r.detail}</div> : null}</td>
                    <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{r.next}</td>
                    <td className="r"><button className="btn btn-ghost sm" disabled={!can} title={why ?? `Remove the schedule for ${r.name}`} onClick={() => unschedule(i)} aria-label={`Remove schedule for ${r.name}`}><Icon name="trash" /></button></td>
                  </tr>
                ))}
              </Table>
            </div></div>
        </div>
        <div className="card"><div className="c-head"><h3>Stored reports</h3></div>
          <div className="c-body flush scroll" style={{ padding: 0 }}>
            <Table cols={[{ t: "Report" }, { t: "Category" }, { t: "Cadence" }, { t: "" }]}>
              {DATA.reports.map((r) => (
                <tr key={r.name}><td className="strong">{r.name}</td><td>{r.cat}</td><td>{r.updated}</td>
                  <td className="r" style={{ whiteSpace: "nowrap" }}>
                    <button className="btn btn-ghost sm" disabled={!can} title={why ?? `Schedule ${r.name}`} aria-label={`Schedule ${r.name}`} onClick={() => schedule(r.name)}><Icon name="calendar" /></button>
                    <button className="btn btn-ghost sm" disabled={!can} title={why} aria-label={`Generate now: ${r.name}`} onClick={() => generate(r.name)}><Icon name="reports" /><span className="max-[600px]:hidden">Generate now</span></button>
                  </td></tr>
              ))}
            </Table>
          </div></div>
      </div>
    </Page>
  );
}
