import { useEffect, useState } from "react";
import { Chip, DataTable, Empty, Icon, Listbox, Page, Segmented, StatusChip, type DTColumn, Avatar } from "@/components/ui";
import { LayerFoot, useLayer } from "@/hooks/useLayer";
import { CUSTOM_BOUNDS, LOCKOUT, type LockoutPreset } from "@/lib/accountSecurity";
import { apiMessage, notSentText, RequestsTable, utcMin } from "@/components/kit/serverRequests";
import { ASSIGNABLE_ROLES, isAssignableRole, isPrivilegedRole, ROLE_LABEL } from "@/lib/rules";
import { bumpData, useApp, useData, useModState } from "@/lib/store";
import * as svc from "@/services/team";
import { ApiSupportAccess } from "./ApiSupportAccess";
import { JoinRequests } from "./JoinRequests";

/* Team & Rules in production (NEXT_PUBLIC_API_MODE=http): only what the server holds for the session's company. Members and requests to join
   come from the server, which scopes them to the company and decides who may see them; the account lockout is the company's own setting. Role
   changes and invitations go through the server's four-eyes engine (slice 2c): admin and owner need a second admin's approval, shown under
   Requests. Support access (slice 3b) is the company's read-only, revocable grant to Selvara support, with every session it allowed. The other settings move here when their server slice ships (docs/architecture/BACKEND_FOUNDATION.md). */

const VIEWS: [string, string][] = [["members", "Members"], ["invitations", "Invitations"], ["requests", "Requests"], ["signin", "Sign-in protection"], ["support", "Support access"]];
const roleName = (id: string) => ROLE_LABEL[id] ?? id;
/** The server's own words for a refusal (it never sends internal details); anything else gets the fallback. */
const why = apiMessage;
const utc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function ApiTeam() {
  const manage = useApp((s) => s.role) === "admin";
  const company = useApp((s) => s.company);
  const [v, setV] = useModState<string>("team.api.view", "members");
  const view = VIEWS.some((x) => x[0] === v) ? v : "members";
  if (!manage) return <Page mod="team"><Empty icon="alert" title="Not available for your role">Team &amp; Rules is for company admins.</Empty></Page>;
  return (
    <Page mod="team" sub={company ? `People and sign-in settings of ${company.name}` : undefined}>
      <div className="card">
        <div className="c-head" style={{ padding: "0 8px" }}><div className="tabs" role="tablist" aria-label="Team and rules" data-tour="team-views">{VIEWS.map((x) => <button key={x[0]} className="tab" role="tab" data-tour={x[0] === "requests" ? "team-approvals" : undefined} aria-selected={view === x[0]} onClick={() => setV(x[0])}>{x[1]}</button>)}</div></div>
        <div className={`c-body ${view === "members" ? "flush" : ""} scroll`} style={view === "members" ? { padding: 0 } : undefined} data-tour="team-body">
          {view === "members" ? <Members /> : view === "invitations" ? <Invitations /> : view === "requests" ? <RequestsTable id="team-requests-api" load={svc.listApprovals} decide={svc.decideRequest} note="Granting or inviting an admin or owner needs a second admin. Nobody approves their own request or a request about themselves. A request expires after 72 hours." /> : view === "signin" ? <SignIn /> : <ApiSupportAccess />}
        </div>
      </div>
    </Page>
  );
}

function Members() {
  const v = useData();
  const [rows, setRows] = useState<svc.MemberRow[] | null>(null); const [err, setErr] = useState("");
  const L = useLayer();
  useEffect(() => { let on = true; svc.listMembers().then((x) => { if (on) { setRows(x); setErr(""); } }, (e) => { if (on) setErr(why(e, "Could not load the members")); }); return () => { on = false; }; }, [v]);
  const cols: DTColumn<svc.MemberRow>[] = [
    { key: "name", header: "Member", value: (m) => m.name, locked: true, render: (m) => <span className="person"><Avatar name={m.name} /><span className="strong">{m.name}</span></span> },
    { key: "email", header: "Work email", value: (m) => m.email, render: (m) => m.email },
    { key: "role", header: "Workspace role", value: (m) => roleName(m.role), render: (m) => roleName(m.role) },
    { key: "status", header: "Status", value: (m) => m.status, render: (m) => (m.status === "Pending" ? <Chip cls="warn" icon="clock">Pending</Chip> : <StatusChip s={m.status} />) },
    { key: "since", header: "Since", value: (m) => m.since, render: (m) => <span className="num">{utc(m.since)}</span> },
    { key: "act", header: "Actions", render: (m) => (m.status === "Active" && !m.me ? <button className="btn btn-ghost sm" aria-label={`Change role: ${m.name}`} onClick={() => L.openModal(`Change role, ${m.name}`, (close) => <RoleForm m={m} close={close} />)}><Icon name="edit" />Change role</button> : null) },
  ];
  return (
    <>
      <div style={{ padding: 12 }}><JoinRequests manage /></div>
      {err ? <p role="alert" style={{ padding: "0 12px", color: "var(--bad-ink)" }}>{err}</p> : null}
      {rows ? (
        <DataTable<svc.MemberRow> id="team-members-api" label="Members" rows={rows} rowKey={(m) => m.id} columns={cols} searchText={(m) => `${m.name} ${m.email} ${roleName(m.role)}`}
          filters={[{ key: "role", label: "Workspace role", options: Array.from(new Set(rows.map((m) => roleName(m.role)))), get: (m) => roleName(m.role) }]} exportName="members" />
      ) : err ? null : <p style={{ padding: 12, color: "var(--muted)" }}>Loading members…</p>}
    </>
  );
}

function RoleForm({ m, close }: { m: svc.MemberRow; close: () => void }) {
  const L = useLayer();
  const [role, setRole] = useState(m.role); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return; setBusy(true);
    try {
      const r = await svc.changeRole(m.id, role); close(); bumpData();
      L.toast(r.pending ? `Request sent: a second admin approves ${roleName(role)} for ${m.name} (Requests)` : `${m.name} is now ${roleName(role)}`);
    } catch (e) { setErr(why(e, "Could not change the role")); setBusy(false); }
  };
  return (
    <>
      <div className="field"><label htmlFor="rf-role">Workspace role</label>
        {/* G1: the shared listbox opens under the field, never over the dialog. G3: every role a member can hold is listed; one that cannot be
            assigned here (a Trust Center visitor joins by request, not by role change) shows why. */}
        <Listbox id="rf-role" label="Workspace role" value={role} onChange={(v) => { setRole(v); setErr(""); }} invalid={!!err} describedBy="rf-help rf-err"
          options={[...ASSIGNABLE_ROLES.map((r) => ({ value: r as string, label: roleName(r) })),
            ...(isAssignableRole(m.role) ? [] : [{ value: m.role, label: roleName(m.role), disabled: "Current role. It cannot be given by a role change: the person joins this way through a Trust Center request." }])]} /></div>
      <p className="field help" id="rf-help">{isPrivilegedRole(role) ? "Admin and owner roles need a second admin's approval. The change applies when they approve." : "Applies at once. Recorded in the audit log with your name."}</p>
      <p className="field help" id="rf-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      <LayerFoot>
        <button className="btn btn-secondary" onClick={close}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || role === m.role} onClick={go}>{isPrivilegedRole(role) ? "Request change" : "Change role"}</button>
      </LayerFoot>
    </>
  );
}

function Invitations() {
  const v = useData(); const L = useLayer();
  const [rows, setRows] = useState<svc.InvitationItem[] | null>(null); const [err, setErr] = useState("");
  const [email, setEmail] = useState(""); const [role, setRole] = useState("employee"); const [ferr, setFerr] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { let on = true; svc.listInvitations().then((x) => { if (on) { setRows(x); setErr(""); } }, (e) => { if (on) setErr(why(e, "Could not load the invitations")); }); return () => { on = false; }; }, [v]);
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return; setBusy(true); setFerr("");
    try {
      const r = await svc.invite(email, role); bumpData(); const to = email.trim().toLowerCase(); setEmail("");
      if (r.pending) L.toast(`Request sent: a second admin approves inviting ${to} as ${roleName(role)} (Requests)`);
      else if (r.emailed) L.toast(`Invitation emailed to ${to}`);
      else L.toast(notSentText(to, r.mail), false);
    } catch (x) { setFerr(why(x, "Could not create the invitation")); }
    setBusy(false);
  };
  const newLink = async (i: svc.InvitationItem) => {
    try { const r = await svc.inviteLink(i.id); bumpData(); if (r.emailed) L.toast(`A new invitation was emailed to ${i.email}`); else L.toast(notSentText(i.email, r.mail), false); }
    catch (x) { L.toast(why(x, "Could not send the invitation"), false); }
  };
  const revoke = async (i: svc.InvitationItem) => { try { await svc.revokeInvite(i.id); bumpData(); L.toast(`Invitation for ${i.email} revoked`); } catch (x) { L.toast(why(x, "Could not revoke the invitation"), false); } };
  const chip = (s: svc.InvitationItem["status"]) => (s === "Pending" ? <Chip cls="warn" icon="clock">Pending</Chip> : <StatusChip s={s} />);
  const cols: DTColumn<svc.InvitationItem>[] = [
    { key: "email", header: "Email", value: (i) => i.email, locked: true, render: (i) => <span className="strong">{i.email}</span> },
    { key: "role", header: "Role", value: (i) => roleName(i.role), render: (i) => roleName(i.role) },
    { key: "status", header: "Status", value: (i) => i.status, render: (i) => chip(i.status) },
    { key: "by", header: "Invited by", value: (i) => i.invitedBy, render: (i) => i.invitedBy },
    { key: "exp", header: "Expires", value: (i) => i.expiresAt, render: (i) => <span className="num">{utcMin(i.expiresAt)}</span> },
    { key: "act", header: "Actions", render: (i) => (i.status === "Pending" ? (
      <div className="btngrp" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-ghost sm" aria-label={`${i.linkAt ? "Send again" : "Send invitation"}: ${i.email}`} onClick={() => newLink(i)}><Icon name="refresh" />{i.linkAt ? "Send again" : "Send invitation"}</button>
        <button className="btn btn-ghost sm" aria-label={`Revoke: ${i.email}`} onClick={() => revoke(i)}><Icon name="x" />Revoke</button>
      </div>) : null) },
  ];
  return (
    <>
      <form onSubmit={send} noValidate data-tour="team-invite" style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr) auto", gap: 8, alignItems: "end", maxWidth: 720 }}>
        <div className="field" style={{ margin: 0 }}><label htmlFor="iv-email">Work email</label><input className="input" id="iv-email" type="email" autoComplete="off" maxLength={254} value={email} onChange={(e) => { setEmail(e.target.value); setFerr(""); }} aria-invalid={!!ferr} aria-describedby="iv-help iv-err" /></div>
        <div className="field" style={{ margin: 0 }}><label htmlFor="iv-role">Role</label><select className="input" id="iv-role" value={role} onChange={(e) => setRole(e.target.value)}>{ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{roleName(r)}</option>)}</select></div>
        <button type="submit" className="btn btn-primary" disabled={busy}>Invite</button>
      </form>
      <p className="field help" id="iv-help">Selvara emails the person an invitation link. It works once, only for that email address, for 72 hours. {isPrivilegedRole(role) ? "Admin and owner invitations need a second admin's approval first; then send the invitation here." : ""}</p>
      <p className="field help" id="iv-err" role="alert" style={{ color: "var(--bad-ink)", display: ferr ? "block" : "none" }}>{ferr}</p>
      {err ? <p role="alert" style={{ color: "var(--bad-ink)" }}>{err}</p> : null}
      {rows ? (rows.length ? <DataTable<svc.InvitationItem> id="team-invitations-api" label="Invitations" rows={rows} rowKey={(i) => i.id} columns={cols} searchText={(i) => `${i.email} ${roleName(i.role)} ${i.status}`} exportName="invitations" />
        : <Empty compact icon="team" title="No invitations yet" />) : err ? null : <p style={{ color: "var(--muted)" }}>Loading invitations…</p>}
    </>
  );
}

const ruleNote = (l: svc.Lockout) => (l.preset === "custom" && l.custom ? `${l.custom.attempts} failed attempts lock the account for ${l.custom.minutes} minutes` : (LOCKOUT[l.preset as keyof typeof LOCKOUT] ?? LOCKOUT.standard).note);

function SignIn() {
  const L = useLayer();
  const [cur, setCur] = useState<svc.Lockout | null>(null); const [shown, setShown] = useState<LockoutPreset>("standard");
  const [att, setAtt] = useState(String(CUSTOM_BOUNDS.attempts[0] + 2)); const [mins, setMins] = useState("30"); const [cerr, setCerr] = useState(""); const [err, setErr] = useState("");
  const load = () => svc.getLockout().then((l) => { setCur(l); setShown(l.preset as LockoutPreset); if (l.custom) { setAtt(String(l.custom.attempts)); setMins(String(l.custom.minutes)); } setErr(""); }, (e) => setErr(why(e, "Could not load the setting")));
  useEffect(() => { void load(); }, []);
  const pick = async (p: LockoutPreset) => {
    setShown(p); setCerr(""); if (p === "custom") return; // Custom applies on Save
    try { await svc.setLockoutPreset(p); await load(); L.toast("Account lockout: " + LOCKOUT[p as keyof typeof LOCKOUT].label); } catch (e) { L.toast(why(e, "Could not change the lockout"), false); await load(); }
  };
  const saveCustom = async (e: React.FormEvent) => {
    e.preventDefault(); setCerr("");
    try { await svc.setLockoutPreset("custom", { attempts: Number(att), minutes: Number(mins) }); await load(); L.toast("Account lockout saved"); } catch (x) { setCerr(why(x, "Could not save the custom lockout")); }
  };
  if (err) return <p role="alert" style={{ color: "var(--bad-ink)" }}>{err}</p>;
  if (!cur) return <p style={{ color: "var(--muted)" }}>Loading…</p>;
  return (
    <>
      <div className="sectitle" style={{ marginTop: 0 }}>Account lockout</div>
      <p className="field help" style={{ margin: "0 0 8px" }}>How many failed sign-ins lock an account in this company, and for how long. Now: {ruleNote(cur)}. Choose PCI DSS v4 if you handle card data, or Custom to match your regulator or internal policy ({CUSTOM_BOUNDS.attempts[0]} to {CUSTOM_BOUNDS.attempts[1]} attempts, {CUSTOM_BOUNDS.minutes[0]} to {CUSTOM_BOUNDS.minutes[1]} minutes). A person who belongs to several companies gets the strictest of their companies&apos; settings; platform accounts always use Strict. Every change is audited.</p>
      <Segmented<LockoutPreset> label="Account lockout" value={shown} onChange={pick} options={[...(Object.keys(LOCKOUT) as LockoutPreset[]).map((k) => ({ value: k, label: LOCKOUT[k as keyof typeof LOCKOUT].label })), { value: "custom" as LockoutPreset, label: "Custom" }]} />
      {shown === "custom" ? (
        <form onSubmit={saveCustom} noValidate style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "end", marginTop: 8, maxWidth: 520 }}>
          <div className="field" style={{ margin: 0 }}><label htmlFor="alk-att">Failed attempts</label><input className="input num" id="alk-att" type="number" min={CUSTOM_BOUNDS.attempts[0]} max={CUSTOM_BOUNDS.attempts[1]} value={att} onChange={(e) => setAtt(e.target.value)} aria-invalid={!!cerr} aria-describedby={cerr ? "alk-err" : undefined} /></div>
          <div className="field" style={{ margin: 0 }}><label htmlFor="alk-min">Lock for (minutes)</label><input className="input num" id="alk-min" type="number" min={CUSTOM_BOUNDS.minutes[0]} max={CUSTOM_BOUNDS.minutes[1]} value={mins} onChange={(e) => setMins(e.target.value)} aria-invalid={!!cerr} aria-describedby={cerr ? "alk-err" : undefined} /></div>
          <button type="submit" className="btn btn-secondary">Save</button>
        </form>
      ) : null}
      <p className="field help" id="alk-err" role="alert" style={{ color: "var(--bad-ink)", display: cerr ? "block" : "none", marginTop: 6 }}>{cerr}</p>
    </>
  );
}
