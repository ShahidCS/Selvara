import { useState } from "react";
import { Empty, Page, Segmented } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { ServerElevationBanner, useServerElevation } from "@/components/kit/admin/ServerElevation";
import { apiMessage, utcMin } from "@/components/kit/serverRequests";
import { ELEVATION_REASON_MIN } from "@/lib/rules";
import { bumpData } from "@/lib/store";
import * as svc from "@/services/platform";

/* Elevated Access in production (slice 3a): a platform super admin starts a time-boxed elevation with a reason and a ticket (60 minutes at
   most, one at a time) before any Admin Console change; signing out or "End now" ends it. The server records it and refuses every change
   without it. A platform elevation never opens a company's workspace: that is a support session on a customer's grant (slice 3b, Customers & Usage). */
const DURATIONS = ["15", "30", "60"] as const;

export function ApiElevation() {
  const s = useServerElevation(); const L = useLayer();
  const [reason, setReason] = useState(""); const [ticket, setTicket] = useState(""); const [minutes, setMinutes] = useState<string>("30");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const start = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return; setBusy(true); setErr("");
    try { await svc.startElevation(reason, ticket.trim().toUpperCase(), Number(minutes)); setReason(""); setTicket(""); bumpData(); L.toast(`Elevated for ${minutes} minutes`); }
    catch (x) { setErr(apiMessage(x, "Could not start the elevation")); }
    setBusy(false);
  };
  const end = async () => { try { await svc.endElevation(); bumpData(); L.toast("Elevation ended"); } catch (x) { L.toast(apiMessage(x, "Could not end the elevation"), false); } };
  if (s.loaded && !s.canElevate) return <Page mod="elevation"><Empty icon="access" title="Support accounts do not elevate">You can browse the Admin Console. Changes are made by platform super admins, each with an elevated session.</Empty></Page>;
  return (
    <Page mod="elevation" sub="Time-boxed elevation for platform changes: reason, ticket, 60 minutes at most.">
      <div className="card" data-tour="elevation-request"><div className="c-body scroll">
        {s.el ? <ServerElevationBanner s={s} /> : null}
        {s.el ? (
          <>
            <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "6px 16px", margin: "0 0 12px" }}>
              <dt>Started</dt><dd className="num">{utcMin(s.el.startedAt)}</dd>
              <dt>Ends</dt><dd className="num">{utcMin(s.el.expiresAt)}</dd>
              <dt>Ticket</dt><dd>{s.el.ticket}</dd>
              <dt>Reason</dt><dd>{s.el.reason}</dd>
            </dl>
            <button className="btn btn-secondary" onClick={end}>End now</button>
          </>
        ) : s.loaded ? (
          <form onSubmit={start} noValidate className="fields-cap">
            <p className="field help" style={{ marginTop: 0 }}>Changes in the Admin Console need an elevated session: one at a time, 60 minutes at most, with the reason and ticket recorded in the platform audit log. Signing out ends it.</p>
            <div className="field"><label htmlFor="el-reason">Reason (at least {ELEVATION_REASON_MIN} characters)</label><textarea className="input" id="el-reason" rows={3} maxLength={300} style={{ resize: "vertical" }} value={reason} onChange={(e) => { setReason(e.target.value); setErr(""); }} aria-invalid={!!err} aria-describedby="el-err" /></div>
            <div className="field"><label htmlFor="el-ticket">Ticket</label><input className="input" id="el-ticket" maxLength={13} autoComplete="off" placeholder="SEC-1234" value={ticket} onChange={(e) => { setTicket(e.target.value); setErr(""); }} aria-invalid={!!err} aria-describedby="el-err" /></div>
            <div className="field"><Segmented<string> label="Duration" value={minutes} onChange={setMinutes} options={DURATIONS.map((m) => ({ value: m, label: `${m} minutes` }))} /></div>
            <p className="field help" id="el-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
            <button type="submit" className="btn btn-primary" disabled={busy}>Elevate</button>
          </form>
        ) : <p style={{ color: "var(--muted)" }}>Loading…</p>}
      </div></div>
    </Page>
  );
}
