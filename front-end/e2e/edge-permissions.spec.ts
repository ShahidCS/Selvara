import { test, expect } from "@playwright/test";
import { gotoModule, openAs } from "./helpers";

/* EDGE-8: the browser refuses a permission (here the clipboard). The app keeps working, says so honestly, and offers the way round. */
test("a refused clipboard permission is explained, not reported as copied", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await p.addInitScript(() => { Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new DOMException("Denied", "NotAllowedError")) } }); });
  await gotoModule(p, "/ws/issues");
  const first = p.getByRole("table", { name: "Issues", exact: true }).locator("tbody tr").first();
  await first.getByRole("button", { name: /^Actions for/ }).click();
  await p.getByRole("menuitem", { name: "Copy ID" }).click();
  await expect(p.getByText(/Copy is not allowed here\. The issue ID is [A-Z]+-\d+\./)).toBeVisible();
  await expect(p.getByText("Issue ID copied")).toHaveCount(0);
  await s.close();
});
