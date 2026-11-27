import { useEffect, useState } from "react";
import { Chip, Empty, Icon, Table } from "@/components/ui";
import { ELEVATE_TEXT, type ElevationState } from "@/components/kit/admin/ServerElevation";
import { apiMessage, utcMin } from "@/components/kit/serverRequests";
import { LayerFoot } from "@/components/shell/LayerProvider";
import { useLayer } from "@/hooks/useLayer";
import { RETENTION_DEFS } from "@/lib/retention";
import { bumpData, useData } from "@/lib/store";
import { apiFetch } from "@/services/http";

/* The retention purge job (EDGE-19 step 2, server purge.ts, migration 0017). Runs daily (Vercel Cron). Report-only for its first 30 days;
   then deletion can be switched on by an elevated super admin with a second one approving in Platform requests, and switched off at once.
   The database decides what is past its period and skips legal holds; every run and every deletion is in the audit logs. */
interface RunSummary { id: string; at: number; mode: "report" | "delete"; due: number; deleted: number; files: number; companies: number }
interface PurgeView { settings: { deletion: "on" | "off"; at: number; by: string; reason: string; approvedBy?: string } | null; firstRunAt: number | null; deletionFrom: number | null; open: boolean; pending: boolean; cronConfigured: boolean; runs: RunSummary[] }
interface KindRow { months: number; held: boolean; due: number; deleted: number; kept?: boolean }
interface Report { id: string; at: number; mode: string; due: number; deleted: number; files: number; companies: { tenantId: string; ref: string; name: string; held: string[]; kinds: Record<string, KindRow> }[];
  platform: { months: number; sessions: number; notices: number; cspReports: number; expired: number; deleted: boolean } }
const MIN = 15;
const label = (k: string) => RETENTION_DEFS.find((d) => d.id === k)?.label ?? k;

export function ApiPurge({ s }: { s: ElevationState }) {
  const v = useData(); const L = useLayer();
  const [p, setP] = useState<PurgeView | null>(null); const [err, setErr] = useState("");
  useEffect(() => { let on = true; apiFetch<PurgeView>("/admin/purge").then((x) => { if (on) { setP(x); setErr(""); } }, (e) => { if (on) setErr(apiMessage(e, "Could not load the purge job")); }); return () => { on = false; }; }, [v]);
  const lock = s.locked ? ELEVATE_TEXT : undefined;
  const on = p?.settings?.deletion === "on"; const early = !p?.open;
  return (
    <section className="card" aria-labelledby="purge-h">
      <div className="c-head"><h3 id="purge-h">Retention purge</h3>
        <div className="r">{s.canElevate && p ? (on
          ? <button className="btn btn-secondary sm" disabled={!!lock} title={lock} onClick={() => L.openModal("Switch deletion off", (close) => <Off close={close} />)}><Icon name="pause" />Switch deletion off</button>
          : <button className="btn btn-secondary sm" disabled={!!lock || early || p.pending} title={lock ?? (p.pending ? "A request is waiting for approval" : early ? "The first 30 days are report-only" : undefined)} onClick={() => L.openModal("Switch deletion on", (close) => <On close={close} />)}><Icon name="play" />Switch deletion on</button>) : null}</div></div>
      <div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p className="field help" style={{ margin: 0 }}>Runs every day. It deletes company records past their retention period (Team &amp; Rules, Retention) and never touches a kind of record under a legal hold. For its first 30 days it only reports; after that, deleting needs a second super admin to approve. Audit log entries are counted, never deleted.</p>
        {err ? <p role="alert" style={{ margin: 0, color: "var(--bad-ink)" }}>{err}</p> : !p ? <p style={{ margin: 0, color: "var(--muted)" }}>Loading…</p> : (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {on ? <Chip cls="warn" icon="trash">Deleting</Chip> : <Chip cls="ok" icon="eye">Report only</Chip>}
              {p.pending ? <Chip cls="warn" icon="clock">Switch-on awaiting approval</Chip> : null}
              {!p.cronConfigured ? <Chip cls="bad" icon="alert">Not scheduled: CRON_SECRET is not set</Chip> : null}
              <span className="field help" style={{ margin: 0 }}>
                {p.firstRunAt === null ? "No run yet." : `First run ${utcMin(p.firstRunAt)}.`} {!on && p.deletionFrom ? (early ? `Deletion can be switched on from ${utcMin(p.deletionFrom)}.` : "Deletion can be switched on.") : null}
                {p.settings ? ` Last change: ${p.settings.deletion === "on" ? "switched on" : "switched off"} by ${p.settings.by}, ${utcMin(p.settings.at)}.` : null}
              </span>
            </div>
            {!p.runs.length ? <Empty compact icon="shieldcheck" title="No runs yet" /> : (
              <div style={{ margin: "0 -16px" }}>
                <Table cols={[{ t: "Run" }, { t: "Mode" }, { t: "Past their period", r: true }, { t: "Deleted", r: true }, { t: "" }]}>
                  {p.runs.slice(0, 14).map((x) => (
                    <tr key={x.id}>
                      <td className="num" style={{ fontSize: 12 }}>{utcMin(x.at)}</td>
                      <td>{x.mode === "delete" ? <Chip cls="warn" icon="trash">Delete</Chip> : <Chip cls="" icon="eye">Report</Chip>}</td>
                      <td className="num r">{x.due}</td>
                      <td className="num r">{x.deleted}{x.files ? <div className="field help" style={{ margin: 0 }}>{x.files} file(s)</div> : null}</td>
                      <td className="r"><button className="btn btn-ghost sm" aria-label={`View run ${utcMin(x.at)}`} onClick={() => L.openModal(`Purge run ${utcMin(x.at)}`, () => <Run id={x.id} />)}><Icon name="eye" />View</button></td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}
          </>
        )}
        {!s.canElevate && s.loaded ? <p className="field help" style={{ margin: 0 }}>Read-only for your role: only a platform super admin can switch deletion on or off.</p> : null}
      </div>
    </section>
  );
}

function Run({ id }: { id: string }) {
  const [r, setR] = useState<Report | null>(null); const [err, setErr] = useState("");
  useEffect(() => { let on = true; apiFetch<Report>(`/admin/purge/runs/${encodeURIComponent(id)}`).then((x) => { if (on) setR(x); }, (e) => { if (on) setErr(apiMessage(e, "Could not load the run")); }); return () => { on = false; }; }, [id]);
  if (err) return <p role="alert" style={{ color: "var(--bad-ink)" }}>{err}</p>;
  if (!r) return <p style={{ color: "var(--muted)" }}>Loading…</p>;
  const rows = r.companies.flatMap((c) => Object.entries(c.kinds).filter(([, k]) => k.due > 0 || k.held).map(([kind, k]) => ({ c, kind, k })));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p className="field help" style={{ margin: 0 }}>{r.mode === "delete" ? "Deletion run" : "Report only: nothing was deleted"}. {r.due} past their period, {r.deleted} deleted across {r.companies.length} compan{r.companies.length === 1 ? "y" : "ies"}.</p>
      {!rows.length ? <Empty compact icon="shieldcheck" title="Nothing past its period" /> : (
        <Table cols={[{ t: "Company" }, { t: "Records" }, { t: "Kept for" }, { t: "Past period", r: true }, { t: "Deleted", r: true }]}>
          {rows.map(({ c, kind, k }) => (
            <tr key={c.tenantId + kind}>
              <td><div className="strong">{c.name}</div><div className="field help" style={{ margin: 0 }}>{c.ref}</div></td>
              <td>{label(kind)}{k.held ? <div><Chip cls="warn" icon="pause">Legal hold</Chip></div> : k.kept ? <div className="field help" style={{ margin: 0 }}>Counted only</div> : null}</td>
              <td className="num">{k.months} months</td>
              <td className="num r">{k.due}</td>
              <td className="num r">{k.deleted}</td>
            </tr>
          ))}
        </Table>
      )}
      <p className="field help" style={{ margin: 0 }}>Platform-wide (kept {r.platform.months} months): {r.platform.sessions} ended session(s) with no company, {r.platform.notices} notice(s), {r.platform.cspReports} CSP report(s); {r.platform.expired} expired short-lived entr{r.platform.expired === 1 ? "y" : "ies"}{r.platform.deleted ? ", all deleted" : ""}.</p>
    </div>
  );
}

function On({ close }: { close: () => void }) {
  const L = useLayer(); const [reason, setReason] = useState(""); const [ticket, setTicket] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return; if (reason.trim().length < MIN) { setErr(`Give a reason of at least ${MIN} characters.`); return; }
    setBusy(true);
    try { await apiFetch("/admin/purge/deletion", { method: "POST", body: JSON.stringify({ on: true, reason, ticket }) }); bumpData(); close(); L.toast("Requested. A second platform super admin approves it in Platform requests"); }
    catch (x) { setErr(apiMessage(x, "Could not ask to switch deletion on")); setBusy(false); }
  };
  return (
    <>
      <div className="field"><label htmlFor="pg-reason">Reason (at least {MIN} characters)</label><textarea className="input" id="pg-reason" data-focus rows={3} maxLength={300} style={{ resize: "vertical" }} placeholder="For example: 30 days of reports reviewed with compliance" value={reason} onChange={(e) => { setReason(e.target.value); setErr(""); }} aria-invalid={!!err} aria-describedby={err ? "pg-err" : undefined} /></div>
      <div className="field"><label htmlFor="pg-ticket">Ticket</label><input className="input num" id="pg-ticket" maxLength={12} placeholder="PRIV-123" value={ticket} onChange={(e) => { setTicket(e.target.value); setErr(""); }} /></div>
      <p className="field help" id="pg-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      <p className="field help">Once a second super admin approves, the next daily run deletes what is past its period. Deleted records cannot be restored except from backups.</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-danger" disabled={busy} onClick={go}>Ask to switch on</button></LayerFoot>
    </>
  );
}

function Off({ close }: { close: () => void }) {
  const L = useLayer(); const [reason, setReason] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return; if (reason.trim().length < MIN) { setErr(`Give a reason of at least ${MIN} characters.`); return; }
    setBusy(true);
    try { await apiFetch("/admin/purge/deletion", { method: "POST", body: JSON.stringify({ on: false, reason }) }); bumpData(); close(); L.toast("Deletion switched off: runs report only"); }
    catch (x) { setErr(apiMessage(x, "Could not switch deletion off")); setBusy(false); }
  };
  return (
    <>
      <div className="field"><label htmlFor="pg-off">Reason (at least {MIN} characters)</label><textarea className="input" id="pg-off" data-focus rows={3} maxLength={300} style={{ resize: "vertical" }} placeholder="For example: pausing deletion during an audit" value={reason} onChange={(e) => { setReason(e.target.value); setErr(""); }} aria-invalid={!!err} aria-describedby={err ? "pg-oerr" : undefined} /></div>
      <p className="field help" id="pg-oerr" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      <p className="field help">Takes effect at once. Switching it on again needs a second super admin.</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={go}>Switch off</button></LayerFoot>
    </>
  );
}
