import { useRef } from "react";
import { Icon } from "@/components/ui";
import { INVITE, QUESTIONS, readiness } from "@/features/vendorportal/lib/vendorSubmission";
import type { AnswersApi } from "./useAnswers";
import QuestionCard from "./QuestionCard";
import { Section, H1, type VpTone } from "./parts";

/** Scroll to a question card and put focus on it (the submit blocker links here). */
const goToQuestion = (id: string) => { const el = document.getElementById(`vp-q-${id}`); if (el) { el.scrollIntoView({ block: "center" }); el.focus({ preventScroll: true }); } };

/** Grouped questionnaire (domain label per card as on the board), progress, CAIQ/SIG prefill (demo stub) and submit. */
export default function Questionnaire({ a, onSubmit, onToast, busy }: { a: AnswersApi; onSubmit: () => void; onToast: (m: string, tone?: VpTone) => void; busy: boolean }) {
  const r = readiness(a.ans, a.files, a.pre);
  const pct = Math.round((r.answered * 100) / r.total);
  const imp = useRef<HTMLInputElement>(null);
  return (
    <>
      <Section pad={20} gap={12}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: ".8125rem", color: "var(--muted)" }}>Questionnaire · due {INVITE.dueAt}</div>
            <div style={{ marginTop: 4 }}><H1>{INVITE.vendorSubject}</H1></div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "1.375rem", fontWeight: 600 }}>{pct}%</div>
            <div style={{ fontSize: ".75rem", color: "var(--muted)" }}>{r.answered} of {r.total} answered · saved automatically</div>
          </div>
        </div>
        <div className="bar-track" role="progressbar" aria-label="Questions answered" aria-valuemin={0} aria-valuemax={r.total} aria-valuenow={r.answered}><span className="bar-fill" style={{ width: `${pct}%`, background: "var(--accent)", minWidth: 0 }}></span></div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", border: "1px dashed var(--accent)", background: "var(--accent-weak)", borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ flex: "1 1 300px", fontSize: ".8125rem" }}><strong>Already completed a CAIQ v4 or SIG?</strong> Upload it and matching answers will be filled in for you to review.</div>
          <button type="button" className="btn btn-secondary" onClick={() => imp.current?.click()}>Upload CAIQ / SIG (.xlsx, .csv)</button>
          <input ref={imp} type="file" hidden accept=".xlsx,.csv" aria-label="CAIQ or SIG file" onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) { const out = a.applyPrefill(f); onToast(out.msg, out.ok ? "ok" : "bad"); } e.target.value = ""; }} />
        </div>
      </Section>
      {QUESTIONS.map((q) => (
        <QuestionCard key={q.id} q={q} needsEvidence={r.missingEv > 0 && r.blocking.includes(q.id)} value={a.ans[q.id] || ""} note={a.notes[q.id] || ""} file={a.files[q.id]} prefilled={!!a.pre[q.id]}
          onAnswer={(v) => a.setAnswer(q.id, v)} onNote={(v) => a.setNote(q.id, v)} onPick={(f) => a.pickFile(q.id, f)} />
      ))}
      <Section pad={18} gap={12}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0, flex: "1 1 280px" }}>
            <div role="status" style={{ fontSize: ".8125rem", color: r.ready ? "var(--ok-ink)" : "var(--warn-ink)", display: "flex", gap: 6, alignItems: "center" }}><Icon name={r.ready ? "check" : "alert"} style={{ flex: "0 0 auto" }} />{r.note}</div>
            {!r.ready && r.blocking.length ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", fontSize: ".8125rem" }}>
                <span style={{ color: "var(--muted)" }}>Go to:</span>
                {r.blocking.slice(0, 12).map((id) => <button key={id} type="button" className="btn btn-ghost sm" onClick={() => goToQuestion(id)}>{id}</button>)}
              </div>
            ) : null}
          </div>
          <button type="button" className={"btn lg " + (r.ready ? "btn-primary" : "btn-secondary")} aria-disabled={!r.ready || busy} onClick={() => { if (!busy && r.ready) onSubmit(); }}
            style={{ height: 48, borderRadius: 999, padding: "0 18px", cursor: r.ready ? "pointer" : "not-allowed", opacity: r.ready ? 1 : 0.7 }}>Submit to {INVITE.customerName}</button>
        </div>
      </Section>
    </>
  );
}
