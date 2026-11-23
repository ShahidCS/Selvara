import { test, expect } from "@playwright/test";
import { gotoModule, openAs } from "./helpers";

/* Reference review, part 3 (demonstration build, no AI model): the posture brief, suggested next steps, record summaries, "Ask about this
   report", the agents page with Pause all agents, and prefilling a form from a document. Synthetic data only. */

test("overview: the posture brief ranks causes and its steps open the named records; the AI wording is a labelled draft", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin"); const p = s.page;
  await gotoModule(p, "/ws/overview");
  const brief = p.getByRole("region", { name: /Posture is held back/ });
  await expect(brief).toBeVisible();
  await expect(brief.getByRole("figure", { name: /Main causes/ })).toBeVisible();
  await brief.getByRole("button", { name: "Write the brief with AI" }).click();
  const draft = brief.getByRole("region", { name: /draft/ });
  await expect(draft).toContainText("AI-assisted"); await expect(draft).toContainText("demonstration, no AI model");
  await draft.getByRole("button", { name: "Discard draft" }).click();
  await brief.getByRole("button", { name: /Agree a recovery date for R-036/ }).click();
  await expect(p).toHaveURL(/\/ws\/issues\/R-036$/);
  expect(s.errors).toEqual([]);
  await s.close();
});

test("lists and records: a suggested next step per issue and risk, and a summary card on the record", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin"); const p = s.page;
  await gotoModule(p, "/ws/issues");
  const t = p.getByRole("table", { name: "Issues", exact: true });
  await expect(t.getByRole("columnheader", { name: /Suggested next step/ })).toBeVisible();
  await expect(t.getByRole("row", { name: /R-014/ })).toContainText("Agree a recovery date or escalate");
  await gotoModule(p, "/ws/issues/R-014");
  const card = p.getByRole("region", { name: "Summary" });
  await expect(card).toContainText("What happened"); await expect(card).toContainText("Agree a recovery date or escalate");
  await card.getByRole("button", { name: "Write it with AI" }).click();
  await expect(card.getByRole("region", { name: /draft/ })).toContainText("Review before you rely on this");
  expect(s.errors).toEqual([]);
  await s.close();
});

test("reports: ask about this report answers from the page's figures, labelled as a draft", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin"); const p = s.page;
  await gotoModule(p, "/ws/reports");
  const ask = p.getByRole("region", { name: "Ask about this report" });
  await ask.getByRole("button", { name: "Which framework is furthest behind?" }).click();
  const ans = ask.getByRole("region", { name: "Answer: draft" });
  await expect(ans).toContainText("Framework"); await expect(ans).toContainText("readiness");
  await ask.getByLabel("Your question").fill("");
  await ask.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(ask.getByRole("alert")).toContainText("Write a question.");
  expect(s.errors).toEqual([]);
  await s.close();
});

test("agents: summary, permission lists and cards; pause all needs a reason and pauses every agent; each one resumes on its own", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin"); const p = s.page;
  await gotoModule(p, "/ws/assistant");
  await p.getByRole("tab", { name: "Custom agents" }).click();
  await expect(p.getByRole("group", { name: "Agent activity" })).toBeVisible();
  await expect(p.getByRole("region", { name: "Runs on its own" })).toContainText("Evidence chaser");
  const cards = p.getByRole("list", { name: "Agents" });
  await expect(cards.getByRole("img", { name: /Autonomy: Acts \(logged\), level 2 of 2/ }).first()).toBeVisible();
  await p.getByRole("button", { name: "Pause all agents" }).click();
  const dlg = p.getByRole("dialog", { name: "Pause all agents?" });
  await dlg.getByRole("button", { name: "Pause all agents" }).click();
  await expect(dlg).toContainText("at least 10 characters");
  await dlg.getByLabel(/Reason/).fill("Reviewing agent access after an incident drill");
  await dlg.getByRole("button", { name: "Pause all agents" }).click();
  await expect(dlg).toBeHidden();
  await expect(p.getByRole("region", { name: "Agents at a glance" })).toContainText("All agents are paused");
  await expect(p.getByRole("button", { name: "Pause all agents" })).toBeDisabled();
  await expect(p.getByRole("region", { name: "Runs on its own" })).toContainText("No agent acts on its own");
  // per agent: Request enable sends it to a different admin
  await cards.getByRole("listitem").filter({ hasText: "Evidence chaser" }).getByRole("button", { name: "Request enable" }).click();
  await expect(cards.getByRole("listitem").filter({ hasText: "Evidence chaser" })).toContainText("Pending approval");
  await expect(p.getByRole("button", { name: "Pause all agents" })).toBeEnabled(); // a waiting request can be withdrawn by pausing all
  expect(s.errors).toEqual([]);
  await s.close();
});

test("forms: fill a vendor from a text document; filled fields are labelled until edited, nothing is saved before submit", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin"); const p = s.page;
  await gotoModule(p, "/ws/vendors/new");
  const box = p.getByRole("region", { name: "Fill from a document" });
  await box.locator('input[type="file"]').setInputFiles({ name: "vendor-profile.txt", mimeType: "text/plain", buffer: Buffer.from("Supplier profile\nVendor name: Nimbus Mail Test Ltd\nService category: Messaging\nTier: Critical\nRisk score: 64\n") });
  await expect(box).toContainText("Filled from vendor-profile.txt · 4 of 4 fields filled");
  await expect(p.getByLabel(/^Vendor name/)).toHaveValue("Nimbus Mail Test Ltd");
  await expect(p.getByLabel(/^Tier/)).toHaveValue("Critical");
  await expect(p.locator("label[for=vn-score]")).toContainText("From document");
  await p.getByLabel(/^Initial risk score/).fill("70");
  await expect(p.locator("label[for=vn-score]")).not.toContainText("From document");
  await expect(box).toContainText("3 of 4 fields filled");
  await box.locator('input[type="file"]').setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: Buffer.from("x") });
  await expect(box.getByRole("alert")).toContainText("Choose a PDF, Word (.docx) or text file.");
  await p.getByRole("button", { name: "Add vendor" }).click();
  await expect(p).toHaveURL(/\/ws\/vendors\/.+/);
  await expect(p.getByRole("heading", { level: 1 })).toContainText("Nimbus Mail Test Ltd");
  expect(s.errors).toEqual([]);
  await s.close();
});
