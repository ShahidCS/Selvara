import { useEffect, useState } from "react";
import { DataTable, Empty, Icon, Segmented, StatusChip, type DTColumn } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { apiMessage, utcMin } from "@/components/kit/serverRequests";
import { LOCKOUT } from "@/lib/accountSecurity";
import { ELEVATION_REASON_MIN, ROLE_LABEL } from "@/lib/rules";
import { bumpData, useData, useModState } from "@/lib/store";
import * as svc from "@/services/support";

/* Support access, the platform's side (slice 3b). Platform staff, super admins and support alike, see which companies have given a live support
   grant, open a read-only support session on one (reason, ticket, 60 minutes at most, never beyond the grant, one at a time) and read that
   company's members, sign-in setting and audit log. The company's own log records the session and every view. The server and the database
   refuse everything else; this page only asks and shows. */
const DURATIONS = ["15", "30", "60"] as const;
const PARTS: [svc.SupportWhat, string][] = [["members", "Members"], ["settings", "Sign-in setting"], ["audit", "Audit log"]];

export function ApiSupportSessions() {
  const v = useData(); const L = useLayer();
  const [data, setData] = useState<Awaited<ReturnType<typeof svc.getPlatformSupport>> | null>(null); const [err, setErr] = useState("");
  useEffect(() => { let on = true; svc.getPlatformSupport().then((x) => { if (on) { setData(x); setErr(""); } }, (e) => { if (on) setErr(apiMessage(e, "Could not load support access")); }); return () => { on = false; }; }, [v]);
  const end = async () => { try { await svc.closeSession(); bumpData(); L.toast("Support session ended"); } catch (x) { L.toast(apiMessage(x, "Could not end the session"), false); } };
  if (err) return <p role="alert" style={{ color: "var(--bad-ink)" }}>{err}</p>;
  if (!data) return <p style={{ color: "var(--muted)" }}>Loading…</p>;
  if (data.session) return <Session s={data.session} end={end} />;
  const cols: DTColumn<svc.LiveGrant>[] = [
    { key: "name", header: "Company", value: (g) => g.name, locked: true, render: (g) => <span className="strong">{g.name}</span> },
    { key: "ref", header: "Code", value: (g) => g.ref, render: (g) => <span className="num">{g.ref}</span> },
    { key: "reason", header: "Their reason", value: (g) => g.reason, render: (g) => g.reason },
    { key: "by", header: "Given by", value: (g) => g.grantedBy, render: (g) => g.grantedBy },
    { key: "exp", header: "Grant ends", value: (g) => g.expiresAt, render: (g) => <span className="num">{utcMin(g.expiresAt)}</span> },
    { key: "act", header: "Actions", hideHeader: true, render: (g) => <button className="btn btn-ghost sm" aria-label={`Open a support session: ${g.name}`} onClick={() => L.openModal(`Support session, ${g.name}`, (close) => <OpenForm g={g} close={close} />)}><Icon name="access" />Open session</button> },
  ];
  return (
    <>
      <p className="field help" style={{ marginTop: 0 }}>A company&apos;s workspace is closed to platform staff until one of its admins gives support access. A support session is read-only, needs a reason and a ticket, lasts 60 minutes at most and ends with the grant. The company sees the session and everything you look at in its own audit log.</p>
      {data.grants.length ? <DataTable<svc.LiveGrant> id="platform-support-grants" label="Live support grants" rows={data.grants} rowKey={(g) => g.id} columns={cols} searchText={(g) => `${g.name} ${g.ref} ${g.reason}`} exportName="support-grants" />
        : <Empty compact icon="access" title="No support access given">When a company&apos;s admin gives support access, it appears here.</Empty>}
    </>
  );
}

function OpenForm({ g, close }: { g: svc.LiveGrant; close: () => void }) {
  const L = useLayer();
  const [reason, setReason] = useState(""); const [ticket, setTicket] = useState(""); const [minutes, setMinutes] = useState<string>("30"); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return; setBusy(true); setErr("");
    try { await svc.openSession(g.ref, reason.trim(), ticket.trim().toUpperCase(), Number(minutes)); close(); bumpData(); L.toast(`Support session open in ${g.name}`); }
    catch (x) { setErr(apiMessage(x, "Could not open the support session")); setBusy(false); }
  };
  return (
    <form onSubmit={go} noValidate>
      <p style={{ margin: "0 0 12px", lineHeight: 1.5 }}>Read-only. It ends after the duration you choose, or when the grant ends at {utcMin(g.expiresAt)}, whichever comes first. {g.name} sees your name, reason, ticket and every view in its audit log.</p>
      <div className="field"><label htmlFor="ss-reason">Reason (at least {ELEVATION_REASON_MIN} characters)</label><textarea className="input" id="ss-reason" data-focus rows={3} maxLength={300} style={{ resize: "vertical" }} value={reason} onChange={(e) => { setReason(e.target.value); setErr(""); }} aria-invalid={!!err} aria-describedby="ss-err" /></div>
      <div className="field"><label htmlFor="ss-ticket">Ticket</label><input className="input" id="ss-ticket" maxLength={13} autoComplete="off" placeholder="SUP-1234" value={ticket} onChange={(e) => { setTicket(e.target.value); setErr(""); }} aria-invalid={!!err} aria-describedby="ss-err" /></div>
      <div className="field"><Segmented<string> label="Duration" value={minutes} onChange={setMinutes} options={DURATIONS.map((m) => ({ value: m, label: `${m} minutes` }))} /></div>
      <p className="field help" id="ss-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      <div className="btngrp" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>Open session</button>
      </div>
    </form>
  );
}

function Session({ s, end }: { s: svc.SupportSession; end: () => void }) {
  const [part, setPart] = useModState<string>("customers.api.support.part", "members");
  const what = (PARTS.some((x) => x[0] === part) ? part : "members") as svc.SupportWhat;
  const [got, setGot] = useState<svc.SupportView | null>(null); const [err, setErr] = useState("");
  useEffect(() => { let on = true; svc.viewCompany(what).then((x) => { if (on) { setGot(x); setErr(""); } }, (e) => { if (on) setErr(apiMessage(e, "Could not load this part")); }); return () => { on = false; }; }, [what]);
  const view = got?.what === what ? got : null; // the part just chosen, not the one before it
  return (
    <>
      <div className="banner warn" role="status" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Icon name="access" /><span style={{ flex: "1 1 260px" }}><b>Support session in {s.company.name}</b> until {utcMin(s.expiresAt)} (ticket {s.ticket}). Read-only. {s.company.name} sees every view in its audit log.</span>
        <button className="btn btn-secondary sm" onClick={end}>End session</button>
      </div>
      <div className="seg" role="tablist" style={{ marginBottom: 12 }}>{PARTS.map((x) => <button key={x[0]} role="tab" aria-selected={what === x[0]} onClick={() => setPart(x[0])}>{x[1]}</button>)}</div>
      {err ? <p role="alert" style={{ color: "var(--bad-ink)" }}>{err}</p> : !view ? <p style={{ color: "var(--muted)" }}>Loading…</p> : <Part v={view} />}
    </>
  );
}

type Member = Extract<svc.SupportView, { what: "members" }>["members"][number];
type Line = svc.SupportLogLine;
function Part({ v }: { v: svc.SupportView }) {
  if (v.what === "settings") {
    const l = v.lockout; const note = l.preset === "custom" && l.custom ? `Custom: ${l.custom.attempts} failed attempts lock an account for ${l.custom.minutes} minutes.` : (LOCKOUT[l.preset as keyof typeof LOCKOUT] ?? LOCKOUT.standard).note;
    return <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "6px 16px", margin: 0 }}><dt>Account lockout</dt><dd>{(LOCKOUT[l.preset as keyof typeof LOCKOUT]?.label ?? "Custom")}. {note}</dd></dl>;
  }
  if (v.what === "members") {
    const cols: DTColumn<Member>[] = [
      { key: "name", header: "Member", value: (m) => m.name, locked: true, render: (m) => <span className="strong">{m.name}</span> },
      { key: "email", header: "Work email", value: (m) => m.email, render: (m) => m.email },
      { key: "role", header: "Workspace role", value: (m) => ROLE_LABEL[m.role] ?? m.role, render: (m) => ROLE_LABEL[m.role] ?? m.role },
      { key: "status", header: "Status", value: (m) => m.status, render: (m) => <StatusChip s={m.status} /> },
      { key: "since", header: "Since", value: (m) => m.since, render: (m) => <span className="num">{utcMin(m.since)}</span> },
    ];
    return <DataTable<Member> id="support-view-members" label="Members" rows={v.members} rowKey={(m) => m.email} columns={cols} searchText={(m) => `${m.name} ${m.email} ${m.role}`} />;
  }
  const cols: DTColumn<Line>[] = [
    { key: "at", header: "When", value: (x) => x.at, locked: true, render: (x) => <span className="num">{utcMin(x.at)}</span> },
    { key: "who", header: "Who", value: (x) => x.actor, render: (x) => x.actor },
    { key: "action", header: "Action", value: (x) => x.action, render: (x) => <span className="num">{x.action}</span> },
    { key: "target", header: "Details", value: (x) => x.target, render: (x) => x.target },
  ];
  return <DataTable<Line> id="support-view-audit" label="Audit log" rows={v.entries} rowKey={(x) => `${x.at}-${x.action}-${x.target}`} columns={cols} searchText={(x) => `${x.actor} ${x.action} ${x.target}`} />;
}
