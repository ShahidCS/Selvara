import { Icon } from "./Icon";

export interface Step { key: string; label: string; /** Short caption under the label (date, owner). */ note?: string }
/** Progress through ordered stages (for example Identified, Assigned, Evidence, Review, Closed). The current stage carries `aria-current="step"`;
 *  an overdue stage is red and says so; stages after it are dashed and read `futureLabel` ("Projected" for a timeline; a wizard passes "Next").
 *  Pass `current={steps.length}` once the last stage is reached, so every stage reads Done. On a narrow container it becomes a vertical list. */
export function Stepper({ steps, current, overdue = false, label, futureLabel = "Projected" }: { steps: Step[]; current: number; overdue?: boolean; label: string; futureLabel?: string }) {
  return (
    <div className="stepper-wrap">
      <ol className="stepper" aria-label={label} data-n={steps.length}>
        {steps.map((s, i) => {
          const st = i < current ? "done" : i === current ? (overdue ? "late" : "now") : "next";
          return (
            <li key={s.key} className={`step ${st}`} aria-current={i === current ? "step" : undefined}>
              <span className="step-dot" aria-hidden="true">{st === "done" ? <Icon name="check" /> : st === "late" ? <Icon name="excl" /> : null}</span>
              <span className="step-l">{s.label}</span>
              <span className="step-n">{st === "done" ? "Done" : st === "late" ? "Overdue" : st === "now" ? "Current" : futureLabel}{s.note ? `, ${s.note}` : ""}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export interface TimelineItem { id: string; at: string; title: string; sub?: string; actor?: string; tone?: "ok" | "bad" | "brand" | "neutral" }
/** Activity timeline and audit trail. Times are written in the mono face; the tone dot is paired with the title, so it is decoration. */
export function Timeline({ items, label }: { items: TimelineItem[]; label: string }) {
  return (
    <ol className="timeline" aria-label={label}>
      {items.map((it) => (
        <li key={it.id} className="tl-item">
          <span className={`tl-dot ${it.tone || "neutral"}`} aria-hidden="true" />
          <div className="tl-main"><div className="tl-t">{it.title}</div>{it.sub ? <div className="tl-s">{it.sub}</div> : null}</div>
          <div className="tl-meta"><time className="mono">{it.at}</time>{it.actor ? <span>{it.actor}</span> : null}</div>
        </li>
      ))}
    </ol>
  );
}
