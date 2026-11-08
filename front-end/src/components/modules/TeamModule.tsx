import { Chip, Icon, Page, StatusChip, Table } from "@/components/ui";
import { DATA } from "@/lib/data";
import { SOD } from "@/lib/sod";
import { ROLES, ROLE_MODS } from "@/lib/rbac";
import { useEffect } from "react";
import { sodMessage, settle } from "@/lib/approvalFlow";
import { memberRole } from "@/lib/teamRoles";
import { sodReason } from "@/lib/sod";
import { PendingApprovals } from "./mfa/PendingApprovals";
import { bumpData, useApp, useData, useModState } from "@/lib/store";
import { useLayer } from "@/hooks/useLayer";
import * as svc from "@/services/team";
import { openPersonDrawer } from "./people/PersonDrawer";
import { ApproverForm, ChangeRoleForm, InviteForm } from "./team/TeamForms";
import { SettingsTab } from "./team/SettingsTab";

const VIEWS: [string, string][] = [["members", "Members"], ["settings", "Review cycles & SLAs"], ["gates", "Approvers & baseline"], ["perms", "Permissions"]];

export default function TeamModule() {
  useData();
  const L = useLayer();
  const manage = svc.teamCanManage(useApp((s) => s.role));
  const [v, setV] = useModState<string>("team.view", "members");
  const view = VIEWS.some((x) => x[0] === v) ? v : "members";
  const T = svc.TEAM_SETTINGS;
  useEffect(() => { const t = () => { svc.sweepInvites(); settle(); }; t(); const iv = setInterval(t, 30_000); return () => clearInterval(iv); }, []);
  const flush = view === "members" || view === "perms";
  const removeApprover = async (i: number) => {
    try { const a = await svc.removeApprover(i); if (a === null) { L.toast("Approver not found", false); return; } bumpData(); }
    catch (e) { L.toast(sodMessage(e, "Could not remove the approver"), false); }
  };
  const spaces: [string, string][] = [["ws", "Workspace"], ["admin", "Admin"]];
  return (
    <Page mod="team" acts={view === "members" && manage ? <button className="btn btn-primary" onClick={() => L.openModal("Invite someone", (close) => <InviteForm close={close} />)}><Icon name="plus" />Invite member</button> : undefined}>
      <div className="card" style={{ flex: "1 1 auto" }}>
        <div className="c-head"><div className="seg" role="tablist">{VIEWS.map((x) => <button key={x[0]} role="tab" aria-selected={view === x[0]} onClick={() => setV(x[0])}>{x[1]}</button>)}</div></div>
        <div className={`c-body ${flush ? "flush" : ""} scroll`} style={flush ? { padding: 0 } : undefined} id="teamBody">
          {view === "members" ? (
            <>
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
              <PendingApprovals kinds={svc.KINDS} title="Pending approvals (privileged roles and invitations)" subjectLabel="Subject" />
              {svc.INVITATIONS.length ? (
                <div className="card" style={{ boxShadow: "none" }}>
                  <div className="c-head"><h3>Invitations</h3><div className="r"><span className="tag">links expire after {SOD.INVITE_TTL_H} h</span></div></div>
                  <div className="c-body flush" style={{ padding: 0 }}>
                    <Table cols={[{ t: "Email" }, { t: "Role" }, { t: "Invited by" }, { t: "Expires" }, { t: "Status" }, { t: "" }]}>
                      {svc.INVITATIONS.map((v) => (
                        <tr key={v.id}>
                          <td className="strong">{v.email}</td><td>{v.role}</td><td style={{ fontSize: 12 }}>{v.invitedBy}</td>
                          <td className="num" style={{ fontSize: 12 }}>{new Date(v.expiresAt).toISOString().slice(0, 16).replace("T", " ")} UTC</td>
                          <td>{v.status === "Pending" ? <Chip cls="warn" icon="clock">Pending</Chip> : <Chip cls="neutral" icon="x">{v.status}</Chip>}</td>
                          <td className="r">{manage && v.status === "Pending" ? <button className="btn btn-ghost sm" aria-label={`Revoke invitation for ${v.email}`} onClick={async () => { try { await svc.revokeInvitation(v.id); L.toast("Invitation revoked"); } catch (e) { L.toast(sodMessage(e, "Could not revoke the invitation"), false); } }}><Icon name="x" />Revoke</button> : null}</td>
                        </tr>
                      ))}
                    </Table>
                  </div>
                </div>
              ) : null}
            </div>
            <Table cols={[{ t: "Member" }, { t: "Job title" }, { t: "Workspace role" }, { t: "MFA" }, { t: "Status" }, { t: "" }]}>
              {DATA.people.slice(0, 8).map((p) => (
                <tr key={p.id}>
                  <td className="strong">{p.name}</td><td>{p.role}</td><td>{memberRole(p)}</td>
                  <td>{p.mfa ? <Chip cls="ok" icon="check">Enrolled</Chip> : <Chip cls="neutral" icon="dot">No MFA</Chip>}</td>
                  <td><StatusChip s="Active" /></td>
                  <td className="r">{manage ? <button className="btn btn-ghost sm" disabled={!!sodReason("nobody changes their own role", p.name)} title={sodReason("nobody changes their own role", p.name) || undefined} aria-label={`Change role of ${p.name}`} onClick={() => L.openModal("Change role, " + p.name, (close) => <ChangeRoleForm personId={p.id} close={close} />)}><Icon name="access" />Role</button> : null}<button className="btn btn-ghost sm" aria-label={`Open ${p.name}`} onClick={() => openPersonDrawer(L, p.id)}><Icon name="team" />Open</button></td>
                </tr>
              ))}
            </Table>
            </>
          ) : view === "settings" ? <SettingsTab manage={manage} /> : view === "gates" ? (
            <div style={{ maxWidth: 640 }}>
              <div className="sectitle" style={{ marginTop: 0 }}>Procurement gate approvers</div>
              <Table cols={[{ t: "Approver" }, { t: "" }]}>
                {T.approvers.map((a, i) => (
                  <tr key={i}><td className="strong">{a}</td><td className="r">{manage ? <button className="btn btn-ghost sm" aria-label={`Remove approver ${a}`} onClick={() => removeApprover(i)}><Icon name="x" />Remove</button> : null}</td></tr>
                ))}
              </Table>
              {manage ? <button className="btn btn-ghost sm" style={{ marginTop: 8 }} onClick={() => L.openModal("Add approver", (close) => <ApproverForm close={close} />)}><Icon name="plus" />Add approver</button> : null}
              <div className="hr" /><div className="sectitle">Security baseline</div>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, color: "var(--ink-2)" }}>{T.baseline.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          ) : (
            <div className="scroll">
              <div style={{ padding: "0 0 8px 10px", fontSize: 12, color: "var(--muted)" }}>Server-side permission model: which roles may reach each space. Enforced by the route guard and nav filter.</div>
              <table className="tbl">
                <thead><tr><th scope="col">Role</th><th scope="col">Tenant</th>{spaces.map((s) => <th scope="col" key={s[0]}>{s[1]} modules</th>)}</tr></thead>
                <tbody>
                  {ROLES.map((r) => (
                    <tr key={r.id}>
                      <td className="strong">{r.name}</td>
                      <td>{r.tenant ? r.tenant : <span style={{ color: "var(--muted)" }}>Platform</span>}</td>
                      {spaces.map((s) => {
                        const m = (ROLE_MODS[r.id] || {})[s[0]];
                        return <td key={s[0]}>{m === "*" ? <Chip cls="ok" icon="check">All</Chip> : Array.isArray(m) ? <span className="num" style={{ fontSize: 12 }}>{m.length} modules</span> : <span style={{ color: "var(--faint)" }}>—</span>}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}
