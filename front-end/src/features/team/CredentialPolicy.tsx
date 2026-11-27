import { useState } from "react";
import { useLayer } from "@/hooks/useLayer";
import { POLICY } from "@/lib/credentials";
import * as auth from "@/services/auth";

/** Sign-in security / password policy (docs/security/SOD_MATRIX.md section 6). The policy is fixed (OWASP ASVS 2.1 / NIST SP 800-63B), shown read-only.
 *  Only the minimum length is adjustable (12-128); breach check and MFA are locked on. No rotation, history or complexity settings exist. The server re-enforces all of it. */
const FIXED: [string, string][] = [
  ["Length", "At least 12, up to 128 characters; never truncated"],
  ["Characters", "Everything is allowed: spaces, passphrases and any language. No upper/lower/number/symbol rules"],
  ["Blocked", "Common or breached passwords, passwords containing the person's name, email or company, repeated characters and simple sequences"],
  ["Changes", "No scheduled expiry and no password-history rule. A change is required only when compromise is suspected"],
  ["Paste", "Allowed. Password managers are supported; no hints or security questions"],
  ["Sessions", "Idle timeout 15 minutes for privileged roles, 30 minutes otherwise; 12 hours maximum; confirm again for sensitive actions"],
];
export function CredentialPolicy({ manage }: { manage: boolean }) {
  const L = useLayer();
  const [min, setMin] = useState(String(auth.getCredentialSettings().minLength)); const [err, setErr] = useState("");
  const commit = async () => {
    if (!manage) return;
    const n = Number(min.trim());
    if (!/^\d{1,3}$/.test(min.trim()) || n < POLICY.minLength || n > POLICY.maxLength) { setErr(`Enter a whole number from ${POLICY.minLength} to ${POLICY.maxLength}.`); return; }
    if (n === auth.getCredentialSettings().minLength) { setErr(""); return; }
    try { await auth.setMinLength(n); setErr(""); L.toast("Minimum password length: " + n); } catch { setErr("Could not update the setting."); }
  };
  return (
    <div style={{ marginTop: 24 }}>
      <div className="sectitle" style={{ marginTop: 0 }}>Password policy and sign-in security</div>
      <p className="field help" style={{ margin: "0 0 10px" }}>Fixed policy that follows OWASP ASVS 2.1 and NIST SP 800-63B. It applies to every account and cannot be weakened.</p>
      <dl style={{ margin: "0 0 12px", display: "grid", gridTemplateColumns: "110px 1fr", gap: "6px 12px", fontSize: ".8125rem" }}>
        {FIXED.map(([k, v]) => <><dt key={k + "k"} style={{ color: "var(--muted)" }}>{k}</dt><dd key={k + "v"} style={{ margin: 0 }}>{v}</dd></>)}
      </dl>
      <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="field"><label htmlFor="ts-minpw">Minimum length ({POLICY.minLength}–{POLICY.maxLength})</label>
          <input className="input" id="ts-minpw" inputMode="numeric" maxLength={3} readOnly={!manage} value={min} onChange={(e) => setMin(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); }} aria-invalid={err ? true : undefined} aria-describedby="ts-minpw-help" />
          <p className="field help" id="ts-minpw-help" role={err ? "alert" : undefined} style={{ marginTop: 6, color: err ? "var(--bad-ink)" : undefined }}>{err || "Raising it applies from each person's next password change."}</p></div>
        <div className="field"><label htmlFor="ts-breach">Breached-password check</label><input className="input" id="ts-breach" value="On (locked)" readOnly aria-readonly="true" /></div>
        <div className="field"><label htmlFor="ts-mfa">Multi-factor authentication</label><input className="input" id="ts-mfa" value="Required for everyone (locked)" readOnly aria-readonly="true" /><p className="field help" style={{ marginTop: 6 }}>Passkey or security key recommended; authenticator app allowed. SMS and voice are not offered.</p></div>
      </div>
    </div>
  );
}
