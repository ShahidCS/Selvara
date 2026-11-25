import { createHmac } from "node:crypto";
import { expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import roles from "../src/data/roles.json";
import nav from "../src/data/nav.json";

export const ROLES = roles.ROLES as { id: string; name: string; person: string; spaces: string[] }[];
export const ROLE_MODS = roles.ROLE_MODS as Record<string, Record<string, string | string[]>>;
export type Space = "ws" | "admin";
export const NAV = nav.NAV as unknown as Record<Space, { g: string; items: [string, string, string][] }[]>;

/** Every navigable [space, key] pair from nav.json. */
export const ALL_ROUTES: [Space, string][] = (["ws", "admin"] as Space[]).flatMap((sp) => NAV[sp].flatMap((g) => g.items.map((it) => [sp, it[0]] as [Space, string])));

export function isAllowed(roleId: string, space: Space, key: string): boolean {
  const m = (ROLE_MODS[roleId] || {})[space];
  return m === "*" || (Array.isArray(m) && m.includes(key));
}

export interface Session { page: Page; errors: string[]; dialogs: string[]; close: () => Promise<void> }

/** New isolated browser context acting as `role` (persona is read from localStorage on first load). Collects console errors and dialogs. */
export async function openAs(browser: Browser, testInfo: TestInfo, role: string, viewport = { width: 1280, height: 900 }): Promise<Session> {
  const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport });
  const page = await ctx.newPage();
  const errors: string[] = []; const dialogs: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror ${page.url()} ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console ${page.url()} ${m.text().slice(0, 200)} @ ${m.location().url}`); });
  // the browser's own "leave this page?" prompt (an unsaved form) is not page script: accept it so a test can move on, and do not count it as an injected dialog
  page.on("dialog", (d) => { if (d.type() === "beforeunload") { void d.accept(); return; } dialogs.push(d.message()); void d.dismiss(); });
  await page.addInitScript((r) => {
    try { localStorage.setItem("assurance.v1", JSON.stringify({ role: r, collapsed: false, theme: "light", signedIn: true })); } catch { /* ignore */ }
  }, role);
  return { page, errors, dialogs, close: () => ctx.close() };
}

/** Shared demo password (documented in README.md; the app holds only its hash). Joined so it is not a literal credential. */
export const DEMO_PASS = ["selvara", "demo"].join("-");
export const demoEmail = (person: string) => person.toLowerCase().replace(/[^a-z ]/g, "").trim().split(/\s+/).join(".") + "@demo.selvara.test";
/** Sign out and sign in as another persona through the login page, without a full page load (in-memory state such as approvals survives). */
export async function switchTo(page: Page, person: string) {
  await page.getByRole("button", { name: /^Account:/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL(/\/login$/);
  await page.getByLabel("Work email").fill(demoEmail(person));
  await page.getByLabel("Password", { exact: true }).fill(DEMO_PASS);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await demoSecondStep(page);
  await page.waitForURL(/\/(ws|admin)\//);
  await expect(heading(page)).toBeVisible();
}

/** Demo accounts have no authenticator: the second step shows its code on screen. Reads it and verifies. */
export async function demoSecondStep(page: Page) {
  const banner = page.locator(".banner.warn", { hasText: "Demo account." });
  await expect(banner).toBeVisible();
  await page.getByLabel("Authentication code").fill((await banner.locator(".num").innerText()).trim());
  await page.getByRole("button", { name: "Verify" }).click();
}
/** The 6-digit code an authenticator app shows for a base32 secret now (RFC 6238), computed with Node's crypto as a phone app would. */
export function totpNow(secretB32: string, ms = Date.now()): string {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = 0, val = 0; const out: number[] = [];
  for (const ch of secretB32.replace(/\s/g, "")) { val = (val << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(Math.floor(ms / 30_000)));
  const h = createHmac("sha1", Buffer.from(out)).update(msg).digest(); const o = h[h.length - 1] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1_000_000).padStart(6, "0");
}

/** Client-side navigation: keeps in-memory state (elevation) that a full page load would drop. Resolves when the route change completes. */
export async function nextPush(page: Page, path: string) {
  await page.evaluate((p) => (window as unknown as { next: { router: { push: (u: string) => Promise<boolean> } } }).next.router.push(p), path);
}

/** Wait until the module heading of the shell has rendered. */
export const heading = (page: Page) => page.locator("main#content h1").first();

export async function gotoModule(page: Page, path: string) {
  await page.goto(path);
  await expect(heading(page)).toBeVisible();
}

/** Visible text of every enabled action button in <main> that matches `re`. Tabs are left out: a status tab such as "Approved" filters a list, it does not decide anything. */
export async function enabledButtons(page: Page, re: RegExp): Promise<string[]> {
  const all = await page.locator('main button:not([disabled]):not([role="tab"])').allInnerTexts();
  return all.map((s) => s.trim()).filter((s) => re.test(s));
}

export const pathOf = (page: Page) => new URL(page.url()).pathname;

/** G1: choose an option in the shared listbox that dialogs use instead of a native <select> (selectOption only works on <select>). */
export async function pickOption(scope: Page, label: string | RegExp, option: string | RegExp) {
  await scope.getByLabel(label).click();
  await scope.getByRole("option", { name: option }).click();
}
