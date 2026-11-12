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
  page.on("dialog", (d) => { dialogs.push(d.message()); void d.dismiss(); });
  await page.addInitScript((r) => {
    try { localStorage.setItem("assurance.v1", JSON.stringify({ role: r, collapsed: false, theme: "light" })); } catch { /* ignore */ }
  }, role);
  return { page, errors, dialogs, close: () => ctx.close() };
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
