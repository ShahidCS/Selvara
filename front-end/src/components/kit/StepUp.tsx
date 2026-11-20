/* Production step-up: when the server asks for a recently confirmed password (MFA resets, offboarding), this prompt asks for it, confirms it
   with the server (POST /api/me/reauth) and lets the change go through once. The password is sent only to the server, never kept. */
import { useState, useSyncExternalStore } from "react";
import { reauthenticate } from "@/services/authApi";
import { apiMessage } from "@/components/kit/serverRequests";
import { stepUp } from "@/services/ws";

export function StepUpHost() {
  const answer = useSyncExternalStore(stepUp.subscribe, () => stepUp.get().answer, () => null);
  const [pw, setPw] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  if (!answer) return null;
  const done = (ok: boolean) => { setPw(""); setErr(""); setBusy(false); answer(ok); };
  const confirm = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return; setBusy(true); setErr("");
    try { await reauthenticate(pw); done(true); } catch (x) { setErr(apiMessage(x, "Could not confirm your password.")); setBusy(false); }
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center", zIndex: 1000, padding: 16 }}>
      <form role="dialog" aria-modal="true" aria-labelledby="su-title" onSubmit={confirm} className="card" style={{ width: "min(420px, 100%)", padding: 20 }}>
        <h3 id="su-title" style={{ margin: "0 0 8px" }}>Confirm your password</h3>
        <p style={{ margin: "0 0 12px", lineHeight: 1.5 }}>This change affects someone&apos;s access. Confirm your password to continue; it stays confirmed for a few minutes.</p>
        <div className="field"><label htmlFor="su-pw">Password</label><input className="input" id="su-pw" type="password" autoComplete="current-password" autoFocus value={pw} onChange={(e) => { setPw(e.target.value); setErr(""); }} aria-invalid={!!err} aria-describedby="su-err" /></div>
        <p className="field help" id="su-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
        <div className="btngrp" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button type="button" className="btn btn-secondary" onClick={() => done(false)}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !pw}>Confirm</button>
        </div>
      </form>
    </div>
  );
}
