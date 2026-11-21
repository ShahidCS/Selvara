import { Children, type CSSProperties, type ReactNode } from "react";
import { Icon } from "./Icon";

export type Desirability = "good" | "bad" | "watch" | "flat";
const CHIP: Record<Desirability, string> = { good: "lime", bad: "bad", watch: "warn", flat: "neutral" };
const ICON: Record<Desirability, string> = { good: "check", bad: "alert", watch: "clock", flat: "dot" };

/** The default icon: a trend arrow only for a signed change ("+3 pts", "-2"), otherwise the state icon of the tone (a good state is a check, not an arrow). */
function pillIcon(tone: Desirability, children: ReactNode): string {
  const t = typeof children === "string" || typeof children === "number" ? String(children).trim() : "";
  if (/^\+/.test(t)) return "trendup";
  if (/^[-−]\s*\d/.test(t)) return "trenddown";
  return ICON[tone];
}

/** Delta pill. The colour follows whether the change is desirable, not whether it went up: a rising overdue count is red. The text and icon say it too.
 *  `icon` overrides the default (a trend arrow for a signed change, otherwise check, alert, clock or dot by tone). */
export function DeltaPill({ tone, icon, children }: { tone: Desirability; icon?: string; children: ReactNode }) {
  return <span className={`chip ${CHIP[tone]}`}><Icon name={icon || pillIcon(tone, children)} />{children}</span>;
}

/** Flat strip of metric tiles separated by hairlines (eyebrow label, big light figure, delta, caption).
 *  Columns follow the number of tiles, not a minimum width, so a row never ends with one orphan tile: all in one row when they fit,
 *  then balanced rows (5 or 6 tiles: 3 per row; 4: 2 per row), then 2 per row and 1 on the narrowest widths (container queries in portal.css). */
export function KpiStrip({ label, children }: { label: string; children: ReactNode }) {
  const n = Children.toArray(children).length;
  return (
    <div className="kpi-wrap">
      <div className="kpi-strip" role="group" aria-label={label} data-n={n} style={{ "--n": Math.max(1, n) } as CSSProperties}>{children}</div>
    </div>
  );
}
export function KpiTile({ label, value, delta, caption }: { label: string; value: string | number; delta?: { tone: Desirability; text: string; icon?: string }; caption?: string }) {
  return (
    <div className="kpi-tile">
      <div className="eyebrow">{label}</div>
      <div className="kpi-fig"><span className="kpi-v num">{value}</span>{delta ? <DeltaPill tone={delta.tone} icon={delta.icon}>{delta.text}</DeltaPill> : null}</div>
      {caption ? <div className="kpi-cap">{caption}</div> : null}
    </div>
  );
}

/** Clickable summary card that drills into a filtered list. */
export function KpiCard({ icon, label, value, sub, subTone = "flat", onClick, pressed, name }: { icon: string; label: string; value: string | number; sub?: string; subTone?: Desirability; onClick: () => void; /** For a card that toggles a filter: whether the filter is on. */ pressed?: boolean; /** Accessible name when the visible text is not enough. */ name?: string }) {
  return (
    <button type="button" className="kpi-card" onClick={onClick} aria-pressed={pressed} aria-label={name}>
      {/* a card that toggles a filter shows the filter icon; one that opens a list shows "go" */}
      <span className="kpi-card-top"><Icon name={icon} /><Icon name={pressed !== undefined ? "filter" : "ext"} className="kpi-card-go" /></span>
      <span className="eyebrow">{label}</span>
      <span className="kpi-v num">{value}</span>
      {sub ? <span className={`kpi-sub ${subTone}`} style={subTone === "bad" || subTone === "watch" ? { display: "inline-flex", gap: 4, alignItems: "center" } : undefined}>{subTone === "bad" ? <Icon name="alert" style={{ width: 13, height: 13 }} /> : subTone === "watch" ? <Icon name="clock" style={{ width: 13, height: 13 }} /> : null}{sub}</span> : null}
    </button>
  );
}
