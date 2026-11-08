import { DATA } from "./data";
import { fwReadiness } from "./frameworks";

export const riskOpen = (r: any) => r.status !== "Accepted" && r.status !== "Closed";
export const sInh = (r: any) => r.l * r.i;
export const sCur = (r: any) => (r.cl || r.l) * (r.ci || r.i);
export const sRes = (r: any) => r.rl * r.ri;

/** Computed metrics (single source of truth for Overview / Reports). */
export function metrics() {
  const fw = DATA.frameworks;
  const compliance = Math.round(fw.reduce((a, f) => a + fwReadiness(f.id) * f.controls, 0) / fw.reduce((a, f) => a + f.controls, 0));
  const openRisks = DATA.risks.filter((r) => r.status !== "Accepted" && r.status !== "Closed").length;
  const aboveAppetite = DATA.risks.filter((r) => r.rl * r.ri >= 8).length;
  const overdueControls = DATA.controls.filter((c) => c.status === "Fail").length;
  const needsEvidence = DATA.controls.filter((c) => c.status === "Needs evidence").length;
  const openIssues = DATA.issues.filter((i) => i.status !== "Closed").length;
  const upcomingAudits = DATA.audits.filter((a) => a.stage !== "Complete").length;
  const vendorDue = DATA.vendors.filter((v) => /Overdue/.test(v.due) || v.status === "In review").length;
  return { compliance, openRisks, aboveAppetite, overdueControls, needsEvidence, openIssues, upcomingAudits, vendorDue };
}
