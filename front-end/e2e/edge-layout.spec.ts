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

test("an Arabic phone in an extreme time zone: the English UI stays consistent (Western digits, en dates, left to right) and nothing breaks", async ({ browser }, ti) => {
  for (const [locale, timezoneId] of [["ar-EG", "Pacific/Kiritimati"], ["ar-SA", "Pacific/Pago_Pago"]] as const) {
    const ctx = await browser.newContext({ baseURL: ti.project.use.baseURL, viewport: { width: 390, height: 844 }, locale, timezoneId });
    await ctx.addInitScript(() => localStorage.setItem("assurance.v1", JSON.stringify({ role: "admin", collapsed: false, signedIn: true, tourDone: true })));
    const p = await ctx.newPage(); const errors: string[] = []; p.on("pageerror", (e) => errors.push(e.message));
    for (const path of ["/ws/overview", "/ws/issues", "/ws/audits"]) {
      await p.goto(path); await expect(p.locator("main#content h1").first()).toBeVisible();
      const text = await p.locator("main#content").innerText();
      expect(text, `${locale} ${path}`).not.toMatch(/[٠-٩۰-۹]/); // no Arabic-Indic digits mixed into English text
      expect(await p.evaluate(() => document.documentElement.dir || "ltr")).toBe("ltr");
    }
    expect(errors).toEqual([]);
    await ctx.close();
  }
});

/** The browser's own text-size setting (Chromium: Settings, Appearance, Font size), not page zoom: standard 16px is the default. */
async function textSize(p: Page, standard: number) {
  const cdp = await p.context().newCDPSession(p);
  await cdp.send("Page.enable");
  await cdp.send("Page.setFontSizes", { fontSizes: { standard, fixed: Math.round(standard * 0.8125) } });
}

test("EDGE-13: the browser's text size at 200% doubles the text; controls grow with it, nothing is cut off and no page scrolls sideways", async ({ browser }, ti) => {
  for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const s = await openAs(browser, ti, "admin", vp);
    await textSize(s.page, 32);
    for (const path of ["/ws/overview", "/ws/risk", "/ws/team", "/ws/controls"]) {
      await gotoModule(s.page, path);
      const m = await s.page.evaluate(() => {
        const cut: string[] = [];
        for (const el of document.querySelectorAll(".btn, .chip, .fchip, .input, .select, .pg-b, .appr-pill, .top-user, .nav-item .cnt, .dt-sortbtn")) {
          const cs = getComputedStyle(el); const b = el.getBoundingClientRect();
          if (cs.display === "none" || !b.height || el.closest(".vh")) continue;
          if (b.height + 0.5 < parseFloat(cs.fontSize)) cut.push(`${el.className} ${b.height.toFixed(1)} < ${cs.fontSize}`);
        }
        const bar = document.querySelector("header#topbar")!.getBoundingClientRect();
        const inBar = [...document.querySelectorAll("header#topbar .top-user, header#topbar .appr-pill")].every((e) => { const r = e.getBoundingClientRect(); return !r.height || (r.top >= bar.top - 0.5 && r.bottom <= bar.bottom + 0.5); });
        return { body: getComputedStyle(document.body).fontSize, cut, inBar, wide: document.scrollingElement!.scrollWidth > window.innerWidth + 1 };
      });
      expect(m.body, `${vp.width} ${path}`).toBe("28px");
      expect(m.cut, `${vp.width} ${path}`).toEqual([]);
      expect(m.inBar, `${vp.width} ${path}: the top bar holds the account button and the approvals pill`).toBe(true);
      expect(m.wide, `${vp.width} ${path}`).toBe(false);
    }
    expect(s.errors).toEqual([]);
    await s.close();
  }
  // the default setting is unchanged: 14px body text
  const d = await openAs(browser, ti, "admin");
  await gotoModule(d.page, "/ws/overview");
  expect(await d.page.evaluate(() => getComputedStyle(document.body).fontSize)).toBe("14px");
  await d.close();
});
