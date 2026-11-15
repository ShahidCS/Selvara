import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { EmailField, ErrP, PwField, emailValid } from "./AuthFields";
import { LENGTH_COPY } from "@/lib/credentials";
import { landingPath, ROLES } from "@/lib/rbac";
import { requestToJoin, restoreSession, signIn } from "@/lib/session";
import { loadPersisted, useApp } from "@/lib/store";

const full = { width: "100%" } as const;
const msg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** `/login`: sign in, or ask to join (a company admin approves). DEMO ONLY: no backend; see lib/session.ts. Demo accounts are listed in README.md, not here. */
export function LoginPage() {
  const router = useRouter();
  const hydrated = useApp((s) => s.hydrated); const signedIn = useApp((s) => s.signedIn); const role = useApp((s) => s.role);
  const [mode, setMode] = useState<"signin" | "join">("signin");
  useEffect(() => { loadPersisted(ROLES.map((r) => r.id)); restoreSession(); }, []);
  useEffect(() => { if (hydrated && signedIn) router.replace(landingPath(role, "ws")); }, [hydrated, signedIn, role, router]);
  return (
    <main id="content" style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div className="card"><div className="c-body" style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 18 }}><span className="avatar" style={{ background: "var(--accent)", color: "var(--text-inverse)" }} aria-hidden="true">S</span><span style={{ fontWeight: 600, fontSize: 16 }}>Selvara</span></div>
          {mode === "signin" ? <SignInForm onJoin={() => setMode("join")} /> : <JoinForm onBack={() => setMode("signin")} />}
        </div></div>
        <p className="field help" style={{ textAlign: "center", marginTop: 12 }}>Demonstration build. Accounts and data are synthetic and nothing is sent to a server.</p>
      </div>
    </main>
  );
}

function SignInForm({ onJoin }: { onJoin: () => void }) {
  const [em, setEm] = useState(""); const [pw, setPw] = useState(""); const [err, setErr] = useState(""); const [forced, setForced] = useState(false); const [busy, setBusy] = useState(false);
  const emRef = useRef<HTMLInputElement>(null); const pwRef = useRef<HTMLInputElement>(null);
  useEffect(() => { emRef.current?.focus(); }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return;
    if (!emailValid(em)) { setForced(true); emRef.current?.focus(); return; }
    if (!pw) { setErr("Enter your password."); pwRef.current?.focus(); return; }
    setBusy(true); setErr("");
    try { await signIn(em, pw); } catch (x) { setErr(msg(x, "Could not sign in.")); setPw(""); pwRef.current?.focus(); }
    setBusy(false);
  };
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
      <p style={{ textAlign: "center", marginTop: 14, fontSize: 13 }}>New to your company&apos;s workspace? <button type="button" className="linkbtn" onClick={onJoin}>Request to join</button></p>
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
