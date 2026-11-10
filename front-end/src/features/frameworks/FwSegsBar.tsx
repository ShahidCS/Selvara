import { FRAMEWORK_REQS } from "@/lib/data";
import { REQ_ST, REQ_ST_COL, fwBand, fwReadiness, fwScore } from "@/lib/frameworks";

/** Segmented readiness bar: one segment per requirement status. */
export function FwSegsBar({ fwId, h = 8 }: { fwId: string; h?: number }) {
  const sc = fwScore(fwId);
  const base = { flex: 1, minWidth: 60, height: h, background: "var(--surface-2)", borderRadius: 999, overflow: "hidden", display: "flex" } as const;
  if (!sc) { const p = fwReadiness(fwId); return <span style={base}><span style={{ height: "100%", width: `${p}%`, background: fwBand(p) }} /></span>; }
  const all = FRAMEWORK_REQS[fwId].r.length || 1;
  return <span style={base} role="img" aria-label={`${sc.pct}% of applicable requirements met`}>{REQ_ST.map((k) => <span key={k} style={{ height: "100%", width: `${((sc.cnt[k] / all) * 100).toFixed(2)}%`, background: REQ_ST_COL[k] }} />)}</span>;
}
