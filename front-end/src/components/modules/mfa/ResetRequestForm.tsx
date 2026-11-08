import { useState } from "react";
import { LayerFoot } from "@/components/shell/LayerProvider";
import { useLayer } from "@/hooks/useLayer";
import { CUSTOMERS, TENANT_ADMINS } from "@/lib/platform";
import * as svc from "@/services/mfa";

export const MFA_FAIL: Record<string, string> = {
  forbidden: "You do not have permission to do that", notfound: "Request not found", state: "That request is not awaiting a decision, or a reset is already pending",
  self: "A second approver is required", invalid: "Choose a valid reason and verification method", unconfirmed: "Confirm the out-of-band identity check first",
};

/** Prototype: mfaRequest (modal body) + mfaRequestSubmit. The reset itself is performed by the service layer (role gate, state guards, audit). */
export function ResetRequestForm({ adminId, close }: { adminId: string; close: () => void }) {
  const L = useLayer();
  const a = TENANT_ADMINS.find((x) => x.id === adminId);
  const [reason, setReason] = useState(svc.MFA_REASONS[0]); const [method, setMethod] = useState(svc.MFA_METHODS[0]);
  const [confirmed, setConfirmed] = useState(false); const [err, setErr] = useState(false);
  if (!a) return <p>Admin not found.</p>;
  const submit = async () => {
    if (!confirmed) { setErr(true); return; }
    try {
      const r = await svc.requestReset({ adminId, reason, method, confirmed });
      if (!r.ok) { if (r.why === "unconfirmed") setErr(true); else { close(); L.toast(MFA_FAIL[r.why] || "Could not raise the reset", false); } return; }
      close(); L.toast("Reset requested for " + r.subject + ", awaiting a second approver");
    } catch { L.toast("Could not raise the reset", false); }
  };
  return (
    <>
      <p className="field help" style={{ marginBottom: 12 }}>This raises a request to reset multi-factor authentication for <b>{a.name}</b> ({a.email}). A second platform admin must approve before the reset takes effect. The action is written to the audit log.</p>
      <dl className="meta-grid lstart" style={{ marginBottom: 12 }}><dt>Customer</dt><dd>{CUSTOMERS[a.custId] ? CUSTOMERS[a.custId].name : a.custId}</dd><dt>Current MFA</dt><dd>{a.mfa}</dd><dt>Last sign-in</dt><dd>{a.last}</dd></dl>
      <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="field"><label htmlFor="mfaReason">Reason</label><select className="select" id="mfaReason" value={reason} onChange={(e) => setReason(e.target.value)}>{svc.MFA_REASONS.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div className="field"><label htmlFor="mfaMethod">Identity verified by</label><select className="select" id="mfaMethod" value={method} onChange={(e) => setMethod(e.target.value)}>{svc.MFA_METHODS.map((x) => <option key={x}>{x}</option>)}</select></div>
      </div>
      <label className="listrow" style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer", marginTop: 6 }}>
        <input type="checkbox" id="mfaConfirm" data-focus style={{ marginTop: 3 }} checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} aria-describedby={err ? "mfaErr" : undefined} />
        <span style={{ fontSize: 12.5 }}>I confirm the admin&apos;s identity was verified out-of-band before raising this reset.</span>
      </label>
      <p className="field help" id="mfaErr" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>Confirm the out-of-band identity check first.</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={submit}>Request reset</button></LayerFoot>
    </>
  );
}
