import { activeSessions, noticesFor } from "@/lib/accountSecurity";
import { SECURITY } from "@/lib/me";
import { useGo } from "@/lib/route";
import { currentAccount } from "@/lib/session";
import { useData } from "@/lib/store";

const cell: React.CSSProperties = { background: "var(--surface-2)", borderRadius: 8, padding: 12 };
const lbl: React.CSSProperties = { fontSize: ".75rem", color: "var(--muted)" };

/** Summary of the person's own account security. Changes happen on the account page (Sign-in & security), which re-checks the password first. */
export default function AccountSecurity() {
  useData(); const go = useGo();
  const me = currentAccount();
  const sessions = me ? activeSessions(me.email).length : 0;
  const alerts = me ? noticesFor(me.email).length : 0;
  return (
    <section id="security" className="card" aria-labelledby="me-sec-h">
      <div className="c-head"><h3 id="me-sec-h">My account security</h3></div>
      <div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          <div style={cell}><div style={lbl}>Multi-factor authentication</div><div style={{ fontWeight: 600 }}>{SECURITY.mfaMethod} · enforced</div></div>
          <div style={cell}><div style={lbl}>Active sessions</div><div style={{ fontWeight: 600 }}>{sessions}</div></div>
          <div style={cell}><div style={lbl}>Security alerts</div><div style={{ fontWeight: 600 }}>{alerts}</div></div>
        </div>
        <div><button className="btn btn-secondary sm" onClick={() => go("/auth")}>Manage password, sessions and recovery codes</button></div>
      </div>
    </section>
  );
}
