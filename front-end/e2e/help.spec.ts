import { test, expect } from "@playwright/test";
import { gotoModule, openAs } from "./helpers";

/* Reference review R4: the Help centre (guides, search, Ask Selvara support, My questions) and the Admin Console's support questions.
   Demonstration build: questions stay in this tab. Synthetic data only. */

test("help centre: search finds guides, an article opens with its breadcrumb, and the Help menu leads here", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin"); const p = s.page;
  await gotoModule(p, "/ws/overview");
  await p.getByRole("button", { name: "Help", exact: true }).click();
  await p.getByRole("menuitem", { name: "Help centre" }).click();
  await expect(p).toHaveURL(/\/help$/);
  await expect(p.getByRole("heading", { level: 1, name: "Help centre" })).toBeVisible();
  await p.getByRole("searchbox", { name: "Search the Help centre" }).fill("pause agents");
  await expect(p.getByRole("heading", { name: /1 guide found|guides found/ })).toBeVisible();
  await p.getByRole("link", { name: /Custom agents and pausing them/ }).click();
  await expect(p).toHaveURL(/\/help\/agents$/);
  await expect(p.getByRole("heading", { level: 1, name: "Custom agents and pausing them" })).toBeVisible();
  await expect(p.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Custom agents and pausing them");
  await p.getByRole("link", { name: "Back to Help centre" }).click();
  await p.getByRole("searchbox", { name: "Search the Help centre" }).fill("zzzz nothing");
  await expect(p.getByText("No guide matches")).toBeVisible();
  expect(s.errors).toEqual([]);
  await s.close();
});

test("ask selvara support: suggestions while typing, checks before sending, then My questions shows it and it can be closed", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "employee"); const p = s.page;
  await gotoModule(p, "/help");
  await p.getByRole("button", { name: "Ask a question" }).first().click();
  await expect(p).toHaveURL(/\/help\/ask$/);
  await p.getByLabel(/^Subject/).fill("How do I accept a risk above appetite?");
  await expect(p.locator("#hq-hints")).toContainText("Accept a risk");
  await p.getByRole("button", { name: "Send question" }).click();
  await expect(p.locator("#hq-err")).toContainText("Write your question.");
  await p.getByLabel(/^Details/).fill("Our board approved it last week. What do I record?");
  await p.getByRole("button", { name: "Send question" }).click();
  await expect(p.locator("#hq-err")).toContainText("Choose a topic.");
  await p.getByLabel(/^Topic/).selectOption({ label: "Risk" });
  await p.getByRole("button", { name: "Send question" }).click();
  await expect(p).toHaveURL(/\/help\/questions\?q=/);
  const card = p.locator("details.help-q").first();
  await expect(card).toContainText("How do I accept a risk above appetite?"); await expect(card).toContainText("Open");
  await expect(card.getByRole("list", { name: /Messages on HQ-/ })).toContainText("Our board approved it last week.");
  await card.getByLabel(/Reply to HQ-/).fill("Adding: the residual score is 16.");
  await card.getByRole("button", { name: "Send reply" }).click();
  await expect(card.getByRole("list", { name: /Messages on HQ-/ })).toContainText("the residual score is 16");
  await card.getByRole("button", { name: "Close question" }).click();
  await expect(card).toContainText("Closed. Ask a new question if you need more help.");
  expect(s.errors).toEqual([]);
  await s.close();
});

test("admin console: support questions is a view of Customers; platform staff do not ask from the Help centre", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "super"); const p = s.page;
  await gotoModule(p, "/admin/customers");
  await p.getByRole("radio", { name: "Support questions" }).click();
  await expect(p.getByText("No questions yet")).toBeVisible();
  await gotoModule(p, "/help");
  await expect(p.getByRole("button", { name: "Ask a question" })).toHaveCount(0);
  await expect(p.getByText("answered in the Admin Console")).toBeVisible();
  await expect(p.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Admin Console");
  expect(s.errors).toEqual([]);
  await s.close();
});
