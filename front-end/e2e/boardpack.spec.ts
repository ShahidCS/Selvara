import { test, expect } from "@playwright/test";
import { gotoModule, openAs } from "./helpers";

/* The board pack opens in a new tab from a blob: address, which inherits the site's CSP (script-src 'self', style-src 'self').
   Its markup carries no inline style or script; the app styles it and wires the print button. Nothing may be blocked. */
test("the board pack tab is styled, its print button works, and the browser reports no CSP violation", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/overview");
  const [tab] = await Promise.all([p.context().waitForEvent("page"), p.getByRole("button", { name: "Export board pack" }).click()]);
  const csp: string[] = [];
  tab.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) csp.push(m.text()); });
  await tab.waitForLoadState("load");
  await expect(tab.locator(".bp-sheet")).toBeVisible();
  // styles arrived: the sheet is a white page with its own font size, the bars and cells carry their values
  await expect.poll(() => tab.evaluate(() => document.adoptedStyleSheets.length)).toBe(1);
  await expect.poll(() => tab.locator(".bp-toolbar").evaluate((e) => getComputedStyle(e).position)).not.toBe("static");
  const bars = await tab.locator(".bp-fill[data-w]").evaluateAll((els) => els.map((e) => ({ want: `${(e as HTMLElement).dataset.w}%`, got: (e as HTMLElement).style.width })));
  expect(bars.length).toBeGreaterThan(0);
  for (const b of bars) expect(b.got).toBe(b.want);
  // the markup itself has no inline style or handler
  expect(await tab.evaluate(() => document.querySelectorAll("[style]:not(.bp-fill):not(.bp-cov), style, [onclick]").length)).toBe(0);
  // print: the button calls the tab's print()
  await tab.evaluate(() => { (window as unknown as { __printed: boolean }).__printed = false; window.print = () => { (window as unknown as { __printed: boolean }).__printed = true; }; });
  await tab.getByRole("button", { name: "Print / Save as PDF" }).click();
  expect(await tab.evaluate(() => (window as unknown as { __printed: boolean }).__printed)).toBe(true);
  expect(csp, "CSP violations in the board pack tab").toEqual([]);
  await s.close();
});
