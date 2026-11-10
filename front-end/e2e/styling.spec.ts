import { test, expect } from "@playwright/test";
import { gotoModule, openAs } from "./helpers";

/* Tailwind provides utilities only, and its class names can collide with the legacy classes in portal.css. The donut chart used to be called
   "ring", which is also a Tailwind utility; under Tailwind 4 that drew a 1px outline around every donut. This guards the rename. */
test("donut charts have no Tailwind ring outline", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  await gotoModule(s.page, "/ws/ai");
  // found by structure (the chart svg is labelled "NN percent"), not by class name, so a rename cannot hide a regression
  const donut = s.page.locator('main svg[role="img"][aria-label$="percent"]').first().locator("xpath=..");
  await expect(donut).toBeVisible();
  expect(await donut.evaluate((el) => getComputedStyle(el).boxShadow)).toBe("none");
  expect(s.errors).toEqual([]);
  await s.close();
});
