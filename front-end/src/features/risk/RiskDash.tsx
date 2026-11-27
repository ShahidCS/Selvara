/* Risk dashboard (source renderRiskDash, lines 2502-2555). */
import { Chip, DonutChart, KpiStrip, KpiTile, StatusChip, Table, activate, type Segment, Empty } from "@/components/ui";
import { DATA } from "@/lib/data";
import { nowStamp } from "@/lib/format";
import {
  Ib, Lb, RBANDS, RISK_APPETITE, bandTint, heatEdge, heatFill, heatInk, rband, riskOpen, riskPriority, sCur, sRes,
} from "@/lib/risk";
import { HeatView, K_HEAT, riskGoReg, riskOpenDetail } from "./nav";
import { useModState } from "@/lib/store";
import { RatingPill, ScoreChip } from "./RiskBits";

/* eslint-disable @typescript-eslint/no-explicit-any */
const ACT: Record<string, string> = { Low: "Monitor; accept within appetite", Medium: "Treat on normal cycle", High: "Treat with priority; owner review", Extreme: "Immediate executive attention" };
const CRIT: Record<string, string> = { Low: "Routine", Medium: "Standard", High: "Priority", Extreme: "Critical" };

function DistBlock({ open, which, title, note }: { open: any[]; which: "cur" | "res"; title: string; note: string }) {
  const sc = which === "cur" ? sCur : sRes;
  const counts: Record<string, number> = { Low: 0, Medium: 0, High: 0, Extreme: 0 };
  open.forEach((r) => counts[rband(sc(r)).name]++);
  const total = open.length || 1;
  return (
    <section className="card"><div className="c-body">
      <div style={{ marginBottom: 8 }}><h3 style={{ margin: 0 }}>{title}</h3><p className="sub" style={{ margin: "2px 0 0" }}>{note}</p></div>
      <Table cols={[{ t: "Rating" }, { t: "Count", r: true }, { t: "% of open", r: true }, { t: "Action required" }]}>
        {RBANDS.map((b) => (
          <tr key={b.name} className="clickable" {...activate(() => riskGoReg({ rating: b.name, status: "all", cell: null }))}>
            <td><RatingPill b={b} /></td><td className="r strong num">{counts[b.name]}</td><td className="r num">{Math.round(counts[b.name] / total * 100)}%</td>
            <td><div className="strong" style={{ fontSize: ".75rem" }}>{CRIT[b.name]}</div><div style={{ fontSize: ".75rem", color: "var(--muted)" }}>{ACT[b.name]}</div></td>
          </tr>
        ))}
        <tr style={{ borderTop: "2px solid var(--ink)" }}><td className="strong">Total</td><td className="r strong num">{open.length}</td><td className="r num">100%</td><td style={{ fontSize: ".75rem", color: "var(--muted)" }}>Accepted &amp; closed excluded</td></tr>
      </Table>
    </div></section>
  );
}

const mixText = (list: any[]) => RBANDS.map((b) => [b.name, list.filter((r) => rband(sCur(r)).name === b.name).length] as const).filter(([, n]) => n).map(([nm, n]) => `${n} ${nm}`).join(", ");
/** Swatch plus band name for each rating, so the coloured bars and cells are never read by colour alone. */
function BandLegend({ fill }: { fill?: boolean }) {
  return <span style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: ".75rem", color: "var(--muted)" }}>{RBANDS.map((b) => (
    <span key={b.name} style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><span aria-hidden="true" style={{ width: 11, height: 11, borderRadius: 3, background: fill ? heatFill(b) : bandTint(b.col, 60), border: `1px solid ${bandTint(b.col, 42)}`, display: "inline-block" }} />{b.name}</span>
  ))}</span>;
}

function Breakdown({ open, k, title }: { open: any[]; k: "cat" | "team" | "jur"; title: string }) {
  const groups: Record<string, any[]> = {};
  open.forEach((r) => { const key = r[k] || "—"; (groups[key] = groups[key] || []).push(r); });
  return (
    <section className="card"><div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <h3 style={{ margin: "0 0 4px" }}>{title}</h3>
      {Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length).map((g) => {
        const list = groups[g];
        return (
          <button key={g} className="rbd" aria-label={`${g}: ${list.length} open, ${mixText(list)}. Show in the register`} title={`${g}: ${mixText(list)}`} onClick={() => riskGoReg({ [k]: g, rating: "all", status: "all", cell: null })}>
            <span style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: ".8125rem" }}><span>{g}</span><span className="strong">{list.length}</span></span>
            <span className="rbdbar" aria-hidden="true">{RBANDS.map((b) => {
              const n = list.filter((r) => rband(sCur(r)).name === b.name).length;
              return n ? <span key={b.name} style={{ height: "100%", width: `${(n / list.length * 100).toFixed(1)}%`, background: bandTint(b.col, 60) }} /> : null;
            })}</span>
          </button>
        );
      })}
      <div style={{ fontSize: ".75rem", color: "var(--muted)", marginTop: 4, display: "flex", flexDirection: "column", gap: 6 }}>
        <span>Bars show the current-rating mix of open risks.</span>
        <BandLegend />
      </div>
    </div></section>
  );
}

export default function RiskDash() {
  const open = DATA.risks.filter(riskOpen);
  const [heat, setHeat] = useModState<HeatView>(K_HEAT, "cur");
  const view: HeatView = heat === "inh" || heat === "res" ? heat : "cur";
  const lOf = (r: any) => (view === "inh" ? r.l : view === "res" ? r.rl : r.cl || r.l);
  const iOf = (r: any) => (view === "inh" ? r.i : view === "res" ? r.ri : r.ci || r.i);
  const word = view === "inh" ? "inherent" : view === "res" ? "residual" : "current";

  const cells: React.ReactNode[] = [<div key="o" />, ...Lb.map((x) => <div key={"l" + x} className="ax">{x}</div>)];
  for (let im = 5; im >= 1; im--) {
    cells.push(<div key={"i" + im} className="ax">{Ib[im - 1]}</div>);
    for (let lk = 1; lk <= 5; lk++) {
      const sc = im * lk, b = rband(sc), here = open.filter((r) => lOf(r) === lk && iOf(r) === im);
      cells.push(
        <button key={`${im}-${lk}`} className="hc" style={{ background: heatFill(b), color: heatInk(b), ...heatEdge(b, sc) }}
          title={`${Ib[im - 1]} impact × ${Lb[lk - 1]} likelihood = ${sc} (${b.name})${here.length ? " · " + here.length + " open risk" + (here.length > 1 ? "s" : "") : ""}`}
          aria-label={`${Ib[im - 1]} impact, ${Lb[lk - 1]} likelihood, score ${sc}, ${b.name}, ${here.length} open risks`}
          onClick={() => riskGoReg({ cell: { l: lk, i: im, v: view }, rating: "all", status: "all" })}>{here.length || ""}</button>
      );
    }
  }
  const statusCards = ["Open", "In review", "Accepted", "Closed"].map((s) => (
    <button key={s} className="rstat" onClick={() => riskGoReg({ status: s, rating: "all", cell: null })}><span className="rv">{DATA.risks.filter((r) => r.status === s).length}</span><span className="rl">{s}</span></button>
  ));
  const aboveApp = open.filter((r) => sCur(r) >= 11).length;
  const awaiting = DATA.risks.filter((r) => r.review === "Submitted").length;
  const accepted = DATA.risks.filter((r) => r.acceptance).length;
  const unmapped = open.filter((r) => !(r.linked && r.linked.length)).length;
  const mix: Segment[] = [["Low", "ok"], ["Medium", "warn"], ["High", "high"], ["Extreme", "bad"]].map(([name, tone]) => ({ label: name, value: open.filter((r) => rband(sCur(r)).name === name).length, tone: tone as Segment["tone"] }));
  const today = nowStamp().slice(0, 10);
  const plan = open.filter((r) => r.treat !== "Accept").map((r) => {
    const acts: any[] = r.actions || [];
    const due: string = acts.filter((a) => !a.done && a.due).map((a) => a.due as string).sort()[0] || r.planned || "";
    return { r, due, overdue: !!due && due < today, fromActions: !!(acts.length && !r.planned) };
  }).sort((a, b) => ((a.due || "9999") < (b.due || "9999") ? -1 : 1));

  return (
    <div className="rcaps" data-tour="risk-dash">
      <KpiStrip label="Risk summary">
        <KpiTile label="Open risks" value={open.length} caption={`Not closed or accepted (includes in review); ${DATA.risks.length} on the register`} />
        <KpiTile label="Above appetite (High+)" value={aboveApp} delta={aboveApp ? { tone: "bad", text: "Needs treatment" } : { tone: "good", text: "None" }} caption="Current rating" />
        <KpiTile label="Awaiting approval" value={awaiting} delta={awaiting ? { tone: "watch", text: "Needs a decision" } : undefined} caption="Submitted for review" />
        <KpiTile label="Accepted and valid" value={accepted} caption="Within their expiry" />
        <KpiTile label="No control mapped" value={unmapped} delta={unmapped ? { tone: "watch", text: "Data gap" } : { tone: "good", text: "None" }} caption="Open risks" />
      </KpiStrip>
      <div className="rgrid2">
        <DistBlock open={open} which="cur" title="Current exposure" note="With existing controls in place, before planned treatment completes." />
        <DistBlock open={open} which="res" title="Residual exposure" note="Target exposure after the planned treatment is complete." />
      </div>
      <div className="rgrid2">
        <section className="card" data-tour="risk-heatmap"><div className="c-body">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>Heat map</h3>
            <div className="btngrp">{([["inh", "Inherent"], ["cur", "Current"], ["res", "Residual"]] as [HeatView, string][]).map((h) => (
              <button key={h[0]} className={`fchip ${view === h[0] ? "on" : ""}`} aria-pressed={view === h[0]} onClick={() => setHeat(h[0])}>{h[1]}</button>
            ))}</div>
          </div>
          <div className="heat" style={{ gridTemplateColumns: "auto repeat(5,1fr)" }}>{cells}</div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", fontSize: ".75rem", color: "var(--muted)", marginTop: 10 }}>
            <span>Impact up, likelihood across. Numbers are open risks; colour is the {word} rating of every cell. Outlined cells are at or above appetite ({RISK_APPETITE}). Click a cell to filter.</span>
            <BandLegend fill />
          </div>
        </div></section>
        <section className="card"><div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div><h3 style={{ margin: "0 0 2px" }}>Risk status</h3><p className="sub" style={{ margin: "0 0 10px" }}>Count by workflow status. &ldquo;Open risks&rdquo; above also counts those in review.</p>
            <div className="rstats" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>{statusCards}</div></div>
          <DonutChart title="Current rating of open risks" segments={mix} center={String(open.length)} centerSub="open risks" />
        </div></section>
      </div>
      <div className="rgrid3"><Breakdown open={open} k="cat" title="By category" /><Breakdown open={open} k="team" title="By team" /><Breakdown open={open} k="jur" title="By jurisdiction" /></div>
      <section className="card" data-tour="risk-treatment"><div className="c-body">
        <h3 style={{ margin: "0 0 2px" }}>Treatment plan</h3>
        <p className="sub" style={{ margin: "0 0 10px" }}>Open treatments by earliest action due date. Overdue means the date has passed with the action still open.</p>
        {plan.length ? (
          <Table cols={[{ t: "Risk" }, { t: "Decision" }, { t: "Responsible" }, { t: "Priority" }, { t: "Current" }, { t: "Planned" }, { t: "Status" }]} minw={760}>
            {plan.map((x) => (
              <tr key={x.r.id} className="clickable" {...activate(() => riskOpenDetail(x.r.id))}>
                <td><span className="strong num">{x.r.id}</span> {x.r.title}</td><td>{x.r.treat}</td><td>{x.r.owner}</td><td>{riskPriority(x.r)}</td><td><ScoreChip score={sCur(x.r)} /></td>
                <td style={{ whiteSpace: "nowrap" }}>{x.due ? <>{x.due}{x.fromActions ? <> <span style={{ fontSize: ".6875rem", color: "var(--muted)" }}>(from actions)</span></> : null}</> : "—"}</td>
                <td>{x.overdue ? <Chip cls="bad" icon="alert">Overdue</Chip> : <StatusChip s="In progress" />}</td>
              </tr>
            ))}
          </Table>
        ) : <Empty compact icon="check" title="No open treatments" />}
      </div></section>
    </div>
  );
}
