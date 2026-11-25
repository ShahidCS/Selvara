/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== "production";
let apiOrigin = "";
try { if (process.env.NEXT_PUBLIC_API_BASE_URL) apiOrigin = new URL(process.env.NEXT_PUBLIC_API_BASE_URL).origin; } catch { /* invalid URL: ignored, connect-src stays 'self' */ }

/* Content-Security-Policy. Production builds use webpack (`next build --webpack`, package.json), which emits no inline
 * executable script: only external chunks and the __NEXT_DATA__ JSON block (type="application/json", never executed). So
 * script-src is 'self' alone in production (EX-05 closed). Turbopack, used by `next dev`, adds an inline runtime bootstrap,
 * so the dev server alone keeps 'unsafe-inline' (and 'unsafe-eval' for React's dev tooling). e2e/headers.spec.ts fails if a
 * production page carries 'unsafe-inline' in script-src or the browser reports a CSP violation.
 * Styles stay inline in many places (kept from the prototype): style-src keeps 'unsafe-inline'. */
const csp = [
  "default-src 'self'",
  `script-src 'self'${isDev ? " 'unsafe-inline' 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${apiOrigin ? " " + apiOrigin : ""}${isDev ? " ws:" : ""}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-src 'none'", // the app never frames another page
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/* Permissions-Policy: every powerful browser feature is off, except passkeys (WebAuthn, platform super admins) and copying
 * to the clipboard (keys and links), which this site alone may use. */
const permissions = [
  "camera=()", "microphone=()", "geolocation=()", "payment=()", "usb=()", "bluetooth=()", "hid=()", "serial=()", "midi=()",
  "accelerometer=()", "gyroscope=()", "magnetometer=()", "display-capture=()", "idle-detection=()", "screen-wake-lock=()",
  "xr-spatial-tracking=()", "browsing-topics=()",
  "publickey-credentials-get=(self)", "publickey-credentials-create=(self)", "clipboard-write=(self)",
].join(", ");

module.exports = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: permissions },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        // Other sites cannot load this site's files (scripts, fonts, API answers) into their pages.
        { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      ],
    }];
  },
};
