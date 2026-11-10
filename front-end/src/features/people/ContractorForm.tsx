import { useState } from "react";
import { useLayer } from "@/hooks/useLayer";
import { LayerFoot } from "@/components/shell/LayerProvider";
import { wsLog } from "@/lib/audit";
import { bumpData, setModState } from "@/lib/store";
import { clampText } from "@/lib/security";
import * as svc from "@/services/people";

/** "Add a contractor" modal (prototype: pplAddContractor / pplDoAddContractor). */
export function ContractorForm({ close }: { close: () => void }) {
  const L = useLayer();
  const [name, setName] = useState(""); const [role, setRole] = useState(""); const [dept, setDept] = useState("External"); const [err, setErr] = useState(false);
  const submit = async () => {
    const n = clampText(name, 100);
    if (!n) { setErr(true); return; }
    try {
      await svc.addContractor({ name: n, role: clampText(role, 100), dept: clampText(dept, 100) });
      wsLog("contractor.added", n, "Access"); close(); L.toast("Contractor added");
      setModState("people.view", "People"); bumpData();
    } catch { L.toast("Could not add the contractor", false); }
  };
  return (
    <>
      <div className="field"><label htmlFor="pc-name">Full name <span style={{ color: "var(--bad-ink)" }}>*</span></label><input className="input" id="pc-name" data-focus maxLength={100} placeholder="e.g. Jordan Reyes" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={err} aria-describedby={err ? "pc-err" : undefined} /></div>
      <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="field"><label htmlFor="pc-role">Role</label><input className="input" id="pc-role" maxLength={100} placeholder="e.g. Security consultant" value={role} onChange={(e) => setRole(e.target.value)} /></div>
        <div className="field"><label htmlFor="pc-dept">Department</label><input className="input" id="pc-dept" maxLength={100} value={dept} onChange={(e) => setDept(e.target.value)} /></div>
      </div>
      <p className="field help" id="pc-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>Name is required.</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={submit}>Add contractor</button></LayerFoot>
    </>
  );
}
