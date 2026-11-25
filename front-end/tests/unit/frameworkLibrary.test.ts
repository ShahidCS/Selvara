import { describe, expect, it } from "vitest";
import seed from "@/data/seed.json";
import reqs from "@/data/frameworkReqs.json";

/* Part K: the framework library is a complete superset of both original sources (Assurance-GRC-Portal.html and
   GRC_Unified_Compliance_Dashboard.html). Counts come from the sources; see docs/architecture/FRAMEWORK_RECONCILIATION.md. */
type Fw = { id: string; kind: string };
type Ctl = { id: string; status: string; map: Record<string, string[]> };
const R = reqs as unknown as Record<string, { g: string[][]; r: string[][] }>;
const FW = (seed as unknown as { frameworks: Fw[] }).frameworks;
const CTL = (seed as unknown as { controls: Ctl[] }).controls;

describe("framework library (Part K reconciliation)", () => {
  it("lists 28 frameworks: 8 standards, 10 frameworks, 10 regulations; every one has its requirement catalogue", () => {
    expect(FW).toHaveLength(28);
    const by = (k: string) => FW.filter((f) => f.kind === k).length;
    expect([by("Standard"), by("Framework"), by("Regulation")]).toEqual([8, 10, 10]);
    for (const f of FW) expect(R[f.id]?.r.length, f.id).toBeGreaterThan(0);
  });
  it("reinstates PTA CTDISR 2025, NIST SP 800-53 and UAE NIAF in full, as in the source", () => {
    expect([R.ctdisr.g.length, R.ctdisr.r.length]).toEqual([13, 349]);
    expect([R.nist80053.g.length, R.nist80053.r.length]).toEqual([20, 298]);
    expect([R.uaeniaf.g.length, R.uaeniaf.r.length]).toEqual([6, 36]);
    expect(FW.find((f) => f.id === "ctdisr")?.kind).toBe("Regulation");
  });
  it("holds the 141-control library; no link points at a missing requirement beyond the 78 the original app already had", () => {
    expect(CTL).toHaveLength(141);
    expect(new Set(CTL.map((c) => c.id)).size).toBe(141);
    let unresolved = 0;
    for (const c of CTL) for (const [fw, ids] of Object.entries(c.map)) {
      const known = new Set((R[fw]?.r ?? []).map((r) => r[0]));
      unresolved += ids.filter((id) => !known.has(id)).length;
    }
    // 78 short references in the original app (for example "Art.5" where the catalogue has "Art.5(1)") are listed for review in
    // FRAMEWORK_RECONCILIATION.md, not guessed at; the reinstated links all resolve, so the number may only go down
    expect(unresolved).toBeLessThanOrEqual(78);
    // controls the source defines without tests or evidence are not claimed as passing
    expect(CTL.filter((c) => c.status === "Pass").length).toBe(20);
  });
});
