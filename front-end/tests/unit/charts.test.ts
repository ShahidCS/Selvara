import { describe, expect, it } from "vitest";
import { areaOf, barRects, donutArcs, linePoints, niceMax, pathOf, percent, ticks, type Box } from "@/lib/charts";

const box: Box = { w: 200, h: 100, l: 20, r: 10, t: 10, b: 20 };
describe("chart maths", () => {
  it("niceMax rounds up to 1, 2, 5 or 10 times a power of ten and never returns 0", () => {
    expect([0, -3, 0.7, 1, 1.2, 2, 3, 5, 7, 11, 480, 1200].map(niceMax)).toEqual([1, 1, 1, 1, 2, 2, 5, 5, 10, 20, 500, 2000]);
    for (const v of [0.3, 4.9, 37, 999]) expect(niceMax(v)).toBeGreaterThanOrEqual(v);
  });
  it("ticks run from 0 to max in equal steps", () => { expect(ticks(100)).toEqual([0, 25, 50, 75, 100]); expect(ticks(10, 2)).toEqual([0, 5, 10]); });
  it("linePoints puts 0 at the bottom edge, max at the top, and spreads x evenly", () => {
    const [a, b, c] = linePoints([0, 50, 100], box, 100);
    expect(a.x).toBe(20); expect(c.x).toBe(190); expect(b.x).toBe(105);
    expect(a.y).toBe(80); expect(b.y).toBe(45); expect(c.y).toBe(10);
  });
  it("linePoints clamps out-of-range values and centres a single point", () => {
    const [lo, hi] = linePoints([-5, 500], box, 100); expect(lo.y).toBe(80); expect(hi.y).toBe(10);
    expect(linePoints([3], box, 10)[0].x).toBe(105);
  });
  it("paths are well formed and the area closes to the baseline", () => {
    const pts = linePoints([0, 100], box, 100);
    expect(pathOf(pts)).toBe("M20.0,80.0 L190.0,10.0");
    expect(areaOf(pts, 80)).toBe("M20.0,80.0 L190.0,10.0 L190.0,80.0 L20.0,80.0 Z");
    expect(areaOf([], 80)).toBe("");
  });
  it("barRects stack the second value on top of the first and keep bars inside the plot", () => {
    const [r] = barRects([{ a: 50, b: 25 }], box, 100);
    expect(r.a.h).toBe(35); expect(r.b.h).toBe(17.5);
    expect(r.b.y + r.b.h).toBeCloseTo(r.a.y, 5);
    expect(r.x).toBeGreaterThanOrEqual(box.l); expect(r.x + r.w).toBeLessThanOrEqual(box.w - box.r);
  });
  it("donut arcs add up to the circumference, start where the last ended, and survive an empty or zero total", () => {
    const arcs = donutArcs([1, 1, 2], 10); const c = 2 * Math.PI * 10;
    expect(arcs.reduce((a, x) => a + x.len, 0)).toBeCloseTo(c, 6);
    expect(arcs[1].offset).toBeCloseTo(-arcs[0].len, 6); expect(arcs[2].offset).toBeCloseTo(-(arcs[0].len + arcs[1].len), 6);
    expect(donutArcs([0, 0], 10).every((x) => x.len === 0)).toBe(true);
    expect(donutArcs([], 10)).toEqual([]);
  });
  it("percent rounds and tolerates a zero total", () => { expect(percent(1, 3)).toBe(33); expect(percent(2, 3)).toBe(67); expect(percent(1, 0)).toBe(0); });
});
