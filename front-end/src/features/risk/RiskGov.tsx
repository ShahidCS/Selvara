/* Governance tab (source renderRiskGov + riskSnapshot, lines 2740-2768). Snapshots: riskCanApprove (admin). */
import { Chip } from "@/components/ui";
import { useLayer } from "@/components/shell/LayerProvider";
import { DATA } from "@/lib/data";
import { wsLog } from "@/lib/audit";
import { RISK_ENT, RISK_SNAPSHOTS, expiresSoon, riskCanApprove, riskFindR, riskOpen, sCur, sRes, todayIso } from "@/lib/risk";
import { bumpData, useApp } from "@/lib/store";
import { API_ON } from "@/lib/rbac";
import { downloadText } from "@/lib/format";
import { safeFileName } from "@/lib/security";
import { attempt } from "@/features/issues";
import * as svc from "@/features/risk/services/risks";
import { riskOpenDetail } from "./nav";
import { ScoreChip } from "./RiskBits";

const row: React.CSSProperties = { font: "inherit", textAlign: "left", display: "flex", flexDirection: "column", gap: 3, padding: "10px 0", borderTop: "1px solid var(--line)", background: "none", borderLeft: 0, borderRight: 0, borderBottom: 0, cursor: "pointer", color: "var(--ink)", width: "100%" };

export default function RiskGov() {
  const L = useLayer();
  const admin = riskCanApprove(useApp((s) => s.role));
  const snap = (scope: string) => attempt(L, async () => {
    const res = await svc.takeSnapshot(scope); if (!res.ok) { L.toast(res.msg); return; }
    wsLog("risk.register.snapshot", res.count + " risks (" + res.scope + "), hash " + res.hash, "Risk"); L.toast("Snapshot taken (" + res.count + " risks)"); bumpData();
  });
  const download = (id: string) => attempt(L, async () => { downloadText(safeFileName(`risk-snapshot-${id}.json`), await svc.snapshotContent(id)); L.toast("Snapshot downloaded"); });
  const accs = DATA.risks.filter((r) => r.acceptance);
  /* production: the last review date is the newest one on the register, not today; the register owner is not recorded yet */
  const lastReviewed = API_ON ? DATA.risks.map((r) => String(r.reviewed || "")).sort().pop() || "—" : todayIso();
  const meta: [string, string | number][] = [["Register", "Information Security Risk Register"], ["Method", "ISO/IEC 27005:2022"], ["Scale", "5 × 5 (likelihood × impact)"], ...(API_ON ? [] : [["Owner", "J. Avery, CISO"] as [string, string]]), ["Risks", DATA.risks.length], ["Open", DATA.risks.filter(riskOpen).length], ["Last reviewed", lastReviewed], ["Appetite", "Residual Medium or below"]];
  return (
    <div className="rcaps">
      <section className="card"><div className="c-body"><h3 style={{ margin: "0 0 10px" }}>Register details</h3>
        <div className="rgrid-meta">{meta.map((x) => <div key={x[0]} style={{ background: "var(--surface-2)", borderRadius: 10, padding: "10px 12px" }}><div style={{ fontSize: 12, color: "var(--muted)" }}>{x[0]}</div><div style={{ fontSize: 13, fontWeight: 500 }}>{String(x[1])}</div></div>)}</div></div></section>
      <section className="card"><div className="c-body"><h3 style={{ margin: "0 0 2px" }}>Enterprise risks</h3>
        <p className="sub" style={{ margin: "0 0 10px" }}>Each scenario rolls up to one enterprise risk; the enterprise view shows the highest current exposure among its scenarios.</p>
        {!RISK_ENT.length ? <p className="field help" style={{ margin: 0 }}>No enterprise risks are defined for this register yet.</p> : null}
        <div className="rgrid3">{RISK_ENT.map((e) => {
          const kids = e.kids.map(riskFindR).filter(Boolean) as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
          const top = kids.length ? Math.max(...kids.map(sCur)) : 0;
          return (
            <div key={e.id} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style={{ fontSize: 12, color: "var(--muted)" }}>{e.id} · Owner {e.owner}</span><ScoreChip score={top} label="Top" /></div>
              <div className="strong">{e.title}</div>
              {kids.map((k) => (
                <button key={k.id} className="linkbtn" onClick={() => riskOpenDetail(k.id)} style={{ font: "inherit", display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)", cursor: "pointer", color: "var(--ink)" }}>
                  <span style={{ minWidth: 0, fontSize: 13, textAlign: "left" }}><span className="num strong">{k.id}</span> {k.title}</span><ScoreChip score={sCur(k)} />
                </button>
              ))}
            </div>
          );
        })}</div></div></section>
      <div className="rgrid2">
        <section className="card"><div className="c-body">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}><h3 style={{ margin: 0 }}>Register snapshots</h3>
            {admin ? <div className="btngrp"><button className="btn btn-primary sm" onClick={() => snap("approved")}>Snapshot approved</button><button className="btn btn-secondary sm" onClick={() => snap("all")}>Snapshot all</button></div> : null}</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>{API_ON ? "Locked point-in-time copies of the register, sealed with a SHA-256 hash over every score, decision, date and status. Download one to keep it with your audit evidence." : "Locked point-in-time copies with a content hash over every score, decision, date and status. Snapshots taken inside an audit window are shared with the auditor automatically."}</div>
          {!admin ? <p className="field help" style={{ margin: "6px 0 0" }}>Read-only: only a company admin can take snapshots.</p> : null}
          {RISK_SNAPSHOTS.length ? RISK_SNAPSHOTS.map((s) => (
            <div key={s.id} style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, padding: "10px 0", borderTop: "1px solid var(--line)" }}>
              <span><span className="num strong">{s.id}</span> <span style={{ fontSize: 13 }}>{s.at} · {s.count} risks · {s.scope}</span><span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{s.sha256 ? "SHA-256 " : "Hash "}{s.hash} · by {s.by}</span></span>
              <span style={{ display: "flex", gap: 6, alignItems: "center" }}>{API_ON && admin ? <button className="btn btn-ghost sm" onClick={() => download(s.id)}>Download</button> : null}{s.shared ? <Chip cls="info" icon="check">Shared with auditor</Chip> : <Chip cls="neutral" icon="dot">Not in audit window</Chip>}</span>
            </div>
          )) : <p className="field help" style={{ margin: "6px 0 0" }}>No snapshots taken yet.</p>}
        </div></section>
        <section className="card"><div className="c-body"><h3 style={{ margin: "0 0 2px" }}>Risk acceptances</h3>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Acceptance lasts at most 12 months and names an authority at or above the level the rating requires. Those ending within 60 days are highlighted.</div>
          {accs.length ? accs.map((r) => (
            <button key={r.id} className="linkbtn" onClick={() => riskOpenDetail(r.id)} style={row}>
              <span style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}><span className="strong">{r.id} {r.title}</span>{expiresSoon(r.acceptance.until) ? <Chip cls="warn" icon="clock">Expires &lt;60d</Chip> : <Chip cls="ok" icon="check">Valid</Chip>}</span>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>By {r.acceptance.by}{r.acceptance.board ? " (Board approved " + r.acceptance.board.ref + ", " + r.acceptance.board.date + ")" : ""} · residual {sRes(r)} · valid until {r.acceptance.until || "—"}</span>
            </button>
          )) : <p className="field help" style={{ margin: 0 }}>No accepted risks.</p>}
        </div></section>
      </div>
    </div>
  );
}
