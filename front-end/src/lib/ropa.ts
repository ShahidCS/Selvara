/* GDPR Art. 30 RoPA helpers (prototype: ropaFor / ropaById). Pure lookups over the seeded ROPA register (src/lib/platform.ts).
 * The mapping from log entries to processing activities is a demo heuristic; the DPO owns the real register (Art. 30). */
import { ROPA } from "./platform";
import { csvCell, downloadText } from "./format";
import { safeFileName } from "./security";

export interface RopaLike { action?: string; categories?: string[]; cat?: string }
export function ropaFor(l: RopaLike): string {
  const a = l.action || ""; const c = l.categories || [];
  if (/^invoice|^invoices|^rates|feed\.|customer\.onboarded/.test(a) || c.includes("Billing") || c.includes("Rates")) return "PA-16";
  if (/^mfa|^user\.(mfa|password|session|verification)|authentication/i.test(a) || c.includes("Authentication") || c.includes("Identity")) return "PA-01";
  if (/^user\.(created|updated|removed|role)|^users|^member|^contractor/.test(a)) return "PA-02";
  if (/^customer|tenant/.test(a)) return "PA-17";
  if (/^incident/.test(a) || c.includes("Incident")) return "PA-12";
  // workspace categories / actions
  const cat = l.cat || "";
  if (/^access/.test(a) || cat === "Access") return "PA-02";
  if (/^policy/.test(a) || cat === "Policy") return "PA-05";
  if (/^risk/.test(a) || cat === "Risk") return "PA-06";
  if (/^vendor/.test(a) || cat === "Vendor") return "PA-07";
  if (/^ropa/.test(a) || cat === "RoPA") return "PA-13";
  if (/^control|^test|^evidence/.test(a) || cat === "Control") return "PA-04";
  if (/adminlog|export|snapshot/.test(a) || c.includes("Audit")) return "PA-15";
  return "PA-15";
}
export const ropaById = (id: string) => ROPA.find((p) => p.id === id);
export const RopaCols = ["id", "scope", "name", "purpose", "basis", "subjects", "data", "recipients", "transfers", "retention", "tom"] as const;

/** Download the RoPA register (JSON, or CSV through csvCell). Returns false when the browser blocks the download. */
export function downloadRopa(fmt: "json" | "csv"): boolean {
  if (fmt === "json") return downloadText(safeFileName("RoPA-register.json"), JSON.stringify(ROPA, null, 2));
  return downloadText(safeFileName("RoPA-register.csv"), [RopaCols.join(",")].concat(ROPA.map((p) => RopaCols.map((c) => csvCell(p[c])).join(","))).join("\n"));
}
