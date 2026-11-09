import { test, expect } from "@playwright/test";
import { enabledButtons, gotoModule, openAs, pathOf } from "./helpers";

/* (d) employee / auditor are read-only on the modules they can open, and cannot open the rest. */
test("employee: no enabled policy edit/approve/publish controls", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "employee");
  await gotoModule(s.page, "/ws/policies");
  expect(await enabledButtons(s.page, /^(New policy|Add|Edit|Approve|Publish|Submit|Delete|Reassign)/i)).toEqual([]);
  expect(s.errors).toEqual([]);
  await s.close();
});

test("employee: cannot decide access requests", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "employee");
  await gotoModule(s.page, "/ws/access");
  const tab = s.page.locator("main button", { hasText: /Access requests/ }).first();
  if (await tab.count()) await tab.click();
  expect(await enabledButtons(s.page, /^(Approve|Deny|Reject|Decide|Create review)/i)).toEqual([]);
  await s.close();
});

test("employee: cannot open the Risk Register", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "employee");
  await s.page.goto("/ws/risk");
  await expect(s.page).toHaveURL(/\/ws\/(overview|me)$/);
  await s.close();
});

test("auditor: no enabled management actions on an audit", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "auditor");
  await gotoModule(s.page, "/ws/audits/AUD-01");
  expect(pathOf(s.page)).toBe("/ws/audits/AUD-01");
  expect(await enabledButtons(s.page, /(Advance stage|Send to auditor|Freeze|Complete|Create issue|End access|New audit|Advance)/i)).toEqual([]);
  await s.close();
});

test("auditor: policies are read-only", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "auditor");
  await gotoModule(s.page, "/ws/policies");
  expect(await enabledButtons(s.page, /^(New policy|Add|Edit|Approve|Publish)/i)).toEqual([]);
  await s.close();
});

test("auditor: cannot open the Risk Register or admin space", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "auditor");
  await s.page.goto("/ws/risk");
  await expect(s.page).not.toHaveURL(/\/ws\/risk$/);
  await s.page.goto("/admin/customers");
  await expect(s.page).not.toHaveURL(/\/admin\//);
  await s.close();
});
