/* Shared secure-coding helpers (OWASP ASVS v4: V5 validation/encoding, V12 files). Use these instead of ad-hoc checks. */

/** Only http(s) and mailto links may come from data. Anything else (javascript:, data:, vbscript:, file:) becomes "#". (ASVS 5.1.5, 5.3.6) */
export function safeHref(url: unknown): string {
  const s = String(url ?? "").trim();
  if (!s) return "#";
  if (s.startsWith("/") && !s.startsWith("//")) return s; // same-origin path
  try {
    const u = new URL(s);
    return ["http:", "https:", "mailto:"].includes(u.protocol) ? u.toString() : "#";
  } catch { return "#"; }
}

/** Strip path separators, control chars and leading dots; cap length. For download names and for displaying uploaded file names. */
export function safeFileName(name: unknown, fallback = "file"): string {
  const base = String(name ?? "").replace(/[\\/]+/g, "_").replace(/[\u0000-\u001f\u007f<>:"|?*]+/g, "").replace(/^\.+/, "").trim().slice(0, 120);
  return base || fallback;
}

export interface UploadRule { maxBytes: number; exts: string[]; mimes?: string[] }
export const UPLOAD_DEFAULT: UploadRule = {
  maxBytes: 10 * 1024 * 1024,
  exts: ["pdf", "png", "jpg", "jpeg", "txt", "csv", "docx", "xlsx", "json", "md"],
};
/** Client-side upload gate (allow-list by extension + size). Returns an error message or null. The server must re-validate (ASVS 12.1.x). Never render uploaded HTML/SVG inline. */
export function validateUpload(file: { name: string; size: number; type?: string }, rule: UploadRule = UPLOAD_DEFAULT): string | null {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!rule.exts.includes(ext)) return `File type “.${safeFileName(ext, "?")}” is not allowed. Allowed: ${rule.exts.join(", ")}.`;
  if (file.size > rule.maxBytes) return `File is too large (max ${Math.round(rule.maxBytes / 1024 / 1024)} MB).`;
  if (file.size === 0) return "File is empty.";
  if (rule.mimes && file.type && !rule.mimes.includes(file.type)) return "File content type is not allowed.";
  return null;
}

/** Trim and cap free text before it is stored in DATA (ASVS 5.2.2). */
export const clampText = (v: unknown, max = 500): string => String(v ?? "").trim().slice(0, max);

/** Positive-validation helpers (ASVS 5.1.3). */
export const isEmail = (v: string) => /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[^\s@<>]{2,}$/.test(v) && v.length <= 254;
export const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/* ---- additions (Phase 3: api / auth / team) ---- */

/** Cryptographically secure random integer in [0, n). Demo values only, but never Math.random for anything token-like. */
export function randInt(n: number): number {
  const a = new Uint32Array(1);
  const lim = Math.floor(0x100000000 / n) * n; // rejection sampling: no modulo bias
  do { crypto.getRandomValues(a); } while (a[0] >= lim);
  return a[0] % n;
}
/** `bytes` random bytes as lowercase hex (2*bytes chars), from crypto.getRandomValues. Used only for clearly synthetic demo keys. */
export function secureHex(bytes: number): string {
  const a = new Uint8Array(bytes); crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}
const PRIVATE_V4: [number, number, number][] = [ // [first octet, second-octet min, second-octet max]
  [0, 0, 255], [10, 0, 255], [127, 0, 255], [100, 64, 127], [169, 254, 254], [172, 16, 31], [192, 168, 168], [198, 18, 19], [224, 0, 255], [240, 0, 255],
];
/** Strict webhook endpoint check (SSRF hygiene, ASVS 5.1.5 / 12.6.1). Returns true only for https URLs with a public-looking DNS host:
 *  no credentials, no IP literals in private/loopback/link-local/CGNAT/multicast ranges, no IPv6 literals, no localhost/.local/.internal names,
 *  host must contain a dot. UI-side only: the server must resolve and re-check the destination address at delivery time (DNS rebinding, redirects). */
export function isSafeWebhookUrl(raw: unknown): boolean {
  const s = String(raw ?? "").trim();
  if (!s || s.length > 2048 || /[\u0000- \u007f]/.test(s)) return false;
  let u: URL;
  try { u = new URL(s); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const h = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!h || h.startsWith("[") || h.includes(":")) return false; // IPv6 literal
  if (h === "localhost" || /\.(localhost|local|internal|intranet|lan|home|corp)$/.test(h)) return false;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return !PRIVATE_V4.some(([x, lo, hi]) => a === x && b >= lo && b <= hi);
  }
  if (/^[\d.]+$/.test(h) || /^0x/i.test(h)) return false; // numeric host that is not a plain dotted quad
  return h.includes(".");
}
/** Origin + path only (query/fragment can carry tokens). For audit-log targets and toasts. */
export function logSafeUrl(raw: unknown): string {
  try { const u = new URL(String(raw ?? "")); return u.origin + u.pathname; } catch { return clampText(raw, 200); }
}
