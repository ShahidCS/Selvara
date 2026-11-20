/* The PII blocker for AI requests (production programme group 6; owner decision: "A PII blocker checks every request: by default it blocks and
   explains (what kind of data, where), audited; a company admin may choose 'mask then send' instead").
   The server runs it on everything that would leave for the model (the question, earlier turns and every record attached); the browser runs the
   same check first only to explain before sending. It finds structured personal data and secrets by pattern (with checksums where one exists),
   and the names of the company's own people. It never returns the values it found: only the kind and where. Pattern detection cannot find every
   kind of personal data (free-text descriptions of a person, unusual identifiers); the screens say so. Draft for security review. */

export type PiiKind = "email address" | "phone number" | "payment card number" | "bank account (IBAN)" | "national identity number" | "passport number"
  | "date of birth" | "IP address" | "secret or credential" | "person's name";
export interface PiiFinding { kind: PiiKind; where: string; count: number }
export interface PiiPart { where: string; text: string }

const luhn = (digits: string) => {
  let sum = 0; let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) { let n = digits.charCodeAt(i) - 48; if (dbl) { n *= 2; if (n > 9) n -= 9; } sum += n; dbl = !dbl; }
  return sum % 10 === 0;
};
const ibanOk = (raw: string) => {
  const s = raw.replace(/\s+/g, "").toUpperCase(); if (s.length < 15 || s.length > 34) return false;
  const moved = s.slice(4) + s.slice(0, 4); let rem = 0;
  for (const ch of moved) { const v = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch; for (const d of v) rem = (rem * 10 + Number(d)) % 97; }
  return rem === 1;
};
const ipOk = (s: string) => s.split(".").every((o) => Number(o) <= 255 && String(Number(o)) === o) && !/^(0\.|1\.\d+\.\d+\.\d+$)/.test(s);

/** Each rule: what it finds, its pattern (global), and an optional check on the match (checksums, ranges). Order matters for masking. */
const RULES: { kind: PiiKind; tag: string; re: RegExp; ok?: (m: string) => boolean }[] = [
  { kind: "secret or credential", tag: "SECRET", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g },
  { kind: "secret or credential", tag: "SECRET", re: /\b(?:sk-[A-Za-z0-9_-]{20,}|sk_(?:live|test)_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|sel_[a-z0-9-]+_[A-Za-z0-9]+_[A-Za-z0-9_-]{20,})\b/g },
  { kind: "secret or credential", tag: "SECRET", re: /\b(?:password|passwd|pwd|secret|api[ _-]?key|token)\s*[:=]\s*\S{4,}/gi },
  { kind: "email address", tag: "EMAIL", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g },
  { kind: "bank account (IBAN)", tag: "IBAN", re: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g, ok: ibanOk },
  { kind: "payment card number", tag: "CARD", re: /\b(?:\d[ -]?){12,18}\d\b/g, ok: (m) => { const d = m.replace(/\D/g, ""); return d.length >= 13 && d.length <= 19 && luhn(d); } },
  { kind: "national identity number", tag: "NATIONAL_ID", re: /\b\d{5}-\d{7}-\d\b/g }, // Pakistan CNIC
  { kind: "national identity number", tag: "NATIONAL_ID", re: /\b784-?\d{4}-?\d{7}-?\d\b/g }, // UAE Emirates ID
  { kind: "national identity number", tag: "NATIONAL_ID", re: /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g }, // US SSN
  { kind: "national identity number", tag: "NATIONAL_ID", re: /\b(?![DFIQUV])[A-Z](?![DFIQUVO])[A-Z] ?\d{2} ?\d{2} ?\d{2} ?[A-D]\b/g }, // UK National Insurance
  { kind: "passport number", tag: "PASSPORT", re: /\bpassport\s*(?:no\.?|number|#)?\s*[:#]?\s*[A-Z0-9]{6,9}\b/gi },
  { kind: "date of birth", tag: "DOB", re: /\b(?:dob|d\.o\.b\.|date of birth|born(?: on)?)\s*[:-]?\s*\d{1,4}[\s./-]\w{1,9}[\s./-]\d{1,4}/gi },
  { kind: "phone number", tag: "PHONE", re: /\+\d{1,3}[\s.-]?(?:\(\d{1,4}\)[\s.-]?)?\d{2,4}(?:[\s.-]?\d{2,4}){1,4}\b/g },
  { kind: "phone number", tag: "PHONE", re: /(?:\(\d{3}\)\s?|\b\d{3}-)\d{3}-\d{4}\b|\b0\d{2,4}[\s-]\d{6,8}\b|\b03\d{9}\b/g },
  { kind: "IP address", tag: "IP", re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, ok: ipOk },
];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A pattern for the given people's names (whole words, any case). Names shorter than 5 letters or with one word are skipped: too many false hits. */
function namesRe(names: string[]): RegExp | null {
  const list = [...new Set(names.map((n) => n.trim()).filter((n) => n.length >= 5 && /\s/.test(n)))].sort((a, b) => b.length - a.length).slice(0, 2000);
  return list.length ? new RegExp(`(?<![\\p{L}])(?:${list.map((n) => esc(n).replace(/\s+/g, "\\s+")).join("|")})(?![\\p{L}])`, "giu") : null;
}

/** Every kind of personal data or secret found in each part (kind and where only, never the value). */
export function findPii(parts: PiiPart[], people: string[] = []): PiiFinding[] {
  const out: PiiFinding[] = []; const nre = namesRe(people);
  for (const p of parts) {
    const counts = new Map<PiiKind, number>(); let text = p.text;
    for (const r of RULES) {
      text = text.replace(r.re, (m) => { if (r.ok && !r.ok(m)) return m; counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1); return " "; }); // found once, not again by a looser rule
    }
    if (nre) text.replace(nre, (m) => { counts.set("person's name", (counts.get("person's name") ?? 0) + 1); return m; });
    for (const [kind, count] of counts) out.push({ kind, where: p.where, count });
  }
  return out;
}
/** The text with every finding replaced by a placeholder such as [EMAIL] or [PERSON] ("mask then send"). */
export function maskPii(text: string, people: string[] = []): string {
  let s = text;
  for (const r of RULES) s = s.replace(r.re, (m) => (r.ok && !r.ok(m) ? m : `[${r.tag}]`));
  const nre = namesRe(people); if (nre) s = s.replace(nre, "[PERSON]");
  return s;
}
/** Why a request was not sent, in plain words: what kind of data, and where. */
export function piiExplain(f: PiiFinding[]): string {
  const by = new Map<string, Set<string>>();
  for (const x of f) { const s = by.get(x.where) ?? new Set(); s.add(x.kind); by.set(x.where, s); }
  const parts = [...by].slice(0, 6).map(([where, kinds]) => `${where}: ${[...kinds].join(", ")}`);
  return `Not sent: personal data or a secret was found (${parts.join("; ")}${by.size > 6 ? "; and more" : ""}). Remove it and ask again. Nothing was sent to the AI provider.`;
}
