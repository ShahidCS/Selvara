import { useMemo } from "react";
import { CLARIFICATIONS, INVITE, MAX_COMMENT, QUESTIONS, clarReadiness, type ClarBase } from "@/features/vendorportal/lib/vendorSubmission";
import type { AnswersApi } from "./useAnswers";
import { AnswerSelect } from "./QuestionCard";
import EvidenceUpload from "./EvidenceUpload";
import { Section, type VpTone } from "./parts";

/** Clarification round: only the reopened answers are editable; everything else stays locked (not rendered). */
export default function Clarification({ a, base, refId, ver, onSend, onToast, busy }: { a: AnswersApi; base: ClarBase; refId: string; ver: number; onSend: () => void; onToast: (m: string, tone?: VpTone) => void; busy: boolean }) {
  const cqs = useMemo(() => QUESTIONS.filter((q) => CLARIFICATIONS[q.id]), []);
  const r = clarReadiness(cqs.map((q) => q.id), a.ans, a.notes, a.files, base, ver);
  return (
    <>
      <section role="status" style={{ background: "var(--warn-bg)", color: "var(--warn-ink)", border: "1px solid var(--line)", borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontWeight: 600, fontSize: 16 }}>Clarification requested on {cqs.length} answers</div>
        <div style={{ fontSize: 13 }}>Response {refId} version {ver}. Only these answers can be changed; all other answers stay locked. Please reply by {INVITE.clarifyBy}. Your previous version is kept on record.</div>
      </section>
      {cqs.map((q) => (
        <section key={q.id} className="card" aria-label={`${q.domain} ${q.id}`} style={{ padding: "16px 18px", gap: 10 }}>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>{q.domain} · {q.id}</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{q.text}</div>
          <div style={{ fontSize: 13, background: "var(--surface-2)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Reviewer at {INVITE.customerName} asked</span><span>{CLARIFICATIONS[q.id]}</span></div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <AnswerSelect qid={q.id} value={a.ans[q.id] || ""} onChange={(v) => a.setAnswer(q.id, v)} />
            <EvidenceUpload qid={q.id} file={a.files[q.id]} onPick={(f) => a.pickFile(q.id, f)} />
          </div>
          <div className="field">
            <label htmlFor={`vp-clar-${q.id}`} style={{ fontSize: 12, fontWeight: 600 }}>Your clarification (required)</label>
            <textarea id={`vp-clar-${q.id}`} className="input" rows={3} maxLength={MAX_COMMENT} value={a.notes[q.id] || ""} onChange={(e) => a.setNote(q.id, e.target.value)} style={{ height: "auto", padding: "8px 10px", fontSize: 13, resize: "vertical" }} />
          </div>
        </section>
      ))}
      <Section pad={18} gap={12}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "center" }}>
          <div role="status" style={{ fontSize: 13, color: r.ready ? "var(--ok-ink)" : "var(--warn-ink)" }}>{r.note}</div>
          <button type="button" className={"btn lg " + (r.ready ? "btn-primary" : "btn-secondary")} aria-disabled={!r.ready || busy}
            onClick={() => { if (busy) return; if (!r.ready) { onToast('Add a new clarification for each answer, and new evidence for any "Yes".', "bad"); return; } onSend(); }}
            style={{ height: 48, borderRadius: 999, padding: "0 18px", cursor: r.ready ? "pointer" : "not-allowed", opacity: r.ready ? 1 : 0.7 }}>Send clarification</button>
        </div>
      </Section>
    </>
  );
}
