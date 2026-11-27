import { test, expect, type Page } from "@playwright/test";
import { DEMO_PASS, demoEmail, gotoModule, openAs } from "./helpers";

/* Geometry checks that keep four fixed UI faults from coming back (measured in the browser, so they do not depend on screenshots that change
   with the platform's fonts). Synthetic demo personas only. */

test("demo code notice: heading, statement, centred monospace code and closing line, one line apart; the code stays selectable", async ({ browser }, ti) => {
  for (const [w, h] of [[1280, 900], [390, 844]]) {
    const ctx = await browser.newContext({ baseURL: ti.project.use.baseURL, viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    await p.goto("/login");
    await p.getByLabel("Work email").fill(demoEmail("Casey Morgan"));
    await p.getByLabel("Password", { exact: true }).fill(DEMO_PASS);
    await p.getByRole("button", { name: "Sign in", exact: true }).click();
    const box = p.getByTestId("demo-code-notice");
    await expect(box).toBeVisible();
    await expect(box.locator(".demo-code-h")).toHaveText("Demo account.");
    const m = await box.evaluate((el) => {
      const body = el.querySelector(".demo-code-body")!; const [st, code, tail] = [...body.children] as HTMLElement[];
      const r = (e: Element) => e.getBoundingClientRect(); const b = r(el); const c = r(code); const fs = parseFloat(getComputedStyle(body).fontSize);
      const sel = getSelection()!; const rg = document.createRange(); rg.selectNodeContents(code); sel.removeAllRanges(); sel.addRange(rg);
      return { st: st.textContent, code: code.textContent, tail: tail.textContent, centre: Math.abs((c.left + c.right) / 2 - (b.left + b.right) / 2),
        gap1: r(code).top - r(st).bottom, gap2: r(tail).top - r(code).bottom, fs, mono: /mono/i.test(getComputedStyle(code).fontFamily),
        tabular: getComputedStyle(code).fontVariantNumeric.includes("tabular-nums"), bigger: parseFloat(getComputedStyle(code).fontSize) > fs,
        justify: getComputedStyle(tail).textAlign, selected: sel.toString(), brs: el.querySelectorAll("br").length };
    });
    expect(m.st).toBe("Demo accounts have no authenticator, so the code is shown here:");
    expect(m.code).toMatch(/^\d{6}$/); expect(m.selected).toBe(m.code);
    expect(m.tail).toBe("Real accounts use an authenticator app.");
    expect(m.centre).toBeLessThan(1.5);
    for (const g of [m.gap1, m.gap2]) { expect(g).toBeGreaterThanOrEqual(m.fs * 0.9); expect(g).toBeLessThanOrEqual(m.fs * 1.5); }
    expect([m.mono, m.tabular, m.bigger, m.justify, m.brs]).toEqual([true, true, true, "justify", 0]);
    // the demonstration build says so under the card
    await expect(p.getByText("Demonstration build. Accounts and data are synthetic and nothing is sent to a server.")).toBeVisible();
    await ctx.close();
  }
});

/** Every option of an open listbox lies inside the list's padding box, and the list is not a pill. */
async function listboxIsBox(p: Page) {
  return p.locator(".lb-list").evaluate((l) => {
    const lr = l.getBoundingClientRect(); const cs = getComputedStyle(l); const rad = parseFloat(cs.borderTopLeftRadius);
    const opts = [...l.querySelectorAll('[role="option"]')] as HTMLElement[];
    l.scrollTop = 0; const first = opts[0].getBoundingClientRect(); l.scrollTop = l.scrollHeight; const last = opts.at(-1)!.getBoundingClientRect();
    // a corner of radius r cuts into a row whose corner is closer than r to the list's corner: the row must start beyond the curve
    const inset = (o: DOMRect) => Math.min(o.left - lr.left, lr.right - o.right);
    return { rad, optRad: parseFloat(getComputedStyle(opts[0]).borderTopLeftRadius), inset: Math.min(inset(first), inset(last)),
      firstTop: first.top - lr.top, lastBottom: lr.bottom - last.bottom, n: opts.length, firstText: opts[0].textContent, btnRad: parseFloat(getComputedStyle(document.querySelector(".btn")!).borderTopLeftRadius) };
  });
}

test("menus are boxes, not pills: small fixed radius, first and last options unclipped; buttons keep the pill; keyboard unchanged", async ({ browser }, ti) => {
  for (const theme of ["light", "dark"] as const) for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const s = await openAs(browser, ti, "admin", vp);
    await s.page.emulateMedia({ colorScheme: theme });
    await gotoModule(s.page, "/ws/team");
    await s.page.getByRole("button", { name: /^Change role of / }).first().click();
    const dlg = s.page.getByRole("dialog");
    await dlg.getByRole("button", { name: /^New role: / }).click();
    await expect(dlg.getByRole("listbox", { name: "New role" })).toBeVisible();
    const m = await listboxIsBox(s.page);
    expect(m.rad).toBeGreaterThanOrEqual(6); expect(m.rad).toBeLessThanOrEqual(12);
    expect(m.optRad).toBeLessThan(m.rad);
    expect(m.inset).toBeGreaterThanOrEqual(0); expect(m.firstTop).toBeGreaterThanOrEqual(0); expect(m.lastBottom).toBeGreaterThanOrEqual(0);
    expect(m.firstText).toBe("Company Admin"); expect(m.n).toBe(6);
    expect(m.btnRad).toBeGreaterThan(100); // pill stays on buttons
    await s.page.keyboard.press("ArrowDown"); await s.page.keyboard.press("Escape");
    await expect(dlg.getByRole("listbox")).toBeHidden(); await expect(dlg).toBeVisible();
    await s.close();
  }
});

test("KPI values are never clipped: 0, 8, 9, 11, 121, 100%, 27% and the empty dash", async ({ browser }, ti) => {
  for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const s = await openAs(browser, ti, "admin", vp);
    await gotoModule(s.page, "/ws/overview");
    const v = s.page.locator(".kpi-strip .kpi-v").first(); await expect(v).toBeVisible();
    const out = await v.evaluate((el) => {
      const cs = getComputedStyle(el); const fs = parseFloat(cs.fontSize); const res: { t: string; over: boolean }[] = [];
      for (const t of ["0", "8", "9", "11", "121", "100%", "27%", "—"]) { el.textContent = t; res.push({ t, over: el.scrollWidth > el.clientWidth }); }
      return { res, ls: parseFloat(cs.letterSpacing) / fs, pad: parseFloat(cs.paddingInlineEnd), tab: cs.fontVariantNumeric };
    });
    expect(out.res.filter((x) => x.over)).toEqual([]);
    expect(out.ls).toBeGreaterThanOrEqual(-0.011); // tracking no tighter than -0.01em
    expect(out.pad).toBeGreaterThan(0);            // room for the display font's overhang inside the clip box
    expect(out.tab).toContain("tabular-nums");
    await s.close();
  }
});

test("Overview date line: weekday, DD Month YYYY · Overall Security Posture, the month once", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  await gotoModule(s.page, "/ws/overview");
  const line = (await s.page.locator(".page-eyebrow").first().textContent()) ?? "";
  expect(line).toMatch(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), \d{2} [A-Z][a-z]+ \d{4} · Overall Security Posture$/);
  const month = line.split(" ")[2]; expect(line.split(month).length - 1).toBe(1);
  await s.close();
});
