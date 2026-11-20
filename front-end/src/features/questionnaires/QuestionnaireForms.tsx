import { API_ON } from "@/lib/rbac";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { FormActions, FormMessage, FormSection, Page } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import { DATA } from "@/lib/data";
import { wsLog } from "@/lib/audit";
import { bumpData, setModState } from "@/lib/store";
import { useGo } from "@/lib/route";
import { clampText } from "@/lib/security";
import { FAIL_MSG, uiMessage } from "@/lib/grcSod";
import * as svc from "@/features/questionnaires/services/questionnaires";

const LIST = "/ws/questionnaires";
const Req = () => <span style={{ color: "var(--bad-ink)" }}>*</span>;
const back = { href: LIST, label: "Questionnaires" };

/** `/ws/questionnaires/import`: import a questionnaire. Same fields, validation and service call as the dialog it replaces. */
export function ImportFormPage() {
  const L = useLayer(); const go = useGo();
  const [due0] = useState(() => (API_ON ? new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10) : "30 Nov 2026")); // production: a real date
  const [name, setName] = useState(""); const [total, setTotal] = useState("120"); const [due, setDue] = useState(due0);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const dirty = !busy && (name !== "" || total !== "120" || due !== due0);
  const { allowLeave } = useUnsavedGuard(dirty, L);
  const ref = useRef<HTMLInputElement>(null); useEffect(() => { ref.current?.focus(); }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = clampText(name, 160);
    if (!n) { setErr("Name is required."); return; }
    const tot = Math.min(100000, Math.max(1, parseInt(total, 10) || 120));
    setBusy(true);
    try {
      await svc.importQuestionnaire(n, tot, clampText(due, 40));
      wsLog("questionnaire.imported", n, "Vendor"); allowLeave(); L.toast("Questionnaire imported"); bumpData();
      const made = DATA.questionnaires[0]; go(made ? `${LIST}/${encodeURIComponent(svc.qidOf(made))}` : LIST);
    } catch (x) { setBusy(false); setErr(""); L.toast(uiMessage(x) || FAIL_MSG, false); }
  };
  return (
    <Page title="Import questionnaire" sub="A customer's security questionnaire to answer from the library." back={back}>
      <div className="scroll rec-scroll"><form className="rec-form" onSubmit={submit} noValidate>
        <FormSection n={1} title="Questionnaire" note="Who sent it and how big it is.">
          <div className="field"><label htmlFor="qi-name">Name <Req /></label><input ref={ref} className="input" id="qi-name" maxLength={160} placeholder="e.g. Acme, CAIQ" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!err} aria-describedby={err ? "qi-err" : undefined} /></div>
          <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field"><label htmlFor="qi-total">Total questions</label><input className="input" id="qi-total" type="number" min={1} max={100000} value={total} onChange={(e) => setTotal(e.target.value)} /></div>
            <div className="field"><label htmlFor="qi-due">Due</label><input className="input" id="qi-due" type={API_ON ? "date" : "text"} maxLength={40} value={due} onChange={(e) => setDue(e.target.value)} /></div>
          </div>
        </FormSection>
        {err ? <FormMessage id="qi-err">{err}</FormMessage> : null}
        <FormActions><button type="button" className="btn btn-secondary" onClick={() => go(LIST)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy}>Import</button></FormActions>
      </form></div>
    </Page>
  );
}

/** `/ws/questionnaires/answer`: add an answer to the library. It is unverified until a different admin or owner verifies it. */
export function AddAnswerPage() {
  const L = useLayer(); const go = useGo();
  const [q, setQ] = useState(""); const [a, setA] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const dirty = !busy && (q !== "" || a !== "");
  const { allowLeave } = useUnsavedGuard(dirty, L);
  const ref = useRef<HTMLInputElement>(null); useEffect(() => { ref.current?.focus(); }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const qq = clampText(q, 300), aa = clampText(a, 2000);
    if (!qq || !aa) { setErr("Question and answer are required."); return; }
    setBusy(true);
    try {
      await svc.addAnswer(qq, aa);
      wsLog("answer.added", qq.slice(0, 40), "Vendor"); allowLeave(); L.toast("Answer added to library");
      setModState("questionnaires.view", "library"); bumpData(); go(LIST);
    } catch (x) { setBusy(false); setErr(""); L.toast(uiMessage(x) || FAIL_MSG, false); }
  };
  return (
    <Page title="Add answer" sub="A new answer is unverified until a different admin or owner verifies it; verified answers feed the public Trust Center chatbot." back={back}>
      <div className="scroll rec-scroll"><form className="rec-form" onSubmit={submit} noValidate>
        <FormSection n={1} title="Question and answer">
          <div className="field"><label htmlFor="qa-q">Question <Req /></label><input ref={ref} className="input" id="qa-q" maxLength={300} placeholder="e.g. Do you run background checks?" value={q} onChange={(e) => setQ(e.target.value)} aria-invalid={!!err} aria-describedby={err ? "qa-err" : undefined} /></div>
          <div className="field"><label htmlFor="qa-a">Answer <Req /></label><textarea className="input" id="qa-a" rows={5} maxLength={2000} style={{ resize: "vertical" }} value={a} onChange={(e) => setA(e.target.value)} /></div>
        </FormSection>
        {err ? <FormMessage id="qa-err">{err}</FormMessage> : null}
        <FormActions><button type="button" className="btn btn-secondary" onClick={() => go(LIST)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy}>Add to library</button></FormActions>
      </form></div>
    </Page>
  );
}
