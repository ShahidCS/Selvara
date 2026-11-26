import { test, expect, type Page } from "@playwright/test";
import { NAV, gotoModule, openAs } from "./helpers";

/* EDGE-12 (rotation), EDGE-13 (large text: zoom and reflow), EDGE-17 (tablet and foldable sizes). Synthetic input only. */
const noSideScroll = (p: Page) => p.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1);

test("rotating a phone or tablet keeps what was typed in a form, and the page never scrolls sideways", async ({ browser }, ti) => {
  for (const [portrait, landscape] of [[{ width: 390, height: 844 }, { width: 844, height: 390 }], [{ width: 768, height: 1024 }, { width: 1024, height: 768 }], [{ width: 673, height: 841 }, { width: 841, height: 673 }]] as const) {
    const s = await openAs(browser, ti, "admin", portrait);
    const p = s.page;
    await gotoModule(p, "/ws/controls/new");
    await p.locator("#cc-title").fill("Secrets rotated every 90 days (John Doe)");
    await p.locator("#cc-owner").fill("John Doe").catch(() => {}); // a free-text owner in the demonstration build
    await p.setViewportSize(landscape); await p.waitForTimeout(300);
    await expect(p.locator("#cc-title")).toHaveValue("Secrets rotated every 90 days (John Doe)");
    expect(await noSideScroll(p)).toBe(true);
    await p.setViewportSize(portrait); await p.waitForTimeout(300);
    await expect(p.locator("#cc-title")).toHaveValue("Secrets rotated every 90 days (John Doe)");
    expect(await noSideScroll(p)).toBe(true);
    expect(s.errors).toEqual([]);
    await s.close();
  }
});

test("the request-to-join form keeps its input through a rotation", async ({ browser }, ti) => {
  const ctx = await browser.newContext({ baseURL: ti.project.use.baseURL, viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto("/login");
  await p.getByRole("button", { name: /request to join|ask to join/i }).first().click();
  await p.locator("#jn-name").fill("John Doe");
  await p.locator("#jn-email").fill("test@example.com");
  await p.setViewportSize({ width: 844, height: 390 }); await p.waitForTimeout(300);
  await expect(p.locator("#jn-name")).toHaveValue("John Doe");
  await expect(p.locator("#jn-email")).toHaveValue("test@example.com");
  await ctx.close();
});

test("zoom to 200% and 400% (640 and 320 CSS px wide): no workspace page scrolls sideways", async ({ browser }, ti) => {
  const paths = NAV.ws.flatMap((g) => g.items.map((i) => "/ws/" + i[0]));
  for (const width of [320, 640]) {
    const s = await openAs(browser, ti, "admin", { width, height: 800 });
    const wide: string[] = [];
    for (const path of paths) { await gotoModule(s.page, path); if (!(await noSideScroll(s.page))) wide.push(path); }
    expect(wide, `at ${width}px`).toEqual([]);
    await s.close();
  }
});
