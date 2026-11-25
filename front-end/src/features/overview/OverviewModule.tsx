import { HBarList, Icon, KpiStrip, KpiTile, LineChart, Page, Segmented, StatusChip, activate, type Desirability, Empty } from "@/components/ui";
import { DEMO_RISE, PERIODS, demoSeries, periodRange, periodTicks, periodVs, setPeriod, usePeriod } from "@/lib/period";
import { FocusCard } from "./FocusCard";
import { ComplianceCalendar } from "./ComplianceCalendar";
import { PostureBrief } from "./PostureBrief";
import { AuditorOverview } from "./AuditorOverview";
import { baseRole } from "@/lib/sod";
import { DATA } from "@/lib/data";
import { appStore, useData } from "@/lib/store";
import { fwReadiness } from "@/lib/frameworks";
import { metrics } from "@/lib/metrics";
import { getMe, wsLog } from "@/lib/audit";
import { useGo } from "@/lib/route";
import { useLayer } from "@/hooks/useLayer";
import { COV_CATS, COV_FW, covCell, applyBoardPack, boardPackHTML, exportedBoardPack } from "@/features/overview/lib/boardPack";
import { downloadText } from "@/lib/format";
import { useRoute } from "@/lib/route";
import { useApp } from "@/lib/store";
import { API_ON, modAllowed, roleOf } from "@/lib/rbac";

const tile = (tone: Desirability, text: string) => ({ tone, text });

/** The framework label column stays in view while the category columns scroll sideways on a narrow screen. */
const STICKY = { position: "sticky", left: 0, zIndex: 1, background: "var(--surface)" } as const;

function CoverageHeatmap() {
  return (
    <div className="covwrap" role="group" tabIndex={0} aria-label="Control coverage, implemented percent by framework and category">
      <div className="covgrid">
        <div className="covrow covhead"><div className="covlbl" style={STICKY} />{COV_CATS.map((c) => <div key={c[0]} className="covh">{c[0]}</div>)}</div>
        {COV_FW.map(([fid, fname]) => (
          <div key={fid} className="covrow">
            <div className="covlbl" style={STICKY} title={fname}>{fname}</div>
            {COV_CATS.map(([cn, cats]) => {
              const r = covCell(fid, cats);
              if (!r) return <div key={cn} className="covcell" style={{ background: "var(--surface-2)", color: "var(--faint)", borderColor: "var(--line)" }} title={`${fname} · ${cn}: no mapped controls`}>—</div>;
              return (
                <div key={cn} className="covcell" style={{ background: `color-mix(in srgb,var(--accent) ${Math.round(8 + r.pct * 0.27)}%,var(--surface))`, color: "var(--ink)", borderColor: "color-mix(in srgb,var(--accent) 24%,var(--surface))" }}
                  title={`${fname} · ${cn}: ${r.pass} of ${r.n} controls implemented`}>{r.pct}%</div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
export { CoverageHeatmap };

/** An external auditor sees their engagements, never the company's posture (the server sends them no figures). */
export default function OverviewModule() {
  const role = useApp((s) => s.role);
  return baseRole(role) === "auditor" ? <AuditorOverview /> : <PostureOverview />;
}

function PostureOverview() {
  useData(); const role = useApp((s) => s.role); useRoute();
  const go = useGo(); const L = useLayer();
  /* production: the detail of a module the role cannot open is never shown (the server sends its figures only) */
  const can = (m: string) => modAllowed(role, "ws", m);
  const live = (d: ReturnType<typeof tile>) => (API_ON ? undefined : d); // the demonstration's month-on-month texts are not real history
  const M = metrics();
  const fwRank = [...DATA.frameworks].map((f) => ({ f, r: fwReadiness(f.id) })).sort((a, b) => a.r - b.r).slice(0, 6);
  const sev: Record<string, number> = { High: DATA.issues.filter((i) => i.sev === "High").length, Medium: DATA.issues.filter((i) => i.sev === "Medium").length, Low: DATA.issues.filter((i) => i.sev === "Low").length };
  const sevMax = Math.max(1, ...Object.values(sev));
  // R34: the trend follows the period chosen here or on Reports (demonstration history only; production has none stored yet)
  const per = usePeriod(); const rise = DEMO_RISE[per]; const tk = periodTicks(per);
  const openTrend = demoSeries(M.openRisks, tk.length, -rise.risks, 0, 999);
  /* Only items whose module the role can open are listed, in both modes; each opens its own record. */
  const overdueIssues = DATA.issues.filter((i) => i.status !== "Closed" && /Overdue/.test(i.due));
  const overdueVendors = DATA.vendors.filter((v) => /Overdue/.test(v.due));
  const attn: { id: string; title: string; sev: string; owner: string; path: string }[] = (can("issues") ? overdueIssues : []).map((i) => ({ id: i.id, title: i.title, sev: i.sev, owner: i.owner, path: `/ws/issues/${encodeURIComponent(i.id)}` })).concat(
    (can("vendors") ? overdueVendors : []).map((v) => ({ id: v.name, title: v.cat + " vendor review overdue", sev: v.tier === "Critical" ? "High" : "Medium", owner: "Vendor", path: v.id ? `/ws/vendors/${encodeURIComponent(v.id)}` : "/ws/vendors" })));
  const hiddenOverdue = [!can("issues") && overdueIssues.length ? `${overdueIssues.length} overdue issue${overdueIssues.length === 1 ? "" : "s"}. Your role does not open Issues.` : "",
    !can("vendors") && overdueVendors.length ? `${overdueVendors.length} overdue vendor review${overdueVendors.length === 1 ? "" : "s"}. Your role does not open Third parties.` : ""].filter(Boolean);
  const audits = DATA.audits.filter((a) => a.stage !== "Complete");
  const period = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const exportBoardPack = async () => {
    wsLog("overview.boardpack.exported", "Board & executive pack", "System");
    if (!(await exportedBoardPack())) { L.toast("Something went wrong. Please try again.", false); return; }
    let w: Window | null = null;
    try {
      // The tab inherits the site's CSP (blob: address): its markup has no inline style or script; the app styles it once loaded.
      const url = URL.createObjectURL(new Blob([boardPackHTML("tab")], { type: "text/html;charset=utf-8" }));
      w = window.open(url, "_blank");
      if (w) {
        w.opener = null; // detach (the "noopener" feature would make window.open return null)
        const tab = w; let tries = 0;
        const apply = () => { if (applyBoardPack(tab) || ++tries > 100 || tab.closed) return; setTimeout(apply, 50); };
        apply();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { /* fall through to download */ }
    if (w) { L.toast("Board pack ready — use Print / Save as PDF"); return; }
    if (!downloadText("Selvara-Board-Pack.html", boardPackHTML("file"), "text/html;charset=utf-8")) { L.toast("Download not available in this view", false); return; }
    L.toast("Board pack downloaded — open it, then Print / Save as PDF");
  };

  // R6: a personal greeting, with the date and the posture period above it
  const now = new Date(); const hr = now.getHours();
  const first = (roleOf(appStore.get().role).person || "").split(/\s+/)[0];
  const greeting = `Good ${hr < 12 ? "morning" : hr < 18 ? "afternoon" : "evening"}${first ? `, ${first}` : ""}`;
  const today = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  return (
    <Page eyebrow={`${today} · Security posture · ${period}`} title={greeting} sub={`${M.overdueControls} controls failing and ${M.openIssues} open issues need your attention.`} acts={<>
      <button className="btn btn-secondary" data-tour="overview-boardpack" onClick={exportBoardPack}><Icon name="download" />Export board pack</button>
      {can("reports") ? <button className="btn btn-secondary" onClick={() => go("/ws/reports")}><Icon name="reports" />Reports</button> : null}
      {can("work") ? <button className="btn btn-primary" data-tour="overview-work" onClick={() => go("/ws/work")}><Icon name="work" />Open my work</button> : null}
    </>}>
      <div className="scroll" style={{ flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 14 }}>
      <KpiStrip label="Posture summary">
        <KpiTile label="Weighted compliance" value={M.compliance + "%"} delta={live(tile("good", `+${rise.compliance} pt${rise.compliance === 1 ? "" : "s"} ${periodVs(per)}`))} caption="Across frameworks in scope" />
        <KpiTile label="Open risks" value={M.openRisks} delta={live(rise.risks ? tile("good", `${rise.risks} fewer ${periodVs(per)}`) : tile("flat", `No change ${periodVs(per)}`))} caption={`${M.aboveAppetite} above appetite`} />
        <KpiTile label="Controls failing" value={M.overdueControls} delta={live(tile("bad", "1 more this week"))} caption="Need remediation" />
        <KpiTile label="Open issues" value={M.openIssues} delta={live(tile("flat", "No change"))} caption="Not yet closed" />
        <KpiTile label="Upcoming audits" value={M.upcomingAudits} caption={API_ON ? "Not yet complete" : "Not yet complete · next in 136 days"} />
        <KpiTile label="Vendor reviews due" value={M.vendorDue} delta={live(tile("bad", "2 overdue"))} caption="Third-party reassessments" />
      </KpiStrip>
      <FocusCard can={can} />
      <PostureBrief can={can} />
      <div className="panels" data-tour="overview-panels" style={{ flex: "0 0 auto", gridTemplateColumns: "1.6fr 1fr 1fr", gridAutoRows: "minmax(320px,auto)" }}>
        <div className="card">
          <div className="c-head" style={{ flexWrap: "wrap" }}><h3>Risk posture</h3><div className="r" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <Segmented label="Trend period" value={per} options={PERIODS} onChange={setPeriod} />
            {can("risk") ? <button className="btn btn-ghost sm" onClick={() => go("/ws/risk")}>Risk register</button> : null}</div></div>
          <div className="c-body scroll">
            {API_ON ? <p className="field help" style={{ margin: 0 }}>{M.openRisks} open risk{M.openRisks === 1 ? "" : "s"}, {M.aboveAppetite} above appetite. The trend for {periodRange(per)} appears here once daily figures have been recorded.</p>
              : <LineChart title={`Open risks, ${periodRange(per)}`} data={openTrend.map((v, i) => ({ label: tk[i].label, value: v }))} unit="" />}
            <div className="hr" />
            <HBarList title="Open issues by severity" rows={([["High", "bad"], ["Medium", "warn"], ["Low", "muted"]] as const).map(([s, tone]) => ({ label: s, value: sev[s], tone }))} max={sevMax} />
          </div>
        </div>
        <div className="card">
          <div className="c-head"><h3>Framework readiness</h3>{can("frameworks") ? <div className="r"><button className="btn btn-ghost sm" onClick={() => go("/ws/frameworks")}>View all</button></div> : null}</div>
          <div className="c-body scroll">
            <HBarList title="Lowest readiness first" rows={fwRank.map(({ f, r }) => ({ label: f.name, value: r, text: r + "%", tone: r >= 80 ? "ok" : r >= 50 ? "warn" : "bad" }))} max={100} />
          </div>
        </div>
        <div className="card" data-tour="overview-attention">
          <div className="c-head"><h3>Needs attention</h3>{can("issues") ? <div className="r"><button className="btn btn-ghost sm" onClick={() => go("/ws/issues")}>All issues</button></div> : null}</div>
          <div className="c-body scroll flush" style={{ padding: "6px 14px" }}>
            <div className="sectitle" style={{ marginTop: 8 }}>Overdue</div>
            <div className="feed">
              {!attn.length && !hiddenOverdue.length ? <Empty compact icon="check" title="Nothing is overdue" /> : null}
              {hiddenOverdue.map((t) => <p key={t} className="field help" style={{ margin: "4px 0 8px" }}>{t}</p>)}
              {attn.map((a) => (
                <div key={a.path + a.id} className="feed-item clickable" {...activate(() => go(a.path))}>
                  <span className="dot" style={{ marginTop: 5, background: a.sev === "High" ? "var(--bad-ink)" : "var(--warn-ink)" }} />
                  <div className="fi"><div className="ft" style={{ WebkitLineClamp: 3 }}>{a.title}</div>
                    <div className="fm" style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 4 }}><StatusChip s="Overdue" /><span>{a.id}, {a.sev} severity, {a.owner}</span></div></div>
                </div>
              ))}
            </div>
            <div className="sectitle">Audits in motion</div>
            <div className="feed">
              {!audits.length ? <Empty compact icon="audits" title="No audits in progress" /> : null}
              {!can("audits") && audits.length ? <p className="field help" style={{ margin: "4px 0 8px" }}>{audits.length} audit{audits.length === 1 ? "" : "s"} in progress. Your role does not open Audits.</p> : null}
              {(!can("audits") ? [] : audits).map((a) => (
                <div key={a.id || a.name} className="feed-item clickable" {...activate(() => go(a.id ? `/ws/audits/${encodeURIComponent(a.id)}` : "/ws/audits"))}>
                  <span className="dot" style={{ marginTop: 5, background: "var(--accent)" }} />
                  <div className="fi"><div className="ft" title={a.name}>{a.name}</div><div className="fm">{a.auditor}, {a.period}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <ComplianceCalendar can={can} />
      <div className="card" data-tour="overview-coverage" style={{ flex: "0 0 auto" }}>
        <div className="c-head"><h3>Control coverage</h3><div className="r" style={{ fontSize: 12, color: "var(--muted)" }}>Implemented %, framework × category</div></div>
        <div className="c-body">
          <CoverageHeatmap />
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginTop: 12, fontSize: 11.5, color: "var(--muted)" }}>
            <span>Each cell: controls passing ÷ controls mapped to that framework in that category. &quot;—&quot; means no mapped controls.</span>
            <span style={{ display: "flex", gap: 10, marginLeft: "auto", alignItems: "center" }}>
              <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><span style={{ width: 12, height: 12, borderRadius: 3, background: "color-mix(in srgb,var(--accent) 12%,var(--surface))", border: "1px solid color-mix(in srgb,var(--accent) 24%,var(--surface))" }} />lower</span>
              <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><span style={{ width: 12, height: 12, borderRadius: 3, background: "color-mix(in srgb,var(--accent) 35%,var(--surface))", border: "1px solid color-mix(in srgb,var(--accent) 24%,var(--surface))" }} />higher</span>
            </span>
          </div>
        </div>
      </div>
      </div>
    </Page>
  );
}
void getMe;
