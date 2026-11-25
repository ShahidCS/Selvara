import { Icon } from "@/components/ui";
import { useApp } from "@/lib/store";
import { modAllowed } from "@/lib/rbac";
import { useGo } from "@/lib/route";

/* What each line says is checked against the code (owner review, 2026-11-24): "In place" is enforced today; "Planned" is designed for back-end v2
   and not enforced yet, so the page never claims a control that does not exist. */
type Rule = { text: string; planned?: boolean };
export const PWD_RULES: Rule[] = [
  { text: "At least 12 and up to 128 characters (companies may require more); never truncated" },
  { text: "No composition rules: spaces, passphrases and any language are accepted; pasting from a password manager is allowed" },
  { text: "Checked against breached-password data (k-anonymity range lookup: only a hash prefix is sent) and a common-password list" },
  { text: "Refused if it contains the person's name, email or company name, or is a repeated character or simple sequence" },
  { text: "Unicode normalised (NFKC) before checking; strength feedback is advice only" },
  { text: "No scheduled expiry and no password-history rule: a change is required only on evidence of compromise" },
  { text: "Stored by Supabase Auth as a salted hash, never in Selvara's own tables (algorithm and cost to be confirmed with the vendor, VC-31)" },
  { text: "Argon2id with a pepper held in a hardware security module", planned: true },
];
export const AUTH_RULES: Rule[] = [
  { text: "Two-step verification for every company account; companies cannot turn it off (shared demo accounts excepted)" },
  { text: "Authenticator apps (up to two per person, QR code or key) and passkeys; SMS and voice are not offered; 10 single-use recovery codes, shown once" },
  { text: "Account lockout set per company (Standard 5 attempts / 5 minutes, Strict 5 / 30, PCI DSS v4 10 / 30, or Custom); platform accounts always Strict; the same generic message for known and unknown accounts" },
  { text: "A proof-of-work check before signing in after 3 recent failures, and always from hosting, VPN or proxy addresses" },
  { text: "Trusted office networks, approved by a second company admin, are never blocked for failures (accounts still lock, two-step verification still applies)" },
  { text: "Progressive network blocking: 10 failed sign-ins from one address in 15 minutes block it for 5 minutes, then 30 minutes, 2 hours and 24 hours (never permanent); only an elevated super admin lifts a block early" },
  { text: "Security alerts to the account owner: account locked, sign-in after several failures, blocked address, password changed or reset, authenticator added or removed, sessions ended" },
  { text: "Sensitive changes (password, recovery codes, authenticator apps) need the password again; active sessions are listed and others can be signed out" },
  { text: "Requests to join limited to 3 per address per hour, and each approved by a company admin" },
  { text: "Reset links: single use, 15-minute expiry, generic answer, the second factor required before the new password is accepted, every session ended and the owner told" },
  { text: "Session cookies Secure, HttpOnly, SameSite=Strict; idle limit 15 minutes for privileged roles and 30 otherwise; 12-hour absolute limit" },
  { text: "Alerts for a sign-in from a new device or a new country", planned: true },
];
export const PRIV_RULES: Rule[] = [
  { text: "A passkey (this device's fingerprint, face or PIN, or a security key) for every platform super admin; an authenticator app can be added as an extra step" },
  { text: "Just-in-time elevation for every change in this console: 60 minutes at most, a reason (15+ characters) and a ticket, recorded in the platform audit log" },
  { text: "Super admins have the Admin Console only (no workspace access); support can browse and request, never elevate or approve" },
  { text: "Dual control: credits, refunds and manual paid marks above USD 1,000, every write-off and every rate or tax override need a second, different elevated super admin" },
  { text: "MFA resets need identity checks and a second approver" },
  { text: "No standing access to customer content: customer-approved support grants (read-only, expiring) are the only route" },
  { text: "Platform audit log kept as a hash chain, so a changed or removed entry shows" },
  { text: "Console reachable only from allow-listed networks", planned: true },
  { text: "Every platform action streamed to a security monitoring service (SIEM) and reviewed weekly", planned: true },
];

function Rules({ title, rules, tour, children }: { title: string; rules: Rule[]; tour?: string; children?: React.ReactNode }) {
  const planned = rules.filter((r) => r.planned).length;
  return (
    <section className="card" aria-labelledby={`ps-${title.slice(0, 8)}`} data-tour={tour}>
      <div className="c-head"><h3 id={`ps-${title.slice(0, 8)}`}>{title}</h3><div className="r"><span className="tag num">{rules.length - planned} in place{planned ? `, ${planned} planned` : ""}</span></div></div>
      <div className="c-body">
        {/* C7: every row is icon | text | status on one grid, so icons and "Planned" badges line up down each column */}
        <ul className="checklist">
          {rules.map((r) => (
            <li key={r.text} data-planned={r.planned ? "" : undefined}>
              <span className="cl-i" aria-hidden="true"><Icon name={r.planned ? "clock" : "check"} /></span>
              <span className="cl-t">{r.text}</span>
              <span className="cl-s">{r.planned ? <span className="tag">Planned</span> : <span className="vh">In place</span>}</span>
            </li>
          ))}
        </ul>
        {children}
      </div>
    </section>
  );
}
/** Read-only rule lists (copy from the board). These describe server-enforced policy; nothing here is configurable. */
export function PlatformSecurity() {
  const go = useGo(); const role = useApp((s) => s.role);
  const spec = modAllowed(role, "ws", "appsec");
  return (
    <div data-tour="security-rules" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Rules title="Password baseline (all companies)" rules={PWD_RULES}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 14, fontSize: 13 }}>
          <button className="linkbtn inline" onClick={() => go("/auth")}>Try the live password check</button>
          {spec ? <button className="linkbtn inline" onClick={() => go("/ws/appsec")}>Full application security controls</button> : null}
        </div>
      </Rules>
      <Rules title="Authentication and sessions" rules={AUTH_RULES} />
      <Rules title="Privileged access (this console)" rules={PRIV_RULES} />
    </div>
  );
}
