/* Interested parties tab (source renderRiskIP + riskLinkParty/UnlinkParty/AddParty2, lines 2729-2737). Edit gate: riskCanEdit. */
import { useState } from "react";
import { Icon, Table, SelectList } from "@/components/ui";
import { LayerFoot, useLayer } from "@/components/shell/LayerProvider";
import { DATA } from "@/lib/data";
import { wsLog } from "@/lib/audit";
import { RISK_PARTIES, riskCanEdit } from "@/lib/risk";
import { bumpData, useApp } from "@/lib/store";
import { attemptR as attempt } from "./util";
import * as svc from "@/features/risk/services/risks";
import { riskOpenDetail } from "./nav";

/** Pick one risk to link (a listbox in a short dialog, instead of a select styled as a button). */
function LinkRiskForm({ options, close, onLink }: { options: { id: string; title: string }[]; close: () => void; onLink: (id: string) => void }) {
  const [sel, setSel] = useState(options[0]?.id || "");
  return (
    <>
      <div className="field"><label htmlFor="rp-link">Risk</label><SelectList className="select" id="rp-link" data-focus value={sel} onChange={(e) => setSel(e.target.value)}>{options.map((o) => <option key={o.id} value={o.id}>{o.id} · {o.title}</option>)}</SelectList></div>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={!sel} onClick={() => sel && onLink(sel)}>Link</button></LayerFoot>
    </>
  );
}

export default function RiskParties() {
  const L = useLayer();
  const admin = riskCanEdit(useApp((s) => s.role));
  const [party, setParty] = useState(""); const [req, setReq] = useState(""); const [loc, setLoc] = useState("");
  const link = (pi: number, rid: string) => attempt(L, async () => {
    if (!rid) return;
    const res = await svc.linkParty(pi, rid); if (!res.ok) { L.toast(res.msg, false); return; }
    wsLog("risk.party.linked", res.party + " ← " + rid, "Risk"); bumpData();
  });
  const unlink = (pi: number, rid: string) => attempt(L, async () => {
    const res = await svc.unlinkParty(pi, rid); if (!res.ok) { L.toast(res.msg, false); return; }
    wsLog("risk.party.unlinked", res.party + " ✕ " + rid, "Risk"); bumpData();
  });
  const add = () => attempt(L, async () => {
    if (!party.trim()) { L.toast("Party name required"); return; }
    const res = await svc.addParty({ party, req, loc }); if (!res.ok) { L.toast(res.msg, false); return; }
    wsLog("risk.party.added", res.party, "Risk"); L.toast("Party added"); setParty(""); setReq(""); setLoc(""); bumpData();
  });
  return (
    <div className="rcaps">
      <section className="card"><div className="c-body">
        <div style={{ marginBottom: 10 }}><h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Interested parties</h2>
          <p className="sub" style={{ margin: "4px 0 0" }}>Parties whose requirements the register must address (ISO/IEC 27001 clause 4.2), with the risks that affect them.</p></div>
        <Table cols={[{ t: "Interested party" }, { t: "Requirement or expectation" }, { t: "Location" }, { t: "Linked risks" }]} minw={820}>
          {RISK_PARTIES.map((p, pi) => (
            <tr key={pi}>
              <td className="strong">{p.party}</td><td style={{ fontSize: 13, color: "var(--ink-2)" }}>{p.req}</td><td>{p.loc}</td>
              <td><div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                {p.links.length ? p.links.map((l) => (
                  <span key={l} style={{ display: "inline-flex", gap: 2, alignItems: "center" }}>
                    <button className="tag num" style={{ cursor: "pointer" }} onClick={() => riskOpenDetail(l)}>{l}</button>
                    {admin ? <button className="btn btn-ghost sm" onClick={() => unlink(pi, l)} aria-label={`Unlink ${l} from ${p.party}`} title={`Unlink ${l}`} style={{ minWidth: 24, minHeight: 24, width: 24, height: 24, padding: 0, justifyContent: "center" }}><Icon name="x" /></button> : null}
                  </span>
                )) : <span style={{ color: "var(--muted)", fontSize: 12 }}>None</span>}
                {admin ? (
                  <button className="btn btn-ghost sm" aria-label={`Link a risk to ${p.party}`} disabled={!DATA.risks.some((r) => !p.links.includes(r.id))}
                    onClick={() => L.openModal(`Link a risk to ${p.party}`, (close) => <LinkRiskForm options={DATA.risks.filter((r) => !p.links.includes(r.id)).map((r) => ({ id: String(r.id), title: String(r.title) }))} close={close} onLink={(rid) => { close(); link(pi, rid); }} />)}><Icon name="plus" />Link risk</button>
                ) : null}
              </div></td>
            </tr>
          ))}
        </Table>
        {!admin ? <p className="field help" style={{ margin: "10px 0 0" }}>Read-only: your role cannot edit interested parties.</p> : null}
      </div></section>
      {admin ? (
        <section className="card"><div className="c-body" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
          <label className="field" style={{ flex: "1 1 180px", margin: 0 }}><span className="flab">Interested party</span><input className="input" id="rp-party" maxLength={200} value={party} onChange={(e) => setParty(e.target.value)} /></label>
          <label className="field" style={{ flex: "2 1 260px", margin: 0 }}><span className="flab">Requirement or expectation</span><input className="input" id="rp-req" maxLength={500} value={req} onChange={(e) => setReq(e.target.value)} /></label>
          <label className="field" style={{ flex: "0 1 140px", margin: 0 }}><span className="flab">Location</span><input className="input" id="rp-loc" maxLength={100} placeholder="Global" value={loc} onChange={(e) => setLoc(e.target.value)} /></label>
          <button className="btn btn-primary sm" onClick={add}><Icon name="plus" />Add party</button>
        </div></section>
      ) : null}
    </div>
  );
}
