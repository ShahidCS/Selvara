import { useEffect, useState } from "react";
import { Chip, Icon, Table, Empty } from "@/components/ui";
import { ELEVATE_TEXT, type ElevationState } from "@/components/kit/admin/ServerElevation";
import { apiMessage, utcMin } from "@/components/kit/serverRequests";
import { LayerFoot } from "@/components/shell/LayerProvider";
import { useLayer } from "@/hooks/useLayer";
import { bumpData, useData } from "@/lib/store";
import { apiFetch } from "@/services/http";

/* Account erasure (EDGE-19, server erasure.ts). Platform super admins only, each elevated: one asks (reason, ticket), a second approves in
   Platform requests; the account is blocked at once and erased after 14 days unless cancelled. The person must have left every company
   first (their company offboards them). Platform staff see the list; only an elevated super admin acts. */
interface Erasure { userId: string; person: string; pseudonym: string; email: string; status: "Scheduled" | "Cancelled" | "Completed"; ticket: string; requestedBy: string; approvedBy: string;
  scheduledAt: number; dueAt: number; due: boolean; completedAt?: number; cancelledAt?: number; result?: { auditEntries: number; records: number; companies: number } }
const MIN = 15;

export function ApiErasures({ s }: { s: ElevationState }) {
  const v = useData(); const L = useLayer();
  const [rows, setRows] = useState<Erasure[] | null>(null); const [err, setErr] = useState("");
  useEffect(() => { let on = true; apiFetch<Erasure[]>("/admin/erasures").then((x) => { if (on) { setRows(x); setErr(""); } }, (e) => { if (on) setErr(apiMessage(e, "Could not load the erasures")); }); return () => { on = false; }; }, [v]);
  const lock = s.locked ? ELEVATE_TEXT : undefined;
  const complete = async (x: Erasure) => {
    try { await apiFetch(`/admin/erasures/${encodeURIComponent(x.userId)}/complete`, { method: "POST", body: "{}" }); bumpData(); L.toast(`${x.pseudonym}: erased`); }
    catch (e) { L.toast(apiMessage(e, "Could not complete the erasure"), false); }
  };
  return (
    <section className="card" aria-labelledby="era-h">
      <div className="c-head"><h3 id="era-h">Account erasure</h3>
        <div className="r">{s.canElevate ? <button className="btn btn-secondary sm" disabled={!!lock} title={lock} onClick={() => L.openModal("Ask to erase an account", (close) => <Ask close={close} />)}><Icon name="plus" />Ask to erase</button> : null}</div></div>
      <div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p className="field help" style={{ margin: 0 }}>Erasure on request (GDPR Art. 17). A second super admin approves in Platform requests; the account is then blocked at once and erased after 14 days, unless cancelled. Erasing removes the sign-in account&apos;s data, credentials and sessions, replaces the person&apos;s name with a pseudonym in audit entries and workspace records, and removes their email and client addresses. Audit entries written before migration 0014 are kept, restricted, until their retention ends.</p>
        {err ? <p role="alert" style={{ margin: 0, color: "var(--bad-ink)" }}>{err}</p> : !rows ? <p style={{ margin: 0, color: "var(--muted)" }}>Loading…</p> : !rows.length ? <Empty compact icon="shieldcheck" title="No erasures" /> : (
          <div style={{ margin: "0 -16px" }}>
            <Table cols={[{ t: "Person" }, { t: "Status" }, { t: "Erased after" }, { t: "Ticket" }, { t: "" }]}>
              {rows.map((x) => (
                <tr key={x.userId + x.scheduledAt}>
                  <td><div className="strong">{x.person}</div><div className="field help" style={{ margin: 0 }}>{x.email}</div></td>
                  <td>{x.status === "Completed" ? <Chip cls="ok" icon="check">Erased</Chip> : x.status === "Cancelled" ? <Chip cls="" icon="x">Cancelled</Chip> : x.due ? <Chip cls="warn" icon="alert">Due</Chip> : <Chip cls="warn" icon="clock">Blocked, waiting</Chip>}</td>
                  <td className="num" style={{ fontSize: 12 }}>{x.status === "Completed" && x.completedAt ? `done ${utcMin(x.completedAt)}` : utcMin(x.dueAt)}</td>
                  <td className="num">{x.ticket}</td>
                  <td className="r">{s.canElevate && x.status === "Scheduled" ? (
                    <div className="btngrp" style={{ justifyContent: "flex-end" }}>
                      <button className="btn btn-ghost sm" disabled={!!lock} title={lock} aria-label={`Cancel erasure: ${x.person}`} onClick={() => L.openModal(`Cancel the erasure of ${x.person}`, (close) => <Cancel x={x} close={close} />)}><Icon name="x" />Cancel</button>
                      {x.due ? <button className="btn btn-danger sm" disabled={!!lock} title={lock} aria-label={`Erase now: ${x.person}`} onClick={() => complete(x)}><Icon name="trash" />Erase now</button> : null}
                    </div>
                  ) : null}</td>
                </tr>
              ))}
            </Table>
          </div>
        )}
        {!s.canElevate && s.loaded ? <p className="field help" style={{ margin: 0 }}>Read-only for your role: only a platform super admin can ask for, cancel or complete an erasure.</p> : null}
      </div>
    </section>
  );
}

function Ask({ close }: { close: () => void }) {
  const L = useLayer(); const [email, setEmail] = useState(""); const [reason, setReason] = useState(""); const [ticket, setTicket] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return; if (reason.trim().length < MIN) { setErr(`Give a reason of at least ${MIN} characters.`); return; }
    setBusy(true);
    try { await apiFetch("/admin/erasures", { method: "POST", body: JSON.stringify({ email, reason, ticket }) }); bumpData(); close(); L.toast("Requested. A second platform super admin approves it in Platform requests"); }
    catch (x) { setErr(apiMessage(x, "Could not ask for the erasure")); setBusy(false); }
  };
  return (
    <>
      <div className="field"><label htmlFor="era-email">The person&apos;s email address</label><input className="input" id="era-email" data-focus type="email" maxLength={254} autoComplete="off" value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); }} /></div>
      <div className="field"><label htmlFor="era-reason">Reason (at least {MIN} characters)</label><textarea className="input" id="era-reason" rows={3} maxLength={300} style={{ resize: "vertical" }} placeholder="Who asked, how you verified them" value={reason} onChange={(e) => { setReason(e.target.value); setErr(""); }} /></div>
      <div className="field"><label htmlFor="era-ticket">Ticket</label><input className="input num" id="era-ticket" maxLength={12} placeholder="PRIV-123" value={ticket} onChange={(e) => { setTicket(e.target.value); setErr(""); }} /></div>
      <p className="field help" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      <p className="field help">The person must have left every company first. Once a second super admin approves, the account is blocked at once and erased after 14 days.</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={go}>Ask to erase</button></LayerFoot>
    </>
  );
}

function Cancel({ x, close }: { x: Erasure; close: () => void }) {
  const L = useLayer(); const [reason, setReason] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return; if (reason.trim().length < MIN) { setErr(`Give a reason of at least ${MIN} characters.`); return; }
    setBusy(true);
    try { await apiFetch(`/admin/erasures/${encodeURIComponent(x.userId)}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }); bumpData(); close(); L.toast("Erasure cancelled; the account is unblocked"); }
    catch (e) { setErr(apiMessage(e, "Could not cancel the erasure")); setBusy(false); }
  };
  return (
    <>
      <div className="field"><label htmlFor="era-cancel">Reason (at least {MIN} characters)</label><textarea className="input" id="era-cancel" data-focus rows={3} maxLength={300} style={{ resize: "vertical" }} placeholder="For example: the person withdrew the request" value={reason} onChange={(e) => { setReason(e.target.value); setErr(""); }} aria-invalid={!!err} aria-describedby={err ? "era-cerr" : undefined} /></div>
      <p className="field help" id="era-cerr" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      <p className="field help">The account is unblocked at once. Recorded in the platform audit log.</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Keep scheduled</button><button className="btn btn-primary" disabled={busy} onClick={go}>Cancel the erasure</button></LayerFoot>
    </>
  );
}
