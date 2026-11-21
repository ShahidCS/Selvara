import { useCallback, useEffect, useState } from "react";
import { Chip, DataTable, Empty, Icon, Page, StatusChip, type DTColumn } from "@/components/ui";
import { LayerFoot } from "@/components/shell/LayerProvider";
import { ServerElevationBanner, useServerElevation, ELEVATE_TEXT } from "@/components/kit/admin/ServerElevation";
import { apiMessage, RequestsTable, utcMin } from "@/components/kit/serverRequests";
import { useLayer } from "@/hooks/useLayer";
import { bumpData, useData, useModState } from "@/lib/store";
import { apiFetch } from "@/services/http";
import * as platform from "@/services/platform";

/* MFA Resets in production (programme group 8a; SOD_MATRIX section 4): a company admin or owner who lost their authenticator. Support (or an
   elevated super admin) asks after three identity checks, with a reason, details and a ticket, naming a second platform super admin; only
   that person decides, never the requester or the person being reset. On approval the server removes the person's authenticators and
   recovery codes and ends every session; the person and the company's log are told. Members of a company are reset by their own admins. */
interface Admin { tenantId: string; ref: string; company: string; userId: string; person: string; email: string; role: string; mfa: string; pending: boolean }
interface Req { id: string; status: string; title: string; requestedBy: string; mine: boolean; named: string; ticket: string; reason: string; person: string; company: string; at: number; expiresAt: number; decided: string | null }
interface Data { admins: Admin[]; supers: { id: string; name: string }[]; checks: string[]; reasons: string[]; requests: Req[] }
const CHECK_TEXT: Record<string, string> = {
  "call-back": "Called the person back on the phone number the company already has on record (not one they gave in this request).",
  sponsor: "Another admin or owner of the same company confirmed the request.",
  id: "Checked a government ID or the company's own identity process, without keeping a copy.",
};
const EFFECTS = ["Their authenticators and recovery codes are removed.", "Every session they have ends, in every company.", "They enrol a new authenticator at their next sign-in.", "They and their company's audit log are told."];

export function ApiMfa() {
  const v = useData(); const s = useServerElevation(); const L = useLayer();
  const [d, setD] = useState<Data | null>(null); const [err, setErr] = useState("");
  const [view, setView] = useModState<string>("mfa.api.view", "admins");
  useEffect(() => { let on = true; apiFetch<Data>("/admin/mfa").then((x) => { if (on) { setD(x); setErr(""); } }, (e) => { if (on) setErr(apiMessage(e, "Could not load the company admins")); }); return () => { on = false; }; }, [v]);
  const lock = s.canElevate && s.locked ? ELEVATE_TEXT : undefined; // support asks without an elevation; a super admin elevates first
  const cols: DTColumn<Admin>[] = [
    { key: "person", header: "Admin", value: (a) => a.person, locked: true, render: (a) => <><span className="strong">{a.person}</span><div style={{ fontSize: 12, color: "var(--muted)" }}>{a.email}</div></> },
    { key: "company", header: "Company", value: (a) => a.company, render: (a) => <>{a.company}<div style={{ fontSize: 12, color: "var(--muted)" }}>{a.ref}</div></> },
    { key: "role", header: "Role", value: (a) => a.role, render: (a) => (a.role === "owner" ? "Owner" : "Admin") },
    { key: "mfa", header: "MFA", value: (a) => (a.pending ? "Reset pending" : a.mfa), render: (a) => (a.pending ? <Chip cls="warn" icon="clock">Reset pending</Chip> : <StatusChip s={a.mfa} />) },
  ];
  const history = d?.requests.filter((r) => r.status !== "Pending") ?? [];
  return (
    <Page mod="mfa" sub="Multi-factor resets for company admins and owners: three identity checks and a named second approver.">
      <ServerElevationBanner s={s} />
      <div className="card" data-tour="mfa-admins" style={{ flex: "1 1 auto" }}>
        <div className="c-head"><div className="seg" role="tablist" aria-label="MFA reset views" data-tour="mfa-views">{[["admins", "Company admins"], ["requests", "Requests"], ["history", "History"]].map((x) => <button key={x[0]} role="tab" aria-selected={view === x[0]} onClick={() => setView(x[0])}>{x[1]}</button>)}</div></div>
        <div className="c-body scroll">
          {err ? <p role="alert" style={{ color: "var(--bad-ink)" }}>{err}</p> : !d ? <p style={{ color: "var(--muted)" }}>Loading…</p>
            : view === "requests" ? <MfaRequests />
            : view === "history" ? (history.length ? <History rows={history} /> : <Empty icon="check" title="No resets yet">Decided, withdrawn and expired requests are listed here.</Empty>)
            : d.admins.length ? (
              <DataTable<Admin> id="mfa-admins-api" label="Company admins and owners" rows={d.admins} rowKey={(a) => `${a.tenantId}:${a.userId}`} columns={cols} searchText={(a) => `${a.person} ${a.email} ${a.company} ${a.ref}`}
                rowActions={(a) => [{ label: "Request an MFA reset", whyNot: lock ?? (a.pending ? "A reset is already pending" : !d.supers.some((x) => x.id !== a.userId) ? "No other platform super admin can approve it" : null), run: () => L.openModal(`Reset MFA of ${a.person}`, (close) => <RequestForm d={d} a={a} close={close} />) }]}
                filters={[{ key: "mfa", label: "MFA", options: ["Enrolled", "Not enrolled", "Reset pending"], get: (a) => (a.pending ? "Reset pending" : a.mfa) }]} exportName="company-admins" />
            ) : <Empty icon="people" title="No company admins yet">Admins and owners of active companies appear here.</Empty>}
        </div>
      </div>
    </Page>
  );
}

function History({ rows }: { rows: Req[] }) {
  const cols: DTColumn<Req>[] = [
    { key: "at", header: "Requested", value: (r) => r.at, render: (r) => <span className="num">{utcMin(r.at)}</span> },
    { key: "person", header: "Admin", value: (r) => r.person, locked: true, render: (r) => <span className="strong">{r.person}</span> },
    { key: "company", header: "Company", value: (r) => r.company, render: (r) => r.company },
    { key: "reason", header: "Reason", value: (r) => r.reason, render: (r) => <span style={{ fontSize: 12.5 }}>{r.reason}</span> },
    { key: "ticket", header: "Ticket", value: (r) => r.ticket, render: (r) => <span className="num">{r.ticket}</span> },
    { key: "by", header: "Asked by", value: (r) => r.requestedBy, render: (r) => r.requestedBy },
    { key: "named", header: "Approver", value: (r) => r.named, render: (r) => r.named },
    { key: "status", header: "Decision", value: (r) => r.status, render: (r) => <StatusChip s={r.status} /> },
  ];
  return <DataTable<Req> id="mfa-history-api" label="MFA reset history" rows={rows} rowKey={(r) => r.id} columns={cols} searchText={(r) => `${r.person} ${r.company} ${r.ticket} ${r.requestedBy}`} exportName="mfa-resets" />;
}

function RequestForm({ d, a, close }: { d: Data; a: Admin; close: () => void }) {
  const L = useLayer();
  const approvers = d.supers.filter((x) => x.id !== a.userId);
  const [checks, setChecks] = useState<string[]>([]); const [reason, setReason] = useState(d.reasons[0] ?? ""); const [details, setDetails] = useState(""); const [ticket, setTicket] = useState("");
  const [named, setNamed] = useState(approvers[0]?.id ?? ""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return; setErr("");
    if (!d.checks.every((c) => checks.includes(c))) { setErr("Confirm all three identity checks first."); return; }
    setBusy(true);
    try { await apiFetch("/admin/mfa/requests", { method: "POST", body: JSON.stringify({ userId: a.userId, tenantId: a.tenantId, checks, reason, details, ticket: ticket.trim().toUpperCase(), named }) }); bumpData(); close(); L.toast(`Reset requested for ${a.person}, waiting for ${approvers.find((x) => x.id === named)?.name ?? "the named approver"}`); }
    catch (x) { setErr(apiMessage(x, "Could not raise the reset")); setBusy(false); }
  };
  return (
    <>
      <p style={{ marginTop: 0, lineHeight: 1.5 }}>This asks to reset multi-factor authentication for <b>{a.person}</b> ({a.email}), {a.role} of {a.company}. Nothing changes until the named platform super admin approves.</p>
      <div className="sectitle" style={{ marginTop: 0 }}>Effects when approved</div>
      <ul style={{ margin: "0 0 12px", paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6 }}>{EFFECTS.map((x) => <li key={x}>{x}</li>)}</ul>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="sectitle">Identity checks (all three required)</legend>
        {d.checks.map((c, i) => (
          <label key={c} className="listrow" style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer", marginBottom: 6 }}>
            <input type="checkbox" data-focus={i === 0 ? true : undefined} style={{ marginTop: 3 }} checked={checks.includes(c)} onChange={(e) => setChecks(e.target.checked ? [...checks, c] : checks.filter((x) => x !== c))} />
            <span style={{ fontSize: 12.5 }}>{CHECK_TEXT[c] ?? c}</span>
          </label>
        ))}
      </fieldset>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
        <div className="field"><label htmlFor="mr-reason">Reason</label><select className="select" id="mr-reason" value={reason} onChange={(e) => setReason(e.target.value)}>{d.reasons.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div className="field"><label htmlFor="mr-ticket">Ticket reference</label><input className="input" id="mr-ticket" maxLength={20} placeholder="SEC-1234" autoComplete="off" spellCheck={false} value={ticket} onChange={(e) => setTicket(e.target.value)} /></div>
      </div>
      <div className="field"><label htmlFor="mr-details">What you verified (at least 10 characters)</label><textarea className="input" id="mr-details" rows={2} maxLength={300} value={details} onChange={(e) => setDetails(e.target.value)} /></div>
      <div className="field"><label htmlFor="mr-named">Named second approver</label>
        <select className="select" id="mr-named" value={named} onChange={(e) => setNamed(e.target.value)} disabled={!approvers.length}>{approvers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <span className="help">{approvers.length ? "A platform super admin other than you and the person being reset. The request expires in 24 hours." : "No eligible approver."}</span></div>
      <p className="field help" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={busy || !approvers.length} onClick={go}><Icon name="shieldcheck" />Request reset</button></LayerFoot>
    </>
  );
}

function MfaRequests() {
  const load = useCallback(async () => (await platform.listPlatformRequests()).filter((a) => a.kind === "mfa-reset-admin"), []);
  return <RequestsTable id="mfa-requests-api" load={load} decide={platform.decidePlatformRequest}
    note="Only the named platform super admin decides a reset, in an elevated session; the requester may withdraw it. A request expires after 24 hours." />;
}
