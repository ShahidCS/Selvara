import { useState } from "react";
import { Empty, Icon, StatusChip, Chip, Table } from "@/components/ui";
import { useLayer, LayerFoot } from "@/hooks/useLayer";
import type { LayerApi } from "@/hooks/useLayer";
import { wsLog } from "@/lib/audit";
import { bumpData, useApp, useData } from "@/lib/store";
import { clampText } from "@/lib/security";
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
          <button className="btn btn-ghost" disabled={!p.mfa} onClick={() => resetMfa(id)}><Icon name="refresh" />Reset MFA</button>
          <button className="btn btn-primary" onClick={() => L.openModal("Offboard " + p.name, (close) => <OffboardForm id={id} close={close} />)}><Icon name="x" />Offboard</button>
        </LayerFoot>
      ) : null}
    </>
  );
}

/** Offboarding confirmation modal (prototype: pplOffboard / pplDoOffboard). The two checkboxes are informational in the source and stay so. */
function OffboardForm({ id, close }: { id: string; close: () => void }) {
  const L = useLayer();
  const p = svc.findPerson(id);
  const [c1, setC1] = useState(true); const [c2, setC2] = useState(true); const [xfer, setXfer] = useState("J. Avery");
  if (!p) return <Empty icon="people" title="Person not found">This person is no longer in the workforce list.</Empty>;
  const submit = async () => {
    try {
      const to = clampText(xfer, 80);
      const r = await svc.offboardPerson(id, to);
      if (!r) { close(); L.toast("Person not found", false); bumpData(); return; }
      wsLog("person.offboarded", r.name + ", items → " + (to || "owner"), "Access");
      close(); L.toast(r.name + " offboarded"); bumpData();
    } catch { L.toast("Could not complete offboarding", false); }
  };
  return (
    <>
      <p style={{ margin: "0 0 8px" }}>Offboarding runs the leaver checklist: revoke accounts, reclaim the device, and transfer ownership of controls and policies.</p>
      <div className="field"><label><input type="checkbox" id="ob-1" checked={c1} onChange={(e) => setC1(e.target.checked)} /> Revoke {p.accounts ? p.accounts.length : 0} account(s)</label></div>
      <div className="field"><label><input type="checkbox" id="ob-2" checked={c2} onChange={(e) => setC2(e.target.checked)} /> Reclaim device and wipe</label></div>
      <div className="field"><label htmlFor="ob-xfer">Transfer owned items to</label><input className="input" id="ob-xfer" data-focus maxLength={80} value={xfer} onChange={(e) => setXfer(e.target.value)} /></div>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-danger" onClick={submit}>Complete offboarding</button></LayerFoot>
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
