import { test, expect } from "@playwright/test";
import { openAs } from "./helpers";

/* (e) live password policy on /auth > Set password. The policy itself is unit-tested; this proves the UI wires it up. */
test.describe("password policy on /auth", () => {
  test.beforeEach(async ({}, ti) => { ti.setTimeout(45_000); });

  const setup = async (browser: import("@playwright/test").Browser, ti: import("@playwright/test").TestInfo) => {
    const s = await openAs(browser, ti, "admin");
    await s.page.goto("/auth");
    await s.page.locator('[role=tab], button', { hasText: /^Set password$/ }).first().click();
    const pw = s.page.locator("input[type=password]").first();
    await expect(pw).toBeVisible();
    return { s, pw, status: s.page.locator("[role=status]") };
  };

  const cases: [string, string, boolean][] = [
    ["11 characters", "abcdefghijk", false],
    ["common password that satisfies composition rules", "Password123!", false],
    ["repeated characters", "aaaaaaaaaaaa", false],
    ["12+ character passphrase with spaces", "mulberry lanterns quietly ferrying", true],
    ["Cyrillic passphrase", "хорошая погода сегодня", true],
  ];
  for (const [label, value, good] of cases) {
    test(`${label} -> ${good ? "accepted" : "rejected"}`, async ({ browser }, ti) => {
      const { s, pw, status } = await setup(browser, ti);
      await pw.fill(value);
      const text = async () => (await status.allInnerTexts()).join(" ").replace(/\s+/g, " ");
      if (good) {
        await expect.poll(text).toContain("All password rules are met");
        await expect.poll(text).not.toMatch(/at least 12|common or breached|repeated characters/i);
      } else {
        await expect.poll(text).toMatch(/at least 12|common or breached|repeated characters|sequences/i);
      }
      expect(s.errors).toEqual([]);
      await s.close();
    });
  }

  test("policy copy states 12 to 128 characters and the field does not truncate silently", async ({ browser }, ti) => {
    const { s, pw } = await setup(browser, ti);
    await expect(s.page.locator("main")).toContainText(/12/);
    await expect(s.page.locator("main")).toContainText(/128/);
    const max = await pw.getAttribute("maxlength");
    expect(max === null || Number(max) >= 128).toBe(true);
    await s.close();
  });
});
