import { Chip, DataTable, Icon, Page, StatusChip, Table, type DTColumn, Avatar } from "@/components/ui";
import { RulesTab } from "./RulesTab";
import { RetentionTab } from "./RetentionTab";
import { JoinRequests } from "./JoinRequests";
import { DATA } from "@/lib/data";
import { SOD } from "@/lib/sod";
import { API_ON, ROLES, ROLE_MODS } from "@/lib/rbac";
import { ApiTeam } from "./ApiTeam";
import { useEffect } from "react";
import { sodMessage, settle } from "@/lib/approvalFlow";
import { memberRole } from "@/lib/teamRoles";
import { sodReason } from "@/lib/sod";
import { PendingApprovals } from "@/features/mfa";
import { useApp, useData, useModState } from "@/lib/store";
import { useLayer } from "@/hooks/useLayer";
import * as svc from "@/services/team";
import { useOpenPerson } from "@/features/people";
import { useGo, useRoute } from "@/lib/route";
import { ApproverForm, ChangeRoleForm } from "./TeamForms";
import { askReason } from "@/components/kit/ReasonDialog";
import { InviteFormPage } from "./InviteFormPage";
import { SettingsTab } from "./SettingsTab";

const VIEWS: [string, string][] = [["members", "Members"], ["settings", "Review cycles & SLAs"], ["gates", "Approvers & baseline"], ["perms", "Permissions"], ["rules", "Automation rules"], ["retention", "Data retention"]];

/** `/ws/team` shows the tab selected here; `/ws/team/invite` is a form page. */
export default function TeamModule() {
  const { param } = useRoute();
  if (API_ON) return <ApiTeam />; // production: the company's data from the server (decision D4)
  if (param === "invite") return <InviteFormPage />;
  return <TeamTabs />;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Member = any;

function TeamTabs() {
  useData();
  const go = useGo();
  const L = useLayer(); const openPerson = useOpenPerson();
  const manage = svc.teamCanManage(useApp((s) => s.role));
  const [v, setV] = useModState<string>("team.view", "members");
  const view = VIEWS.some((x) => x[0] === v) ? v : "members";
  const T = svc.TEAM_SETTINGS;
  useEffect(() => { const t = () => { svc.sweepInvites(); settle(); }; t(); const iv = setInterval(t, 30_000); return () => clearInterval(iv); }, []);
  const flush = view === "members" || view === "perms";
  const removeApprover = (i: number, name: string) => askReason(L, { title: `Remove ${name} as approver?`, label: "", danger: true, confirm: "Remove approver",
    intro: "They no longer approve procurement requests. You can add them again later.",
    run: async () => { const a = await svc.removeApprover(i); if (a === null) throw new Error("Approver not found"); return "Approver removed"; } });
  const memberCols: DTColumn<Member>[] = [
    { key: "name", header: "Member", value: (p) => p.name, locked: true, render: (p) => <span className="person"><Avatar name={p.name} /><span className="strong">{p.name}</span></span>, sub: (p) => p.role },
    { key: "title", header: "Job title", value: (p) => p.role, render: (p) => p.role },
    { key: "role", header: "Workspace role", value: (p) => memberRole(p), render: (p) => memberRole(p) },
    { key: "mfa", header: "MFA", value: (p) => (p.mfa ? "Enrolled" : "No MFA"), render: (p) => (p.mfa ? <Chip cls="ok" icon="check">Enrolled</Chip> : <Chip cls="neutral" icon="dot">No MFA</Chip>) },
    { key: "status", header: "Status", value: () => "Active", render: () => <StatusChip s="Active" /> },
    { key: "act", header: "Actions", hideHeader: true, align: "end", locked: true, render: (p) => (manage ? (sodReason("nobody changes their own role", p.name)
      ? <span style={{ color: "var(--muted)", fontSize: 12, whiteSpace: "nowrap" }}>You<span className="vh">: another admin changes your role</span></span>
      : <button className="btn btn-ghost sm" aria-label={`Change role of ${p.name}`} onClick={() => L.openModal("Change role, " + p.name, (close) => <ChangeRoleForm personId={p.id} close={close} />)}><Icon name="access" />Role</button>) : null) },
  ];
  const spaces: [string, string][] = [["ws", "Company"], ["admin", "Admin Console"]];
  return (
    <Page mod="team" acts={view === "members" && manage ? <button className="btn btn-primary" data-tour="team-invite" onClick={() => go("/ws/team/invite")}><Icon name="plus" />Invite member</button> : undefined}>
      <div className="card" style={{ flex: "1 1 auto" }}>
        <div className="c-head" style={{ padding: "0 8px" }}><div className="tabs" role="tablist" aria-label="Team and rules" data-tour="team-views">{VIEWS.map((x) => <button key={x[0]} className="tab" role="tab" aria-selected={view === x[0]} onClick={() => setV(x[0])}>{x[1]}</button>)}</div></div>
        <div className={`c-body ${flush ? "flush" : ""} scroll`} style={flush ? { padding: 0 } : undefined} id="teamBody" data-tour="team-body">
          {view === "members" ? (
            <>
            <div className="empty:hidden" data-tour="team-approvals" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
              <JoinRequests manage={manage} />
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
            <DataTable<Member> id="team-members" label="Members" rows={DATA.people.slice(0, 8)} rowKey={(p) => p.id} columns={memberCols} searchText={(p) => `${p.name} ${p.role} ${memberRole(p)}`}
              filters={[{ key: "role", label: "Workspace role", options: Array.from(new Set(DATA.people.slice(0, 8).map((p: Member) => memberRole(p)))), get: (p: Member) => memberRole(p) }]}
              onOpen={(p) => openPerson(p.id)} exportName="members" />
            </>
          ) : view === "rules" ? <><PendingApprovals kinds={["team-rule"]} title="Pending approvals (rules)" subjectLabel="Rule" /><RulesTab manage={manage} /></> : view === "retention" ? <><PendingApprovals kinds={["team-retention", "team-hold"]} title="Pending approvals (retention and holds)" subjectLabel="Records" /><RetentionTab manage={manage} /></> : view === "settings" ? <SettingsTab manage={manage} /> : view === "gates" ? (
            <div style={{ maxWidth: 640 }}>
              <div className="sectitle" style={{ marginTop: 0 }}>Procurement gate approvers</div>
              <Table cols={[{ t: "Approver" }, { t: "" }]}>
                {T.approvers.map((a, i) => (
                  <tr key={i}><td className="strong">{a}</td><td className="r">{manage ? <button className="btn btn-ghost sm" aria-label={`Remove approver ${a}`} onClick={() => removeApprover(i, a)}><Icon name="trash" />Remove</button> : null}</td></tr>
                ))}
              </Table>
              {manage ? <button className="btn btn-ghost sm" style={{ marginTop: 8 }} onClick={() => L.openModal("Add approver", (close) => <ApproverForm close={close} />)}><Icon name="plus" />Add approver</button> : null}
              <div className="hr" /><div className="sectitle">Security baseline</div>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, color: "var(--ink-2)" }}>{T.baseline.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          ) : (
            <div className="scroll">
              <div style={{ padding: "12px 14px 8px", fontSize: 12, color: "var(--muted)" }}>Server-side permission model: which roles may reach each space. Enforced by the route guard and nav filter.</div>
              <table className="tbl">
                <thead><tr><th scope="col">Role</th><th scope="col">Tenant</th>{spaces.map((s) => <th scope="col" key={s[0]}>{s[1]} modules</th>)}</tr></thead>
                <tbody>
                  {ROLES.filter((r, i) => ROLES.findIndex((x) => x.name === r.name) === i).map((r) => (
                    <tr key={r.id}>
                      <td className="strong">{r.name}</td>
                      <td>{r.tenant ? r.tenant : <span style={{ color: "var(--muted)" }}>{r.spaces.includes("admin") ? "Platform" : "External"}</span>}</td>
                      {spaces.map((s) => {
                        const m = (ROLE_MODS[r.id] || {})[s[0]];
                        return <td key={s[0]}>{m === "*" ? <Chip cls="ok" icon="check">All</Chip> : Array.isArray(m) ? <span className="num" style={{ fontSize: 12 }}>{m.length} {m.length === 1 ? "module" : "modules"}</span> : <span style={{ color: "var(--faint)" }}>—</span>}</td>;
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
