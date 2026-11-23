/* R22: "What happened, why it matters, suggested next step" on a record page. The three lines are computed from the record (lib/insights.ts);
   "Write with AI" asks for wording of the same facts, with the record attached, as a draft. Decisions stay with the record's own approval flows. */
import { AiWording, type AiRecordRef } from "./AiWording";

export function ExplainCard({ e, record }: { e: { happened: string; why: string; next: string; facts: string[] }; record: AiRecordRef }) {
  return (
    <section className="card why-card" aria-labelledby={`why-${record.id}`} data-tour="record-explain">
      <div className="c-head"><h3 id={`why-${record.id}`}>Summary</h3><span className="cell-sub">Computed from this record</span></div>
      <div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <dl>
          <div><dt>What happened</dt><dd>{e.happened}</dd></div>
          <div><dt>Why it matters</dt><dd>{e.why}</dd></div>
          <div><dt>Suggested next step</dt><dd className="strong">{e.next}</dd></div>
        </dl>
        <AiWording source="Record summary" label="Write it with AI" facts={e.facts} records={[record]}
          ask="Explain this record in three short parts for its owner: what happened, why it matters, and the next step. Use only the facts and the attached record." />
      </div>
    </section>
  );
}
