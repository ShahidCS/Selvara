import { test, expect, type Locator } from "@playwright/test";
import { gotoModule, openAs } from "./helpers";

/* Text inside cards is never flush against the card edge. */
const box = async (l: Locator) => (await l.boundingBox())!;

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
