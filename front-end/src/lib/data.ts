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
export const DATA: DataShape = clone(seed) as unknown as DataShape;
/** Requirement catalogue per framework: { g: [groupId, title][], r: [id, title, groupId, guidance][] } */
export const FRAMEWORK_REQS: Record<string, { g: string[][]; r: string[][] }> = clone(reqs) as any;
export const ANNEXA: { id: string; title: string; theme: string }[] = annex as any;
export const FW_SHORT: Record<string, string> = fwShort as any;
export const FW_ID: Record<string, string> = Object.fromEntries(DATA.frameworks.map((f) => [f.id, f.name]));

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
