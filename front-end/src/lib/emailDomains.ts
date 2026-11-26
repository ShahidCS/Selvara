/* EDGE-20 (owner's decision, recommendation 1): a company may accept requests to join only from its own email domains. Shared by the server
   (the rule) and the Team & Rules page (the same checks before saving). Anyone else joins by invitation, which an admin sends to one address. */

export const MAX_JOIN_DOMAINS = 20;
const DOMAIN = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** The domain part of an address, lower case, without a trailing dot. */
export const domainOf = (email: string): string => email.trim().toLowerCase().split("@").pop()!.replace(/\.$/, "");

/** An address is allowed when the list is empty, or its domain is a listed domain or one of its subdomains (mail.acme.example for acme.example). */
export function domainAllowed(email: string, domains: readonly string[]): boolean {
  if (!domains.length) return true;
  const d = domainOf(email);
  return domains.some((x) => d === x || d.endsWith("." + x));
}

/** Free webmail providers cannot be a company's own domain: listing one would let anyone with an account there ask to join. */
const WEBMAIL = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "ymail.com", "icloud.com", "me.com",
  "mac.com", "aol.com", "proton.me", "protonmail.com", "pm.me", "gmx.com", "gmx.net", "mail.com", "zoho.com", "yandex.com", "yandex.ru", "qq.com", "163.com"]);

/** The list an admin typed (separated by commas, spaces or new lines): lower case, de-duplicated, each a real domain; or why it cannot be saved. */
export function parseJoinDomains(input: unknown): { domains: string[] } | { error: string } {
  const raw = Array.isArray(input) ? input.map((x) => (typeof x === "string" ? x : "")).join(",") : typeof input === "string" ? input : "";
  const list = [...new Set(raw.split(/[\s,;]+/).map((x) => x.trim().toLowerCase().replace(/^@/, "").replace(/\.$/, "")).filter(Boolean))];
  if (list.length > MAX_JOIN_DOMAINS) return { error: `List at most ${MAX_JOIN_DOMAINS} domains.` };
  const bad = list.find((x) => !DOMAIN.test(x)); if (bad) return { error: `"${bad.slice(0, 60)}" is not an email domain (for example acme.example).` };
  const free = list.find((x) => WEBMAIL.has(x)); if (free) return { error: `${free} is a public email provider, not your company's own domain. Invite people who use it instead.` };
  return { domains: list.sort() };
}
