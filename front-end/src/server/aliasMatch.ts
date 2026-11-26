/* Server-only. EDGE-20 (owner's decision, recommendation 3): a request to join that looks like the same mailbox as a request this company
   rejected, or a member it removed, is flagged to the admins. It is never refused automatically: shared and recycled addresses make false
   matches possible, so a person decides (with a reason, as for every decision).

   How it works
   - The match form of an address: lower case, Unicode NFKC, the domain in punycode, the "+tag" removed from the local part, and for Gmail
     (gmail.com, googlemail.com) the dots removed and the domain unified. john.doe+x@Gmail.com and johndoe@googlemail.com match.
   - Only a keyed hash is stored: HMAC-SHA-256 over the company id and the match form, keyed with MATCH_KEY_SECRET (or, when that is not set,
     a key derived from SERVER_SECRET with HKDF). Keys of two companies never match each other; the address cannot be read back.
   - Records live in the expiring key-value store (no new table): a rejection for 3 months, a removal for 12 months (DATA_RETENTION.md). Each
     keeps the date, the kind and, for a rejection, the admin's reason (at most 200 characters). */
import { createHmac, hkdfSync } from "node:crypto";
import { domainToASCII } from "node:url";
import type { Deps } from "./types";

const DAY = 86_400_000;
export const MATCH_TTL = { rejected: 90 * DAY, removed: 365 * DAY } as const;
export type MatchKind = keyof typeof MATCH_TTL;
export interface MatchRecord { at: number; kind: MatchKind; reason?: string }
const NS = "aliasmatch";
const GMAIL = new Set(["gmail.com", "googlemail.com"]);

/** The form two addresses share when they reach the same mailbox (as far as can be told without asking the provider). */
export function matchForm(email: string): string {
  const e = email.trim().normalize("NFKC").toLowerCase(); const at = e.lastIndexOf("@");
  if (at < 1) return e;
  let local = e.slice(0, at); let domain = e.slice(at + 1).replace(/\.$/, "");
  domain = domainToASCII(domain) || domain;
  local = local.split("+")[0];
  if (GMAIL.has(domain)) { local = local.replace(/\./g, ""); domain = "gmail.com"; }
  return `${local}@${domain}`;
}

let derived: { from: string; key: Buffer } | null = null;
function keyOf(d: Deps): Buffer | string {
  if (d.matchSecret) return d.matchSecret;
  if (derived?.from !== d.secret) derived = { from: d.secret, key: Buffer.from(hkdfSync("sha256", d.secret, "selvara", "alias-match/v1", 32)) };
  return derived.key;
}
/** The stored key for one company and one address. */
export const matchKey = (d: Deps, tenantId: string, email: string): string =>
  createHmac("sha256", keyOf(d)).update(`${tenantId}\u0000${matchForm(email)}`).digest("hex");

/** Remembers a rejection or a removal (the most recent one per mailbox is kept). */
export async function recordMatch(d: Deps, tenantId: string, email: string, kind: MatchKind, reason = ""): Promise<void> {
  const rec: MatchRecord = { at: d.now(), kind, ...(kind === "rejected" && reason ? { reason: reason.slice(0, 200) } : {}) };
  await d.store.kvSet(NS, `${tenantId}:${matchKey(d, tenantId, email)}`, rec, MATCH_TTL[kind]);
}
/** The earlier rejection or removal this address matches in this company, if one is still kept. */
export async function findMatch(d: Deps, tenantId: string, email: string): Promise<MatchRecord | null> {
  const rec = await d.store.kvGet<MatchRecord>(NS, `${tenantId}:${matchKey(d, tenantId, email)}`);
  return rec && d.now() - rec.at < MATCH_TTL[rec.kind] ? rec : null;
}
