import { Icon } from "@/components/ui";
import { useApp } from "@/lib/store";
import { modAllowed } from "@/lib/rbac";
import { useGo } from "@/lib/route";

export const PWD_RULES = ["At least 12 and up to 128 characters (tenants may require more); never truncated",
  "No composition rules: spaces, passphrases and any language are accepted; pasting from a password manager is allowed",
  "Checked against breached-password data (k-anonymity range lookup, only a hash prefix is sent) and a common-password list",
  "Rejected if it contains the person's name, email or company name, or is a repeated character or simple sequence",
  "Unicode normalised (NFKC) before checking and hashing; strength feedback is advice only",
  "No scheduled expiry and no password-history rule: a change is required only on evidence of compromise",
  "Hashed with Argon2id (or bcrypt/scrypt) plus a per-user salt and a pepper kept in a hardware security module"];
export const AUTH_RULES = ["MFA enforced for every user on every tenant — tenants cannot disable it",
  "Passkeys / FIDO2 keys preferred; authenticator app (TOTP) allowed; SMS and voice not offered; 10 single-use recovery codes, shown once",
  "Lockout or progressive delay after 5 failed attempts with the same generic message for known and unknown accounts; IP and device rate limiting",
  "Generic sign-in errors — no hint whether the account exists",
  "Reset links: single use, 15-minute expiry, generic response, MFA required before the new password is accepted, all sessions revoked and the user notified",
  "Session cookies Secure, HttpOnly, SameSite=Strict; idle timeout 15 minutes for privileged roles and 30 otherwise, 12-hour absolute limit, step-up for sensitive actions",
  "New-device and new-country sign-in alerts to the user"];
export const PRIV_RULES = ["Hardware security key required for super admins", "Just-in-time elevation, 60-minute maximum, with reason recorded",
  "Console reachable only from allow-listed networks", "MFA resets need identity checks and a second approver",
  "No standing access to customer content; support grants are approved by the customer and time-boxed", "All actions streamed to the SIEM and reviewed weekly"];

function Rules({ title, rules, children }: { title: string; rules: string[]; children?: React.ReactNode }) {
  return (
    <div className="card"><div className="c-head"><h3>{title}</h3></div>
      <div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {rules.map((r) => <li key={r} style={{ display: "flex", gap: 10, fontSize: 13 }}><span aria-hidden="true" style={{ color: "var(--ok-ink)", flex: "none" }}><Icon name="check" /></span><span>{r}</span></li>)}
        </ul>
        {children}
      </div>
    </div>
  );
}
/** Read-only rule lists (copy from the board). These describe server-enforced policy; nothing here is configurable. */
export function PlatformSecurity() {
  const go = useGo(); const role = useApp((s) => s.role);
  const spec = modAllowed(role, "ws", "appsec");
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))", gap: 16, alignItems: "start" }}>
      <Rules title="Password baseline (all tenants)" rules={PWD_RULES}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, marginTop: 6 }}>
          <button className="btn btn-ghost" onClick={() => go("/auth")}>Try the live password check</button>
          {spec ? <button className="btn btn-ghost" onClick={() => go("/ws/appsec")}>Full application security controls spec</button> : <span className="field help" style={{ margin: 0 }}>Full application security controls spec (not available to your role)</span>}
        </div>
      </Rules>
      <Rules title="Authentication & sessions" rules={AUTH_RULES} />
      <Rules title="Privileged access (this console)" rules={PRIV_RULES} />
    </div>
  );
}
