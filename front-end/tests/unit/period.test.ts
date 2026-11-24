import { describe, expect, it } from "vitest";
import { DEMO_RISE, demoIssueFlow, demoSeries, isoWeek, periodRange, periodStart, periodTicks, periodVs } from "@/lib/period";

/* Reference review R34: the reporting period and the demonstration's synthetic history. */
const NOW = new Date(2026, 10, 23, 12).getTime(); // 23 Nov 2026, local time
const DAY = 86400_000;

describe("reporting period", () => {
  it("starts 6 or 29 days back, or on the first day of the quarter", () => {
    expect(new Date(periodStart("7d", NOW)).getDate()).toBe(17);
    expect(Math.round((NOW - periodStart("30d", NOW)) / DAY)).toBe(29);
    const q = new Date(periodStart("q", NOW)); expect([q.getMonth(), q.getDate()]).toEqual([9, 1]);
    const q1 = new Date(periodStart("q", new Date(2026, 1, 14).getTime())); expect([q1.getMonth(), q1.getDate()]).toEqual([0, 1]);
  });
  it("names the range and what a change is compared with", () => {
    expect(periodRange("7d", NOW)).toBe("17 Nov to 23 Nov");
    expect(periodRange("30d", NOW)).toBe("25 Oct to 23 Nov");
    expect(periodRange("q", NOW)).toBe("Q4 to date");
    expect(periodVs("q")).toBe("vs last quarter");
  });
  it("draws 7 daily points ending today, and fewer points over longer periods", () => {
    const d = periodTicks("7d", NOW); expect(d).toHaveLength(7); expect(d[6].label).toBe("Today");
    const m = periodTicks("30d", NOW); expect(m.length).toBeGreaterThanOrEqual(6); expect(m.length).toBeLessThanOrEqual(7); expect(m[m.length - 1].t).toBe(NOW);
    const q = periodTicks("q", NOW); expect(q.length).toBeGreaterThan(3); expect(q.length).toBeLessThanOrEqual(8);
    for (const t of [d, m, q]) for (let i = 1; i < t.length; i++) expect(t[i].t).toBeGreaterThan(t[i - 1].t);
  });
});

describe("demonstration history", () => {
  it("ends exactly at today's figure, is deterministic, and stays in range", () => {
    const a = demoSeries(63, 7, 7); expect(a[6]).toBe(63); expect(a).toEqual(demoSeries(63, 7, 7));
    expect(a[0]).toBeLessThan(63);
    expect(demoSeries(2, 9, 10).every((v) => v >= 0 && v <= 100)).toBe(true);
    const falling = demoSeries(11, 5, -4, 0, 999); expect(falling[4]).toBe(11); expect(falling[0]).toBeGreaterThan(11);
  });
  it("issue flow has one bucket per day, week or month, the last being now", () => {
    expect(demoIssueFlow("7d", NOW).map((x) => x.label).at(-1)).toBe("Today");
    expect(demoIssueFlow("30d", NOW).map((x) => x.label)).toEqual(["W44", "W45", "W46", "W47", "This week"]);
    expect(demoIssueFlow("q", NOW).map((x) => x.label)).toEqual(["Sept", "Oct", "This month"].map((l, i) => (i < 2 ? new Date(2026, 8 + i, 1).toLocaleDateString("en-GB", { month: "short" }) : l)));
    for (const p of ["7d", "30d", "q"] as const) expect(demoIssueFlow(p, NOW).every((x) => x.closed >= 0 && x.opened >= 0)).toBe(true);
    expect(DEMO_RISE.q.compliance).toBeGreaterThan(DEMO_RISE["7d"].compliance);
  });
  it("numbers ISO weeks (the week with the year's first Thursday is week 1)", () => {
    expect(isoWeek(new Date(2026, 10, 23).getTime())).toBe(48);
    expect(isoWeek(new Date(2026, 0, 1).getTime())).toBe(1);
    expect(isoWeek(new Date(2027, 0, 1).getTime())).toBe(53);
  });
});
