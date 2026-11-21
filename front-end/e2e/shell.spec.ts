import { test, expect } from "@playwright/test";
import { gotoModule, heading, openAs } from "./helpers";

test("bell opens a notifications dialog, an item opens its record, Mark all read can be undone", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/overview");
  const bell = p.getByRole("button", { name: /^Notifications, (\d+|9\+) unread$/ });
  await expect(bell).toBeVisible();

  await bell.click();
  const dlg = p.getByRole("dialog", { name: "Notifications" });
  await expect(dlg).toBeVisible();
  await expect(dlg.getByRole("tab", { name: /^All/ })).toHaveAttribute("aria-selected", "true");
  await dlg.getByRole("tab", { name: /^Approvals/ }).click();
  await expect(dlg.getByText("No notifications in this tab.")).toBeVisible();
  await dlg.getByRole("tab", { name: /^Alerts/ }).click();

  // mark all read: the badge goes, a toast offers Undo, Undo brings it back
  await dlg.getByRole("button", { name: "Mark all read" }).click();
  const toast = p.locator("#toast");
  await expect(toast).toContainText("All notifications marked read");
  await expect(dlg.getByText("You are all caught up")).toBeVisible();
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(dlg.getByText(/\d+ unread/)).toBeVisible();

  // an item opens the record to review and closes the panel; nothing is approved from here
  await dlg.getByRole("button", { name: /Review/ }).first().click();
  await expect(dlg).toBeHidden();
  await expect(p).toHaveURL(/\/ws\/(controls|issues|vendors)/);
  expect(s.errors).toEqual([]);
  await s.close();
});

test("a role with no matching modules has no unread badge; Escape closes the panel", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "employee");
  const p = s.page;
  await gotoModule(p, "/ws/work");
  const bell = p.getByRole("button", { name: "Notifications", exact: true });
  await expect(bell).toBeVisible();
  await bell.click();
  const dlg = p.getByRole("dialog", { name: "Notifications" });
  await expect(dlg.getByText("Nothing needs your attention right now.")).toBeVisible();
  await p.keyboard.press("Escape");
  await expect(dlg).toBeHidden();
  expect(s.errors).toEqual([]);
  await s.close();
});

test("keyboard shortcuts: Ctrl+/ lists them, Ctrl+J opens the AI Assistant, the Ask AI button is gated by role", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/overview");
  await p.keyboard.press("Control+/");
  const dlg = p.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dlg).toBeVisible();
  await expect(dlg.getByText("Open the AI Assistant")).toBeVisible();
  await p.keyboard.press("Escape");
  await p.keyboard.press("Control+j");
  await expect(p).toHaveURL(/\/ws\/assistant/);
  await expect(p.getByRole("button", { name: /^Ask AI/ })).toBeVisible();
  await s.close();

  const e = await openAs(browser, ti, "employee");
  await gotoModule(e.page, "/ws/work");
  await expect(e.page.getByRole("button", { name: /^Ask AI/ })).toHaveCount(0);
  await e.close();
});

test("the shell keeps one search landmark and a labelled primary nav, and the rail is 72px when collapsed", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/overview");
  await expect(p.getByRole("search")).toHaveCount(1);
  await expect(p.getByRole("navigation", { name: "Primary" }).or(p.locator("aside#sidebar[aria-label='Primary']"))).toHaveCount(1);
  await p.getByRole("button", { name: "Collapse sidebar" }).click();
  // the rail animates its width (about 200 ms), so wait for it to settle
  await expect.poll(() => p.locator("aside#sidebar").evaluate((el) => Math.round(el.getBoundingClientRect().width))).toBe(72);
  await s.close();
});

test("the old My Workspace address opens My Work on the Policies tab, and the breadcrumb root is the company's name", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "employee");
  const p = s.page;
  await p.goto("/ws/me");
  await expect(p).toHaveURL(/\/ws\/work\?tab=policies$/);
  await expect(heading(p)).toHaveText("My Work");
  const tabs = p.getByRole("tablist", { name: "My Work sections" });
  await expect(tabs.getByRole("tab", { name: "Policies" })).toHaveAttribute("aria-selected", "true");
  await expect(p.getByRole("tabpanel")).toContainText("Published policies");
  // the area is named after the company (demo: the seeded company), not "Workspace"
  const crumbs = p.getByRole("navigation", { name: "Breadcrumb" });
  await expect(crumbs.getByRole("link").first()).toHaveText("Northwind Payments");
  await expect(crumbs).toContainText("My Work");
  // the sidebar has no separate My Workspace entry; the group that holds Team & Rules is Settings
  await expect(p.getByRole("navigation", { name: "Company" })).toBeVisible();
  await expect(p.getByRole("navigation", { name: "Company" })).not.toContainText("My Workspace");
  expect(s.errors).toEqual([]);
  await s.close();

  const a = await openAs(browser, ti, "admin");
  await gotoModule(a.page, "/ws/team");
  const nav = a.page.getByRole("navigation", { name: "Company" });
  await expect(nav.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
  await expect(nav).toContainText("Team & Rules");
  await expect(heading(a.page)).toHaveText("Team & Rules");
  await a.close();
});
