import { Empty } from "@/components/ui";
import { useState } from "react";
import { LayerFoot } from "@/components/shell/LayerProvider";
import { useLayer } from "@/hooks/useLayer";
import { ADMIN_AUDIT } from "@/lib/adminAudit";
import { sodMessage } from "@/lib/elevation";
import { useGate } from "@/components/kit/admin/ElevateGate";
import { REGION_TREE } from "@/lib/platform";
import { isEmail } from "@/lib/security";
import { setModState } from "@/lib/store";
import * as svc from "@/services/customers";

const custName = (cid: string) => svc.findCustomer(cid)?.name || cid;

/** Prototype: uFormBody / uValid / addUser / uCreate / editUser / uSave. `uid` set = edit. */
export function UserForm({ cid, uid, close }: { cid: string; uid?: string; close: () => void }) {
  const L = useLayer(); const gate = useGate(); const u = uid ? svc.findUser(uid) : undefined; const countries = Object.keys(REGION_TREE);
  const [name, setName] = useState(u ? u.name : ""); const [email, setEmail] = useState(u ? u.email : "");
  const [role, setRole] = useState(u ? u.role : svc.USER_ROLES[0]); const [country, setCountry] = useState(u ? u.country : countries[0]);
  const [err, setErr] = useState<{ f: "name" | "email"; m: string } | null>(null);
  const fail = (f: "name" | "email", m: string) => { setErr({ f, m }); document.getElementById("uf-" + f)?.focus(); };
  const save = async () => {
    const n = name.trim(), e = email.trim();
    if (!n) { fail("name", "Enter the user's full name."); return; }
    if (!isEmail(e)) { fail("email", "Enter a valid email address, for example name@company.example."); return; }
    try {
      if (uid) { await svc.saveUser(cid, uid, { name: n, email: e, role, country }); close(); L.toast("Changes saved"); }
      else { const r = await svc.createUser(cid, { name: n, email: e, role, country }); close(); L.toast("Invite sent to " + r.email); }
    } catch (x) { L.toast(sodMessage(x, uid ? "Could not save the changes" : "Could not add the user"), false); }
  };
  return (
    <>
      <p className="field help" style={{ margin: "0 0 10px" }}>Fields marked <span aria-hidden="true">*</span> are required.</p>
      <div className={"field" + (err?.f === "name" ? " err" : "")}><label htmlFor="uf-name">Full name <span aria-hidden="true" style={{ color: "var(--bad-ink)" }}>*</span></label><input className="input" id="uf-name" data-focus placeholder="e.g. Dana Fischer" maxLength={100} required aria-required="true" aria-invalid={err?.f === "name"} aria-describedby={err?.f === "name" ? "uf-err" : undefined} value={name} onChange={(x) => { setName(x.target.value); setErr(null); }} />
        {err?.f === "name" ? <span className="help" id="uf-err" role="alert" style={{ color: "var(--bad-ink)" }}>{err.m}</span> : null}</div>
      <div className={"field" + (err?.f === "email" ? " err" : "")}><label htmlFor="uf-email">Email <span aria-hidden="true" style={{ color: "var(--bad-ink)" }}>*</span></label><input className="input" id="uf-email" type="email" placeholder="name@company.example" maxLength={254} autoComplete="off" required aria-required="true" aria-invalid={err?.f === "email"} aria-describedby={err?.f === "email" ? "uf-err" : undefined} value={email} onChange={(x) => { setEmail(x.target.value); setErr(null); }} />
        {err?.f === "email" ? <span className="help" id="uf-err" role="alert" style={{ color: "var(--bad-ink)" }}>{err.m}</span> : null}</div>
      <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="field"><label htmlFor="uf-role">Role</label><select className="select" id="uf-role" value={role} onChange={(x) => setRole(x.target.value)}>{svc.USER_ROLES.map((r) => <option key={r}>{r}</option>)}</select></div>
        <div className="field"><label htmlFor="uf-country">Country</label><select className="select" id="uf-country" value={country} onChange={(x) => setCountry(x.target.value)}>{countries.map((c) => <option key={c}>{c}</option>)}</select></div>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={gate.locked} title={gate.title}>{uid ? "Save changes" : "Add user"}</button></LayerFoot>
    </>
  );
}
export const openAddUser = (L: ReturnType<typeof useLayer>, cid: string) => { setModState("customers.tab", "users"); L.openModal("Add user, " + custName(cid), (close) => <UserForm cid={cid} close={close} />); };
export const openEditUser = (L: ReturnType<typeof useLayer>, uid: string, cid: string) => { const u = svc.findUser(uid); if (!u) return; L.openModal("Edit " + u.name, (close) => <UserForm cid={cid} uid={uid} close={close} />); };

/** Prototype: uChangeRole / uDoRole. */
function RoleForm({ cid, uid, close }: { cid: string; uid: string; close: () => void }) {
  const L = useLayer(); const gate = useGate(); const u = svc.findUser(uid); const [role, setRole] = useState(u ? u.role : svc.USER_ROLES[0]);
  const go = async () => {
    try {
      const r = await svc.changeUserRole(cid, uid, role);
      if (r && u) L.toast("Role updated");
      close();
    } catch (x) { L.toast(sodMessage(x, "Could not update the role"), false); }
  };
  return (
    <>
      <div className="field"><label htmlFor="uf-role2">Role</label><select className="select" id="uf-role2" value={role} onChange={(x) => setRole(x.target.value)}>{svc.USER_ROLES.map((r) => <option key={r}>{r}</option>)}</select></div>
      <p className="field help">Role changes take effect at the user&apos;s next sign-in and are written to the audit log.</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={go} disabled={gate.locked} title={gate.title}>Update role</button></LayerFoot>
    </>
  );
}
export const openChangeRole = (L: ReturnType<typeof useLayer>, uid: string, cid: string) => { const u = svc.findUser(uid); if (!u) return; L.openModal("Change role, " + u.name, (close) => <RoleForm cid={cid} uid={uid} close={close} />); };

/** Prototype: uRemove / uDoRemove. */
function RemoveBody({ cid, uid, close }: { cid: string; uid: string; close: () => void }) {
  const L = useLayer(); const gate = useGate(); const u = svc.findUser(uid);
  const go = async () => {
    try {
      await svc.removeUser(cid, uid);
      close(); L.toast("User removed");
    } catch (x) { L.toast(sodMessage(x, "Could not remove the user"), false); }
  };
  if (!u) return <p className="sub" style={{ margin: 0 }}>User not found.</p>;
  return (
    <>
      <p style={{ margin: "0 0 4px" }}>This removes <strong>{u.name}</strong> ({u.email}) from <strong>{custName(cid)}</strong> and revokes their access immediately.</p>
      <p className="sub" style={{ margin: 0 }}>Audit history is retained. This cannot be undone in the demo.</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-danger" onClick={go} disabled={gate.locked} title={gate.title}>Remove user</button></LayerFoot>
    </>
  );
}
export const openRemoveUser = (L: ReturnType<typeof useLayer>, uid: string, cid: string) => { const u = svc.findUser(uid); if (!u) return; L.openModal("Remove " + u.name + "?", (close) => <RemoveBody cid={cid} uid={uid} close={close} />); };

/** Prototype: uActivity (last 8 admin-log entries whose object mentions the user's name, newest first). */
export function openActivity(L: ReturnType<typeof useLayer>, uid: string) {
  const u = svc.findUser(uid); if (!u) return;
  const rows = ADMIN_AUDIT.filter((l) => l.object.includes(u.name)).slice().reverse().slice(0, 8);
  L.openModal("Activity, " + u.name, rows.length ? (
    <div className="tbl-wrap"><table className="tbl"><thead><tr><th scope="col">When (UTC)</th><th scope="col">Action</th><th scope="col">Detail</th></tr></thead>
      <tbody>{rows.map((l) => <tr key={l.seq}><td style={{ color: "var(--muted)" }} className="num">{l.at}</td><td className="num">{l.action}</td><td>{l.object}</td></tr>)}</tbody></table></div>
  ) : <Empty compact icon="log" title="No recent platform events recorded for this user" />);
}
