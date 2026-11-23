import { test, expect } from "@playwright/test";
import { gotoModule, openAs } from "./helpers";

/* Reference review R14: a vendor's uploaded logo replaces its letter tile in lists and on its page. A 1 by 1 synthetic PNG. */
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

test("vendor logo: add, shown in the list, refused for other types, then removed", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin"); const p = s.page;
  await gotoModule(p, "/ws/vendors");
  const first = p.getByRole("table", { name: /Vendors|Third parties/ }).locator("tbody tr").first();
  const name = (await first.locator(".person .strong").first().textContent())!.trim();
  await first.locator(".person").first().click();
  await expect(p.getByRole("heading", { level: 1 })).toHaveText(name);
  const card = p.locator(".card").filter({ has: p.getByRole("heading", { level: 3, name: "Logo" }) });
  await expect(card).toContainText("A letter tile is shown");
  await card.locator('input[type="file"]').setInputFiles({ name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>") });
  await expect(card.getByRole("alert")).toContainText("Choose a PNG, JPEG or WebP image.");
  await card.locator('input[type="file"]').setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG_1PX });
  await expect(card).toContainText("Shown in lists and on this page.");
  await expect(card.locator(".vendor-tile.img")).toBeVisible();
  await p.getByRole("link", { name: "Back to Third parties" }).click();
  await expect(p.getByRole("table", { name: /Vendors|Third parties/ }).locator("tbody tr").filter({ hasText: name }).locator(".vendor-tile.img")).toHaveCount(1);
  await p.getByRole("table", { name: /Vendors|Third parties/ }).locator("tbody tr").filter({ hasText: name }).locator(".person").first().click();
  await p.locator(".card").filter({ has: p.getByRole("heading", { level: 3, name: "Logo" }) }).getByRole("button", { name: "Remove" }).click();
  await expect(p.locator(".card").filter({ has: p.getByRole("heading", { level: 3, name: "Logo" }) })).toContainText("A letter tile is shown");
  expect(s.errors).toEqual([]);
  await s.close();
});
