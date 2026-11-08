/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== "production";
let apiOrigin = "";
try { if (process.env.NEXT_PUBLIC_API_BASE_URL) apiOrigin = new URL(process.env.NEXT_PUBLIC_API_BASE_URL).origin; } catch { /* invalid URL: ignored, connect-src stays 'self' */ }

/* Content-Security-Policy. Next's Pages Router injects inline bootstrap scripts, so script-src needs 'unsafe-inline' unless a
 * nonce middleware is added (tracked in docs/SECURITY.md). styles are inline in many places (kept from the prototype). */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${apiOrigin ? " " + apiOrigin : ""}${isDev ? " ws:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

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
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      ],
    }];
  },
};
