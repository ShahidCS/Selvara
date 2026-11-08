import { ReactNode, useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { EmailField, ErrP, PwField, emailValid } from "./AuthFields";
import { REQS, pwChecks, pwSubmitError, type AuthView } from "./authLogic";

/** Prototype: `brand` + `card`. */
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div style={{ maxWidth: 380, margin: "24px auto" }}>
      <div className="card"><div className="c-body" style={{ padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 16 }}><span className="avatar" style={{ background: "var(--accent)", color: "#fff" }}>A</span><div style={{ fontWeight: 600, fontSize: 16 }}>Assurance</div></div>
        {children}
      </div></div>
      <p className="field help" style={{ textAlign: "center", marginTop: 12 }}>Preview of the hosted sign-in experience. Every customer gets the same enforced security.</p>
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
        <div style={{ textAlign: "center", marginTop: 12, fontSize: 13 }}><button type="button" className="linkbtn" onClick={() => api.go("reset")}>Forgot password?</button></div>
      </form>
    </>
  );
}

export function Challenge({ api }: { api: PanelApi }) {
  const [v, setV] = useState(""); const [err, setErr] = useState(""); const ref = useRef<HTMLInputElement>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(v.trim())) { setErr("Enter the 6-digit code from your authenticator."); ref.current?.focus(); return; }
    api.toast("Signed in successfully");
  };
  return (
    <>
      <Head h="Two-factor authentication" sub="Enter the 6-digit code from your authenticator app." />
      <form onSubmit={submit} noValidate>
        <div className="field"><label htmlFor="au-otp">Authentication code</label><input ref={ref} className="input" id="au-otp" inputMode="numeric" autoComplete="one-time-code" spellCheck={false} maxLength={6} placeholder="123456" style={{ textAlign: "center", letterSpacing: 6, fontSize: 18 }} value={v} onChange={(e) => setV(e.target.value)} aria-invalid={err ? true : undefined} aria-describedby={err ? "au-otperr" : undefined} /></div>
        <ErrP id="au-otperr" msg={err} />
        <button type="submit" className="btn btn-primary" style={{ ...full, marginTop: 10 }}>Verify &amp; sign in</button>
        <div style={{ textAlign: "center", marginTop: 12, fontSize: 13 }}><button type="button" className="linkbtn" onClick={() => api.toast("Backup code entry (demo)")}>Use a backup code</button> · <button type="button" className="linkbtn" onClick={() => api.go("signin")}>Back to sign in</button></div>
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

/** Prototype: authPwBlock + authSetPw. `pfx` "ap" = set password (-> MFA), "rp" = reset (-> sign in). */
export function SetPassword({ api, pfx }: { api: PanelApi; pfx: "ap" | "rp" }) {
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState(""); const [err, setErr] = useState("");
  const r1 = useRef<HTMLInputElement>(null); const r2 = useRef<HTMLInputElement>(null);
  const c = pwChecks(pw, pw2);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const bad = pwSubmitError(pw, pw2);
    if (bad) { setErr(bad[0]); (bad[1] === "pw" ? r1 : r2).current?.focus(); return; }
    if (pfx === "ap") { api.toast("Password set"); api.go("mfa", () => document.getElementById("authtab-mfa")?.focus()); }
    else { api.toast("Password updated"); api.go("signin", () => document.getElementById("authtab-signin")?.focus()); }
  };
  return (
    <>
      {pfx === "ap" ? <Head h="Set your password" sub="Create a strong password. We also check it against breach lists." /> : <Head h="Set a new password" sub="Choose a new password for your account." />}
      <form onSubmit={submit} noValidate>
        <PwField ref={r1} id={`${pfx}-pw`} label="New password" ac="new-password" value={pw} onChange={setPw} />
        <PwField ref={r2} id={`${pfx}-pw2`} label="Confirm password" ac="new-password" value={pw2} onChange={setPw2} />
        <div className="pw-meter" aria-hidden="true" style={{ display: pw ? "block" : "none" }}><span id={`${pfx}-bar`} style={{ width: `${c.met / 5 * 100}%` }} /></div>
        <ul id={`${pfx}-reqs`} className="auth-reqs" aria-label="Password requirements">
          {REQS.map(([k, t]) => (
            <li key={k} data-req={k} className={c[k] ? "ok" : ""}><span className="rq-i"><Icon name="check" /></span><span><span className="vh">{c[k] ? "Met: " : "Not met: "}</span>{t}</span></li>
          ))}
        </ul>
        <p className="field help" id={`${pfx}-warn`} role="alert" style={{ color: "var(--bad-ink)", display: pw && !c.allowed ? "block" : "none", margin: "-2px 0 10px" }}>That character isn&apos;t allowed. Use letters, numbers and standard symbols ( ! @ # $ % &amp; * ( ) etc.).</p>
        <ErrP id={`${pfx}-err`} msg={err} />
        <button type="submit" className="btn btn-primary" style={{ ...full, marginTop: 4 }}>{pfx === "ap" ? "Continue" : "Update password"}</button>
        {pfx === "rp" ? <div style={{ textAlign: "center", marginTop: 12, fontSize: 13 }}><button type="button" className="linkbtn" onClick={() => api.go("signin")}>Back to sign in</button></div> : null}
      </form>
    </>
  );
}

export function Reset({ api }: { api: PanelApi }) {
  const [em, setEm] = useState(""); const [forced, setForced] = useState(false); const ref = useRef<HTMLInputElement>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailValid(em)) { setForced(true); ref.current?.focus(); return; }
    api.toast("Reset link sent (demo)");
    api.go("resetpw", () => document.getElementById("rp-pw")?.focus());
  };
  return (
    <>
      <Head h="Reset your password" sub="We'll email a secure, single-use reset link." />
      <form onSubmit={submit} noValidate>
        <EmailField ref={ref} id="ar-email" label="Work email" value={em} onChange={setEm} forced={forced} onTouch={() => setForced(false)} />
        <button type="submit" className="btn btn-primary" style={{ ...full, marginTop: 10 }}>Send reset link</button>
        <div style={{ textAlign: "center", marginTop: 12, fontSize: 13 }}><button type="button" className="linkbtn" onClick={() => api.go("signin")}>Back to sign in</button></div>
      </form>
    </>
  );
}

const METHODS: [string, string, string][] = [["totp", "access", "Authenticator app (TOTP)"], ["passkey", "shieldcheck", "Passkey / security key"], ["sms", "message", "SMS backup code"]];
/** Prototype: MFA enrollment. The QR block is a static placeholder pattern: no secret, no real enrolment. */
export function Mfa({ api, method, pick }: { api: PanelApi; method: string | null; pick: (m: string) => void }) {
  return (
    <>
      <Head h="Set up multi-factor authentication" sub="MFA is required for every account. Choose a method." />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {METHODS.map((m) => <button key={m[0]} type="button" className={`btn btn-secondary auth-method${method === m[0] ? " sel" : ""}`} style={{ justifyContent: "flex-start" }} aria-pressed={method === m[0]} onClick={() => pick(m[0])}><Icon name={m[1]} />{m[2]}</button>)}
      </div>
      {method === "totp" ? <Totp api={api} /> : method === "passkey" ? (
        <>
          <p className="field help" style={{ margin: "0 0 12px" }}>Your browser or device will prompt you to create a passkey. Nothing to type.</p>
          <button type="button" className="btn btn-primary" style={full} onClick={() => api.toast("Passkey registered — account ready")}>Register passkey</button>
        </>
      ) : method === "sms" ? <Sms api={api} /> : <p className="field help" style={{ margin: 0 }}>Choose a method above to continue. MFA is required for every account.</p>}
    </>
  );
}
function Totp({ api }: { api: PanelApi }) {
  const [v, setV] = useState(""); const [err, setErr] = useState(""); const ref = useRef<HTMLInputElement>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(v.trim())) { setErr("Enter the 6-digit code."); ref.current?.focus(); return; }
    api.toast("MFA enrolled — account ready");
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
function Sms({ api }: { api: PanelApi }) {
  const [v, setV] = useState(""); const [err, setErr] = useState(""); const ref = useRef<HTMLInputElement>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (v.replace(/\D/g, "").length < 7) { setErr("Enter a valid mobile number."); ref.current?.focus(); return; }
    api.toast("SMS code sent (demo)");
  };
  return (
    <form onSubmit={submit} noValidate>
      <div className="field"><label htmlFor="au-phone">Mobile number</label><input ref={ref} className="input" id="au-phone" type="tel" autoComplete="tel" spellCheck={false} maxLength={25} placeholder="+971 5X XXX XXXX" value={v} onChange={(e) => setV(e.target.value)} aria-invalid={err ? true : undefined} aria-describedby={err ? "au-smserr" : undefined} /></div>
      <ErrP id="au-smserr" msg={err} />
      <button type="submit" className="btn btn-primary" style={{ ...full, marginTop: 4 }}>Send code</button>
    </form>
  );
}
