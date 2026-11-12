import { test, expect } from "@playwright/test";
import { gotoModule, nextPush, openAs } from "./helpers";

/* Wave E: the settings group. Registers are tables, connectors are pages, and every create flow is a form page. */
test("integrations: KPI strip, connector table, a connector is a page", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/integrations");
  await expect(p.getByRole("group", { name: "Integration summary" })).toContainText("Sync health");
  const table = p.getByRole("table", { name: "Connectors", exact: true });
  await expect(table).toBeVisible();
  // the row buttons work on their own and do not open the page
  await table.getByRole("button", { name: /^Sync / }).first().click();
  await expect(p).toHaveURL(/\/ws\/integrations$/);
  await table.locator("tbody tr").first().locator("td").nth(1).click();
  await expect(p).toHaveURL(/\/ws\/integrations\/[^/]+$/);
  await expect(p.getByRole("heading", { level: 3, name: "Data use" })).toBeVisible();
  await p.getByRole("link", { name: "Integrations" }).first().click();
  await expect(p).toHaveURL(/\/ws\/integrations$/);
  await nextPush(p, "/ws/integrations/Nope");
  await expect(p.getByRole("heading", { level: 1, name: "Connector not found" })).toBeVisible();
  expect(s.errors).toEqual([]);
  await s.close();
});

test("api: the four tabs are tables; new key, webhook and test are pages; a read key is shown once in a dialog", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/api");
  await expect(p.getByRole("table", { name: "API keys", exact: true })).toBeVisible();

  await p.getByRole("button", { name: "New API key" }).click();
  await expect(p).toHaveURL(/\/ws\/api\/new-key$/);
  await p.getByRole("button", { name: "Create key" }).click();
  await expect(p.locator("#ak-err")).toContainText("Label is required.");
  await p.getByLabel(/^Label/).fill("Reporting service");
  await p.getByRole("button", { name: "Create key" }).click();
  await expect(p).toHaveURL(/\/ws\/api$/);
  const dlg = p.getByRole("dialog", { name: "API key created" });
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText("will not be shown again");
  await dlg.getByRole("button", { name: "Done" }).click();
  await expect(p.getByRole("table", { name: "API keys", exact: true })).toContainText("Reporting service");

  await p.getByRole("tab", { name: "Webhooks" }).click();
  await p.getByRole("button", { name: "Add webhook" }).click();
  await expect(p).toHaveURL(/\/ws\/api\/new-webhook$/);
  await p.getByLabel(/^Endpoint URL/).fill("http://insecure.example.com");
  await p.getByRole("button", { name: "Request webhook" }).click();
  await expect(p.locator("#wh-err")).toContainText("valid https URL");
  await p.getByLabel(/^Endpoint URL/).fill("https://hooks.example.com/grc");
  await p.getByRole("button", { name: "Request webhook" }).click();
  await expect(p).toHaveURL(/\/ws\/api$/);
  await p.getByRole("tab", { name: "Webhooks" }).click();
  await expect(p.getByRole("table", { name: "Webhooks", exact: true })).toContainText("hooks.example.com");

  await p.getByRole("tab", { name: "Custom tests" }).click();
  await expect(p.getByRole("table", { name: "Custom tests", exact: true })).toBeVisible();
  await p.getByRole("button", { name: "New custom test" }).click();
  await expect(p).toHaveURL(/\/ws\/api\/new-test$/);
  await p.getByRole("button", { name: "Create test" }).click();
  await expect(p.locator("#ct-err")).toContainText("Test name is required.");
  await p.getByRole("button", { name: "Cancel" }).click();
  await expect(p).toHaveURL(/\/ws\/api$/);
  await p.getByRole("tab", { name: "Event stream" }).click();
  await expect(p.getByRole("table", { name: "Event stream", exact: true })).toBeVisible();
  expect(s.errors).toEqual([]);
  await s.close();
});

test("team: members are a table, invite is a page, a bad email is announced", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/team");
  await expect(p.getByRole("table", { name: "Members", exact: true })).toBeVisible();
  await p.getByRole("button", { name: "Invite member" }).click();
  await expect(p).toHaveURL(/\/ws\/team\/invite$/);
  await p.getByLabel(/^Work email/).fill("not-an-email");
  await p.getByRole("button", { name: "Send invitation" }).click();
  await expect(p.locator("#ti-err")).toContainText("valid email");
  await p.getByLabel(/^Work email/).fill("new.person@example.test");
  await p.getByRole("button", { name: "Send invitation" }).click();
  await expect(p).toHaveURL(/\/ws\/team$/);
  await expect(p.getByText("new.person@example.test").first()).toBeVisible();
  expect(s.errors).toEqual([]);
  await s.close();
});

test("billing: KPI strip, invoices table, plan and payment are pages", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/billingws");
  await expect(p.getByRole("group", { name: "Billing summary" })).toContainText("Seats");
  await expect(p.getByRole("table", { name: "Invoices", exact: true })).toBeVisible();
  await p.getByRole("button", { name: "Update payment method" }).click();
  await expect(p).toHaveURL(/\/ws\/billingws\/payment$/);
  await expect(p.getByText(/Never enter a full card number/)).toBeVisible();
  await p.getByRole("button", { name: "Cancel" }).click();
  await expect(p).toHaveURL(/\/ws\/billingws$/);
  await p.getByRole("button", { name: "Manage plan" }).click();
  await expect(p).toHaveURL(/\/ws\/billingws\/plan$/);
  await expect(p.getByRole("radiogroup", { name: "Plan" })).toBeVisible();
  await p.getByRole("button", { name: "Cancel" }).click();
  expect(s.errors).toEqual([]);
  await s.close();
});

test("audit log: a table with category tabs and search; the chain view is unchanged", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/auditlog");
  const table = p.getByRole("table", { name: "Audit log", exact: true });
  await expect(table).toBeVisible();
  await expect(p.getByRole("status").filter({ hasText: /Chain intact/ })).toBeVisible();
  const all = await table.locator("tbody tr").count();
  expect(all).toBeGreaterThan(0);
  await p.getByRole("searchbox", { name: "Search Audit log" }).fill("zzz-nothing-matches");
  await expect.poll(() => table.locator("tbody tr").count()).toBeLessThan(all);
  expect(s.errors).toEqual([]);
  await s.close();
});
