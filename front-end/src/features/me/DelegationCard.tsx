import { useEffect, useState } from "react";
import { Icon } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { DELEGATION, givenBy, givenTo } from "@/lib/delegation";
import { sodMessage } from "@/lib/approvalFlow";
import { getActor, hasRole } from "@/lib/sod";
import { useApp, useData } from "@/lib/store";
import * as svc from "@/services/delegation";

const DAYS = [1, 3, 7, 14];

/** Hand your named-approver slot to another admin or owner for a limited time (rules: docs/security/SOD_MATRIX.md section 9). Shown to admins and owners. */
export function DelegationCard() {
  useData(); const role = useApp((s) => s.role); const L = useLayer();
  const me = getActor();
  const [to, setTo] = useState(""); const [days, setDays] = useState(7); const [reason, setReason] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { svc.sweepDelegations(); }, []);
  if (!hasRole(role, ...DELEGATION.ROLES)) return null;
  const mine = givenBy(me.name); const received = givenTo(me.name);
  const people = svc.eligibleDelegates();
  const short = reason.trim().length < DELEGATION.REASON_MIN;
  const start = async () => {
    if (busy) return; setBusy(true); setErr("");
    try {
      const d = await svc.createDelegation({ to: to || people[0] || "", days, reason });
      setReason(""); setTo(""); L.toast(`Your approvals are delegated to ${d.to} until ${svc.delegationUntil(d.until)}`);
    } catch (e) { setErr(sodMessage(e, "Could not start the delegation")); }
    setBusy(false);
  };
  const end = async (id: string) => {
    try { await svc.revokeDelegation(id); L.toast("Delegation ended"); } catch (e) { L.toast(sodMessage(e, "Could not end the delegation"), false); }
  };
  return (
    <section className="card" aria-labelledby="deleg-h" style={{ flex: "0 0 auto" }}>
      <div className="c-head"><h3 id="deleg-h">Delegate your approvals</h3></div>
      <div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p className="field help" style={{ margin: 0 }}>
          Away? Hand your approver slot for policies and member MFA resets to another admin or owner for up to {DELEGATION.MAX_DAYS} days. You can end it at any time.
        </p>
        <details className="field help" style={{ margin: 0 }}>
          <summary style={{ cursor: "pointer", color: "var(--ink-2)", fontWeight: 500 }}>How delegation works</summary>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            <li>They keep every rule that applies to them: they cannot decide what they raised, wrote or are the subject of.</li>
            <li>Nothing is delegated for platform approvals, and they cannot pass it on.</li>
            <li>Every decision they make for you is recorded as made on your behalf.</li>
          </ul>
        </details>
        {mine ? (
          <div className="banner info" role="status" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <span style={{ flex: "1 1 260px" }}><strong>Delegated to {mine.to}</strong> until <span className="num">{svc.delegationUntil(mine.until)}</span>. {mine.reason}</span>
            <button className="btn btn-secondary sm" onClick={() => end(mine.id)}><Icon name="x" />End delegation</button>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); void start(); }} noValidate style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))", gap: 12, maxWidth: 960 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignContent: "flex-start" }}>
              <div className="field" style={{ flex: "1 1 200px", margin: 0 }}><label htmlFor="dg-to">Delegate to</label>
                <select className="select" id="dg-to" value={to || people[0] || ""} onChange={(e) => setTo(e.target.value)}>{people.map((p) => <option key={p}>{p}</option>)}</select></div>
              <div className="field" style={{ flex: "0 1 160px", margin: 0 }}><label htmlFor="dg-days">For</label>
                <select className="select" id="dg-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>{DAYS.map((d) => <option key={d} value={d}>{d} day{d === 1 ? "" : "s"}</option>)}</select></div>
            </div>
            <div className="field" style={{ margin: 0 }}><label htmlFor="dg-why">Reason (at least {DELEGATION.REASON_MIN} characters)</label>
              <textarea className="input" id="dg-why" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} aria-describedby={err ? "dg-err" : undefined} aria-invalid={err ? true : undefined} /></div>
            <p className="field help" id="dg-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none", margin: 0, gridColumn: "1 / -1" }}>{err}</p>
            <div style={{ gridColumn: "1 / -1" }}><button type="submit" className="btn btn-primary" disabled={short || busy || !people.length}><Icon name="access" />Delegate my approvals</button></div>
          </form>
        )}
        {received.length ? (
          <div>
            <div className="sectitle" style={{ marginTop: 0 }}>Delegated to you</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {received.map((d) => <li key={d.id}>{d.from} until <span className="num">{svc.delegationUntil(d.until)}</span>: you can decide requests that name {d.from} as the approver. {d.reason}</li>)}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
