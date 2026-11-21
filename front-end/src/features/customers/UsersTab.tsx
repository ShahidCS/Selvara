import { Chip, DataTable, Icon, StatusChip, type DTColumn, type DTRowAction } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import type { TableState } from "@/lib/dataTable";
import { ELEVATE_TEXT, sodMessage } from "@/lib/elevation";
import { useGo } from "@/lib/route";
import { getModState, setModState } from "@/lib/store";
import * as svc from "@/services/customers";
import { useGate } from "@/components/kit/admin/ElevateGate";
import { openActivity, openAddUser, openChangeRole, openEditUser, openRemoveUser } from "./UserForms";

type User = svc.TenantUser;

/** MFA state in the same words as the MFA Resets page: Enrolled, Reset pending, Not enrolled. */
export function MfaChip({ s }: { s: string }) {
  return s === "Reset pending" ? <Chip cls="warn" icon="clock">Reset pending</Chip> : <StatusChip s={s} />;
}

/** Prototype: usersTab, uToggle*, uBulk, uMenu, uAct (tenant user management, isolated by custId). The shared DataTable gives row select, the bulk bar and the row menu. */
export function UsersTab({ cid }: { cid: string }) {
  const L = useLayer(); const go = useGo(); const gate = useGate();
  const cust = svc.findCustomer(cid); const cn = cust ? cust.name : cid;
  const list = svc.usersFor(cid);
  const tableId = "customers-users-" + cid;
  const plural = (n: number) => (n !== 1 ? "s" : "");
  const clearSelection = () => { const st = getModState<TableState | null>("dt." + tableId, null); if (st) setModState("dt." + tableId, { ...st, selected: [] }); };

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
  const suspendMany = async (sel: User[]) => {
    if (!sel.length) return;
    try {
      await svc.bulkUsers(cid, sel.map((u) => u.id), "suspend");
      L.toast(sel.length + " user" + plural(sel.length) + " suspended");
      clearSelection();
    } catch (x) { L.toast(sodMessage(x, "That action could not be completed"), false); }
  };
  const exportMany = (sel: User[]) => { if (!sel.length) return; svc.auditUserExport(cid, sel.length); L.toast("Exported " + sel.length + " user" + plural(sel.length) + " (demo)"); };

  // Mutating items are disabled with the exact reason unless elevated; read-only items (activity, MFA module link) are always available.
  const rowActions = (u: User): DTRowAction<User>[] => {
    const lock = gate.locked ? ELEVATE_TEXT : null; const susp = u.status === "Suspended";
    return [
      { label: "Edit profile", whyNot: lock, run: () => openEditUser(L, u.id, cid) },
      { label: "Change role", whyNot: lock, run: () => openChangeRole(L, u.id, cid) },
      { label: "Request MFA reset (MFA Resets)", run: () => go("/admin/mfa") },
      { label: "Reset password", whyNot: lock, run: () => act("resetpw", u.id) },
      { label: "Resend invite", whyNot: lock, run: () => act("resend", u.id) },
      { label: "Resend email verification", whyNot: lock, run: () => act("verify", u.id) },
      { label: "Force sign-out", whyNot: lock, run: () => act("logout", u.id) },
      { label: "View activity", run: () => openActivity(L, u.id) },
      { label: susp ? "Reactivate user" : "Suspend user", whyNot: lock, run: () => act(susp ? "activate" : "suspend", u.id) },
      { label: "Remove user", whyNot: lock, run: () => openRemoveUser(L, u.id, cid) },
    ];
  };
  const cols: DTColumn<User>[] = [
    { key: "name", header: "User", locked: true, value: (u) => u.name, render: (u) => <><div className="strong">{u.name}</div><div style={{ fontSize: 11.5, color: "var(--muted)" }}>{u.email}</div></> },
    { key: "role", header: "Role", value: (u) => u.role, render: (u) => u.role },
    { key: "country", header: "Location", value: (u) => u.country, render: (u) => u.country },
    { key: "status", header: "Status", value: (u) => u.status, render: (u) => <StatusChip s={u.status} /> },
    { key: "mfa", header: "MFA", value: (u) => u.mfa, render: (u) => <MfaChip s={u.mfa} /> },
    { key: "last", header: "Last active", value: (u) => u.last, render: (u) => <span style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{u.last}</span> },
  ];

  const addBtn = <button className="btn btn-primary sm" disabled={gate.locked} title={gate.title} onClick={() => openAddUser(L, cid)}><Icon name="plus" />Add user</button>;
  if (!list.length) {
    return <div className="empty"><div className="ei"><Icon name="team" /></div><h4>No users yet</h4><p>This customer has no users in the directory. Add their first user, usually the company admin.</p>{addBtn}</div>;
  }
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px 8px", marginBottom: 10 }}>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}><div className="sectitle" style={{ margin: 0 }}>Directory, {cn}</div><span className="meta">Tenant {cid}</span></div>
        {addBtn}
      </div>
      <DataTable<User> id={tableId} label={`Users of ${cn}`} rows={list} rowKey={(u) => u.id} rowLabel={(u) => u.name} columns={cols} searchText={(u) => `${u.name} ${u.email} ${u.role}`}
        filters={[{ key: "status", label: "Status", options: Array.from(new Set(list.map((u) => u.status))), get: (u) => u.status }]}
        bulk={[
          { label: "MFA Resets", icon: "access", run: () => go("/admin/mfa") },
          { label: "Suspend", icon: "alert", disabled: gate.locked, title: gate.title, run: suspendMany },
          { label: "Export", icon: "download", run: exportMany },
        ]}
        rowActions={rowActions} emptyText="No users match. Adjust the search or filters." />
    </>
  );
}
