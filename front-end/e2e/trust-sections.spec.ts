import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { gotoModule, nextPush, openAs, switchTo } from "./helpers";

/* Security fix F1-02 (demonstration): the company chooses what visitors of its Trust Center see. Showing the live control status needs a
   different admin or owner; documents under NDA are counted, never named, on the public view. One session for the four-eyes step, because
   approvals live in memory. */
const card = (p: Page) => p.getByRole("region", { name: "What visitors can see" });
const sw = (p: Page, name: string) => card(p).getByRole("switch", { name });
const h3 = (p: Page, name: string) => p.locator("main#content h3", { hasText: new RegExp(`^${name}$`) });
async function preview(p: Page) { await p.getByRole("button", { name: "Preview public page" }).click(); await expect(p.getByText("Preview: this is the page your customers see.")).toBeVisible(); }
async function backToAdmin(p: Page) { await p.getByRole("button", { name: "Back to admin" }).click(); await expect(card(p)).toBeVisible(); }

test("an admin chooses the sections; live control status needs a second admin; the preview follows", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin"); const p = s.page;
  await gotoModule(p, "/ws/trust");
  await expect(card(p)).toBeVisible();
  for (const name of ["Documents", "Frequently asked questions", "Sub-processors", "Updates"]) await expect(sw(p, name)).toHaveAttribute("aria-checked", "true");
  await expect(sw(p, "Live control status")).toHaveAttribute("aria-checked", "false"); // off until the company opts in

  // the preview: public documents by name, documents under NDA only counted, no live control status
  await preview(p);
  const docs = p.locator('[data-tour="trust-pub-docs"]');
  await expect(docs).toContainText("ISO/IEC 27001 certificate");
  await expect(docs).not.toContainText("SOC 2 Type II report");
  await expect(docs).not.toContainText("Penetration test summary");
  await expect(p.getByTestId("trust-nda-count")).toContainText("2 documents under NDA");
  await expect(h3(p, "Live control status")).toHaveCount(0);
  await expect(h3(p, "Frequently asked questions")).toBeVisible();

  // hiding a section applies at once
  await backToAdmin(p);
  await sw(p, "Frequently asked questions").click();
  await expect(sw(p, "Frequently asked questions")).toHaveAttribute("aria-checked", "false");
  await sw(p, "Documents").click();
  await expect(sw(p, "Documents")).toHaveAttribute("aria-checked", "false");
  await preview(p);
  await expect(h3(p, "Frequently asked questions")).toHaveCount(0);
  await expect(p.locator('[data-tour="trust-pub-docs"]')).toHaveCount(0);
  await backToAdmin(p);
  await sw(p, "Documents").click();
  await expect(sw(p, "Documents")).toHaveAttribute("aria-checked", "true");

  // showing the live control status is a request: the requester cannot approve it
  await sw(p, "Live control status").click();
  await expect(sw(p, "Live control status")).toHaveAttribute("aria-checked", "false");
  await expect(sw(p, "Live control status")).toBeDisabled();
  const approveBtn = p.getByRole("button", { name: "Approve: Show the live control status on the Trust Center" });
  await expect(approveBtn).toBeDisabled();
  await p.waitForTimeout(400);
  const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id} x${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(bad, bad.join("\n")).toEqual([]);

  // a different admin approves; the preview then shows it
  await switchTo(p, "Casey Morgan");
  await nextPush(p, "/ws/trust");
  await expect(card(p)).toBeVisible();
  await p.getByRole("button", { name: "Approve: Show the live control status on the Trust Center" }).click();
  await p.getByRole("dialog").getByLabel(/^Reason/).fill("Agreed with the security lead to publish");
  await p.getByRole("dialog").getByRole("button", { name: "Confirm approve" }).click();
  await expect(sw(p, "Live control status")).toHaveAttribute("aria-checked", "true");
  await preview(p);
  await expect(h3(p, "Live control status")).toBeVisible();
  await expect(h3(p, "Frequently asked questions")).toHaveCount(0); // still hidden
  expect(s.errors).toEqual([]);
  await s.close();
});

test("a customer viewer sees documents under NDA as a count and requests them without naming one", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "viewer"); const p = s.page;
  await gotoModule(p, "/ws/trust");
  const docs = p.locator('[data-tour="trust-pub-docs"]');
  await expect(docs).toContainText("Information Security Policy (summary)");
  await expect(docs).not.toContainText("SOC 2 Type II report");
  await expect(p.getByTestId("trust-nda-count")).toContainText("2 documents under NDA");
  await expect(h3(p, "Live control status")).toHaveCount(0);
  await expect(p.getByRole("button", { name: "Accept NDA" })).toHaveCount(0); // nothing shared with them yet
  await p.getByRole("button", { name: "Request documents under NDA" }).click();
  const dlg = p.getByRole("dialog");
  await dlg.getByLabel(/^Your work email/).fill("lee.park@customer.example");
  await dlg.getByLabel(/^Reason/).fill("short");
  await dlg.getByRole("button", { name: "Send request" }).click();
  await expect(dlg.getByText("Give a reason of at least 10 characters.")).toBeVisible();
  await dlg.getByLabel(/^Reason/).fill("Vendor due diligence for our renewal");
  await dlg.getByRole("button", { name: "Send request" }).click();
  await expect(p.getByText("Request sent. You are told when it is decided.")).toBeVisible();
  expect(s.errors).toEqual([]);
  await s.close();
});

test("approving a request for documents under NDA needs a choice of documents", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin"); const p = s.page;
  await gotoModule(p, "/ws/trust");
  await p.getByRole("tab", { name: /Access & requests/ }).click();
  const row = p.getByRole("row", { name: /TR-13/ });
  await row.getByRole("button", { name: "Approve" }).click();
  const dlg = p.getByRole("dialog");
  for (const box of await dlg.getByRole("checkbox").all()) await box.uncheck();
  await dlg.getByRole("button", { name: "Approve and share" }).click();
  await expect(dlg.getByText("Select at least one document under NDA to grant.")).toBeVisible();
  await dlg.getByRole("checkbox", { name: "Penetration test summary 2026" }).check();
  await dlg.getByRole("button", { name: "Approve and share" }).click();
  await expect(p.getByText("Access approved for security@wayne.example")).toBeVisible();
  const acct = p.getByRole("row", { name: /Wayne/ });
  await expect(acct).toContainText("Penetration test summary 2026");
  await expect(acct).toContainText("NDA pending"); // approving never signs the NDA for them
  expect(s.errors).toEqual([]);
  await s.close();
});
