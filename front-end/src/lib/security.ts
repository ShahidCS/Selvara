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
