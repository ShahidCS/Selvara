/* Risk module navigation/filter state (prototype: RISKTAB, RISKSEL, RISKHEAT, RF). Plain functions over the module-state store
 * so the dashboard, register, governance and other modules can call them. The tab key is shared with the sidebar sub-nav (lib/subnav.ts). */
import { getModState, setModState } from "@/lib/store";

export const K_TAB = "risk.tab", K_HEAT = "risk.heat", K_SEL = "risk.sel", K_RF = "risk.rf";
export type HeatView = "inh" | "cur" | "res";
export interface RiskFilter {
  q: string; rating: string; status: string; cat: string; team: string; jur: string; mine: boolean;
  cell: { l: number; i: number; v: HeatView } | null;
}
export const RF_INIT: RiskFilter = { q: "", rating: "all", status: "all", cat: "all", team: "all", jur: "all", mine: false, cell: null };

export function riskSetTab(t: string) { setModState(K_TAB, t); setModState<string | null>(K_SEL, null); }
export function riskGoReg(patch: Partial<RiskFilter>) {
  setModState(K_RF, { ...getModState<RiskFilter>(K_RF, RF_INIT), ...patch });
  setModState(K_TAB, "reg"); setModState<string | null>(K_SEL, null);
}
export function riskClearFilters() { setModState(K_RF, { ...RF_INIT }); }
/** Toggle the detail panel for a risk and switch to the Register tab (prototype riskOpenDetail). */
export function riskOpenDetail(id: string) {
  const cur = getModState<string | null>(K_SEL, null);
  const next = cur === id ? null : id;
  setModState<string | null>(K_SEL, next);
  if (getModState<string>(K_TAB, "dash") !== "reg") setModState(K_TAB, "reg");
  if (next && typeof window !== "undefined") {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById("riskDetail")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })));
  }
}
