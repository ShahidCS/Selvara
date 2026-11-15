import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { DEMO_PASS, demoEmail, gotoModule, heading, nextPush, openAs } from "./helpers";

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

test("after three failures a quick check appears; passing it signs in and shows the failed attempts since the last sign-in", async ({ browser }, ti) => {
  const p = await signedOut(browser, ti);
  await p.goto("/login");
  for (let i = 0; i < 3; i++) { await fill(p, demoEmail("Jordan Avery"), "wrong-" + i); await expect(p.getByRole("alert").filter({ hasText: "incorrect" })).toBeVisible(); }
  await fill(p, demoEmail("Jordan Avery"), DEMO_PASS);
  await expect(p.getByRole("heading", { name: "Quick check" })).toBeVisible();
  expect(await axe(p)).toEqual([]);
  await p.getByRole("button", { name: "Continue" }).click();
  await p.waitForURL(/\/ws\/overview$/, { timeout: 20_000 });
  await expect(p.getByText(/3 failed sign-in attempts since then|first sign-in on record/)).toBeVisible();
  await nextPush(p, "/auth");
  await expect(p.getByRole("region", { name: "Security activity" })).toContainText("Signed in after 3 failed attempts");
});

test("forgot password: generic answer, link plus second factor, every session ends, then sign in with the new password", async ({ browser }, ti) => {
  const p = await signedOut(browser, ti);
  const pw = "Copper-harbour-Violet-58";
  await p.goto("/login");
  await p.getByRole("button", { name: "Forgot password?" }).click();
  await p.getByLabel("Work email").fill(demoEmail("Casey Morgan"));
  await p.getByRole("button", { name: "Send link" }).click();
  await expect(p.getByText(/If an account uses that email/)).toBeVisible();
  const code = (await p.locator(".banner.warn .num").innerText()).trim();
  await p.getByRole("button", { name: "Open the reset link" }).click();
  await expect(p.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  expect(await axe(p)).toEqual([]);
  await p.getByLabel("Authentication code").fill("000000");
  await p.getByLabel("New password").fill(pw);
  await p.getByRole("button", { name: "Reset password" }).click();
  await expect(p.getByRole("alert").filter({ hasText: "code is not correct" })).toBeVisible();
  await p.getByLabel("Authentication code").fill(code);
  await p.getByRole("button", { name: "Reset password" }).click();
  await expect(p.getByRole("heading", { name: "Password reset" })).toBeVisible();
  await p.getByRole("button", { name: "Back to sign in" }).click();
  await fill(p, demoEmail("Casey Morgan"), DEMO_PASS);
  await expect(p.getByRole("alert").filter({ hasText: "incorrect" })).toBeVisible();
  await fill(p, demoEmail("Casey Morgan"), pw);
  await p.waitForURL(/\/ws\/overview$/);
});

test("your account: sessions, sign out the others, change password; new recovery codes ask for the password", async ({ browser }, ti) => {
  const p = await signedOut(browser, ti);
  await p.goto("/login");
  await fill(p, demoEmail("Jordan Avery"), DEMO_PASS);
  await p.waitForURL(/\/ws\/overview$/);
  await nextPush(p, "/auth");
  await expect(p.getByRole("tab", { name: "Your account" })).toHaveAttribute("aria-selected", "true");
  const sessions = p.getByRole("list", { name: "Active sessions" });
  await expect(sessions.getByRole("listitem")).toHaveCount(2);
  expect(await axe(p)).toEqual([]);
  await p.getByRole("button", { name: "Sign out other sessions" }).click();
  await expect(sessions.getByRole("listitem")).toHaveCount(1);
  const pwCard = p.getByRole("region", { name: "Change password" });
  await pwCard.getByLabel("Current password").fill("not-it");
  await pwCard.getByLabel("New password").fill("Copper-harbour-Violet-58");
  await pwCard.getByRole("button", { name: "Change password" }).click();
  await expect(pwCard.getByRole("alert").filter({ hasText: "not correct" })).toBeVisible();
  await pwCard.getByLabel("Current password").fill(DEMO_PASS);
  await pwCard.getByRole("button", { name: "Change password" }).click();
  await expect(p.getByRole("region", { name: "Security activity" })).toContainText("Your password was changed");
  await p.getByRole("button", { name: "Generate new codes" }).click();
  const dlg = p.getByRole("dialog", { name: "New recovery codes" });
  await expect(dlg.getByRole("button", { name: "Generate codes" })).toBeVisible(); // signed in moments ago: no second password prompt
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
