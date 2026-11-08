import { useState } from "react";
import { LayerFoot } from "@/components/shell/LayerProvider";
import { useLayer } from "@/hooks/useLayer";
import { adminLog, ADMIN_AUDIT } from "@/lib/adminAudit";
import { REGION_TREE } from "@/lib/platform";
import { isEmail } from "@/lib/security";
import { getModState, setModState } from "@/lib/store";
import * as svc from "@/services/customers";

const custName = (cid: string) => svc.findCustomer(cid)?.name || cid;

/** Prototype: uFormBody / uValid / addUser / uCreate / editUser / uSave. `uid` set = edit. */
export function UserForm({ cid, uid, close }: { cid: string; uid?: string; close: () => void }) {
  const L = useLayer(); const u = uid ? svc.findUser(uid) : undefined; const countries = Object.keys(REGION_TREE);
  const [name, setName] = useState(u ? u.name : ""); const [email, setEmail] = useState(u ? u.email : "");
  const [role, setRole] = useState(u ? u.role : svc.USER_ROLES[0]); const [country, setCountry] = useState(u ? u.country : countries[0]);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    const n = name.trim(), e = email.trim();
    if (!n) { setErr("Full name is required."); return; }
    if (!isEmail(e)) { setErr("Enter a valid email address."); return; }
    try {
      if (uid) { const r = await svc.saveUser(cid, uid, { name: n, email: e, role, country }); adminLog("user.updated", r.name + ", " + custName(cid)); close(); L.toast("Changes saved"); }
      else { const r = await svc.createUser(cid, { name: n, email: e, role, country }); adminLog("user.created", r.name + " (" + r.role + "), " + custName(cid)); close(); L.toast("Invite sent to " + r.email); }
    } catch { L.toast(uid ? "Could not save the changes" : "Could not add the user", false); }
  };
  return (
    <>
      <div className="field"><label htmlFor="uf-name">Full name <span style={{ color: "var(--bad-ink)" }}>*</span></label><input className="input" id="uf-name" data-focus placeholder="e.g. Dana Fischer" maxLength={100} aria-required="true" value={name} onChange={(x) => setName(x.target.value)} /></div>
      <div className="field"><label htmlFor="uf-email">Email <span style={{ color: "var(--bad-ink)" }}>*</span></label><input className="input" id="uf-email" type="email" placeholder="name@company.example" maxLength={254} autoComplete="off" aria-required="true" value={email} onChange={(x) => setEmail(x.target.value)} /></div>
      <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="field"><label htmlFor="uf-role">Role</label><select className="select" id="uf-role" value={role} onChange={(x) => setRole(x.target.value)}>{svc.USER_ROLES.map((r) => <option key={r}>{r}</option>)}</select></div>
        <div className="field"><label htmlFor="uf-country">Country</label><select className="select" id="uf-country" value={country} onChange={(x) => setCountry(x.target.value)}>{countries.map((c) => <option key={c}>{c}</option>)}</select></div>
      </div>
      {err ? <p className="field help" id="uf-err" role="alert" style={{ color: "var(--bad-ink)" }}>{err}</p> : null}
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={save}>{uid ? "Save changes" : "Add user"}</button></LayerFoot>
    </>
  );
}
export const openAddUser = (L: ReturnType<typeof useLayer>, cid: string) => { setModState("customers.tab", "users"); L.openModal("Add user, " + custName(cid), (close) => <UserForm cid={cid} close={close} />); };
export const openEditUser = (L: ReturnType<typeof useLayer>, uid: string, cid: string) => { const u = svc.findUser(uid); if (!u) return; L.openModal("Edit " + u.name, (close) => <UserForm cid={cid} uid={uid} close={close} />); };

/** Prototype: uChangeRole / uDoRole. */
function RoleForm({ cid, uid, close }: { cid: string; uid: string; close: () => void }) {
  const L = useLayer(); const u = svc.findUser(uid); const [role, setRole] = useState(u ? u.role : svc.USER_ROLES[0]);
  const go = async () => {
    try {
      const r = await svc.changeUserRole(cid, uid, role);
      if (r && u) { adminLog("user.role.changed", u.name + ": " + r.from + " → " + r.to); L.toast("Role updated"); }
      close();
    } catch { L.toast("Could not update the role", false); }
  };
  return (
    <>
      <div className="field"><label htmlFor="uf-role2">Role</label><select className="select" id="uf-role2" value={role} onChange={(x) => setRole(x.target.value)}>{svc.USER_ROLES.map((r) => <option key={r}>{r}</option>)}</select></div>
      <p className="field help">Role changes take effect at the user&apos;s next sign-in and are written to the audit log.</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={go}>Update role</button></LayerFoot>
    </>
  );
}
export const openChangeRole = (L: ReturnType<typeof useLayer>, uid: string, cid: string) => { const u = svc.findUser(uid); if (!u) return; L.openModal("Change role, " + u.name, (close) => <RoleForm cid={cid} uid={uid} close={close} />); };

/** Prototype: uRemove / uDoRemove. */
function RemoveBody({ cid, uid, close }: { cid: string; uid: string; close: () => void }) {
  const L = useLayer(); const u = svc.findUser(uid);
  const go = async () => {
    try {
      const r = await svc.removeUser(cid, uid);
      const sel = getModState<Record<string, boolean>>("customers.usel", {}); if (sel[uid]) { const n = { ...sel }; delete n[uid]; setModState("customers.usel", n); }
      adminLog("user.removed", r.name + ", " + custName(cid)); close(); L.toast("User removed");
    } catch { L.toast("Could not remove the user", false); }
  };
  if (!u) return <p className="sub" style={{ margin: 0 }}>User not found.</p>;
  return (
    <>
      <p style={{ margin: "0 0 4px" }}>This removes <strong>{u.name}</strong> ({u.email}) from <strong>{custName(cid)}</strong> and revokes their access immediately.</p>
      <p className="sub" style={{ margin: 0 }}>Audit history is retained. This cannot be undone in the demo.</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-danger" onClick={go}>Remove user</button></LayerFoot>
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
  ) : <p className="field help">No recent platform events recorded for this user.</p>);
}
