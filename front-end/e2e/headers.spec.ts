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
    expect(csp).not.toMatch(/(^|[ ;])\*([ ;]|$)/);
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"]).toContain("camera=()");
    expect(h["cross-origin-opener-policy"]).toBe("same-origin");
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
