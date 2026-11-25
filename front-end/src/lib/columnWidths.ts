/* I2, I3: table column widths. One configuration for every DataTable: the default width (px) of a column by its key; a column may set its own
   `width`; any other column gets COL_DEFAULT. Tables use table-layout: fixed with <col> widths, so paging, sorting and
   filtering never change them. People can drag a column edge (or use the arrow keys on it) to resize it for the rest of their session: the
   widths live in sessionStorage only and are cleared at sign-out, so every sign-in starts from these defaults. Nothing is kept across sessions. */
export const COLUMN_WIDTHS: Record<string, number> = {
  // identifiers and short codes
  id: 110, seq: 64, ref: 120, ver: 90, hash: 140, ticket: 120, chain: 80,
  // statuses, levels and small values
  status: 130, mfa: 130, level: 110, sev: 100, tier: 100, result: 110, verified: 100, scope: 130, currency: 90, tax: 90, uses: 70,
  // people and roles
  owner: 140, by: 140, who: 140, actor: 150, user: 160, person: 160, role: 160,
  // dates and times
  at: 150, when: 150, due: 110, since: 130, updated: 130, issued: 120, last: 130, period: 130,
  // money
  amount: 120, total: 120, out: 120, rate: 120,
  // places
  company: 170, country: 120, region: 100, ip: 130,
  // actions column
  act: 120,
};
/** A column not listed above. Every column has a width: with a fixed layout, spare room is shared in proportion and a narrow screen scrolls. */
export const COL_DEFAULT = 170;
export const COL_MIN = 64, COL_MAX = 900, CHECKBOX_W = 44, ACTIONS_W = 88;

const PREFIX = "selvara.colw.";
/** This session's widths for one table (key -> px), or {} when none were changed. */
export function sessionWidths(table: string): Record<string, number> {
  try { const v = JSON.parse(sessionStorage.getItem(PREFIX + table) || "{}"); return v && typeof v === "object" ? v as Record<string, number> : {}; } catch { return {}; }
}
export function saveSessionWidth(table: string, key: string, px: number) {
  try { const all = sessionWidths(table); all[key] = Math.round(Math.min(COL_MAX, Math.max(COL_MIN, px))); sessionStorage.setItem(PREFIX + table, JSON.stringify(all)); } catch { /* storage off: widths last until reload */ }
}
/** Sign-out: every table goes back to the defaults at the next sign-in. */
export function clearSessionWidths() {
  try { for (let i = sessionStorage.length - 1; i >= 0; i--) { const k = sessionStorage.key(i); if (k && k.startsWith(PREFIX)) sessionStorage.removeItem(k); } } catch { /* nothing stored */ }
}
