import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { gotoModule, openAs } from "./helpers";

/* Phase 5, notification matrix: choose what reaches the bell. */
const panel = (p: import("@playwright/test").Page) => p.getByRole("dialog", { name: "Notifications" });
const bell = (p: import("@playwright/test").Page) => p.getByRole("button", { name: /^Notifications/ });

test("an owner switches off failing-control notices and they leave the bell", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "owner"); const p = s.page;
  await gotoModule(p, "/ws/overview");
  await bell(p).click();
  await expect(panel(p).getByText(/is failing/).first()).toBeVisible();
  await panel(p).getByRole("button", { name: "Settings" }).click();
  const grp = panel(p).getByRole("group", { name: /Failing controls/ });
  await grp.getByRole("switch", { name: "In the bell" }).click();
  await panel(p).getByRole("button", { name: "Back to notifications" }).click();
  await expect(panel(p).getByText(/is failing/)).toHaveCount(0);
  await expect(panel(p).getByText(/need evidence/).first()).toBeVisible();
});

test("approvals in the bell cannot be switched off, and the panel passes axe", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "owner"); const p = s.page;
  await gotoModule(p, "/ws/overview");
  await bell(p).click();
  await panel(p).getByRole("button", { name: "Settings" }).click();
  await expect(panel(p).getByRole("group", { name: /Approvals waiting for you/ }).getByRole("switch", { name: "In the bell" })).toBeDisabled();
  await p.waitForTimeout(600);
  const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id} x${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(bad, bad.join("\n")).toEqual([]);
});

test("a vendor sees only the approvals row", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "vendor"); const p = s.page;
  await gotoModule(p, "/ws/trust");
  await bell(p).click();
  await panel(p).getByRole("button", { name: "Settings" }).click();
  await expect(panel(p).getByRole("group")).toHaveCount(1);
});
