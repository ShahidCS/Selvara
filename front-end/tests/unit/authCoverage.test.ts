import { describe, expect, it } from "vitest";
import { COOKIE, ROUTES, RAW_ROUTES, handle, type Req } from "@/server/core";
import { MemoryAuth, MemoryStore } from "@/server/memory";
import { MemoryDirectory } from "@/server/directory";
import { MemoryPlatform } from "@/server/platform";
import { MemorySupport } from "@/server/support";
import { MemoryWsStore } from "@/server/ws/store";
import { MemoryFileStore } from "@/server/ws/files";
import type { Deps } from "@/server/types";

/* SEC-1 (ASVS V4.1.1, V3.2): every API route needs a valid session, except the routes below, which are public on purpose and carry
   their own control. Each handler checks its own session (`signed`), so this test is the safety net: a new route that forgets the check
   fails here instead of shipping open. */
const PUBLIC: Record<string, string> = {
  "POST auth/challenge": "sign-in proof-of-work challenge",
  "POST auth/sign-in": "sign-in, step one",
  "POST auth/sign-in/verify": "sign-in, second factor (sealed ticket)",
  "POST auth/sign-in/passkey": "sign-in, passkey step (sealed ticket)",
  "GET system/ready": "readiness probe, no data",
  "POST auth/sign-out": "ends whatever session the cookie names",
  "POST auth/join-requests": "request to join a company (same answer whether or not the email or code exists)",
  "POST auth/password/reset-request": "password reset request (same answer whether or not the email exists)",
  "GET auth/password/reset/:token": "checks a reset token",
  "POST auth/password/reset": "sets a password with a valid reset token and the second factor",
  "POST csp-report": "browser CSP reports (rate limited, reduced)",
  "POST billing/stripe/webhook": "payment provider webhook (signature over the raw body)",
  "GET v1/:collection": "company API: API key, not a session",
  "POST v1/events": "company API: API key, not a session",
  "GET trust-public/:ref": "public Trust Center page",
  "POST trust-public/:ref/code": "Trust Center visitor: email code",
  "POST trust-public/:ref/verify": "Trust Center visitor: verify code",
  "POST trust-public/:ref/sign-out": "Trust Center visitor: sign out",
  "POST trust-public/:ref/nda": "Trust Center visitor session",
  "POST trust-public/:ref/requests": "Trust Center visitor session",
  "POST trust-public/:ref/questions": "Trust Center visitor session",
  "POST trust-public/:ref/subscribe": "Trust Center visitor session",
  "POST trust-public/:ref/unsubscribe": "Trust Center unsubscribe link",
  "GET trust-public/:ref/documents/:id/link": "Trust Center visitor session",
  "POST vendor-portal/open": "vendor portal: invitation token",
  "POST vendor-portal/verify-email": "vendor portal: email check",
  "POST vendor-portal/verify-code": "vendor portal: email code",
  "POST vendor-portal/sign-out": "vendor portal: sign out",
};

const ORIGIN = "https://app.example.test";
function deps(): Deps {
  const clock = 1_800_000_000_000; const store = new MemoryStore(() => clock); const dir = new MemoryDirectory(store); const plat = new MemoryPlatform(store, dir);
  return { auth: new MemoryAuth(() => clock), store, dir, plat, sup: new MemorySupport(store, dir, plat), ws: new MemoryWsStore(store), files: new MemoryFileStore(),
    site: { origin: ORIGIN, rpId: "app.example.test" }, secret: "x".repeat(40), now: () => clock };
}
async function probe(key: string, cookie?: string) {
  const [method, p] = key.split(" "); const raw = RAW_ROUTES.has(key);
  const r: Req = { method, path: p.split("/").map((x) => (x.startsWith(":") ? "probe1" : x)), body: {}, ip: "198.51.100.9", cookies: cookie ? { [COOKIE]: cookie } : {},
    headers: { origin: ORIGIN, "content-type": raw ? "application/octet-stream" : "application/json" }, raw: raw ? new Uint8Array([1, 2, 3]) : undefined };
  return (await handle(deps(), r)).status;
}

describe("SEC-1: authentication on every route", () => {
  it("the public list names only routes that exist", () => {
    for (const k of Object.keys(PUBLIC)) expect(k in ROUTES, k).toBe(true);
  });
  it("every other route refuses a request with no session (401)", async () => {
    const open: string[] = [];
    for (const k of Object.keys(ROUTES)) if (!(k in PUBLIC) && (await probe(k)) !== 401) open.push(k);
    expect(open).toEqual([]);
  });
  it("catches a route that forgets the session check (the guard is not vacuous)", async () => {
    ROUTES["GET probe/open"] = async () => ({ status: 200, body: { ok: true } });
    try { expect(await probe("GET probe/open")).toBe(200); } finally { delete ROUTES["GET probe/open"]; }
  });
  it("and refuses a forged session cookie the same way", async () => {
    const forged = "A".repeat(43);
    const open: string[] = [];
    for (const k of Object.keys(ROUTES)) if (!(k in PUBLIC) && (await probe(k, forged)) !== 401) open.push(k);
    expect(open).toEqual([]);
  });
});
