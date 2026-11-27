import { useCallback, useEffect, useRef, useState } from "react";
import { Icon, Stepper } from "@/components/ui";
import { API_MODE } from "@/services/http";
import * as svc from "@/features/vendorportal/services/vendorPortal";
import invite from "@/features/vendorportal/data/vendorInviteSeed.json";
import { CLARIFICATIONS, CONTROLS, IDLE_MS, INVITE, MSG, QUESTIONS, type ClarBase } from "@/features/vendorportal/lib/vendorSubmission";
import { useAnswers } from "./useAnswers";
import VerifyEmail, { type StepOutcome } from "./VerifyEmail";
import OtpStep from "./OtpStep";
import MfaStep from "./MfaStep";
import Questionnaire from "./Questionnaire";
import Clarification from "./Clarification";
import { DeadState, DoneState } from "./EndStates";
import { SecurityPanel, Toast, type VpToast, type VpTone } from "./parts";
import ApiVendorPortal from "./ApiVendorPortal";

type Step = "verify" | "otp" | "mfa" | "portal" | "clarify" | "done" | "dead";
const AUTHED: Step[] = ["portal", "clarify", "done"];
const DEMO = API_MODE !== "http";
const STAGES = [{ key: "verify", label: "Confirm email" }, { key: "otp", label: "Enter code" }, { key: "mfa", label: "Second factor" }, { key: "portal", label: "Questionnaire" }, { key: "done", label: "Submitted" }];
/** Where each step sits in the five stages (a clarification round counts as the questionnaire; an expired link shows none). */
const STAGE_AT: Partial<Record<Step, number>> = { verify: 0, otp: 1, mfa: 2, portal: 3, clarify: 3, done: STAGES.length }; // submitted: every stage reads Done

/** External vendor assessment portal (board: vendor-assessment-portal). Standalone, no workspace role/RBAC, no audit-log import.
 *  Never logs, stores or echoes the email or code. All state is in memory. */
/** Production (group 8b): the portal on the server, opened from the link in the vendor contact's email (ApiVendorPortal). */
export default function VendorPortalPage() { return API_MODE === "http" ? <ApiVendorPortal /> : <VendorPortalDemo />; }
function VendorPortalDemo() {
  const [masked, setMasked] = useState("");
  const [toast, setToastS] = useState<VpToast | null>(null);
  const say = useCallback((msg: string, tone: VpTone = "info") => setToastS(msg ? { msg, tone } : null), []);
  /** A new step starts clean: the message from the step before is dropped unless this move brings its own (A-28). */
  const [step, setStepS] = useState<Step>("verify");
  const setStep = useCallback((s: Step, msg?: string, tone: VpTone = "info") => { setStepS(s); setToastS(msg ? { msg, tone } : null); }, []);
  const [ref, setRef] = useState("");
  const [ver, setVer] = useState(1);
  const [base, setBase] = useState<ClarBase>({ notes: {}, files: {} });
  const [busy, setBusy] = useState(false);
  const a = useAnswers();
  const authed = AUTHED.includes(step);

  const signOut = useCallback((msg: string) => { setStep("verify", msg, "info"); setMasked(""); }, [setStep]);

  // 15-minute idle timeout: re-armed on activity, cleared on unmount / sign-out.
  useEffect(() => {
    if (!authed) return;
    let t = 0;
    const arm = () => { window.clearTimeout(t); t = window.setTimeout(() => signOut("Session ended after 15 minutes idle. Your answers were saved."), IDLE_MS); };
    const evs = ["keydown", "pointerdown", "touchstart", "scroll"];
    arm();
    evs.forEach((e) => window.addEventListener(e, arm, { passive: true, capture: true }));
    return () => { window.clearTimeout(t); evs.forEach((e) => window.removeEventListener(e, arm, { capture: true })); };
  }, [authed, signOut]);

  // Reference-id/step-name only; no email, code or answers.
  useEffect(() => { if (authed) svc.recordView(step).catch(() => undefined); }, [step, authed]);

  const draft = () => ({
    answers: a.ans,
    comments: Object.fromEntries(Object.entries(a.notes).map(([k, v]) => [k, v.trim().slice(0, 2000)])),
    fileNames: Object.fromEntries(Object.entries(a.files).filter(([, f]) => f.status === "clean").map(([k, f]) => [k, f.name])),
  });

  // Autosave ("saved automatically"): debounced, cleared on unmount.
  const autoRef = useRef(0);
  useEffect(() => {
    if (step !== "portal" || !Object.keys(a.ans).length) return;
    window.clearTimeout(autoRef.current);
    autoRef.current = window.setTimeout(() => { svc.saveDraft(draft()).catch(() => undefined); }, 800);
    return () => window.clearTimeout(autoRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.ans, a.notes, a.files, step]);

  const onVerifyEmail = async (email: string): Promise<StepOutcome> => {
    const r = await svc.verifyEmail(email);
    switch (r.status) {
      case "ok": setMasked(r.masked || "•••"); setStep("otp"); return { kind: "ok" };
      case "dead": setStep("dead"); return { kind: "dead" };
      case "invalid": return { kind: "error", message: MSG.emailInvalid };
      case "personal": return { kind: "error", message: MSG.emailPersonal };
      case "temporary": return { kind: "error", message: MSG.emailTemporary };
      default: return { kind: "error", message: MSG.unverified }; // unknown/unverified: constant wording
    }
  };
  const onVerifyCode = async (code: string): Promise<StepOutcome> => {
    const r = await svc.verifyCode(code);
    if (r.status === "ok") { setStep("mfa"); return { kind: "ok" }; }
    if (r.status === "dead") { setStep("dead"); return { kind: "dead" }; }
    return { kind: "error", message: MSG.codeWrong };
  };
  const onEnrol = async (m: "passkey" | "totp") => {
    try { const r = await svc.enrolSecondFactor(m); if (!r.ok) { say(MSG.generic, "bad"); return; } } catch { say(MSG.generic, "bad"); return; }
    setStep("portal", "Second factor set up. You can now complete the questionnaire.", "ok");
  };
  const onSubmit = async () => {
    setBusy(true);
    try {
      const r = await svc.submit(draft());
      if (!r.ok || !r.ref) say(MSG.generic, "bad"); else { setRef(r.ref); setVer(r.ver ?? 1); setStep("done"); }
    } catch { say(MSG.generic, "bad"); }
    setBusy(false);
  };
  const simulateClarify = () => {
    const ids = QUESTIONS.filter((q) => CLARIFICATIONS[q.id]).map((q) => q.id);
    const b: ClarBase = { notes: {}, files: {} };
    ids.forEach((id) => { b.notes[id] = a.notes[id] || ""; b.files[id] = a.files[id] ? a.files[id].name : ""; });
    setBase(b); setStep("clarify", `${INVITE.customerName} requested clarification on ${ids.length} answers. You can change only those.`, "info");
  };
  const onSendClar = async () => {
    setBusy(true);
    try {
      const r = await svc.submitClarification({ ...draft(), ref, ver });
      if (!r.ok) say(MSG.generic, "bad"); else { const v = r.ver ?? ver + 1; setVer(v); setStep("done", `Clarification sent as version ${v}.`, "ok"); }
    } catch { say(MSG.generic, "bad"); }
    setBusy(false);
  };
  const restart = () => { svc.resetVendorDemo(); a.reset(); setStep("verify"); setMasked(""); setRef(""); setVer(1); setBase({ notes: {}, files: {} }); };

  return (
    <div style={{ minHeight: "100%", background: "var(--bg)", color: "var(--ink)" }}>
      <header style={{ background: "var(--surface)", borderBottom: "1px solid var(--line)", padding: "14px 24px", display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 8, background: "var(--accent)", color: "var(--text-inverse)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="shieldcheck" /></div>
          <div>
            <div style={{ fontWeight: 600 }}>Vendor assessment portal</div>
            <div style={{ fontSize: ".75rem", color: "var(--muted)" }}>Selvara · requested by {INVITE.customerName}</div>
          </div>
        </div>
        {authed ? (
          <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: ".8125rem", flexWrap: "wrap" }}>
            <span style={{ color: "var(--muted)" }}>Signed in as {masked} · session ends after 15 min idle</span>
            <button type="button" className="btn btn-secondary sm" style={{ borderRadius: 999 }} onClick={() => signOut("Signed out. Your answers were saved.")}>Sign out</button>
          </div>
        ) : null}
      </header>
      <div style={{ padding: "28px 16px 48px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 1240, display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
          <main style={{ flex: "999 1 640px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
            {step in STAGE_AT ? <Stepper label="Progress through the assessment" steps={STAGES} current={STAGE_AT[step] ?? 0} futureLabel="Next" /> : null}
            {toast ? <Toast msg={toast.msg} tone={toast.tone} onClose={() => setToastS(null)} /> : null}
            {step === "verify" && <VerifyEmail onVerify={onVerifyEmail} demoHint={DEMO ? invite.invitedEmail : undefined} />}
            {step === "otp" && <OtpStep masked={masked} onVerify={onVerifyCode} demoHint={DEMO} />}
            {step === "mfa" && <MfaStep onEnrol={onEnrol} />}
            {step === "dead" && <DeadState onRestart={restart} />}
            {step === "portal" && <Questionnaire a={a} onSubmit={onSubmit} onToast={say} busy={busy} />}
            {step === "clarify" && <Clarification a={a} base={base} refId={ref} ver={ver} onSend={onSendClar} onToast={say} busy={busy} />}
            {step === "done" && <DoneState refId={ref} ver={ver} onSimulate={simulateClarify} onRestart={restart} />}
          </main>
          <aside aria-label="Access and security" style={{ flex: "1 1 300px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="card" style={{ padding: "16px 18px", gap: 8 }}>
              <div style={{ fontWeight: 600 }}>What you can see</div>
              <div style={{ fontSize: ".8125rem", color: "var(--ink-2)" }}>Only this questionnaire and the files you upload. You cannot see {INVITE.customerName}&apos;s data, other vendors or your organisation&apos;s risk rating. Once submitted, your answers can&apos;t be changed without a new request.</div>
            </div>
            <SecurityPanel controls={CONTROLS} />
          </aside>
        </div>
      </div>
    </div>
  );
}
