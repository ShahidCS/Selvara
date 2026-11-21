/* Shared by the production screens that use the server's four-eyes engine (Team & Rules, Admin Console): the requests table, the reason
   dialog for a decision, and the box that shows an invitation link once. The server decides every rule and explains a refusal (`block`);
   these components only show it. */
import { useEffect, useState } from "react";
import { Chip, DataTable, Icon, StatusChip, type DTColumn } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { REASON_MIN } from "@/lib/rules";
import { SodError } from "@/lib/sod";
import { bumpData, useData } from "@/lib/store";
import { ApiError } from "@/services/http";
import type { ApprovalItem } from "@/services/team";

/** The server's own words for a refusal (it never sends internal details); anything else gets the fallback. */
export const apiMessage = (e: unknown, fallback: string) => ((e instanceof ApiError && e.status > 0 && e.status < 500) || e instanceof SodError ? (e as Error).message : fallback);
export const utcMin = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";

type Decide = (id: string, decision: "approve" | "reject" | "withdraw", reason?: string) => Promise<unknown>;

/** Shows an invitation link once, to copy and send to the person outside Selvara. */
export function LinkBox({ link, email, expiresAt, mail }: { link: string; email: string; expiresAt: number; /** why it was not emailed */ mail?: string }) {
  const L = useLayer();
  const copy = async () => { try { await navigator.clipboard.writeText(link); L.toast("Link copied"); } catch { L.toast("Select the link and copy it", false); } };
  return (
    <>
      <p style={{ margin: "0 0 12px", lineHeight: 1.5 }}>Send this link to {email} yourself, for example by email. It works once, only with that email address, until {utcMin(expiresAt)}. It is shown only now: if it is lost, create a new link (the old one stops working).</p>
      <p className="field help" style={{ margin: "0 0 12px" }}>{mail === "failed" || mail === "rate limited" ? "Selvara could not email it just now, so it is shown here." : "Selvara does not email it: email is not set up for this platform yet."}</p>
      <div className="field"><label htmlFor="lb-link">Invitation link</label><input className="input num" id="lb-link" data-focus readOnly value={link} onFocus={(e) => e.currentTarget.select()} /></div>
      <div className="btngrp" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        <button className="btn btn-primary" onClick={copy}>Copy link</button>
      </div>
    </>
  );
}

/** Four-eyes requests: approve or reject with a reason, withdraw your own; a request you may not decide shows why. */
export function RequestsTable({ id, load, decide, note }: { id: string; load: () => Promise<ApprovalItem[]>; decide: Decide; note: string }) {
  const v = useData(); const L = useLayer();
  const [rows, setRows] = useState<ApprovalItem[] | null>(null); const [err, setErr] = useState("");
  useEffect(() => { let on = true; load().then((x) => { if (on) { setRows(x); setErr(""); } }, (e) => { if (on) setErr(apiMessage(e, "Could not load the requests")); }); return () => { on = false; }; }, [v, load]);
  const withdraw = async (a: ApprovalItem) => { try { await decide(a.id, "withdraw"); bumpData(); L.toast("Request withdrawn"); } catch (x) { L.toast(apiMessage(x, "Could not withdraw the request"), false); } };
  const chip = (s: ApprovalItem["status"]) => (s === "Pending" ? <Chip cls="warn" icon="clock">Pending</Chip> : <StatusChip s={s} />);
  const open = (a: ApprovalItem, d: "approve" | "reject") => L.openModal(`${d === "approve" ? "Approve" : "Reject"}: ${a.title}`, (close) => <DecideRequest a={a} decision={d} decide={decide} close={close} />);
  const cols: DTColumn<ApprovalItem>[] = [
    { key: "title", header: "Request", value: (a) => a.title, locked: true, render: (a) => <span className="strong">{a.title}</span> },
    { key: "by", header: "Requested by", value: (a) => a.requestedBy, render: (a) => a.requestedBy },
    { key: "status", header: "Status", value: (a) => a.status, render: (a) => chip(a.status) },
    { key: "when", header: "Requested", value: (a) => a.createdAt, render: (a) => <span className="num">{utcMin(a.createdAt)}</span> },
    { key: "dec", header: "Decided by", value: (a) => a.votes.map((x) => x.by).join(", "), render: (a) => a.votes.map((x) => x.by).join(", ") || (a.reason ? `Rejected: ${a.reason}` : "") },
    { key: "act", header: "Actions", hideHeader: true, render: (a) => (a.status !== "Pending" ? null : a.mine ? (
      <button className="btn btn-ghost sm" aria-label={`Withdraw: ${a.title}`} onClick={() => withdraw(a)}><Icon name="x" />Withdraw</button>
    ) : a.block ? <span className="field help" style={{ margin: 0 }}>{a.block}</span> : (
      <div className="btngrp" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
        <button className="btn btn-ghost sm" aria-label={`Approve: ${a.title}`} onClick={() => open(a, "approve")}><Icon name="check" />Approve</button>
        <button className="btn btn-ghost sm" aria-label={`Reject: ${a.title}`} onClick={() => open(a, "reject")}><Icon name="x" />Reject</button>
      </div>)) },
  ];
  if (err) return <p role="alert" style={{ color: "var(--bad-ink)" }}>{err}</p>;
  if (!rows) return <p style={{ color: "var(--muted)" }}>Loading requests…</p>;
  return (
    <>
      <p className="field help" style={{ marginTop: 0, maxWidth: "70ch" }}>{note}</p>
      {rows.length ? <DataTable<ApprovalItem> id={id} label="Requests" rows={rows} rowKey={(a) => a.id} columns={cols} searchText={(a) => `${a.title} ${a.requestedBy} ${a.status}`} exportName="requests" />
        : <p style={{ color: "var(--muted)" }}>No requests yet.</p>}
    </>
  );
}

function DecideRequest({ a, decision, decide, close }: { a: ApprovalItem; decision: "approve" | "reject"; decide: Decide; close: () => void }) {
  const L = useLayer();
  const [reason, setReason] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return;
    if (reason.trim().length < REASON_MIN) { setErr(`Give a reason of at least ${REASON_MIN} characters.`); return; }
    setBusy(true);
    try { await decide(a.id, decision, reason); close(); bumpData(); L.toast(decision === "approve" ? "Approved and applied" : "Request rejected"); }
    catch (e) { setErr(apiMessage(e, "Could not record the decision")); setBusy(false); }
  };
  return (
    <>
      <p className="field help" style={{ marginTop: 0 }}>Requested by {a.requestedBy} on {utcMin(a.createdAt)}.</p>
      <div className="field"><label htmlFor="dr-reason">Reason (at least {REASON_MIN} characters)</label><textarea className="input" id="dr-reason" data-focus rows={3} maxLength={300} style={{ resize: "vertical" }} value={reason} onChange={(e) => { setReason(e.target.value); setErr(""); }} aria-invalid={!!err} aria-describedby={err ? "dr-err" : undefined} /></div>
      <p className="field help" id="dr-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      <div className="btngrp" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        <button className="btn btn-secondary" onClick={close}>Cancel</button>
        <button className={`btn ${decision === "approve" ? "btn-primary" : "btn-danger"}`} disabled={busy} onClick={go}>{decision === "approve" ? "Approve" : "Reject"}</button>
      </div>
    </>
  );
}
