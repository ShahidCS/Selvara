import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { gotoModule, nextPush, openAs } from "./helpers";

/* Phase 5, step 1: decide from the notifications panel. One session throughout, because approvals live in memory. */
async function raiseWriteKey(p: Page, label: string) {
  await gotoModule(p, "/ws/api");
  await p.getByRole("button", { name: "New API key" }).click();
  await p.getByLabel(/^Label/).fill(label);
  await p.getByLabel("Scope").selectOption("Read/Write");
  await p.getByRole("button", { name: "Create key" }).click();
  await expect(p).toHaveURL(/\/ws\/api$/);
}
async function switchTo(p: Page, person: string) {
  await p.getByRole("button", { name: /^Account:/ }).click();
  await p.getByRole("menuitem", { name: new RegExp(person) }).click();
}
const panel = (p: Page) => p.getByRole("dialog", { name: "Notifications" }); // the page behind it has its own Approve buttons with the same labels
const bell = (p: Page) => p.getByRole("button", { name: /^Notifications/ });

test("a second admin approves a write-scope key from the bell; the requester cannot", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await raiseWriteKey(p, "Inline decision key");
  // the requester has nothing to decide
  await bell(p).click();
  await expect(panel(p)).toBeVisible();
  await expect(panel(p).getByRole("button", { name: /^Approve: / })).toHaveCount(0);
  await p.keyboard.press("Escape");

  await switchTo(p, "Casey Morgan");
  await bell(p).click();
  const approve = panel(p).getByRole("button", { name: /^Approve: Create write-scope API key "Inline decision key"/ });
  await expect(approve).toBeVisible();
  await approve.click();
  // the open reason form is accessible too (scan once it has settled)
  await p.waitForTimeout(600);
  const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id} x${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(bad, bad.join("\n")).toEqual([]);
  const confirm = panel(p).getByRole("button", { name: "Confirm approve" });
  await expect(confirm).toBeDisabled(); // a reason is needed
  await panel(p).getByLabel(/^Reason to approve/).fill("too short");
  await expect(confirm).toBeDisabled();
  await panel(p).getByLabel(/^Reason to approve/).fill("Scope confirmed with the service owner");
  await confirm.click();
  await expect(p.getByText("Approved, change applied")).toBeVisible();
  await expect(approve).toHaveCount(0); // it left the list
  await p.keyboard.press("Escape");
  // the change was applied: the key is in the register
  await nextPush(p, "/ws/api");
  await expect(p.getByRole("table", { name: "API keys", exact: true })).toContainText("Inline decision key");
  expect(s.errors).toEqual([]);
  await s.close();
});

test("rejecting from the bell needs a reason and ends the request", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await raiseWriteKey(p, "Key to reject");
  await switchTo(p, "Casey Morgan");
  await bell(p).click();
  await panel(p).getByRole("button", { name: /^Reject: .*Key to reject/ }).click();
  await panel(p).getByLabel(/^Reason to reject/).fill("Not needed for this integration");
  await panel(p).getByRole("button", { name: "Confirm reject" }).click();
  await expect(p.getByText("Rejected", { exact: true }).first()).toBeVisible();
  await expect(panel(p).getByRole("button", { name: /^Reject: .*Key to reject/ })).toHaveCount(0);
  await s.close();
});

test("kinds with module-specific rules are not offered in the bell", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/overview");
  await bell(p).click();
  await expect(panel(p)).toBeVisible();
  // whatever is listed for a decision is a shared-path request: no Approve button names an access, people, risk or policy request
  const names = await panel(p).getByRole("button", { name: /^(Approve|Reject): / }).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") || ""));
  for (const n of names) expect(n).not.toMatch(/Second approval|Offboard|Grant .* to|Invite |Risk|Policy|Evidence/i);
  await s.close();
});
