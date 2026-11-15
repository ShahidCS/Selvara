import { test, expect } from "@playwright/test";
import { gotoModule, openAs } from "./helpers";

/* Phase 6: display preferences (density) and print. */
test("density: Compact tightens table rows, is saved, and Comfortable restores it", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/issues");
  const cell = p.locator("table.tbl tbody td").first();
  const comfy = await cell.evaluate((e) => parseFloat(getComputedStyle(e).paddingTop));
  await p.getByRole("button", { name: /^Account:/ }).click();
  const item = p.getByRole("menuitemcheckbox", { name: "Compact density" });
  await expect(item).toHaveAttribute("aria-checked", "false");
  await item.click();
  await expect(p.locator("html")).toHaveAttribute("data-density", "compact");
  const tight = await cell.evaluate((e) => parseFloat(getComputedStyle(e).paddingTop));
  expect(tight).toBeLessThan(comfy);
  // saved with the other display choices (the helper rewrites storage on every load, so a reload would not show it; loading is unit-tested)
  expect(await p.evaluate(() => JSON.parse(localStorage.getItem("assurance.v1") || "{}").density)).toBe("compact");
  await p.getByRole("button", { name: /^Account:/ }).click();
  await expect(p.getByRole("menuitemcheckbox", { name: "Compact density" })).toHaveAttribute("aria-checked", "true");
  await p.getByRole("menuitemcheckbox", { name: "Compact density" }).click();
  await expect(p.locator("html")).toHaveAttribute("data-density", "comfortable");
  expect(s.errors).toEqual([]);
  await s.close();
});

test("print: no rail, bar or buttons, no inner scrolling, and the dark theme prints light", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await p.addInitScript(() => { try { localStorage.setItem("assurance.v1", JSON.stringify({ role: "admin", collapsed: false, theme: "dark", signedIn: true })); } catch { /* ignore */ } });
  await gotoModule(p, "/ws/issues");
  await expect(p.locator("html")).toHaveAttribute("data-theme", "dark");
  await p.emulateMedia({ media: "print" });
  await expect(p.locator("#sidebar")).toBeHidden();
  await expect(p.locator("#topbar")).toBeHidden();
  await expect(p.locator(".page-head .acts")).toBeHidden();
  expect(await p.locator("main#content").evaluate((e) => getComputedStyle(e).overflowY)).toBe("visible");
  // the app switches to the light theme on beforeprint and restores it afterwards
  await p.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await expect(p.locator("html")).toHaveAttribute("data-theme", "light");
  await p.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(p.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(s.errors).toEqual([]);
  await s.close();
});
