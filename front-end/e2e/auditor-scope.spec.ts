import { test, expect, type Page } from "@playwright/test";
import { gotoModule, heading, nextPush, openAs, switchTo } from "./helpers";

/* Security fix F1-01 (demonstration): management shares a control and an evidence item on an engagement; the external auditor then sees only
   those in Controls and Evidence, their Overview lists the engagement, and an unshared control's address shows "not found". */
const rows = (p: Page, name: string) => p.getByRole("table", { name, exact: true }).locator("tbody tr");

test("an auditor sees only what management shared with their engagement", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin"); const p = s.page;
  await gotoModule(p, "/ws/audits/AUD-01");
  await p.getByRole("button", { name: "Send to auditor" }).click();
  await expect(p.getByText("Auditor access granted", { exact: true }).first()).toBeVisible();
  await p.getByRole("tab", { name: "Shared with the auditor" }).click();
  await expect(p.getByText("The auditor sees only this engagement's framework and the items shared here")).toBeVisible();
  await p.getByLabel("Controls to share").selectOption("GOV-1");
  await p.getByRole("button", { name: "Share control" }).click();
  await p.getByLabel("Search evidence").fill("EV-204");
  await p.getByLabel("Evidence to share").selectOption("EV-204");
  await p.getByRole("button", { name: "Share evidence item" }).click();
  await expect(p.getByRole("button", { name: "Stop sharing GOV-1" })).toBeVisible();
  await expect(p.getByRole("button", { name: "Stop sharing EV-204" })).toBeVisible();

  await switchTo(p, "Morgan Blake");
  await nextPush(p, "/ws/overview");
  await expect(heading(p)).toHaveText("Your engagements");
  await expect(rows(p, "Your engagements")).toHaveCount(1);
  await expect(rows(p, "Your engagements").first()).toContainText("ISO 27001 surveillance");

  await nextPush(p, "/ws/controls");
  await expect(rows(p, "Controls")).toHaveCount(1);
  await expect(rows(p, "Controls").first()).toContainText("GOV-1");
  await nextPush(p, "/ws/evidence");
  await expect(rows(p, "Evidence")).toHaveCount(1);
  await expect(rows(p, "Evidence").first()).toContainText("EV-204");
  await nextPush(p, "/ws/policies");
  await expect(rows(p, "Policies")).toHaveText(["Nothing matches these filters."]); // nothing shared

  // the engagement lists the shared items read-only, linked to their records
  await nextPush(p, "/ws/audits/AUD-01");
  await p.getByRole("tab", { name: "Shared with the auditor" }).click();
  await expect(p.getByRole("link", { name: "GOV-1" })).toBeVisible();
  await expect(p.getByRole("button", { name: /^Stop sharing/ })).toHaveCount(0);
  await p.getByRole("link", { name: "GOV-1" }).click();
  await expect(heading(p)).not.toHaveText("Control not found");

  await nextPush(p, "/ws/controls/IAM-1");
  await expect(heading(p)).toHaveText("Control not found");
  await nextPush(p, "/ws/evidence/EV-205");
  await expect(heading(p)).toHaveText("Evidence not found");
  expect(s.errors).toEqual([]);
  await s.close();
});
