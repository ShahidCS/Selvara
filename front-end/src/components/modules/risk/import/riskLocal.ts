/* Tiny local copies of Risk-module helpers the wizard needs (source lines 2414-2466, 2690). Kept private to this folder so the wizard
 * does not depend on src/lib/risk.ts landing first. Keep in sync with the shared versions if they diverge. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { DATA } from "@/lib/data";
import { getMe } from "@/lib/audit";
import { nowStamp } from "@/lib/format";
import { appStore } from "@/lib/store";
import { sRes } from "@/lib/metrics";

export const RBANDS = [
  { name: "Low", lo: 1, hi: 5, col: "#217A4A" }, { name: "Medium", lo: 6, hi: 10, col: "#846200" },
  { name: "High", lo: 11, hi: 19, col: "#A34708" }, { name: "Extreme", lo: 20, hi: 25, col: "#B4231E" },
];
export const rband = (score: number) => RBANDS.find((b) => score >= b.lo && score <= b.hi) || RBANDS[0];

const CAT_TEAM: Record<string, string> = { Technology: "Engineering", People: "Security", "Third party": "Vendor risk", AI: "Data science", Operational: "Operations", Compliance: "Compliance", AML: "Financial crime" };
const RISK_JUR: Record<string, string> = { "RK-03": "UAE", "RK-07": "EU", "RK-10": "UAE", "RK-12": "Pakistan", "RK-08": "Global" };
const ACCEPT_AUTH: Record<string, string> = { Low: "Risk owner", Medium: "Department head", High: "CISO", Extreme: "Board / CEO" };
const RISK_ENT = [
  { id: "ENT-1", title: "Data protection & privacy failure", kids: ["RK-03", "RK-10", "RK-12"] },
  { id: "ENT-2", title: "Operational resilience failure", kids: ["RK-01", "RK-05", "RK-09", "RK-11"] },
  { id: "ENT-3", title: "Regulatory non-compliance", kids: ["RK-07"] },
  { id: "ENT-4", title: "Insider & access abuse", kids: ["RK-02", "RK-06", "RK-08"] },
  { id: "ENT-5", title: "AI & automation risk", kids: ["RK-04"] },
];

export function riskNorm(r: any): void {
  if (r._n) return;
  if (r.cl == null) r.cl = Math.max(r.rl, r.l - 1);
  if (r.ci == null) r.ci = Math.max(r.ri, r.i - 1);
  if (!r.team) r.team = CAT_TEAM[r.cat] || "Operations";
  if (!r.jur) r.jur = RISK_JUR[r.id] || "Global";
  if (!r.register) r.register = "Information Security";
  if (!r.review) r.review = r.status === "In review" ? "Submitted" : "Approved";
  const ent = RISK_ENT.find((e) => e.kids.includes(r.id)); if (ent && !r.parent) r.parent = { id: ent.id, title: ent.title };
  if (!r.history) r.history = [{ ts: r.identified || nowStamp().slice(0, 10), by: r.owner, a: "Risk identified and entered" }, { ts: r.reviewed || nowStamp().slice(0, 10), by: r.owner, a: "Reviewed; scores confirmed" }];
  if (r.status === "Accepted" && !r.acceptance) {
    const need = ACCEPT_AUTH[rband(sRes(r)).name]; const at = r.reviewed || nowStamp().slice(0, 10);
    const until = new Date(new Date(at).getTime() + 300 * 864e5).toISOString().slice(0, 10);
    r.acceptance = { by: need, at, until, note: "Residual within appetite; accepted by management pending next annual review.", comp: "Monitored under continuity and third-party controls." };
  }
  r._n = true;
}
export function riskLog(r: any, a: string): void { r.history = r.history || []; r.history.push({ ts: nowStamp().slice(0, 10), by: getMe().name, a }); }
export const riskCanEdit = (): boolean => ["super", "admin", "owner", "analyst"].includes(appStore.get().role.replace(/2$/, ""));
export const riskCount = () => DATA.risks.length;
