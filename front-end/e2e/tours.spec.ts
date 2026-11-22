import { test, expect, type Page } from "@playwright/test";
import { gotoModule, openAs } from "./helpers";

/* Guided tours: a module's tour starts by itself at the first visit (default), moves with Next / Back, ends with Skip or Done and then
   stays away; "Take the tour" plays it again; Sign-in & security sets the frequency (Off: never by itself). Tours do not start under
   automation unless a test opts in, so the rest of the suite is unaffected. */
const optIn = (p: Page) => p.addInitScript(() => { try { localStorage.setItem("selvara.tours.e2e", "1"); } catch { /* ignore */ } });
const bubble = (p: Page) => p.getByRole("dialog").filter({ has: p.getByRole("button", { name: "Skip tour" }) });

test("a module's tour starts at the first visit, steps forward and back, and stays away once skipped", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin"); const p = s.page; await optIn(p);
  await gotoModule(p, "/ws/frameworks");
  const b = bubble(p);
  await expect(b).toBeVisible();
  await expect(b).toContainText(/1 \/ \d+/);
  await b.getByRole("button", { name: /Next/ }).click();
  await expect(b).toContainText("2 /");
  await b.getByRole("button", { name: /Back/ }).click();
  await expect(b).toContainText("1 /");
  await b.getByRole("button", { name: "Skip tour" }).click();
  await expect(b).toBeHidden();
  await p.reload(); await expect(p.locator("main#content h1").first()).toBeVisible();
  await p.waitForTimeout(1200);
  await expect(bubble(p)).toBeHidden(); // first visit only: seen
  await p.getByRole("button", { name: "Take the tour of this page" }).click();
  await expect(bubble(p)).toBeVisible();
  await p.keyboard.press("Escape");
  await expect(bubble(p)).toBeHidden();
  expect(s.errors).toEqual([]);
  await s.close();
});

test("the ring and bubble follow their element when the sidebar collapses or expands", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin", { width: 1280, height: 800 }); const p = s.page;
  await gotoModule(p, "/ws/overview");
  await p.getByRole("button", { name: "Take the tour of this page" }).click();
  const b = bubble(p); await expect(b).toBeVisible();
  await b.getByRole("button", { name: /Next/ }).click(); await b.getByRole("button", { name: /Next/ }).click();
  const target = p.locator('[data-tour="overview-panels"]');
  const ringOn = async () => {
    const [r, t] = await Promise.all([p.locator(".tour-ring").boundingBox(), target.boundingBox()]);
    expect(r && t).toBeTruthy();
    expect(Math.abs(r!.x + 4 - t!.x)).toBeLessThan(2); expect(Math.abs(r!.width - 8 - t!.width)).toBeLessThan(2);
  };
  await ringOn();
  for (const name of ["Collapse sidebar", "Expand sidebar"]) {
    await p.getByRole("button", { name }).click();
    await expect.poll(async () => { try { await ringOn(); return true; } catch { return false; } }).toBe(true);
    const bb = await b.boundingBox(); expect(bb!.x).toBeGreaterThanOrEqual(0); expect(bb!.x + bb!.width).toBeLessThanOrEqual(1280);
  }
  expect(s.errors).toEqual([]);
  await s.close();
});

test("Off stops tours from starting by themselves; Show all tours again brings them back", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin"); const p = s.page; await optIn(p);
  await gotoModule(p, "/auth");
  const set = p.getByRole("radiogroup", { name: "Start tours" });
  await set.getByRole("radio", { name: "Off" }).click();
  await gotoModule(p, "/ws/controls"); await p.waitForTimeout(1200);
  await expect(bubble(p)).toBeHidden();
  await gotoModule(p, "/auth");
  await set.getByRole("radio", { name: "First visit only" }).click();
  await gotoModule(p, "/ws/controls");
  const b = bubble(p); await expect(b).toBeVisible();
  // finish it with Next until Done
  for (let k = 0; k < 12 && await b.getByRole("button", { name: /Next/ }).isVisible(); k++) await b.getByRole("button", { name: /Next/ }).click();
  await b.getByRole("button", { name: /Done/ }).click();
  await expect(b).toBeHidden();
  await gotoModule(p, "/auth");
  await p.getByRole("button", { name: "Show all tours again" }).click();
  await gotoModule(p, "/ws/controls");
  await expect(bubble(p)).toBeVisible();
  expect(s.errors).toEqual([]);
  await s.close();
});
