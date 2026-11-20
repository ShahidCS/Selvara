import { Chip, Empty, Icon, Page, StatusChip, Table } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { useApp, useData } from "@/lib/store";
import { sodReason } from "@/lib/sod";
import * as svc from "@/services/people";
import { OffboardForm } from "./OffboardForm";
import { useResetMfa } from "./actions";

const Row = ({ k, v, ok }: { k: string; v: string; ok: boolean }) => (
  <div className="bar-row" style={{ marginBottom: 6 }}><span className="nm" style={{ width: 150 }}>{k}</span><StatusChip s={ok ? "OK" : "Needs evidence"} /> <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: 6 }}>{v}</span></div>
);

/** A person as a page (`/ws/people/:id`): device posture and owned accounts. Reset MFA opens its request dialog; offboarding is a confirmation dialog. */
export function PersonDetail({ id }: { id: string }) {
  useData();
  const L = useLayer(); const resetMfa = useResetMfa();
  const canAct = svc.canManagePeople(useApp((s) => s.role));
  const back = { href: "/ws/people", label: "People" };
  const found = svc.findPerson(id);
  if (!found) return <Page title="Person not found" back={back}><Empty icon="people" title="No such person">This person is not in the workforce list. They may have been offboarded, or the link may be wrong.</Empty></Page>;
  const p = svc.initPerson(found); const pz = p.posture;
  const self = sodReason("self-service MFA reset is not allowed, ask another admin", p.name); const selfOff = sodReason("you cannot offboard yourself", p.name);
  return (
    <Page title={p.name} sub={`${p.role}, ${p.dept}`} back={back} acts={<>
      {p.mfa ? <Chip cls="ok" icon="check">MFA enrolled</Chip> : <Chip cls="neutral" icon="dot">No MFA</Chip>}<span className="tag">{p.employment}</span>
      {canAct ? <>
        <button className="btn btn-ghost" disabled={!p.mfa || !!self} title={self || undefined} onClick={() => resetMfa(id)}><Icon name="refresh" />Reset MFA</button>
        <button className="btn btn-primary" disabled={!!selfOff} title={selfOff || undefined} onClick={() => L.openModal("Offboard " + p.name, (close) => <OffboardForm id={id} close={close} />)}><Icon name="x" />Offboard</button>
      </> : null}
    </>}>
      <div className="scroll rec-scroll">
        <div className="rec-grid">
          <div className="rec-main">
            <div className="card"><div className="c-head"><h3>Device posture</h3>{p.device === "Not connected" ? null : <StatusChip s={p.device === "Compliant" ? "OK" : p.device === "At risk" ? "Needs evidence" : "Open"} />}</div><div className="c-body">
              {p.device === "Not connected" ? <p className="field help" style={{ margin: 0 }}>Not connected. Device posture appears here once a device management integration is connected.</p> : <>
              <Row k="Operating system" v={pz.os} ok={!/EOL/.test(pz.os)} />
              <Row k="Disk encryption" v={pz.encryption} ok={pz.encryption === "On"} />
              <Row k="Antivirus" v={pz.antivirus} ok={pz.antivirus === "On"} />
              <Row k="Screen lock" v={pz.screenLock} ok={pz.screenLock === "On"} />
              <Row k="Password manager" v={pz.passwordMgr} ok={pz.passwordMgr === "In use"} />
              </>}
            </div></div>
            <div className="card"><div className="c-head"><h3>Accounts owned</h3><span className="sub">{p.accounts.length}</span></div><div className="c-body flush" style={{ padding: 0 }}>
              {p.accounts.length ? (
                <Table cols={[{ t: "System" }, { t: "Level" }]}>
                  {p.accounts.map((a: { system: string; level: string }, i: number) => <tr key={a.system + i}><td className="strong">{a.system}</td><td>{a.level}</td></tr>)}
                </Table>
              ) : <Empty icon="access" title="No linked accounts">No accounts are linked to this person.</Empty>}
            </div></div>
          </div>
          <aside className="rec-side">
            <div className="card"><div className="c-head"><h3>Details</h3></div><div className="c-body">
              <dl className="meta-grid"><dt>Role</dt><dd>{p.role}</dd><dt>Department</dt><dd>{p.dept}</dd><dt>Employment</dt><dd>{p.employment}</dd><dt>MFA</dt><dd>{p.mfa ? "Enrolled" : "Not enrolled"}</dd><dt>Device</dt><dd>{p.device}</dd></dl>
              {canAct ? null : <p className="field help" role="note">Read-only for your role. Admins and owners reset MFA and offboard people.</p>}
            </div></div>
          </aside>
        </div>
      </div>
    </Page>
  );
}
