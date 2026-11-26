import { describe, expect, it } from "vitest";
import seed from "@/data/seed.json";
import reqs from "@/data/frameworkReqs.json";
import short from "@/data/fwShort.json";
import { LIB_FRAMEWORKS } from "@/server/ws/catalogue";

/* The framework library matches the Compliance Sources Register (25 entries); requirement content comes from the original sources
   (Assurance-GRC-Portal.html and GRC_Unified_Compliance_Dashboard.html). See docs/architecture/FRAMEWORK_RECONCILIATION.md. */
type Fw = { id: string; name: string; kind: string; title: string; publisher: string; version: string; reqEdition?: string };
type Ctl = { id: string; status: string; map: Record<string, string[]> };
const R = reqs as unknown as Record<string, { g: string[][]; r: string[][] }>;
const FW = (seed as unknown as { frameworks: Fw[] }).frameworks;
const CTL = (seed as unknown as { controls: Ctl[] }).controls;
const REMOVED = ["sbp", "amlcft", "uaeniaf"];

describe("framework library (Compliance Sources Register)", () => {
  it("lists the register's 25 entries: 8 standards, 8 frameworks, 9 regulations; every one has its requirement catalogue", () => {
    expect(FW).toHaveLength(25);
    const by = (k: string) => FW.filter((f) => f.kind === k).length;
    expect([by("Standard"), by("Framework"), by("Regulation")]).toEqual([8, 8, 9]);
    for (const f of FW) expect(R[f.id]?.r.length, f.id).toBeGreaterThan(0);
  });
  it("records a publisher and a version for every entry, as the register gives them", () => {
    for (const f of FW) { expect(f.publisher, f.id).toBeTruthy(); expect(f.version, f.id).toBeTruthy(); }
    expect(FW.find((f) => f.id === "iso27701")).toMatchObject({ name: "ISO/IEC 27701:2025", publisher: "ISO/IEC (JTC 1/SC 27)", version: "Oct 2025" });
    expect(FW.find((f) => f.id === "uaeia")).toMatchObject({ name: "UAE Information Assurance Regulation v1.1", publisher: "UAE Cyber Security Council (formerly NESA)" });
    // the server library carries the same fields
    expect(LIB_FRAMEWORKS.find((f) => f.id === "nist80053")).toMatchObject({ name: "NIST SP 800-53 Rev. 5", version: "Sep 2020 (Release 5.2.0, Aug 2025)" });
  });
  it("flags the entries whose modelled requirements predate the register's edition, and only those", () => {
    expect(FW.filter((f) => f.reqEdition).map((f) => f.id).sort()).toEqual(["difc", "iso22301", "iso27001", "iso27701", "nist80053", "uaeia"]);
  });
  it("drops the three entries the register does not list, everywhere", () => {
    for (const id of REMOVED) {
      expect(FW.some((f) => f.id === id), id).toBe(false);
      expect(R[id], id).toBeUndefined();
      expect((short as Record<string, string>)[id], id).toBeUndefined();
      expect(CTL.some((c) => id in c.map), id).toBe(false);
    }
  });
  it("keeps PTA CTDISR 2025 and NIST SP 800-53 in full, as in the source", () => {
    expect([R.ctdisr.g.length, R.ctdisr.r.length]).toEqual([13, 349]);
    expect([R.nist80053.g.length, R.nist80053.r.length]).toEqual([20, 298]);
    expect(FW.find((f) => f.id === "ctdisr")?.kind).toBe("Regulation");
  });
  it("holds the 141-control library; no link points at a missing requirement beyond the 72 the original app already had", () => {
    expect(CTL).toHaveLength(141);
    expect(new Set(CTL.map((c) => c.id)).size).toBe(141);
    let unresolved = 0;
    for (const c of CTL) for (const [fw, ids] of Object.entries(c.map)) {
      const known = new Set((R[fw]?.r ?? []).map((r) => r[0]));
      unresolved += ids.filter((id) => !known.has(id)).length;
    }
    // short references in the original app (for example "Art.5" where the catalogue has "Art.5(1)") are listed for review in
    // FRAMEWORK_RECONCILIATION.md, not guessed at; the number may only go down
    expect(unresolved).toBeLessThanOrEqual(72);
    // controls the source defines without tests or evidence are not claimed as passing
    expect(CTL.filter((c) => c.status === "Pass").length).toBe(20);
  });
});
