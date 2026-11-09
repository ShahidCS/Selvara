import { useState } from "react";
import { LayerFoot } from "@/components/shell/LayerProvider";
import { useLayer } from "@/hooks/useLayer";
import { wsLog } from "@/lib/audit";
import { useGo } from "@/lib/route";
import { useModState } from "@/lib/store";
import { SECURITY, SESSIONS } from "@/lib/me";
import { regenerateCodes, signOutOthers } from "@/services/me";

const cell: React.CSSProperties = { background: "var(--surface-2)", borderRadius: 8, padding: 12 };
const lbl: React.CSSProperties = { fontSize: 12, color: "var(--muted)" };

/** Shows freshly generated codes once. They live only in this component's state: never stored, logged or sent. */
function CodesModal({ close, onDone }: { close: () => void; onDone: () => void }) {
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const gen = async () => { setCodes(await regenerateCodes()); };
  return (
    <>
      <div>
        <p className="banner warn" style={{ margin: "0 0 10px" }}>Demo only: these codes are randomly generated for this prototype and do not work anywhere. In production they are shown once and stored hashed on the server.</p>
        {!codes ? <p style={{ margin: 0, fontSize: 13 }}>Regenerating invalidates all of your old recovery codes. The new codes are shown only once.</p> : (
          <>
            <ul aria-label="New recovery codes" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontFamily: "var(--mono, monospace)" }}>
              {codes.map((c) => <li key={c} className="tagchip" style={{ fontSize: 13, textAlign: "center" }}>{c}</li>)}
            </ul>
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, fontSize: 13 }}><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />I have stored my recovery codes</label>
          </>
        )}
      </div>
      <LayerFoot>
        {!codes ? <><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={gen}>Regenerate codes</button></>
          : <button className="btn btn-primary" disabled={!saved} onClick={() => { onDone(); close(); }}>Done</button>}
      </LayerFoot>
    </>
  );
}

export default function AccountSecurity() {
  const L = useLayer(); const go = useGo();
  const [othersOut, setOthersOut] = useModState("me.othersOut", false);
  const [unused, setUnused] = useModState<number>("me.codesUnused", SECURITY.codesUnused);
  const out = async () => { await signOutOthers(); setOthersOut(true); wsLog("session.others.revoked", "own account", "Access"); L.toast("Other sessions signed out"); };
  const onDone = () => { setUnused(SECURITY.codesTotal); wsLog("recovery.codes.regenerated", "own account", "Access"); L.toast("Recovery codes regenerated. Old codes no longer work"); };
  const regen = () => L.openModal("Regenerate recovery codes", (close) => <CodesModal close={close} onDone={onDone} />);
  return (
    <section id="security" className="card" aria-labelledby="me-sec-h">
      <div className="c-head"><h3 id="me-sec-h">My account security</h3></div>
      <div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          <div style={cell}><div style={lbl}>Password</div><div style={{ fontWeight: 600 }}>Changed {SECURITY.passwordChanged}</div><button className="btn btn-ghost sm" style={{ paddingLeft: 0 }} onClick={() => go("/auth")}>Change password</button></div>
          <div style={cell}><div style={lbl}>Multi-factor authentication</div><div style={{ fontWeight: 600 }}>{SECURITY.mfaMethod} · enforced</div><button className="btn btn-ghost sm" style={{ paddingLeft: 0 }} onClick={() => go("/auth")}>Add a passkey</button></div>
          <div style={cell}><div style={lbl}>Recovery codes</div><div style={{ fontWeight: 600 }}>{unused} of {SECURITY.codesTotal} unused</div>
            <span className="sub" style={{ fontSize: 13, display: "block" }}>Regenerating invalidates old codes</span>
            <button className="btn btn-ghost sm" style={{ paddingLeft: 0 }} onClick={regen}>Regenerate codes</button></div>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Active sessions</div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {SESSIONS.map((s) => {
            const state = s.current ? "Current" : othersOut ? "Signed out" : "Active";
            return (
              <li key={s.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--line)", fontSize: 13, flexWrap: "wrap" }}>
                <div><div style={{ fontWeight: 600 }}>{s.device}</div><div className="sub" style={{ fontSize: 12 }}>{s.where}</div></div>
                <span style={{ fontSize: 12, fontWeight: 600, color: s.current ? "var(--ok-ink)" : othersOut ? "var(--muted)" : "var(--ink)" }}>{state}</span>
              </li>
            );
          })}
        </ul>
        <div><button className="btn btn-danger" onClick={out}>Sign out other sessions</button></div>
      </div>
    </section>
  );
}
