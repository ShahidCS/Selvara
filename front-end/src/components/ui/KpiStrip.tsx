import type { ReactNode } from "react";
import { Icon } from "./Icon";

export type Desirability = "good" | "bad" | "watch" | "flat";
const CHIP: Record<Desirability, string> = { good: "lime", bad: "bad", watch: "warn", flat: "neutral" };
const ICON: Record<Desirability, string> = { good: "trendup", bad: "alert", watch: "clock", flat: "dot" };

/** Delta pill. The colour follows whether the change is desirable, not whether it went up: a rising overdue count is red. The text and icon say it too. */
export function DeltaPill({ tone, children }: { tone: Desirability; children: ReactNode }) {
  return <span className={`chip ${CHIP[tone]}`}><Icon name={ICON[tone]} />{children}</span>;
}

/** Flat strip of metric tiles separated by hairlines (eyebrow label, big light figure, delta, caption). */
export function KpiStrip({ label, children }: { label: string; children: ReactNode }) {
  return <div className="kpi-strip" role="group" aria-label={label}>{children}</div>;
}
export function KpiTile({ label, value, delta, caption }: { label: string; value: string | number; delta?: { tone: Desirability; text: string }; caption?: string }) {
  return (
    <div className="kpi-tile">
      <div className="eyebrow">{label}</div>
      <div className="kpi-fig"><span className="kpi-v num">{value}</span>{delta ? <DeltaPill tone={delta.tone}>{delta.text}</DeltaPill> : null}</div>
      {caption ? <div className="kpi-cap">{caption}</div> : null}
    </div>
  );
}

/** Clickable summary card that drills into a filtered list. */
export function KpiCard({ icon, label, value, sub, subTone = "flat", onClick }: { icon: string; label: string; value: string | number; sub?: string; subTone?: Desirability; onClick: () => void }) {
  return (
    <button type="button" className="kpi-card" onClick={onClick}>
      <span className="kpi-card-top"><Icon name={icon} /><Icon name="ext" className="kpi-card-go" /></span>
      <span className="eyebrow">{label}</span>
      <span className="kpi-v num">{value}</span>
      {sub ? <span className={`kpi-sub ${subTone}`}>{sub}</span> : null}
    </button>
  );
}
