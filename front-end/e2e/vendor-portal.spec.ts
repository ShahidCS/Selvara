import { test, expect, type Page } from "@playwright/test";
import { openAs } from "./helpers";

/* (g) vendor portal: email -> one-time code -> second factor -> questionnaire with upload gating. Files are generated in memory. */
async function toQuestionnaire(page: Page) {
  await page.goto("/vendor-portal");
  await page.locator("input").first().fill("contact@vendor.example");
  await page.locator("button", { hasText: /Continue/ }).first().click();
  await page.locator('input[autocomplete="one-time-code"]').first().fill("123456");
  await page.locator("button", { hasText: /Verify/ }).first().click();
  await expect(page.locator("body")).toContainText("Protect your access");
  await expect(page.locator("body")).toContainText("Passkey or security key");
  await expect(page.locator("body")).toContainText("Authenticator app");
  await page.locator("text=Passkey or security key").first().click();
  await expect(page.locator("body")).toContainText("Second factor set up");
}
const evidenceInput = (page: Page) => page.locator("input[type=file]:not([accept='.xlsx,.csv'])").first();
const prefillInput = (page: Page) => page.locator("input[type=file][accept='.xlsx,.csv']").first();

test("sign-in requires the second factor before the questionnaire opens", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await p.goto("/vendor-portal");
  await expect(p.locator("body")).not.toContainText("Questionnaire ·");
  await p.locator("input").first().fill("contact@vendor.example");
  await p.locator("button", { hasText: /Continue/ }).first().click();
  await p.locator('input[autocomplete="one-time-code"]').first().fill("123456");
  await p.locator("button", { hasText: /Verify/ }).first().click();
  await expect(p.locator("body")).toContainText("Protect your access");
  await expect(p.locator("body")).not.toContainText("Questionnaire ·");
  await p.locator("text=Passkey or security key").first().click();
  await expect(p.locator("body")).toContainText("Questionnaire ·");
  expect(s.errors).toEqual([]);
  await s.close();
});

test("the signed-in banner masks the email address", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  await toQuestionnaire(s.page);
  await expect(s.page.locator("body")).toContainText("Signed in as c•••@vendor.example");
  await expect(s.page.locator("body")).not.toContainText("contact@vendor.example");
  await s.close();
});

test("upload gate: disallowed type, oversize and valid file", async ({ browser }, ti) => {
  test.setTimeout(60_000);
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await toQuestionnaire(p);
  await expect(evidenceInput(p)).toHaveAttribute("accept", ".pdf,.docx,.xlsx,.png,.jpg");

  await evidenceInput(p).setInputFiles({ name: "evil.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ\u0090\u0000") });
  await expect(p.locator("body")).toContainText("evil.exe — file type not allowed");

  await evidenceInput(p).setInputFiles({ name: "huge.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(26 * 1024 * 1024) });
  await expect(p.locator("body")).toContainText("huge.pdf — larger than 25 MB");

  await evidenceInput(p).setInputFiles({ name: "ok.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 minimal") });
  await expect(p.locator("body")).toContainText("ok.pdf — scanning for malware");

  await prefillInput(p).setInputFiles({ name: "evil.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") });
  await expect(p.locator("body")).toContainText(/File type .*\.exe.* is not allowed/);
  await expect(p.locator("body")).not.toContainText("answers prefilled");
  await prefillInput(p).setInputFiles({ name: "caiq.csv", mimeType: "text/csv", buffer: Buffer.from("id,answer\nQ1,Yes\n") });
  await expect(p.locator("body")).toContainText(/answers prefilled from caiq\.csv/);
  expect(s.errors).toEqual([]);
  await s.close();
});

test("free text with markup is inert and nothing sensitive leaves the page", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  const requests: string[] = [];
  p.on("request", (r) => { const u = r.url(); if (!u.includes("/_next/") && !u.startsWith("data:") && !u.startsWith("blob:") && !u.includes("/favicon.ico")) requests.push(r.method() + " " + u); });
  await toQuestionnaire(p);
  const ta = p.locator("textarea").first();
  if (await ta.count()) await ta.fill('<img src=x onerror="window.__xss=1">');
  await expect(p.locator("body")).toBeVisible();
  expect(await p.evaluate(() => ({ x: (window as unknown as { __xss?: number }).__xss || 0, i: document.querySelectorAll('img[src="x"]').length }))).toEqual({ x: 0, i: 0 });
  expect(new URL(p.url()).search).toBe("");
  expect(await p.evaluate(() => JSON.stringify(Object.keys(sessionStorage)))).not.toMatch(/code|otp|vendor\.example/i);
  // the only other requests allowed are same-origin static assets (the favicon and the self-hosted Geist font files); anything else (API calls, third parties) fails
  expect(requests.filter((r) => !r.includes("localhost:3100/vendor-portal") && !r.endsWith("localhost:3100/favicon.svg") && !/^GET http:\/\/localhost:3100\/fonts\/[\w-]+\.woff2$/.test(r))).toEqual([]);
  expect(s.dialogs).toEqual([]);
  await s.close();
});
