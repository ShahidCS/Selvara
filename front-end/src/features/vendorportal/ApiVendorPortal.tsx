import { useCallback, useEffect, useRef, useState } from "react";
import { Icon, Stepper } from "@/components/ui";
import { ApiError, apiFetch, API_BASE } from "@/services/http";
import VerifyEmail, { type StepOutcome } from "./VerifyEmail";
import OtpStep from "./OtpStep";
import { SecurityPanel, Toast, type VpToast, type VpTone } from "./parts";

/* The standalone vendor assessment portal in production (programme group 8b): the vendor contact opens the link from their email, confirms
   the invited address, enters the code emailed to it, and answers in a short session of their own (server/vendorportal.ts). Everything is
   checked and kept on the server; this page only shows it. The link's token is read from the address fragment (never sent to a server log)
   and removed from the address bar at once. */
type Answer = "" | "Y" | "P" | "N" | "NA";
interface Question { domain: string; id: string; text: string; critical: boolean; evidence: string }
interface Item { answer: Answer; comment: string; file: { name: string } | null }
interface Portal { id: string; customer: string; vendor: string; due: string; status: "Sent" | "Submitted" | "Reopened"; version: number; clarify: string[]; clarifyNote: string; questions: Question[]; items: Record<string, Item>; readiness: { unanswered: number; noEvidence: number; clar: number; ready: boolean } }
type Step = "loading" | "verify" | "otp" | "portal" | "done" | "dead" | "nomail";
const ANSWERS: [Answer, string][] = [["Y", "Yes"], ["P", "Partially"], ["N", "No"], ["NA", "Not applicable"]];
const STAGES = [{ key: "verify", label: "Confirm email" }, { key: "otp", label: "Enter code" }, { key: "portal", label: "Questionnaire" }, { key: "done", label: "Submitted" }];
const AT: Partial<Record<Step, number>> = { verify: 0, otp: 1, portal: 2, done: STAGES.length }; // submitted: every stage reads Done
const CONTROLS = [
  "A random link token, valid 30 days; a new link from your contact replaces it",
  "The email must match the invited contact; three other addresses end the link",
  "Personal and temporary email domains are refused",
  "A 6-digit code by email: once, for 10 minutes, 5 tries",
  "You see only this questionnaire; every request is checked on the server",
  "Files: pdf, docx, xlsx, png or jpg, 4 MB, content checked, stored privately (not scanned for malware)",
  "Comments are plain text, up to 2,000 characters",
  "Session cookie HttpOnly, Secure, SameSite=Strict; 15 minutes idle, 8 hours at most",
  "Sign-in, uploads and submissions are recorded in your customer's audit log",
];
const post = <T,>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
const msg = (e: unknown, f: string) => (e instanceof ApiError && e.status > 0 && e.status < 500 ? e.message : f);

export default function ApiVendorPortal() {
  const [step, setStepS] = useState<Step>("loading"); const [toast, setToastS] = useState<VpToast | null>(null);
  const setToast = useCallback((m: string, tone: VpTone = "info") => setToastS(m ? { msg: m, tone } : null), []);
  /** A new step starts clean: the message from the step before is dropped unless this move brings its own (set after the move). */
  const setStep = useCallback((s: Step) => { setStepS(s); setToastS(null); }, []);
  // the link's token, from the address fragment (read once; removed from the address bar below)
  const [token] = useState(() => (typeof window === "undefined" ? "" : /(?:^|[#&])t=([A-Za-z0-9_-]{20,100})/.exec(window.location.hash)?.[1] ?? "")); const [email, setEmail] = useState(""); const [masked, setMasked] = useState("");
  const [info, setInfo] = useState<{ customer: string; vendor: string; due: string } | null>(null);
  const [p, setP] = useState<Portal | null>(null); const [busy, setBusy] = useState(false);
  const loadPortal = useCallback(async () => { const x = await apiFetch<Portal>("/vendor-portal/questionnaire"); setP(x); setInfo({ customer: x.customer, vendor: x.vendor, due: x.due }); setStep(x.status === "Submitted" ? "done" : "portal"); }, [setStep]);
  useEffect(() => {
    if (token) window.history.replaceState(null, "", window.location.pathname);
    // a session from earlier (a reload) opens the questionnaire; otherwise the link starts the sign-in
    let on = true;
    apiFetch<Portal>("/vendor-portal/questionnaire").then((x) => { if (on) { setP(x); setInfo({ customer: x.customer, vendor: x.vendor, due: x.due }); setStep(x.status === "Submitted" ? "done" : "portal"); } },
      () => (token ? post<{ customer: string; vendor: string; due: string; mail: boolean }>("/vendor-portal/open", { token }) : Promise.reject(new Error("no link")))
        .then((o) => { if (on) { setInfo(o); setStep(o.mail ? "verify" : "nomail"); } }, () => { if (on) setStep("dead"); }));
    return () => { on = false; };
  }, [token, setStep]);
  const onEmail = async (e: string): Promise<StepOutcome> => {
    try { const r = await post<{ to: string }>("/vendor-portal/verify-email", { token, email: e }); setEmail(e.trim().toLowerCase()); setMasked(r.to); setStep("otp"); return { kind: "ok" }; }
    catch (x) { if (x instanceof ApiError && x.status === 404) { setStep("dead"); return { kind: "dead" }; } return { kind: "error", message: msg(x, "Something went wrong. Try again.") }; }
  };
  const onCode = async (c: string): Promise<StepOutcome> => {
    try { await post("/vendor-portal/verify-code", { token, email, code: c }); await loadPortal(); setToast("Signed in. Your answers are saved as you go.", "ok"); return { kind: "ok" }; }
    catch (x) { if (x instanceof ApiError && x.status === 404) { setStep("dead"); return { kind: "dead" }; } return { kind: "error", message: msg(x, "That code did not work.") }; }
  };
  const signOut = useCallback(async (why: string) => { try { await post("/vendor-portal/sign-out", {}); } catch { /* the session ends by itself */ } setP(null); setStep(token ? "verify" : "dead"); setToast(why, "info"); }, [token, setStep, setToast]);
  const authed = step === "portal" || step === "done";
  useEffect(() => {
    if (!authed) return;
    let t = 0; const arm = () => { window.clearTimeout(t); t = window.setTimeout(() => signOut("Session ended after 15 minutes idle. Your answers were saved."), 15 * 60_000); };
    const evs = ["keydown", "pointerdown", "touchstart", "scroll"]; arm(); evs.forEach((e) => window.addEventListener(e, arm, { passive: true, capture: true }));
    return () => { window.clearTimeout(t); evs.forEach((e) => window.removeEventListener(e, arm, { capture: true })); };
  }, [authed, signOut]);
  const submit = async () => {
    if (busy) return; setBusy(true);
    try { const x = await post<Portal>("/vendor-portal/submit", {}); setP(x); setStep("done"); setToast(x.version > 1 ? `Clarification sent as version ${x.version}.` : "Thank you. Your answers were submitted.", "ok"); }
    catch (e) { setToast(msg(e, "Could not submit. Try again."), "bad"); }
    setBusy(false);
  };
  return (
    <div style={{ minHeight: "100%", background: "var(--bg)", color: "var(--ink)" }}>
      <header style={{ background: "var(--surface)", borderBottom: "1px solid var(--line)", padding: "14px 24px", display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 8, background: "var(--accent)", color: "var(--text-inverse)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="shieldcheck" /></div>
          <div><div style={{ fontWeight: 600 }}>Vendor assessment portal</div><div style={{ fontSize: 12, color: "var(--muted)" }}>Selvara{info ? ` · requested by ${info.customer} for ${info.vendor}` : ""}</div></div>
        </div>
        {authed ? (
          <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13, flexWrap: "wrap" }}>
            <span style={{ color: "var(--muted)" }}>Signed in{masked ? ` as ${masked}` : ""} · ends after 15 minutes idle</span>
            <button type="button" className="btn btn-secondary sm" onClick={() => signOut("Signed out. Your answers were saved.")}>Sign out</button>
          </div>
        ) : null}
      </header>
      <div style={{ padding: "28px 16px 48px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 1240, display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
          <main style={{ flex: "999 1 640px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
            {step in AT ? <Stepper label="Progress through the assessment" steps={STAGES} current={AT[step] ?? 0} futureLabel="Next" /> : null}
            {toast ? <Toast msg={toast.msg} tone={toast.tone} onClose={() => setToastS(null)} /> : null}
            {step === "loading" ? <p style={{ color: "var(--muted)" }}>Opening…</p> : null}
            {step === "verify" ? <VerifyEmail onVerify={onEmail} /> : null}
            {step === "otp" ? <OtpStep masked={masked} onVerify={onCode} /> : null}
            {step === "nomail" ? <Notice title="This portal is not open yet">Your customer has not set up email yet, so the portal cannot send you a code. Ask your contact there to send the questionnaire again later.</Notice> : null}
            {step === "dead" ? <Notice title="This link does not work">It may have expired, been replaced by a newer one, or been used with another address too often. Ask your contact at the company to send a new link. If you were signed in, open the link from your latest email again.</Notice> : null}
            {step === "portal" && p ? <Answers p={p} setP={setP} onSubmit={submit} busy={busy} onToast={setToast} /> : null}
            {step === "done" && p ? <Notice title={p.version > 1 ? `Clarification received (version ${p.version})` : "Thank you, your answers were submitted"}>Reference {p.id}. {p.customer} reviews them and may ask for a clarification on some answers, by email. Your answers can no longer be changed unless they do.</Notice> : null}
          </main>
          <aside aria-label="Access and security" style={{ flex: "1 1 300px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="card" style={{ padding: "16px 18px", gap: 8 }}>
              <div style={{ fontWeight: 600 }}>What you can see</div>
              <div style={{ fontSize: 13, color: "var(--ink-2)" }}>Only this questionnaire and the files you add. You cannot see {info?.customer ?? "your customer"}&apos;s data, other vendors or your risk rating.</div>
            </div>
            <SecurityPanel controls={CONTROLS} />
          </aside>
        </div>
      </div>
    </div>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="card" style={{ padding: "20px 22px", gap: 8 }}><h2 style={{ fontSize: 18, margin: 0 }}>{title}</h2><p style={{ margin: 0, color: "var(--ink-2)", lineHeight: 1.55 }}>{children}</p></section>;
}

function Answers({ p, setP, onSubmit, busy, onToast }: { p: Portal; setP: (x: Portal) => void; onSubmit: () => void; busy: boolean; onToast: (m: string, tone?: VpTone) => void }) {
  const editable = p.status === "Reopened" ? p.clarify : p.questions.map((q) => q.id);
  const [items, setItems] = useState(p.items); const timer = useRef(0); const [saving, setSaving] = useState<"" | "saving" | "saved">("");
  const save = (next: Record<string, Item>) => {
    setItems(next); setSaving("saving"); window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try { const x = await post<Portal>("/vendor-portal/draft", { items: Object.fromEntries(editable.map((id) => [id, { answer: next[id].answer, comment: next[id].comment }])) }); setP(x); setSaving("saved"); }
      catch (e) { setSaving(""); onToast(msg(e, "Your last change was not saved. Check your connection."), "bad"); }
    }, 700);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const upload = async (id: string, f: File | undefined) => {
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) { onToast(`${f.name} is larger than 4 MB.`, "bad"); return; }
    try {
      const res = await fetch(`${API_BASE}/vendor-portal/files/${encodeURIComponent(id)}?name=${encodeURIComponent(f.name)}`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/octet-stream" }, body: f });
      const j = await res.json().catch(() => ({})); if (!res.ok) { onToast(j.error || "The file could not be added.", "bad"); return; }
      setP(j as Portal); setItems((cur) => ({ ...cur, [id]: { ...cur[id], file: (j as Portal).items[id].file } })); onToast(`${f.name} added.`, "ok");
    } catch { onToast("The file could not be added. Check your connection.", "bad"); }
  };
  const r = p.readiness; const domains = [...new Set(p.questions.map((q) => q.domain))];
  const note = r.unanswered ? `${r.unanswered} question${r.unanswered === 1 ? " still needs" : "s still need"} an answer.` : r.noEvidence ? (r.noEvidence === 1 ? '1 "Yes" answer on a required item still needs evidence.' : `${r.noEvidence} "Yes" answers on required items still need evidence.`) : r.clar ? 'Add a new clarification for each reopened answer, and new evidence for any "Yes".' : "Ready to submit. You cannot change your answers afterwards.";
  return (
    <>
      <section className="card" style={{ padding: "18px 20px", gap: 6 }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>{p.status === "Reopened" ? "Clarification requested" : "Security questionnaire"}</h2>
        <p style={{ margin: 0, color: "var(--ink-2)" }}>{p.customer} asks {p.vendor} to answer{p.due ? ` by ${p.due}` : ""}. Required items are marked; a &ldquo;Yes&rdquo; on them needs evidence. Answers are saved as you go{saving === "saving" ? " (saving…)" : saving === "saved" ? " (saved)" : ""}.</p>
        {p.status === "Reopened" ? <div className="banner warn" role="status" style={{ marginTop: 6 }}><b>Note from {p.customer}:</b> {p.clarifyNote} Only the {p.clarify.length} questions marked below can change.</div> : null}
      </section>
      {domains.map((dom) => (
        <section key={dom} className="card" style={{ padding: "16px 20px", gap: 12 }} aria-labelledby={`dom-${dom}`}>
          <h3 id={`dom-${dom}`} style={{ margin: 0, fontSize: 15 }}>{dom}</h3>
          {p.questions.filter((q) => q.domain === dom).map((q) => {
            const it = items[q.id]; const can = editable.includes(q.id);
            return (
              <fieldset key={q.id} disabled={!can} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px", margin: 0, opacity: can ? 1 : 0.7 }}>
                <legend style={{ fontWeight: 600, fontSize: 13.5, padding: "0 4px" }}>{q.id}. {q.text}{q.critical ? " (required)" : ""}{p.status === "Reopened" && can ? " · reopened" : ""}</legend>
                <div role="radiogroup" aria-label={`Answer to ${q.id}`} style={{ display: "flex", gap: 14, flexWrap: "wrap", margin: "6px 0 8px" }}>
                  {ANSWERS.map(([v, l]) => <label key={v} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13.5 }}><input type="radio" name={`a-${q.id}`} checked={it.answer === v} onChange={() => save({ ...items, [q.id]: { ...it, answer: v } })} />{l}</label>)}
                </div>
                <label className="vh" htmlFor={`c-${q.id}`}>Comment on {q.id}</label>
                <textarea className="input" id={`c-${q.id}`} rows={2} maxLength={2000} placeholder="Comment (optional)" value={it.comment} onChange={(e) => save({ ...items, [q.id]: { ...it, comment: e.target.value } })} />
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 8, fontSize: 12.5 }}>
                  <span style={{ color: "var(--muted)" }}>Evidence: {q.evidence}</span>
                  {it.file ? <span className="chip ok"><Icon name="check" />{it.file.name}</span> : q.critical && it.answer === "Y" ? <span className="chip warn"><Icon name="alert" />Evidence needed</span> : null}
                  {can ? <label className="btn btn-ghost sm" style={{ cursor: "pointer" }}><Icon name="plus" />{it.file ? "Replace file" : "Add file"}<input type="file" className="vh" accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg" aria-label={`Evidence for ${q.id}`} onChange={(e) => { upload(q.id, e.target.files?.[0]); e.target.value = ""; }} /></label> : null}
                </div>
              </fieldset>
            );
          })}
        </section>
      ))}
      <section className="card" style={{ padding: "16px 20px", gap: 10, position: "sticky", bottom: 12 }}>
        <p role="status" style={{ margin: 0, display: "flex", gap: 8, alignItems: "center", color: r.ready ? "var(--ok-ink)" : "var(--ink-2)" }}><Icon name={r.ready ? "check" : "alert"} />{note}</p>
        <div><button type="button" className="btn btn-primary" disabled={busy || saving === "saving" || !r.ready} onClick={onSubmit}>{p.status === "Reopened" ? "Send clarification" : `Submit to ${p.customer}`}</button></div>
      </section>
    </>
  );
}
