import { FRAMEWORK_REQS } from "@/lib/data";
import { REQ_ST, REQ_ST_COL, fwReadiness, fwScore } from "@/lib/frameworks";

/** Readiness band colour from the design tokens only (80% and up ok, 50% and up warning, below that bad), the same in both themes.
 *  Used instead of the shared fwBand, whose 50-64% band is a hex literal that fails AA on white and has no dark-mode value. */
export const readinessTone = (p: number) => (p >= 80 ? "var(--ok-ink)" : p >= 50 ? "var(--warn-ink)" : "var(--bad-ink)");
/** "Not applicable" is hatched so it does not read as the same grey as "Not assessed". */
const segBg = (k: string) => (k === "Not applicable" ? "repeating-linear-gradient(135deg, var(--line-2) 0 2px, transparent 2px 5px)" : REQ_ST_COL[k]);

/** Segmented readiness bar: one segment per requirement status. */
export function FwSegsBar({ fwId, h = 8 }: { fwId: string; h?: number }) {
  const sc = fwScore(fwId);
  const base = { flex: 1, minWidth: 60, height: h, background: "var(--surface-2)", borderRadius: 999, overflow: "hidden", display: "flex" } as const;
  if (!sc) { const p = fwReadiness(fwId); return <span style={base}><span style={{ height: "100%", width: `${p}%`, background: readinessTone(p) }} /></span>; }
  const all = FRAMEWORK_REQS[fwId].r.length || 1;
  return <span style={base} role="img" aria-label={`${sc.pct}% of applicable requirements met`}>{REQ_ST.map((k) => <span key={k} style={{ height: "100%", width: `${((sc.cnt[k] / all) * 100).toFixed(2)}%`, background: segBg(k) }} />)}</span>;
}
