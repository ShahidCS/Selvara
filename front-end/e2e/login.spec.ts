import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Browser, type TestInfo } from "@playwright/test";
import { DEMO_PASS, demoEmail, gotoModule, heading, nextPush, openAs } from "./helpers";

/* Standard sign-in replaces the role switcher. DEMO ONLY: synthetic accounts, no backend (src/lib/session.ts). */
async function signedOut(browser: Browser, ti: TestInfo) {
  const ctx = await browser.newContext({ baseURL: ti.project.use.baseURL, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.setItem("assurance.v1", JSON.stringify({ theme: "light" })); } catch { /* ignore */ } });
  return page;
}
const axe = async (p: import("@playwright/test").Page) => {
  const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id} x${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
};

test("signed out, the workspace sends you to sign in; a wrong password gets a generic message; the demo account signs in", async ({ browser }, ti) => {
  const p = await signedOut(browser, ti);
  await p.goto("/ws/overview");
  await p.waitForURL(/\/login$/);
  await expect(p.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();
  await expect(p.getByText(/demo\.selvara\.test/)).toHaveCount(0); // demo accounts are documented, not shown
  expect(await axe(p)).toEqual([]);
  await p.getByLabel("Work email").fill(demoEmail("Jordan Avery"));
  await p.getByLabel("Password", { exact: true }).fill("not-the-password");
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(p.getByRole("alert").filter({ hasText: "Email or password is incorrect." })).toBeVisible();
  await p.getByLabel("Password", { exact: true }).fill(DEMO_PASS);
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
  await p.waitForURL(/\/ws\/overview$/);
  await expect(heading(p)).toBeVisible();
  await p.getByRole("button", { name: /^Account:/ }).click();
  await expect(p.getByRole("menuitem", { name: /Company Admin/ })).toHaveCount(0); // no role switcher
  await p.getByRole("menuitem", { name: "Sign out" }).click();
  await p.waitForURL(/\/login$/);
  await p.goto("/ws/team");
  await p.waitForURL(/\/login$/);
});

test("a new person asks to join, a company admin approves, and they sign in as an Employee under their own name", async ({ browser }, ti) => {
  const p = await signedOut(browser, ti);
  const pw = "Lantern-orbit-Quince-71";
  await p.goto("/login");
  await p.getByRole("button", { name: "Request to join" }).click();
  await expect(p.getByRole("heading", { name: "Request to join", level: 1 })).toBeVisible();
  expect(await axe(p)).toEqual([]);
  await p.getByLabel("Full name").fill("Alex Kim");
  await p.getByLabel("Work email").fill("alex.kim@company.example");
  await p.getByLabel("Password", { exact: true }).fill(pw);
  await p.getByRole("button", { name: "Send request" }).click();
  await expect(p.getByRole("heading", { name: "Request sent" })).toBeVisible();
  await p.getByRole("button", { name: "Back to sign in" }).click();

  await p.getByLabel("Work email").fill("alex.kim@company.example");
  await p.getByLabel("Password", { exact: true }).fill(pw);
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(p.getByRole("alert").filter({ hasText: "waiting for a company admin" })).toBeVisible();

  await p.getByLabel("Work email").fill(demoEmail("Jordan Avery"));
  await p.getByLabel("Password", { exact: true }).fill(DEMO_PASS);
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
  await p.waitForURL(/\/ws\/overview$/);
  await nextPush(p, "/ws/team");
  const card = p.getByRole("region", { name: "Requests to join" });
  await expect(card).toContainText("alex.kim@company.example");
  await card.getByRole("button", { name: "Approve: Alex Kim" }).click();
  const dlg = p.getByRole("dialog", { name: /Approve request to join, Alex Kim/ });
  await dlg.getByLabel(/^Reason/).fill("Joined the risk team this week");
  await dlg.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(p.getByText("Alex Kim can now sign in as an Employee")).toBeVisible();
  await expect(card).toHaveCount(0);

  await p.getByRole("button", { name: /^Account:/ }).click();
  await p.getByRole("menuitem", { name: "Sign out" }).click();
  await p.waitForURL(/\/login$/);
  await p.getByLabel("Work email").fill("alex.kim@company.example");
  await p.getByLabel("Password", { exact: true }).fill(pw);
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
  await p.waitForURL(/\/ws\/overview$/);
  await expect(p.getByRole("button", { name: /^Account:/ })).toContainText("Alex Kim");
  await expect(p.getByRole("button", { name: /^Account:/ })).toContainText("Employee");
});

test("repeated failures from one browser block its network address, even for the right password", async ({ browser }, ti) => {
  const p = await signedOut(browser, ti);
  await p.goto("/login");
  const accounts = ["Jordan Avery", "Casey Morgan", "Owen Hart"];
  for (let i = 0; i < 10; i++) {
    await p.getByLabel("Work email").fill(demoEmail(accounts[i % 3]));
    await p.getByLabel("Password", { exact: true }).fill("wrong-" + i);
    await p.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(p.getByRole("alert").filter({ hasText: /incorrect|Too many/ })).toBeVisible();
  }
  await expect(p.getByRole("alert").filter({ hasText: "from your network" })).toBeVisible();
  await p.getByLabel("Work email").fill(demoEmail("Taylor Reed"));
  await p.getByLabel("Password", { exact: true }).fill(DEMO_PASS);
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(p.getByRole("alert").filter({ hasText: "from your network" })).toBeVisible();
  await expect(p).toHaveURL(/\/login$/);
});

test("platform support sees blocked addresses read-only; an elevated super admin lifts a permanent block", async ({ browser }, ti) => {
  const sup = await openAs(browser, ti, "support"); const sp = sup.page;
  await gotoModule(sp, "/admin/security");
  const card = sp.getByRole("region", { name: "Blocked sign-in addresses" });
  await expect(card).toContainText("203.0.113.24");
  await expect(card).toContainText("Permanent");
  await expect(card.getByRole("button", { name: /^Lift block/ })).toHaveCount(0);
  await sup.close();

  const s = await openAs(browser, ti, "super"); const p = s.page;
  await gotoModule(p, "/admin/security");
  const c = p.getByRole("region", { name: "Blocked sign-in addresses" });
  await expect(c.getByRole("button", { name: "Lift block: 203.0.113.24" })).toBeDisabled(); // not elevated
  await nextPush(p, "/admin/elevation");
  await expect(heading(p)).toBeVisible();
  await p.locator("main button", { hasText: /Continue|Request/ }).first().click();
  await p.fill("#elReason", "Reviewing sign-in blocks for a customer");
  await p.fill("#elTicket", "SEC-1234");
  await p.locator("main button", { hasText: /Continue to hardware key|Confirm|Elevate/ }).first().click();
  await p.locator("main button, .modal.on button", { hasText: /Simulate key touch/ }).first().click();
  await expect(p.locator("main")).toContainText(/Elevated session|expires in/i, { timeout: 15_000 });
  await nextPush(p, "/admin/security");
  await c.getByRole("button", { name: "Lift block: 203.0.113.24" }).click();
  const dlg = p.getByRole("dialog", { name: /Lift block on 203.0.113.24/ });
  await dlg.getByLabel(/^Reason/).fill("Customer's new office address, verified by phone");
  await p.waitForTimeout(600);
  expect(await axe(p)).toEqual([]);
  await dlg.getByRole("button", { name: "Lift block" }).click();
  await expect(p.getByText("Block lifted on 203.0.113.24")).toBeVisible();
  await expect(c).not.toContainText("203.0.113.24");
});
