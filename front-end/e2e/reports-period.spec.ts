import { test, expect } from "@playwright/test";
import { gotoModule, openAs } from "./helpers";

/* Reference review R34, R35 and R5: the reporting period shared by Reports and the Overview, the richer charts, and the phone tab bar.
   Demonstration build: trends are synthetic history ending at today's figures. Synthetic data only. */
const PHONE = { width: 390, height: 844 };

test("reports: the period control changes the figures and the Overview's trend follows it", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin"); const p = s.page;
  await gotoModule(p, "/ws/reports");
  const period = p.getByRole("radiogroup", { name: "Period" });
  await expect(period.getByRole("radio", { name: "30 days" })).toHaveAttribute("aria-checked", "true");
  await expect(p.locator(".page-eyebrow")).toContainText(/Reports · \d+ \w+ to \d+ \w+/);
  for (const name of ["Weighted compliance", "Issues closed and opened", "Framework readiness", "Open issues by severity"]) await expect(p.getByRole("heading", { level: 3, name })).toBeVisible();
  await expect(p.getByRole("group", { name: /Issues closed and opened.*This week: closed/ })).toBeVisible();
  await expect(p.getByText("Target 80%").first()).toBeVisible();
  await period.getByRole("radio", { name: "Quarter" }).click();
  await expect(p.locator(".page-eyebrow")).toContainText(/Q[1-4] to date/);
  await expect(p.getByRole("group", { name: /This month: closed/ })).toBeVisible();
  // keyboard: arrows move within the group
  await period.getByRole("radio", { name: "Quarter" }).focus(); await p.keyboard.press("ArrowLeft");
  await expect(period.getByRole("radio", { name: "30 days" })).toHaveAttribute("aria-checked", "true");
  await period.getByRole("radio", { name: "7 days" }).click();
  await gotoModule(p, "/ws/overview");
  await expect(p.getByRole("radiogroup", { name: "Trend period" }).getByRole("radio", { name: "7 days" })).toHaveAttribute("aria-checked", "true");
  await expect(p.getByText(/Open risks, \d+ \w+ to \d+ \w+/).first()).toBeAttached();
  expect(s.errors).toEqual([]);
  await s.close();
});

test("phone: the bottom tab bar reaches the main places, More opens the menu, and nothing scrolls sideways", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin", PHONE); const p = s.page;
  await gotoModule(p, "/ws/reports");
  expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const bar = p.getByRole("navigation", { name: "Main" });
  await expect(bar).toBeVisible();
  await expect(bar.getByRole("link")).toHaveText([/Overview/, /My Work/, /Issues/, /Risks/]);
  await expect(bar.getByRole("link", { name: /Issues, \d+ open/ })).toBeVisible();
  await bar.getByRole("link", { name: /Issues/ }).click();
  await expect(p).toHaveURL(/\/ws\/issues$/);
  await expect(bar.getByRole("link", { name: /Issues/ })).toHaveAttribute("aria-current", "page");
  const more = bar.getByRole("button", { name: "More" });
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await expect(p.locator("aside#sidebar")).toBeVisible();
  await p.keyboard.press("Escape");
  await expect(more).toHaveAttribute("aria-expanded", "false");
  expect(s.errors).toEqual([]);
  await s.close();
});

test("tab bar: only places the role can open, the Admin Console's own places, and none on a wide screen", async ({ browser }, ti) => {
  const e = await openAs(browser, ti, "employee", PHONE);
  await gotoModule(e.page, "/ws/work");
  const links = await e.page.getByRole("navigation", { name: "Main" }).getByRole("link").allTextContents();
  expect(links.join(" ")).not.toMatch(/Issues|Risks/);
  await e.close();
  const a = await openAs(browser, ti, "super", PHONE);
  await gotoModule(a.page, "/admin/customers");
  await expect(a.page.getByRole("navigation", { name: "Main" }).getByRole("link").first()).toHaveText("Customers");
  await a.close();
  const d = await openAs(browser, ti, "admin");
  await gotoModule(d.page, "/ws/overview");
  await expect(d.page.locator("nav.tabbar")).toBeHidden();
  await d.close();
});
