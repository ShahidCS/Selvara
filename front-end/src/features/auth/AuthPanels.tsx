import { ReactNode, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { EmailField, ErrP, PwField, emailValid } from "./AuthFields";
import { POLICY, RESET_ACK, SCORE_LABELS, SESSION_COPY, THROTTLED_MSG, type PwContext } from "@/lib/credentials";
import { generateRecoveryCodes } from "@/lib/me";
import * as svc from "@/services/auth";
import { pwState, pwSubmitError, type AuthView } from "./authLogic";

const INVITED_EMAIL = "invited@company.example";

/** Prototype: `brand` + `card`. */
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div style={{ maxWidth: 380, margin: "24px auto" }}>
      <div className="card"><div className="c-body" style={{ padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 16 }}><span className="avatar" style={{ background: "var(--accent)", color: "#fff" }}>S</span><div style={{ fontWeight: 600, fontSize: 16 }}>Selvara</div></div>
        {children}
      </div></div>
      <p className="field help" style={{ textAlign: "center", marginTop: 12 }}>Preview of the hosted sign-in experience. Every customer gets the same enforced security.</p>
      <p className="field help" style={{ textAlign: "center", marginTop: 4 }}>{SESSION_COPY}</p>
    </div>
  );
}
const Head = ({ h, sub }: { h: string; sub: string }) => <><h2 className="auth-h">{h}</h2><p className="sub" style={{ margin: "0 0 16px" }}>{sub}</p></>;
const full = { width: "100%" } as const;

export interface PanelApi { go: (v: AuthView, focus?: () => void) => void; toast: (m: string) => void }

export function SignIn({ api }: { api: PanelApi }) {
  const [em, setEm] = useState(""); const [pw, setPw] = useState(""); const [err, setErr] = useState(""); const [forced, setForced] = useState(false);
  const emRef = useRef<HTMLInputElement>(null); const pwRef = useRef<HTMLInputElement>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailValid(em)) { setForced(true); emRef.current?.focus(); return; }
    if (!pw) { setErr("Enter your password."); pwRef.current?.focus(); return; }
    api.toast("Password verified — one more step"); // nothing is verified: demo
    api.go("challenge", () => document.getElementById("au-otp")?.focus());
  };
  return (
    <>
      <Head h="Sign in" sub="Welcome back. Use your work account." />
      <form onSubmit={submit} noValidate>
        <EmailField ref={emRef} id="au-email" label="Work email" value={em} onChange={setEm} forced={forced} onTouch={() => setForced(false)} />
        <PwField ref={pwRef} id="au-pw" label="Password" ac="current-password" value={pw} onChange={setPw} invalid={!!err && !pw} describedBy={err ? "au-err" : undefined} />
        <ErrP id="au-err" msg={err} />
        <button type="submit" className="btn btn-primary" style={{ ...full, marginTop: 10 }}>Sign in</button>
        <button type="button" className="btn btn-secondary" style={{ ...full, marginTop: 8 }} onClick={() => api.toast("Passkey challenge started")}><Icon name="shieldcheck" />Sign in with a passkey</button>
        <p className="field help" style={{ marginTop: 10 }}>After {POLICY.lockoutAttempts} failed attempts sign-in slows down. The message is the same whether or not the account exists.</p>
        <div style={{ textAlign: "center", marginTop: 12, fontSize: 13 }}><button type="button" className="linkbtn" onClick={() => api.go("reset")}>Forgot password?</button></div>
      </form>
    </>
  );
}

export function Challenge({ api }: { api: PanelApi }) {
  const [v, setV] = useState(""); const [err, setErr] = useState(""); const [fails, setFails] = useState(0); const ref = useRef<HTMLInputElement>(null);
  const locked = fails >= POLICY.lockoutAttempts;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (locked) { setErr(THROTTLED_MSG); return; }
    if (!/^\d{6}$/.test(v.trim())) {
      const n = fails + 1; setFails(n); setV("");
      setErr(n >= POLICY.lockoutAttempts ? THROTTLED_MSG : "Enter the 6-digit code from your authenticator."); ref.current?.focus(); return;
    }
    setV(""); api.toast("Signed in successfully");
  };
  return (
    <>
      <Head h="Two-factor authentication" sub="Enter the 6-digit code from your authenticator app." />
      <form onSubmit={submit} noValidate>
        <div className="field"><label htmlFor="au-otp">Authentication code</label><input ref={ref} className="input" id="au-otp" inputMode="numeric" autoComplete="one-time-code" spellCheck={false} maxLength={6} placeholder="123456" style={{ textAlign: "center", letterSpacing: 6, fontSize: 18 }} value={v} disabled={locked} onChange={(e) => setV(e.target.value)} aria-invalid={err ? true : undefined} aria-describedby={err ? "au-otperr" : undefined} /></div>
        <ErrP id="au-otperr" msg={err} />
        <button type="submit" className="btn btn-primary" disabled={locked} style={{ ...full, marginTop: 10 }}>Verify &amp; sign in</button>
        <div style={{ textAlign: "center", marginTop: 12, fontSize: 13 }}><button type="button" className="linkbtn" onClick={() => api.toast("Recovery code entry (demo). Each code works once.")}>Use a recovery code</button> · <button type="button" className="linkbtn" onClick={() => api.go("signin")}>Back to sign in</button></div>
      </form>
    </>
  );
}

export function Create({ api }: { api: PanelApi }) {
  const [name, setName] = useState("");
  return (
    <>
      <Head h="Create your account" sub="You were invited to a customer workspace." />
      <form onSubmit={(e) => { e.preventDefault(); api.go("password"); }} noValidate>
        <div className="field"><label htmlFor="ac-name">Full name</label><input className="input" id="ac-name" autoComplete="name" maxLength={100} placeholder="Dana Fischer" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label htmlFor="ac-email">Work email</label><input className="input" id="ac-email" type="email" autoComplete="username" value="invited@company.example" readOnly aria-readonly="true" /></div>
        <button type="submit" className="btn btn-primary" style={{ ...full, marginTop: 10 }}>Continue</button>
      </form>
    </>
  );
}

/** `pfx` "ap" = set password (-> MFA), "rp" = reset (-> MFA confirmation -> sign in). Password text lives only in this component's state:
 *  it is cleared on completion and the panel is unmounted on every view change. It is never logged, stored or sent (only a 5-char hash prefix in real-API mode). */
export function SetPassword({ api, pfx }: { api: PanelApi; pfx: "ap" | "rp" }) {
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState(""); const [err, setErr] = useState(""); const [breached, setBreached] = useState(false);
  const [stage, setStage] = useState<"pw" | "mfa">("pw"); const [code, setCode] = useState(""); const [codeErr, setCodeErr] = useState("");
  const r1 = useRef<HTMLInputElement>(null); const r2 = useRef<HTMLInputElement>(null); const rc = useRef<HTMLInputElement>(null);
  const req = useRef(0);
  const ctx: PwContext = pfx === "ap" ? { email: INVITED_EMAIL } : {};
  const [prevPw, setPrevPw] = useState(pw);
  if (prevPw !== pw) { setPrevPw(pw); if (!pw) setBreached(false); } // clearing the field clears the flag
  useEffect(() => {
    const id = ++req.current;
    if (!pw) return;
    const t = setTimeout(() => { svc.checkBreached(pw).then((r) => { if (id === req.current) setBreached(r.breached); }, () => undefined); }, 400);
    return () => clearTimeout(t);
  }, [pw]);
  useEffect(() => () => { req.current++; }, []);
  const st = pwState(pw, pw2, ctx, breached);
  const unmet = st.rules.filter((r) => !r.met);
  const announce = st.empty ? "" : unmet.length ? "Still needed: " + unmet.map((r) => r.label).join("; ") + "." : "All password rules are met.";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const bad = pwSubmitError(st);
    if (bad) { setErr(bad[0]); (bad[1] === "pw" ? r1 : r2).current?.focus(); return; }
    const b = await svc.checkBreached(pw);
    if (b.breached) { setBreached(true); setErr("This password is on a list of common or breached passwords. Choose a different one."); r1.current?.focus(); return; }
    setErr("");
    if (pfx === "ap") { setPw(""); setPw2(""); api.toast("Password set"); api.go("mfa", () => document.getElementById("authtab-mfa")?.focus()); }
    else { setStage("mfa"); setTimeout(() => rc.current?.focus(), 0); } // MFA is required before the new password is accepted
  };
  const confirmMfa = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) { setCodeErr("Enter the 6-digit code from your authenticator."); rc.current?.focus(); return; }
    setPw(""); setPw2(""); setCode("");
    api.toast("Password updated. All sessions were signed out and you were notified by email.");
    api.go("signin", () => document.getElementById("authtab-signin")?.focus());
  };
  if (stage === "mfa") {
    return (
      <>
        <Head h="Confirm it's you" sub="Enter the 6-digit code from your authenticator app. We only accept the new password after this step." />
        <form onSubmit={confirmMfa} noValidate>
          <div className="field"><label htmlFor="rp-otp">Authentication code</label><input ref={rc} className="input" id="rp-otp" inputMode="numeric" autoComplete="one-time-code" spellCheck={false} maxLength={6} placeholder="123456" style={{ textAlign: "center", letterSpacing: 6, fontSize: 18 }} value={code} onChange={(e) => setCode(e.target.value)} aria-invalid={codeErr ? true : undefined} aria-describedby={codeErr ? "rp-otperr" : undefined} /></div>
          <ErrP id="rp-otperr" msg={codeErr} />
          <button type="submit" className="btn btn-primary" style={{ ...full, marginTop: 10 }}>Verify &amp; update password</button>
        </form>
      </>
    );
  }
  const sc = st.empty ? 0 : st.score;
  return (
    <>
      {pfx === "ap" ? <Head h="Set your password" sub="Use at least 12 and up to 128 characters. A passphrase works well; spaces and any language are fine, and pasting from a password manager is welcome." /> : <Head h="Set a new password" sub="Use at least 12 and up to 128 characters. You will confirm with your authenticator before it is accepted." />}
      <form onSubmit={submit} noValidate>
        <PwField ref={r1} id={`${pfx}-pw`} label="New password" ac="new-password" value={pw} onChange={setPw} describedBy={`${pfx}-reqs`} />
        <PwField ref={r2} id={`${pfx}-pw2`} label="Confirm password" ac="new-password" value={pw2} onChange={setPw2} />
        <div style={{ display: st.empty ? "none" : "block" }}>
          <div className="pw-meter" aria-hidden="true"><span id={`${pfx}-bar`} style={{ width: `${(sc + 1) / 5 * 100}%` }} /></div>
          <p className="field help" style={{ margin: "-6px 0 8px" }}>Strength (advice only): <strong>{SCORE_LABELS[sc]}</strong>{st.feedback[0] ? ". " + st.feedback[0] : ""}</p>
        </div>
        <ul id={`${pfx}-reqs`} className="auth-reqs" aria-label="Password rules">
          {st.rules.map((r) => (
            <li key={r.key} data-req={r.key} className={r.met ? "ok" : ""}><span className="rq-i"><Icon name="check" /></span><span><span className="vh">{st.empty ? "" : r.met ? "Met: " : "Not met: "}</span>{r.label}</span></li>
          ))}
        </ul>
        <div className="vh" role="status" aria-live="polite" aria-atomic="true">{announce}</div>
        <p className="field help" role="status" style={{ color: "var(--bad-ink)", display: pw2 && !st.match ? "block" : "none", margin: "-2px 0 10px" }}>{pw2 && !st.match ? "The two passwords do not match yet." : ""}</p>
        <ErrP id={`${pfx}-err`} msg={err} />
        <button type="submit" className="btn btn-primary" style={{ ...full, marginTop: 4 }}>Continue</button>
        {pfx === "rp" ? <div style={{ textAlign: "center", marginTop: 12, fontSize: 13 }}><button type="button" className="linkbtn" onClick={() => api.go("signin")}>Back to sign in</button></div> : null}
      </form>
    </>
  );
}

export function Reset({ api }: { api: PanelApi }) {
  const [em, setEm] = useState(""); const [forced, setForced] = useState(false); const [sent, setSent] = useState(false); const ref = useRef<HTMLInputElement>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailValid(em)) { setForced(true); ref.current?.focus(); return; }
    setSent(true); // same response whether or not the account exists
  };
  return (
    <>
      <Head h="Reset your password" sub={`Enter your work email. A single-use reset link expires after ${POLICY.resetTokenMinutes} minutes.`} />
      <form onSubmit={submit} noValidate>
        <EmailField ref={ref} id="ar-email" label="Work email" value={em} onChange={setEm} forced={forced} onTouch={() => setForced(false)} />
        <button type="submit" className="btn btn-primary" style={{ ...full, marginTop: 10 }}>Send reset link</button>
        <div role="status" aria-live="polite">{sent ? <p className="field help" style={{ marginTop: 10 }}>{RESET_ACK} The link works once and expires in {POLICY.resetTokenMinutes} minutes. Resetting signs you out everywhere and needs your authenticator.</p> : null}</div>
        {sent ? <button type="button" className="btn btn-secondary" style={{ ...full, marginTop: 8 }} onClick={() => api.go("resetpw", () => document.getElementById("rp-pw")?.focus())}>Open the reset link (demo)</button> : null}
        <div style={{ textAlign: "center", marginTop: 12, fontSize: 13 }}><button type="button" className="linkbtn" onClick={() => api.go("signin")}>Back to sign in</button></div>
      </form>
    </>
  );
}

const METHODS: [string, string, string][] = [["passkey", "shieldcheck", "Passkey / security key (recommended)"], ["totp", "access", "Authenticator app (TOTP)"]];
/** MFA enrollment. The QR block is a static placeholder pattern: no secret, no real enrolment. SMS and voice are not offered (SIM-swap / interception risk). */
export function Mfa({ api, method, pick }: { api: PanelApi; method: string | null; pick: (m: string) => void }) {
  const [codes, setCodes] = useState<string[] | null>(null);
  useEffect(() => () => setCodes(null), []);
  const finish = (msg: string) => { api.toast(msg); setCodes(generateRecoveryCodes(POLICY.recoveryCodes)); };
  if (codes) return <RecoveryCodes api={api} codes={codes} done={() => { setCodes(null); api.toast("Recovery codes saved. They will not be shown again."); }} />;
  return (
    <>
      <Head h="Set up multi-factor authentication" sub="MFA is required for every account. A passkey or security key is recommended; an authenticator app also works." />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {METHODS.map((m) => <button key={m[0]} type="button" className={`btn btn-secondary auth-method${method === m[0] ? " sel" : ""}`} style={{ justifyContent: "flex-start" }} aria-pressed={method === m[0]} onClick={() => pick(m[0])}><Icon name={m[1]} />{m[2]}</button>)}
      </div>
      {method === "totp" ? <Totp onDone={() => finish("MFA enrolled")} /> : method === "passkey" ? (
        <>
          <p className="field help" style={{ margin: "0 0 12px" }}>Your browser or device will prompt you to create a passkey. Nothing to type.</p>
          <button type="button" className="btn btn-primary" style={full} onClick={() => finish("Passkey registered")}>Register passkey</button>
        </>
      ) : <p className="field help" style={{ margin: 0 }}>Choose a method above to continue. MFA is required for every account.</p>}
    </>
  );
}
/** Demo placeholders only (a real API generates, hashes and stores them server-side). Shown once; cleared from state when dismissed or unmounted. */
function RecoveryCodes({ codes, done }: { api: PanelApi; codes: string[]; done: () => void }) {
  return (
    <>
      <Head h="Save your recovery codes" sub={`${codes.length} single-use codes. Each works once if you lose your device. Store them in a password manager. We will not show them again.`} />
      <ul aria-label="Recovery codes" style={{ listStyle: "none", margin: "0 0 12px", padding: 12, background: "var(--surface-2)", borderRadius: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontFamily: "monospace", fontSize: 14 }}>
        {codes.map((c) => <li key={c}>{c}</li>)}
      </ul>
      <button type="button" className="btn btn-primary" style={full} onClick={done}>I have saved these codes</button>
    </>
  );
}
function Totp({ onDone }: { onDone: () => void }) {
  const [v, setV] = useState(""); const [err, setErr] = useState(""); const ref = useRef<HTMLInputElement>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(v.trim())) { setErr("Enter the 6-digit code."); ref.current?.focus(); return; }
    setV(""); onDone();
  };
  return (
    <>
      <div style={{ background: "var(--surface-2)", borderRadius: 8, padding: 12, textAlign: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Scan with your authenticator</div>
        <div style={{ width: 120, height: 120, margin: "0 auto", background: "repeating-conic-gradient(var(--ink) 0 25%, var(--surface) 0 50%) 50%/12px 12px", borderRadius: 6 }} role="img" aria-label="Setup QR code (demo)" />
      </div>
      <form onSubmit={submit} noValidate>
        <div className="field"><label htmlFor="au-totp">Enter the 6-digit code</label><input ref={ref} className="input" id="au-totp" inputMode="numeric" autoComplete="one-time-code" spellCheck={false} maxLength={6} placeholder="123456" style={{ textAlign: "center", letterSpacing: 6, fontSize: 18 }} value={v} onChange={(e) => setV(e.target.value)} aria-invalid={err ? true : undefined} aria-describedby={err ? "au-totperr" : undefined} /></div>
        <ErrP id="au-totperr" msg={err} />
        <button type="submit" className="btn btn-primary" style={{ ...full, marginTop: 4 }}>Verify &amp; finish</button>
      </form>
    </>
  );
}
