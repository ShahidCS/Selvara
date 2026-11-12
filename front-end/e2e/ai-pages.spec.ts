import { test, expect } from "@playwright/test";
import { gotoModule, nextPush, openAs } from "./helpers";

/* Wave D: the assistant, AI governance and questionnaires. AI-written text sits on the AI panel; registers are tables; records and forms are pages. */
test("assistant: an answer is an AI panel that says it needs review; agents and run log are tables; create agent is a page", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/assistant");
  await expect(p.getByRole("region", { name: "Assistant introduction" })).toContainText("Review before you rely on this");
  await p.getByRole("button", { name: "Summarise open risks" }).click();
  await expect(p.getByRole("region", { name: "Assistant answer" })).toContainText("AI-assisted");
  await expect(p.getByRole("region", { name: "Assistant answer" })).toContainText("Review before you rely on this");

  await p.getByRole("tab", { name: "Custom agents" }).click();
  await expect(p.getByRole("table", { name: "Agents", exact: true })).toBeVisible();
  await p.getByRole("button", { name: "Create agent" }).click();
  await expect(p).toHaveURL(/\/ws\/assistant\/new$/);
  await p.getByRole("button", { name: "Create agent" }).last().click();
  await expect(p.locator("#ag-err")).toContainText("Agent name is required.");
  await p.getByLabel(/^Agent name/).fill("Control test monitor");
  await p.getByRole("button", { name: "Create agent" }).last().click();
  await expect(p).toHaveURL(/\/ws\/assistant$/);
  await p.getByRole("tab", { name: "Custom agents" }).click();
  await expect(p.getByRole("table", { name: "Agents", exact: true })).toContainText("Control test monitor");
  await expect(p.getByRole("table", { name: "Agents", exact: true })).toContainText("Pending approval");

  await p.getByRole("tab", { name: "Run log" }).click();
  await expect(p.getByRole("table", { name: "Agent runs", exact: true })).toBeVisible();
  await p.getByRole("tab", { name: "MCP access" }).click();
  await expect(p.getByRole("table", { name: "MCP servers", exact: true })).toBeVisible();
  expect(s.errors).toEqual([]);
  await s.close();
});

test("ai governance: KPI strip, inventory table, a system is a page with tabs, register and edit are pages", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/ai");
  await expect(p.getByRole("group", { name: "AI governance summary" })).toContainText("Shadow AI found");
  const table = p.getByRole("table", { name: "AI inventory", exact: true });
  await expect(table).toBeVisible();

  await table.locator("tbody tr").first().locator("td").nth(1).click();
  await expect(p).toHaveURL(/\/ws\/ai\/[^/]+$/);
  const id = new URL(p.url()).pathname.split("/").pop()!;
  await expect(p.getByRole("navigation", { name: "Breadcrumb" })).toContainText(id);
  await p.getByRole("tab", { name: "EU AI Act" }).click();
  await expect(p.getByText("EU AI Act classification").first()).toBeVisible();
  await p.getByRole("tab", { name: "Overview" }).click();
  await p.getByRole("button", { name: /^Edit$/ }).click();
  await expect(p).toHaveURL(new RegExp(`/ws/ai/${id}/edit$`));
  await expect(p.getByLabel("Name")).not.toHaveValue("");
  await p.getByRole("button", { name: "Cancel" }).click();
  await expect(p).toHaveURL(new RegExp(`/ws/ai/${id}$`));

  await gotoModule(p, "/ws/ai");
  await p.getByRole("button", { name: "Register system" }).click();
  await expect(p).toHaveURL(/\/ws\/ai\/new$/);
  await p.getByRole("button", { name: "Register", exact: true }).click();
  await expect(p.locator("#rN-err")).toBeVisible();
  await p.getByLabel(/^Name/).fill("Fraud detection model");
  await p.getByRole("button", { name: "Register", exact: true }).click();
  await expect(p).toHaveURL(/\/ws\/ai\/[^/]+$/);
  await expect(p.getByRole("heading", { level: 1, name: "Fraud detection model" })).toBeVisible();

  await nextPush(p, "/ws/ai/NOPE-1");
  await expect(p.getByRole("heading", { level: 1, name: "AI system not found" })).toBeVisible();
  expect(s.errors).toEqual([]);
  await s.close();
});

test("questionnaires: in-flight table, a questionnaire is a page, import and add answer are pages", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/questionnaires");
  const table = p.getByRole("table", { name: "Questionnaires", exact: true });
  await expect(table).toBeVisible();
  await table.locator("tbody tr").first().locator("td").nth(1).click();
  await expect(p).toHaveURL(/\/ws\/questionnaires\/Q-[^/]+$/);
  await expect(p.getByRole("heading", { level: 3, name: "Completion" })).toBeVisible();
  await p.getByRole("link", { name: "Questionnaires" }).first().click();

  await p.getByRole("button", { name: "Import questionnaire" }).click();
  await expect(p).toHaveURL(/\/ws\/questionnaires\/import$/);
  await p.getByRole("button", { name: "Import", exact: true }).click();
  await expect(p.locator("#qi-err")).toContainText("Name is required.");
  await p.getByLabel(/^Name/).fill("Acme, CAIQ");
  await p.getByRole("button", { name: "Import", exact: true }).click();
  await expect(p).toHaveURL(/\/ws\/questionnaires\/Q-[^/]+$/);
  await expect(p.getByRole("heading", { level: 1, name: "Acme, CAIQ" })).toBeVisible();

  await gotoModule(p, "/ws/questionnaires");
  await p.getByRole("tab", { name: "Answer library" }).click();
  await expect(p.getByRole("table", { name: "Answer library", exact: true })).toBeVisible();
  await p.getByRole("button", { name: "Add answer" }).click();
  await expect(p).toHaveURL(/\/ws\/questionnaires\/answer$/);
  await p.getByRole("button", { name: "Add to library" }).click();
  await expect(p.locator("#qa-err")).toContainText("required");
  await nextPush(p, "/ws/questionnaires/Q-NOPE");
  await expect(p.getByRole("heading", { level: 1, name: "Questionnaire not found" })).toBeVisible();
  expect(s.errors).toEqual([]);
  await s.close();
});
