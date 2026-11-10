import { Icon, Kpi, Delta, Chip, StatusChip, TrendChart, activate } from "@/components/ui";
import { DATA } from "@/lib/data";
import { useData } from "@/lib/store";
import { fwReadiness } from "@/lib/frameworks";
import { metrics } from "@/lib/metrics";
import { getMe, wsLog } from "@/lib/audit";
import { useGo } from "@/lib/route";
import { useLayer } from "@/hooks/useLayer";
import { COV_CATS, COV_FW, covCell, boardPackHTML } from "@/features/overview/lib/boardPack";
import { downloadText } from "@/lib/format";
import { useRoute } from "@/lib/route";
import { useApp } from "@/lib/store";

const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"];

function CoverageHeatmap() {
  return (
    <div className="covwrap">
      <div className="covgrid">
        <div className="covrow covhead"><div className="covlbl" />{COV_CATS.map((c) => <div key={c[0]} className="covh">{c[0]}</div>)}</div>
        {COV_FW.map(([fid, fname]) => (
          <div key={fid} className="covrow">
            <div className="covlbl" title={fname}>{fname}</div>
            {COV_CATS.map(([cn, cats]) => {
              const r = covCell(fid, cats);
              if (!r) return <div key={cn} className="covcell" style={{ background: "var(--surface-2)", color: "var(--faint)", borderColor: "var(--line)" }} title={`${fname} · ${cn}: no mapped controls`}>—</div>;
              return (
                <div key={cn} className="covcell" style={{ background: `color-mix(in srgb,var(--accent) ${Math.round(8 + r.pct * 0.5)}%,var(--surface))`, color: r.pct >= 60 ? "var(--accent-ink)" : "var(--ink-2)", borderColor: "color-mix(in srgb,var(--accent) 24%,var(--surface))" }}
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

export default function OverviewModule() {
  useData(); useApp((s) => s.role); useRoute();
  const go = useGo(); const L = useLayer();
  const M = metrics();
  const kpis = [
    { k: "Weighted compliance", ic: "gauge", v: M.compliance + "%", tone: "accent", d: ["good", "+3 pts this month", "up"] },
    { k: "Open risks", ic: "risk", v: M.openRisks, tone: "warn", d: ["good", "2 fewer this month", "down"] },
    { k: "Controls failing", ic: "alert", v: M.overdueControls, tone: "bad", d: ["bad", "1 more this week", "up"] },
    { k: "Open issues", ic: "flag", v: M.openIssues, tone: "neutral", d: ["flat", "no change", ""] },
    { k: "Upcoming audits", ic: "audits", v: M.upcomingAudits, tone: "info", d: ["flat", "next in 136 days", ""] },
    { k: "Vendor reviews due", ic: "vendors", v: M.vendorDue, tone: "bad", d: ["bad", "2 overdue", ""] },
  ] as const;
  const fwRank = [...DATA.frameworks].map((f) => ({ f, r: fwReadiness(f.id) })).sort((a, b) => a.r - b.r).slice(0, 6);
  const sev: Record<string, number> = { High: DATA.issues.filter((i) => i.sev === "High").length, Medium: DATA.issues.filter((i) => i.sev === "Medium").length, Low: DATA.issues.filter((i) => i.sev === "Low").length };
  const sevMax = Math.max(1, ...Object.values(sev));
  const openTrend = [20, 19, 18, 17, 16, 15, M.openRisks];
  const attn = DATA.issues.filter((i) => /Overdue/.test(i.due)).concat(
    DATA.vendors.filter((v) => /Overdue/.test(v.due)).map((v) => ({ id: v.name, title: v.cat + " vendor review overdue", sev: v.tier === "Critical" ? "High" : "Medium", owner: "Vendor" })));
  const audits = DATA.audits.filter((a) => a.stage !== "Complete");
  const period = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const exportBoardPack = () => {
    const html = boardPackHTML();
    wsLog("overview.boardpack.exported", "Board & executive pack", "Policy");
    let w: Window | null = null;
    try {
      const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
      w = window.open(url, "_blank");
      if (w) w.opener = null; // detach (the "noopener" feature would make window.open return null)
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { /* fall through to download */ }
    if (w) { L.toast("Board pack ready — use Print / Save as PDF"); return; }
    if (!downloadText("Selvara-Board-Pack.html", html, "text/html;charset=utf-8")) { L.toast("Download not available in this view"); return; }
    L.toast("Board pack downloaded — open it, then Print / Save as PDF");
  };

  return (
    <div className="page">
      <div className="page-head">
        <div className="pt"><h1>Security posture · {period}</h1><div className="sub">{M.overdueControls} controls failing and {M.openIssues} open issues need your attention.</div></div>
        <div className="acts">
          <button className="btn btn-secondary" onClick={exportBoardPack}><Icon name="download" />Export board pack</button>
          <button className="btn btn-secondary" onClick={() => go("/ws/reports")}><Icon name="reports" />Reports</button>
          <button className="btn btn-primary" onClick={() => go("/ws/work")}><Icon name="work" />Open my work</button>
        </div>
      </div>
      <div className="kpis" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
        {kpis.map((x) => <Kpi key={x.k} icon={x.ic} label={x.k} value={x.v} tone={x.tone} sub={<Delta tone={x.d[0] as "good" | "bad" | "flat"} text={x.d[1]} dir={x.d[2] as "up" | "down" | ""} />} />)}
      </div>
      <div className="panels" style={{ gridTemplateColumns: "1.6fr 1fr 1fr", gridAutoRows: "minmax(0,1fr)" }}>
        <div className="card">
          <div className="c-head"><h3>Risk Posture</h3><div className="r"><button className="btn btn-ghost sm" onClick={() => go("/ws/risk")}>Risk register</button></div></div>
          <div className="c-body scroll">
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-.02em" }}>{M.openRisks}</div>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>open risks, {M.aboveAppetite} above appetite</div>
              <div className="chip ok" style={{ marginLeft: "auto" }}><Icon name="check" />trending down</div>
            </div>
            <div style={{ color: "var(--muted)", fontSize: 12, margin: "4px 0 2px" }}>Open risks over the last 7 months (hover for values)</div>
            <TrendChart data={openTrend} labels={MONTHS} unit=" risks" color="var(--accent)" />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--faint)", marginTop: 2 }}>{MONTHS.map((x) => <span key={x}>{x}</span>)}</div>
            <div className="hr" /><div className="sectitle">Open issues by severity</div>
            {([["High", "var(--bad-ink)"], ["Medium", "var(--warn-ink)"], ["Low", "var(--muted)"]] as const).map(([s, col]) => (
              <div key={s} className="bar-row"><span className="nm">{s}</span><span className="bar-track"><span className="bar-fill" style={{ width: `${Math.round((sev[s] / sevMax) * 100)}%`, background: col }} /></span><span className="pc">{sev[s]}</span></div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="c-head"><h3>Framework Readiness</h3><div className="r"><button className="btn btn-ghost sm" onClick={() => go("/ws/frameworks")}>View all</button></div></div>
          <div className="c-body scroll" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {fwRank.map(({ f, r }, i) => {
              const lead = i === 0;
              return (
                <button key={f.id} className="rbd" onClick={() => go("/ws/frameworks")} title={f.name}>
                  <span style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", fontSize: 13 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink)" }}>{f.name}</span>
                    <span className="num" style={{ flex: "0 0 auto", fontWeight: 600, color: lead ? "var(--accent-ink)" : "var(--ink)" }}>{r}%</span>
                  </span>
                  <span className="rbdbar"><span style={{ display: "block", height: "100%", width: `${r}%`, background: lead ? "var(--accent)" : "var(--line-2)" }} /></span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="card">
          <div className="c-head"><h3>Needs Attention</h3><div className="r"><button className="btn btn-ghost sm" onClick={() => go("/ws/issues")}>All issues</button></div></div>
          <div className="c-body scroll flush" style={{ padding: "6px 14px" }}>
            <div className="sectitle" style={{ marginTop: 8 }}>Overdue</div>
            <div className="feed">
              {attn.map((a, i) => (
                <div key={i} className="feed-item clickable" {...activate(() => go("/ws/issues"))}>
                  <span className="dot" style={{ marginTop: 5, background: a.sev === "High" ? "var(--bad-ink)" : "var(--warn-ink)" }} />
                  <div className="fi"><div className="ft" title={a.title}>{a.title}</div><div className="fm">{a.id}, {a.owner}</div></div>
                  <StatusChip s="Overdue" />
                </div>
              ))}
            </div>
            <div className="sectitle">Audits in motion</div>
            <div className="feed">
              {audits.map((a) => (
                <div key={a.id || a.name} className="feed-item clickable" {...activate(() => go("/ws/audits"))}>
                  <span className="dot" style={{ marginTop: 5, background: "var(--accent)" }} />
                  <div className="fi"><div className="ft" title={a.name}>{a.name}</div><div className="fm">{a.auditor}, {a.period}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <div className="c-head"><h3>Control coverage</h3><div className="r" style={{ fontSize: 12, color: "var(--muted)" }}>Implemented %, framework × category</div></div>
        <div className="c-body">
          <CoverageHeatmap />
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginTop: 12, fontSize: 11.5, color: "var(--muted)" }}>
            <span>Each cell: controls passing ÷ controls mapped to that framework in that category. &quot;—&quot; means no mapped controls.</span>
            <span style={{ display: "flex", gap: 10, marginLeft: "auto", alignItems: "center" }}>
              <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><span style={{ width: 12, height: 12, borderRadius: 3, background: "color-mix(in srgb,var(--accent) 12%,var(--surface))", border: "1px solid color-mix(in srgb,var(--accent) 24%,var(--surface))" }} />lower</span>
              <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><span style={{ width: 12, height: 12, borderRadius: 3, background: "color-mix(in srgb,var(--accent) 55%,var(--surface))", border: "1px solid color-mix(in srgb,var(--accent) 24%,var(--surface))" }} />higher</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
void getMe; void Chip;
