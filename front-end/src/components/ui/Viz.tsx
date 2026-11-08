import { useId } from "react";

export function Ring({ pct, size = 76, color }: { pct: number; size?: number; color?: string }) {
  const r = (size - 10) / 2, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
  const col = color || (pct >= 80 ? "var(--ok-ink)" : pct >= 50 ? "var(--warn-ink)" : "var(--bad-ink)");
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label={`${pct} percent`}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--surface-3)" strokeWidth="7" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={col} strokeWidth="7" fill="none" strokeLinecap="round" strokeDasharray={c.toFixed(1)} strokeDashoffset={off.toFixed(1)} />
      </svg>
      <div className="rv">{pct}%</div>
    </div>
  );
}
export function Spark({ data, w = 120, h = 34, color = "var(--accent)" }: { data: number[]; w?: number; h?: number; color?: string }) {
  const mx = Math.max(...data), mn = Math.min(...data), rg = mx - mn || 1;
  const pts = data.map((v, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - mn) / rg) * (h - 4)).toFixed(1)}`).join(" ");
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
/** Full-width trend chart with per-point tooltips (SVG <title>). */
export function TrendChart({ data, labels, unit = "", color = "var(--accent)" }: { data: number[]; labels?: string[]; unit?: string; color?: string }) {
  const gid = "tg" + useId().replace(/[^a-z0-9]/gi, "");
  const w = 600, h = 118, pad = 8;
  const mx = Math.max(...data), mn = Math.min(...data), rg = mx - mn || 1;
  const X = (i: number) => pad + (i / (data.length - 1)) * (w - 2 * pad);
  const Y = (v: number) => h - 16 - ((v - mn) / rg) * (h - 2 * pad - 16);
  const pts = data.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const area = `${X(0).toFixed(1)},${h - 16} ${pts} ${X(data.length - 1).toFixed(1)},${h - 16}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: 118, display: "block", overflow: "visible" }} role="img" aria-label="Trend chart">
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.16" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((v, i) => (
        <g key={i}>
          <circle cx={X(i).toFixed(1)} cy={Y(v).toFixed(1)} r="9" fill="transparent"><title>{`${labels ? labels[i] : ""}: ${v}${unit}`}</title></circle>
          <circle cx={X(i).toFixed(1)} cy={Y(v).toFixed(1)} r="2.3" fill={color} />
        </g>
      ))}
    </svg>
  );
}
