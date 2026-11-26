import { test, expect } from "@playwright/test";
import { gotoModule, openAs } from "./helpers";

/* Mapping views as the original sources showed them: the cross-framework matrix, a control's requirements grouped by framework, and a
   requirement's mapped controls. */
test("matrix: chosen catalogues as columns, a cell lists the requirements it counts, and both ends link through", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/controls");
  await p.getByRole("tab", { name: "Cross-framework matrix" }).click();
  const m = p.getByRole("table", { name: "Cross-framework matrix", exact: true });
  await expect(m).toBeVisible();

  // six catalogues by default (the most mapped), and a column comes and goes with its chip
  const pick = p.getByRole("group", { name: "Catalogues shown as columns" });
  await expect(pick.locator('button[aria-pressed="true"]')).toHaveCount(6);
  const off = pick.locator('button[aria-pressed="false"]').first();
  await off.click();
  await expect(pick.locator('button[aria-pressed="true"]')).toHaveCount(7);
  await pick.locator('button[aria-pressed="true"]').last().click();
  await expect(pick.locator('button[aria-pressed="true"]')).toHaveCount(6);

  // a cell names the control, its status and the count; opening it lists requirement ids with titles
  await p.getByRole("searchbox", { name: "Search Cross-framework matrix" }).fill("GOV-1");
  const cell = m.getByRole("button", { name: /^GOV-1 \(Pass\) satisfies \d+ ISO 27001 requirements/ });
  await cell.click();
  const drawer = p.getByRole("dialog");
  await expect(drawer).toContainText("Approve, publish and review security policies");
  await drawer.getByRole("button", { name: "Open control" }).click();
  await expect(p).toHaveURL(/\/ws\/controls\/GOV-1$/);

  // the control page: requirements grouped by framework; a requirement id opens it on the framework page
  const card = p.locator('[data-tour="control-mappings"]');
  await expect(card.getByRole("heading", { name: "Requirements satisfied" })).toBeVisible();
  await expect(card.getByRole("button", { name: "ISO/IEC 27001:2022" })).toBeVisible();
  await card.getByRole("button", { name: "Open ISO 27001 requirement A.5.1" }).click();
  await expect(p).toHaveURL(/\/ws\/frameworks\/iso27001$/);

  // the requirement, opened: its mapped controls with title and status
  const mapped = p.getByRole("list", { name: "Controls mapped to A.5.1" });
  await expect(mapped.getByRole("button", { name: "Open control GOV-1" })).toBeVisible();
  await expect(mapped).toContainText("Security policies are approved, published and accepted");
  expect(s.errors).toEqual([]);
  await s.close();
});
