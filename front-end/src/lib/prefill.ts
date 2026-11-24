/* Prefill a form from a document's text (reference review R27). Two ways, both checked against the same field rules:
   - fixed rules (here, in the browser): "Label: value" or "Label<TAB>value" lines whose label names a field;
   - on request in production, the Assistant on the server (server/ws/assistant.ts, POST /ws/assistant/prefill), which reads the text and
     returns values that are checked against these rules again on the server.
   Filled fields are tinted until the person edits them; nothing is saved until they submit the form. */

export type PrefillKind = { type: "text"; max: number } | { type: "choice"; options: readonly string[] } | { type: "number"; min: number; max: number } | { type: "scale" };
export interface PrefillField { key: string; label: string; aliases: string[]; kind: PrefillKind }
export const PREFILL_FORMS: Record<"vendor" | "risk", PrefillField[]> = {
  vendor: [
    { key: "name", label: "Vendor name", aliases: ["vendor name", "vendor", "supplier name", "supplier", "company name", "company", "legal name", "organisation name", "organization name", "provider"], kind: { type: "text", max: 120 } },
    { key: "cat", label: "Category", aliases: ["category", "service category", "service type", "type of service", "service", "services provided"], kind: { type: "text", max: 80 } },
    { key: "tier", label: "Tier", aliases: ["tier", "criticality", "risk tier", "vendor tier", "classification"], kind: { type: "choice", options: ["Critical", "Medium", "Low"] } },
    { key: "score", label: "Initial risk score (0-100)", aliases: ["risk score", "score", "initial risk score", "inherent risk score", "assessment score"], kind: { type: "number", min: 0, max: 100 } },
  ],
  risk: [
    { key: "title", label: "Risk title", aliases: ["risk title", "title", "risk", "risk name", "risk statement"], kind: { type: "text", max: 200 } },
    { key: "desc", label: "Description", aliases: ["description", "risk description", "details", "summary", "scenario"], kind: { type: "text", max: 1000 } },
    { key: "cat", label: "Category", aliases: ["category", "risk category", "type", "risk type"], kind: { type: "choice", options: ["Technology", "People", "Third party", "AI", "Operational", "Compliance", "AML"] } },
    { key: "l", label: "Inherent likelihood (1-5)", aliases: ["likelihood", "inherent likelihood", "probability"], kind: { type: "scale" } },
    { key: "i", label: "Inherent impact (1-5)", aliases: ["impact", "inherent impact", "severity", "consequence"], kind: { type: "scale" } },
    { key: "rl", label: "Residual likelihood (1-5)", aliases: ["residual likelihood", "target likelihood"], kind: { type: "scale" } },
    { key: "ri", label: "Residual impact (1-5)", aliases: ["residual impact", "target impact"], kind: { type: "scale" } },
    { key: "treat", label: "Treatment decision", aliases: ["treatment", "treatment decision", "response", "risk response", "decision"], kind: { type: "choice", options: ["Mitigate", "Transfer", "Accept", "Avoid"] } },
  ],
};
/** Words of the likelihood and impact scales (lib/risk.ts Lb and Ib) read as their number. */
const SCALE_WORDS: Record<string, number> = { rare: 1, unlikely: 2, possible: 3, likely: 4, "almost certain": 5, insignificant: 1, minor: 2, moderate: 3, major: 4, severe: 5, "very low": 1, low: 2, medium: 3, high: 4, "very high": 5, critical: 5 };
/** Markers the server puts where it masked personal data: never filled into a field. */
const MASKED = /\[(EMAIL|PERSON|PHONE|NAME|ID|IBAN|CARD|ADDRESS|[A-Z_]{3,})\]/;

/** A proposed value checked against its field: the value to fill, or null when it does not fit. */
export function checkValue(f: PrefillField, raw: unknown): string | null {
  const v = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!v || MASKED.test(v)) return null;
  const k = f.kind;
  if (k.type === "text") return v.slice(0, k.max);
  if (k.type === "choice") { const hit = k.options.find((o) => o.toLowerCase() === v.toLowerCase()) ?? k.options.find((o) => new RegExp(`^${o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(v)); return hit ?? null; }
  if (k.type === "number") { const n = Number(/-?\d+(\.\d+)?/.exec(v)?.[0]); return Number.isFinite(n) && n >= k.min && n <= k.max ? String(n) : null; }
  const d = /^([1-5])\b/.exec(v)?.[1]; if (d) return d;
  const w = Object.keys(SCALE_WORDS).sort((a, b) => b.length - a.length).find((x) => v.toLowerCase().startsWith(x));
  return w ? String(SCALE_WORDS[w]) : null;
}

const norm = (s: string) => s.toLowerCase().replace(/[*_#>`"]+/g, "").replace(/\s+/g, " ").trim();
/** Fixed rules: each line "Label: value", "Label - value" or "Label<TAB>value" whose label is one of a field's names. The longest name wins, so
 *  "Residual likelihood" is not read as "Likelihood"; the first line that fits a field fills it. */
export function prefillFromText(text: string, fields: PrefillField[]): Record<string, string> {
  const out: Record<string, string> = {};
  const names = fields.flatMap((f) => f.aliases.map((a) => ({ f, a }))).sort((x, y) => y.a.length - x.a.length);
  for (const line of text.split("\n")) {
    const m = /^\s*([^:\t]{2,60}?)\s*(?::|\t+|\s[-–—]\s)\s*(.+)$/.exec(line); if (!m) continue;
    const label = norm(m[1]).replace(/[:.]$/, "");
    const hit = names.find((n) => label === n.a); if (!hit || out[hit.f.key] !== undefined) continue;
    const v = checkValue(hit.f, m[2]); if (v !== null) out[hit.f.key] = v;
  }
  return out;
}
/** Values from the server, kept only for known fields and only when they fit (the server checks the same rules). */
export function checkValues(fields: PrefillField[], values: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) { if (!(f.key in values)) continue; const v = checkValue(f, values[f.key]); if (v !== null) out[f.key] = v; }
  return out;
}
