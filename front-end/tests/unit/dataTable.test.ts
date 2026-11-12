import { describe, expect, it } from "vitest";
import { ALL, nextSort, pageInfo, pageWindow, queryRows, selectionState, toCsv, toggleAll, toggleOne } from "@/lib/dataTable";

type R = { id: string; sev: string; owner: string; n: number; due: string };
const rows: R[] = [
  { id: "A", sev: "High", owner: "Kim", n: 3, due: "d" }, { id: "B", sev: "Low", owner: "Hart", n: 1, due: "d" },
  { id: "C", sev: "High", owner: "Hart", n: 2, due: "d" }, { id: "D", sev: "Critical", owner: "Kim", n: 2, due: "d" },
];
const q = (state: { filters?: Record<string, string>; sort?: { key: string; dir: "asc" | "desc" } | null }, tab?: (r: R) => boolean) => queryRows(rows, {
  tab: tab ? { match: tab } : null,
  filters: [{ key: "sev", get: (r) => r.sev }, { key: "owner", get: (r) => r.owner }],
  state: { filters: state.filters || {}, sort: state.sort ?? null },
  value: (k) => (k === "n" ? (r) => r.n : k === "id" ? (r) => r.id : undefined),
});

describe("queryRows", () => {
  it("applies the tab, then each filter chip, and 'All' does not filter", () => {
    expect(q({}).map((r) => r.id)).toEqual(["A", "B", "C", "D"]);
    expect(q({ filters: { sev: "High" } }).map((r) => r.id)).toEqual(["A", "C"]);
    expect(q({ filters: { sev: "High", owner: "Hart" } }).map((r) => r.id)).toEqual(["C"]);
    expect(q({ filters: { sev: ALL } }).length).toBe(4);
    expect(q({}, (r) => r.owner === "Kim").map((r) => r.id)).toEqual(["A", "D"]);
  });
  it("sorts ascending and descending, keeps ties in their original order, and never mutates the input", () => {
    const before = rows.map((r) => r.id).join();
    expect(q({ sort: { key: "n", dir: "asc" } }).map((r) => r.id)).toEqual(["B", "C", "D", "A"]);
    expect(q({ sort: { key: "n", dir: "desc" } }).map((r) => r.id)).toEqual(["A", "C", "D", "B"]);
    expect(rows.map((r) => r.id).join()).toBe(before);
  });
  it("ignores a sort key with no value function", () => { expect(q({ sort: { key: "nope", dir: "asc" } }).map((r) => r.id)).toEqual(["A", "B", "C", "D"]); });
  it("compares numbers inside text naturally (R-9 before R-10)", () => {
    const t = queryRows([{ id: "R-10" }, { id: "R-9" }], { filters: [], state: { filters: {}, sort: { key: "id", dir: "asc" } }, value: () => (r: { id: string }) => r.id });
    expect(t.map((r) => r.id)).toEqual(["R-9", "R-10"]);
  });
});

describe("sorting and paging", () => {
  it("a header click cycles asc, desc, off, and a different column starts at asc", () => {
    const a = nextSort(null, "x"); expect(a).toEqual({ key: "x", dir: "asc" });
    const b = nextSort(a, "x"); expect(b).toEqual({ key: "x", dir: "desc" });
    expect(nextSort(b, "x")).toBeNull();
    expect(nextSort(b, "y")).toEqual({ key: "y", dir: "asc" });
  });
  it("pageInfo clamps a stale page and reports 1-based ranges", () => {
    expect(pageInfo(23, 1, 10)).toEqual({ page: 1, pages: 3, from: 1, to: 10, total: 23 });
    expect(pageInfo(23, 3, 10)).toEqual({ page: 3, pages: 3, from: 21, to: 23, total: 23 });
    expect(pageInfo(23, 9, 10).page).toBe(3);
    expect(pageInfo(23, 0, 10).page).toBe(1);
    expect(pageInfo(0, 1, 10)).toEqual({ page: 1, pages: 1, from: 0, to: 0, total: 0 });
  });
  it("pageWindow always shows first and last with gaps marked", () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
    expect(pageWindow(2, 10)).toEqual([1, 2, 3, null, 10]);
    expect(pageWindow(1, 1)).toEqual([1]);
  });
});

describe("selection", () => {
  const page = ["a", "b", "c"];
  it("reports none, some and all for the rows on the page", () => {
    expect(selectionState(page, [])).toBe("none");
    expect(selectionState(page, ["a"])).toBe("some");
    expect(selectionState(page, ["a", "b", "c", "z"])).toBe("all");
    expect(selectionState([], ["a"])).toBe("none");
  });
  it("select all adds the page and keeps other pages; again removes only this page", () => {
    expect(toggleAll(page, ["z"]).sort()).toEqual(["a", "b", "c", "z"]);
    expect(toggleAll(page, ["a", "b", "c", "z"])).toEqual(["z"]);
    expect(toggleAll(page, ["a"]).sort()).toEqual(["a", "b", "c"]);
    expect(toggleOne("a", ["a", "b"])).toEqual(["b"]);
    expect(toggleOne("c", ["a"])).toEqual(["a", "c"]);
  });
});

describe("toCsv", () => {
  it("quotes cells, doubles quotes and neutralises spreadsheet formulas", () => {
    const csv = toCsv(["ID", "Note"], [["A-1", 'say "hi"'], ["A-2", "=HYPERLINK(\"x\")"], ["A-3", "+1"], ["A-4", 7]]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe('"ID","Note"');
    expect(lines[1]).toBe('"A-1","say ""hi"""');
    expect(lines[2].startsWith('"A-2","\'=')).toBe(true);
    expect(lines[3]).toBe('"A-3","\'+1"');
    expect(lines[4]).toBe('"A-4","7"');
  });
});
