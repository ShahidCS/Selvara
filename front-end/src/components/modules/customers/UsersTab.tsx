import { Icon, StatusChip } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { ELEVATE_TEXT, elevationActive, sodMessage } from "@/lib/elevation";
import { useGo } from "@/lib/route";
import { useModState } from "@/lib/store";
import * as svc from "@/services/customers";
import { useGate } from "../admin/ElevateGate";
import { openActivity, openAddUser, openChangeRole, openEditUser, openRemoveUser } from "./UserForms";

/** Prototype: usersTab, uToggle*, uBulk, uMenu, uAct (tenant user management, isolated by custId). */
export function UsersTab({ cid }: { cid: string }) {
  const L = useLayer(); const go = useGo(); const gate = useGate(); const [usel, setUsel] = useModState<Record<string, boolean>>("customers.usel", {});
  const cust = svc.findCustomer(cid); const cn = cust ? cust.name : cid;
  const list = svc.usersFor(cid); const sel = list.filter((u) => usel[u.id]);
  const allOn = list.length > 0 && list.every((u) => usel[u.id]);
  const plural = (n: number) => (n !== 1 ? "s" : "");

  const act = async (kind: svc.UserAction, uid: string) => {
    const u = svc.findUser(uid); if (!u) return;
    try {
      await svc.userAction(cid, uid, kind); // the service writes the audit entry
      if (kind === "resetpw") L.toast("Password reset email sent to " + u.name);
      else if (kind === "resend") L.toast("Invite resent to " + u.email);
      else if (kind === "verify") L.toast("Verification email sent to " + u.email);
      else if (kind === "logout") L.toast("All sessions revoked for " + u.name);
      else if (kind === "suspend") L.toast(u.name + " suspended");
      else if (kind === "activate") L.toast(u.name + " reactivated");
    } catch (x) { L.toast(sodMessage(x, "That action could not be completed"), false); }
  };
  const bulk = async (kind: "suspend" | "export") => {
    if (!sel.length) return;
    if (kind === "export") { svc.auditUserExport(cid, sel.length); L.toast("Exported " + sel.length + " user" + plural(sel.length) + " (demo)"); return; }
    try {
      await svc.bulkUsers(cid, sel.map((u) => u.id), kind);
      L.toast(sel.length + " user" + plural(sel.length) + " suspended");
      setUsel({});
    } catch (x) { L.toast(sodMessage(x, "That action could not be completed"), false); }
  };
  const menu = (ev: React.MouseEvent, uid: string) => {
    const u = svc.findUser(uid); if (!u) return; const susp = u.status === "Suspended"; const locked = !elevationActive();
    // Mutating items are disabled (with the exact reason) unless elevated; read-only items (activity, MFA module link) are always available.
    const item = (fn: () => void, label: string, icon: string, mutates = true) => function MenuItem(close: () => void) { return <button key={label} role="menuitem" disabled={mutates && locked} title={mutates && locked ? ELEVATE_TEXT : undefined} onClick={() => { close(); fn(); }}><Icon name={icon} />{label}</button>; };
    const items = [
      item(() => openEditUser(L, uid, cid), "Edit profile", "team"), item(() => openChangeRole(L, uid, cid), "Change role", "frameworks"),
      item(() => go("/admin/mfa"), "Request MFA reset (MFA Resets)", "access", false), item(() => act("resetpw", uid), "Reset password", "access"),
      item(() => act("resend", uid), "Resend invite", "ext"), item(() => act("verify", uid), "Resend email verification", "check"),
      item(() => act("logout", uid), "Force sign-out", "back"), item(() => openActivity(L, uid), "View activity", "log", false),
    ];
    const tail = [item(() => act(susp ? "activate" : "suspend", uid), susp ? "Reactivate user" : "Suspend user", "alert"), item(() => openRemoveUser(L, uid, cid), "Remove user", "x")];
    L.popover(ev, (close) => (<><div className="ph">{u.name}</div>{items.map((f) => f(close))}<div className="div" />{tail.map((f) => f(close))}</>));
  };

  if (!list.length) {
    return <div className="empty"><div className="ei"><Icon name="team" /></div><h4>No users yet</h4><p>This customer has no users in the directory. Add a customer admin to get started.</p><button className="btn btn-primary" disabled={gate.locked} title={gate.title} onClick={() => openAddUser(L, cid)}><Icon name="plus" />Add customer admin</button></div>;
  }
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div className="sectitle" style={{ margin: 0 }}>Directory, {cn}</div><span className="meta" style={{ marginLeft: 4 }}>Tenant {cid}</span>
        <button className="btn btn-primary sm" style={{ marginLeft: "auto" }} disabled={gate.locked} title={gate.title} onClick={() => openAddUser(L, cid)}><Icon name="plus" />Add customer admin</button>
      </div>
      {sel.length ? (
        <div className="card" style={{ boxShadow: "none", background: "var(--accent-weak)", borderColor: "transparent", marginBottom: 10 }}>
          <div className="c-body" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 10, padding: "10px 12px" }}>
            <span style={{ fontWeight: 500 }}>{sel.length} selected</span>
            <div className="btngrp" style={{ marginLeft: "auto" }}>
              <button className="btn btn-secondary sm" onClick={() => go("/admin/mfa")}><Icon name="access" />MFA Resets</button>
              <button className="btn btn-secondary sm" disabled={gate.locked} title={gate.title} onClick={() => bulk("suspend")}><Icon name="alert" />Suspend</button>
              <button className="btn btn-secondary sm" onClick={() => bulk("export")}><Icon name="download" />Export</button>
              <button className="btn btn-ghost sm" onClick={() => setUsel({})}>Clear</button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="scroll" style={{ maxHeight: "none" }}>
        <div className="tbl-wrap" style={{ ["--tmw" as string]: "944px" } as React.CSSProperties}>
          <table className="tbl">
            <thead><tr>
              <th scope="col"><input type="checkbox" aria-label="Select all users" checked={allOn} onChange={(e) => { const n = { ...usel }; list.forEach((u) => { n[u.id] = e.target.checked; }); setUsel(n); }} /></th>
              <th scope="col">User</th><th scope="col">Role</th><th scope="col">Location</th><th scope="col">Status</th><th scope="col">MFA</th><th scope="col">Last active</th><th scope="col"><span className="vh">Actions</span></th>
            </tr></thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id}>
                  <td style={{ width: 34 }}><input type="checkbox" aria-label={`Select ${u.name}`} checked={!!usel[u.id]} onChange={() => setUsel({ ...usel, [u.id]: !usel[u.id] })} /></td>
                  <td><div className="strong">{u.name}</div><div style={{ fontSize: 11.5, color: "var(--muted)" }}>{u.email}</div></td>
                  <td>{u.role}</td><td>{u.country}</td>
                  <td><StatusChip s={u.status} /></td>
                  <td><StatusChip s={u.mfa === "Reset pending" ? "In review" : u.mfa} /></td>
                  <td style={{ color: "var(--muted)" }}>{u.last}</td>
                  <td className="r"><button className="btn btn-ghost sm" aria-label={`Actions for ${u.name}`} aria-haspopup="menu" onClick={(e) => menu(e, u.id)}><Icon name="more" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
