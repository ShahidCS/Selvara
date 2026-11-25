/* Server-only. Content-Security-Policy violation reports (migration 0012). Browsers POST what the site's CSP blocked to /api/csp-report, in
   the Reporting API format (application/reports+json, an array) or the older one (application/csp-report, {"csp-report": {...}}). The
   endpoint takes no sign-in, so each report is reduced before anything is kept:
     - directive: the CSP directive that blocked it (effective directive), lower-case letters and hyphens only;
     - blocked: "inline", "eval", "wasm-eval", "data", "blob" or the blocked URL's origin (scheme, host, port), never its path or query;
     - page: the path of the page on this site, without query or fragment (tokens can sit there); a report about another site is dropped;
     - source: the script file's path on this site, or the origin of a file elsewhere; line: its line number.
   Never kept: the code sample (it can hold what a person typed), the IP address, cookies, user agent. Reports caused by browser extensions
   (chrome-extension:, moz-extension:, safari-extension: ...) are dropped as noise. Identical reports are counted, not repeated. */
import type { Db } from "./db";

export interface CspEntry { directive: string; blocked: string; page: string; source: string; line: number }
export interface CspRow extends CspEntry { hits: number; firstAt: number; lastAt: number }
export type CspAdd = "counted" | "stored" | "full";
export const CSP_MAX_ROWS = 500, CSP_KEEP_DAYS = 30, CSP_PER_REQUEST = 10, CSP_PER_HOUR = 60;

export interface CspReports {
  /** Counts one reduced report (anonymous). */
  add(e: CspEntry, at: number): Promise<CspAdd>;
  /** Platform staff: the most recent rows first. */
  list(userId: string, limit?: number): Promise<CspRow[]>;
}

const EXT = /^(chrome|moz|safari|safari-web|ms-browser|edge)-extension:|^(about|chrome|resource|view-source):/i;
const KEYWORDS = new Set(["inline", "eval", "wasm-eval", "trusted-types-policy", "trusted-types-sink", "data", "blob", "self"]);
const clean = (v: string, n = 200) => v.replace(/[^A-Za-z0-9._~:/%@+=,;!$&'()*\-[\]]/g, "").slice(0, n);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** The site's own path for a URL, or null when it is not on this site. */
function ownPath(u: string, origin: string): string | null {
  try { const x = new URL(u); return x.origin === origin ? clean(x.pathname) || "/" : null; } catch { return null; }
}
/** "inline" / "eval" / ... or the origin of the blocked URL; null for extension noise or nothing usable. */
function blockedOf(v: string): string | null {
  if (!v) return "inline";
  if (EXT.test(v)) return null;
  const k = v.toLowerCase().replace(/:$/, "");
  if (KEYWORDS.has(k)) return k;
  try { const x = new URL(v); if (EXT.test(x.protocol)) return null; return x.origin === "null" ? clean(x.protocol.replace(/:$/, ""), 40) || null : clean(x.origin); } catch { return null; }
}

/** One raw report (either format) -> the reduced entry, or null when it is noise, about another site or malformed. */
export function reduceReport(raw: unknown, origin: string): CspEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  // Reporting API: { type: "csp-violation", body: {...} }; older: { "csp-report": {...} } (field names with hyphens)
  const b = (o.type === "csp-violation" && o.body && typeof o.body === "object" ? o.body : o["csp-report"] && typeof o["csp-report"] === "object" ? o["csp-report"] : null) as Record<string, unknown> | null;
  if (!b) return null;
  const directive = (str(b.effectiveDirective) || str(b["effective-directive"]) || str(b["violated-directive"]).split(" ")[0]).toLowerCase();
  if (!/^[a-z][a-z-]{1,39}$/.test(directive)) return null;
  const blocked = blockedOf(str(b.blockedURL) || str(b["blocked-uri"]));
  if (!blocked) return null;
  const page = ownPath(str(b.documentURL) || str(b["document-uri"]), origin);
  if (!page) return null;
  const sf = str(b.sourceFile) || str(b["source-file"]);
  if (sf && EXT.test(sf)) return null;
  const source = !sf ? "" : (ownPath(sf, origin) ?? blockedOf(sf) ?? "");
  const ln = Number(b.lineNumber ?? b["line-number"] ?? 0);
  return { directive, blocked, page, source, line: Number.isInteger(ln) && ln >= 0 && ln <= 1_000_000 ? ln : 0 };
}

/** The request body -> up to CSP_PER_REQUEST raw reports. The API route wraps a JSON array as { reports: [...] }. */
export function rawReports(body: Record<string, unknown>): unknown[] {
  if (Array.isArray(body.reports)) return (body.reports as unknown[]).filter((x) => (x as { type?: unknown })?.type === "csp-violation").slice(0, CSP_PER_REQUEST);
  return body["csp-report"] ? [body] : [];
}

const n = (v: unknown) => Number(v);
export class PgCspReports implements CspReports {
  constructor(private db: Db) {}
  async add(e: CspEntry, at: number): Promise<CspAdd> {
    const r = await this.db.tx({ tenantId: null, userId: null }, (q) => q.query<{ r: string }>("select csp_report_add($1, $2, $3, $4, $5, $6) as r", [e.directive, e.blocked, e.page, e.source, e.line, at]));
    return (r[0]?.r as CspAdd) ?? "full";
  }
  async list(userId: string, limit = 100): Promise<CspRow[]> {
    const rows = await this.db.tx({ tenantId: null, userId, platform: true }, (q) => q.query("select * from csp_reports order by last_ms desc limit $1", [Math.min(Math.max(1, limit), CSP_MAX_ROWS)]));
    return rows.map((r) => ({ directive: String(r.directive), blocked: String(r.blocked), page: String(r.page), source: String(r.source), line: n(r.line), hits: n(r.hits), firstAt: n(r.first_ms), lastAt: n(r.last_ms) }));
  }
}

/** The stand-in for the server tests: the same rules as csp_report_add (30-day window, 500 rows, counting). */
export class MemoryCspReports implements CspReports {
  rows: CspRow[] = [];
  async add(e: CspEntry, at: number): Promise<CspAdd> {
    this.rows = this.rows.filter((r) => r.lastAt >= at - CSP_KEEP_DAYS * 86_400_000);
    const same = this.rows.find((r) => r.directive === e.directive && r.blocked === e.blocked && r.page === e.page && r.source === e.source && r.line === e.line);
    if (same) { same.hits++; same.lastAt = Math.max(same.lastAt, at); return "counted"; }
    if (this.rows.length >= CSP_MAX_ROWS) return "full";
    this.rows.push({ ...e, hits: 1, firstAt: at, lastAt: at }); return "stored";
  }
  async list(_userId: string, limit = 100): Promise<CspRow[]> { return [...this.rows].sort((a, b) => b.lastAt - a.lastAt).slice(0, limit); }
}
