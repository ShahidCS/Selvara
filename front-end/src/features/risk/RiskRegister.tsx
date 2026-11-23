/* Risk register tab (source renderRiskReg, lines 2559-2603). */
import { riskNextStep } from "@/lib/insights";
import { Empty, StatusChip, Table, activate } from "@/components/ui";
import { DATA } from "@/lib/data";
import { Ib, Lb, RBANDS, RISK_STATUSES, riskOpen, riskPriority, riskRatingOf, sCur, sInh, sRes } from "@/lib/risk";
import { useModState } from "@/lib/store";
import { myMemberId } from "@/components/kit/MemberSelect";
import { wsMeta } from "@/services/ws";
import { API_ON } from "@/lib/rbac";
import { K_RF, K_SEL, RF_INIT, RiskFilter, riskClearFilters, riskOpenDetail } from "./nav";
import { ScoreBars } from "./RiskBits";
import PendingImports from "./PendingImports";
import RiskDetail from "./RiskDetail";

function Sel({ id, val, opts, label, set }: { id: keyof RiskFilter; val: string; opts: string[]; label: string; set: (v: string) => void }) {
  return (
    <label className="field" style={{ flex: "1 1 130px", margin: 0 }}><span className="flab">{label}</span>
      <select className="select" id={`rf-${id}`} value={val} onChange={(e) => set(e.target.value)}>
        <option value="all">All</option>{opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select></label>
  );
}

export default function RiskRegister() {
  const [rfRaw, setRf] = useModState<RiskFilter>(K_RF, RF_INIT);
  const [sel] = useModState<string | null>(K_SEL, null);
  const RF = rfRaw;
  const patch = (p: Partial<RiskFilter>) => setRf({ ...RF, ...p });
  const uniq = (f: (r: { cat: string; team: string; jur: string }) => string) => [...new Set(DATA.risks.map(f))].sort();
  const cats = uniq((r) => r.cat), teams = uniq((r) => r.team), jurs = uniq((r) => r.jur);
  const q = (RF.q || "").toLowerCase();
  const list = DATA.risks.filter((r) => {
    if (RF.rating !== "all" && riskRatingOf(r) !== RF.rating) return false;
    if (RF.status !== "all" && r.status !== RF.status) return false;
    if (RF.cat !== "all" && r.cat !== RF.cat) return false;
    if (RF.team !== "all" && r.team !== RF.team) return false;
    if (RF.jur !== "all" && r.jur !== RF.jur) return false;
    if (RF.mine && (API_ON ? r.ownerId !== myMemberId(wsMeta.get().members) : !/Avery/.test(r.owner))) return false; // production: the signed-in person; demo: the persona (synthetic surname)
    if (RF.cell) {
      if (!riskOpen(r)) return false;
      const lk = RF.cell.v === "inh" ? r.l : RF.cell.v === "res" ? r.rl : r.cl || r.l;
      const ik = RF.cell.v === "inh" ? r.i : RF.cell.v === "res" ? r.ri : r.ci || r.i;
      if (lk !== RF.cell.l || ik !== RF.cell.i) return false;
    }
    if (q && !(r.id + " " + r.title + " " + r.cat + " " + r.team + " " + (r.desc || "")).toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => sCur(b) - sCur(a));
  const hasFilter = RF.rating !== "all" || RF.status !== "all" || RF.cat !== "all" || RF.team !== "all" || RF.jur !== "all" || RF.mine || RF.cell || RF.q;
  const cellOk = RF.cell && RF.cell.i >= 1 && RF.cell.i <= 5 && RF.cell.l >= 1 && RF.cell.l <= 5;
  const cellLabel = cellOk && RF.cell ? `Heat cell ${Ib[RF.cell.i - 1]}×${Lb[RF.cell.l - 1]}` : "";

  return (
    <>
      <PendingImports />
      <section className="card"><div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div data-tour="risk-filters" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
          <label className="field" style={{ flex: "2 1 220px", margin: 0 }}><span className="flab">Search</span>
            <input className="input" type="search" maxLength={100} value={RF.q} onChange={(e) => patch({ q: e.target.value })} placeholder="ID, title, threat, team" /></label>
          <Sel id="rating" val={RF.rating} opts={RBANDS.map((b) => b.name)} label="Rating" set={(v) => patch({ rating: v })} />
          <Sel id="status" val={RF.status} opts={RISK_STATUSES} label="Status" set={(v) => patch({ status: v })} />
          <Sel id="cat" val={RF.cat} opts={cats} label="Category" set={(v) => patch({ cat: v })} />
          <Sel id="team" val={RF.team} opts={teams} label="Team" set={(v) => patch({ team: v })} />
          <Sel id="jur" val={RF.jur} opts={jurs} label="Jurisdiction" set={(v) => patch({ jur: v })} />
          <button className={`fchip ${RF.mine ? "on" : ""}`} aria-pressed={RF.mine} onClick={() => patch({ mine: !RF.mine })}>Only mine</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "var(--ink-2)" }}><span className="strong">{list.length}</span> of {DATA.risks.length} risks</span>
          {RF.cell ? <button className="fchip on" onClick={() => patch({ cell: null })}>{cellLabel} ×</button> : null}
          {hasFilter ? <button className="btn btn-ghost sm" onClick={riskClearFilters}>Clear filters</button> : null}
        </div>
        <div className="c-body flush" data-tour="risk-table" style={{ padding: 0 }}>
          {list.length ? (
            <Table cols={[{ t: "ID" }, { t: "Risk" }, { t: "Team" }, { t: "Jurisdiction" }, { t: "Inherent" }, { t: "Current" }, { t: "Residual" }, { t: "Priority" }, { t: "Treatment" }, { t: "Status" }, { t: "Suggested next step" }]} minw={1140}>
              {list.map((r) => (
                <tr key={r.id} className={`clickable ${sel === r.id ? "sel" : ""}`} aria-selected={sel === r.id} {...activate(() => riskOpenDetail(r.id))}>
                  <td className="strong num" style={{ whiteSpace: "nowrap" }}>{r.id}</td>
                  <td><div className="strong">{r.title}</div><div style={{ fontSize: 11.5, color: "var(--muted)" }}>{r.cat}{r.parent ? " · " + r.parent.id : ""}{r.imported ? <> · <span style={{ color: "var(--accent-ink)", fontWeight: 600 }}>Imported</span></> : null}</div></td>
                  <td style={{ fontSize: 12 }}>{r.team}</td><td style={{ fontSize: 12 }}>{r.jur}</td>
                  <td><ScoreBars score={sInh(r)} /></td><td><ScoreBars score={sCur(r)} /></td><td><ScoreBars score={sRes(r)} /></td>
                  <td><span className="tag">{riskPriority(r)}</span></td><td style={{ fontSize: 12 }}>{r.treat}</td><td><StatusChip s={r.status} /></td>
                  <td style={{ fontSize: 12 }}>{riskNextStep(r) || <span style={{ color: "var(--faint)" }}>None</span>}</td>
                </tr>
              ))}
            </Table>
          ) : <Empty icon="search" title="No risks match this view" />}
        </div>
      </div></section>
      <div id="riskDetail">{sel ? <RiskDetail id={sel} /> : null}</div>
    </>
  );
}
