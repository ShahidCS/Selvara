import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { gotoModule, nextPush, openAs } from "./helpers";

/* Phase 5, step 2: delegation of a named approver slot. One session throughout, because delegations and policies live in memory. */
async function switchTo(p: Page, person: string) {
  await p.getByRole("button", { name: /^Account:/ }).click();
  await p.getByRole("menuitem", { name: new RegExp(person) }).click();
}
const card = (p: Page) => p.getByRole("region", { name: "Delegate your approvals" });

test("an admin delegates the approver slot; the delegate approves a policy on their behalf, recorded as such", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "owner");
  const p = s.page;
  // Owen Hart writes a policy and names Jordan Avery as the approver
  await gotoModule(p, "/ws/policies");
  await p.getByRole("button", { name: "New policy" }).click();
  await p.getByLabel(/^Policy name/).fill("Delegation Test Policy");
  await p.getByLabel("Policy text").fill("Used to test delegation of the named approver.");
  await p.getByRole("button", { name: "Create policy" }).click();
  await expect(p).toHaveURL(/\/ws\/policies\/P-[\w-]+$/);
  const url = new URL(p.url()).pathname;
  await p.getByRole("button", { name: "Submit for review" }).click();
  await p.getByLabel(/^Named approver/).selectOption("Jordan Avery");
  await p.getByRole("dialog").getByRole("button", { name: "Submit for review" }).click();
  await expect(p.getByText("Jordan Avery (Company Admin)")).toBeVisible();

  // Casey Morgan is not the named approver: Approve is disabled, with the reason
  await switchTo(p, "Casey Morgan");
  await nextPush(p, url);
  await expect(p.getByRole("button", { name: "Approve", exact: true })).toBeDisabled();

  // Jordan Avery delegates to Casey Morgan from My workspace
  await switchTo(p, "Jordan Avery");
  await nextPush(p, "/ws/me");
  await expect(card(p)).toBeVisible();
  const go = card(p).getByRole("button", { name: "Delegate my approvals" });
  await expect(go).toBeDisabled(); // a reason is needed
  await card(p).getByLabel("Delegate to").selectOption("Casey Morgan");
  await card(p).getByLabel("For").selectOption("3");
  await card(p).getByLabel(/^Reason/).fill("Away on leave until Thursday");
  // the card is accessible
  await p.waitForTimeout(400);
  const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id} x${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(bad, bad.join("\n")).toEqual([]);
  await go.click();
  await expect(card(p)).toContainText("Delegated to Casey Morgan");
  await expect(card(p).getByRole("button", { name: "End delegation" })).toBeVisible();

  // Casey sees what was delegated, and can now approve for Jordan
  await switchTo(p, "Casey Morgan");
  await nextPush(p, "/ws/me");
  await expect(card(p)).toContainText("Delegated to you");
  await expect(card(p)).toContainText("Jordan Avery");
  await nextPush(p, url);
  const approve = p.getByRole("button", { name: "Approve", exact: true });
  await expect(approve).toBeEnabled();
  await approve.click();
  await p.getByRole("dialog").getByLabel(/^Approval reason/).fill("Reviewed the text with the policy owner");
  await p.getByRole("dialog").getByRole("button", { name: /^Approve \(immutable\)/ }).click();
  await expect(p.getByText("Approved: version is now immutable")).toBeVisible();
  // the version history says who it was for
  await expect(p.getByRole("table").filter({ hasText: "Approved by" })).toContainText("Casey Morgan for Jordan Avery (delegation)");

  expect(s.errors).toEqual([]);
  await s.close();
});

test("a delegation can be ended by the delegator, and then the delegate can no longer decide", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "owner");
  const p = s.page;
  await gotoModule(p, "/ws/policies");
  await p.getByRole("button", { name: "New policy" }).click();
  await p.getByLabel(/^Policy name/).fill("Delegation Revoke Policy");
  await p.getByLabel("Policy text").fill("Used to test ending a delegation.");
  await p.getByRole("button", { name: "Create policy" }).click();
  const url = new URL(p.url()).pathname;
  await p.getByRole("button", { name: "Submit for review" }).click();
  await p.getByLabel(/^Named approver/).selectOption("Jordan Avery");
  await p.getByRole("dialog").getByRole("button", { name: "Submit for review" }).click();
  await switchTo(p, "Jordan Avery");
  await nextPush(p, "/ws/me");
  await card(p).getByLabel("Delegate to").selectOption("Casey Morgan");
  await card(p).getByLabel(/^Reason/).fill("Out for the afternoon, covering");
  await card(p).getByRole("button", { name: "Delegate my approvals" }).click();
  await expect(card(p)).toContainText("Delegated to Casey Morgan");
  await card(p).getByRole("button", { name: "End delegation" }).click();
  await expect(card(p).getByRole("button", { name: "Delegate my approvals" })).toBeVisible();
  await switchTo(p, "Casey Morgan");
  await nextPush(p, url);
  await expect(p.getByRole("button", { name: "Approve", exact: true })).toBeDisabled();
  await s.close();
});

test("roles that cannot hold an approver slot do not see the delegation card", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "employee");
  const p = s.page;
  await gotoModule(p, "/ws/me");
  await expect(p.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(card(p)).toHaveCount(0);
  await s.close();
});
