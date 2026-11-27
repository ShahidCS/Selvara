import { useEffect, useRef, useState } from "react";
import { DemoCodeNotice } from "@/components/kit/DemoCodeNotice";
import { useRouter } from "next/router";
import { EmailField, ErrP, PwField, emailValid } from "./AuthFields";
import { LENGTH_COPY, checkPassword } from "@/lib/credentials";
import { nameBlock } from "@/lib/rules";
import { BrandMark } from "@/components/ui";
import { landingPath, ROLES } from "@/lib/rbac";
import { ChallengeRequired, DEMO_DOMAIN, DEMO_ENABLED, DEMO_RESET_NOTE, RESET_SENT, restoreSession, type SignInStep } from "@/lib/session";
import { loadPersisted, useApp } from "@/lib/store";
import * as auth from "@/services/authApi";
import { createPasskey, getAssertion, passkeysSupported } from "@/lib/webauthn";
import { AuthenticatorSetup } from "./AuthenticatorSetup";

const full = { width: "100%" } as const;
const msg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
const codeInput = (v: string) => v.replace(/\D/g, "").slice(0, 6);

/** `/login`: sign in (password, then the second factor), ask to join (a company admin approves), or reset a password. In mock mode the browser runs
 *  the checks (lib/session.ts) and demo accounts exist; in production the server does (services/authApi.ts) and there are no demo accounts. */
export function LoginPage() {
  const router = useRouter();
  const hydrated = useApp((s) => s.hydrated); const signedIn = useApp((s) => s.signedIn); const role = useApp((s) => s.role);
  const [mode, setMode] = useState<"signin" | "join" | "forgot" | "reset">("signin"); const [token, setToken] = useState("");
  const [hold, setHold] = useState(false); // keep the page while new recovery codes are on screen
  const [invite, setInvite] = useState("");
  useEffect(() => {
    loadPersisted(ROLES.map((r) => r.id)); restoreSession();
    // production: the reset email from Supabase opens /login#access_token=…&refresh_token=…&type=recovery; take it out of the address at once
    const h = new URLSearchParams(window.location.hash.slice(1));
    if (h.get("type") === "recovery" && h.get("access_token") && h.get("refresh_token")) {
      const t = btoa(JSON.stringify({ access: h.get("access_token"), refresh: h.get("refresh_token") })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      window.history.replaceState(null, "", window.location.pathname);
      setToken(t); setMode("reset"); // eslint-disable-line react-hooks/set-state-in-effect -- one-time read of the address on arrival
    }
    // production: an invitation link is /login#invite=<token>; the token stays out of server logs (a fragment is never sent) and out of the address
    const inv = h.get("invite");
    if (!DEMO_ENABLED && inv && /^[A-Za-z0-9_-]{43}$/.test(inv)) {
      window.history.replaceState(null, "", window.location.pathname);
      setInvite(inv); setMode("join");
    }
  }, []);
  useEffect(() => { if (hydrated && signedIn && !hold) router.replace(landingPath(role, "ws")); }, [hydrated, signedIn, hold, role, router]);
  return (
    <main id="content" style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div className="card auth-card"><div className="c-body" style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 18 }}><BrandMark size={28} className="" /><span style={{ fontWeight: 600, fontSize: 16 }}>Selvara</span></div>
          {mode === "signin" ? <SignInForm onJoin={() => setMode("join")} onForgot={() => setMode("forgot")} onHold={setHold} />
            : mode === "join" ? <JoinForm invite={invite} onBack={() => { setInvite(""); setMode("signin"); }} />
            : mode === "forgot" ? <ForgotForm onBack={() => setMode("signin")} onOpen={(t) => { setToken(t); setMode("reset"); }} />
            : <ResetForm token={token} onBack={() => setMode("signin")} />}
        </div></div>
        <p className="field help" style={{ textAlign: "center", marginTop: 12 }}>{DEMO_ENABLED ? "Demonstration build. Accounts and data are synthetic and nothing is sent to a server." : "Protected by multi-factor authentication. Activity is logged."}</p>
      </div>
    </main>
  );
}

function SignInForm({ onJoin, onForgot, onHold }: { onJoin: () => void; onForgot: () => void; onHold: (v: boolean) => void }) {
  const [em, setEm] = useState(""); const [pw, setPw] = useState(""); const [err, setErr] = useState(""); const [forced, setForced] = useState(false); const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<"" | "running" | "failed">("");
  const [step, setStep] = useState<SignInStep | null>(null); const [codes, setCodes] = useState<string[] | null>(null);
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
    try { const st = await auth.signIn(em, pw, challenge); setPw(""); setCheck(""); setStep(st); }
    catch (x) {
      if (x instanceof ChallengeRequired) {
        setBusy(false);
        // first time: run the check at once, nothing to click. Asked again right after a solved check: stop and say so, never loop.
        if (challenge) { setCheck("failed"); setErr("The check did not go through. Try again."); } else await runCheck();
        return;
      }
      setCheck(""); setErr(msg(x, "Could not sign in.")); setPw(""); pwRef.current?.focus();
    }
    setBusy(false);
  };
  /** Proof of work: the browser spends a moment hashing, which costs a script running thousands of guesses far more. No third-party service.
   *  Starts by itself; an error (the server could not issue a check, the network dropped) is shown with Try again and Back, never a page that waits forever. */
  const runCheck = async () => {
    setCheck("running"); setErr("");
    let solved: { seed: string; nonce: number };
    try { solved = await auth.solveSignInChallenge(); }
    catch (x) { setCheck("failed"); setErr(msg(x, "The check could not be completed. Try again.")); return; }
    await attempt(solved);
  };
  const restart = () => { setStep(null); setCodes(null); setErr(""); onHold(false); };
  if (codes) return <RecoveryCodes codes={codes} done={() => { setCodes(null); onHold(false); }} />;
  if (step) return <SecondStep step={step} onHold={onHold} onCodes={setCodes} onRestart={restart} onNext={setStep} />;
  if (check) return (
    <>
      <h1 className="auth-h" style={{ fontSize: 20 }}>Quick check</h1>
      <p className="sub" style={{ margin: "0 0 16px" }}>There were several failed sign-ins. Before you try again, your browser does a short calculation that slows down automated guessing. It takes a moment and needs nothing from you.</p>
      <p className="field help" role="status" aria-live="polite" style={{ margin: "0 0 12px", display: check === "running" ? "block" : "none" }}>{check === "running" ? "Checking…" : ""}</p>
      <ErrP id="li-check-err" msg={check === "failed" ? err : ""} mt={0} />
      {check === "failed" && <button type="button" className="btn btn-primary" style={{ ...full, marginTop: 12 }} onClick={() => void runCheck()}>Try again</button>}
      <button type="button" className="btn btn-secondary" style={{ ...full, marginTop: 8 }} onClick={() => { setCheck(""); setErr(""); setPw(""); setBusy(false); }}>Back</button>
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
      <p style={{ textAlign: "center", marginTop: 10, fontSize: 13 }}>New to your company&apos;s workspace? <button type="button" className="linkbtn inline" onClick={onJoin}>Request to join</button></p>
    </>
  );
}

/** The second step: the authenticator code (or a recovery code), adding an authenticator at the first sign-in, or the demo code. */
function SecondStep({ step, onHold, onCodes, onRestart, onNext }: { step: SignInStep; onHold: (v: boolean) => void; onCodes: (c: string[]) => void; onRestart: () => void; onNext: (s: SignInStep) => void }) {
  if (step.step === "passkey") return <PasskeyStep step={step} onRestart={onRestart} onNext={onNext} />;
  return <CodeStep step={step} onHold={onHold} onCodes={onCodes} onRestart={onRestart} />;
}

/** Platform super admins: a passkey on this device or a security key. The first sign-in adds one. The on-screen code is a demonstration-build fallback only. */
function PasskeyStep({ step, onRestart, onNext }: { step: Extract<SignInStep, { step: "passkey" }>; onRestart: () => void; onNext: (s: SignInStep) => void }) {
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [useCode, setUseCode] = useState(false); const [code, setCode] = useState("");
  const btn = useRef<HTMLButtonElement>(null); const codeRef = useRef<HTMLInputElement>(null);
  useEffect(() => { (useCode ? codeRef.current : btn.current)?.focus(); }, [useCode]);
  const supported = passkeysSupported();
  const go = async () => {
    if (busy) return; setBusy(true); setErr("");
    try {
      const r = step.register ? await auth.completePasskey(step.ticket, { register: await createPasskey({ email: step.email, name: step.name, challenge: step.challenge, rpId: step.rpId, exclude: [] }) })
        : await auth.completePasskey(step.ticket, { assertion: await getAssertion({ challenge: step.challenge, rpId: step.rpId, allow: step.allow }) });
      if ("step" in r) { setBusy(false); onNext(r); return; } // an authenticator app was added too: its code comes next
    } catch (x) { const m = x instanceof DOMException ? "The passkey request was cancelled or timed out. Try again." : msg(x, "Could not verify the passkey."); setErr(m); if (/Start again|expired/.test(m)) setTimeout(onRestart, 1500); }
    setBusy(false);
  };
  const submitCode = async (e: React.FormEvent) => { e.preventDefault(); setErr(""); try { await auth.completeSignIn(step.ticket, code); } catch (x) { setErr(msg(x, "Could not verify the code.")); setCode(""); } };
  return (
    <>
      <h1 className="auth-h" style={{ fontSize: 20 }}>{step.register ? "Add a passkey" : "Use your passkey"}</h1>
      <p className="sub" style={{ margin: "0 0 12px" }}>{step.register ? "Platform administrators sign in with a passkey: your device's fingerprint, face or PIN, or a security key. It cannot be phished. Add one now; you will use it at every sign-in." : "Confirm with the passkey on this device or your security key."}</p>
      {!useCode ? <>
        {supported ? null : <p className="banner warn" style={{ margin: "0 0 12px", fontSize: 13 }}>This browser cannot use passkeys. Use a current version of Chrome, Edge, Safari or Firefox.</p>}
        <button ref={btn} type="button" className="btn btn-primary" style={full} disabled={busy || !supported} onClick={go}>{busy ? "Waiting for your passkey…" : step.register ? "Add a passkey" : "Use passkey"}</button>
        <ErrP id="pk-err" msg={err} />
      </> : (
        <form onSubmit={submitCode} noValidate>
          <DemoCodeNotice heading="Demo only." statement="Platform administrators must use a passkey. For this demonstration the code is shown here:" code={step.demoCode ?? ""} />
          <div className="field"><label htmlFor="pk-code">Authentication code</label><input ref={codeRef} className="input num" id="pk-code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(codeInput(e.target.value))} aria-invalid={!!err} aria-describedby={err ? "pk-cerr" : undefined} /></div>
          <ErrP id="pk-cerr" msg={err} />
          <button type="submit" className="btn btn-primary" style={{ ...full, marginTop: 10 }}>Verify</button>
        </form>
      )}
      {step.demoCode ? <div style={{ textAlign: "center", marginTop: 12, fontSize: 13 }}><button type="button" className="linkbtn" onClick={() => { setUseCode((v) => !v); setErr(""); }}>{useCode ? "Use a passkey" : "No passkey on this device? Demo code"}</button></div> : null}
      <div style={{ textAlign: "center", marginTop: 8, fontSize: 13 }}><button type="button" className="linkbtn" onClick={onRestart}>Start again</button></div>
    </>
  );
}

function CodeStep({ step, onHold, onCodes, onRestart }: { step: Exclude<SignInStep, { step: "passkey" }>; onHold: (v: boolean) => void; onCodes: (c: string[]) => void; onRestart: () => void }) {
  const [code, setCode] = useState(""); const [recovery, setRecovery] = useState(false); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, [recovery]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return; setBusy(true); setErr("");
    // adding an authenticator signs the person in and returns recovery codes: hold the page first, so they are shown before the workspace opens
    if (step.step === "enroll") onHold(true);
    try { const r = await auth.completeSignIn(step.ticket, code, { recovery }); if (r.recoveryCodes) onCodes(r.recoveryCodes); else onHold(false); }
    catch (x) {
      onHold(false); const m = msg(x, "Could not verify the code."); setErr(m); setCode(""); if (/Start again|expired|Too many/.test(m)) { setBusy(false); setTimeout(onRestart, 1500); return; } ref.current?.focus(); }
    setBusy(false);
  };
  const title = step.step === "enroll" ? "Set up your authenticator" : "Two-step verification";
  return (
    <>
      <h1 className="auth-h" style={{ fontSize: 20 }}>{title}</h1>
      {step.step === "enroll" ? (
        <>
          <p className="sub" style={{ margin: "0 0 10px" }}>Your account needs a second step at every sign-in. Add Selvara to an authenticator app by scanning the QR code or entering the key, then type the 6-digit code it shows.</p>
          <div style={{ margin: "0 0 12px" }}><AuthenticatorSetup secret={step.secret} uri={step.uri} /></div>
        </>
      ) : step.method === "demo" ? (
        <DemoCodeNotice heading="Demo account." statement="Demo accounts have no authenticator, so the code is shown here:" code={step.demoCode} closing="Real accounts use an authenticator app." />
      ) : <p className="sub" style={{ margin: "0 0 12px" }}>{recovery ? "Enter one of your recovery codes. Each works once." : "Enter the 6-digit code from your authenticator app."}</p>}
      <form onSubmit={submit} noValidate>
        <div className="field"><label htmlFor="mf-code">{recovery ? "Recovery code" : "Authentication code"}</label>
          <input ref={ref} className="input num" id="mf-code" inputMode={recovery ? "text" : "numeric"} autoComplete="one-time-code" maxLength={recovery ? 12 : 6} value={code}
            onChange={(e) => setCode(recovery ? e.target.value.toUpperCase().slice(0, 12) : codeInput(e.target.value))} aria-invalid={!!err} aria-describedby={err ? "mf-err" : undefined} /></div>
        <ErrP id="mf-err" msg={err} />
        <button type="submit" className="btn btn-primary" style={{ ...full, marginTop: 10 }} disabled={busy}>Verify</button>
      </form>
      {step.step === "mfa" && step.method === "totp" ? <div style={{ textAlign: "center", marginTop: 12, fontSize: 13 }}><button type="button" className="linkbtn" onClick={() => { setRecovery((r) => !r); setCode(""); setErr(""); }}>{recovery ? "Use your authenticator app" : "Use a recovery code instead"}</button></div> : null}
      <div style={{ textAlign: "center", marginTop: 8, fontSize: 13 }}><button type="button" className="linkbtn" onClick={onRestart}>Start again</button></div>
    </>
  );
}

/** Shown once after an authenticator is added. The codes live only in this component's state. */
function RecoveryCodes({ codes, done }: { codes: string[]; done: () => void }) {
  const [saved, setSaved] = useState(false); const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <>
      <h1 className="auth-h" style={{ fontSize: 20 }} tabIndex={-1} ref={ref}>Save your recovery codes</h1>
      <p className="sub" style={{ margin: "0 0 12px" }}>If you lose your authenticator, each code signs you in once. They are shown only now; we keep only a scrambled copy.</p>
      <ul aria-label="Recovery codes" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontFamily: "var(--mono, monospace)" }}>{codes.map((c) => <li key={c} className="tagchip" style={{ fontSize: 13, textAlign: "center" }}>{c}</li>)}</ul>
      <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, fontSize: 13 }}><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />I have stored my recovery codes</label>
      <button type="button" className="btn btn-primary" style={{ ...full, marginTop: 12 }} disabled={!saved} onClick={done}>Continue</button>
    </>
  );
}

/** Ask for a reset link. The answer is the same whether or not the account exists. In mock mode there is no email, so the page shows the link. */
function ForgotForm({ onBack, onOpen }: { onBack: () => void; onOpen: (token: string) => void }) {
  const [em, setEm] = useState(""); const [err, setErr] = useState(""); const [forced, setForced] = useState(false);
  const [sent, setSent] = useState<{ token: string | null; demo: boolean } | null>(null);
  const emRef = useRef<HTMLInputElement>(null); const doneRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { (sent ? doneRef.current : emRef.current)?.focus(); }, [sent]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailValid(em)) { setForced(true); emRef.current?.focus(); return; }
    try { const r = await auth.requestReset(em); setSent({ token: r.token, demo: em.trim().toLowerCase().endsWith("@" + DEMO_DOMAIN) }); setErr(""); } catch (x) { setErr(msg(x, "Could not send the link.")); }
  };
  if (sent) return (
    <>
      <h1 className="auth-h" style={{ fontSize: 20 }} tabIndex={-1} ref={doneRef}>Check your email</h1>
      <p className="sub" style={{ margin: "0 0 12px" }}>{RESET_SENT} You will also need your authenticator app or a recovery code.</p>
      {sent.demo ? <div className="banner info" style={{ margin: "0 0 12px", fontSize: 13 }}>{DEMO_RESET_NOTE}</div>
        : sent.token ? <>
          <div className="banner warn" style={{ margin: "0 0 12px", fontSize: 13 }}><b>Demo only.</b> There is no email in this build. The email would contain the link below.</div>
          <button type="button" className="btn btn-primary" style={full} onClick={() => onOpen(sent.token as string)}>Open the reset link</button>
        </> : null}
      <button type="button" className="btn btn-secondary" style={{ ...full, marginTop: 8 }} onClick={onBack}>Back to sign in</button>
    </>
  );
  return (
    <>
      <h1 className="auth-h" style={{ fontSize: 20 }}>Reset your password</h1>
      <p className="sub" style={{ margin: "0 0 16px" }}>We will email you a link. You will also need your authenticator app or a recovery code.</p>
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
  const [valid, setValid] = useState<boolean | null>(null);
  const codeRef = useRef<HTMLInputElement>(null); const doneRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { let on = true; auth.resetLinkValid(token).then((v) => { if (on) setValid(v); }, () => { if (on) setValid(false); }); return () => { on = false; }; }, [token]);
  useEffect(() => { (done ? doneRef.current : codeRef.current)?.focus(); }, [done, valid]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return; setBusy(true); setErr("");
    try { await auth.completeReset(token, code, pw); setPw(""); setDone(true); } catch (x) { setErr(msg(x, "Could not reset the password.")); }
    setBusy(false);
  };
  if (valid === null) return <p className="field help" role="status">Checking the link…</p>;
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
      <p className="sub" style={{ margin: "0 0 16px" }}>Enter the code from your authenticator app (or a recovery code), then your new password.</p>
      <form onSubmit={submit} noValidate>
        <div className="field"><label htmlFor="rs-code">Authentication or recovery code</label><input ref={codeRef} className="input num" id="rs-code" autoComplete="one-time-code" maxLength={12} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 12))} /></div>
        <PwField id="rs-pw" label="New password" ac="new-password" value={pw} onChange={setPw} invalid={!!err} describedBy={err ? "rs-err rs-help" : "rs-help"} />
        <p className="field help" id="rs-help" style={{ marginTop: -4 }}>Use {LENGTH_COPY}. Common and breached passwords are refused.</p>
        <ErrP id="rs-err" msg={err} />
        <button type="submit" className="btn btn-primary" style={{ ...full, marginTop: 10 }} disabled={busy}>Reset password</button>
      </form>
    </>
  );
}

function JoinForm({ onBack, invite = "" }: { onBack: () => void; invite?: string }) {
  const [name, setName] = useState(""); const [em, setEm] = useState(""); const [pw, setPw] = useState(""); const [company, setCompany] = useState("");
  const [err, setErr] = useState(""); const [forced, setForced] = useState(false); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false);
  const [nameErr, setNameErr] = useState(""); const [pwErr, setPwErr] = useState("");
  const nameRef = useRef<HTMLInputElement>(null); const emRef = useRef<HTMLInputElement>(null); const pwRef = useRef<HTMLInputElement>(null); const doneRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { (sent ? doneRef.current : nameRef.current)?.focus(); }, [sent]);
  const inFlight = useRef(false); // EDGE-2: a ref, not state: a second tap in the same render must not send a second request
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy || inFlight.current) return;
    // check each field where it is, in order, and put focus on the first one to fix (the service checks the same rules again)
    const nb = nameBlock(name); setNameErr(nb ?? "");
    if (nb) { nameRef.current?.focus(); return; }
    if (!emailValid(em)) { setForced(true); emRef.current?.focus(); return; }
    // an invitation may use an existing account's current password, which the service checks itself; a new password is checked here first
    const pc = invite ? null : checkPassword(pw, { email: em, name }); const pe = !pc || pc.ok ? "" : pc.errors[0] ?? "Choose a stronger password."; setPwErr(pe);
    if (pe) { pwRef.current?.focus(); return; }
    inFlight.current = true; setBusy(true); setErr("");
    try { await auth.requestToJoin({ name, email: em, password: pw, ...(DEMO_ENABLED ? {} : invite ? { invite } : { company }) }); setPw(""); setSent(true); } catch (x) { setErr(msg(x, "Could not send the request.")); }
    finally { inFlight.current = false; setBusy(false); }
  };
  if (sent && invite) return (
    <>
      <h1 className="auth-h" style={{ fontSize: 20 }} tabIndex={-1} ref={doneRef}>Invitation sent</h1>
      <p className="sub" style={{ margin: "0 0 16px" }}>If the invitation is valid for this email address, you can sign in now. You will set up an authenticator app at your first sign-in. If sign-in does not work, ask your company admin for a new invitation link.</p>
      <button type="button" className="btn btn-primary" style={full} onClick={onBack}>Sign in</button>
    </>
  );
  if (sent) return (
    <>
      <h1 className="auth-h" style={{ fontSize: 20 }} tabIndex={-1} ref={doneRef}>Request sent</h1>
      <p className="sub" style={{ margin: "0 0 16px" }}>If you can join, a company admin will review your request. You can sign in once it is approved. You join as an Employee; an admin can change your role later.</p>
      <button type="button" className="btn btn-secondary" style={full} onClick={onBack}>Back to sign in</button>
    </>
  );
  return (
    <>
      <h1 className="auth-h" style={{ fontSize: 20 }}>{invite ? "Accept your invitation" : "Request to join"}</h1>
      <p className="sub" style={{ margin: "0 0 16px" }}>{invite ? "Use the email address the invitation was sent to. If you already have a Selvara account, enter its current password." : "A company admin approves every new account. You join as an Employee."}</p>
      <form onSubmit={submit} noValidate>
        <div className="field"><label htmlFor="jn-name">Full name</label><input ref={nameRef} className="input" id="jn-name" autoComplete="name" maxLength={80} value={name} onChange={(e) => { setName(e.target.value); setNameErr(""); }}
          aria-invalid={nameErr ? true : undefined} aria-describedby={nameErr ? "jn-name-err" : undefined} />
          <ErrP id="jn-name-err" msg={nameErr} mt={2} /></div>
        <EmailField ref={emRef} id="jn-email" label="Work email" value={em} onChange={setEm} forced={forced} onTouch={() => setForced(false)} />
        {!DEMO_ENABLED && !invite && (
          <div className="field"><label htmlFor="jn-co">Company code</label>
            <input className="input" id="jn-co" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={40} aria-describedby="jn-co-help" value={company} onChange={(e) => setCompany(e.target.value)} />
            <p className="field help" id="jn-co-help" style={{ margin: "4px 0 0" }}>Your company admin can tell you your company code.</p></div>
        )}
        <PwField ref={pwRef} id="jn-pw" label="Password" ac="new-password" value={pw} onChange={(v) => { setPw(v); setPwErr(""); }} invalid={!!pwErr} describedBy={pwErr ? "jn-pw-err jn-help" : err ? "jn-err jn-help" : "jn-help"} />
        <ErrP id="jn-pw-err" msg={pwErr} mt={2} />
        <p className="field help" id="jn-help" style={{ marginTop: 4 }}>Use {LENGTH_COPY}. Common and breached passwords are refused.</p>
        <ErrP id="jn-err" msg={err} />
        <button type="submit" className="btn btn-primary" style={{ ...full, marginTop: 10 }} disabled={busy}>{invite ? "Join" : "Send request"}</button>
      </form>
      <p style={{ textAlign: "center", marginTop: 14, fontSize: 13 }}>Already have an account? <button type="button" className="linkbtn inline" onClick={onBack}>Sign in</button></p>
    </>
  );
}
