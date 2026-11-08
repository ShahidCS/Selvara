import { test, expect } from "@playwright/test";
import { ALL_ROUTES, ROLES, heading, isAllowed, openAs, pathOf } from "./helpers";

/* (b) role x route matrix, generated from src/data/roles.json and nav.json. Allowed routes must stay put; denied routes must redirect away. */
test.describe("role x route access matrix", () => {
  for (const role of ROLES) {
    test(`${role.id} (${role.name})`, async ({ browser }, testInfo) => {
      test.setTimeout(120_000);
      const s = await openAs(browser, testInfo, role.id, { width: 1280, height: 800 });
      const mismatches: string[] = [];
      for (const [space, key] of ALL_ROUTES) {
        const want = `/${space}/${key}`;
        const allowed = isAllowed(role.id, space, key);
        await s.page.goto(want);
        if (allowed) {
          await expect(heading(s.page)).toBeVisible();
          if (pathOf(s.page) !== want) mismatches.push(`${want} expected allow, landed ${pathOf(s.page)}`);
        } else {
          await expect(s.page).not.toHaveURL(new RegExp(`${want}$`));
          if (pathOf(s.page) === want) mismatches.push(`${want} expected deny, stayed`);
        }
      }
      expect(mismatches).toEqual([]);
      expect(s.errors).toEqual([]);
      await s.close();
    });
  }

  test("matrix is not vacuous: both allow and deny cases exist", () => {
    const allowed = ROLES.flatMap((r) => ALL_ROUTES.filter(([sp, k]) => isAllowed(r.id, sp, k)));
    expect(allowed.length).toBeGreaterThan(50);
    expect(allowed.length).toBeLessThan(ROLES.length * ALL_ROUTES.length);
  });
});
