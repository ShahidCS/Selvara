import { useState } from "react";
import { LayerFoot } from "@/components/shell/LayerProvider";
import type { LayerApi } from "@/components/shell/LayerProvider";
import { bumpData } from "@/lib/store";
import { wsLog } from "@/lib/audit";
import { clampText } from "@/lib/security";
import { getActor } from "@/lib/sod";
import * as svc from "@/services/audits";
import { attempt } from "./util";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const Req = () => <span style={{ color: "var(--bad-ink)" }}>*</span>;
const errStyle = (on: boolean) => ({ color: "var(--bad-ink)", display: on ? "block" : "none" });

/** "Add request" modal (source addPbc / savePbc). `onAdded` switches to the PBC tab. */
export function AddPbcForm({ L, id, onAdded }: { L: LayerApi; id: string; onAdded: () => void }) {
  const [item, setItem] = useState(""); const [owner, setOwner] = useState(getActor().name);
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
  const open = a.findings.filter(svc.isOpenFinding).length;
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

/** Shared small form: one text field + optional severity. Used for information requests, drafted findings and responses. */
function TextForm({ L, label, confirm, help, min, sevs, recLabel, run }: {
  L: LayerApi; label: string; confirm: string; help?: string; min: number; sevs?: string[]; recLabel?: string;
  run: (v: { text: string; sev: string; rec: string }) => Promise<string>;
}) {
  const [text, setText] = useState(""); const [sev, setSev] = useState(sevs ? sevs[1] || sevs[0] : ""); const [rec, setRec] = useState(""); const [err, setErr] = useState("");
  const submit = () => attempt(L, async () => {
    const t = clampText(text, 500);
    if (t.length < min) { setErr(`${label} must be at least ${min} characters.`); return; }
    const m = await run({ text: t, sev, rec: clampText(rec, 500) }); L.closeLayer(); L.toast(m); bumpData();
  });
  return (
    <>
      <div>
        {help ? <p style={{ margin: "0 0 8px" }}>{help}</p> : null}
        <div className="field"><label htmlFor="at-text">{label} <Req /></label><textarea className="input" id="at-text" data-focus rows={3} maxLength={500} style={{ resize: "vertical" }} value={text} onChange={(e) => setText(e.target.value)} aria-invalid={!!err} /></div>
        {sevs ? <div className="field"><label htmlFor="at-sev">Severity</label><select className="select" id="at-sev" value={sev} onChange={(e) => setSev(e.target.value)}>{sevs.map((x) => <option key={x}>{x}</option>)}</select></div> : null}
        {recLabel ? <div className="field"><label htmlFor="at-rec">{recLabel}</label><input className="input" id="at-rec" maxLength={500} value={rec} onChange={(e) => setRec(e.target.value)} /></div> : null}
        <p className="field help" role="alert" style={errStyle(!!err)}>{err}</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={L.closeLayer}>Cancel</button><button className="btn btn-primary" onClick={submit}>{confirm}</button></LayerFoot>
    </>
  );
}
export const openRaiseIr = (L: LayerApi, id: string, name: string) => L.openModal("Raise information request, " + name,
  <TextForm L={L} label="What do you need?" confirm="Raise request" min={5} help="Management responds to information requests. You cannot change the organisation's own records." run={async (v) => { await svc.raiseInformationRequest(id, v.text); return "Information request raised"; }} />);
export const openRespondIr = (L: LayerApi, id: string, rid: string) => L.openModal("Respond, " + rid,
  <TextForm L={L} label="Response" confirm="Send response" min={5} run={async (v) => { await svc.respondInformationRequest(id, rid, v.text); return "Response sent"; }} />);
export const openDraftFinding = (L: LayerApi, id: string, name: string) => L.openModal("Draft finding, " + name,
  <TextForm L={L} label="Finding" confirm="Save draft" min={10} sevs={svc.FINDING_SEVS} recLabel="Recommendation" help="A draft is not an issue. Management accepts it into an issue or declines it with a reason." run={async (v) => { await svc.draftFinding(id, { title: v.text, sev: v.sev, rec: v.rec }); return "Finding drafted for management"; }} />);
export const openRejectFinding = (L: LayerApi, id: string, fid: string) => L.openModal("Decline finding, " + fid,
  <TextForm L={L} label="Reason" confirm="Decline finding" min={10} run={async (v) => { await svc.rejectFinding(id, fid, v.text); return "Draft finding declined"; }} />);
export const openEndAccess = (L: LayerApi, id: string, needReason: boolean) => L.openModal("Complete & end auditor access",
  <TextForm L={L} label={needReason ? "Reason for closing with open findings or outstanding requests" : "Closing note (optional)"} confirm="Complete engagement" min={needReason ? 10 : 0} help="Completes the engagement, locks it and revokes the external auditor's read access. Recorded in the audit log." run={async (v) => { await svc.endAuditorAccess(id, v.text); return "Auditor access ended; audit completed"; }} />);
