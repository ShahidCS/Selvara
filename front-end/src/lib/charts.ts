/* Pure chart maths for the shared charts (no React, unit tested). */

/** A tidy upper bound for an axis: 1, 2, 5 or 10 times a power of ten (never below the value, never 0). */
export function niceMax(v: number): number {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v)); const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}
/** `n + 1` evenly spaced tick values from 0 to `max`. */
export const ticks = (max: number, n = 4): number[] => Array.from({ length: n + 1 }, (_, i) => (max / n) * i);

export interface Box { w: number; h: number; l: number; r: number; t: number; b: number }
export interface Pt { x: number; y: number }
/** Points of a line series: x spread evenly (a single point sits in the middle), y scaled to [0, max] with 0 at the bottom. */
export function linePoints(values: number[], box: Box, max: number): Pt[] {
  const iw = box.w - box.l - box.r, ih = box.h - box.t - box.b;
  return values.map((v, i) => ({
    x: box.l + (values.length === 1 ? iw / 2 : (i / (values.length - 1)) * iw),
    y: box.t + ih - (Math.max(0, Math.min(v, max)) / (max || 1)) * ih,
  }));
}
export const pathOf = (pts: Pt[]): string => pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
export const areaOf = (pts: Pt[], baseY: number): string =>
  pts.length ? `${pathOf(pts)} L${pts[pts.length - 1].x.toFixed(1)},${baseY.toFixed(1)} L${pts[0].x.toFixed(1)},${baseY.toFixed(1)} Z` : "";

/** Bars: x slot per bar and a height for the value (and an optional stacked second value drawn on top). */
export function barRects(values: { a: number; b?: number }[], box: Box, max: number, gap = 0.34) {
  const iw = box.w - box.l - box.r, ih = box.h - box.t - box.b, slot = iw / (values.length || 1), bw = slot * (1 - gap);
  const H = (v: number) => (Math.max(0, v) / (max || 1)) * ih;
  return values.map((v, i) => {
    const x = box.l + slot * i + (slot - bw) / 2, ha = H(v.a), hb = H(v.b || 0);
    return { x, w: bw, a: { y: box.t + ih - ha, h: ha }, b: { y: box.t + ih - ha - hb, h: hb } };
  });
}

/** Donut segments drawn as stroked circle arcs: dash length, and a negative offset that starts each arc where the previous one ended. */
export function donutArcs(values: number[], r: number): { len: number; offset: number }[] {
  const total = values.reduce((a, v) => a + Math.max(0, v), 0); const c = 2 * Math.PI * r; let acc = 0;
  return values.map((v) => { const len = total ? (Math.max(0, v) / total) * c : 0; const o = { len, offset: -acc }; acc += len; return o; });
}
export const percent = (part: number, total: number): number => (total ? Math.round((part / total) * 100) : 0);
