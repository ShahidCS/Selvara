import { test, expect, type Page } from "@playwright/test";
import { enabledButtons, openAs } from "./helpers";
void enabledButtons;

/* (f) injection resistance: hostile strings in the main create forms and URL parameters must never execute or become markup. */
const PAYLOADS = ['<img src=x onerror="window.__xss=1">', '"><svg onload="window.__xss=2">', "javascript:window.__xss=3", '=HYPERLINK("http://203.0.113.1","x")', "{{7*7}}${7*7}"];

const probe = (page: Page) => page.evaluate(() => ({
  x: (window as unknown as { __xss?: number }).__xss || 0,
  imgs: document.querySelectorAll('img[src="x"]').length,
  svg: document.querySelectorAll("svg[onload]").length,
  inline: document.querySelectorAll("[onerror],[onload]").length,
}));
const CLEAN = { x: 0, imgs: 0, svg: 0, inline: 0 };

test.describe("URL parameters", () => {
  const urls = [
    "/ws/audits/" + encodeURIComponent(PAYLOADS[0]),
    "/admin/billing/" + encodeURIComponent(PAYLOADS[1]),
    "/ws/%3Cimg%20src=x%20onerror=window.__xss=1%3E",
    "/ws/overview?x=" + encodeURIComponent(PAYLOADS[1]),
    "/ws/overview#" + encodeURIComponent(PAYLOADS[0]),
    "/ws/frameworks?q=" + encodeURIComponent(PAYLOADS[0]),
    "/%2e%2e/%2e%2e/etc/passwd",
  ];
  for (const u of urls) {
    test(u.slice(0, 60), async ({ browser }, ti) => {
      const s = await openAs(browser, ti, u.startsWith("/admin") ? "super" : "admin");
      await s.page.goto(u);
      await expect(s.page.locator("body")).toBeVisible();
      await s.page.waitForLoadState("networkidle");
      expect(await probe(s.page)).toEqual(CLEAN);
      expect(s.dialogs).toEqual([]);
      await s.close();
    });
  }
});

const FORMS: [role: string, path: string, trigger: string][] = [
  ["admin", "/ws/work", "Request access"],
  ["admin", "/ws/work", "Request a new vendor"],
  ["admin", "/ws/issues", "New issue"],
  ["admin", "/ws/evidence", "Add evidence"],
  ["admin", "/ws/policies", "New policy"],
  ["admin", "/ws/people", "Add contractor"],
  ["admin", "/ws/controls", "Add custom control"],
  ["super", "/admin/customers", "Onboard"],
  ["super", "/admin/mfa", "Reset MFA"],
];

test.describe("create forms", () => {
  for (const [role, path, trigger] of FORMS) {
    test(`${path} > ${trigger}`, async ({ browser }, ti) => {
      test.setTimeout(90_000);
      const s = await openAs(browser, ti, role);
      let exercised = 0;
      for (const pay of PAYLOADS) {
        await s.page.goto(path);
        const btn = s.page.locator("main button", { hasText: trigger }).first();
        await expect(btn).toBeVisible();
        if (await btn.isDisabled()) continue; // locked by design (e.g. admin space before elevation): nothing to inject into
        await btn.click();
        await expect(s.page.locator(".modal.on, .drawer.on").first()).toBeVisible();
        const fields = s.page.locator(
          [".modal.on", ".drawer.on"].flatMap((l) => ["input[type=text]", "input:not([type])", "textarea", "input[type=search]"].map((f) => `${l} ${f}:not([readonly]):not([disabled])`)).join(", "),
        );
        const n = await fields.count();
        for (let i = 0; i < n; i++) await fields.nth(i).fill(pay);
        const primary = s.page.locator(".modal.on .m-foot .btn-primary, .drawer.on .d-foot .btn-primary").last();
        if (await primary.count()) await primary.click({ timeout: 3000 }).catch(() => undefined);
        exercised += n;
        expect(await probe(s.page), `payload ${pay}`).toEqual(CLEAN);
      }
      // stored values are rendered back on the module pages: re-visit within the same session (in-memory state) via client navigation
      await s.page.evaluate((p) => (window as unknown as { next: { router: { push: (u: string) => Promise<boolean> } } }).next.router.push(p), path);
      expect(await probe(s.page)).toEqual(CLEAN);
      expect(s.dialogs).toEqual([]);
      if (role === "admin") expect(exercised, "form had text fields to inject into").toBeGreaterThan(0);
      await s.close();
    });
  }

  test("customer search box reflects nothing as markup", async ({ browser }, ti) => {
    const s = await openAs(browser, ti, "super");
    await s.page.goto("/admin/customers");
    for (const pay of PAYLOADS) {
      await s.page.locator("main input").first().fill(pay);
      expect(await probe(s.page)).toEqual(CLEAN);
    }
    expect(s.dialogs).toEqual([]);
    await s.close();
  });

  test("framework gap export neutralises formula cells", async ({ browser }, ti) => {
    const ctx = await browser.newContext({ baseURL: ti.project.use.baseURL, acceptDownloads: true });
    const page = await ctx.newPage();
    await page.addInitScript(() => localStorage.setItem("assurance.v1", JSON.stringify({ role: "admin", collapsed: false, theme: "light" })));
    await page.goto("/ws/frameworks");
    await page.locator('tr:has-text("ISO/IEC 27001:2022") >> text=Details').click();
    const [dl] = await Promise.all([page.waitForEvent("download"), page.locator("text=Export gap assessment").click()]);
    const fs = await import("node:fs");
    const csv = fs.readFileSync(await dl.path(), "utf8");
    const unguarded = csv.split("\n").filter((l) => l.split(",").some((c) => /^"[=+\-@]/.test(c)));
    expect(unguarded).toEqual([]);
    await ctx.close();
  });
});
