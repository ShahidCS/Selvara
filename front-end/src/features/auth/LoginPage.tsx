import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { EmailField, ErrP, PwField, emailValid } from "./AuthFields";
import { LENGTH_COPY } from "@/lib/credentials";
import { landingPath, ROLES } from "@/lib/rbac";
import { ChallengeRequired, RESET_SENT, completeReset, requestReset, requestToJoin, resetLinkValid, restoreSession, signIn } from "@/lib/session";
import { issueChallenge, solveChallenge } from "@/lib/accountSecurity";
import { loadPersisted, useApp } from "@/lib/store";

const full = { width: "100%" } as const;
const msg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** `/login`: sign in, or ask to join (a company admin approves). DEMO ONLY: no backend; see lib/session.ts. Demo accounts are listed in README.md, not here. */
export function LoginPage() {
  const router = useRouter();
  const hydrated = useApp((s) => s.hydrated); const signedIn = useApp((s) => s.signedIn); const role = useApp((s) => s.role);
  const [mode, setMode] = useState<"signin" | "join" | "forgot" | "reset">("signin"); const [token, setToken] = useState("");
  useEffect(() => { loadPersisted(ROLES.map((r) => r.id)); restoreSession(); }, []);
  useEffect(() => { if (hydrated && signedIn) router.replace(landingPath(role, "ws")); }, [hydrated, signedIn, role, router]);
  return (
    <main id="content" style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div className="card"><div className="c-body" style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 18 }}><span className="avatar" style={{ background: "var(--accent)", color: "var(--text-inverse)" }} aria-hidden="true">S</span><span style={{ fontWeight: 600, fontSize: 16 }}>Selvara</span></div>
          {mode === "signin" ? <SignInForm onJoin={() => setMode("join")} onForgot={() => setMode("forgot")} />
            : mode === "join" ? <JoinForm onBack={() => setMode("signin")} />
            : mode === "forgot" ? <ForgotForm onBack={() => setMode("signin")} onOpen={(t) => { setToken(t); setMode("reset"); }} />
            : <ResetForm token={token} onBack={() => setMode("signin")} />}
        </div></div>
        <p className="field help" style={{ textAlign: "center", marginTop: 12 }}>Demonstration build. Accounts and data are synthetic and nothing is sent to a server.</p>
      </div>
    </main>
  );
}

function SignInForm({ onJoin, onForgot }: { onJoin: () => void; onForgot: () => void }) {
  const [em, setEm] = useState(""); const [pw, setPw] = useState(""); const [err, setErr] = useState(""); const [forced, setForced] = useState(false); const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<"" | "needed" | "running">("");
  const emRef = useRef<HTMLInputElement>(null); const pwRef = useRef<HTMLInputElement>(null);
  useEffect(() => { emRef.current?.focus(); }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return;
    if (!emailValid(em)) { setForced(true); emRef.current?.focus(); return; }
    if (!pw) { setErr("Enter your password."); pwRef.current?.focus(); return; }
    await attempt();
  };
  const attempt = async (challenge?: { seed: string; nonce: number }) => {
    setBusy(true); setErr("");
    try { await signIn(em, pw, challenge); setCheck(""); }
    catch (x) {
      if (x instanceof ChallengeRequired) { setCheck("needed"); setBusy(false); return; }
      setCheck(""); setErr(msg(x, "Could not sign in.")); setPw(""); pwRef.current?.focus();
    }
    setBusy(false);
  };
  /** Proof of work: the browser spends a moment hashing, which costs a script running thousands of guesses far more. No third-party service. */
  const runCheck = async () => {
    setCheck("running");
    const c = issueChallenge(); const nonce = await solveChallenge(c.seed, c.digits);
    await attempt({ seed: c.seed, nonce });
  };
  if (check) return (
    <>
      <h1 className="auth-h" style={{ fontSize: 20 }}>Quick check</h1>
      <p className="sub" style={{ margin: "0 0 16px" }}>There were several failed sign-ins. Before you try again, your browser does a short calculation that slows down automated guessing. It takes a moment and needs nothing from you.</p>
      <p className="field help" role="status" aria-live="polite" style={{ margin: "0 0 12px" }}>{check === "running" ? "Checking…" : ""}</p>
      <button type="button" className="btn btn-primary" style={full} disabled={check === "running"} onClick={runCheck}>{check === "running" ? "Checking…" : "Continue"}</button>
      <button type="button" className="btn btn-secondary" style={{ ...full, marginTop: 8 }} onClick={() => { setCheck(""); setPw(""); }}>Back</button>
    </>
  );
  return (
    <>
      <h1 className="auth-h" style={{ fontSize: 20 }}>Sign in</h1>
      <p className="sub" style={{ margin: "0 0 16px" }}>Use your work account.</p>
      <form onSubmit={submit} noValidate>
        <EmailField ref={emRef} id="li-email" label="Work email" value={em} onChange={setEm} forced={forced} onTouch={() => setForced(false)} />
        <PwField ref={pwRef} id="li-pw" label="Password" ac="current-password" value={pw} onChange={setPw} invalid={!!err} describedBy={err ? "li-err" : undefined} />
        <ErrP id="li-err" msg={err} />
        <button type="submit" className="btn btn-primary" style={{ ...full, marginTop: 10 }} disabled={busy}>Sign in</button>
      </form>
      <div style={{ textAlign: "center", marginTop: 12, fontSize: 13 }}><button type="button" className="linkbtn" onClick={onForgot}>Forgot password?</button></div>
      <p style={{ textAlign: "center", marginTop: 10, fontSize: 13 }}>New to your company&apos;s workspace? <button type="button" className="linkbtn" onClick={onJoin}>Request to join</button></p>
    </>
  );
}

/** Ask for a reset link. The answer is the same whether or not the account exists. DEMO: there is no email, so the page shows what it would contain. */
function ForgotForm({ onBack, onOpen }: { onBack: () => void; onOpen: (token: string) => void }) {
  const [em, setEm] = useState(""); const [err, setErr] = useState(""); const [forced, setForced] = useState(false);
  const [sent, setSent] = useState<{ token: string; code: string } | null>(null);
  const emRef = useRef<HTMLInputElement>(null); const doneRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { (sent ? doneRef.current : emRef.current)?.focus(); }, [sent]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailValid(em)) { setForced(true); emRef.current?.focus(); return; }
    try { setSent(requestReset(em)); setErr(""); } catch (x) { setErr(msg(x, "Could not send the link.")); }
  };
  if (sent) return (
    <>
      <h1 className="auth-h" style={{ fontSize: 20 }} tabIndex={-1} ref={doneRef}>Check your email</h1>
      <p className="sub" style={{ margin: "0 0 12px" }}>{RESET_SENT}</p>
      <div className="banner warn" style={{ margin: "0 0 12px", fontSize: 13 }}>
        <b>Demo only.</b> There is no email in this build. The email would contain the link below, and your authenticator app would show the code <span className="num" style={{ fontWeight: 600 }}>{sent.code}</span>.
      </div>
      <button type="button" className="btn btn-primary" style={full} onClick={() => onOpen(sent.token)}>Open the reset link</button>
      <button type="button" className="btn btn-secondary" style={{ ...full, marginTop: 8 }} onClick={onBack}>Back to sign in</button>
    </>
  );
  return (
    <>
      <h1 className="auth-h" style={{ fontSize: 20 }}>Reset your password</h1>
      <p className="sub" style={{ margin: "0 0 16px" }}>We will email you a link. You will also need your second factor.</p>
      <form onSubmit={submit} noValidate>
        <EmailField ref={emRef} id="fp-email" label="Work email" value={em} onChange={setEm} forced={forced} onTouch={() => setForced(false)} />
        <ErrP id="fp-err" msg={err} />
        <button type="submit" className="btn btn-primary" style={{ ...full, marginTop: 10 }}>Send link</button>
      </form>
      <div style={{ textAlign: "center", marginTop: 14, fontSize: 13 }}><button type="button" className="linkbtn" onClick={onBack}>Back to sign in</button></div>
    </>
  );
}

/** Finish a reset: the link (single use, 15 minutes) and the second factor. Every session ends; the person then signs in themselves. */
function ResetForm({ token, onBack }: { token: string; onBack: () => void }) {
  const [code, setCode] = useState(""); const [pw, setPw] = useState(""); const [err, setErr] = useState(""); const [done, setDone] = useState(false); const [busy, setBusy] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null); const doneRef = useRef<HTMLHeadingElement>(null);
  const valid = resetLinkValid(token);
  useEffect(() => { (done ? doneRef.current : codeRef.current)?.focus(); }, [done]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return; setBusy(true); setErr("");
    try { await completeReset(token, code, pw); setPw(""); setDone(true); } catch (x) { setErr(msg(x, "Could not reset the password.")); }
    setBusy(false);
  };
  if (done) return (
    <>
      <h1 className="auth-h" style={{ fontSize: 20 }} tabIndex={-1} ref={doneRef}>Password reset</h1>
      <p className="sub" style={{ margin: "0 0 16px" }}>Every session on your account has been signed out. Sign in with your new password.</p>
      <button type="button" className="btn btn-primary" style={full} onClick={onBack}>Back to sign in</button>
    </>
  );
  if (!valid) return (
    <>
      <h1 className="auth-h" style={{ fontSize: 20 }}>Link not valid</h1>
      <p className="sub" style={{ margin: "0 0 16px" }}>This link is not valid or has expired. Links work once, for 15 minutes. Ask for a new one.</p>
      <button type="button" className="btn btn-secondary" style={full} onClick={onBack}>Back to sign in</button>
    </>
  );
  return (
    <>
      <h1 className="auth-h" style={{ fontSize: 20 }}>Choose a new password</h1>
      <p className="sub" style={{ margin: "0 0 16px" }}>Enter the code from your authenticator app, then your new password.</p>
      <form onSubmit={submit} noValidate>
        <div className="field"><label htmlFor="rs-code">Authentication code</label><input ref={codeRef} className="input num" id="rs-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></div>
        <PwField id="rs-pw" label="New password" ac="new-password" value={pw} onChange={setPw} invalid={!!err} describedBy={err ? "rs-err rs-help" : "rs-help"} />
        <p className="field help" id="rs-help" style={{ marginTop: -4 }}>Use {LENGTH_COPY}. Common and breached passwords are refused.</p>
        <ErrP id="rs-err" msg={err} />
        <button type="submit" className="btn btn-primary" style={{ ...full, marginTop: 10 }} disabled={busy}>Reset password</button>
      </form>
    </>
  );
}

function JoinForm({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState(""); const [em, setEm] = useState(""); const [pw, setPw] = useState("");
  const [err, setErr] = useState(""); const [forced, setForced] = useState(false); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null); const emRef = useRef<HTMLInputElement>(null); const doneRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { (sent ? doneRef.current : nameRef.current)?.focus(); }, [sent]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return;
    if (!emailValid(em)) { setForced(true); emRef.current?.focus(); return; }
    setBusy(true); setErr("");
    try { await requestToJoin({ name, email: em, password: pw }); setPw(""); setSent(true); } catch (x) { setErr(msg(x, "Could not send the request.")); }
    setBusy(false);
  };
  if (sent) return (
    <>
      <h1 className="auth-h" style={{ fontSize: 20 }} tabIndex={-1} ref={doneRef}>Request sent</h1>
      <p className="sub" style={{ margin: "0 0 16px" }}>If you can join, a company admin will review your request. You can sign in once it is approved. You join as an Employee; an admin can change your role later.</p>
      <button type="button" className="btn btn-secondary" style={full} onClick={onBack}>Back to sign in</button>
    </>
  );
  return (
    <>
      <h1 className="auth-h" style={{ fontSize: 20 }}>Request to join</h1>
      <p className="sub" style={{ margin: "0 0 16px" }}>A company admin approves every new account. You join as an Employee.</p>
      <form onSubmit={submit} noValidate>
        <div className="field"><label htmlFor="jn-name">Full name</label><input ref={nameRef} className="input" id="jn-name" autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <EmailField ref={emRef} id="jn-email" label="Work email" value={em} onChange={setEm} forced={forced} onTouch={() => setForced(false)} />
        <PwField id="jn-pw" label="Password" ac="new-password" value={pw} onChange={setPw} invalid={!!err} describedBy={err ? "jn-err jn-help" : "jn-help"} />
        <p className="field help" id="jn-help" style={{ marginTop: -4 }}>Use {LENGTH_COPY}. Common and breached passwords are refused.</p>
        <ErrP id="jn-err" msg={err} />
        <button type="submit" className="btn btn-primary" style={{ ...full, marginTop: 10 }} disabled={busy}>Send request</button>
      </form>
      <p style={{ textAlign: "center", marginTop: 14, fontSize: 13 }}>Already have an account? <button type="button" className="linkbtn" onClick={onBack}>Sign in</button></p>
    </>
  );
}
