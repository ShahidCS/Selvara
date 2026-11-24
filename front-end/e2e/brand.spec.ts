import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { gotoModule, nextPush, openAs } from "./helpers";

/* Phase 6: workspace colour. An admin picks one of a short list; the choice changes the accent only, in the workspace only. */
const open = async (p: import("@playwright/test").Page) => { await gotoModule(p, "/ws/team"); await p.getByRole("tab", { name: "Review cycles & SLAs" }).click(); };
const primary = (p: import("@playwright/test").Page) => p.locator(".btn-primary").first().evaluate((e) => getComputedStyle(e).backgroundColor);

test("an admin picks a workspace colour; it changes the accent and is audited", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await open(p);
  const group = p.getByRole("radiogroup", { name: "Workspace colour" });
  await expect(group.getByRole("radio")).toHaveCount(5);
  await expect(group.getByRole("radio", { name: "Violet" })).toBeChecked();
  const before = await primary(p);
  await group.getByRole("radio", { name: "Teal" }).click();
  await expect(p.locator("html")).toHaveAttribute("data-brand", "teal");
  await expect(group.getByRole("radio", { name: "Teal" })).toBeChecked();
  // buttons ease between colours, so read the settled value
  await expect.poll(() => primary(p)).toBe("rgb(10, 127, 120)"); // the teal primary, #0a7f78
  expect("rgb(10, 127, 120)").not.toBe(before);
  // the change is in the workspace audit log
  await nextPush(p, "/ws/auditlog");
  await p.getByRole("searchbox", { name: /Search/ }).first().fill("team.brand");
  await expect(p.getByRole("table", { name: /audit log/i }).first()).toContainText("team.brand.changed");
  // the colour is the workspace's: the platform Admin Console and the vendor portal keep the platform colour
  await nextPush(p, "/vendor-portal"); // a client-side move keeps the in-memory choice, so this is the real test
  await expect(p.getByRole("heading", { level: 1, name: "Security assessment request" })).toBeVisible();
  await expect(p.locator("html")).not.toHaveAttribute("data-brand", /.+/);
  expect(s.errors).toEqual([]);
  await s.close();
});

test("an unknown colour value matches no preset, so the default stays", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await open(p);
  // the control offers only the five presets and the service refuses anything else (unit-tested); a stray attribute value matches no rule
  const bad = await p.evaluate(() => { document.documentElement.setAttribute("data-brand", "red"); return getComputedStyle(document.documentElement).getPropertyValue("--c-brand-500").trim(); });
  expect(bad).toBe("#6c3bff");
  await s.close();
});

test("every colour is accessible in the light and dark themes", async ({ browser }, ti) => {
  test.setTimeout(180_000);
  for (const theme of ["light", "dark"]) {
    for (const brand of ["blue", "teal", "green", "slate"]) {
      const s = await openAs(browser, ti, "admin");
      const p = s.page;
      await p.addInitScript((t) => { try { const o = JSON.parse(localStorage.getItem("assurance.v1") || "{}"); o.theme = t; localStorage.setItem("assurance.v1", JSON.stringify(o)); } catch { /* ignore */ } }, theme);
      await open(p);
      await p.getByRole("radiogroup", { name: "Workspace colour" }).getByRole("radio", { name: new RegExp(`^${brand}$`, "i") }).click();
      await expect(p.locator("html")).toHaveAttribute("data-brand", brand);
      for (const path of ["/ws/overview", "/ws/issues", "/ws/team"]) {
        await nextPush(p, path); await p.waitForTimeout(400);
        // the "Workspace colour" confirmation toast (2.2s, then a 0.2s fade) must be gone before the scan: a toast that starts fading while
        // axe runs is measured half-transparent, and its blended colours read as low contrast. Shown in full, the toast is white on near-black, well above 4.5:1.
        await expect.poll(() => p.evaluate(() => { const t = document.getElementById("toast"); return t ? getComputedStyle(t).opacity : "0"; }), { timeout: 5000 }).toBe("0");
        const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${theme}/${brand}${path}: ${v.id} x${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
        expect(bad, bad.join("\n")).toEqual([]);
      }
      await s.close();
    }
  }
});
