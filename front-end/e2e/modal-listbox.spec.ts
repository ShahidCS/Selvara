import { test, expect } from "@playwright/test";
import { gotoModule, openAs } from "./helpers";

/* G1, G2: a dialog has a title with a close icon and one footer (Cancel, then the primary action); no separate "Close" button. A choice
   inside a dialog uses the shared listbox, which opens under its field (never over the dialog) and closes on Esc without closing the dialog. */
test("Change role: listbox under the field, keyboard choice, Esc closes the list first, then the dialog", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/team");
  await p.getByRole("button", { name: /^Change role of / }).first().click();
  const dlg = p.getByRole("dialog");
  await expect(dlg.getByRole("heading", { name: /^Change role, / })).toBeVisible();
  await expect(dlg.getByRole("button", { name: "Close", exact: true })).toHaveCount(1); // the header icon only
  await expect(dlg.getByRole("button", { name: "Cancel" })).toBeVisible();

  const field = dlg.getByRole("button", { name: /^New role: / });
  await field.click();
  const list = dlg.getByRole("listbox", { name: "New role" });
  await expect(list).toBeVisible();
  // the list sits below the field and below the title: it never covers them
  const [fb, lb, tb] = await Promise.all([field.boundingBox(), list.boundingBox(), dlg.getByRole("heading").boundingBox()]);
  expect(lb!.y).toBeGreaterThanOrEqual(fb!.y + fb!.height - 1);
  expect(lb!.y).toBeGreaterThan(tb!.y + tb!.height);

  await p.keyboard.press("Escape");
  await expect(list).toBeHidden();
  await expect(dlg).toBeVisible();
  await expect(field).toBeFocused();

  // keyboard: open, move, choose
  await p.keyboard.press("ArrowDown");
  await expect(list).toBeVisible();
  const before = await field.getAttribute("aria-label");
  await p.keyboard.press("ArrowDown");
  await p.keyboard.press("Enter");
  await expect(list).toBeHidden();
  await expect(field).not.toHaveAttribute("aria-label", before!);

  await p.keyboard.press("Escape");
  await expect(dlg).toBeHidden();
  await s.close();
});
