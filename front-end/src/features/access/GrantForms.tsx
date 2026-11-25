import { SelectList } from "@/components/ui";
import { useState } from "react";
import { MemberSelect, myMemberId, useMembers } from "@/components/kit/MemberSelect";
import { useLayer } from "@/hooks/useLayer";
import { uiMessage } from "@/lib/grcSod";
import { ACCESS_LEVELS } from "@/lib/rulesWs";
import { wsPost } from "@/services/ws";

/* Production only: the inventory starts empty, so an admin or owner records access that already exists in a source system (with a reason),
   and revokes a grant (with a reason; removal in the source system is confirmed by its administrators). Both are audited by the server. */
function Foot({ close, busy, label, onClick }: { close: () => void; busy: boolean; label: string; onClick: () => void }) {
  return <div className="btngrp" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={onClick}>{label}</button></div>;
}
export function RecordGrantForm({ close }: { close: () => void }) {
  const L = useLayer(); const ms = useMembers();
  const [who, setWho] = useState(""); const [system, setSystem] = useState(""); const [level, setLevel] = useState("Read"); const [reason, setReason] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const userId = who || myMemberId(ms);
  const save = async () => {
    if (busy) return; setBusy(true);
    try { await wsPost("/ws/access/grants", { userId, system, level, reason }); close(); L.toast("Access recorded"); } catch (e) { setErr(uiMessage(e)); setBusy(false); }
  };
  return (
    <>
      <MemberSelect id="rg-user" label="Person" value={userId} onChange={setWho} />
      <div className="field"><label htmlFor="rg-sys">System</label><input className="input" id="rg-sys" maxLength={100} value={system} onChange={(e) => { setSystem(e.target.value); setErr(""); }} /></div>
      <div className="field"><label htmlFor="rg-lvl">Level</label><SelectList className="select" id="rg-lvl" value={level} onChange={(e) => setLevel(e.target.value)}>{ACCESS_LEVELS.map((x) => <option key={x}>{x}</option>)}</SelectList></div>
      <div className="field"><label htmlFor="rg-why">Where you found it (at least 10 characters)</label><textarea className="input" id="rg-why" rows={2} maxLength={300} value={reason} onChange={(e) => { setReason(e.target.value); setErr(""); }} aria-invalid={!!err} aria-describedby="rg-err" /></div>
      <p className="field help" id="rg-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      <Foot close={close} busy={busy} label="Record access" onClick={save} />
    </>
  );
}
export function RevokeGrantForm({ grant, close }: { grant: { id: string; user: string; system: string; level: string }; close: () => void }) {
  const L = useLayer(); const [reason, setReason] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const save = async () => {
    if (busy) return; setBusy(true);
    try { await wsPost(`/ws/access/grants/${encodeURIComponent(grant.id)}/revoke`, { reason }); close(); L.toast("Access revoked; confirm the removal in the source system"); } catch (e) { setErr(uiMessage(e)); setBusy(false); }
  };
  return (
    <>
      <p style={{ margin: "0 0 12px" }}>{grant.user} → {grant.system} ({grant.level}). The grant leaves the inventory now; the system&apos;s administrators remove it in the source system.</p>
      <div className="field"><label htmlFor="rv-why">Reason (at least 10 characters)</label><textarea className="input" id="rv-why" data-focus rows={2} maxLength={300} value={reason} onChange={(e) => { setReason(e.target.value); setErr(""); }} aria-invalid={!!err} aria-describedby="rv-err" /></div>
      <p className="field help" id="rv-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      <Foot close={close} busy={busy} label="Revoke" onClick={save} />
    </>
  );
}
