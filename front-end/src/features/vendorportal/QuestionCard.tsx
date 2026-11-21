import { ANSWERS, MAX_COMMENT, type VendorFile, type VendorQuestion } from "@/features/vendorportal/lib/vendorSubmission";
import { Icon } from "@/components/ui";
import EvidenceUpload from "./EvidenceUpload";

export function AnswerSelect({ qid, value, onChange }: { qid: string; value: string; onChange: (v: string) => void }) {
  return (
    <select className="select" aria-label={`Answer for ${qid}`} value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 170, height: 44, borderRadius: 999 }}>
      <option value="">Select an answer</option>
      {ANSWERS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
    </select>
  );
}

/** One question: choice, optional comment (plain text, 2,000 chars) and evidence. */
export default function QuestionCard({ q, value, note, file, prefilled, needsEvidence = false, onAnswer, onNote, onPick }: {
  q: VendorQuestion; value: string; note: string; file?: VendorFile; prefilled: boolean; /** "Yes" on a required item with no clean file yet: this card blocks the submission. */ needsEvidence?: boolean;
  onAnswer: (v: string) => void; onNote: (v: string) => void; onPick: (f: File) => void;
}) {
  return (
    <section id={`vp-q-${q.id}`} tabIndex={-1} className="card" aria-label={`${q.domain} ${q.id}`} style={{ padding: "16px 18px", gap: 10, borderColor: needsEvidence ? "var(--warn-ink)" : undefined }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 16px", alignItems: "flex-start" }}>
        <div style={{ flex: "999 1 380px", minWidth: 0 }}>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>{q.domain} · {q.id}</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{q.text} {q.critical ? <span className="chip warn" style={{ height: 20, fontSize: 11 }}><Icon name="evidence" />Evidence required</span> : null}</div>
          {needsEvidence ? <div style={{ fontSize: 12, fontWeight: 600, color: "var(--warn-ink)", marginTop: 4, display: "flex", gap: 6, alignItems: "center" }}><Icon name="alert" style={{ width: 14, height: 14 }} />Attach evidence for this &quot;Yes&quot; answer before you submit.</div> : null}
          {prefilled ? <div style={{ fontSize: 12, fontWeight: 600, color: "var(--info-ink)", marginTop: 2 }}>Prefilled from your upload, please check</div> : null}
        </div>
        <AnswerSelect qid={q.id} value={value} onChange={onAnswer} />
      </div>
      <div className="field">
        <label htmlFor={`vp-note-${q.id}`} style={{ fontSize: 12, fontWeight: 600 }}>Comment (optional)</label>
        <textarea id={`vp-note-${q.id}`} className="input" rows={2} maxLength={MAX_COMMENT} value={note} onChange={(e) => onNote(e.target.value)} style={{ height: "auto", padding: "8px 10px", fontSize: 13, resize: "vertical" }} />
      </div>
      <EvidenceUpload qid={q.id} file={file} onPick={onPick} hint={q.evidence} />
    </section>
  );
}
