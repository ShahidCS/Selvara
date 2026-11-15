import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { ALL_ROUTES, gotoModule, isAllowed, openAs } from "./helpers";

/* Phase 6: automated accessibility checks (axe, WCAG 2.2 A and AA rules) on every route, light and dark. Serious and critical findings fail. */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const ROLE = (space: string) => (space === "admin" ? "super" : "admin");
/* record and form pages use their own templates */
const EXTRA: [string, string][] = [
  ["ws", "policies/new"], ["ws", "issues/new"], ["ws", "controls/new"], ["ws", "vendors/new"], ["ws", "evidence/new"], ["ws", "audits/new"], ["ws", "frameworks/new"],
  ["ws", "ai/new"], ["ws", "assistant/new"], ["ws", "api/new-key"], ["ws", "team/invite"], ["ws", "billingws/plan"], ["ws", "audits/AUD-01"], ["ws", "policies/P-001"],
];

for (const theme of ["light", "dark"] as const) {
  for (const [space, mod] of [...ALL_ROUTES.map(([s, m]) => [s, m] as [string, string]), ...EXTRA]) {
    test(`a11y ${theme}: /${space}/${mod}`, async ({ browser }, ti) => {
      const s = await openAs(browser, ti, ROLE(space));
      const p = s.page;
      await p.addInitScript((t) => { try { const o = JSON.parse(localStorage.getItem("assurance.v1") || "{}"); o.theme = t; localStorage.setItem("assurance.v1", JSON.stringify(o)); } catch { /* ignore */ } }, theme);
      if (!isAllowed(ROLE(space), space as "ws" | "admin", mod.split("/")[0])) test.skip();
      await gotoModule(p, `/${space}/${mod}`);
      await p.waitForTimeout(300);
      const r = await new AxeBuilder({ page: p }).withTags(TAGS).analyze();
      const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      const lines = bad.map((v) => `${v.id} (${v.impact}) x${v.nodes.length}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
      expect(lines, lines.join("\n")).toEqual([]);
      await s.close();
    });
  }
}

/* public pages carry no role */
for (const theme of ["light", "dark"] as const) {
  for (const path of ["/vendor-portal", "/login"]) {
    test(`a11y ${theme}: ${path} (signed out)`, async ({ browser }, ti) => {
      const s = await openAs(browser, ti, "admin");
      const p = s.page;
      await p.addInitScript((t) => { try { localStorage.setItem("assurance.v1", JSON.stringify({ theme: t })); } catch { /* ignore */ } }, theme);
      await p.goto(path); await p.waitForTimeout(300);
      const r = await new AxeBuilder({ page: p }).withTags(TAGS).analyze();
      const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      const lines = bad.map((v) => `${v.id} (${v.impact}) x${v.nodes.length}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
      expect(lines, lines.join("\n")).toEqual([]);
      await s.close();
    });
  }
}

/* open surfaces: the notifications panel, the module palette and a dialog */
test("a11y: the notifications panel, the palette and the shortcut list", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/overview");
  const scan = async (what: string) => {
    await p.waitForTimeout(600); // let the open animation finish, or axe measures a half-faded colour
    const r = await new AxeBuilder({ page: p }).withTags(TAGS).analyze();
    const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${what}: ${v.id} x${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
    expect(bad, bad.join("\n")).toEqual([]);
  };
  await p.getByRole("button", { name: /^Notifications/ }).click();
  await expect(p.getByRole("dialog")).toBeVisible();
  await scan("notifications"); await p.keyboard.press("Escape");
  await p.keyboard.press("Control+k");
  await expect(p.getByRole("dialog")).toBeVisible();
  await scan("palette"); await p.keyboard.press("Escape");
  await p.keyboard.press("Control+/");
  await expect(p.getByRole("dialog")).toBeVisible();
  await scan("shortcuts");
  await s.close();
});
