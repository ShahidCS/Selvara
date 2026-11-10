import { useState } from "react";
import { Section, H1, Lead, Hint, ErrLine } from "./parts";
import { INVITE, MSG } from "@/features/vendorportal/lib/vendorSubmission";

export type StepOutcome = { kind: "ok" } | { kind: "error"; message: string } | { kind: "dead" };

/** Step 1: confirm the invited work email. The raw address lives only in this component's state (cleared on unmount); only a masked form moves on. */
export default function VerifyEmail({ onVerify, demoHint }: { onVerify: (email: string) => Promise<StepOutcome>; demoHint?: string }) {
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return;
    setBusy(true);
    try { const r = await onVerify(email); if (r.kind === "error") setErr(r.message); else setEmail(""); } catch { setErr(MSG.generic); }
    setBusy(false);
  };
  return (
    <Section narrow={560}>
      <form onSubmit={(e) => { e.preventDefault(); void go(); }} noValidate style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <H1>Security assessment request</H1>
        <Lead>{INVITE.customerName} has asked your organisation to complete a security and privacy questionnaire. This link works once and expires on {INVITE.expiresAt}.</Lead>
        <div className={"field" + (err ? " err" : "")}>
          <label htmlFor="vp-email">Confirm the work email this request was sent to</label>
          <input id="vp-email" className="input" type="email" name="email" autoComplete="email" autoCapitalize="off" spellCheck={false} maxLength={254}
            value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); }} aria-invalid={!!err} aria-describedby={err ? "vp-email-err" : undefined} style={{ height: 44 }} />
        </div>
        <div id="vp-email-err"><ErrLine msg={err} /></div>
        <button type="submit" className="btn btn-primary lg" disabled={busy} style={{ height: 48, borderRadius: 999 }}>Continue</button>
        {demoHint ? <Hint>Demo: the request was sent to <code>{demoHint}</code>. Personal and temporary email addresses are rejected; a different address gets the same generic message as an invalid link.</Hint> : null}
      </form>
    </Section>
  );
}
