import { SelectList } from "@/components/ui";
import { Fragment, useState } from "react";
import { LayerFoot } from "@/components/shell/LayerProvider";
import { useLayer } from "@/hooks/useLayer";
import { sodMessage } from "@/lib/approvalFlow";
import { CUSTOMERS, TENANT_ADMINS } from "@/lib/platform";
import { SOD } from "@/lib/sod";
import { setModState } from "@/lib/store";
import * as svc from "@/services/mfa";
import * as ppl from "@/services/people";

const CHECKS_MSG = "Confirm all three identity checks first.";

/** Shared body for admin-level and member-level resets (SOD_MATRIX section 4): 3 identity checks, ticket, reason, named approver, effects text. */
function ResetFormBody({ intro, facts, approvers, submit, close }: {
  intro: React.ReactNode; facts: [string, string][]; approvers: string[]; submit: (f: svc.ResetFields) => Promise<string>; close: () => void;
}) {
  const L = useLayer();
  const [reason, setReason] = useState(svc.MFA_REASONS[0]); const [text, setText] = useState(""); const [ticket, setTicket] = useState("");
  const [approver, setApprover] = useState(approvers[0] || "");
  const [checks, setChecks] = useState({ callback: false, sponsor: false, idCheck: false });
  const [err, setErr] = useState("");
  const checksErr = err === CHECKS_MSG;
  const go = async () => {
    setErr("");
    if (!checks.callback || !checks.sponsor || !checks.idCheck) { setErr(CHECKS_MSG); document.getElementById("mfaChk" + svc.MFA_CHECKS.find((c) => !checks[c.key])!.key)?.focus(); return; }
    try { const msg = await submit({ reason, reasonText: text, ticket: ticket.trim().toUpperCase(), approver, checks }); close(); L.toast(msg); }
    catch (e) { setErr(sodMessage(e, "Could not raise the reset")); }
  };
  return (
    <>
      <p className="field help" style={{ marginBottom: 12 }}>{intro}</p>
      <dl className="meta-grid lstart" style={{ marginBottom: 12 }}>{facts.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>
      <div className="sectitle" style={{ marginTop: 0 }}>Effects when approved</div>
      <ul style={{ margin: "0 0 12px", paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6 }}>{svc.MFA_EFFECTS.map((x) => <li key={x}>{x}</li>)}</ul>
      <fieldset style={{ border: 0, margin: "0 0 14px", padding: 0, minWidth: 0 }} aria-describedby={checksErr ? "mfaErr" : undefined}>
        <legend className="sectitle" style={{ padding: 0 }}>Identity checks (all three required)</legend>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {svc.MFA_CHECKS.map((c, i) => (
            <label key={c.key} className="listrow" style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
              <input type="checkbox" id={"mfaChk" + c.key} data-focus={i === 0 ? true : undefined} style={{ marginTop: 3 }} checked={checks[c.key]} onChange={(e) => { setChecks({ ...checks, [c.key]: e.target.checked }); setErr(""); }} />
              <span style={{ fontSize: 12.5 }}>{c.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="sectitle">Request details</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="grid2" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))", gap: 12 }}>
          <div className="field"><label htmlFor="mfaReason">Reason</label><SelectList className="select" id="mfaReason" value={reason} onChange={(e) => setReason(e.target.value)}>{svc.MFA_REASONS.map((x) => <option key={x}>{x}</option>)}</SelectList></div>
          <div className="field"><label htmlFor="mfaTicket">Ticket reference</label><input className="input" id="mfaTicket" maxLength={20} placeholder="SEC-1234" value={ticket} onChange={(e) => setTicket(e.target.value)} autoComplete="off" spellCheck={false} /></div>
        </div>
        <div className="field"><label htmlFor="mfaText">Reason details (at least 10 characters)</label><textarea className="input" id="mfaText" rows={2} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} /></div>
        <div className="field"><label htmlFor="mfaApprover">Named second approver</label>
          <SelectList className="select" id="mfaApprover" value={approver} onChange={(e) => setApprover(e.target.value)} disabled={!approvers.length}>{approvers.map((x) => <option key={x}>{x}</option>)}</SelectList>
          {!approvers.length ? <span className="help">No eligible approver (not you, not the subject).</span> : <span className="help">Cannot be you or the person being reset. The request expires in {SOD.MFA_RESET_REQUEST_TTL_H} hours.</span>}
        </div>
      </div>
      <p className="field help" id="mfaErr" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none", marginTop: 12 }}>{err}</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={!approvers.length} onClick={go}>Request reset</button></LayerFoot>
    </>
  );
}

/** Admin-level reset (platform): requester support/super, elevated; approver a named platform super admin. */
export function ResetRequestForm({ adminId, close }: { adminId: string; close: () => void }) {
  const a = TENANT_ADMINS.find((x) => x.id === adminId);
  if (!a) return <p>Admin not found.</p>;
  const cust = CUSTOMERS[a.custId] ? CUSTOMERS[a.custId].name : a.custId;
  return (
    <ResetFormBody close={close} approvers={svc.eligibleAdminApprovers(a.name)}
      intro={<>This raises a request to reset multi-factor authentication for <b>{a.name}</b> ({a.email}). A named platform super admin must approve before anything changes. Everything is written to the audit log.</>}
      facts={[["Customer", cust], ["Current MFA", a.mfa], ["Last sign-in", a.last]]}
      submit={async (f) => { const r = await svc.requestReset({ ...f, adminId }); return "Reset requested for " + r.subject + ", awaiting the named approver"; }} />
  );
}

/** Member-level reset (workspace): requester company admin; approver a different company admin or owner (two approvers if the member is privileged). */
export function MemberResetForm({ personId, close }: { personId: string; close: () => void }) {
  const p = ppl.findPerson(personId);
  if (!p) return <p>Person not found.</p>;
  const priv = ppl.isPrivilegedPerson(p);
  return (
    <ResetFormBody close={close} approvers={ppl.eligibleMemberApprovers(p.name)}
      intro={<>This raises a request to reset multi-factor authentication for <b>{p.name}</b>. A different company admin or owner must approve before anything changes.{priv ? " This person holds privileged access, so a second approver is also required." : ""} Self-service reset is not available through this flow.</>}
      facts={[["Person", p.name], ["Role", p.role], ["Current MFA", p.mfa ? "Enrolled" : "Not enrolled"], ["Approvals needed", priv ? "2" : "1"]]}
      submit={async (f) => { const r = await ppl.requestMemberMfaReset({ ...f, personId }); setModState("people.view", "People"); return "Reset requested for " + r.name + ", awaiting approval"; }} />
  );
}
