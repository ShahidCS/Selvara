import { useEffect, useState } from "react";
import { Chip, Icon, Table } from "@/components/ui";
import { apiMessage } from "@/components/kit/serverRequests";
import { LayerFoot, useLayer } from "@/hooks/useLayer";
import { MAX_RETENTION_MONTHS } from "@/lib/retention";
import { bumpData, useData } from "@/lib/store";
import * as svc from "@/services/team";

/* Data retention in production (EDGE-19, migration 0016): the company's periods and legal holds, held by the server. Longer applies at once;
   shorter waits for a second company admin and never goes below the minimum; a hold applies at once and releasing it waits for an admin other
   than the one who placed it. The purge job that applies these periods comes next; until it runs, nothing is deleted. */
const span = (m: number) => (m % 12 === 0 ? `${m / 12} year${m === 12 ? "" : "s"}` : `${m} month${m === 1 ? "" : "s"}`);
const MIN_REASON = 10;

export function ApiRetention() {
  const v = useData(); const L = useLayer();
  const [rows, setRows] = useState<svc.RetentionView[] | null>(null); const [err, setErr] = useState("");
  useEffect(() => { let on = true; svc.getRetention().then((x) => { if (on) { setRows(x); setErr(""); } }, (e) => { if (on) setErr(apiMessage(e, "Could not load the retention settings")); }); return () => { on = false; }; }, [v]);
  if (err) return <p role="alert" style={{ color: "var(--bad-ink)" }}>{err}</p>;
  if (!rows) return <p style={{ color: "var(--muted)" }}>Loading…</p>;
  return (
    <div style={{ maxWidth: 960, display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="banner warn" style={{ margin: 0 }}><b>Draft for review.</b> The periods and minimums are proposals; compliance must confirm them for each regulator (for example, FATF Recommendation 11 asks for at least five years of due-diligence and transaction records). Keeping data longer takes effect at once; keeping it for less time needs a different company admin to approve and can never go below the minimum. A legal hold stops all deletion of that kind of record until a different admin approves releasing it. Nothing is deleted until the purge job is switched on.</div>
      <Table cols={[{ t: "Records" }, { t: "Keep for" }, { t: "Minimum" }, { t: "Status" }, { t: "" }]}>
        {rows.map((t) => (
          <tr key={t.id}>
            <td className="strong">{t.label}<div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 400 }}>{t.basis}</div></td>
            <td className="num">{span(t.months)}{t.pendingMonths ? <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{span(t.pendingMonths)} awaiting approval</div> : null}</td>
            <td className="num">{span(t.floor)}</td>
            <td>{t.hold ? <Chip cls="warn" icon="alert">{t.releaseRequested ? "Legal hold (release requested)" : "Legal hold"}</Chip> : <Chip cls="neutral" icon="dot">No hold</Chip>}
              {t.hold ? <div style={{ fontSize: 11.5, color: "var(--muted)" }}>by {t.hold.by}: {t.hold.reason}</div> : null}</td>
            <td className="r">
              <div className="btngrp" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button className="btn btn-ghost sm" aria-label={`Change retention: ${t.label}`} onClick={() => L.openModal(`Change retention: ${t.label}`, (close) => <Change t={t} close={close} />)}><Icon name="edit" />Change</button>
                {t.hold ? (t.releaseRequested ? null : <button className="btn btn-ghost sm" aria-label={`Release legal hold: ${t.label}`} onClick={() => L.openModal(`Release legal hold: ${t.label}`, (close) => <Hold t={t} action="release" close={close} />)}><Icon name="unlock" />Release hold</button>)
                  : <button className="btn btn-ghost sm" aria-label={`Place legal hold: ${t.label}`} onClick={() => L.openModal(`Place legal hold: ${t.label}`, (close) => <Hold t={t} action="hold" close={close} />)}><Icon name="pause" />Legal hold</button>}
              </div>
            </td>
          </tr>
        ))}
      </Table>
      <p className="field help" style={{ margin: 0 }}>Shorter periods and hold releases wait in Requests for a second company admin.</p>
    </div>
  );
}

function Change({ t, close }: { t: svc.RetentionView; close: () => void }) {
  const L = useLayer(); const [months, setMonths] = useState(String(t.months)); const [reason, setReason] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return; if (reason.trim().length < MIN_REASON) { setErr(`Give a reason of at least ${MIN_REASON} characters.`); return; }
    setBusy(true);
    try { const r = await svc.setRetentionMonths(t.id, Number(months), reason); bumpData(); close(); L.toast(r.pending ? "A shorter period needs a different company admin to approve" : "Retention updated"); }
    catch (x) { setErr(apiMessage(x, "Could not change the retention")); setBusy(false); }
  };
  return (
    <>
      <div className="field"><label htmlFor="rt-m">Keep for (months, at least {t.floor})</label><input className="input num" id="rt-m" data-focus type="number" min={t.floor} max={MAX_RETENTION_MONTHS} value={months} onChange={(e) => { setMonths(e.target.value); setErr(""); }} /></div>
      <div className="field"><label htmlFor="rt-why">Reason (at least {MIN_REASON} characters)</label><textarea className="input" id="rt-why" rows={3} maxLength={300} style={{ resize: "vertical" }} value={reason} onChange={(e) => { setReason(e.target.value); setErr(""); }} aria-invalid={!!err} aria-describedby={err ? "rt-err" : undefined} /></div>
      <p className="field help" id="rt-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={go}>Save</button></LayerFoot>
    </>
  );
}

function Hold({ t, action, close }: { t: svc.RetentionView; action: "hold" | "release"; close: () => void }) {
  const L = useLayer(); const [reason, setReason] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return; if (reason.trim().length < MIN_REASON) { setErr(`Give a reason of at least ${MIN_REASON} characters.`); return; }
    setBusy(true);
    try { await svc.retentionHold(t.id, action, reason); bumpData(); close(); L.toast(action === "hold" ? "Legal hold placed: nothing of this kind will be deleted" : "A different company admin must approve releasing the hold"); }
    catch (x) { setErr(apiMessage(x, action === "hold" ? "Could not place the hold" : "Could not request the release")); setBusy(false); }
  };
  return (
    <>
      <div className="field"><label htmlFor="rh-why">Reason (at least {MIN_REASON} characters)</label><textarea className="input" id="rh-why" data-focus rows={3} maxLength={300} style={{ resize: "vertical" }} placeholder={action === "hold" ? "For example: litigation notice, regulator inquiry" : "Why the hold is no longer needed"} value={reason} onChange={(e) => { setReason(e.target.value); setErr(""); }} aria-invalid={!!err} aria-describedby={err ? "rh-err" : undefined} /></div>
      <p className="field help" id="rh-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      <p className="field help">{action === "hold" ? "Takes effect at once. Releasing it later needs a company admin other than you." : "A company admin other than you and the one who placed it must approve. Until then the hold stays."}</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className={`btn ${action === "hold" ? "btn-danger" : "btn-primary"}`} disabled={busy} onClick={go}>{action === "hold" ? "Place hold" : "Request release"}</button></LayerFoot>
    </>
  );
}
