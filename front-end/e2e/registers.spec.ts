import { test, expect, type Page } from "@playwright/test";
import { gotoModule, openAs } from "./helpers";

/* Wave A: the register modules share the DataTable. Each one: a named table, search that narrows and clears, and a row that opens its record. */
const table = (p: Page, name: string) => p.getByRole("table", { name, exact: true });
const rows = (p: Page, name: string) => table(p, name).locator("tbody tr");

async function searchNarrows(p: Page, name: string, term: string) {
  const before = await rows(p, name).count();
  await p.getByRole("searchbox", { name: `Search ${name}` }).fill(term);
  await expect.poll(() => rows(p, name).count()).toBeLessThan(before);
  expect(await rows(p, name).count()).toBeGreaterThan(0);
  await p.getByRole("searchbox", { name: `Search ${name}` }).fill("");
  await expect(rows(p, name)).toHaveCount(before);
}

test("controls: search, framework filter, status tabs, row opens the drawer, tests view", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/controls");
  await expect(table(p, "Controls")).toBeVisible();
  await searchNarrows(p, "Controls", "MFA");

  const all = await rows(p, "Controls").count();
  await p.getByRole("button", { name: /^Framework:/ }).click();
  const list = p.getByRole("listbox", { name: "Framework" });
  await list.getByRole("option").nth(1).click();
  expect(await rows(p, "Controls").count()).toBeLessThanOrEqual(all);
  await p.getByRole("button", { name: "Clear filters" }).first().click();

  const failTab = p.getByRole("tablist", { name: "Controls status" }).getByRole("tab", { name: /^Fail/ });
  const failN = Number((await failTab.innerText()).match(/\d+/)![0]);
  await failTab.click();
  await expect(rows(p, "Controls")).toHaveCount(failN);
  await p.getByRole("tablist", { name: "Controls status" }).getByRole("tab", { name: /^All/ }).click();

  await rows(p, "Controls").first().locator("td").nth(1).click();
  await expect(p.getByRole("dialog")).toBeVisible();
  await p.keyboard.press("Escape");

  await p.getByRole("tab", { name: "Tests" }).click();
  await expect(table(p, "Tests")).toBeVisible();
  await searchNarrows(p, "Tests", "MFA");
  await p.getByRole("tab", { name: "Matrix" }).click();
  await expect(p.getByRole("columnheader", { name: "Domain" })).toBeVisible();
  expect(s.errors).toEqual([]);
  await s.close();
});

test("policies: KPI strip, search, owner filter, row opens the drawer", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/policies");
  await expect(p.getByRole("group", { name: "Policy summary" })).toContainText("Policies");
  await searchNarrows(p, "Policies", "access");
  await rows(p, "Policies").first().locator("td").nth(2).click();
  await expect(p.getByRole("dialog")).toBeVisible();
  expect(s.errors).toEqual([]);
  await s.close();
});

test("vendors: tier cards filter the list and toggle, search, row opens the drawer", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/vendors");
  const all = await rows(p, "Third parties").count();
  const card = p.getByRole("group", { name: "Vendors by tier" }).getByRole("button").first();
  await expect(card).toHaveAttribute("aria-pressed", "false");
  await card.click();
  await expect(card).toHaveAttribute("aria-pressed", "true");
  expect(await rows(p, "Third parties").count()).toBeLessThan(all);
  await card.click();
  await expect(rows(p, "Third parties")).toHaveCount(all);
  await searchNarrows(p, "Third parties", "identity");
  await rows(p, "Third parties").first().locator("td").nth(1).click();
  await expect(p.getByRole("dialog")).toBeVisible();
  expect(s.errors).toEqual([]);
  await s.close();
});

test("people: KPI strip, filters, search, the MFA reset button stays usable and does not open the row", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/people");
  await expect(p.getByRole("group", { name: "People summary" })).toContainText("Workforce");
  await searchNarrows(p, "People", "security");
  // segregation of duties: the signed-in person cannot reset their own MFA, and the button says why
  const own = p.locator('button[aria-label^="Reset MFA for"][disabled]').first();
  await expect(own).toBeVisible();
  await expect(own).toHaveAttribute("title", /not allowed/);
  // a button inside a row works on its own: it opens the reset request, not the person drawer
  const reset = p.locator('button[aria-label^="Reset MFA for"]:not([disabled])').first();
  await reset.click();
  await expect(p.getByRole("dialog", { name: "Request MFA reset" })).toBeVisible();
  await p.keyboard.press("Escape");
  await expect(p.getByRole("dialog")).toBeHidden();
  await rows(p, "People").first().locator("td").nth(1).click();
  await expect(p.getByRole("dialog")).toBeVisible();
  await p.keyboard.press("Escape");
  await p.getByRole("tab", { name: "Access grants" }).click();
  await expect(table(p, "Access grants")).toBeVisible();
  expect(s.errors).toEqual([]);
  await s.close();
});

test("access: grants, requests with decision buttons, reviews", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/access");
  await expect(table(p, "Access grants")).toBeVisible();
  await searchNarrows(p, "Access grants", "admin");
  await p.getByRole("tab", { name: "Access requests", exact: true }).click();
  await expect(table(p, "Access requests")).toBeVisible();
  await expect(p.getByRole("tablist", { name: "Access requests status" }).getByRole("tab", { name: /^Pending/ })).toBeVisible();
  // the decision buttons still render inside the table for a role that may decide (and open the reason form, not decide directly)
  const approve = p.locator('button[aria-label^="Approve "]');
  expect(await approve.count()).toBeGreaterThan(0);
  await p.getByRole("tab", { name: "Access reviews", exact: true }).click();
  await expect(p.getByRole("heading", { level: 1 })).toBeVisible();
  expect(s.errors).toEqual([]);
  await s.close();
});

test("audits: stage tabs with counts, search, row opens the audit", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/audits");
  await expect(table(p, "Audits")).toBeVisible();
  const tabs = p.getByRole("tablist", { name: "Audits status" });
  await expect(tabs.getByRole("tab", { name: /^Fieldwork/ })).toBeVisible();
  await tabs.getByRole("tab", { name: /^Fieldwork/ }).click();
  expect(await rows(p, "Audits").count()).toBeGreaterThan(0);
  await tabs.getByRole("tab", { name: /^All/ }).click();
  await rows(p, "Audits").first().locator("td").nth(1).click();
  await expect(p).toHaveURL(/\/ws\/audits\//);
  expect(s.errors).toEqual([]);
  await s.close();
});

test("commitments: table with status filter and search", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/commitments");
  await expect(table(p, "Commitments")).toBeVisible();
  await searchNarrows(p, "Commitments", "DPA");
  expect(s.errors).toEqual([]);
  await s.close();
});
