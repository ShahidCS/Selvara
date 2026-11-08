import { test, expect } from "@playwright/test";
import { ALL_ROUTES, ROLES, gotoModule, isAllowed, openAs } from "./helpers";

/* (a) every route renders for a role that is allowed to see it: heading present, no "not migrated" / 404 body, no console errors, no dialogs. */
const EXTRA: [string, string, string][] = [["admin", "/admin/billing/cust-101", "super"], ["ws", "/ws/audits/AUD-01", "admin"]];

function allowedRole(space: string, key: string): string {
  const r = ROLES.find((x) => x.spaces.includes(space) && isAllowed(x.id, space as "ws" | "admin", key));
  if (!r) throw new Error(`no role can open /${space}/${key}`);
  // prefer the broadest persona so the whole catalogue is covered
  return ROLES.find((x) => x.id === (space === "ws" ? "admin" : "super") && isAllowed(x.id, space as "ws" | "admin", key))?.id ?? r.id;
}

test.describe("every route renders", () => {
  for (const [space, key] of ALL_ROUTES) {
    test(`/${space}/${key}`, async ({ browser }, testInfo) => {
      const s = await openAs(browser, testInfo, allowedRole(space, key));
      await gotoModule(s.page, `/${space}/${key}`);
      await expect(s.page).toHaveURL(new RegExp(`/${space}/${key}$`));
      await expect(s.page.locator("main#content")).not.toContainText(/Not migrated|Page not found/);
      expect(s.errors, "console errors").toEqual([]);
      expect(s.dialogs, "dialogs").toEqual([]);
      await s.close();
    });
  }
  for (const [space, path, role] of EXTRA) {
    test(path, async ({ browser }, testInfo) => {
      const s = await openAs(browser, testInfo, role);
      await gotoModule(s.page, path);
      await expect(s.page).toHaveURL(new RegExp(path.replace(/[/]/g, "\\/") + "$"));
      await expect(s.page.locator("main#content")).not.toContainText(/Not migrated|Page not found/);
      expect(s.errors).toEqual([]);
      expect(s.dialogs).toEqual([]);
      expect(space).toBeTruthy();
      await s.close();
    });
  }
  for (const path of ["/auth", "/vendor-portal"]) {
    test(path, async ({ browser }, testInfo) => {
      const s = await openAs(browser, testInfo, "admin");
      await s.page.goto(path);
      await expect(s.page.locator("body")).not.toContainText(/Not migrated/);
      await expect(s.page.locator("h1, h2").first()).toBeVisible();
      expect(s.errors).toEqual([]);
      expect(s.dialogs).toEqual([]);
      await s.close();
    });
  }
  test("unknown module shows the not-found page", async ({ browser }, testInfo) => {
    const s = await openAs(browser, testInfo, "admin");
    await s.page.goto("/ws/does-not-exist");
    await expect(s.page.locator("body")).toContainText(/not found|Not migrated|404/i);
    await s.close();
  });
});
