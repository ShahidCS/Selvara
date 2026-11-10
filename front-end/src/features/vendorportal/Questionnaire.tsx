import { useRef } from "react";
import { INVITE, QUESTIONS, readiness } from "@/features/vendorportal/lib/vendorSubmission";
import type { AnswersApi } from "./useAnswers";
import QuestionCard from "./QuestionCard";
import { Section, H1 } from "./parts";

/** Grouped questionnaire (domain label per card as on the board), progress, CAIQ/SIG prefill (demo stub) and submit. */
export default function Questionnaire({ a, onSubmit, onToast, busy }: { a: AnswersApi; onSubmit: () => void; onToast: (m: string) => void; busy: boolean }) {
  const r = readiness(a.ans, a.files, a.pre);
  const pct = Math.round((r.answered * 100) / r.total);
  const imp = useRef<HTMLInputElement>(null);
  return (
    <>
      <Section pad={20} gap={12}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>Questionnaire · due {INVITE.dueAt}</div>
            <div style={{ marginTop: 4 }}><H1>{INVITE.vendorSubject}</H1></div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 22, fontWeight: 600 }}>{pct}%</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{r.answered} of {r.total} answered · saved automatically</div>
          </div>
        </div>
        <div className="bar-track" role="progressbar" aria-label="Questions answered" aria-valuemin={0} aria-valuemax={r.total} aria-valuenow={r.answered}><span className="bar-fill" style={{ width: `${pct}%`, background: "var(--accent)", minWidth: 0 }}></span></div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", border: "1px dashed var(--accent)", background: "var(--accent-weak)", borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ flex: "1 1 300px", fontSize: 13 }}><strong>Already completed a CAIQ v4 or SIG?</strong> Upload it and matching answers will be filled in for you to review.</div>
          <button type="button" className="btn btn-secondary" onClick={() => imp.current?.click()}>Upload CAIQ / SIG (.xlsx, .csv)</button>
          <input ref={imp} type="file" hidden accept=".xlsx,.csv" aria-label="CAIQ or SIG file" onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) onToast(a.applyPrefill(f)); e.target.value = ""; }} />
        </div>
      </Section>
      {QUESTIONS.map((q) => (
        <QuestionCard key={q.id} q={q} value={a.ans[q.id] || ""} note={a.notes[q.id] || ""} file={a.files[q.id]} prefilled={!!a.pre[q.id]}
          onAnswer={(v) => a.setAnswer(q.id, v)} onNote={(v) => a.setNote(q.id, v)} onPick={(f) => a.pickFile(q.id, f)} />
      ))}
      <Section pad={18} gap={12}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "center" }}>
          <div role="status" style={{ fontSize: 13, color: r.ready ? "var(--ok-ink)" : "var(--warn-ink)" }}>{r.note}</div>
          <button type="button" className={"btn lg " + (r.ready ? "btn-primary" : "btn-secondary")} aria-disabled={!r.ready || busy} onClick={() => { if (!busy) onSubmit(); }}
            style={{ height: 48, borderRadius: 999, padding: "0 18px", cursor: r.ready ? "pointer" : "not-allowed", opacity: r.ready ? 1 : 0.7 }}>Submit to {INVITE.customerName}</button>
        </div>
      </Section>
    </>
  );
}
