import { useState, type ReactNode } from "react";
import { areaOf, barRects, donutArcs, linePoints, niceMax, pathOf, percent, ticks, type Box } from "@/lib/charts";

/* Shared charts. Colour is by tone (these tokens change with the theme); every chart is a <figure> with a caption, an `img` role carrying a one-line
   summary, and a visually hidden data table, so the numbers reach screen readers and the colours never carry meaning alone. Marks are focusable and
   show a dark tooltip on hover or focus. */
/** `high` is the High risk band (between warning and danger), so a risk chart can match the heat map. */
export type Tone = "brand" | "ok" | "warn" | "high" | "bad" | "ink" | "muted";
export const TONE_VAR: Record<Tone, string> = { brand: "var(--accent)", ok: "var(--ok-ink)", warn: "var(--warn-ink)", high: "var(--high-ink)", bad: "var(--bad-ink)", ink: "var(--ink-2)", muted: "var(--faint)" };

interface Tip { x: number; y: number; text: string }
function useTip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const bind = (x: number, y: number, text: string) => ({
    tabIndex: 0, role: "img", "aria-label": text,
    onMouseEnter: () => setTip({ x, y, text }), onMouseLeave: () => setTip(null), onFocus: () => setTip({ x, y, text }), onBlur: () => setTip(null),
  });
  return { tip, bind };
}
function TipBox({ tip, w, h }: { tip: Tip | null; w: number; h: number }) {
  if (!tip) return null;
  return <div className="chart-tip" role="tooltip" style={{ left: `${(tip.x / w) * 100}%`, top: `${(tip.y / h) * 100}%` }}>{tip.text}</div>;
}

export function ChartFigure({ title, summary, head, rows, children, legend, interactive }: {
  title: string; summary: string; head: string[]; rows: (string | number)[][]; children: ReactNode; legend?: ReactNode;
  /** The marks take keyboard focus: the body is a labelled group (an `img` role may not contain focusable children). */
  interactive?: boolean;
}) {
  return (
    <figure className="chart">
      <figcaption className="chart-cap">{title}</figcaption>
      <div className="chart-body" role={interactive ? "group" : "img"} aria-label={`${title}. ${summary}`}>{children}</div>
      {legend}
      {/* the wrapper is what is visually hidden: a table ignores a 1px width and would widen the page on a phone */}
      <div className="vh"><table><caption>{title}</caption><thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => (j ? <td key={j}>{c}</td> : <th key={j} scope="row">{c}</th>))}</tr>)}</tbody></table></div>
    </figure>
  );
}

export interface Point { label: string; value: number }
const BOX: Box = { w: 600, h: 190, l: 34, r: 10, t: 12, b: 24 };

/** Line with a soft area, gridlines, an optional dashed target and per-point tooltips. */
export function LineChart({ title, data, target, targetLabel = "Target", unit = "", tone = "brand" }: { title: string; data: Point[]; target?: number; targetLabel?: string; unit?: string; tone?: Tone }) {
  const { tip, bind } = useTip();
  const max = niceMax(Math.max(...data.map((d) => d.value), target ?? 0));
  const pts = linePoints(data.map((d) => d.value), BOX, max); const base = BOX.h - BOX.b;
  const col = TONE_VAR[tone]; const ty = target == null ? null : linePoints([target], BOX, max)[0].y;
  const first = data[0], last = data[data.length - 1];
  return (
    <ChartFigure title={title} summary={data.length ? `${data.length} points, from ${first.value}${unit} (${first.label}) to ${last.value}${unit} (${last.label})${target != null ? `, ${targetLabel} ${target}${unit}` : ""}.` : "No data."}
      head={["Period", "Value"]} rows={data.map((d) => [d.label, `${d.value}${unit}`])} interactive>
      <div className="chart-wrap"><svg viewBox={`0 0 ${BOX.w} ${BOX.h}`} preserveAspectRatio="none" className="chart-svg">
        {ticks(max).map((t) => { const y = linePoints([t], BOX, max)[0].y; return <g key={t}><line x1={BOX.l} x2={BOX.w - BOX.r} y1={y} y2={y} className="chart-grid" /><text x={BOX.l - 6} y={y + 4} textAnchor="end" className="chart-ax">{t}</text></g>; })}
        {data.map((d, i) => <text key={d.label} x={pts[i].x} y={BOX.h - 6} textAnchor="middle" className="chart-ax">{d.label}</text>)}
        {pts.length ? <path d={areaOf(pts, base)} fill={col} fillOpacity="0.10" /> : null}
        {ty != null ? <g><line x1={BOX.l} x2={BOX.w - BOX.r} y1={ty} y2={ty} className="chart-target" /><text x={BOX.w - BOX.r} y={ty - 4} textAnchor="end" className="chart-ax">{targetLabel} {target}{unit}</text></g> : null}
        <path d={pathOf(pts)} fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="4" fill="var(--surface)" stroke={col} strokeWidth="2" className="chart-mark" {...bind(p.x, p.y, `${data[i].label}: ${data[i].value}${unit}`)} />)}
      </svg><TipBox tip={tip} w={BOX.w} h={BOX.h} /></div>
    </ChartFigure>
  );
}

export interface BarPoint { label: string; value: number; /** Stacked on top in the bad tone (for example delayed within delivered). */ bad?: number }
/** Vertical bars, optionally with a stacked "bad" segment. */
export function BarChart({ title, data, unit = "", goodLabel = "Value", badLabel = "Of which late" }: { title: string; data: BarPoint[]; unit?: string; goodLabel?: string; badLabel?: string }) {
  const { tip, bind } = useTip();
  const max = niceMax(Math.max(...data.map((d) => d.value + (d.bad || 0))));
  const rects = barRects(data.map((d) => ({ a: d.value, b: d.bad })), BOX, max);
  return (
    <ChartFigure title={title} summary={data.length ? `${data.length} bars, highest ${Math.max(...data.map((d) => d.value + (d.bad || 0)))}${unit}.` : "No data."}
      interactive head={["Period", goodLabel, badLabel]} rows={data.map((d) => [d.label, `${d.value}${unit}`, `${d.bad || 0}${unit}`])}>
      <div className="chart-wrap"><svg viewBox={`0 0 ${BOX.w} ${BOX.h}`} preserveAspectRatio="none" className="chart-svg">
        {ticks(max).map((t) => { const y = BOX.t + (BOX.h - BOX.t - BOX.b) * (1 - t / max); return <g key={t}><line x1={BOX.l} x2={BOX.w - BOX.r} y1={y} y2={y} className="chart-grid" /><text x={BOX.l - 6} y={y + 4} textAnchor="end" className="chart-ax">{t}</text></g>; })}
        {rects.map((r, i) => (
          <g key={data[i].label} {...bind(r.x + r.w / 2, r.b.h ? r.b.y : r.a.y, `${data[i].label}: ${data[i].value}${unit}${data[i].bad ? `, ${badLabel.toLowerCase()} ${data[i].bad}${unit}` : ""}`)} className="chart-mark">
            <rect x={r.x} y={r.a.y} width={r.w} height={r.a.h} rx="4" fill={TONE_VAR.brand} />
            {r.b.h ? <rect x={r.x} y={r.b.y} width={r.w} height={r.b.h} rx="4" fill={TONE_VAR.bad} /> : null}
            <text x={r.x + r.w / 2} y={BOX.h - 6} textAnchor="middle" className="chart-ax">{data[i].label}</text>
          </g>
        ))}
      </svg><TipBox tip={tip} w={BOX.w} h={BOX.h} /></div>
    </ChartFigure>
  );
}

export interface HBarRow { label: string; value: number; tone?: Tone; /** Overrides the bar's end label (default is the value). */ text?: string }
/** Ranked horizontal bars with the value written at the end (a track plus a label, so the bar is never the only carrier of the number). */
/** `wrap` puts each label on its own line above its bar, for long labels (the posture brief's causes). */
/** `target` draws a marker at that value on every track (R35), and the summary says how many rows reach it. */
export function HBarList({ title, rows, max, unit = "", wrap, target, targetLabel = "Target" }: { title: string; rows: HBarRow[]; max?: number; unit?: string; wrap?: boolean; target?: number; targetLabel?: string }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value), target ?? 0);
  const reach = target == null ? "" : ` ${rows.filter((r) => r.value >= target).length} of ${rows.length} at or above the ${targetLabel.toLowerCase()} of ${target}${unit}.`;
  return (
    <ChartFigure title={title} summary={rows.length ? `${rows.length} rows, largest ${rows.reduce((a, r) => (r.value > a.value ? r : a), rows[0]).label}.${reach}` : "No data."}
      head={["Name", "Value"]} rows={rows.map((r) => [r.label, r.text ?? `${r.value}${unit}`])}
      legend={target != null ? <p className="chart-note"><span className="hbar-tmark-key" aria-hidden="true" />{targetLabel} {target}{unit}</p> : undefined}>
      <ul className={wrap ? "hbar wrap" : "hbar"} aria-hidden="true">
        {rows.map((r) => (
          <li key={r.label} className="hbar-row">
            <span className="hbar-nm">{r.label}</span>
            <span className="hbar-track"><span className="hbar-fill" style={{ width: `${Math.max(2, (r.value / m) * 100)}%`, background: TONE_VAR[r.tone || "brand"] }} />{target != null ? <span className="hbar-tmark" style={{ left: `${Math.min(100, (target / m) * 100)}%` }} /> : null}</span>
            <span className="hbar-v num">{r.text ?? `${r.value}${unit}`}</span>
          </li>
        ))}
      </ul>
    </ChartFigure>
  );
}

export interface PairPoint { label: string; a: number; b: number }
/** Two series side by side per period (R35), for example issues closed and opened. The last group is "now" and is drawn at full strength,
 *  earlier groups lighter; the legend names both series, and every bar has a tooltip and a row in the data table. */
export function PairBarChart({ title, data, aLabel, bLabel, aTone = "brand", bTone = "bad", unit = "" }: { title: string; data: PairPoint[]; aLabel: string; bLabel: string; aTone?: Tone; bTone?: Tone; unit?: string }) {
  const { tip, bind } = useTip();
  const max = Math.max(4, Math.ceil(Math.max(...data.map((d) => Math.max(d.a, d.b))) / 4) * 4); // counts: whole-number ticks
  const iw = BOX.w - BOX.l - BOX.r, ih = BOX.h - BOX.t - BOX.b, slot = iw / (data.length || 1), bw = Math.min(28, slot * 0.3);
  const H = (v: number) => (Math.max(0, v) / max) * ih; const last = data[data.length - 1];
  return (
    <ChartFigure title={title} interactive head={["Period", aLabel, bLabel]} rows={data.map((d) => [d.label, `${d.a}${unit}`, `${d.b}${unit}`])}
      summary={data.length ? `${data.length} periods. ${last.label}: ${aLabel.toLowerCase()} ${last.a}${unit}, ${bLabel.toLowerCase()} ${last.b}${unit}.` : "No data."}
      legend={<ul className="legend row">{([[aLabel, aTone], [bLabel, bTone]] as const).map(([l, t]) => <li key={l}><span className="legend-sw" style={{ background: TONE_VAR[t] }} aria-hidden="true" />{l}</li>)}</ul>}>
      <div className="chart-wrap"><svg viewBox={`0 0 ${BOX.w} ${BOX.h}`} preserveAspectRatio="none" className="chart-svg">
        {ticks(max).map((t) => { const y = BOX.t + ih * (1 - t / max); return <g key={t}><line x1={BOX.l} x2={BOX.w - BOX.r} y1={y} y2={y} className="chart-grid" /><text x={BOX.l - 6} y={y + 4} textAnchor="end" className="chart-ax">{t}</text></g>; })}
        {data.map((d, i) => {
          const cx = BOX.l + slot * i + slot / 2; const op = i === data.length - 1 ? 1 : 0.45; const base = BOX.t + ih;
          return (
            <g key={d.label}>
              <rect x={cx - bw - 2} y={base - H(d.a)} width={bw} height={H(d.a)} rx="4" fill={TONE_VAR[aTone]} fillOpacity={op} className="chart-mark" {...bind(cx - bw / 2, base - H(d.a), `${d.label}: ${aLabel.toLowerCase()} ${d.a}${unit}`)} />
              <rect x={cx + 2} y={base - H(d.b)} width={bw} height={H(d.b)} rx="4" fill={TONE_VAR[bTone]} fillOpacity={op} className="chart-mark" {...bind(cx + bw / 2, base - H(d.b), `${d.label}: ${bLabel.toLowerCase()} ${d.b}${unit}`)} />
              <text x={cx} y={BOX.h - 6} textAnchor="middle" className="chart-ax" fontWeight={i === data.length - 1 ? 600 : undefined}>{d.label}</text>
            </g>
          );
        })}
      </svg><TipBox tip={tip} w={BOX.w} h={BOX.h} /></div>
    </ChartFigure>
  );
}

export interface Segment { label: string; value: number; tone: Tone }
/** Donut with a centre label and a legend that carries label, count and share (never colour alone). */
export function DonutChart({ title, segments, center, centerSub }: { title: string; segments: Segment[]; center?: string; centerSub?: string }) {
  const total = segments.reduce((a, s) => a + s.value, 0); const R = 52, C = 2 * Math.PI * R;
  const arcs = donutArcs(segments.map((s) => s.value), R);
  return (
    <ChartFigure title={title} summary={total ? segments.map((s) => `${s.label} ${s.value} (${percent(s.value, total)}%)`).join(", ") + "." : "No data."}
      head={["Segment", "Count", "Share"]} rows={segments.map((s) => [s.label, s.value, `${percent(s.value, total)}%`])}
      legend={<ul className="legend">{segments.map((s) => <li key={s.label}><span className="legend-sw" style={{ background: TONE_VAR[s.tone] }} aria-hidden="true" />{s.label}<span className="legend-n num">{s.value} <span className="legend-p">{percent(s.value, total)}%</span></span></li>)}</ul>}>
      <div className="donut2">
        <svg viewBox="0 0 140 140" aria-hidden="true">
          <circle cx="70" cy="70" r={R} fill="none" stroke="var(--surface-3)" strokeWidth="14" />
          {total ? segments.map((s, i) => <circle key={s.label} cx="70" cy="70" r={R} fill="none" stroke={TONE_VAR[s.tone]} strokeWidth="14" strokeDasharray={`${arcs[i].len} ${C - arcs[i].len}`} strokeDashoffset={arcs[i].offset} transform="rotate(-90 70 70)" />) : null}
        </svg>
        <div className="donut2-c"><b className="num">{center ?? total}</b>{centerSub ? <span>{centerSub}</span> : null}</div>
      </div>
    </ChartFigure>
  );
}
