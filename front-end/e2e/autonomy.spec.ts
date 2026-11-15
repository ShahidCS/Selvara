import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { gotoModule, openAs } from "./helpers";

/* Phase 5, autonomy ladder on custom agents. */
test("new agents start at suggests only; lowering is immediate; raising shows the track record and the reason it is blocked", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin"); const p = s.page;
  await gotoModule(p, "/ws/assistant/new");
  await expect(p.getByRole("textbox", { name: "Autonomy" })).toHaveValue("Suggests only");
  await expect(p.getByRole("textbox", { name: "Autonomy" })).toHaveJSProperty("readOnly", true);

  await gotoModule(p, "/ws/assistant");
  await p.getByRole("tab", { name: "Custom agents" }).click();
  const table = p.getByRole("table", { name: "Agents", exact: true });
  await table.getByRole("button", { name: "Lower to suggests only: Evidence chaser" }).click();
  await expect(table.getByRole("row", { name: /Evidence chaser/ })).toContainText("Suggests only");
  await expect(table.getByRole("button", { name: "Raise autonomy: Evidence chaser" })).toBeVisible();

  await table.getByRole("button", { name: "Raise autonomy: Questionnaire drafter" }).click();
  const dlg = p.getByRole("dialog", { name: /Raise autonomy: Questionnaire drafter/ });
  await expect(dlg).toContainText("1 of 3 needed");
  await expect(dlg).toContainText("It needs 3 approved suggestions");
  await expect(dlg.getByRole("button", { name: "Request approval" })).toBeDisabled();
  await p.waitForTimeout(600);
  const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id} x${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(bad, bad.join("\n")).toEqual([]);
});

