import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { gotoModule, nextPush, openAs, switchTo } from "./helpers";

/* Phase 5 drafts: automation rules, data retention and presence. One session per test where approvals must survive (they live in memory). */
const axe = async (p: Page) => {
  const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id} x${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
};

test("a rule is saved as a draft, a different admin approves turning it on, then it runs", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin"); const p = s.page;
  await gotoModule(p, "/ws/team");
  await p.getByRole("tab", { name: "Automation rules" }).click();
  await p.getByLabel("Rule name").fill("Failing controls get an issue");
  await p.getByLabel("Then").selectOption({ label: "Open an issue (once per record)" });
  await p.getByRole("button", { name: "Save draft" }).click();
  await expect(p.getByRole("row", { name: /Failing controls get an issue/ }).last()).toContainText("Draft");
  expect(await axe(p)).toEqual([]);
  await p.getByRole("button", { name: "Turn on: Failing controls get an issue" }).click();
  await p.getByRole("dialog").getByLabel(/^Reason/).fill("Agreed in the risk committee");
  await p.getByRole("dialog").getByRole("button", { name: "Request approval" }).click();
  await expect(p.getByRole("row", { name: /Failing controls get an issue/ }).last()).toContainText("Pending approval");

  await switchTo(p, "Casey Morgan");
  await nextPush(p, "/ws/team");
  await p.getByRole("tab", { name: "Automation rules" }).click();
  await p.getByRole("button", { name: /^Approve/ }).first().click();
  await p.getByRole("dialog").getByRole("textbox").fill("Checked the rule and agreed");
  await p.getByRole("dialog").getByRole("button", { name: /Approve|Confirm/ }).last().click();
  await expect(p.getByRole("row", { name: /Failing controls get an issue/ }).last()).toContainText("Active");
  await p.getByRole("button", { name: "Run now: Failing controls get an issue" }).click();
  await expect(p.getByRole("row", { name: /Failing controls get an issue/ }).last()).toContainText(/\d+ of \d+/);
  await s.close();
});

test("data retention: shorter needs approval and never goes below the minimum; a legal hold is shown", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin"); const p = s.page;
  await gotoModule(p, "/ws/team");
  await p.getByRole("tab", { name: "Data retention" }).click();
  expect(await axe(p)).toEqual([]);
  await p.getByRole("button", { name: "Change retention: Audit logs" }).click();
  await p.getByLabel(/^Keep for/).fill("24");
  await p.getByLabel(/^Reason/).fill("Testing the minimum rule");
  await p.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(p.getByRole("dialog").getByRole("alert")).toContainText("at least 60 months");
  await p.getByLabel(/^Keep for/).fill("72");
  await p.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(p.getByText("A shorter period needs a different company admin to approve")).toBeVisible();
  await expect(p.getByRole("row", { name: /Audit logs/ }).last()).toContainText("6 years awaiting approval");
  await p.getByRole("button", { name: "Place legal hold: Control evidence" }).click();
  await p.getByLabel(/^Reason/).fill("Regulator inquiry REF-1234 opened");
  await p.getByRole("dialog").getByRole("button", { name: "Place hold" }).click();
  await expect(p.getByRole("row", { name: /Control evidence/ }).last()).toContainText("Legal hold");
  await s.close();
});

test("presence: a second person on the same record is shown; editing at the same time warns", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin"); const a = s.page;
  await gotoModule(a, "/ws/policies/P-001");
  const b = await a.context().newPage();
  await b.addInitScript(() => { try { localStorage.setItem("assurance.v1", JSON.stringify({ role: "admin2", collapsed: false, theme: "light", signedIn: true })); } catch { /* ignore */ } });
  await gotoModule(b, "/ws/policies/P-001");
  await expect(a.getByRole("status").filter({ hasText: "Also here:" })).toContainText("Casey Morgan", { timeout: 10_000 });
  await expect(b.getByRole("status").filter({ hasText: "Also here:" })).toContainText("Jordan Avery", { timeout: 10_000 });
  expect(await axe(a)).toEqual([]);
  // both open the edit page of the same record: each is warned about the other
  await nextPush(a, "/ws/policies/P-001/edit"); await nextPush(b, "/ws/policies/P-001/edit");
  await expect(a.getByRole("status").filter({ hasText: "also editing this record" })).toContainText("Casey Morgan", { timeout: 10_000 });
  await b.close();
  await expect(a.getByRole("status").filter({ hasText: /Also here:|also editing/ })).toHaveCount(0, { timeout: 20_000 });
  await s.close();
});
