import { describe, expect, it } from "vitest";
import nav from "@/data/nav.json";
import { MODULE_TOURS } from "@/data/tours";

/* Every module in the sidebar has a guided tour, and every tour is short, plain and well formed. */
/** No DOM in unit tests: a structural check (allowed characters, balanced brackets, parentheses and quotes). The e2e tour test runs real ones. */
const selectorLooksValid = (sel: string) => {
  if (!/^[\w#.[\]="':\-() >,*^$|~+]+$/.test(sel)) return false;
  const count = (c: string) => sel.split(c).length - 1;
  return count("[") === count("]") && count("(") === count(")") && count('"') % 2 === 0;
};
const MODS = (["ws", "admin"] as const).flatMap((sp) => (nav.NAV[sp] as { items: string[][] }[]).flatMap((g) => g.items.map((i) => i[0])));
describe("guided tours", () => {
  it("cover every module in the sidebar", () => {
    expect(MODS.filter((m) => !MODULE_TOURS[m])).toEqual([]);
  });
  it.each(Object.entries(MODULE_TOURS))("%s: 3 to 12 steps, short text, valid selectors", (_mod, t) => {
    expect(Number.isInteger(t.version) && t.version >= 1).toBe(true);
    expect(t.steps.length).toBeGreaterThanOrEqual(3); expect(t.steps.length).toBeLessThanOrEqual(12);
    for (const s of t.steps) {
      expect(s.title.length).toBeGreaterThan(0); expect(s.title.length).toBeLessThanOrEqual(60);
      expect(s.body.length).toBeGreaterThan(0); expect(s.body.length).toBeLessThanOrEqual(260);
      if (s.target) expect(selectorLooksValid(s.target), s.target).toBe(true);
    }
  });
});
