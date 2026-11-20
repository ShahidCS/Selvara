import { API_ON } from "@/lib/rbac";
import { useState } from "react";
import { Empty } from "@/components/ui";
import { useLayer, LayerFoot } from "@/hooks/useLayer";
import { DATA } from "@/lib/data";
import { bumpData, useData } from "@/lib/store";
import { sodMessage } from "@/lib/approvalFlow";
import { isSamePerson } from "@/lib/sod";
import * as svc from "@/services/people";

/** Offboarding confirmation modal (prototype: pplOffboard / pplDoOffboard). The two checkboxes are informational in the source and stay so. */
export function OffboardForm({ id, close }: { id: string; close: () => void }) {
  const L = useLayer(); useData();
  const p = svc.findPerson(id);
  const [xfer, setXfer] = useState("");
  if (!p) return <Empty icon="people" title="Person not found">This person is no longer in the workforce list.</Empty>;
  const others: { id: string; name: string }[] = DATA.people.filter((x) => x.id !== id);
  const priv = svc.isPrivilegedPerson(p); const grants = DATA.access.filter((g) => isSamePerson(g.user, p.name)).length;
  const target = xfer || (others.find((x) => isSamePerson(x.name, "J. Avery")) || others[0] || { name: "" }).name;
  const submit = async () => {
    try {
      const r = await svc.offboardPerson(id, target);
      close();
      L.toast(r.pending ? r.name + ": offboarding sent for second approval" : r.name + " offboarded, " + r.revoked + " access grant(s) revoked"); bumpData();
    } catch (e) { L.toast(sodMessage(e, "Could not complete offboarding"), false); }
  };
  return (
    <>
      <p style={{ margin: "0 0 8px" }}>Offboarding runs the leaver checklist: all access is revoked, the device is reclaimed, and ownership of controls and policies is transferred.</p>
      <div className="field"><label><input type="checkbox" id="ob-1" checked readOnly disabled /> Revoke {grants} access grant(s) (always)</label></div>
      <div className="field"><label><input type="checkbox" id="ob-2" checked readOnly disabled /> {API_ON ? "Return the device (your IT team; no device integration is connected)" : "Reclaim device and wipe (always)"}</label></div>
      <div className="field"><label htmlFor="ob-xfer">Transfer owned items to</label><select className="select" id="ob-xfer" data-focus value={target} onChange={(e) => setXfer(e.target.value)}>{others.map((x) => <option key={x.id}>{x.name}</option>)}</select></div>
      {priv ? <p className="field help" role="status">This person holds privileged access. A second admin or owner (not you) must approve before offboarding completes.</p> : null}
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-danger" onClick={submit}>{priv ? "Request offboarding" : "Complete offboarding"}</button></LayerFoot>
    </>
  );
}
