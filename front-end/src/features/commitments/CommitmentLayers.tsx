import { adminLog } from "@/lib/adminAudit";
import { useState } from "react";
import { Table } from "@/components/ui";
import { LayerFoot } from "@/hooks/useLayer";
import type { LayerApi } from "@/components/shell/LayerProvider";
import { wsLog } from "@/lib/audit";
import { bumpData } from "@/lib/store";
import { clampText } from "@/lib/security";
import * as svc from "@/features/commitments/services/commitments";
import { attempt } from "@/components/kit/sodKit";

const Req = () => <span style={{ color: "var(--bad-ink)" }}>*</span>;

/* ---- start incident (source incidentStart / incidentDoStart) ---- */
export function StartIncidentForm({ L }: { L: LayerApi }) {
  const [sum, setSum] = useState("");
  const submit = () => attempt(L, async () => {
    const s = clampText(sum, 200);
    await svc.startIncident(s);
    wsLog("incident.started", s || "incident drill", "Policy");
    adminLog("incident.started", s || "incident drill", { categories: ["Incident"], basis: "Legal obligation" });
    L.closeLayer(); L.toast("Incident clock started"); bumpData();
  });
  return (
    <>
      <div>
        <p style={{ margin: "0 0 8px" }}>Starting an incident begins the breach-notification clock and surfaces active customer commitments. Use for drills or real events.</p>
        <div className="field"><label htmlFor="in-sum">Short summary</label><input className="input" id="in-sum" data-focus maxLength={200} placeholder="e.g. Suspected data exposure in analytics store" value={sum} onChange={(e) => setSum(e.target.value)} /></div>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={() => L.closeLayer()}>Cancel</button><button className="btn btn-danger" onClick={submit}>Start incident clock</button></LayerFoot>
    </>
  );
}

/* ---- contract analysis (source commAnalyse) ---- */
const FINDINGS: [string, string][] = [["Breach notice", "⚠ One MSA specifies 72h, stricter standard is 48h"], ["Liability cap", "OK, within policy"], ["Audit rights", "⚠ Globex requires annual on-site, needs scheduling"], ["Data residency", "OK, in-region"]];
export async function openAnalysis(L: LayerApi) {
  L.openModal("Contract analysis", (
    <>
      <p style={{ margin: "0 0 10px" }}>Automated review of imported contracts against your standard terms. Synthetic demo result.</p>
      <Table cols={[{ t: "Clause" }, { t: "Finding" }]}>
        {FINDINGS.map((r) => <tr key={r[0]}><td className="strong">{r[0]}</td><td>{r[1]}</td></tr>)}
      </Table>
      <p className="field help" style={{ marginTop: 10 }}>Draft analysis. Legal review required before relying on these results.</p>
    </>
  ), <button className="btn btn-primary" onClick={() => L.closeLayer()}>Done</button>);
  try { await svc.runContractAnalysis(); } catch { /* demo: analysis is static */ }
  wsLog("contract.analysis.run", "standard-terms comparison", "Policy");
}

/* ---- import contract (source commImport / commDoImport) ---- */
export function ImportContractForm({ L }: { L: LayerApi }) {
  const [name, setName] = useState(""); const [detail, setDetail] = useState(""); const [err, setErr] = useState(false);
  const submit = () => attempt(L, async () => {
    const n = clampText(name, 160);
    if (!n) { setErr(true); return; }
    await svc.importContract(n, clampText(detail, 200));
    wsLog("contract.imported", n, "Policy");
    L.closeLayer(); L.toast("Contract imported"); bumpData();
  });
  return (
    <>
      <div>
        <div className="field"><label htmlFor="ct-name">Contract name <Req /></label><input className="input" id="ct-name" data-focus maxLength={160} placeholder="e.g. ACME MSA 2026" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label htmlFor="ct-detail">Key commitment</label><input className="input" id="ct-detail" maxLength={200} placeholder="e.g. 99.95% uptime" value={detail} onChange={(e) => setDetail(e.target.value)} /></div>
        <p className="field help" id="ct-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>Contract name is required.</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={() => L.closeLayer()}>Cancel</button><button className="btn btn-primary" onClick={submit}>Import &amp; analyse</button></LayerFoot>
    </>
  );
}
