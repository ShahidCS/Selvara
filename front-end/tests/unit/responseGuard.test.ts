import { describe, expect, it } from "vitest";
import { ALLOWED, guardBody } from "@/server/responseGuard";
import { ROUTES } from "@/server/core";

/* The response guard (src/server/responseGuard.ts): no credential field and no secret-looking value leaves the server, except the
   one-time values the owner allowed (2026-11-24). Every unit test that calls `handle` also runs through it, and fails on a hit. */
describe("response guard", () => {
  it("removes credential fields at any depth and keeps the rest", () => {
    const g = guardBody("GET team/members", { members: [{ name: "Alex Kim", email: "alex@acme.example", tokenHash: "ab12", password: "x", nested: { refresh_token: "r", salt: "s" } }], ok: true });
    expect(g.body).toEqual({ members: [{ name: "Alex Kim", email: "alex@acme.example", nested: {} }], ok: true });
    expect(g.hits.map((h) => h.path)).toEqual(["members[0].tokenHash", "members[0].password", "members[0].nested.refresh_token", "members[0].nested.salt"]);
  });
  it("redacts values that look like secrets, wherever they are", () => {
    const jwt = ["eyJhbGciOiJIUzI1NiJ9", "eyJzdWIiOiIxMjM0NTY3ODkwIn0", "c2lnbmF0dXJlLXZhbHVl"].join(".");
    const vals = [jwt, "-----BEGIN PRIVATE KEY-----\nabc", ["sk", "live", "abcdefghijklmnop"].join("_"), ["whsec", "abcdefghijkl"].join("_"), "otpauth://totp/Selvara:a?secret=ABC", `sel_acme-eu_k12_${"A".repeat(43)}`];
    for (const v of vals) { const g = guardBody("GET ws/data/risk", { note: v, list: [v] }); expect(g.body).toEqual({ note: "[redacted]", list: ["[redacted]"] }); expect(g.hits).toHaveLength(2); }
    expect(guardBody("GET ws/data/risk", { note: "An ordinary sentence about a key risk and its hash 3f2a" }).hits).toEqual([]);
  });
  it("lets through only the allowed one-time values, at the top level of their own route", () => {
    const enroll = { step: "enroll", ticket: "t1", secret: "JBSWY3DPEHPK3PXP", uri: "otpauth://totp/Selvara:alex?secret=JBSWY3DPEHPK3PXP" };
    expect(guardBody("POST auth/sign-in", enroll)).toEqual({ body: enroll, hits: [] });
    expect(guardBody("GET me/security", enroll).hits.map((h) => h.path)).toEqual(["secret", "uri"]); // anywhere else: removed
    expect(guardBody("POST me/recovery-codes", { codes: ["AAAA-BBBB"] }).hits).toEqual([]);
    expect(guardBody("POST ws/api-keys/:id/reveal", { full: `sel_acme-eu_k1_${"A".repeat(43)}` }).hits).toEqual([]);
    expect(guardBody("POST ws/api-keys/:id/reveal", { other: { full: "x" } }).hits).toHaveLength(1); // nested: not the one-time field
  });
  it("allows exceptions only for routes that exist (or are added with the authenticator work), and only the agreed fields", () => {
    const planned = new Set(["POST me/authenticators", "POST me/authenticators/verify"]);
    for (const r of Object.keys(ALLOWED)) expect(r in ROUTES || planned.has(r), r).toBe(true);
    expect(new Set(Object.values(ALLOWED).flat())).toEqual(new Set(["secret", "uri", "recoveryCodes", "codes", "full"]));
  });
  it("never returns an invitation link: links go only by email", () => {
    expect(guardBody("POST team/invitations", { emailed: false, link: "https://app.example.test/login#invite=abc" }).body).toEqual({ emailed: false });
  });
});
