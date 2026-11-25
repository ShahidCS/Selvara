import { useEffect, useState } from "react";
import { DataTable, Icon, Page, StatusChip, type DTColumn } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { ELEVATE_TEXT, ServerElevationBanner, useServerElevation, type ElevationState } from "@/components/kit/admin/ServerElevation";
import { apiMessage, notSentText, RequestsTable } from "@/components/kit/serverRequests";
import { REASON_MIN } from "@/lib/rules";
import { bumpData, useData, useModState } from "@/lib/store";
import * as svc from "@/services/platform";
import { ApiSupportSessions } from "./ApiSupportSessions";
import { SupportQuestions } from "./SupportQuestions";

/* Customers & Usage in production (slice 3a): the companies on the platform, with member counts only (no member names). An elevated platform
   super admin asks to create, suspend or reactivate a company; another super admin approves under Requests, and only then does it happen. A
   new company's first admin joins with a link the platform creates once the company exists. Support access (slice 3b): read-only sessions in a
   company that gave a support grant. Billing, plans and usage are later slices. */
const VIEWS: [string, string][] = [["companies", "Companies"], ["requests", "Requests"], ["support", "Support access"], ["questions", "Support questions"]];

export function ApiCustomers() {
  const s = useServerElevation();
  const [v, setV] = useModState<string>("customers.api.view", "companies");
  // the support inbox email links to ?view=questions
  useEffect(() => { const q = new URLSearchParams(window.location.search).get("view"); if (q && VIEWS.some((x) => x[0] === q)) setV(q); }, [setV]);
  const view = VIEWS.some((x) => x[0] === v) ? v : "companies";
  return (
    <Page mod="customers" sub="Companies on the platform. Changes need an elevated session and a second platform super admin's approval.">
      <ServerElevationBanner s={s} />
      <div className="card">
        <div className="c-head"><div className="seg" role="tablist" data-tour="customers-views">{VIEWS.map((x) => <button key={x[0]} role="tab" aria-selected={view === x[0]} onClick={() => setV(x[0])}>{x[1]}</button>)}</div></div>
        <div className="c-body scroll">
          {view === "companies" ? <Companies s={s} /> : view === "support" ? <ApiSupportSessions /> : view === "questions" ? <SupportQuestions /> : (
            <RequestsTable id="platform-requests-api" load={svc.listPlatformRequests} decide={svc.decidePlatformRequest}
              note="Creating, suspending or reactivating a company needs a second platform super admin, each in an elevated session. Nobody approves their own request. A request expires after 24 hours." />
          )}
        </div>
      </div>
    </Page>
  );
}

function Companies({ s }: { s: ElevationState }) {
  const v = useData(); const L = useLayer();
  const [rows, setRows] = useState<svc.PlatformCompany[] | null>(null); const [err, setErr] = useState("");
  useEffect(() => { let on = true; svc.listCompanies().then((x) => { if (on) { setRows(x); setErr(""); } }, (e) => { if (on) setErr(apiMessage(e, "Could not load the companies")); }); return () => { on = false; }; }, [v]);
  const gate = s.locked ? ELEVATE_TEXT : undefined;
  const link = async (c: svc.PlatformCompany) => {
    try { const r = await svc.adminLink(c.ref); bumpData(); if (r.emailed) L.toast(`The invitation was emailed to ${r.email}`); else L.toast(notSentText(r.email, r.mail), false); }
    catch (x) { L.toast(apiMessage(x, "Could not create the link"), false); }
  };
  const cols: DTColumn<svc.PlatformCompany>[] = [
    { key: "name", header: "Company", value: (c) => c.name, locked: true, render: (c) => <span className="strong">{c.name}</span> },
    { key: "ref", header: "Code", value: (c) => c.ref, render: (c) => <span className="num">{c.ref}</span> },
    { key: "status", header: "Status", value: (c) => c.status, render: (c) => <StatusChip s={c.status} /> },
    { key: "members", header: "Members", value: (c) => c.members, render: (c) => <span className="num">{c.members}</span> },
    { key: "admins", header: "Admins", value: (c) => c.admins, render: (c) => <span className="num">{c.admins}</span> },
    { key: "inv", header: "Open invitations", value: (c) => c.pendingInvites, render: (c) => <span className="num">{c.pendingInvites}</span> },
    { key: "act", header: "Actions", hideHeader: true, render: (c) => (
      <div className="btngrp" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
        {c.admins === 0 && c.pendingInvites > 0 ? <button className="btn btn-ghost sm" disabled={s.locked} title={gate} aria-label={`Email the first admin invitation: ${c.name}`} onClick={() => link(c)}><Icon name="user" />Email first admin</button> : null}
        {c.status === "Active" ? <button className="btn btn-ghost sm" disabled={s.locked} title={gate} aria-label={`Suspend: ${c.name}`} onClick={() => L.openModal(`Suspend ${c.name}`, (close) => <StatusForm c={c} action="suspend" close={close} />)}><Icon name="x" />Suspend</button>
          : c.status === "Suspended" ? <button className="btn btn-ghost sm" disabled={s.locked} title={gate} aria-label={`Reactivate: ${c.name}`} onClick={() => L.openModal(`Reactivate ${c.name}`, (close) => <StatusForm c={c} action="reactivate" close={close} />)}><Icon name="check" />Reactivate</button> : null}
      </div>) },
  ];
  return (
    <>
      <CreateForm locked={s.locked} />
      {err ? <p role="alert" style={{ color: "var(--bad-ink)" }}>{err}</p> : null}
      {rows ? <DataTable<svc.PlatformCompany> id="platform-companies-api" label="Companies" rows={rows} rowKey={(c) => c.id} rowLabel={(c) => c.name} columns={cols} searchText={(c) => `${c.name} ${c.ref} ${c.status}`}
        filters={[{ key: "status", label: "Status", options: ["Active", "Suspended", "Closed"], get: (c) => c.status }]} exportName="companies" />
        : err ? null : <p style={{ color: "var(--muted)" }}>Loading companies…</p>}
    </>
  );
}

function CreateForm({ locked }: { locked: boolean }) {
  const L = useLayer();
  const [ref, setRef] = useState(""); const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy || locked) return; setBusy(true); setErr("");
    try { await svc.requestCompany(ref.trim().toLowerCase(), name, email); setRef(""); setName(""); setEmail(""); bumpData(); L.toast("Request sent: another platform super admin approves it under Requests"); }
    catch (x) { setErr(apiMessage(x, "Could not send the request")); }
    setBusy(false);
  };
  return (
    <form onSubmit={send} noValidate aria-labelledby="cc-h" data-tour="customers-create" className="form-stack">
      <div className="sectitle" id="cc-h">Create a company</div>
      <div className="form-row">
        <div className="field"><label htmlFor="cc-name">Company name</label><input className="input" id="cc-name" maxLength={120} value={name} onChange={(e) => { setName(e.target.value); setErr(""); }} aria-describedby="cc-help cc-err" /></div>
        <div className="field"><label htmlFor="cc-ref">Company code</label><input className="input num" id="cc-ref" maxLength={40} autoCapitalize="none" spellCheck={false} placeholder="acme-eu" value={ref} onChange={(e) => { setRef(e.target.value); setErr(""); }} aria-describedby="cc-help cc-err" /></div>
        <div className="field"><label htmlFor="cc-email">First admin&apos;s work email</label><input className="input" id="cc-email" type="email" maxLength={254} autoComplete="off" value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); }} aria-describedby="cc-help cc-err" /></div>
      </div>
      <p className="field help" id="cc-help">The code is what people type to join (3 to 40 lower-case letters, digits and hyphens). Another platform super admin approves; then use Email first admin to send them an invitation by email. Platform staff cannot be a company admin.</p>
      <p className="field help" id="cc-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      <div className="form-acts"><button type="submit" className="btn btn-primary" disabled={busy || locked} title={locked ? ELEVATE_TEXT : undefined}>Request</button></div>
    </form>
  );
}

function StatusForm({ c, action, close }: { c: svc.PlatformCompany; action: "suspend" | "reactivate"; close: () => void }) {
  const L = useLayer();
  const [reason, setReason] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return;
    if (reason.trim().length < REASON_MIN) { setErr(`Give a reason of at least ${REASON_MIN} characters.`); return; }
    setBusy(true);
    try { await svc.requestStatus(c.ref, action, reason); close(); bumpData(); L.toast("Request sent: another platform super admin approves it under Requests"); }
    catch (e) { setErr(apiMessage(e, "Could not send the request")); setBusy(false); }
  };
  return (
    <>
      <p className="field help" style={{ marginTop: 0 }}>{action === "suspend" ? `When approved, nobody in ${c.name} can sign in or use the workspace until it is reactivated. Their data is kept.` : `When approved, members of ${c.name} can sign in again.`} The company&apos;s own audit log records it.</p>
      <div className="field"><label htmlFor="sf-reason">Reason (at least {REASON_MIN} characters)</label><textarea className="input" id="sf-reason" data-focus rows={3} maxLength={300} style={{ resize: "vertical" }} value={reason} onChange={(e) => { setReason(e.target.value); setErr(""); }} aria-invalid={!!err} aria-describedby={err ? "sf-err" : undefined} /></div>
      <p className="field help" id="sf-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      <div className="btngrp" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        <button className="btn btn-secondary" onClick={close}>Cancel</button>
        <button className={`btn ${action === "suspend" ? "btn-danger" : "btn-primary"}`} disabled={busy} onClick={go}>Request {action === "suspend" ? "suspension" : "reactivation"}</button>
      </div>
    </>
  );
}
