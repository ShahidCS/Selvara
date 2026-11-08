import { useState } from "react";
import { LayerFoot } from "@/components/shell/LayerProvider";
import type { LayerApi } from "@/components/shell/LayerProvider";
import { bumpData } from "@/lib/store";
import { wsLog } from "@/lib/audit";
import { clampText } from "@/lib/security";
import * as svc from "@/services/audits";
import { attempt } from "./util";

/* eslint-disable @typescript-eslint/no-explicit-any */
const Req = () => <span style={{ color: "var(--bad-ink)" }}>*</span>;
const errStyle = (on: boolean) => ({ color: "var(--bad-ink)", display: on ? "block" : "none" });

/** "New audit" modal (source newAudit / saveAudit). */
export function NewAuditForm({ L, go }: { L: LayerApi; go: (to: string) => void }) {
  const [name, setName] = useState(""); const [fw, setFw] = useState(svc.AUDIT_FWS[0]); const [auditor, setAuditor] = useState(""); const [scope, setScope] = useState("");
  const [err, setErr] = useState(false);
  const submit = () => attempt(L, async () => {
    const n = clampText(name, 120);
    if (!n) { setErr(true); return; }
    const { id } = await svc.createAudit({ name: n, fw: svc.AUDIT_FWS.includes(fw) ? fw : svc.AUDIT_FWS[0], auditor: clampText(auditor, 120), scope: clampText(scope, 500) });
    wsLog("audit.created", n, "Audit"); L.closeLayer(); L.toast("Audit created"); bumpData(); go("/ws/audits/" + id);
  });
  return (
    <>
      <div>
        <div className="field"><label htmlFor="na-name">Audit name <Req /></label><input className="input" id="na-name" data-focus placeholder="e.g. PCI DSS readiness" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={err} aria-describedby={err ? "na-err" : undefined} /></div>
        <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div className="field"><label htmlFor="na-fw">Framework</label><select className="select" id="na-fw" value={fw} onChange={(e) => setFw(e.target.value)}>{svc.AUDIT_FWS.map((f) => <option key={f}>{f}</option>)}</select></div>
          <div className="field"><label htmlFor="na-auditor">Auditor</label><input className="input" id="na-auditor" placeholder="e.g. Internal Audit" maxLength={120} value={auditor} onChange={(e) => setAuditor(e.target.value)} /></div>
        </div>
        <div className="field"><label htmlFor="na-scope">Scope</label><input className="input" id="na-scope" placeholder="What this audit covers" maxLength={500} value={scope} onChange={(e) => setScope(e.target.value)} /></div>
        <p className="field help" id="na-err" role={err ? "alert" : undefined} style={errStyle(err)}>Audit name is required.</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={L.closeLayer}>Cancel</button><button className="btn btn-primary" onClick={submit}>Create audit</button></LayerFoot>
    </>
  );
}

/** "Add request" modal (source addPbc / savePbc). `onAdded` switches to the PBC tab. */
export function AddPbcForm({ L, id, onAdded }: { L: LayerApi; id: string; onAdded: () => void }) {
  const [item, setItem] = useState(""); const [owner, setOwner] = useState("J. Avery");
  const [err, setErr] = useState(false);
  const submit = () => attempt(L, async () => {
    const it = clampText(item, 300);
    if (!it) { setErr(true); return; }
    const a = svc.findAudit(id); if (!a) return;
    await svc.addPbc(id, { item: it, owner: clampText(owner, 80) });
    wsLog("audit.pbc.added", a.name + ": " + it, "Audit"); L.closeLayer(); L.toast("Request added"); onAdded(); bumpData();
  });
  return (
    <>
      <div>
        <div className="field"><label htmlFor="pbc-item">Request <Req /></label><input className="input" id="pbc-item" data-focus placeholder="e.g. Access review export" maxLength={300} value={item} onChange={(e) => setItem(e.target.value)} aria-invalid={err} aria-describedby={err ? "pbc-err" : undefined} /></div>
        <div className="field"><label htmlFor="pbc-owner">Owner</label><input className="input" id="pbc-owner" placeholder="e.g. O. Hart" maxLength={80} value={owner} onChange={(e) => setOwner(e.target.value)} /></div>
        <p className="field help" id="pbc-err" role={err ? "alert" : undefined} style={errStyle(err)}>Request description is required.</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={L.closeLayer}>Cancel</button><button className="btn btn-primary" onClick={submit}>Add request</button></LayerFoot>
    </>
  );
}

/** "Audit report" summary modal body (source auditReport). Snapshot taken when opened, as in the source. */
export function AuditReportBody({ id }: { id: string }) {
  const a = svc.findAudit(id);
  if (!a) return null;
  const open = a.findings.filter((f: any) => f.status !== "Closed").length;
  return (
    <div style={{ fontSize: 13, lineHeight: 1.6 }}>
      <div className="sectitle" style={{ marginTop: 0 }}>Summary</div>
      <dl className="meta-grid">
        <dt>Framework</dt><dd>{a.fw}</dd><dt>Auditor</dt><dd>{a.auditor}</dd><dt>Stage</dt><dd>{a.stage}</dd><dt>Scope</dt><dd>{a.scope}</dd>
        <dt>Requests received</dt><dd>{a.pbc.filter((p: any) => p.status === "Received").length} of {a.pbc.length}</dd>
        <dt>Tests run</dt><dd>{a.tests.length} ({a.tests.filter((t: any) => t.result === "Pass").length} pass, {a.tests.filter((t: any) => t.result === "Exception").length} exception)</dd>
        <dt>Open findings</dt><dd>{open}</dd>
      </dl>
      <p className="field help" style={{ marginTop: 10 }}>Draft only. Compliance outputs require review by qualified compliance, legal or risk personnel before use.</p>
    </div>
  );
}
