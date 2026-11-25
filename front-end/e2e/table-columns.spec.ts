import { test, expect } from "@playwright/test";
import { gotoModule, openAs } from "./helpers";

/* I2-I5: fixed column widths that never move between pages; a column resized by dragging (or with the arrow keys) keeps its width for the
   session and is reset at sign-out; long values end in an ellipsis with the full text on hover; row actions are in a labelled column. */
test("columns keep their widths across pages and reloads, resize by drag and keyboard, and reset at sign-out", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/frameworks");
  const table = p.getByRole("table", { name: "Frameworks", exact: true });
  const head = (name: string) => table.getByRole("columnheader", { name });
  const widths = () => table.locator("thead th").evaluateAll((ths) => ths.map((t) => Math.round(t.getBoundingClientRect().width)));
  await expect(head("Actions")).toBeVisible(); // I5: a labelled actions column

  const page1 = await widths();
  await p.getByRole("button", { name: "Page 2" }).click();
  expect(await widths()).toEqual(page1); // I2: paging never recalculates widths

  // I3: drag the Region column's edge 80 px to the right
  const rs = table.getByRole("separator", { name: "Resize column Region" });
  const before = Math.round((await head("Region").boundingBox())!.width);
  const box = (await rs.boundingBox())!;
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down();
  await p.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 5 }); await p.mouse.up();
  const dragged = Math.round((await head("Region").boundingBox())!.width);
  expect(dragged).toBeGreaterThan(before + 60);
  // and with the keyboard
  await rs.focus(); await p.keyboard.press("ArrowLeft");
  await expect.poll(async () => Math.round((await head("Region").boundingBox())!.width)).toBeLessThan(dragged);

  // kept for the session (a reload keeps it) ...
  const kept = Math.round((await head("Region").boundingBox())!.width);
  await p.reload(); await expect(head("Region")).toBeVisible();
  expect(Math.abs(Math.round((await head("Region").boundingBox())!.width) - kept)).toBeLessThanOrEqual(2);
  expect(await p.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith("selvara.colw.")).length)).toBeGreaterThan(0);

  // ... and cleared at sign-out
  await p.getByRole("button", { name: /^Account:/ }).click();
  await p.getByRole("menuitem", { name: "Sign out" }).click();
  await p.waitForURL(/\/login/);
  expect(await p.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith("selvara.colw.")).length)).toBe(0);
  await s.close();
});
