import { adminLog } from "@/lib/adminAudit";
import { roleOf } from "@/lib/rbac";
/* AI governance helpers (ported from the prototype's `ai*` helpers, source lines 3012-3245).
 * Seed constants come from src/features/ai/data/aiSeed.json (extracted with scripts/extract-source.js). */
import seed from "@/features/ai/data/aiSeed.json";
import { DATA } from "@/lib/data";
import { appStore } from "@/lib/store";
import { getActor, hasRole, isSamePerson } from "@/lib/sod";

/* eslint-disable @typescript-eslint/no-explicit-any */
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** Operational guardrail tiers: [name, description]. */
export const AI_GUARDRAILS: [string, string][] = clone(seed.AI_GUARDRAILS) as [string, string][];
export const AI_GUARDRAIL_TONE: Record<string, string> = clone(seed.AI_GUARDRAIL_TONE);
/** How AI is discovered across the estate: [source, description]. */
export const AI_DISCOVERY: [string, string][] = clone(seed.AI_DISCOVERY) as [string, string][];
/** Discovered AI awaiting registration. Mutated in place (the source reassigned it with filter()). */
export const AI_SHADOW: any[] = clone(seed.AI_SHADOW);
export const AI_DETAIL: Record<string, any> = clone(seed.AI_DETAIL);

export const AI_TIERS = ["High", "Medium", "Low"];
export const AI_AUTONOMY = ["Suggests only", "Human-approved actions", "Human-in-the-loop", "Autonomous"];
export const AI_FRIA_STATUSES = ["Not started", "In progress", "Complete", "Not required"];
export const AI_BIAS_STATUSES = ["Passed", "Issues found", "Due", "Not applicable"];
export const AI_ANNEX_AREAS = ["Biometric identification", "Critical infrastructure", "Education & vocational training", "Employment & worker management", "Essential services (incl. creditworthiness)", "Law enforcement", "Migration & border control", "Administration of justice"];
export const AI_ROLES = ["Provider", "Deployer"];

/** `new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})` */
export const todayGB = () => new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export const aiFind = (id: string): any | undefined => DATA.ai.find((a) => a.id === id);

/** Prototype: aiInit. Lazily fills the governance fields from the tier (idempotent). */
export function aiInit(a: any) {
  if (a._init) return a;
  a._init = true; const T = a.tier;
  if (!a.euClass) a.euClass = T === "High" ? "High-risk" : T === "Medium" ? "Limited risk" : "Minimal risk";
  if (!a.lifecycle) a.lifecycle = a.status === "Archived" ? "Retired" : a.status === "In review" ? "Validation" : "Monitoring";
  if (!a.fria) a.fria = T === "High" ? { status: "Complete", date: a.lastReview || "02 Sep 2026", by: a.owner, summary: "Fundamental-rights and data-protection impacts assessed; residual risks accepted with human-oversight and logging controls." } : T === "Medium" ? { status: "In progress", date: "", by: a.owner, summary: "" } : { status: "Not required", date: "", by: "", summary: "" };
  if (!a.bias) a.bias = T === "High" ? { status: "Passed", last: "20 Aug 2026", result: "Within fairness thresholds across tested cohorts; false-positive parity checked." } : T === "Medium" ? { status: "Due", last: "", result: "" } : { status: "Not applicable", last: "", result: "" };
  if (!a.oversight) a.oversight = T === "High" ? ["A human reviewer confirms every high-risk match before any action is taken", "Monthly performance and model-drift review by the system owner", "Documented override, escalation and appeal path for affected individuals"] : T === "Medium" ? ["Human-in-the-loop review on flagged exceptions", "Quarterly performance review"] : ["Acceptable-use policy and usage guardrails"];
  if (!a.signals) a.signals = T === "High" ? [{ at: "2d ago", sev: "Review", source: "Model monitoring", text: "Precision drift +1.8% vs validation baseline", rec: "Re-validate before the next decision cycle", status: "Open" }, { at: "3w ago", sev: "Info", source: "Device monitor", text: "Scheduled training-data refresh logged", rec: "Confirm data lineage is recorded", status: "Open" }] : T === "Medium" ? [{ at: "1w ago", sev: "Info", source: "DLP", text: "Prompt contained a customer reference once; auto-redacted", rec: "Remind the team of the acceptable-use policy", status: "Open" }] : [];
  if (!a.obligations) a.obligations = T === "High" ? [["Risk management system", "Met"], ["Data governance & bias testing", "Met"], ["Technical documentation", "Partial"], ["Human oversight", "Met"], ["Logging & traceability", "Met"], ["Accuracy & robustness", "Partial"]] : T === "Medium" ? [["Transparency to users", "Met"], ["Human oversight", "Partial"], ["Record-keeping", "Met"]] : [["Acceptable-use policy", "Met"]];
  const d = AI_DETAIL[a.id] || {};
  if (a.discovered === undefined) a.discovered = d.disc || "Manual registration";
  if (a.surface === undefined) a.surface = d.surface || "Internal service";
  if (a.model === undefined) a.model = d.model || "—";
  if (a.provider === undefined) a.provider = d.provider || "In-house";
  if (a.dataReached === undefined) a.dataReached = d.data || "Internal data";
  if (a.autonomy === undefined) a.autonomy = d.auto || "Suggests only";
  if (a.users === undefined) a.users = d.users || "—";
  if (a.tools === undefined) a.tools = d.tools || "";
  if (a.guardrail === undefined) a.guardrail = T === "High" ? "Restricted" : T === "Medium" ? "Standard" : "Controlled";
  if (a.euState === undefined) a.euState = a.status === "Approved" ? { state: "Confirmed", by: "A. Rivera (Legal & Privacy)", at: a.added, draftBy: a.owner } : { state: a.euClass && a.euClass !== "Not classified" ? "Draft" : "Not classified", by: "", at: "", draftBy: a.owner };
  if (a.fria && a.fria.review === undefined) a.fria.review = a.fria.status === "Complete" ? "Approved" : a.fria.status === "In progress" ? "Draft" : "None";
  if (a.fria && a.fria.submittedBy === undefined) a.fria.submittedBy = a.fria.review === "Approved" ? a.owner : "";
  if (a.fria && a.fria.approvedBy === undefined) a.fria.approvedBy = a.fria.review === "Approved" ? "A. Rivera" : "";
  return a;
}

/** Who may change an AI system: admin or owner role (base roles), or the person named as the system owner (matched with isSamePerson, not by surname:
 * the prototype compared surnames, so two people sharing a surname both managed the system). UI gate only: the services call the same rule. */
export function aiCanManage(a: any, roleId: string = appStore.get().role): boolean {
  if (hasRole(roleId, "admin", "owner")) return true;
  if (!a || !a.owner) return false;
  return isSamePerson(a.owner, getActor().name);
}
/** Who may confirm/approve (second person) decisions: admin or owner role. The prototype also allowed anyone whose name matched "Rivera"; removed (SOD_MATRIX: "role gate admin/owner"). */
export const aiCanDecide = (roleId: string = appStore.get().role): boolean => hasRole(roleId, "admin", "owner");
/** Kept for callers of the old name; now the same admin/owner role gate (no surname matching). */
export const aiIsLegalOrAdmin = aiCanDecide;
/** People who may never confirm/approve a decision about this system: the system owner (record owner) plus the given drafters/submitters. */
export const aiForbidden = (a: any, ...extra: unknown[]): string[] => [a?.owner, ...extra].filter(Boolean).map(String);
export function aiEuRationale(c: string): string {
  return ({ "High-risk": "Used in a regulated decision context that affects individuals; the full set of high-risk obligations applies.", "Limited risk": "Interacts with people and must disclose that it is AI; transparency obligations apply.", "Minimal risk": "Internal productivity use with no automated decisions on individuals; no specific obligations.", Prohibited: "Falls within an unacceptable-risk category and must not be operated." } as Record<string, string>)[c] || "Not yet classified under the EU AI Act.";
}
/** Prototype: aiLog writes to the platform admin audit chain only (tenant = the signed-in role's tenant). */
export function aiLog(action: string, name: string) { adminLog(action, name, { tenant: roleOf(appStore.get().role).tenant || "", categories: ["AI governance"] }); }
