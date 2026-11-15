import { useEffect, useState } from "react";
import { Chip, Icon } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { getWelcome, hasRecentAuth, REAUTH_MS, SESSION_MS } from "@/lib/accountSecurity";
import { LENGTH_COPY } from "@/lib/credentials";
import { useData } from "@/lib/store";
import * as auth from "@/services/authApi";
import { signOutOthers } from "@/services/me";
import { ErrP, PwField } from "./AuthFields";

const utc = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";
const msg = (e: unknown, f: string) => (e instanceof Error && e.message ? e.message : f);

/** The signed-in person's own account: sign-in history, second factor, sessions, password, recovery codes and security activity. Sensitive changes
 *  need the password again (within 5 minutes). Demo accounts are shown as such and cannot change their shared password or hold recovery codes. */
export function YourAccount() {
  const v = useData(); const L = useLayer();
  const [view, setView] = useState<auth.AccountView | null | undefined>(undefined);
  useEffect(() => { let on = true; auth.accountView().then((x) => { if (on) setView(x); }, () => { if (on) setView(null); }); return () => { on = false; }; }, [v]);
  if (view === undefined) return <p className="field help" role="status">Loading your account…</p>;
  if (!view) return <p className="field help">Sign in to see your account.</p>;
  const w = getWelcome();
  const others = view.sessions.filter((x) => !x.current).length;
  const out = async () => { try { const n = await signOutOthers(); L.toast(n ? `${n} other session${n === 1 ? "" : "s"} signed out` : "No other sessions"); } catch (e) { L.toast(msg(e, "Could not sign out other sessions"), false); } };
  const codes = () => L.openModal("New recovery codes", (close) => <CodesFlow close={close} />);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(360px, 100%), 1fr))", gap: 16, alignItems: "start", padding: 4 }}>
      {view.demo ? (
        <div className="banner warn" style={{ gridColumn: "1 / -1", margin: 0, fontSize: 13 }}>
          <b>Demo account.</b> Shared and synthetic, for demonstration only. Limited: sessions end after {SESSION_MS.demo / 3_600_000} hour, the password cannot be changed or reset, and there is no authenticator or recovery codes (the second step shows its code on screen). Real accounts, created through Request to join, have all of these.
        </div>
      ) : null}
      <section className="card" aria-labelledby="ya-last"><div className="c-head"><h3 id="ya-last">Sign-in history</h3></div>
        <div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
          <div><b>{view.person}</b> · <span className="num">{view.email}</span>{view.demo ? <> <Chip cls="warn" icon="alert">Demo account</Chip></> : null}</div>
          <div>This sign-in: {view.thisSignIn ? `${utc(view.thisSignIn.at)} from ${view.thisSignIn.ip} (${view.thisSignIn.device})` : "not recorded"}</div>
          <div>Previous sign-in: {w?.previous ? `${utc(w.previous.at)} from ${w.previous.ip} (${w.previous.device})` : "none on record"}</div>
          {w?.failedSince ? <div><Chip cls="warn" icon="alert">{w.failedSince} failed attempt{w.failedSince === 1 ? "" : "s"} before this sign-in</Chip></div> : null}
        </div>
      </section>

      <section className="card" aria-labelledby="ya-mfa"><div className="c-head"><h3 id="ya-mfa">Two-step verification</h3></div>
        <div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
          {view.mfa ? <>
            <div><Chip cls="ok" icon="check">Authenticator app</Chip> added {utc(view.mfa.enrolledAt)}</div>
            <div>Recovery codes: {view.mfa.codesLeft} unused</div>
            <div><button className="btn btn-secondary sm" onClick={codes}>Generate new recovery codes</button></div>
          </> : <p style={{ margin: 0 }}>{view.demo ? "Demo accounts have no authenticator: the second step shows its code on screen." : "Not set up yet: you add an authenticator at your next sign-in."}</p>}
        </div>
      </section>

      <section className="card" aria-labelledby="ya-sess"><div className="c-head"><h3 id="ya-sess">Active sessions</h3><div className="r"><span className="tag">{view.sessions.length}</span></div></div>
        <div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }} aria-label="Active sessions">
            {view.sessions.map((x) => (
              <li key={x.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--line)", fontSize: 13, flexWrap: "wrap" }}>
                <div><div style={{ fontWeight: 600 }}>{x.device}</div><div className="sub" style={{ fontSize: 12 }}>{x.ip} · since {utc(x.startedAt)}{x.expiresAt ? ` · ends ${utc(x.expiresAt)}` : ""}</div></div>
                {x.current ? <Chip cls="ok" icon="check">This session</Chip> : <Chip cls="neutral" icon="dot">Active</Chip>}
              </li>
            ))}
          </ul>
          <div><button className="btn btn-danger sm" disabled={!others} onClick={out}>Sign out other sessions</button></div>
        </div>
      </section>

      {view.passkeyRequired || view.passkeys.length ? <Passkeys view={view} /> : null}

      {view.demo ? null : <ChangePassword />}

      <section className="card" aria-labelledby="ya-act" style={{ gridColumn: "1 / -1" }}><div className="c-head"><h3 id="ya-act">Security activity</h3></div>
        <div className="c-body">
          {view.notices.length ? (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }} aria-label="Security activity">
              {view.notices.map((n) => <li key={n.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}><span aria-hidden="true" style={{ color: "var(--warn-ink)" }}><Icon name="access" /></span><span style={{ flex: 1 }}>{n.text}</span><span className="num sub" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{utc(n.at)}</span></li>)}
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
    try { await auth.changePassword(cur, next); setCur(""); setNext(""); L.toast("Password changed. Your other sessions were signed out"); } catch (x) { setErr(msg(x, "Could not change the password.")); }
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
  const confirm = async (e: React.FormEvent) => { e.preventDefault(); setErr(""); try { await auth.reauthenticate(pw); setPw(""); setOk(true); } catch (x) { setErr(msg(x, "Could not confirm your password.")); } };
  const gen = async () => { try { setList(await auth.regenerateRecoveryCodes()); } catch (x) { setErr(msg(x, "Could not generate codes.")); setOk(false); } };
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

/** Passkeys on the account. Required for platform super admins (the last one cannot be removed). Adding or removing needs the password within 5 minutes. */
function Passkeys({ view }: { view: auth.AccountView }) {
  const L = useLayer();
  const add = () => L.openModal("Add a passkey", (close) => <ConfirmThen close={close} label="Add a passkey" run={async () => { await auth.addPasskey(); L.toast("Passkey added"); }} />);
  const remove = (id: string, label: string) => L.openModal(`Remove passkey: ${label}`, (close) => <ConfirmThen close={close} label="Remove passkey" danger run={async () => { await auth.removePasskey(id); L.toast("Passkey removed"); }} />);
  return (
    <section className="card" aria-labelledby="ya-pk"><div className="c-head"><h3 id="ya-pk">Passkeys</h3>{view.passkeyRequired ? <div className="r"><span className="tag">required for your role</span></div> : null}</div>
      <div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
        {view.passkeys.length ? (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }} aria-label="Passkeys">
            {view.passkeys.map((k) => (
              <li key={k.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
                <div><div style={{ fontWeight: 600 }}>{k.label}</div><div className="sub" style={{ fontSize: 12 }}>added {utc(k.createdAt)}</div></div>
                <button className="btn btn-ghost sm" aria-label={`Remove passkey: ${k.label}`} disabled={view.passkeyRequired && view.passkeys.length <= 1} title={view.passkeyRequired && view.passkeys.length <= 1 ? "Add another passkey before removing this one" : undefined} onClick={() => remove(k.id, k.label)}><Icon name="x" />Remove</button>
              </li>
            ))}
          </ul>
        ) : <p style={{ margin: 0 }}>No passkey yet: you add one at your next sign-in.</p>}
        <div><button className="btn btn-secondary sm" onClick={add}>Add a passkey</button></div>
      </div>
    </section>
  );
}

/** Confirm the password (unless confirmed in the last 5 minutes), then run a sensitive change. */
function ConfirmThen({ close, label, run, danger }: { close: () => void; label: string; run: () => Promise<void>; danger?: boolean }) {
  const [ok, setOk] = useState(hasRecentAuth()); const [pw, setPw] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const confirm = async (e: React.FormEvent) => { e.preventDefault(); setErr(""); try { await auth.reauthenticate(pw); setPw(""); setOk(true); } catch (x) { setErr(msg(x, "Could not confirm your password.")); } };
  const go = async () => { setBusy(true); setErr(""); try { await run(); close(); } catch (x) { setErr(x instanceof DOMException ? "The passkey request was cancelled or timed out." : msg(x, "Could not complete the change.")); } setBusy(false); };
  if (!ok) return (
    <form onSubmit={confirm} noValidate>
      <p style={{ margin: "0 0 10px", fontSize: 13 }}>Confirm your password to continue. It stays confirmed for {REAUTH_MS / 60_000} minutes.</p>
      <PwField id="ct-pw" label="Password" ac="current-password" value={pw} onChange={setPw} invalid={!!err} describedBy={err ? "ct-err" : undefined} />
      <ErrP id="ct-err" msg={err} />
      <div className="btngrp" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}><button type="button" className="btn btn-secondary" onClick={close}>Cancel</button><button type="submit" className="btn btn-primary">Confirm</button></div>
    </form>
  );
  return (
    <div>
      <ErrP id="ct-err2" msg={err} />
      <div className="btngrp" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}><button className="btn btn-secondary" onClick={close}>Cancel</button><button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} disabled={busy} onClick={go}>{label}</button></div>
    </div>
  );
}
