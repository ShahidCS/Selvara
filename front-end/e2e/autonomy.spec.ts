import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { gotoModule, nextPush, openAs } from "./helpers";

/* Phase 5, autonomy ladder on custom agents. */
test("new agents start at suggests only; lowering is immediate; raising shows the track record and the reason it is blocked", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin"); const p = s.page;
  await gotoModule(p, "/ws/assistant/new");
  await expect(p.getByRole("textbox", { name: "Autonomy" })).toHaveValue("Suggests only");
  await expect(p.getByRole("textbox", { name: "Autonomy" })).toHaveJSProperty("readOnly", true);

  await gotoModule(p, "/ws/assistant");
  await p.getByRole("tab", { name: "Custom agents" }).click(); await p.getByRole("radio", { name: "Table" }).click();
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


test("a small team turns the track record off; raising still needs approval; rejecting an applied change lowers the agent", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin"); const p = s.page;
  await gotoModule(p, "/ws/team");
  await p.getByRole("tab", { name: "Review cycles & SLAs" }).click();
  await p.getByRole("radiogroup", { name: "AI agent track record" }).getByRole("radio", { name: "Off" }).click();
  await expect(p.getByRole("radiogroup", { name: "AI agent track record" }).getByRole("radio", { name: "Off" })).toHaveAttribute("aria-checked", "true");

  await nextPush(p, "/ws/assistant"); // client navigation keeps the in-memory setting
  await p.getByRole("tab", { name: "Custom agents" }).click(); await p.getByRole("radio", { name: "Table" }).click();
  const table = p.getByRole("table", { name: "Agents", exact: true });
  await table.getByRole("button", { name: "Raise autonomy: Questionnaire drafter" }).click();
  const dlg = p.getByRole("dialog", { name: /Raise autonomy: Questionnaire drafter/ });
  await expect(dlg).toContainText("Not required in this workspace");
  await dlg.getByLabel(/^Reason/).fill("Small team, reviewed its drafts by hand");
  await dlg.getByRole("button", { name: "Request approval" }).click();
  await expect(table.getByRole("row", { name: /Questionnaire drafter/ })).toContainText("Raise requested");

  await p.getByRole("tab", { name: "Run log" }).click();
  const runs = p.getByRole("table", { name: "Agent runs", exact: true });
  await runs.getByRole("button", { name: "Reject applied change: Posted weekly risk summary" }).click();
  const rj = p.getByRole("dialog", { name: /Reject applied change: Risk summariser/ });
  await rj.getByLabel(/^Reason/).fill("Summary used last week's scores");
  await rj.getByRole("button", { name: "Confirm rejection" }).click();
  await expect(p.getByText("Risk summariser now suggests only")).toBeVisible();
  await p.getByRole("tab", { name: "Custom agents" }).click(); await p.getByRole("radio", { name: "Table" }).click();
  await expect(table.getByRole("row", { name: /Risk summariser/ })).toContainText("Suggests only");
});

test("agents acting before the ladder show a transition deadline and can be recertified with an attestation", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin"); const p = s.page;
  await gotoModule(p, "/ws/assistant");
  await p.getByRole("tab", { name: "Custom agents" }).click(); await p.getByRole("radio", { name: "Table" }).click();
  const table = p.getByRole("table", { name: "Agents", exact: true });
  await expect(table.getByRole("row", { name: /Evidence chaser/ })).toContainText(/Recertify by \d{4}-\d{2}-\d{2}/);
  await table.getByRole("button", { name: "Recertify: Evidence chaser" }).click();
  const dlg = p.getByRole("dialog", { name: /Recertify: Evidence chaser/ });
  await expect(dlg).toContainText("Two (it runs as a service account)");
  await p.waitForTimeout(600);
  const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id} x${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(bad, bad.join("\n")).toEqual([]);
  await dlg.getByLabel(/^Attestation/).fill("Reviewed its last month of emails to owners");
  await dlg.getByRole("button", { name: "Request approval" }).click();
  await expect(table.getByRole("row", { name: /Evidence chaser/ })).toContainText("Recertification requested");
});
