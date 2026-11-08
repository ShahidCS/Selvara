import { useState } from "react";
import { useLayer } from "@/hooks/useLayer";
import { LayerFoot } from "@/components/shell/LayerProvider";
import { wsLog } from "@/lib/audit";
import { bumpData, setModState } from "@/lib/store";
import { clampText, isEmail } from "@/lib/security";
import * as svc from "@/services/team";

const Req = () => <span style={{ color: "var(--bad-ink)" }}>*</span>;
const SRC_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/; // prototype regex, kept; isEmail adds length caps

/** Prototype: teamInvite / teamDoInvite (logs and toasts; no member record is created in the source). */
export function InviteForm({ close }: { close: () => void }) {
  const L = useLayer();
  const [email, setEmail] = useState(""); const [role, setRole] = useState(svc.USER_ROLES[0]); const [err, setErr] = useState(false);
  const submit = async () => {
    const em = email.trim();
    if (!SRC_EMAIL.test(em) || !isEmail(em)) { setErr(true); return; }
    try {
      const r = await svc.inviteMember({ email: em, role });
      wsLog("member.invited", r.email + " (" + r.role + ")", "Access"); close(); L.toast("Invitation sent to " + r.email);
    } catch { L.toast("Could not send the invitation", false); }
  };
  return (
    <>
      <div className="field"><label htmlFor="ti-email">Work email <Req /></label><input className="input" id="ti-email" data-focus type="email" maxLength={254} autoComplete="off" spellCheck={false} placeholder="name@company.example" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={err} aria-describedby={err ? "ti-err" : undefined} /></div>
      <div className="field"><label htmlFor="ti-role">Role</label><select className="select" id="ti-role" value={role} onChange={(e) => setRole(e.target.value)}>{svc.USER_ROLES.map((r) => <option key={r}>{r}</option>)}</select></div>
      <p className="field help" id="ti-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>Enter a valid email address.</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={submit}>Send invitation</button></LayerFoot>
    </>
  );
}

/** Prototype: teamAddApprover / teamDoAddApprover. */
export function ApproverForm({ close }: { close: () => void }) {
  const L = useLayer();
  const [name, setName] = useState(""); const [err, setErr] = useState(false);
  const submit = async () => {
    const n = clampText(name, 80);
    if (!n) { setErr(true); return; }
    try {
      await svc.addApprover(n);
      wsLog("procurement.approver.added", n, "System"); close(); setModState("team.view", "gates"); bumpData();
    } catch { L.toast("Could not add the approver", false); }
  };
  return (
    <>
      <div className="field"><label htmlFor="ta-name">Approver <Req /></label><input className="input" id="ta-name" data-focus maxLength={80} placeholder="e.g. N. Kim (Engineering)" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={err} aria-describedby={err ? "ta-err" : undefined} /></div>
      <p className="field help" id="ta-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>Name is required.</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={submit}>Add</button></LayerFoot>
    </>
  );
}
