import { test, expect } from "@playwright/test";
import { gotoModule, openAs } from "./helpers";

/* Wave F: the Admin Console and the vendor portal take the tokens and templates; their registers use the shared table. */
test("admin: rates is a table with a summary strip and filters", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "super");
  const p = s.page;
  await gotoModule(p, "/admin/rates");
  await expect(p.getByRole("group", { name: "Rates summary" })).toContainText("Held for review");
  const table = p.getByRole("table", { name: "Exchange rates and tax", exact: true });
  await expect(table).toBeVisible();
  const all = await table.locator("tbody tr").count();
  await p.getByRole("searchbox", { name: /Search/ }).first().fill("Egypt");
  expect(await table.locator("tbody tr").count()).toBeLessThan(all);
  expect(s.errors).toEqual([]);
  await s.close();
});

test("admin: the admin log is a table with a chain summary", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "super");
  const p = s.page;
  await gotoModule(p, "/admin/adminlog");
  await expect(p.getByRole("group", { name: "Admin log summary" })).toContainText("Intact");
  await expect(p.getByRole("table", { name: "Admin audit log", exact: true })).toBeVisible();
  await p.getByRole("tab", { name: "Chain integrity" }).click();
  await expect(p.getByRole("table", { name: "Admin audit log", exact: true })).toHaveCount(0);
  expect(s.errors).toEqual([]);
  await s.close();
});

test("vendor portal: a progress stepper follows the steps and the page carries no hard-coded colours", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await p.goto("/vendor-portal");
  const steps = p.getByRole("list", { name: "Progress through the assessment" });
  await expect(steps.locator("li[aria-current=step]")).toContainText("Confirm email");
  await p.locator("input").first().fill("contact@vendor.example");
  await p.locator("button", { hasText: /Continue/ }).first().click();
  await expect(steps.locator("li[aria-current=step]")).toContainText("Enter code");
  const hex = await p.evaluate(() => Array.from(document.querySelectorAll("[style]")).filter((e) => /#[0-9a-f]{3,6}\b/i.test(e.getAttribute("style") || "")).length);
  expect(hex).toBe(0);
  await s.close();
});
