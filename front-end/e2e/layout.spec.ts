import { test, expect, type Locator } from "@playwright/test";
import { ALL_ROUTES, gotoModule, isAllowed, openAs } from "./helpers";

/* Text inside cards is never flush against the card edge. */
const box = async (l: Locator) => (await l.boundingBox())!;

test("Security Controls: text inside a control group has padding on every side", async ({ browser }, ti) => {
  const s = await openAs(browser, ti, "admin");
  const p = s.page;
  await gotoModule(p, "/ws/appsec");
  await p.getByRole("button", { name: "Expand all" }).click();
  const group = p.locator("section.card[id^='appsec-']").filter({ has: p.locator("text=Threat:") }).first();
  const text = await box(group.locator("p", { hasText: "Threat:" }));
  const card = await box(group);
  expect(text.x - card.x).toBeGreaterThanOrEqual(12);
  const last = await box(group.locator("p", { hasText: "Test:" }));
  expect(card.y + card.height - (last.y + last.height)).toBeGreaterThanOrEqual(12);
  await s.close();
});

/* The content follows the width it actually has: with the sidebar open on a tablet or small laptop nothing is pushed off the right edge,
   and the top bar keeps every control on screen. Checked for every module the role opens, with the sidebar open at 768 and 1024. */
for (const [w, h] of [[768, 1024], [1024, 768]] as const) {
  test(`no module spills past the window at ${w}px with the sidebar open`, async ({ browser }, ti) => {
    test.setTimeout(180_000);
    for (const [space, role] of [["ws", "admin"], ["admin", "super"]] as const) {
      const s = await openAs(browser, ti, role, { width: w, height: h }); const p = s.page;
      for (const [sp, mod] of ALL_ROUTES.filter(([sp, m]) => sp === space && isAllowed(role, sp, m))) {
        await gotoModule(p, `/${sp}/${mod}`);
        const out = await p.evaluate(() => {
          const vw = window.innerWidth; const bad: string[] = [];
          if (document.documentElement.scrollWidth > vw) bad.push(`window ${document.documentElement.scrollWidth}`);
          // the page box scrolls up and down; sideways scrolling of the whole page means something is too wide for it
          for (const pg of document.querySelectorAll<HTMLElement>("main#content .page")) if (pg.scrollWidth > pg.clientWidth + 1) bad.push(`page ${pg.scrollWidth - pg.clientWidth}px too wide`);
          for (const el of document.querySelectorAll("#topbar *, main#content *")) {
            const r = el.getBoundingClientRect(); if (!r.width || r.right <= vw + 1) continue;
            let q = el.parentElement, inside = false;
            for (; q && q.id !== "content" && !q.classList.contains("page"); q = q.parentElement) { const o = getComputedStyle(q).overflowX; if (o === "auto" || o === "scroll" || o === "hidden") { inside = true; break; } }
            if (!inside) bad.push(`${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).split(" ")[0]} ${Math.round(r.right)}`);
          }
          return bad.slice(0, 3);
        });
        expect(out, `${sp}/${mod} at ${w}`).toEqual([]);
      }
      expect(s.errors).toEqual([]);
      await s.close();
    }
  });
}
