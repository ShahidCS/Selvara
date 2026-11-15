import { test, expect, type Page } from "@playwright/test";
import { gotoModule, nextPush, openAs } from "./helpers";

/* Wave C: dashboards use the shared KPI strip and charts; the frameworks library is a register and a framework is a page. */
const charts = (p: Page) => p.locator("figure.chart");

test("overview: KPI strip, line chart and ranked bars carry their numbers in text, and the layout is the standard page", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/overview");
  const kpis = p.getByRole("group", { name: "Posture summary" });
  await expect(kpis).toContainText("Weighted compliance");
  await expect(kpis).toContainText("Open risks");
  await expect(kpis).toContainText("Vendor reviews due");
  expect(await charts(p).count()).toBeGreaterThanOrEqual(3);
  // each chart has a caption, a summary and a data table for screen readers
  const line = p.getByRole("group", { name: /Open risks over the last 7 months/ });
  await expect(line).toBeVisible();
  expect(await p.locator("figure.chart table.vh").count()).toBeGreaterThanOrEqual(3);
  await expect(p.getByRole("group", { name: /Control coverage/ })).toBeVisible();
  expect(s.errors).toEqual([]);
  await s.close();
});

test("reports: KPI strip and the readiness trend chart", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/reports");
  await expect(p.getByRole("group", { name: "Reporting summary" })).toContainText("Scheduled packs");
  await expect(p.getByRole("group", { name: /Weighted compliance over the last 7 months/ })).toBeVisible();
  expect(s.errors).toEqual([]);
  await s.close();
});

test("risk dashboard: KPI strip and the rating donut say their numbers in text", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/risk");
  await expect(p.getByRole("group", { name: "Risk summary" })).toContainText("Above appetite");
  const donut = p.getByRole("img", { name: /Current rating of open risks/ });
  await expect(donut).toBeVisible();
  await expect(p.locator("figure.chart ul.legend")).toContainText("Extreme");
  expect(s.errors).toEqual([]);
  await s.close();
});

test("frameworks: the library is a table, a framework is a page with requirement status as a chart, add is a page", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/frameworks");
  const table = p.getByRole("table", { name: "Frameworks", exact: true });
  await expect(table).toBeVisible();
  await expect(p.getByRole("group", { name: "Library summary" })).toContainText("Average readiness");
  const all = await table.locator("tbody tr").count();
  await p.getByRole("searchbox", { name: "Search Frameworks" }).fill("ISO");
  await expect.poll(() => table.locator("tbody tr").count()).toBeLessThan(all);
  await p.getByRole("searchbox", { name: "Search Frameworks" }).fill("");
  await expect(table.locator("tbody tr")).toHaveCount(all);

  // the scope toggle works on its own and does not open the row
  const scope = table.getByRole("button", { name: /out of scope|in scope/i }).first();
  const before = await scope.getAttribute("aria-pressed");
  await scope.click();
  await expect(p).toHaveURL(/\/ws\/frameworks$/);
  await expect(scope).not.toHaveAttribute("aria-pressed", before!);
  await scope.click();

  await table.locator("tbody tr").first().locator("td").nth(1).click();
  await expect(p).toHaveURL(/\/ws\/frameworks\/[^/]+$/);
  await expect(p.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible();
  await expect(p.getByRole("group", { name: "Framework summary" })).toContainText("Readiness");
  await expect(p.getByRole("img", { name: /Requirements by status/ })).toBeVisible();
  await p.getByRole("link", { name: "Frameworks" }).first().click();
  await expect(p).toHaveURL(/\/ws\/frameworks$/);

  await p.getByRole("button", { name: "Add framework" }).click();
  await expect(p).toHaveURL(/\/ws\/frameworks\/new$/);
  await expect(p.getByRole("heading", { level: 1, name: /Add a regulation/ })).toBeVisible();
  await nextPush(p, "/ws/frameworks/NOPE-1");
  await expect(p.getByRole("heading", { level: 1, name: "Framework not found" })).toBeVisible();
  expect(s.errors).toEqual([]);
  await s.close();
});
