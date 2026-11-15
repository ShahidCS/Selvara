import { useState } from "react";
import { Chip, Icon } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { activeSessions, acct, getWelcome, hasRecentAuth, noticesFor, REAUTH_MS } from "@/lib/accountSecurity";
import { LENGTH_COPY } from "@/lib/credentials";
import { changePassword, currentAccount, reauthenticate } from "@/lib/session";
import { useData } from "@/lib/store";
import { regenerateCodes, signOutOthers } from "@/services/me";
import { ErrP, PwField } from "./AuthFields";

const utc = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";
const msg = (e: unknown, f: string) => (e instanceof Error && e.message ? e.message : f);

/** The signed-in person's own account: last sign-in, active sessions, security activity, password and recovery codes. Sensitive changes need the
 *  password again (within 5 minutes). DEMO ONLY: state is kept in this browser (lib/accountSecurity.ts). */
export function YourAccount() {
  useData(); const L = useLayer();
  const me = currentAccount();
  if (!me) return <p className="field help">Sign in to see your account.</p>;
  const w = getWelcome(); const now = acct().last[me.email];
  const sessions = activeSessions(me.email); const current = acct().current;
  const notices = noticesFor(me.email).slice(0, 20);
  const others = sessions.filter((x) => x.id !== current).length;
  const out = async () => { try { const n = await signOutOthers(); L.toast(n ? `${n} other session${n === 1 ? "" : "s"} signed out` : "No other sessions"); } catch (e) { L.toast(msg(e, "Could not sign out other sessions"), false); } };
  const codes = () => L.openModal("New recovery codes", (close) => <CodesFlow close={close} />);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(360px, 100%), 1fr))", gap: 16, alignItems: "start", padding: 4 }}>
      <section className="card" aria-labelledby="ya-last"><div className="c-head"><h3 id="ya-last">Sign-in history</h3></div>
        <div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
          <div><b>{me.person}</b> · <span className="num">{me.email}</span></div>
          <div>This sign-in: {now ? `${utc(now.at)} from ${now.ip} (${now.device})` : "not recorded"}</div>
          <div>Previous sign-in: {w?.previous ? `${utc(w.previous.at)} from ${w.previous.ip} (${w.previous.device})` : "none on record"}</div>
          {w?.failedSince ? <div><Chip cls="warn" icon="alert">{w.failedSince} failed attempt{w.failedSince === 1 ? "" : "s"} before this sign-in</Chip></div> : null}
        </div>
      </section>

      <section className="card" aria-labelledby="ya-sess"><div className="c-head"><h3 id="ya-sess">Active sessions</h3><div className="r"><span className="tag">{sessions.length}</span></div></div>
        <div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }} aria-label="Active sessions">
            {sessions.map((x) => (
              <li key={x.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--line)", fontSize: 13, flexWrap: "wrap" }}>
                <div><div style={{ fontWeight: 600 }}>{x.device}</div><div className="sub" style={{ fontSize: 12 }}>{x.ip} · since {utc(x.startedAt)}</div></div>
                {x.id === current ? <Chip cls="ok" icon="check">This session</Chip> : <Chip cls="neutral" icon="dot">Active</Chip>}
              </li>
            ))}
          </ul>
          <div><button className="btn btn-danger sm" disabled={!others} onClick={out}>Sign out other sessions</button></div>
        </div>
      </section>

      <ChangePassword />

      <section className="card" aria-labelledby="ya-codes"><div className="c-head"><h3 id="ya-codes">Recovery codes</h3></div>
        <div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
          <p style={{ margin: 0 }}>New codes replace all of your old ones. You confirm your password first.</p>
          <div><button className="btn btn-secondary sm" onClick={codes}>Generate new codes</button></div>
        </div>
      </section>

      <section className="card" aria-labelledby="ya-act" style={{ gridColumn: "1 / -1" }}><div className="c-head"><h3 id="ya-act">Security activity</h3></div>
        <div className="c-body">
          {notices.length ? (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }} aria-label="Security activity">
              {notices.map((n) => <li key={n.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}><span aria-hidden="true" style={{ color: "var(--warn-ink)" }}><Icon name="access" /></span><span style={{ flex: 1 }}>{n.text}</span><span className="num sub" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{utc(n.at)}</span></li>)}
            </ul>
          ) : <p className="field help" style={{ margin: 0 }}>Nothing to report.</p>}
        </div>
      </section>
    </div>
  );
}

function ChangePassword() {
  const L = useLayer();
  const [cur, setCur] = useState(""); const [next, setNext] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return; setBusy(true); setErr("");
    try { await changePassword(cur, next); setCur(""); setNext(""); L.toast("Password changed. Your other sessions were signed out"); } catch (x) { setErr(msg(x, "Could not change the password.")); }
    setBusy(false);
  };
  return (
    <section className="card" aria-labelledby="ya-pw"><div className="c-head"><h3 id="ya-pw">Change password</h3></div>
      <div className="c-body">
        <form onSubmit={submit} noValidate>
          <PwField id="ya-cur" label="Current password" ac="current-password" value={cur} onChange={setCur} />
          <PwField id="ya-new" label="New password" ac="new-password" value={next} onChange={setNext} invalid={!!err} describedBy={err ? "ya-err ya-help" : "ya-help"} />
          <p className="field help" id="ya-help" style={{ marginTop: -4 }}>Use {LENGTH_COPY}. Every other session is signed out.</p>
          <ErrP id="ya-err" msg={err} />
          <button type="submit" className="btn btn-primary sm" style={{ marginTop: 8 }} disabled={busy}>Change password</button>
        </form>
      </div>
    </section>
  );
}

/** Confirm the password (unless confirmed in the last 5 minutes), then show new codes once. Codes live only in this component's state. */
function CodesFlow({ close }: { close: () => void }) {
  const L = useLayer();
  const [ok, setOk] = useState(hasRecentAuth()); const [pw, setPw] = useState(""); const [err, setErr] = useState("");
  const [list, setList] = useState<string[] | null>(null); const [saved, setSaved] = useState(false);
  const confirm = async (e: React.FormEvent) => { e.preventDefault(); setErr(""); try { await reauthenticate(pw); setPw(""); setOk(true); } catch (x) { setErr(msg(x, "Could not confirm your password.")); } };
  const gen = async () => { try { setList(await regenerateCodes()); } catch (x) { setErr(msg(x, "Could not generate codes.")); setOk(false); } };
  if (!ok) return (
    <form onSubmit={confirm} noValidate>
      <p style={{ margin: "0 0 10px", fontSize: 13 }}>Confirm your password to continue. It stays confirmed for {REAUTH_MS / 60_000} minutes.</p>
      <PwField id="cf-pw" label="Password" ac="current-password" value={pw} onChange={setPw} invalid={!!err} describedBy={err ? "cf-err" : undefined} />
      <ErrP id="cf-err" msg={err} />
      <div className="btngrp" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}><button type="button" className="btn btn-secondary" onClick={close}>Cancel</button><button type="submit" className="btn btn-primary">Confirm</button></div>
    </form>
  );
  return (
    <div>
      <p className="banner warn" style={{ margin: "0 0 10px" }}>Demo only: these codes are random and work nowhere. In production they are shown once and stored hashed on the server.</p>
      {!list ? <><p style={{ margin: 0, fontSize: 13 }}>New codes replace all of your old ones and are shown only once.</p><ErrP id="cg-err" msg={err} />
        <div className="btngrp" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={gen}>Generate codes</button></div></> : (
        <>
          <ul aria-label="New recovery codes" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontFamily: "var(--mono, monospace)" }}>{list.map((c) => <li key={c} className="tagchip" style={{ fontSize: 13, textAlign: "center" }}>{c}</li>)}</ul>
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, fontSize: 13 }}><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />I have stored my recovery codes</label>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}><button className="btn btn-primary" disabled={!saved} onClick={() => { close(); L.toast("New recovery codes saved. Old codes no longer work"); }}>Done</button></div>
        </>
      )}
    </div>
  );
}
