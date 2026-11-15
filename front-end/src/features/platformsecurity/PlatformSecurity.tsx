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
  "Account lockout set per company (Standard 5 attempts / 5 minutes, Strict 5 / 30, PCI DSS v4 10 / 30); platform accounts always Strict; the same generic message for known and unknown accounts",
  "A proof-of-work check before signing in after 3 recent failures, and always from hosting, VPN or proxy addresses",
  "Trusted office networks, approved by a second company admin, are never blocked for failures (accounts still lock, MFA still applies)",
  "Security alerts to the account owner: account locked, sign-in after several failures, blocked address, password changed or reset, sessions ended",
  "Sensitive changes (password, recovery codes) need the password again within 5 minutes; active sessions listed with sign out other sessions",
  "Progressive network blocking: 10 failed sign-ins from one address in 15 minutes block it for 5 minutes, then 30 minutes, 2 hours and 24 hours (repeating, never permanent); only an elevated super admin can lift a block early",
  "Requests to join limited to 3 per address per hour, and every one approved by a company admin",
  "Generic sign-in errors — no hint whether the account exists",
  "Reset links: single use, 15-minute expiry, generic response, MFA required before the new password is accepted, all sessions revoked and the user notified",
  "Session cookies Secure, HttpOnly, SameSite=Strict; idle timeout 15 minutes for privileged roles and 30 otherwise, 12-hour absolute limit, step-up for sensitive actions",
  "New-device and new-country sign-in alerts to the user"];
export const PRIV_RULES = ["Hardware security key required for super admins", "Just-in-time elevation for every change in this console: 60-minute maximum, reason (15+ characters) and ticket reference recorded",
  "Super admins have the admin space only (no workspace access); support can browse and request, never elevate or approve",
  "Dual control: credits, refunds and manual paid marks above USD 1,000, every write-off and every rate or tax override need a second, different elevated super admin",
  "Console reachable only from allow-listed networks", "MFA resets need identity checks and a second approver",
  "No standing access to customer content; customer-approved support grants (read-only, expiring) are the only route", "All actions streamed to the SIEM and reviewed weekly"];

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
