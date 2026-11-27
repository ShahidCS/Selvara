import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { DEMO_PASS, demoEmail, nextPush } from "./helpers";

/* Passkeys for platform super admins, through the real WebAuthn browser API. Chromium's virtual authenticator (DevTools protocol) stands in for a
   phone or security key: it creates the key pair, asks for user verification and signs, exactly as hardware would. */
const axe = async (p: Page) => {
  const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id} x${v.nodes.length}`);
};
const fill = async (p: Page, email: string, pw: string) => {
  await p.getByLabel("Work email").fill(email); await p.getByLabel("Password", { exact: true }).fill(pw);
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
};

test("a super admin adds a passkey at the first sign-in, then signs in with it; the account page keeps the last one", async ({ browser }, ti) => {
  const ctx = await browser.newContext({ baseURL: ti.project.use.baseURL, viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("assurance.v1", JSON.stringify({ theme: "light" })); sessionStorage.setItem("seeded", "1"); } } catch { /* ignore */ } });
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });

  await p.goto("/login");
  await fill(p, demoEmail("Dana Whitfield"), DEMO_PASS);
  await expect(p.getByRole("heading", { name: "Add a passkey" })).toBeVisible();
  expect(await axe(p)).toEqual([]);
  await p.getByRole("button", { name: "Add a passkey" }).click();
  await p.waitForURL(/\/admin\//);
  expect((await cdp.send("WebAuthn.getCredentials", { authenticatorId })).credentials.length).toBe(1);

  await p.getByRole("button", { name: /^Account:/ }).click(); await p.getByRole("menuitem", { name: "Sign out" }).click(); await p.waitForURL(/\/login$/);
  await fill(p, demoEmail("Dana Whitfield"), DEMO_PASS);
  await expect(p.getByRole("heading", { name: "Use your passkey" })).toBeVisible();
  await p.getByRole("button", { name: "Use passkey" }).click();
  await p.waitForURL(/\/admin\//);
  const creds = (await cdp.send("WebAuthn.getCredentials", { authenticatorId })).credentials;
  expect(creds[0].signCount).toBeGreaterThan(0);

  await nextPush(p, "/auth");
  const card = p.getByRole("region", { name: "Passkeys" });
  await expect(card).toContainText("required for your role");
  await expect(card.getByRole("listitem")).toHaveCount(1);
  await expect(card.getByRole("button", { name: /^Remove passkey/ })).toBeDisabled();
  expect(await axe(p)).toEqual([]);
  await ctx.close();
});

test("without a passkey device, the demonstration build offers a labelled on-screen code", async ({ browser }, ti) => {
  const ctx = await browser.newContext({ baseURL: ti.project.use.baseURL });
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("assurance.v1", JSON.stringify({ theme: "light" })); sessionStorage.setItem("seeded", "1"); } } catch { /* ignore */ } });
  await p.goto("/login");
  await fill(p, demoEmail("Riley Quinn"), DEMO_PASS);
  await p.getByRole("button", { name: "No passkey on this device? Demo code" }).click();
  const banner = p.locator(".banner.warn", { hasText: "Demo only." });
  await expect(banner).toContainText("must use a passkey");
  await p.getByLabel("Authentication code").fill((await banner.locator(".demo-code-value").innerText()).trim());
  await p.getByRole("button", { name: "Verify" }).click();
  await p.waitForURL(/\/admin\//);
  await ctx.close();
});
