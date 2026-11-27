import { useState } from "react";
import { Section, H1, Lead, Hint, ErrLine } from "./parts";
import { MSG } from "@/features/vendorportal/lib/vendorSubmission";
import type { StepOutcome } from "./VerifyEmail";

/** Step 2: 6-digit emailed code. The code lives only in this component's state. Paste allowed; non-digits are stripped. */
export default function OtpStep({ masked, onVerify, demoHint }: { masked: string; onVerify: (code: string) => Promise<StepOutcome>; demoHint?: boolean }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return;
    if (!/^\d{6}$/.test(code)) { setErr(MSG.codeFormat); return; }
    setBusy(true);
    try { const r = await onVerify(code); if (r.kind === "error") setErr(r.message); setCode(""); } catch { setErr(MSG.generic); }
    setBusy(false);
  };
  return (
    <Section narrow={560}>
      <form onSubmit={(e) => { e.preventDefault(); void go(); }} noValidate style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <H1>Check your inbox</H1>
        <Lead>We sent a 6-digit code to {masked}. It expires in 10 minutes.</Lead>
        <div className="field">
        <label htmlFor="vp-otp">6-digit code</label>
        <input id="vp-otp" className="input" type="text" name="code" inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" maxLength={6}
          aria-invalid={!!err} aria-describedby={err ? "vp-otp-err" : undefined} value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setErr(""); }}
          style={{ fontSize: "1.25rem", letterSpacing: ".3em", fontWeight: 600, height: "3rem", width: "11.25rem" }} />
        <ErrLine msg={err} id="vp-otp-err" />
        </div>
        <button type="submit" className="btn btn-primary lg" disabled={busy} style={{ height: "3rem", borderRadius: 999, alignSelf: "flex-start", padding: "0 18px" }}>Verify</button>
        {demoHint ? <Hint>Demo: any 6 digits except <code>000000</code>. Five wrong codes void this link.</Hint> : null}
      </form>
    </Section>
  );
}
