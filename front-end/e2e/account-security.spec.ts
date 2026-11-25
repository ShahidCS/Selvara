import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { DEMO_PASS, demoEmail, demoSecondStep, gotoModule, heading, nextPush, openAs, totpNow } from "./helpers";

/* Login and sign-up controls: challenge step, last sign-in, password reset, the account page, company settings. DEMO ONLY (src/lib/session.ts). */
async function signedOut(browser: Browser, ti: TestInfo) {
  const ctx = await browser.newContext({ baseURL: ti.project.use.baseURL, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("assurance.v1", JSON.stringify({ theme: "light" })); sessionStorage.setItem("seeded", "1"); } } catch { /* ignore */ } });
  return page;
}
const axe = async (p: Page) => {
  const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id} x${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
};
const fill = async (p: Page, email: string, pw: string) => {
  await p.getByLabel("Work email").fill(email);
  await p.getByLabel("Password", { exact: true }).fill(pw);
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
};

test("when the quick check cannot finish, it says so and offers Try again and Back instead of waiting forever", async ({ browser }, ti) => {
  const p = await signedOut(browser, ti);
  await p.goto("/login");
  for (let i = 0; i < 3; i++) { await fill(p, demoEmail("Jordan Avery"), "wrong-" + i); await expect(p.getByRole("alert").filter({ hasText: "incorrect" })).toBeVisible(); }
  await p.evaluate(() => {
    const d = crypto.subtle.digest.bind(crypto.subtle); (window as unknown as { __fail: boolean }).__fail = true;
    crypto.subtle.digest = async (a, b) => {
      if ((window as unknown as { __fail: boolean }).__fail && /^[0-9a-f]{32}:0$/.test(new TextDecoder().decode(b as ArrayBuffer))) throw new Error("The check could not be completed. Try again.");
      return d(a, b);
    };
  });
  await fill(p, demoEmail("Jordan Avery"), DEMO_PASS);
  await expect(p.getByRole("heading", { name: "Quick check" })).toBeVisible();
  await expect(p.locator("main").getByRole("alert")).toHaveText("The check could not be completed. Try again.");
  await expect(p.locator("main").getByRole("status")).toBeHidden();
  expect(await axe(p)).toEqual([]);
  await p.evaluate(() => { (window as unknown as { __fail: boolean }).__fail = false; });
  await p.getByRole("button", { name: "Try again" }).click();
  await demoSecondStep(p);
  await p.waitForURL(/\/ws\/overview$/, { timeout: 20_000 });
});

test("after three failures a quick check runs by itself; passing it leads to the second step and shows the failed attempts since the last sign-in", async ({ browser }, ti) => {
  const p = await signedOut(browser, ti);
  await p.goto("/login");
  for (let i = 0; i < 3; i++) { await fill(p, demoEmail("Jordan Avery"), "wrong-" + i); await expect(p.getByRole("alert").filter({ hasText: "incorrect" })).toBeVisible(); }
  // slow the check down a little so the step can be seen and checked; nothing is clicked
  await p.evaluate(() => {
    const d = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = async (a, b) => { // the check's first guess is "<seed>:0"
      if (/^[0-9a-f]{32}:0$/.test(new TextDecoder().decode(b as ArrayBuffer))) await new Promise((r) => setTimeout(r, 1500));
      return d(a, b);
    };
  });
  await fill(p, demoEmail("Jordan Avery"), DEMO_PASS);
  await expect(p.getByRole("heading", { name: "Quick check" })).toBeVisible();
  await expect(p.locator("main").getByRole("status")).toHaveText("Checking…");
  await expect(p.getByRole("button", { name: "Continue" })).toHaveCount(0);
  expect(await axe(p)).toEqual([]);
  await demoSecondStep(p);
  await p.waitForURL(/\/ws\/overview$/, { timeout: 20_000 });
  await expect(p.getByText(/3 failed sign-in attempts since then|first sign-in on record/)).toBeVisible();
  await nextPush(p, "/auth");
  await expect(p.getByRole("region", { name: "Security activity" })).toContainText("Signed in after 3 failed attempts");
});

/** Creates a real account through the product: request to join, a company admin approves, the person adds an authenticator. Returns its recovery codes. */
/** The authenticator key each real account added at its first sign-in (what the person's app holds). */
const KEYS = new Map<string, string>();
async function realAccount(p: Page, name: string, email: string, pw: string): Promise<string[]> {
  await p.goto("/login");
  await p.getByRole("button", { name: "Request to join" }).click();
  await p.getByLabel("Full name").fill(name); await p.getByLabel("Work email").fill(email); await p.getByLabel("Password", { exact: true }).fill(pw);
  await p.getByRole("button", { name: "Send request" }).click();
  await p.getByRole("button", { name: "Back to sign in" }).click();
  await fill(p, demoEmail("Jordan Avery"), DEMO_PASS); await demoSecondStep(p); await p.waitForURL(/\/ws\/overview$/);
  await nextPush(p, "/ws/team");
  await p.getByRole("region", { name: "Requests to join" }).getByRole("button", { name: `Approve: ${name}` }).click();
  await p.getByRole("dialog").getByLabel(/^Reason/).fill("Joined the team this week");
  await p.getByRole("dialog").getByRole("button", { name: "Approve", exact: true }).click();
  await expect(p.getByText(`${name} can now sign in as an Employee`)).toBeVisible();
  await p.getByRole("button", { name: /^Account:/ }).click(); await p.getByRole("menuitem", { name: "Sign out" }).click(); await p.waitForURL(/\/login$/);
  await fill(p, email, pw);
  await expect(p.getByRole("img", { name: "QR code to add Selvara to your authenticator app" })).toBeVisible(); // scan, or type the key
  await p.getByRole("radio", { name: "Enter key manually" }).click();
  const key = (await p.locator('[aria-labelledby="as-key-l"]').innerText()).replace(/\s/g, "");
  KEYS.set(email, key);
  await p.getByLabel("Authentication code").fill(totpNow(key)); await p.getByRole("button", { name: "Verify" }).click();
  const codes = (await p.getByRole("list", { name: "Recovery codes" }).getByRole("listitem").allInnerTexts()).map((c) => c.trim());
  await p.getByLabel("I have stored my recovery codes").check(); await p.getByRole("button", { name: "Continue" }).click();
  await p.waitForURL(/\/ws\/overview$/);
  return codes;
}

test("a real account: a recovery code signs in once; forgot password needs the link and the second factor, ends every session, then the new password works", async ({ browser }, ti) => {
  const p = await signedOut(browser, ti);
  const pw = "Lantern-orbit-Quince-71"; const next = "Copper-harbour-Violet-58"; const email = "rae.fox@company.example";
  const codes = await realAccount(p, "Rae Fox", email, pw);
  await nextPush(p, "/auth");
  await expect(p.getByRole("region", { name: "Two-step verification" })).toContainText("Recovery codes: 10 unused");
  await p.getByRole("button", { name: /^Account:/ }).click(); await p.getByRole("menuitem", { name: "Sign out" }).click(); await p.waitForURL(/\/login$/);
  // sign in again with a recovery code (the authenticator code from the set-up minute is already used)
  await fill(p, email, pw);
  await p.getByRole("button", { name: "Use a recovery code instead" }).click();
  await p.getByLabel("Recovery code").fill(codes[0]); await p.getByRole("button", { name: "Verify" }).click();
  await p.waitForURL(/\/ws\/overview$/);
  await p.getByRole("button", { name: /^Account:/ }).click(); await p.getByRole("menuitem", { name: "Sign out" }).click(); await p.waitForURL(/\/login$/);
  // forgot password
  await p.getByRole("button", { name: "Forgot password?" }).click();
  await p.getByLabel("Work email").fill(email);
  await p.getByRole("button", { name: "Send link" }).click();
  await expect(p.getByText(/If an account uses that email/)).toBeVisible();
  await p.getByRole("button", { name: "Open the reset link" }).click();
  await expect(p.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  expect(await axe(p)).toEqual([]);
  await p.getByLabel("Authentication or recovery code").fill(codes[0]); // already used
  await p.getByLabel("New password").fill(next);
  await p.getByRole("button", { name: "Reset password" }).click();
  await expect(p.getByRole("alert").filter({ hasText: "code is not correct" })).toBeVisible();
  await p.getByLabel("Authentication or recovery code").fill(codes[1]);
  await p.getByRole("button", { name: "Reset password" }).click();
  await expect(p.getByRole("heading", { name: "Password reset" })).toBeVisible();
  await p.getByRole("button", { name: "Back to sign in" }).click();
  await fill(p, email, pw);
  await expect(p.getByRole("alert").filter({ hasText: "incorrect" })).toBeVisible();
  await fill(p, email, next);
  await p.getByRole("button", { name: "Use a recovery code instead" }).click();
  await p.getByLabel("Recovery code").fill(codes[2]); await p.getByRole("button", { name: "Verify" }).click();
  await p.waitForURL(/\/ws\/overview$/);
});

test("demo accounts are labelled and limited; sessions and sign out the others", async ({ browser }, ti) => {
  const p = await signedOut(browser, ti);
  await p.goto("/login");
  await fill(p, demoEmail("Jordan Avery"), DEMO_PASS); await demoSecondStep(p);
  await p.waitForURL(/\/ws\/overview$/);
  await nextPush(p, "/auth");
  await expect(p.getByRole("tab", { name: "Your account" })).toHaveAttribute("aria-selected", "true");
  await expect(p.getByText(/Demo account\. Shared and synthetic/)).toBeVisible();
  await expect(p.getByRole("region", { name: "Change password" })).toHaveCount(0);
  const sessions = p.getByRole("list", { name: "Active sessions" });
  await expect(sessions.getByRole("listitem")).toHaveCount(2);
  await expect(sessions).toContainText("ends");
  expect(await axe(p)).toEqual([]);
  await p.getByRole("button", { name: "Sign out other sessions" }).click();
  await expect(sessions.getByRole("listitem")).toHaveCount(1);
  await p.getByRole("button", { name: /^Account:/ }).click();
  await expect(p.getByText("Company Admin · Demo account")).toBeVisible();
  await p.keyboard.press("Escape");
  await p.goto("/login"); // a full load keeps the session
  await p.waitForURL(/\/ws\/overview$/);
  await p.getByRole("button", { name: /^Account:/ }).click(); await p.getByRole("menuitem", { name: "Sign out" }).click(); await p.waitForURL(/\/login$/);
  await p.getByRole("button", { name: "Forgot password?" }).click();
  await p.getByLabel("Work email").fill(demoEmail("Jordan Avery")); await p.getByRole("button", { name: "Send link" }).click();
  await expect(p.getByText(/Demo accounts are shared: their password cannot be reset/)).toBeVisible();
  await expect(p.getByRole("button", { name: "Open the reset link" })).toHaveCount(0);
});

test("a company admin sets the PCI DSS lockout and requests a trusted office network; platform security lists the reputation ranges", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin"); const p = s.page;
  await gotoModule(p, "/ws/team");
  await p.getByRole("tab", { name: "Review cycles & SLAs" }).click();
  await p.getByRole("radiogroup", { name: "Account lockout" }).getByRole("radio", { name: "PCI DSS v4" }).click();
  await expect(p.getByRole("radiogroup", { name: "Account lockout" }).getByRole("radio", { name: "PCI DSS v4" })).toHaveAttribute("aria-checked", "true");
  await p.getByLabel("Address or /24 network").fill("203.0.113.0/16");
  await p.getByLabel("Office").fill("Head office");
  await p.getByRole("button", { name: "Request", exact: true }).click();
  await expect(p.getByRole("alert").filter({ hasText: "/24 network" })).toBeVisible();
  await p.getByLabel("Address or /24 network").fill("203.0.113.0/24");
  await p.getByRole("button", { name: "Request", exact: true }).click();
  await expect(p.getByText("Awaiting approval")).toBeVisible();
  expect(await axe(p)).toEqual([]);
  await s.close();
  const a = await openAs(browser, ti, "support"); const ap = a.page;
  await gotoModule(ap, "/admin/security");
  await expect(ap.getByRole("region", { name: "Blocked sign-in addresses" })).toContainText("Hosting provider (synthetic range 192.0.2.0/24)");
  await a.close();
  void heading;
});

test("Your account: add a backup authenticator app by QR code or key, with the password and a current code", async ({ browser }, ti) => {
  const p = await signedOut(browser, ti);
  const pw = "Lantern-orbit-Quince-71"; const email = "lee.park@company.example";
  await realAccount(p, "Lee Park", email, pw);
  await nextPush(p, "/auth");
  const mfa = p.getByRole("region", { name: "Two-step verification" });
  await expect(mfa.getByRole("list", { name: "Authenticator apps" }).getByRole("listitem")).toHaveCount(1);
  await expect(mfa.getByRole("button", { name: "Remove authenticator app: Authenticator app" })).toBeDisabled(); // the last app stays
  await mfa.getByRole("button", { name: "Add an authenticator app" }).click();
  const dlg = p.getByRole("dialog");
  await dlg.getByLabel("Name for the new app (optional)").fill("Backup phone");
  await dlg.getByLabel("Password", { exact: true }).fill(pw);
  await dlg.getByLabel("Current 6-digit code").fill(totpNow(KEYS.get(email)!, Date.now() + 30_000)); // the next code: this minute's was used to sign in
  await dlg.getByRole("button", { name: "Continue" }).click();
  await expect(dlg.getByRole("img", { name: "QR code to add Selvara to your authenticator app" })).toBeVisible();
  expect(await axe(p)).toEqual([]);
  await dlg.getByRole("radio", { name: "Enter key manually" }).click();
  const key = (await dlg.locator('[aria-labelledby="as-key-l"]').innerText()).replace(/\s/g, "");
  expect(key).toMatch(/^[A-Z2-7]{32}$/);
  await dlg.getByLabel("6-digit code from the new app").fill(totpNow(key));
  await dlg.getByRole("button", { name: "Add app" }).click();
  await expect(p.getByText("Authenticator app added")).toBeVisible();
  await expect(mfa.getByRole("list", { name: "Authenticator apps" }).getByRole("listitem")).toHaveCount(2);
  await expect(mfa).toContainText("Backup phone");
  await expect(mfa.getByRole("button", { name: "Add an authenticator app" })).toBeDisabled(); // two at most
  await expect(p.locator("body")).not.toContainText(key.slice(0, 8)); // the key is gone once the dialog closes
});

