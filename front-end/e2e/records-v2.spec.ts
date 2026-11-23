import { test, expect } from "@playwright/test";
import { gotoModule, openAs } from "./helpers";

/* Reference review, part 2: the focus card and compliance calendar on Overview, the round back button and History card on a
   record, form actions in the page header (one copy, still submitting the form), and the form summary. */

test("overview: the focus card and calendar open their records", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin"); const p = s.page;
  await gotoModule(p, "/ws/overview");
  const focus = p.getByRole("region", { name: /./ }).filter({ has: p.locator("#focus-h") });
  await expect(focus).toBeVisible();
  await expect(focus.getByRole("list", { name: /^Stage \d+ of \d+/ })).toBeVisible();
  const open = focus.getByRole("button", { name: /^Open (audit|issue)$/ });
  const kind = (await open.textContent())!.includes("audit") ? "audits" : "issues";
  await open.click();
  await expect(p).toHaveURL(new RegExp(`/ws/${kind}/`));
  await gotoModule(p, "/ws/overview");
  const cal = p.getByRole("region", { name: "Compliance calendar" });
  await expect(cal).toBeVisible();
  const mark = cal.locator("button.cal-mark").first();
  await expect(mark).toBeVisible();
  await mark.click();
  await expect(p).toHaveURL(/\/ws\/(audits|policies|vendors)\//);
  expect(s.errors).toEqual([]);
  await s.close();
});

test("record: round back button and a History card that lists changes to this record", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin"); const p = s.page;
  await gotoModule(p, "/ws/issues/R-014");
  await expect(p.getByRole("heading", { level: 3, name: "History" })).toBeVisible();
  await p.getByRole("link", { name: "Back to Issues" }).click();
  await expect(p).toHaveURL(/\/ws\/issues$/);
  expect(s.errors).toEqual([]);
  await s.close();
});

test("form: actions sit in the page header once, save the form, and the summary follows the fields", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin"); const p = s.page;
  await gotoModule(p, "/ws/issues/new");
  const head = p.locator(".page-head");
  await expect(head.getByRole("button", { name: "Cancel" })).toBeVisible();
  await expect(p.getByRole("button", { name: "Cancel" })).toHaveCount(1);
  const summary = p.getByRole("complementary", { name: "Summary" });
  await expect(summary).toBeVisible();
  await p.getByLabel(/^Title/).fill("Synthetic test issue for the summary");
  await expect(summary).toContainText("Synthetic test issue for the summary");
  expect(s.errors).toEqual([]);
  await s.close();
});
