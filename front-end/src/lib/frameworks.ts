/* Framework scoring + requirement mapping (ported 1:1 from the prototype's "Frameworks" helpers). */
import { DATA, FRAMEWORK_REQS } from "./data";
import { appStore, createStore, useModState } from "./store";
import { fwCanAdmin as canAdmin } from "./rbac";

export const REQ_ST = ["Met", "Partially met", "Not met", "Not assessed", "Not applicable"] as const;
export type ReqStatus = (typeof REQ_ST)[number];
export const REQ_ST_COL: Record<string, string> = {
  Met: "var(--ok-ink)", "Partially met": "var(--warn-ink)", "Not met": "var(--bad-ink)", "Not assessed": "var(--line-2)", "Not applicable": "var(--surface-3)",
};
export const REQ_ST_PILL: Record<string, [string, string]> = {
  Met: ["ok", "check"], "Partially met": ["warn", "clock"], "Not met": ["bad", "x"], "Not assessed": ["neutral", "dot"], "Not applicable": ["neutral", "dot"],
};
export const REQ_PAGE = 50;

/* admin-editable state (FW_NA, FW_MOD, FW_SCOPE, FW_SNOOZE) lives here; persists for the session like the prototype */
export interface FwEdits {
  NA: Record<string, Record<string, { reason: string; by: string; date: string }>>;
  MOD: Record<string, Record<string, { by: string; date: string }>>;
  SCOPE: Record<string, boolean>;
  SNOOZE: Record<string, boolean>;
  REQ_CTRL: Record<string, Record<string, string[]>> | null;
}
export const fwEdits = createStore<FwEdits>({ NA: {}, MOD: {}, SCOPE: {}, SNOOZE: {}, REQ_CTRL: null });

export const fwCanAdmin = () => canAdmin(appStore.get().role);
const reqHash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h % 100; };
const fwPool = (fwId: string) => { const id = fwId === "iso27002" ? "iso27001" : fwId; return DATA.controls.filter((c) => c.map && c.map[id]); };

export function seedReqCtrlFw(fwId: string) {
  const E = fwEdits.get(); const RC = E.REQ_CTRL as Record<string, Record<string, string[]>>;
  const cat = FRAMEWORK_REQS[fwId]; if (!cat) { RC[fwId] = {}; return; }
  const base = fwId === "iso27002" ? "iso27001" : fwId;
  const f = DATA.frameworks.find((x) => x.id === fwId); const t = f ? f.pct : 70;
  const pool = fwPool(fwId); const pass = pool.filter((c) => c.status === "Pass"); const weak = pool.filter((c) => c.status !== "Pass");
  const pick = (arr: any[], s: number) => (arr.length ? arr[s % arr.length].id : null);
  const m: Record<string, string[]> = {};
  cat.r.forEach((r) => {
    const reqId = r[0];
    const explicit = pool.filter((c) => (c.map[base] || []).includes(reqId)).map((c) => c.id);
    if (explicit.length) { m[reqId] = explicit; return; }
    const h = reqHash(fwId + "::" + reqId); const ids: string[] = [];
    if (h < t - 14) { const a = pick(pass, h); if (a) ids.push(a); const b = pick(pass, h + 7); if (b && b !== a) ids.push(b); }
    else if (h < t) { const a = pick(pass, h); if (a) ids.push(a); const w = pick(weak, h); if (w && w !== a) ids.push(w); }
    else if (h < Math.min(100, t + 16)) { const w = pick(weak, h); if (w) ids.push(w); }
    if (ids.length) m[reqId] = ids;
  });
  RC[fwId] = m;
}
export function seedReqCtrl() {
  fwEdits.get().REQ_CTRL = {};
  Object.keys(FRAMEWORK_REQS).forEach(seedReqCtrlFw);
}
export function reqCtrl() { if (!fwEdits.get().REQ_CTRL) seedReqCtrl(); return fwEdits.get().REQ_CTRL as Record<string, Record<string, string[]>>; }
export function fwReqControls(fwId: string, reqId: string) {
  const ids = (reqCtrl()[fwId] || {})[reqId] || [];
  return ids.map((id) => DATA.controls.find((c) => c.id === id)).filter(Boolean) as any[];
}
export function reqStatus(fwId: string, reqId: string): ReqStatus {
  const NA = fwEdits.get().NA;
  if (NA[fwId] && NA[fwId][reqId]) return "Not applicable";
  const ss = fwReqControls(fwId, reqId).map((c) => c.status);
  if (!ss.length) return "Not assessed";
  if (ss.every((x) => x === "Pass")) return "Met";
  if (ss.some((x) => x === "Pass")) return "Partially met";
  return "Not met";
}
export function fwScore(fwId: string) {
  const cat = FRAMEWORK_REQS[fwId]; if (!cat) return null;
  const cnt: Record<string, number> = { Met: 0, "Partially met": 0, "Not met": 0, "Not assessed": 0, "Not applicable": 0 };
  cat.r.forEach((r) => { cnt[reqStatus(fwId, r[0])]++; });
  const total = cat.r.length - cnt["Not applicable"];
  return { cnt, total, impl: cnt.Met, pct: total ? Math.round((cnt.Met / total) * 100) : 0 };
}
export function fwReadiness(fwId: string): number {
  const sc = fwScore(fwId); return sc ? sc.pct : (DATA.frameworks.find((x) => x.id === fwId) || ({} as any)).pct || 0;
}
export const fwBand = (p: number) => (p >= 80 ? "var(--ok-ink)" : p >= 65 ? "var(--warn-ink)" : p >= 50 ? "#D2690A" : "var(--bad-ink)");
export function fwGroupMap(fwId: string): Record<string, string> {
  const m: Record<string, string> = {}; (FRAMEWORK_REQS[fwId] || { g: [] }).g.forEach((g) => (m[g[0]] = g[1])); return m;
}
export function fwGroupStat(fwId: string, gid: string) {
  const cat = FRAMEWORK_REQS[fwId]; let met = 0, tot = 0;
  cat.r.forEach((r) => { if (r[2] !== gid) return; const st = reqStatus(fwId, r[0]); if (st === "Not applicable") return; tot++; if (st === "Met") met++; });
  return { met, tot };
}
export const fwScopeIn = (fwId: string) => fwEdits.get().SCOPE[fwId] !== false;
export const fwSnoozed = (fwId: string) => !!fwEdits.get().SNOOZE[fwId];
export function fwLegend(fwId: string): string {
  const sc = fwScore(fwId); if (!sc) return "";
  const parts = ([["Met", sc.cnt.Met], ["partly", sc.cnt["Partially met"]], ["not met", sc.cnt["Not met"]], ["not assessed", sc.cnt["Not assessed"]], ["n/a", sc.cnt["Not applicable"]]] as [string, number][])
    .filter((p) => p[1] > 0).map((p) => p[0] + " " + p[1]);
  return parts.length ? parts.join(" · ") : "No requirements scored";
}
export { useModState };

import { useSyncExternalStore } from "react";
/** Subscribe a component to framework edits (scope, snooze, mappings, N/A). */
export function useFwEdits() { return useSyncExternalStore(fwEdits.subscribe, fwEdits.get, fwEdits.get); }
/** Call after mutating fwEdits in place so subscribers re-render. */
export const touchFw = () => fwEdits.set({});
