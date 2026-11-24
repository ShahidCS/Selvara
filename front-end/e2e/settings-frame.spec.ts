import { test, expect } from "@playwright/test";
import { gotoModule, openAs } from "./helpers";

/* Reference review R37 and R38: the company's settings as one page with a left menu (old addresses still work) and read-first key-value cards. */
test("settings: one sidebar entry, a left menu across the settings pages, and old addresses still open", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin"); const p = s.page;
  await gotoModule(p, "/ws/overview");
  const side = p.getByRole("navigation", { name: "Company" });
  await side.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(p).toHaveURL(/\/ws\/team$/);
  const menu = p.getByRole("navigation", { name: "Settings" });
  for (const name of ["Team & Rules", "Billing & Invoices", "Integrations", "API, Webhooks & Custom Tests", "AI Assistant", "Security Controls", "Audit Logs", "Your account"]) await expect(menu.getByRole("link", { name })).toBeVisible();
  await menu.getByRole("link", { name: "Integrations" }).click();
  await expect(p).toHaveURL(/\/ws\/integrations$/);
  await expect(menu.getByRole("link", { name: "Integrations" })).toHaveAttribute("aria-current", "page");
  await expect(side.getByRole("button", { name: "Settings", exact: true })).toHaveAttribute("aria-current", "page");
  await gotoModule(p, "/ws/auditlog"); // an old address
  await expect(p.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Audit Logs" })).toHaveAttribute("aria-current", "page");
  await gotoModule(p, "/ws/controls"); // not a settings page: no settings menu
  await expect(p.getByRole("navigation", { name: "Settings" })).toHaveCount(0);
  expect(s.errors).toEqual([]);
  await s.close();
});

test("settings: a role sees only the settings it can open; review settings read first and Edit opens the fields", async ({ browser }, ti) => {
  const o = await openAs(browser, ti, "owner"); // an owner opens Security Controls only
  await gotoModule(o.page, "/ws/appsec");
  const menu = o.page.getByRole("navigation", { name: "Settings" });
  await expect(menu.getByRole("link")).toHaveText(["Security Controls", "Your account"]);
  await o.close();
  const s = await openAs(browser, ti, "admin"); const p = s.page;
  await gotoModule(p, "/ws/team");
  await p.getByRole("tab", { name: "Review cycles & SLAs" }).click();
  const card = p.getByRole("region", { name: "Review cycles, appetite and SLAs" });
  await expect(card.getByRole("definition").first()).not.toBeEmpty();
  await card.getByRole("button", { name: "Edit: Review cycles, appetite and SLAs" }).click();
  await p.getByLabel("Standard remediation SLA").fill("21 days");
  await p.getByRole("button", { name: "Done" }).click();
  await expect(p.getByRole("region", { name: "Review cycles, appetite and SLAs" })).toContainText("21 days");
  expect(s.errors).toEqual([]);
  await s.close();
});
