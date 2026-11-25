import { test, expect } from "@playwright/test";

/* (h) security headers on page responses and on a static asset. */
for (const path of ["/", "/auth", "/vendor-portal", "/ws/overview", "/admin/customers", "/definitely-not-a-page"]) {
  test(`security headers on ${path}`, async ({ request }) => {
    const res = await request.get(path, { maxRedirects: 0 });
    const h = res.headers();
    const csp = h["content-security-policy"] ?? "";
    expect(csp, "CSP present").not.toBe("");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-eval'/);
    expect(csp, "no inline scripts allowed (EX-05 closed)").not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).toMatch(/script-src 'self'(;|$)/);
    expect(csp).not.toMatch(/(^|[ ;])\*([ ;]|$)/);
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"]).toContain("camera=()");
    expect(h["cross-origin-opener-policy"]).toBe("same-origin");
    expect(h["cross-origin-resource-policy"]).toBe("same-origin");
    expect(h["x-permitted-cross-domain-policies"]).toBe("none");
    expect(csp).toContain("frame-src 'none'");
    expect(csp).toContain("worker-src 'self'");
    for (const f of ["microphone=()", "bluetooth=()", "display-capture=()", "browsing-topics=()"]) expect(h["permissions-policy"]).toContain(f);
    expect(h["permissions-policy"], "passkeys stay available").toContain("publickey-credentials-get=(self)");
    expect(h["strict-transport-security"]).toMatch(/max-age=\d{7,}/);
    expect(h["x-powered-by"], "framework banner disabled").toBeUndefined();
  });
}

test("a real browser refuses to be framed (CSP frame-ancestors / X-Frame-Options)", async ({ page }) => {
  await page.goto("/auth");
  const blocked = await page.evaluate(
    (src) => new Promise<boolean>((resolve) => {
      const f = document.createElement("iframe");
      f.src = src;
      f.onload = () => { try { resolve(f.contentDocument === null || f.contentDocument.body.innerHTML === ""); } catch { resolve(true); } };
      setTimeout(() => resolve(true), 4000);
      document.body.appendChild(f);
    }),
    "http://127.0.0.1:3100/auth",
  );
  expect(blocked).toBe(true);
});

/* EX-05: with script-src 'self' only, the app must still start in a real browser and the browser must report no CSP
   violation. A violation would mean an inline script (or a new script origin) slipped into the build. */
type CspWin = { __cspv?: string[]; next?: unknown };
for (const path of ["/auth", "/login", "/vendor-portal", "/ws/overview", "/help"]) {
  test(`no CSP violations and the app starts on ${path}`, async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text()); });
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (e) => {
        const w = window as unknown as CspWin;
        w.__cspv = [...(w.__cspv ?? []), `${e.violatedDirective} ${e.blockedURI}`];
      });
    });
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    // The client bundle ran: Next exposes window.next once the app has started.
    await expect.poll(() => page.evaluate(() => typeof (window as unknown as CspWin).next === "object")).toBe(true);
    const seen = await page.evaluate(() => (window as unknown as CspWin).__cspv ?? []);
    expect([...violations, ...seen], "CSP violations").toEqual([]);
  });
}
