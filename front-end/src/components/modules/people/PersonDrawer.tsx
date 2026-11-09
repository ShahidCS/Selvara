import { useState } from "react";
import { Empty, Icon, StatusChip, Chip, Table } from "@/components/ui";
import { useLayer, LayerFoot } from "@/hooks/useLayer";
import type { LayerApi } from "@/hooks/useLayer";
import { DATA } from "@/lib/data";
import { bumpData, useApp, useData } from "@/lib/store";
import { sodMessage } from "@/lib/approvalFlow";
import { isSamePerson, sodReason } from "@/lib/sod";
import * as svc from "@/services/people";
import { useResetMfa } from "./actions";

const Row = ({ k, v, ok }: { k: string; v: string; ok: boolean }) => (
  <div className="bar-row" style={{ marginBottom: 6 }}><span className="nm" style={{ width: 150 }}>{k}</span><StatusChip s={ok ? "OK" : "Needs evidence"} /> <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: 6 }}>{v}</span></div>
);

/** Drawer body (prototype: pplDrawer). Re-renders on DATA changes so the MFA state stays current after a reset. */
function PersonBody({ id }: { id: string }) {
  useData();
  const L = useLayer(); const resetMfa = useResetMfa();
  const canAct = svc.canManagePeople(useApp((s) => s.role));
  const found = svc.findPerson(id);
  if (!found) return <Empty icon="people" title="Person not found">This person is no longer in the workforce list.</Empty>;
  const p = svc.initPerson(found); const pz = p.posture;
  const self = sodReason("self-service MFA reset is not allowed, ask another admin", p.name); const selfOff = sodReason("you cannot offboard yourself", p.name);
  return (
    <>
      <div style={{ marginBottom: 12 }}>{p.mfa ? <Chip cls="ok" icon="check">MFA enrolled</Chip> : <Chip cls="neutral" icon="dot">No MFA</Chip>} <span className="tag">{p.employment}</span></div>
      <div className="sectitle">Device posture</div>
      <Row k="Operating system" v={pz.os} ok={!/EOL/.test(pz.os)} />
      <Row k="Disk encryption" v={pz.encryption} ok={pz.encryption === "On"} />
      <Row k="Antivirus" v={pz.antivirus} ok={pz.antivirus === "On"} />
      <Row k="Screen lock" v={pz.screenLock} ok={pz.screenLock === "On"} />
      <Row k="Password manager" v={pz.passwordMgr} ok={pz.passwordMgr === "In use"} />
      <div className="hr" /><div className="sectitle">Accounts owned ({p.accounts.length})</div>
      {p.accounts.length ? (
        <Table cols={[{ t: "System" }, { t: "Level" }]}>
          {p.accounts.map((a: { system: string; level: string }, i: number) => <tr key={a.system + i}><td className="strong">{a.system}</td><td>{a.level}</td></tr>)}
        </Table>
      ) : <p className="field help">No linked accounts.</p>}
      {canAct ? (
        <LayerFoot>
          <button className="btn btn-ghost" disabled={!p.mfa || !!self} title={self || undefined} onClick={() => resetMfa(id)}><Icon name="refresh" />Reset MFA</button>
          <button className="btn btn-primary" disabled={!!selfOff} title={selfOff || undefined} onClick={() => L.openModal("Offboard " + p.name, (close) => <OffboardForm id={id} close={close} />)}><Icon name="x" />Offboard</button>
        </LayerFoot>
      ) : null}
    </>
  );
}

/** Offboarding confirmation modal (prototype: pplOffboard / pplDoOffboard). The two checkboxes are informational in the source and stay so. */
function OffboardForm({ id, close }: { id: string; close: () => void }) {
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
      <div className="field"><label><input type="checkbox" id="ob-2" checked readOnly disabled /> Reclaim device and wipe (always)</label></div>
      <div className="field"><label htmlFor="ob-xfer">Transfer owned items to</label><select className="select" id="ob-xfer" data-focus value={target} onChange={(e) => setXfer(e.target.value)}>{others.map((x) => <option key={x.id}>{x.name}</option>)}</select></div>
      {priv ? <p className="field help" role="status">This person holds privileged access. A second admin or owner (not you) must approve before offboarding completes.</p> : null}
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-danger" onClick={submit}>{priv ? "Request offboarding" : "Complete offboarding"}</button></LayerFoot>
    </>
  );
}

/** Opens the person drawer. Unknown ids show a "not found" toast instead of throwing (the source would have thrown). */
export function openPersonDrawer(L: LayerApi, id: string) {
  const found = svc.findPerson(id);
  if (!found) { L.toast("Person not found", false); return; }
  const p = svc.initPerson(found);
  L.openDrawer(p.name, <>{p.role}, {p.dept}</>, <PersonBody id={id} />);
}
