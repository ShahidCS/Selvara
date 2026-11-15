import { createContext, useContext, type ReactNode } from "react";
import { Icon } from "./Icon";

export type Desirability = "good" | "bad" | "watch" | "flat";
const CHIP: Record<Desirability, string> = { good: "lime", bad: "bad", watch: "warn", flat: "neutral" };
const ICON: Record<Desirability, string> = { good: "trendup", bad: "alert", watch: "clock", flat: "dot" };

/** Delta pill. The colour follows whether the change is desirable, not whether it went up: a rising overdue count is red. The text and icon say it too. */
export function DeltaPill({ tone, children }: { tone: Desirability; children: ReactNode }) {
  return <span className={`chip ${CHIP[tone]}`}><Icon name={ICON[tone]} />{children}</span>;
}

/** Flat strip of metric tiles separated by hairlines (eyebrow label, big light figure, delta, caption). */
const Stacked = createContext(false);
/** `stacked` keeps the label above the figure (the Overview page); by default the figure sits next to its label. */
export function KpiStrip({ label, children, stacked = false }: { label: string; children: ReactNode; stacked?: boolean }) {
  return <Stacked.Provider value={stacked}><div className="kpi-strip" role="group" aria-label={label}>{children}</div></Stacked.Provider>;
}
export function KpiTile({ label, value, delta, caption }: { label: string; value: string | number; delta?: { tone: Desirability; text: string }; caption?: string }) {
  const stacked = useContext(Stacked);
  return (
    <div className="kpi-tile">
      {stacked ? (
        <>
          <div className="eyebrow">{label}</div>
          <div className="kpi-fig"><span className="kpi-v num">{value}</span>{delta ? <DeltaPill tone={delta.tone}>{delta.text}</DeltaPill> : null}</div>
        </>
      ) : (
        <>
          <div className="kpi-head"><div className="eyebrow">{label}</div><span className="kpi-v num">{value}</span></div>
          {delta ? <div className="kpi-fig"><DeltaPill tone={delta.tone}>{delta.text}</DeltaPill></div> : null}
        </>
      )}
      {caption ? <div className="kpi-cap">{caption}</div> : null}
    </div>
  );
}

/** Clickable summary card that drills into a filtered list. */
export function KpiCard({ icon, label, value, sub, subTone = "flat", onClick, pressed, name }: { icon: string; label: string; value: string | number; sub?: string; subTone?: Desirability; onClick: () => void; /** For a card that toggles a filter: whether the filter is on. */ pressed?: boolean; /** Accessible name when the visible text is not enough. */ name?: string }) {
  return (
    <button type="button" className="kpi-card" onClick={onClick} aria-pressed={pressed} aria-label={name}>
      <span className="kpi-card-top"><Icon name={icon} /><Icon name="ext" className="kpi-card-go" /></span>
      <span className="kpi-head"><span className="eyebrow">{label}</span><span className="kpi-v num">{value}</span></span>
      {sub ? <span className={`kpi-sub ${subTone}`}>{sub}</span> : null}
    </button>
  );
}
