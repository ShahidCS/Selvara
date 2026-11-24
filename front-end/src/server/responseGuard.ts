/* Response guard: the last check on every API response body before it leaves the server (core.ts handle()).
   Secrets, credential material and one-time values never go back to the browser, except the few values a person must see once
   to finish an action they started themselves (owner decision, 2026-11-24):
     - the authenticator setup key and its otpauth:// URI, while setting up an authenticator;
     - recovery codes, once, when they are issued;
     - a new API key, once, and a webhook signing secret, once.
   Two checks:
     1. Field names: a field whose name is credential material (password, hash, salt, token, secret, ...) is removed, unless the
        route is allowed that one field (ALLOWED below).
     2. Values: a string that looks like a secret (a JWT, a private key, a provider secret key, an otpauth:// URI, a signed
        session token) is replaced with "[redacted]", unless it sits in an allowed field.
   A hit is a bug in a handler. In production the value is removed and the hit is logged (route and field name, never the value);
   under test (NODE_ENV=test) it throws, so CI fails on the first leak. Transport security (TLS, HSTS) is set in next.config.js
   and vercel.json; this guard limits what a compromised browser, a proxy log or a person looking over a shoulder could see. */

/** Field names that are never sent, whatever their value. Compared case-insensitively, ignoring "_" and "-".
    "hash" and "code" alone are not here: the app shows content fingerprints (audit-log chain, risk snapshots) and country or
    currency codes under those names. Credential hashes always carry a specific name (tokenHash, keyHash, ...), and every
    stored record type that holds one is checked by tests/unit/responseGuard.test.ts. */
const DENY = new Set([
  "password", "passwordhash", "pwhash", "newpassword", "currentpassword",
  "tokenhash", "keyhash", "secrethash", "codehash", "codeshash", "recoveryhash", "passwordsalt", "salt", "pepper",
  "token", "accesstoken", "refreshtoken", "idtoken", "sessiontoken", "invitetoken", "resettoken", "ticketsecret",
  "secret", "clientsecret", "webhooksecret", "signingsecret", "totpsecret", "sealed", "sealedsecret",
  "servicekey", "servicerolekey", "apikey", "privatekey", "full",
  "otp", "otpcode", "codes", "recoverycodes", "uri", "otpauth",
  "link", "invitelink", "resetlink", "magiclink",
]);

/** Route -> the deny-listed fields it may send (only the one-time values listed in the header). */
export const ALLOWED: Record<string, readonly string[]> = {
  "POST auth/sign-in": ["secret", "uri"], // authenticator set-up at the first sign-in: the person scans or types the key
  "POST auth/sign-in/verify": ["recoveryCodes"], // issued once, right after the authenticator is confirmed
  "POST me/recovery-codes": ["codes"], // a new set, shown once
  "POST me/authenticators": ["secret", "uri"], // adding or replacing an authenticator from Your account
  "POST me/authenticators/verify": ["recoveryCodes"],
  "POST ws/api-keys": ["full"], // a read key is issued at once (no approval needed) and shown once
  "POST ws/api-keys/:id/reveal": ["full"], // the key, shown once to the admin who requested it
  "POST ws/webhooks/:id/secret": ["secret"], // the signing secret, shown once to the admin who added the endpoint
};

/** Route -> deny-listed field names that carry no secret there, at any depth: a content fingerprint, a currency code. */
export const NOT_SECRET: Record<string, readonly string[]> = {};

const norm = (k: string) => k.toLowerCase().replace(/[_-]/g, "");
const PATTERNS: [string, RegExp][] = [
  ["jwt", /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/],
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["provider secret key", /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{8,}|\bwhsec_[A-Za-z0-9]{8,}|\bsb_secret_[A-Za-z0-9_-]{8,}/],
  ["otpauth uri", /\botpauth:\/\//i],
  ["Selvara API key", /\bsel_[a-z0-9-]+_k\d+_[A-Za-z0-9_-]{30,}/],
];

export interface GuardHit { route: string; path: string; reason: string }

/** Returns a copy of the body with denied fields removed and secret-looking values redacted, and the list of hits. */
export function guardBody(route: string, body: unknown): { body: unknown; hits: GuardHit[] } {
  const allowed = new Set((ALLOWED[route] ?? []).map(norm)); const plain = new Set((NOT_SECRET[route] ?? []).map(norm));
  const hits: GuardHit[] = [];
  const walk = (v: unknown, path: string, allowedField: boolean, depth: number): unknown => {
    if (depth > 40) return v;
    if (typeof v === "string") {
      if (allowedField) return v;
      for (const [why, re] of PATTERNS) if (re.test(v)) { hits.push({ route, path, reason: `value looks like a ${why}` }); return "[redacted]"; }
      return v;
    }
    if (Array.isArray(v)) return v.map((x, i) => walk(x, `${path}[${i}]`, allowedField, depth + 1));
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        const n = norm(k); const p = path ? `${path}.${k}` : k;
        const isAllowed = depth === 0 && allowed.has(n);
        if (DENY.has(n) && !isAllowed && !plain.has(n)) {
          if (x === undefined || x === null || x === "") continue; // nothing to leak
          hits.push({ route, path: p, reason: "credential field" }); continue;
        }
        out[k] = walk(x, p, isAllowed, depth + 1);
      }
      return out;
    }
    return v;
  };
  return { body: walk(body, "", false, 0), hits };
}

export class ResponseLeak extends Error {
  constructor(readonly hits: GuardHit[]) { super(`Response guard: ${hits.map((h) => `${h.route} ${h.path} (${h.reason})`).join("; ")}`); }
}
