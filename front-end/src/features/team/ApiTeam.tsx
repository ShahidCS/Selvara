import { useEffect, useState } from "react";
import { Chip, DataTable, Empty, Page, Segmented, StatusChip, type DTColumn } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { CUSTOM_BOUNDS, LOCKOUT, type LockoutPreset } from "@/lib/accountSecurity";
import { sodMessage } from "@/lib/approvalFlow";
import { ROLES } from "@/lib/rbac";
import { useApp, useData, useModState } from "@/lib/store";
import * as svc from "@/services/team";
import { JoinRequests } from "./JoinRequests";

/* Team & Settings in production (NEXT_PUBLIC_API_MODE=http): only what the server holds for the session's company. Members and requests to join
   come from the server, which scopes them to the company and decides who may see them; the account lockout is the company's own setting. Role
   changes, invitations and the other settings move here when their server slice ships (docs/architecture/BACKEND_FOUNDATION.md). */

const VIEWS: [string, string][] = [["members", "Members"], ["signin", "Sign-in protection"]];
const roleName = (id: string) => ROLES.find((r) => r.id === id)?.name ?? id;
const utc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function ApiTeam() {
  const manage = useApp((s) => s.role) === "admin";
  const company = useApp((s) => s.company);
  const [v, setV] = useModState<string>("team.api.view", "members");
  const view = VIEWS.some((x) => x[0] === v) ? v : "members";
  if (!manage) return <Page mod="team"><Empty icon="alert" title="Not available for your role">Team &amp; Settings is for company admins.</Empty></Page>;
  return (
    <Page mod="team" sub={company ? `People and sign-in settings of ${company.name}` : undefined}>
      <div className="card" style={{ flex: "1 1 auto" }}>
        <div className="c-head"><div className="seg" role="tablist">{VIEWS.map((x) => <button key={x[0]} role="tab" aria-selected={view === x[0]} onClick={() => setV(x[0])}>{x[1]}</button>)}</div></div>
        <div className={`c-body ${view === "members" ? "flush" : ""} scroll`} style={view === "members" ? { padding: 0 } : undefined}>
          {view === "members" ? <Members /> : <SignIn />}
        </div>
      </div>
    </Page>
  );
}

function Members() {
  const v = useData();
  const [rows, setRows] = useState<svc.MemberRow[] | null>(null); const [err, setErr] = useState("");
  useEffect(() => { let on = true; svc.listMembers().then((x) => { if (on) { setRows(x); setErr(""); } }, (e) => { if (on) setErr(sodMessage(e, "Could not load the members")); }); return () => { on = false; }; }, [v]);
  const cols: DTColumn<svc.MemberRow>[] = [
    { key: "name", header: "Member", value: (m) => m.name, locked: true, render: (m) => <span className="strong">{m.name}</span> },
    { key: "email", header: "Work email", value: (m) => m.email, render: (m) => m.email },
    { key: "role", header: "Workspace role", value: (m) => roleName(m.role), render: (m) => roleName(m.role) },
    { key: "status", header: "Status", value: (m) => m.status, render: (m) => (m.status === "Pending" ? <Chip cls="warn" icon="clock">Pending</Chip> : <StatusChip s={m.status} />) },
    { key: "since", header: "Since", value: (m) => m.since, render: (m) => <span className="num">{utc(m.since)}</span> },
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

const ruleNote = (l: svc.Lockout) => (l.preset === "custom" && l.custom ? `${l.custom.attempts} failed attempts lock the account for ${l.custom.minutes} minutes` : (LOCKOUT[l.preset as keyof typeof LOCKOUT] ?? LOCKOUT.standard).note);

function SignIn() {
  const L = useLayer();
  const [cur, setCur] = useState<svc.Lockout | null>(null); const [shown, setShown] = useState<LockoutPreset>("standard");
  const [att, setAtt] = useState(String(CUSTOM_BOUNDS.attempts[0] + 2)); const [mins, setMins] = useState("30"); const [cerr, setCerr] = useState(""); const [err, setErr] = useState("");
  const load = () => svc.getLockout().then((l) => { setCur(l); setShown(l.preset as LockoutPreset); if (l.custom) { setAtt(String(l.custom.attempts)); setMins(String(l.custom.minutes)); } setErr(""); }, (e) => setErr(sodMessage(e, "Could not load the setting")));
  useEffect(() => { void load(); }, []);
  const pick = async (p: LockoutPreset) => {
    setShown(p); setCerr(""); if (p === "custom") return; // Custom applies on Save
    try { await svc.setLockoutPreset(p); await load(); L.toast("Account lockout: " + LOCKOUT[p as keyof typeof LOCKOUT].label); } catch (e) { L.toast(sodMessage(e, "Could not change the lockout"), false); await load(); }
  };
  const saveCustom = async (e: React.FormEvent) => {
    e.preventDefault(); setCerr("");
    try { await svc.setLockoutPreset("custom", { attempts: Number(att), minutes: Number(mins) }); await load(); L.toast("Account lockout saved"); } catch (x) { setCerr(sodMessage(x, "Could not save the custom lockout")); }
  };
  if (err) return <p role="alert" style={{ color: "var(--bad-ink)" }}>{err}</p>;
  if (!cur) return <p style={{ color: "var(--muted)" }}>Loading…</p>;
  return (
    <>
      <div className="sectitle" style={{ marginTop: 0 }}>Account lockout</div>
      <p className="field help" style={{ margin: "0 0 8px", maxWidth: "62ch" }}>How many failed sign-ins lock an account in this company, and for how long. Now: {ruleNote(cur)}. Choose PCI DSS v4 if you handle card data, or Custom to match your regulator or internal policy ({CUSTOM_BOUNDS.attempts[0]} to {CUSTOM_BOUNDS.attempts[1]} attempts, {CUSTOM_BOUNDS.minutes[0]} to {CUSTOM_BOUNDS.minutes[1]} minutes). A person who belongs to several companies gets the strictest of their companies&apos; settings; platform accounts always use Strict. Every change is audited.</p>
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
