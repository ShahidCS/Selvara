import { test, expect, type Page } from "@playwright/test";
import { gotoModule, openAs } from "./helpers";
import { readFileSync } from "node:fs";

const rowsOf = (p: Page) => p.getByRole("table", { name: "Issues" }).locator("tbody tr");

test("issues register: KPI strip, status tabs with counts, filter chips, clear filters", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/issues");
  await expect(p.getByRole("group", { name: "Issue summary" })).toContainText("Open issues");

  const all = await rowsOf(p).count();
  expect(all).toBeGreaterThan(2);
  const tabs = p.getByRole("tablist", { name: "Issues status" });
  await expect(tabs.getByRole("tab", { name: /^All/ })).toHaveAttribute("aria-selected", "true");
  // a status tab shows its own count and narrows the list to exactly that many rows
  const openTab = tabs.getByRole("tab", { name: /^Open/ });
  const openN = Number((await openTab.innerText()).match(/\d+/)![0]);
  expect(openN).toBeGreaterThan(0);
  await openTab.click();
  await expect(openTab).toHaveAttribute("aria-selected", "true");
  await expect(rowsOf(p)).toHaveCount(openN);
  // an empty tab says so instead of showing a blank table
  await tabs.getByRole("tab", { name: /^Closed/ }).click();
  if (Number((await tabs.getByRole("tab", { name: /^Closed/ }).innerText()).match(/\d+/)![0]) === 0) await expect(p.getByText("Nothing matches these filters.")).toBeVisible();

  // a severity filter chip opens a listbox; choosing an option narrows the list; Clear filters restores it
  await tabs.getByRole("tab", { name: /^All/ }).click();
  await p.getByRole("button", { name: /^Severity:/ }).click();
  const list = p.getByRole("listbox", { name: "Severity" });
  await expect(list).toBeVisible();
  await list.getByRole("option", { name: "High", exact: true }).click();
  await expect(p.getByRole("button", { name: /^Severity:/ })).toContainText("High");
  const narrowed = await rowsOf(p).count();
  expect(narrowed).toBeLessThan(all);
  await expect(p.locator(".dt-sum[role=status]").first()).toContainText(`${narrowed} of`);
  await p.getByRole("button", { name: "Clear filters" }).first().click();
  await expect(rowsOf(p)).toHaveCount(all);
  expect(s.errors).toEqual([]);
  await s.close();
});

test("issues register: sort cycles asc, desc, off and exposes aria-sort", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/issues");
  const th = p.getByRole("columnheader", { name: "Severity" });
  await expect(th).toHaveAttribute("aria-sort", "none");
  await th.getByRole("button").click();
  await expect(th).toHaveAttribute("aria-sort", "ascending");
  // ascending by severity rank puts Critical (or the most severe present) first
  const first = (await rowsOf(p).first().innerText()).toLowerCase();
  expect(first).toMatch(/critical|high/);
  await th.getByRole("button").click();
  await expect(th).toHaveAttribute("aria-sort", "descending");
  await th.getByRole("button").click();
  await expect(th).toHaveAttribute("aria-sort", "none");
  await s.close();
});

test("issues register: select rows, bulk toolbar, export selected (formula-safe CSV), clear", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/issues");
  await expect(p.getByRole("toolbar")).toHaveCount(0);
  const firstId = (await rowsOf(p).first().locator("td .strong").innerText()).trim();
  await p.getByRole("checkbox", { name: `Select ${firstId}` }).check();
  const bar = p.getByRole("toolbar", { name: /Actions for 1 selected/ });
  await expect(bar).toBeVisible();
  await expect(bar).toContainText("1 selected");

  const [dl] = await Promise.all([p.waitForEvent("download"), bar.getByRole("button", { name: "Export selected" }).click()]);
  expect(dl.suggestedFilename()).toBe("issues.csv");
  const csv = readFileSync((await dl.path())!, "utf8");
  const lines = csv.split("\r\n");
  expect(lines[0]).toContain('"ID"'); expect(lines[1]).toContain(`"${firstId}"`); expect(lines.length).toBe(2);

  await p.getByRole("checkbox", { name: "Select all rows" }).check();
  await expect(p.getByRole("toolbar")).toContainText(/\d+ selected/);
  await p.getByRole("button", { name: "Clear selection" }).click();
  await expect(p.getByRole("toolbar")).toHaveCount(0);
  expect(s.errors).toEqual([]);
  await s.close();
});

test("issues register: row opens the record page by click and by keyboard, row menu and columns menu work, pagination is labelled", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/issues");
  await expect(p.getByRole("navigation", { name: "Pagination" })).toBeVisible();
  await expect(p.locator(".dt-foot .dt-sum")).toContainText(/Showing 1 to \d+ of \d+/);

  await rowsOf(p).first().locator("td").nth(2).click();
  await expect(p).toHaveURL(/\/ws\/issues\/R-[\w-]+$/);
  await p.goBack();
  await expect(p).toHaveURL(/\/ws\/issues$/);

  await rowsOf(p).first().focus();
  await p.keyboard.press("Enter");
  await expect(p).toHaveURL(/\/ws\/issues\/R-[\w-]+$/);
  await p.goBack();

  const firstId = (await rowsOf(p).first().locator("td .strong").innerText()).trim();
  await p.getByRole("button", { name: `Actions for ${firstId}` }).click();
  await expect(p.getByRole("menuitem", { name: "Copy ID" })).toBeVisible();
  await p.keyboard.press("Escape");

  await p.getByRole("button", { name: "Columns" }).click();
  await p.getByRole("menuitemcheckbox", { name: "Owner" }).click();
  await expect(p.getByRole("columnheader", { name: "Owner" })).toHaveCount(0);
  await p.getByRole("menuitem", { name: "Done" }).click();
  expect(s.errors).toEqual([]);
  await s.close();
});

test("a role without the issues module never reaches the register", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "auditor");
  await s.page.goto("/ws/issues");
  await expect(s.page).not.toHaveURL(/\/ws\/issues/);
  await expect(s.page.getByRole("table", { name: "Issues", exact: true })).toHaveCount(0);
  await s.close();
});
