import { beforeEach, describe, expect, it } from "vitest";
import { FRAMEWORK_REQS, DATA } from "@/lib/data";
import { fwEdits, fwBand, fwScore, fwReadiness, fwReqControls, reqCtrl, reqStatus, seedReqCtrl, fwLegend } from "@/lib/frameworks";

const FW = "iso27001";
const reqs = () => FRAMEWORK_REQS[FW].r.map((r) => r[0]);

beforeEach(() => { fwEdits.set({ NA: {}, MOD: {}, SCOPE: {}, SNOOZE: {}, REQ_CTRL: null }); seedReqCtrl(); });

describe("reqStatus derivation", () => {
  const withControls = (ids: string[]) => { const id = reqs()[0]; reqCtrl()[FW][id] = ids; return id; };
  const setStatus = (cid: string, st: string) => { const c = DATA.controls.find((x) => x.id === cid); c.status = st; };

  it("is 'Not assessed' without mapped controls", () => expect(reqStatus(FW, withControls([]))).toBe("Not assessed"));
  it("is 'Met' when every mapped control passes", () => {
    const [a, b] = DATA.controls; const old = [a.status, b.status];
    setStatus(a.id, "Pass"); setStatus(b.id, "Pass");
    expect(reqStatus(FW, withControls([a.id, b.id]))).toBe("Met");
    a.status = old[0]; b.status = old[1];
  });
  it("is 'Partially met' when some pass", () => {
    const [a, b] = DATA.controls; const old = [a.status, b.status];
    setStatus(a.id, "Pass"); setStatus(b.id, "Fail");
    expect(reqStatus(FW, withControls([a.id, b.id]))).toBe("Partially met");
    a.status = old[0]; b.status = old[1];
  });
  it("is 'Not met' when none pass", () => {
    const [a, b] = DATA.controls; const old = [a.status, b.status];
    setStatus(a.id, "Fail"); setStatus(b.id, "Fail");
    expect(reqStatus(FW, withControls([a.id, b.id]))).toBe("Not met");
    a.status = old[0]; b.status = old[1];
  });
  it("'Not applicable' overrides control state", () => {
    const id = withControls([DATA.controls[0].id]);
    fwEdits.get().NA[FW] = { [id]: { reason: "Out of scope for this entity", by: "J. Avery", date: "2026-11-01" } };
    expect(reqStatus(FW, id)).toBe("Not applicable");
  });
  it("fwReqControls drops unknown control ids", () => {
    const id = withControls(["NOPE-1", DATA.controls[0].id]);
    expect(fwReqControls(FW, id)).toHaveLength(1);
  });
});

describe("fwScore", () => {
  it("returns null for an unknown framework", () => expect(fwScore("nope")).toBeNull());
  it("counts add up to the catalogue size and pct = Met / (total - N/A)", () => {
    const sc = fwScore(FW)!;
    const sum = Object.values(sc.cnt).reduce((a, b) => a + b, 0);
    expect(sum).toBe(FRAMEWORK_REQS[FW].r.length);
    expect(sc.total).toBe(sum - sc.cnt["Not applicable"]);
    expect(sc.impl).toBe(sc.cnt.Met);
    expect(sc.pct).toBe(Math.round((sc.cnt.Met / sc.total) * 100));
  });
  it("marking requirements N/A removes them from the denominator", () => {
    const before = fwScore(FW)!;
    const ids = reqs().slice(0, 5);
    fwEdits.get().NA[FW] = Object.fromEntries(ids.map((i) => [i, { reason: "Not applicable here", by: "x", date: "2026-11-01" }]));
    const after = fwScore(FW)!;
    expect(after.cnt["Not applicable"]).toBe(5);
    expect(after.total).toBe(FRAMEWORK_REQS[FW].r.length - 5);
    expect(after.total).toBeLessThan(before.total + 1);
  });
  it("pct is 0, not NaN, when every requirement is N/A", () => {
    fwEdits.get().NA[FW] = Object.fromEntries(reqs().map((i) => [i, { reason: "x", by: "x", date: "2026-11-01" }]));
    expect(fwScore(FW)!.pct).toBe(0);
    expect(fwLegend(FW)).toBe("n/a " + reqs().length);
  });
  it("is deterministic across reseeds", () => {
    const a = fwScore(FW)!.pct; seedReqCtrl(); expect(fwScore(FW)!.pct).toBe(a);
  });
  it("fwReadiness falls back to the dataset percentage when there is no catalogue", () => {
    const f = DATA.frameworks.find((x) => !FRAMEWORK_REQS[x.id]);
    if (f) expect(fwReadiness(f.id)).toBe(f.pct || 0);
    expect(fwReadiness(FW)).toBe(fwScore(FW)!.pct);
  });
});

describe("fwBand", () => {
  it("bands at 80 / 65 / 50", () => {
    expect(fwBand(80)).toBe("var(--ok-ink)");
    expect(fwBand(79)).toBe("var(--warn-ink)");
    expect(fwBand(65)).toBe("var(--warn-ink)");
    expect(fwBand(64)).toBe("var(--high-ink)");
    expect(fwBand(50)).toBe("var(--high-ink)");
    expect(fwBand(49)).toBe("var(--bad-ink)");
  });
});
