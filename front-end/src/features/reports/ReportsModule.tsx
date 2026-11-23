import { DonutChart, HBarList, Icon, KpiStrip, KpiTile, LineChart, PairBarChart, Page, Segmented, Table, type Tone } from "@/components/ui";
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
import { AskPanel } from "@/components/kit/AskPanel";
import { fwReadiness } from "@/lib/frameworks";
import { ConfirmRemoveSchedule, RemoveScheduleForm, ScheduleForm } from "./ReportLayers";
import { API_ON } from "@/lib/rbac";
import { DEMO_RISE, PERIODS, demoIssueFlow, demoSeries, periodRange, periodTicks, periodVs, setPeriod, usePeriod } from "@/lib/period";

/** The readiness target the charts draw: the same 80% that starts the "ready" band on Frameworks. */
const TARGET = 80;
/** The same tones as the Overview's severity bars (Critical in ink, so no two neighbours look alike). */
const SEV_TONE: Record<string, Tone> = { Critical: "ink", High: "bad", Medium: "warn", Low: "muted" };
/** Framework readiness shows the frameworks furthest from target; the rest are on Frameworks. */
const FW_SHOWN = 8;
/** The figures behind this page, as plain sentences for "Ask about this report" (R36). */
function reportFacts(M: ReturnType<typeof metrics>): string[] {
  const fws = [...DATA.frameworks].map((f) => ({ name: f.name, pct: fwReadiness(f.id), audit: f.audit })).sort((a, b) => a.pct - b.pct);
  return [
    `Weighted compliance is ${M.compliance}% across frameworks in scope`,
    ...fws.map((f) => `Framework ${f.name} readiness is ${f.pct}%${f.audit ? `; audit: ${f.audit}` : ""}`),
    `${M.overdueControls} controls failing and ${M.needsEvidence} controls waiting for evidence`,
    `${M.openIssues} open issues`, `${M.openRisks} open risks, ${M.aboveAppetite} above appetite`,
    `${M.upcomingAudits} audits not yet complete`, `${M.vendorDue} vendor reviews overdue or in review`,
    `${SCHED_PACKS.length} scheduled report packs and ${DATA.reports.length} stored reports`,
  ];
}

/** Reports: readiness trend, scheduled packs, stored reports (source REND.reports, lines 3496-3525). */
export default function ReportsModule() {
  useData();
  const L = useLayer();
  const can = hasRole(useApp((s) => s.role), "admin", "owner");
  const why = can ? undefined : "Only admin or owner can schedule or generate reports.";
  const M = metrics();
  // R34: one period for the whole page. The demonstration draws synthetic history ending at today's figure; production has no stored history
  // yet, so it shows today's figures and the charts that need history say so (nothing is invented).
  const period = usePeriod(); const range = periodRange(period); const rise = DEMO_RISE[period];
  const ticksP = periodTicks(period);
  const trend = demoSeries(M.compliance, ticksP.length, rise.compliance);
  const flow = demoIssueFlow(period);
  const closedIn = flow.reduce((a, f) => a + f.closed, 0);
  const fws = [...DATA.frameworks].map((f) => ({ name: f.name, pct: fwReadiness(f.id) })).sort((a, b) => a.pct - b.pct);
  const open = DATA.issues.filter((i) => i.status !== "Closed");
  const sevs = ["Critical", "High", "Medium", "Low"].map((s) => ({ label: s, value: open.filter((i) => i.sev === s).length, tone: SEV_TONE[s] })).filter((x) => x.value);
  const noHistory = (what: string) => <p className="field help" style={{ margin: 0 }}>{what} The trend for {range} appears here once daily figures have been recorded.</p>;
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
    <Page mod="reports" eyebrow={`Reports · ${range}`} acts={<>
      <Segmented label="Period" value={period} options={PERIODS} onChange={setPeriod} />
      <button className="btn btn-primary" data-tour={can ? "reports-new" : undefined} disabled={!can} title={why} onClick={() => schedule()}><Icon name="plus" />New schedule</button>
    </>}>
      <div className="scroll" style={{ overflow: "auto" }}>
        <KpiStrip label={`Figures for ${range}`}>
          <KpiTile label="Weighted compliance" value={M.compliance + "%"} delta={API_ON ? undefined : { tone: "good", text: `+${rise.compliance} pt${rise.compliance === 1 ? "" : "s"}` }} caption={`Target ${TARGET}%`} />
          {API_ON ? null : <KpiTile label="Issues closed" value={closedIn} caption={periodVs(period)} />}
          <KpiTile label="Open issues" value={M.openIssues} caption="Not yet closed" />
          <KpiTile label="Controls failing" value={M.overdueControls} caption="Need remediation" />
          <KpiTile label="Scheduled packs" value={SCHED_PACKS.length} caption={`${SCHED_PACKS.filter((p) => p.external).length} sent outside the organisation`} />
          <KpiTile label="Stored reports" value={DATA.reports.length} caption="Generate now, on demand" />
        </KpiStrip>
        <div className="chart-grid2" data-tour="reports-charts">
          <div className="card"><div className="c-head"><h3>Weighted compliance</h3><span className="tag" style={{ marginLeft: "auto" }}>{M.compliance}% now</span></div>
            <div className="c-body">{API_ON ? noHistory(`Weighted compliance today is ${M.compliance}%, against a target of ${TARGET}%.`)
              : <LineChart title={`Weighted compliance, ${range}`} data={trend.map((v, i) => ({ label: ticksP[i].label, value: v }))} unit="%" target={TARGET} />}</div></div>
          <div className="card"><div className="c-head"><h3>Issues closed and opened</h3></div>
            <div className="c-body">{API_ON ? noHistory(`${M.openIssues} issue${M.openIssues === 1 ? " is" : "s are"} open today.`)
              : <PairBarChart title={`Issues closed and opened, ${range}`} data={flow.map((f) => ({ label: f.label, a: f.closed, b: f.opened }))} aLabel="Closed" bLabel="Opened" />}</div></div>
          <div className="card"><div className="c-head"><h3>Framework readiness</h3><span className="tag" style={{ marginLeft: "auto" }}>Today</span></div>
            <div className="c-body">{fws.length ? <HBarList title="Furthest from target first" rows={fws.slice(0, FW_SHOWN).map((f) => ({ label: f.name, value: f.pct, text: f.pct + "%", tone: f.pct >= TARGET ? "ok" : f.pct >= 50 ? "warn" : "bad" }))} max={100} unit="%" target={TARGET} />
              : <p className="field help" style={{ margin: 0 }}>No frameworks are in scope yet.</p>}
              {fws.length > FW_SHOWN ? <p className="chart-note">{fws.length - FW_SHOWN} more framework{fws.length - FW_SHOWN === 1 ? "" : "s"}, {fws.slice(FW_SHOWN).filter((f) => f.pct >= TARGET).length} at or above target. See Frameworks for all.</p> : null}</div></div>
          <div className="card"><div className="c-head"><h3>Open issues by severity</h3><span className="tag" style={{ marginLeft: "auto" }}>Today</span></div>
            <div className="c-body">{sevs.length ? <DonutChart title="Open issues by severity" segments={sevs} center={String(open.length)} centerSub="open" />
              : <p className="field help" style={{ margin: 0 }}>No open issues.</p>}</div></div>
        </div>
        <ApprovalsPanel prefix="report." title="External distribution awaiting a different admin" />
        <div style={{ marginBottom: 14 }}><AskPanel title="Ask about this report" facts={reportFacts(M)}
          suggestions={["Which framework is furthest behind?", "What should we fix before the next audit?", "Summarise this for the board"]} /></div>
        <div style={{ marginBottom: 14 }}>
          <div className="card" data-tour="reports-schedules"><div className="c-head"><h3>Scheduled packs</h3><button className="btn btn-ghost sm" style={{ marginLeft: "auto" }} disabled={!can} title={why} onClick={() => schedule()}><Icon name="plus" />Add</button></div>
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
        <div className="card" data-tour="reports-stored"><div className="c-head"><h3>Stored reports</h3></div>
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
