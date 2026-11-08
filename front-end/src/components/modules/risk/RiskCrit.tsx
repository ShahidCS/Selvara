/* Scoring criteria tab (source renderRiskCrit, lines 2712-2726). Static reference content. */
import { Table } from "@/components/ui";
import { ACCEPT_AUTH, Ib, Lb, RBANDS, heatEdge, heatFill, heatInk, rband } from "@/lib/risk";
import { RatingPill } from "./RiskBits";

const Ldesc = ["Rare — not expected (once in 5+ years)", "Unlikely — could happen (once in 2–5 years)", "Possible — might happen (yearly)", "Likely — expected (several times a year)", "Almost certain — recurring (monthly or more)"];
const Idesc = ["Insignificant — negligible, absorbed by normal operations", "Minor — limited, short recovery, no external impact", "Moderate — notable disruption, some customer/regulatory interest", "Major — serious breach, regulatory reporting, customer harm", "Severe — critical, existential or systemic, mandatory disclosure"];
const CRIT_ACT: Record<string, string> = { Low: "Accept within appetite; monitor on normal cycle.", Medium: "Treat on the normal cycle; owner tracks to residual.", High: "Treat with priority; owner review and dated plan.", Extreme: "Immediate executive attention; do not operate without a plan." };

const Scale = ({ title, arr }: { title: string; arr: string[] }) => (
  <section className="card"><div className="c-body"><h3 style={{ margin: "0 0 8px" }}>{title}</h3>
    <Table cols={[{ t: "Level" }, { t: "Definition" }]}>{arr.map((d, i) => (
      <tr key={i}><td className="strong num">{i + 1} · {d.split(" — ")[0]}</td><td style={{ fontSize: 13 }}>{d.split(" — ")[1] || ""}</td></tr>
    ))}</Table></div></section>
);

export default function RiskCrit() {
  const cells: React.ReactNode[] = [<div key="o" />, ...Lb.map((x) => <div key={"l" + x} className="ax">{x}</div>)];
  for (let im = 5; im >= 1; im--) {
    cells.push(<div key={"i" + im} className="ax">{Ib[im - 1]}</div>);
    for (let lk = 1; lk <= 5; lk++) {
      const sc = im * lk, b = rband(sc);
      cells.push(<div key={`${im}-${lk}`} className="hc" style={{ background: heatFill(b), color: heatInk(b), cursor: "default", ...heatEdge(b, sc) }}><span>{sc}</span></div>);
    }
  }
  return (
    <div className="rcaps">
      <section className="card"><div className="c-body"><h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Scoring criteria</h2>
        <p className="sub" style={{ margin: "4px 0 0" }}>ISO/IEC 27005:2022 method. Score = likelihood × impact on a 5×5 scale, rated Low (≤5), Medium (6–10), High (11–19) or Extreme (≥20).</p></div></section>
      <div className="rgrid2"><Scale title="Likelihood scale" arr={Ldesc} /><Scale title="Impact scale" arr={Idesc} /></div>
      <div className="rgrid2">
        <section className="card"><div className="c-body"><h3 style={{ margin: "0 0 2px" }}>Risk matrix (likelihood × impact)</h3>
          <p className="sub" style={{ margin: "0 0 10px" }}>Each cell shows the score; colour is its rating band. Impact up, likelihood across.</p>
          <div className="heat" style={{ gridTemplateColumns: "auto repeat(5,1fr)" }}>{cells}</div></div></section>
        <section className="card"><div className="c-body"><h3 style={{ margin: "0 0 4px" }}>Risk acceptance criteria</h3>
          {RBANDS.map((b) => (
            <div key={b.name} style={{ display: "flex", gap: 16, alignItems: "flex-start", padding: "12px 0", borderTop: "1px solid var(--line)" }}>
              <div style={{ flex: "0 0 104px", display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}><RatingPill b={b} /><span className="num" style={{ fontSize: 12, color: "var(--muted)" }}>Score {b.lo}–{b.hi}</span></div>
              <div style={{ flex: "1 1 auto", minWidth: 0, fontSize: 13 }}><div style={{ color: "var(--ink-2)", lineHeight: 1.5 }}>{CRIT_ACT[b.name]}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Lowest authority that can accept: <strong>{ACCEPT_AUTH[b.name]}</strong></div></div>
            </div>
          ))}
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>Risk appetite: the organisation targets residual exposure at Medium or below; High and Extreme residual risks require a dated treatment plan and, if accepted, time-bound sign-off.</div>
        </div></section>
      </div>
    </div>
  );
}
