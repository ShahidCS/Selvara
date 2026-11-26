/* In-memory demo dataset (synthetic). Mutated in place by the modules, which then call bumpData().
 * The prototype did the same with a global `DATA`; React components subscribe with useData(). */
import seed from "@/data/seed.json";
import reqs from "@/data/frameworkReqs.json";
import annex from "@/data/annexA.json";
import fwShort from "@/data/fwShort.json";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface DataShape {
  kpis: any[]; frameworks: any[]; controls: any[]; evidence: any[]; policies: any[]; audits: any[]; auditStages: any[];
  issues: any[]; risks: any[]; people: any[]; access: any[]; ai: any[]; vendors: any[]; trust: any[]; questionnaires: any[];
  commitments: any[]; reports: any[]; tests: any[];
}
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
/** In production (API mode) nothing from the synthetic seed is shown: every collection starts empty and is filled from the server
 *  (services/ws.ts) for the modules the person may open. The demonstration keeps the seed. */
const PRODUCTION = (process.env.NEXT_PUBLIC_API_MODE || "mock") === "http";
export const DATA: DataShape = (PRODUCTION ? Object.fromEntries(Object.keys(seed).map((k) => [k, []])) : clone(seed)) as unknown as DataShape;
/** Requirement catalogue per framework: { g: [groupId, title][], r: [id, title, groupId, guidance][] } */
export const FRAMEWORK_REQS: Record<string, { g: string[][]; r: string[][] }> = clone(reqs) as any;
export const ANNEXA: { id: string; title: string; theme: string }[] = annex as any;
export const FW_SHORT: Record<string, string> = fwShort as any;
export const FW_ID: Record<string, string> = Object.fromEntries(DATA.frameworks.map((f) => [f.id, f.name]));
/** The frameworks a control maps to that are in the library (or the company's own). A mapping kept in a company's records for a framework the
    library no longer lists (for example one removed by the Compliance Sources Register) is not shown. */
/** A requirement's title in its framework's catalogue, or null when the reference does not resolve (a short legacy reference such as "Art.5"). */
const REQ_TITLE = new Map<string, string>();
export function reqTitle(fwId: string, reqId: string): string | null {
  if (!REQ_TITLE.size) for (const [fw, cat] of Object.entries(FRAMEWORK_REQS)) for (const r of cat.r) REQ_TITLE.set(fw + "\u0000" + r[0], r[1]);
  const hit = REQ_TITLE.get(fwId + "\u0000" + reqId);
  if (hit) return hit;
  const r = FRAMEWORK_REQS[fwId]?.r.find((x) => x[0] === reqId); // a catalogue registered after the first lookup (a company's own framework)
  return r ? r[1] : null;
}
export const mappedFws = (c: { map?: Record<string, string[]> }): string[] => Object.keys(c.map || {}).filter((k) => k in FW_ID && (c.map![k] || []).length > 0);

export const testsForControl = (cid: string) => DATA.tests.filter((t) => t.controls.includes(cid));
export function controlsForFw(id: string) {
  if (id === "iso27002") id = "iso27001";
  return DATA.controls.filter((c) => c.map && c.map[id]);
}
export function refreshFrameworkCounts() {
  DATA.frameworks.forEach((f) => { f.mapped = controlsForFw(f.id).length; });
}
refreshFrameworkCounts();
export function annexCovered(): Set<string> {
  const s = new Set<string>();
  DATA.controls.forEach((c) => { ((c.map && c.map.iso27001) || []).forEach((x: string) => s.add(x)); });
  return s;
}
