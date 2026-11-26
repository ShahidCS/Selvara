/* Server-only. EDGE-20 (owner's decision, recommendation 2): requests to join from disposable (throwaway) email addresses are refused.
   The list is the community-maintained disposable-email-domains blocklist (CC0-1.0), kept in the repository as data (data/disposableDomains.json,
   with its source commit) and refreshed by hand about monthly: `node scripts/update-disposable-domains.mjs` from front-end/. */
import list from "./data/disposableDomains.json";
import { domainOf } from "@/lib/emailDomains";

const DOMAINS = new Set<string>(list.domains);

/** True when the address's domain, or a domain it is under, is on the disposable list. */
export function isDisposable(email: string): boolean {
  const parts = domainOf(email).split(".");
  for (let i = 0; i < parts.length - 1; i++) if (DOMAINS.has(parts.slice(i).join("."))) return true;
  return false;
}
export const DISPOSABLE_SOURCE = { commit: list.commit, date: list.date, count: DOMAINS.size };
