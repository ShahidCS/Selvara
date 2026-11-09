import { test, expect, type Page } from "@playwright/test";
import { enabledButtons, gotoModule, heading, nextPush, openAs, pathOf } from "./helpers";

/* (c) privileged-access gate. Elevation lives in memory, so after the first load every move is a client-side router push. */
const ADMIN_MODULES = ["customers", "billing", "rates", "mfa"];
const lockedCount = (page: Page) => page.locator('button[title="Elevate to make changes"], button:disabled[title*="Elevate"]').count();
const mainText = (page: Page) => page.locator("main").innerText();

test("super admin lands on /admin/customers and has no workspace access", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "super");
  await s.page.goto("/");
  await expect(s.page).toHaveURL(/\/admin\/customers$/);
  await nextPush(s.page, "/ws/overview");
  await expect(s.page).not.toHaveURL(/\/ws\//);
  expect(pathOf(s.page)).toMatch(/^\/admin\//);
  expect(s.errors).toEqual([]);
  await s.close();
});

test("admin mutation controls are locked until elevated, then unlock (reason >= 15 chars, ticket OPS-1234, key touch)", async ({ browser }, ti) => {
  test.setTimeout(90_000);
  const s = await openAs(browser, ti, "super");
  const p = s.page;
  await gotoModule(p, "/admin/customers");

  // locked before elevation
  for (const m of ADMIN_MODULES) {
    await nextPush(p, "/admin/" + m);
    await expect(heading(p)).toBeVisible();
    await expect.poll(() => lockedCount(p), { message: `locked controls on /admin/${m}` }).toBeGreaterThan(0);
  }

  // elevation form validation
  await nextPush(p, "/admin/elevation");
  await expect(heading(p)).toBeVisible();
  await p.locator("main button", { hasText: /Continue|Request/ }).first().click();
  const submit = async (reason: string, ticket: string) => {
    await p.fill("#elReason", reason);
    await p.fill("#elTicket", ticket);
    await p.locator("main button", { hasText: /Continue to hardware key|Confirm|Elevate/ }).first().click();
  };
  await submit("short", "");
  await expect(p.locator("main")).toContainText(/reason|ticket/i);
  await expect(p.locator("main")).not.toContainText("Elevated session:");

  await submit("Investigating a billing dispute for the customer", "BAD TICKET");
  await expect(p.locator("main")).not.toContainText("Elevated session:");

  await submit("Investigating a billing dispute for the customer", "OPS-1234");
  await p.locator("main button, .modal.on button", { hasText: /Simulate key touch/ }).first().click();
  await expect(p.locator("main")).toContainText(/Elevated session|expires in/i, { timeout: 15_000 });

  // unlocked after elevation
  for (const m of ADMIN_MODULES) {
    await nextPush(p, "/admin/" + m);
    await expect(heading(p)).toBeVisible();
    await expect.poll(() => lockedCount(p), { message: `still locked on /admin/${m}` }).toBe(0);
  }

  // four-eyes: an elevated super admin who is not the requester can decide the seeded MFA reset
  await nextPush(p, "/admin/mfa");
  await expect(p.locator('main button:has-text("Approve"):not([disabled])').first()).toBeVisible();
  expect(s.errors).toEqual([]);
  await s.close();
});

test("support cannot approve an MFA reset", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "support");
  await gotoModule(s.page, "/admin/mfa");
  await expect(s.page.locator('main button:has-text("Approve")').first()).toBeVisible(); // the request is listed...
  expect(await enabledButtons(s.page, /^Approve/)).toEqual([]); // ...but nothing is actionable
  await s.close();
});

test("a second super admin is not elevated by the first one's session", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "super2");
  await gotoModule(s.page, "/admin/mfa");
  await expect.poll(() => lockedCount(s.page)).toBeGreaterThan(0);
  expect(await enabledButtons(s.page, /^Approve/)).toEqual([]);
  expect(mainText).toBeDefined();
  await s.close();
});
