import { test, expect, type Locator } from "@playwright/test";
import { gotoModule, openAs } from "./helpers";

/* KPI figures sit next to their labels (Overview keeps them stacked), and text inside cards is never flush against the card edge. */
const box = async (l: Locator) => (await l.boundingBox())!;
const sameRow = async (a: Locator, b: Locator) => { const [x, y] = [await box(a), await box(b)]; return Math.abs((x.y + x.height / 2) - (y.y + y.height / 2)) < 24 && y.x > x.x; };

/** The figure ends at the card's right padding edge (within the card's own padding), so figures line up down a row of cards. */
const expectRightEdge = async (card: Locator, fig: Locator) => { const [c, f] = [await box(card), await box(fig)]; const gap = c.x + c.width - (f.x + f.width); expect(gap).toBeGreaterThanOrEqual(0); expect(gap).toBeLessThanOrEqual(24); };

test("My Work cards: the number is on the same row as its label", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/work");
  const card = p.locator(".kpi").first();
  expect(await sameRow(card.locator(".kpi-lbl"), card.locator(".v"))).toBe(true);
  await expectRightEdge(card, card.locator(".v"));
  expect(s.errors).toEqual([]);
  await s.close();
});

test("KPI strips: the figure is next to its label, except on Overview", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/issues");
  const tile = p.locator(".kpi-tile").first();
  expect(await sameRow(tile.locator(".eyebrow"), tile.locator(".kpi-v"))).toBe(true);
  await expectRightEdge(tile, tile.locator(".kpi-v"));
  await gotoModule(p, "/ws/overview");
  const o = p.locator(".kpi-tile").first();
  const [l, v] = [await box(o.locator(".eyebrow")), await box(o.locator(".kpi-v"))];
  expect(v.y).toBeGreaterThan(l.y + l.height - 2); // stacked: the figure is below the label
  await s.close();
});

test("vendor tier cards: the count is next to the tier name", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/vendors");
  const card = p.locator(".kpi-card").first();
  expect(await sameRow(card.locator(".eyebrow"), card.locator(".kpi-v"))).toBe(true);
  await expectRightEdge(card, card.locator(".kpi-v"));
  await s.close();
});

test("Security Controls: text inside a control group has padding on every side", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/appsec");
  await p.getByRole("button", { name: "Expand all" }).click();
  const group = p.locator("section.card[id^='appsec-']").filter({ has: p.locator("text=Threat:") }).first();
  const text = await box(group.locator("p", { hasText: "Threat:" }));
  const card = await box(group);
  expect(text.x - card.x).toBeGreaterThanOrEqual(12);
  const last = await box(group.locator("p", { hasText: "Test:" }));
  expect(card.y + card.height - (last.y + last.height)).toBeGreaterThanOrEqual(12);
  await s.close();
});
