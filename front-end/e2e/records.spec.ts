import { test, expect } from "@playwright/test";
import { gotoModule, nextPush, openAs } from "./helpers";

/* Wave B: issues and controls are record pages; create, edit and request-exception are form pages. Short decisions stay dialogs. */
test("issue: create on its own page, land on the record, add a task, move status, edit, delete back to the register", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/issues");
  await p.getByRole("button", { name: "New issue" }).click();
  await expect(p).toHaveURL(/\/ws\/issues\/new$/);
  await expect(p.getByRole("heading", { level: 1, name: "New issue" })).toBeVisible();
  await expect(p.getByRole("heading", { level: 2, name: "Issue" })).toBeVisible();
  await expect(p.getByRole("heading", { level: 2, name: "Ownership and timing" })).toBeVisible();

  await p.getByRole("button", { name: "Create issue" }).click();
  await expect(p.locator("#is-err")).toContainText("Title is required.");
  await expect(p.locator("#is-err")).toHaveAttribute("role", "alert");

  await p.getByLabel(/^Title/).fill("Rotate the shared service account key");
  await p.getByLabel("Severity").selectOption("Low");
  await p.getByRole("button", { name: "Create issue" }).click();
  await expect(p).toHaveURL(/\/ws\/issues\/R-[\w-]+$/);
  const id = new URL(p.url()).pathname.split("/").pop()!;
  await expect(p.getByRole("heading", { level: 1, name: "Rotate the shared service account key" })).toBeVisible();
  await expect(p.getByRole("navigation", { name: "Breadcrumb" })).toContainText(id);
  await expect(p.getByRole("list", { name: "Issue progress" }).locator('[aria-current="step"]')).toContainText("Open");

  // a short dialog still handles the task, then the page updates behind it
  await p.getByRole("button", { name: "Add task" }).click();
  await p.getByLabel(/^Task/).fill("Issue a new key");
  await p.getByRole("dialog").getByRole("button", { name: "Add", exact: true }).click();
  await expect(p.getByText("Issue a new key")).toBeVisible();
  await expect(p.getByText("0 of 1 done")).toBeVisible();

  await p.getByRole("button", { name: "In progress", exact: true }).click();
  await expect(p.getByRole("list", { name: "Issue progress" }).locator('[aria-current="step"]')).toContainText("In progress");

  await p.getByRole("button", { name: /^Edit$/ }).click();
  await expect(p).toHaveURL(new RegExp(`/ws/issues/${id}/edit$`));
  await expect(p.getByLabel(/^Title/)).toHaveValue("Rotate the shared service account key");
  await p.getByLabel(/^Title/).fill("Rotate the shared service-account key");
  await p.getByRole("button", { name: "Save changes" }).click();
  await expect(p).toHaveURL(new RegExp(`/ws/issues/${id}$`));
  await expect(p.getByRole("heading", { level: 1, name: "Rotate the shared service-account key" })).toBeVisible();

  await p.getByRole("button", { name: /^Delete$/ }).click();
  await p.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(p).toHaveURL(/\/ws\/issues$/);
  expect(s.errors).toEqual([]);
  await s.close();
});

test("issue: leaving the form with typed work asks first; an unknown issue says so", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/issues/new");
  await p.getByLabel(/^Title/).fill("Half written");
  await p.getByRole("button", { name: "Cancel" }).click();
  const dlg = p.getByRole("dialog", { name: "Discard unsaved changes?" });
  await expect(dlg).toBeVisible();
  await dlg.getByRole("button", { name: "Discard changes" }).click();
  await expect(p).toHaveURL(/\/ws\/issues$/);
  await expect(p.getByRole("table", { name: "Issues", exact: true })).toBeVisible();

  await nextPush(p, "/ws/issues/NOPE-1"); // client navigation: a full load right after leaving a guarded form can be aborted by the browser
  await expect(p.getByRole("heading", { level: 1, name: "Issue not found" })).toBeVisible();
  await p.getByRole("link", { name: "Issues" }).first().click();
  await expect(p).toHaveURL(/\/ws\/issues$/);
  expect(s.errors).toEqual([]);
  await s.close();
});

test("control: the record page, a test page, the request-exception form and the custom control form", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/controls");
  await p.getByRole("table", { name: "Controls", exact: true }).locator("tbody tr").first().locator("td").nth(1).click();
  await expect(p).toHaveURL(/\/ws\/controls\/[^/]+$/);
  const cid = decodeURIComponent(new URL(p.url()).pathname.split("/").pop()!);
  await expect(p.getByRole("navigation", { name: "Breadcrumb" })).toContainText(cid);
  await expect(p.getByRole("heading", { level: 3, name: "Owner attestation" })).toBeVisible();
  await expect(p.getByRole("heading", { level: 3, name: "Exceptions & waivers" })).toBeVisible();

  // request exception is a form page; validation is announced and nothing is lost on Cancel without typing
  await p.getByRole("button", { name: "Request exception" }).click();
  await expect(p).toHaveURL(/\/exception$/);
  await expect(p.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Request exception");
  await p.getByRole("button", { name: "Request exception" }).last().click();
  await expect(p.locator("#cx-err")).toContainText("at least 10 characters");
  await p.getByRole("button", { name: "Cancel" }).click();
  await expect(p).toHaveURL(new RegExp(`/ws/controls/${encodeURIComponent(cid)}$`));

  // custom control
  await gotoModule(p, "/ws/controls");
  await p.getByRole("button", { name: "Add custom control" }).click();
  await expect(p).toHaveURL(/\/ws\/controls\/new$/);
  await p.getByRole("button", { name: "Create control" }).click();
  await expect(p.locator("#cc-err")).toContainText("Control title is required.");
  await p.getByLabel(/^Control title/).fill("Secrets rotated every 90 days");
  await p.getByRole("button", { name: "Create control" }).click();
  await expect(p).toHaveURL(/\/ws\/controls\/[^/]+$/);
  await expect(p.getByRole("heading", { level: 1, name: "Secrets rotated every 90 days" })).toBeVisible();

  // tests: the register row opens a test page; the breadcrumb says Tests
  await gotoModule(p, "/ws/controls");
  await p.getByRole("tab", { name: "Tests" }).click();
  await p.getByRole("table", { name: "Tests", exact: true }).locator("tbody tr").first().locator("td").nth(1).click();
  await expect(p).toHaveURL(/\/ws\/controls\/test\/[^/]+$/);
  await expect(p.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Tests");
  await expect(p.getByRole("heading", { level: 3, name: "Test logic" })).toBeVisible();
  await p.getByRole("link", { name: "Controls" }).first().click();
  await expect(p).toHaveURL(/\/ws\/controls$/);

  await gotoModule(p, "/ws/controls/test/new");
  await expect(p.getByRole("heading", { level: 1, name: "Build custom test" })).toBeVisible();
  await p.getByRole("button", { name: "Create test" }).click();
  await expect(p.locator("#tc-err")).toContainText("Test name is required.");
  expect(s.errors).toEqual([]);
  await s.close();
});

test("control: an unknown control or test says so; a failing control in the bell opens its record", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/controls/NOPE-1");
  await expect(p.getByRole("heading", { level: 1, name: "Control not found" })).toBeVisible();
  await gotoModule(p, "/ws/controls/test/NOPE-1");
  await expect(p.getByRole("heading", { level: 1, name: "Test not found" })).toBeVisible();
  await gotoModule(p, "/ws/controls/NOPE-1/exception");
  await expect(p.getByRole("heading", { level: 1, name: "Control not found" })).toBeVisible();

  await gotoModule(p, "/ws/overview");
  await p.getByRole("button", { name: /Notifications/ }).click();
  await p.getByRole("dialog").getByRole("button", { name: /is failing/ }).first().click();
  await expect(p).toHaveURL(/\/ws\/controls\/[^/]+$/);
  expect(s.errors).toEqual([]);
  await s.close();
});
