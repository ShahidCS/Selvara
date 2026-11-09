import { Section, H1, Lead } from "./parts";

/** Step 3: second-factor enrolment before any data is shown. Demo: both options just continue. */
export default function MfaStep({ onEnrol }: { onEnrol: (method: "passkey" | "totp") => void }) {
  const opt = (primary: boolean): React.CSSProperties => ({ textAlign: "left", display: "flex", flexDirection: "column", gap: 2, padding: "14px 16px", borderRadius: 10, border: primary ? "2px solid var(--accent)" : "1px solid var(--line-2)", background: primary ? "var(--accent-weak)" : "var(--surface)", color: "var(--ink)", cursor: "pointer", font: "inherit" });
  return (
    <Section narrow={560}>
      <H1>Protect your access</H1>
      <Lead>Your answers and evidence are confidential, so a second factor is required before you can open the questionnaire. You will use it each time you return.</Lead>
      <button type="button" style={opt(true)} onClick={() => onEnrol("passkey")}>
        <span style={{ fontWeight: 700 }}>Passkey or security key <span style={{ fontSize: 12, color: "var(--ok-ink)" }}>· recommended</span></span>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>Phishing-resistant; works with Face ID, Windows Hello or a FIDO2 key.</span>
      </button>
      <button type="button" style={opt(false)} onClick={() => onEnrol("totp")}>
        <span style={{ fontWeight: 700 }}>Authenticator app</span>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>6-digit codes from any TOTP app.</span>
      </button>
    </Section>
  );
}
