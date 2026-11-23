/* The reporting period (reference review R34): 7 days, 30 days or the quarter to date. Reports and the Overview's trends share one choice,
   remembered in this browser only (a viewing preference, never a record). The demonstration draws its history from fixed synthetic series that
   end at today's real figure; production has no stored history yet, so its screens show today's figures and say when a trend will appear. */
import { useEffect, useSyncExternalStore } from "react";
import { createStore } from "./store";

export type Period = "7d" | "30d" | "q";
export const PERIODS: { value: Period; label: string }[] = [{ value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }, { value: "q", label: "Quarter" }];
const KEY = "selvara.period";
const isPeriod = (v: unknown): v is Period => v === "7d" || v === "30d" || v === "q";

const store = createStore<{ p: Period; loaded: boolean }>({ p: "30d", loaded: false });
function load() {
  if (store.get().loaded) return;
  let p: Period = "30d";
  try { const v = localStorage.getItem(KEY); if (isPeriod(v)) p = v; } catch { /* storage unavailable: the default stands */ }
  store.set({ p, loaded: true });
}
export function setPeriod(p: Period) {
  if (!isPeriod(p)) return;
  store.set({ p, loaded: true });
  try { localStorage.setItem(KEY, p); } catch { /* not remembered; still applies on this page */ }
}
export function usePeriod(): Period {
  useEffect(load, []);
  return useSyncExternalStore(store.subscribe, () => store.get().p, () => "30d" as Period);
}

const DAY = 86400_000;
const dm = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
/** The first day of the period (the quarter starts on 1 Jan, 1 Apr, 1 Jul or 1 Oct). */
export function periodStart(p: Period, now = Date.now()): number {
  if (p === "7d") return now - 6 * DAY;
  if (p === "30d") return now - 29 * DAY;
  const d = new Date(now); return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1).getTime();
}
/** "17 to 23 Nov", "25 Oct to 23 Nov", "Q4 to date". */
export function periodRange(p: Period, now = Date.now()): string {
  if (p === "q") return `Q${Math.floor(new Date(now).getMonth() / 3) + 1} to date`;
  return `${dm(periodStart(p, now))} to ${dm(now)}`;
}
/** What a change is compared with: "vs previous 7 days", "vs previous 30 days", "vs last quarter". */
export const periodVs = (p: Period) => (p === "7d" ? "vs previous 7 days" : p === "30d" ? "vs previous 30 days" : "vs last quarter");

/** Dates along the period at which a trend is drawn: daily for 7 days, about every 5 days for 30 days, every 2 weeks for the quarter. */
export function periodTicks(p: Period, now = Date.now()): { t: number; label: string }[] {
  const start = periodStart(p, now); const step = p === "7d" ? DAY : p === "30d" ? 5 * DAY : 14 * DAY;
  const out: { t: number; label: string }[] = [];
  for (let t = start; t < now - step / 2; t += step) out.push({ t, label: p === "7d" ? new Date(t).toLocaleDateString("en-GB", { weekday: "short" }) : dm(t) });
  out.push({ t: now, label: p === "7d" ? "Today" : dm(now) });
  return out;
}

/* ---------- demonstration history (synthetic, deterministic) ---------- */
/** A demonstration series of `n` points that rises by `rise` and ends exactly at `end`, with a small fixed wobble (never random, so screens
 *  and tests are stable). Values stay within [lo, hi]. */
export function demoSeries(end: number, n: number, rise: number, lo = 0, hi = 100): number[] {
  const W = [0, 1, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, -1, 0];
  return Array.from({ length: n }, (_, i) => {
    if (i === n - 1) return end;
    const v = Math.round(end - rise * (1 - i / Math.max(1, n - 1)) + W[i % W.length]);
    return Math.max(lo, Math.min(hi, v));
  });
}
/** How much the demonstration's figures move over each period. */
export const DEMO_RISE: Record<Period, { compliance: number; risks: number; closed: number }> = { "7d": { compliance: 1, risks: 0, closed: 5 }, "30d": { compliance: 3, risks: 2, closed: 17 }, q: { compliance: 7, risks: 4, closed: 29 } };
/** Demonstration issues opened and closed per bucket: days for 7 days, weeks for 30 days, months for the quarter. The last bucket is "now". */
export function demoIssueFlow(p: Period, now = Date.now()): { label: string; closed: number; opened: number }[] {
  const n = p === "7d" ? 7 : p === "30d" ? 5 : 3;
  const C = [2, 3, 2, 4, 3, 5, 4], O = [3, 2, 3, 2, 4, 2, 3];
  return Array.from({ length: n }, (_, i) => {
    const last = i === n - 1;
    const label = p === "7d" ? (last ? "Today" : new Date(now - (n - 1 - i) * DAY).toLocaleDateString("en-GB", { weekday: "short" }))
      : p === "30d" ? (last ? "This week" : `W${isoWeek(now - (n - 1 - i) * 7 * DAY)}`)
      : (last ? "This month" : new Date(new Date(now).getFullYear(), new Date(now).getMonth() - (n - 1 - i), 1).toLocaleDateString("en-GB", { month: "short" }));
    const k = p === "q" ? 4 : 1;
    return { label, closed: C[i % C.length] * k - (p === "7d" ? 1 : 0), opened: O[i % O.length] * k - (p === "7d" ? 1 : 0) };
  });
}
/** ISO 8601 week number. */
export function isoWeek(t: number): number {
  const x = new Date(t); const d = new Date(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); // the Thursday of that week decides its year
  return Math.ceil(((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY + 1) / 7);
}
