import { useState } from "react";
import { useLayer } from "@/hooks/useLayer";
import { LayerFoot } from "@/components/shell/LayerProvider";
import { sodMessage } from "@/lib/approvalFlow";
import { DATA } from "@/lib/data";
import { bumpData, setModState } from "@/lib/store";
import { clampText } from "@/lib/security";
import { memberRole } from "@/lib/teamRoles";
import * as svc from "@/services/team";

const Req = () => <span style={{ color: "var(--bad-ink)" }}>*</span>;

/** Prototype: teamAddApprover / teamDoAddApprover. */
export function ApproverForm({ close }: { close: () => void }) {
  const L = useLayer();
  const [name, setName] = useState(""); const [err, setErr] = useState(false);
  const submit = async () => {
    const n = clampText(name, 80);
    if (!n) { setErr(true); return; }
    try {
      await svc.addApprover(n);
      close(); setModState("team.view", "gates"); bumpData();
    } catch (e) { L.toast(sodMessage(e, "Could not add the approver"), false); }
  };
  return (
    <>
      <div className="field"><label htmlFor="ta-name">Approver <Req /></label><input className="input" id="ta-name" data-focus maxLength={80} placeholder="e.g. N. Kim (Engineering)" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={err} aria-describedby={err ? "ta-err" : undefined} /></div>
      <p className="field help" id="ta-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>Name is required.</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={submit}>Add</button></LayerFoot>
    </>
  );
}

/** Grant / change a member's workspace role (privileged roles need a second admin). */
export function ChangeRoleForm({ personId, close }: { personId: string; close: () => void }) {
  const L = useLayer();
  const p = DATA.people.find((x) => x.id === personId);
  const [role, setRole] = useState(p ? memberRole(p) : svc.USER_ROLES[0]);
  if (!p) return <p>Person not found.</p>;
  const submit = async () => {
    try { const r = await svc.changeMemberRole(personId, role); close(); L.toast(r.pending ? "Role change for " + r.name + " sent for second admin approval" : r.name + " is now " + role); bumpData(); }
    catch (e) { L.toast(sodMessage(e, "Could not change the role"), false); }
  };
  return (
    <>
      <p style={{ margin: "0 0 8px" }}>Current role of <b>{p.name}</b>: {memberRole(p)}.</p>
      <div className="field"><label htmlFor="cr-role">New role</label><select className="select" id="cr-role" data-focus value={role} onChange={(e) => setRole(e.target.value)}>{svc.USER_ROLES.map((r) => <option key={r}>{r}</option>)}</select></div>
      {svc.isPrivilegedRole(role) ? <p className="field help" role="status">Granting a privileged role needs approval from a different admin. You cannot change your own role.</p> : null}
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={submit}>{svc.isPrivilegedRole(role) ? "Request role change" : "Change role"}</button></LayerFoot>
    </>
  );
}
