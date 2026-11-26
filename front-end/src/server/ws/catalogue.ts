/* Server-only. The reference catalogues every company shares (decision recorded in PRODUCTION_PROGRAMME.md section 1, "Starting data"): the
   framework library and its requirements, and the control library a company adopts from. They ship with the code, so they are identical for every
   company and nobody can change them through the API. A company's own choices (scope, mappings, adopted controls) are its records. */
import seed from "@/data/seed.json";
import reqs from "@/data/frameworkReqs.json";

/** `title` (the full form), `publisher` and `version` follow the Compliance Sources Register; `reqEdition` is set when the modelled requirements reflect an
    earlier edition than `version` (FRAMEWORK_RECONCILIATION.md lists the gaps). */
export interface LibFramework { id: string; name: string; title: string; publisher: string; version: string; reqEdition?: string; kind: string; region: string }
export interface LibControl { id: string; title: string; domain: string; map: Record<string, string[]> }
type Reqs = Record<string, { g: string[][]; r: string[][] }>;

const S = seed as unknown as { frameworks: Record<string, unknown>[]; controls: Record<string, unknown>[] };
export const LIB_FRAMEWORKS: LibFramework[] = S.frameworks.map((f) => ({
  id: String(f.id), name: String(f.name), title: String(f.title ?? ""), publisher: String(f.publisher ?? ""), version: String(f.version ?? ""),
  ...(f.reqEdition ? { reqEdition: String(f.reqEdition) } : {}), kind: String(f.kind), region: String(f.region),
}));
export const LIB_REQS = reqs as unknown as Reqs;
export const LIB_CONTROLS: LibControl[] = S.controls.map((c) => ({ id: String(c.id), title: String(c.title), domain: String(c.domain), map: (c.map ?? {}) as Record<string, string[]> }));
/** Requirement ids of a library framework (ISO 27002 shares ISO 27001's control mappings). */
export const reqIds = (fw: string): Set<string> => new Set((LIB_REQS[fw]?.r ?? []).map((r) => r[0]));
