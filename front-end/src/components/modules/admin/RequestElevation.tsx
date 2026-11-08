import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { ELEV_DURATIONS, ELEV_FAIL, ELEV_MAX_MIN, ELEV_REASON_MAX, useElevation } from "@/lib/elevation";
import { clampText } from "@/lib/security";
import { useLayer } from "@/hooks/useLayer";

type Step = "form" | "key" | "touch";
/** Request flow: reason (required) -> duration (60 min max) -> SIMULATED hardware-key prompt. No key, credential or challenge is read or generated. */
export function RequestElevation() {
  const L = useLayer(); const el = useElevation();
  const [reason, setReason] = useState(""); const [mins, setMins] = useState<number>(30);
  const [step, setStep] = useState<Step>("form"); const [err, setErr] = useState(false);
  const tm = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (tm.current) clearTimeout(tm.current); }, []);

  if (!el.canElevate) {
    return (
      <div className="card"><div className="c-head"><h3>Request elevation</h3></div>
        <div className="c-body"><p className="field help" role="status" style={{ margin: 0 }}>Read-only: only the Platform Super Admin role can elevate. Other roles stay non-privileged and cannot start an elevated session.</p></div></div>
    );
  }
  if (el.active) {
    return (
      <div className="card"><div className="c-head"><h3>Request elevation</h3><div className="r"><span className="chip ok"><Icon name="check" />Elevated</span></div></div>
        <div className="c-body"><dl className="meta-grid lstart" style={{ margin: 0 }}><dt>Reason</dt><dd>{el.reason}</dd></dl></div></div>
    );
  }
  const next = () => { if (!clampText(reason, ELEV_REASON_MAX)) { setErr(true); return; } setErr(false); setStep("key"); };
  const touch = () => {
    setStep("touch");
    tm.current = setTimeout(() => {
      const r = el.request(reason, mins);
      if ("why" in r) { setStep("form"); L.toast(ELEV_FAIL[r.why] || "Could not elevate", false); return; }
      setReason(""); setStep("form"); L.toast("Elevated for " + mins + " min");
    }, 900);
  };
  const cancel = () => { if (tm.current) clearTimeout(tm.current); setStep("form"); };
  return (
    <div className="card">
      <div className="c-head"><h3>Request elevation</h3></div>
      <div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {step === "form" ? (
          <>
            <div className={"field" + (err ? " err" : "")}>
              <label htmlFor="elReason">Reason (required)</label>
              <textarea className="input" id="elReason" maxLength={ELEV_REASON_MAX} aria-invalid={err} aria-describedby="elReasonH" value={reason} onChange={(e) => { setReason(e.target.value.slice(0, ELEV_REASON_MAX)); setErr(false); }} />
              <span className="help" id="elReasonH">{err ? "Enter a reason for the elevation." : "Recorded in the platform audit log. Maximum " + ELEV_REASON_MAX + " characters."}</span>
            </div>
            <div className="field" style={{ maxWidth: 220 }}>
              <label htmlFor="elMins">Duration (maximum {ELEV_MAX_MIN} minutes)</label>
              <select className="select" id="elMins" value={mins} onChange={(e) => setMins(Number(e.target.value))}>{ELEV_DURATIONS.map((m) => <option key={m} value={m}>{m} minutes</option>)}</select>
            </div>
            <div><button className="btn btn-primary" onClick={next}><Icon name="shieldcheck" />Continue to hardware key</button></div>
          </>
        ) : (
          <>
            <div className="banner warn" role="status"><b>Simulation.</b> This demo does not read a hardware key, network address or role grant. In production the server verifies a hardware security key, an allow-listed network and a just-in-time role before it accepts privileged calls.</div>
            <p style={{ margin: 0 }}>{step === "key" ? "Touch your hardware security key to continue." : "Waiting for the simulated key touch…"}</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" disabled={step === "touch"} onClick={touch}><Icon name="shieldcheck" />Simulate key touch</button>
              <button className="btn btn-secondary" onClick={cancel}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
