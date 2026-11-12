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
import { ScheduleForm } from "./ReportLayers";

const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"];

/** Reports: readiness trend, scheduled packs, stored reports (source REND.reports, lines 3496-3525). */
export default function ReportsModule() {
  useData();
  const L = useLayer();
  const can = hasRole(useApp((s) => s.role), "admin", "owner");
  const why = can ? undefined : "Only admin or owner can schedule or generate reports.";
  const M = metrics();
  const trend = [62, 66, 69, 71, 74, 76, M.compliance];
  const schedule = () => L.openModal("Schedule a report", <ScheduleForm L={L} />);

  const generate = (name: string) => attempt(L, async () => {
    const txt = await svc.generateReport(name);
    // plain-text draft (no HTML), file name sanitised
    const fname = safeFileName(name.replace(/[^a-z0-9]+/gi, "-").toLowerCase(), "report") + ".txt";
    const ok = downloadText(fname, txt);
    wsLog("report.generated", name, "System");
    L.toast(ok ? "Generated " + name + " (demo)" : "Download not available in this view");
  });
  const unschedule = (i: number) => attempt(L, async () => {
    const r = await svc.removeSchedule(i);
    if (!r) return;
    wsLog("report.unscheduled", r.name, "System"); L.toast("Schedule removed"); bumpData();
  });

  return (
    <Page mod="reports" acts={<button className="btn btn-primary" disabled={!can} title={why} onClick={schedule}><Icon name="plus" />New schedule</button>}>
      <div className="scroll" style={{ overflow: "auto" }}>
        <KpiStrip label="Reporting summary">
          <KpiTile label="Weighted compliance" value={M.compliance + "%"} caption="Across frameworks in scope" />
          <KpiTile label="Scheduled packs" value={SCHED_PACKS.length} caption={`${SCHED_PACKS.filter((p) => p.external).length} sent outside the organisation`} />
          <KpiTile label="Stored reports" value={DATA.reports.length} caption="Generate now, on demand" />
        </KpiStrip>
        <ApprovalsPanel prefix="report." title="External distribution awaiting a different admin" />
        <div className="split" style={{ gridTemplateColumns: "1.3fr 1fr", marginBottom: 14 }}>
          <div className="card"><div className="c-head"><h3>Readiness trend</h3><span className="tag" style={{ marginLeft: "auto" }}>{M.compliance}% now</span></div>
            <div className="c-body"><LineChart title="Weighted compliance over the last 7 months" data={trend.map((v, i) => ({ label: MONTHS[i], value: v }))} unit="%" /></div></div>
          <div className="card"><div className="c-head"><h3>Scheduled packs</h3><button className="btn btn-ghost sm" style={{ marginLeft: "auto" }} disabled={!can} title={why} onClick={schedule}><Icon name="plus" />Add</button></div>
            <div className="c-body flush scroll" style={{ padding: 0 }}>
              <Table cols={[{ t: "Pack" }, { t: "Frequency" }, { t: "Recipients" }, { t: "Next" }, { t: "" }]}>
                {SCHED_PACKS.map((r, i) => (
                  <tr key={i}>
                    <td className="strong">{r.name}</td>
                    <td>{r.freq}{r.detail ? <div style={{ fontSize: 11, color: "var(--muted)" }}>{r.detail}</div> : null}</td>
                    <td style={{ fontSize: 12 }}>{r.recip}{r.external ? <div style={{ fontSize: 11, color: "var(--muted)" }}>External · approved{r.approvedBy ? " by " + r.approvedBy : ""}</div> : null}</td><td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{r.next}</td>
                    <td className="r"><button className="btn btn-ghost sm" disabled={!can} title={why} onClick={() => unschedule(i)} aria-label="Remove schedule"><Icon name="x" /></button></td>
                  </tr>
                ))}
              </Table>
            </div></div>
        </div>
        <div className="card"><div className="c-head"><h3>Stored reports</h3><button className="btn btn-secondary sm" style={{ marginLeft: "auto" }} disabled={!can} title={why} onClick={schedule}><Icon name="ext" />Schedule</button></div>
          <div className="c-body flush scroll" style={{ padding: 0 }}>
            <Table cols={[{ t: "Report" }, { t: "Category" }, { t: "Updated" }, { t: "" }]}>
              {DATA.reports.map((r) => (
                <tr key={r.name}><td className="strong">{r.name}</td><td>{r.cat}</td><td>{r.updated}</td>
                  <td className="r"><button className="btn btn-ghost sm" disabled={!can} title={why} onClick={() => generate(r.name)}><Icon name="reports" />Generate now</button></td></tr>
              ))}
            </Table>
          </div></div>
      </div>
    </Page>
  );
}
