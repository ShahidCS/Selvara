/* Third-party (vendor) helpers ported from the prototype (source lines 3246-3325). */
import { DATA } from "./data";
import { appStore } from "./store";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const VENDOR_TIERS = ["Critical", "Medium", "Low"];
export const TIER_CADENCE: Record<string, string> = { Critical: "Annual review + continuous monitoring", Medium: "Reassessment every 2 years", Low: "Reassessment every 3 years or on material change" };
export const TIER_WINDOW: Record<string, string> = { Critical: "Due in 12 months", Medium: "Due in 24 months", Low: "Due in 36 months" };
export const TIER_TONE: Record<string, string> = { Critical: "bad", Medium: "warn", Low: "good" };
export const REASSESS_OUTCOMES = ["Approved, continue", "Approved with conditions", "Escalate, remediation required"];
export const FINDING_SEVS = ["High", "Medium", "Low"];

/** Who may approve/dismiss vendor requests (prototype: vendorCanManage). UI gate only: the API must enforce it. */
export const vendorCanManage = (roleId: string = appStore.get().role) => ["super", "admin", "owner", "analyst"].includes(roleId);

/** Prototype: vInit. Fills id and demo detail lazily (idempotent). The source id (`V-` + first 4 letters/digits of the name) could collide; a numeric suffix keeps ids unique. */
export function vInit(v: any) {
  if (!v.id) {
    const base = "V-" + String(v.name).replace(/[^a-z0-9]+/gi, "").slice(0, 4).toUpperCase();
    let id = base, n = 2;
    while (DATA.vendors.some((x) => x !== v && x.id === id)) id = base + n++;
    v.id = id;
  }
  if (!v.reassessments) v.reassessments = [];
  if (!v.certs) v.certs = v.tier === "Critical" ? [{ type: "SOC 2 Type II", expires: "30 Jun 2027", status: "Valid" }, { type: "ISO 27001", expires: "14 Mar 2027", status: "Valid" }] : v.tier === "Medium" ? [{ type: "ISO 27001", expires: "20 Nov 2026", status: "Expiring" }] : [];
  if (!v.findings) v.findings = v.score < 75 ? [{ id: "VF-" + v.id.slice(2, 5), title: v.tier === "Critical" ? "No recent independent pen-test on file" : "DPA not countersigned", sev: v.score < 65 ? "High" : "Medium", status: "Open" }] : [];
  if (!v.monitoring) v.monitoring = v.tier === "Critical" ? [{ at: "Today", signal: "TLS certificate renewed", level: "Info" }, { at: "3d ago", signal: "New sub-processor disclosed", level: "Review" }] : [];
  if (!v.gate) v.gate = v.status === "Needs evidence" ? "Pending" : "Approved";
  if (!v.apps) v.apps = v.tier !== "Low" ? [{ name: v.name + " connector", users: 12, sanctioned: true }] : [{ name: v.name + " (shadow)", users: 3, sanctioned: false }];
  return v;
}
export const vFind = (id: string): any | undefined => DATA.vendors.find((v) => v.id === id);
/** Run vInit on every vendor (the source did this at the top of REND.vendors). Ids are assigned in list order. */
export const vInitAll = () => { DATA.vendors.forEach(vInit); };
