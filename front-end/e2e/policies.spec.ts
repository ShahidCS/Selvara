import { test, expect } from "@playwright/test";
import { enabledButtons, gotoModule, openAs } from "./helpers";

/* Wave B pilot: a policy is a record page. Create and edit are form pages; short decision dialogs stay dialogs. */
test("create a policy on its own page, land on its record, edit it, and the stepper and breadcrumb follow", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/policies");
  await p.getByRole("button", { name: "New policy" }).click();
  await expect(p).toHaveURL(/\/ws\/policies\/new$/);
  await expect(p.getByRole("heading", { level: 1, name: "New policy" })).toBeVisible();
  await expect(p.getByRole("navigation", { name: "Breadcrumb" })).toContainText("New");
  // two numbered sections, labelled
  await expect(p.getByRole("heading", { level: 2, name: "Policy" })).toBeVisible();
  await expect(p.getByRole("heading", { level: 2, name: "Review" })).toBeVisible();

  // validation stays on the page and is announced
  await p.getByRole("button", { name: "Create policy" }).click();
  await expect(p.locator("#pl-err")).toContainText("Policy name is required.");
  await expect(p.locator("#pl-err")).toHaveAttribute("role", "alert");

  await p.getByLabel(/^Policy name/).fill("Remote Working Policy");
  await p.getByLabel("Policy text").fill("Staff may work remotely from approved locations.");
  await p.getByRole("button", { name: "Create policy" }).click();
  await expect(p).toHaveURL(/\/ws\/policies\/P-[\w-]+$/);
  await expect(p.getByRole("heading", { level: 1, name: "Remote Working Policy" })).toBeVisible();
  const id = new URL(p.url()).pathname.split("/").pop()!;
  // a new policy starts at Draft in the progress stepper
  await expect(p.getByRole("list", { name: "Version progress" }).locator('[aria-current="step"]')).toContainText("Draft");

  // segregation of duties on the page: the author cannot publish, and the button says why
  const publish = p.getByRole("button", { name: "Publish", exact: true });
  await expect(publish).toBeDisabled();
  expect(await publish.getAttribute("title")).toBeTruthy();

  // edit is a page too, prefilled
  await p.getByRole("button", { name: /^Edit$/ }).click();
  await expect(p).toHaveURL(new RegExp(`/ws/policies/${id}/edit$`));
  await expect(p.getByLabel(/^Policy name/)).toHaveValue("Remote Working Policy");
  await p.getByLabel(/^Policy name/).fill("Remote and Hybrid Working Policy");
  await p.getByRole("button", { name: "Save changes" }).click();
  await expect(p).toHaveURL(new RegExp(`/ws/policies/${id}$`));
  await expect(p.getByRole("heading", { level: 1, name: "Remote and Hybrid Working Policy" })).toBeVisible();

  // the register shows it, and the row opens the page
  await p.getByRole("link", { name: "Policies" }).first().click();
  await p.getByRole("searchbox", { name: "Search Policies" }).fill("Hybrid");
  await expect(p.getByRole("table", { name: "Policies", exact: true }).locator("tbody tr")).toHaveCount(1);
  expect(s.errors).toEqual([]);
  await s.close();
});

test("leaving a form with typed work asks first: Stay keeps it, Discard leaves", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/policies/new");
  // nothing typed: leaving does not ask
  await p.getByRole("button", { name: "Cancel" }).click();
  await expect(p).toHaveURL(/\/ws\/policies$/);

  await gotoModule(p, "/ws/policies/new");
  await p.getByLabel(/^Policy name/).fill("Half-written policy");
  await p.getByRole("button", { name: "Cancel" }).click();
  const dlg = p.getByRole("dialog", { name: "Discard unsaved changes?" });
  await expect(dlg).toBeVisible();
  await dlg.getByRole("button", { name: "Stay on this page" }).click();
  await expect(dlg).toBeHidden();
  await expect(p).toHaveURL(/\/ws\/policies\/new$/);
  await expect(p.getByLabel(/^Policy name/)).toHaveValue("Half-written policy");

  // the sidebar is guarded too
  await p.getByRole("button", { name: /^Evidence/ }).first().click();
  await expect(dlg).toBeVisible();
  await dlg.getByRole("button", { name: "Discard changes" }).click();
  await expect(p).toHaveURL(/\/ws\/evidence/);
  expect(s.errors).toEqual([]);
  await s.close();
});

test("an unknown policy says so with a way back; a role that cannot create sees why, not a form", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  await gotoModule(s.page, "/ws/policies/NOPE-1");
  await expect(s.page.getByRole("heading", { level: 1, name: "Policy not found" })).toBeVisible();
  await s.page.getByRole("link", { name: "Policies" }).first().click();
  await expect(s.page).toHaveURL(/\/ws\/policies$/);
  await s.close();

  const e = await openAs(browser, ti, "employee");
  await gotoModule(e.page, "/ws/policies/new");
  await expect(e.page.getByText("Only an admin or owner can create policies.")).toBeVisible();
  await expect(e.page.locator("main form")).toHaveCount(0);
  await e.close();
});

test("an employee reads and acknowledges a policy but has no workflow controls", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "employee");
  const p = s.page;
  await gotoModule(p, "/ws/policies");
  await expect(p.getByRole("button", { name: "New policy" })).toBeDisabled();
  await p.getByRole("table", { name: "Policies", exact: true }).locator("tbody tr").first().locator("td").nth(2).click();
  await expect(p).toHaveURL(/\/ws\/policies\/P-/);
  await expect(p.getByText(/Read-only for your role/)).toBeVisible();
  expect(await enabledButtons(p, /^(Edit|New draft|Submit|Approve|Publish|Request changes|Withdraw|Emergency|Reassign|Map control)/i)).toEqual([]);
  expect(s.errors).toEqual([]);
  await s.close();
});

test("the browser Back button is guarded too: the address is restored and Discard then goes back", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/policies");
  await p.getByRole("button", { name: "New policy" }).click();      // client-side navigation, so Back is a popstate
  await expect(p).toHaveURL(/\/ws\/policies\/new$/);
  await p.getByLabel(/^Policy name/).fill("Typed but not saved");
  await p.goBack();
  const dlg = p.getByRole("dialog", { name: "Discard unsaved changes?" });
  await expect(dlg).toBeVisible();
  await expect(p).toHaveURL(/\/ws\/policies\/new$/);
  await dlg.getByRole("button", { name: "Stay on this page" }).click();
  await expect(p.getByLabel(/^Policy name/)).toHaveValue("Typed but not saved");
  await p.goBack();
  await dlg.getByRole("button", { name: "Discard changes" }).click();
  await expect(p).toHaveURL(/\/ws\/policies$/);
  expect(s.errors).toEqual([]);
  await s.close();
});
