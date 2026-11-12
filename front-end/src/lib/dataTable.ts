import { csvCell } from "./format";

/* Pure logic of the shared data table (tabs, filter chips, sort, selection, pagination). No React, so it is unit tested directly. */

export type SortDir = "asc" | "desc";
export interface SortState { key: string; dir: SortDir }
export interface TableState {
  tab: string;
  /** Text typed in the table's search box. */
  q: string;
  filters: Record<string, string>;
  sort: SortState | null;
  page: number;
  size: number;
  hidden: string[];
  selected: string[];
}
export const ALL = "All";

export interface RowQuery<T> {
  /** Case-insensitive, accent-insensitive substring match of every word typed (all words must match). */
  search?: { q: string; text: (r: T) => string } | null;
  tab?: { match: (r: T) => boolean } | null;
  /** `test` overrides equality for a field with several values per row (for example the frameworks a control maps to). */
  filters: { key: string; get: (r: T) => string; test?: (r: T, want: string) => boolean }[];
  state: Pick<TableState, "filters" | "sort">;
  value: (key: string) => ((r: T) => string | number) | undefined;
}

/** Lower-case and strip accents so a search for "cafe" finds "Café". */
export const norm = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const cmp = (a: string | number, b: string | number) =>
  typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });

/** Tab, then filter chips (a chip set to "All" does not filter), then sort. Sorting is stable and never mutates the input. */
export function queryRows<T>(rows: readonly T[], q: RowQuery<T>): T[] {
  let out = rows.filter((r) => (q.tab ? q.tab.match(r) : true));
  const words = q.search ? norm(q.search.q).split(/\s+/).filter(Boolean) : [];
  if (words.length && q.search) { const t = q.search.text; out = out.filter((r) => { const h = norm(t(r)); return words.every((w) => h.includes(w)); }); }
  for (const f of q.filters) {
    const want = q.state.filters[f.key];
    if (want && want !== ALL) out = out.filter((r) => (f.test ? f.test(r, want) : f.get(r) === want));
  }
  const s = q.state.sort; const val = s ? q.value(s.key) : undefined;
  if (s && val) {
    const sign = s.dir === "asc" ? 1 : -1;
    out = out.map((r, i) => [r, i] as const).sort((x, y) => sign * cmp(val(x[0]), val(y[0])) || x[1] - y[1]).map((x) => x[0]);
  }
  return out;
}

/** Click on a sortable header cycles ascending, descending, then back to the original order. */
export function nextSort(cur: SortState | null, key: string): SortState | null {
  if (!cur || cur.key !== key) return { key, dir: "asc" };
  return cur.dir === "asc" ? { key, dir: "desc" } : null;
}

export interface PageInfo { page: number; pages: number; from: number; to: number; total: number }
/** 1-based page; clamps a stale page (for example after a filter shrinks the list). `from` and `to` are 1-based and 0 when the list is empty. */
export function pageInfo(total: number, page: number, size: number): PageInfo {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, size)));
  const p = Math.min(Math.max(1, page), pages);
  const from = total ? (p - 1) * size + 1 : 0;
  const to = Math.min(total, p * size);
  return { page: p, pages, from, to, total };
}

/** Page buttons to render: always first and last, a window around the current page, and null for each gap. */
export function pageWindow(page: number, pages: number, span = 1): (number | null)[] {
  const keep = new Set([1, pages]);
  for (let i = page - span; i <= page + span; i++) if (i >= 1 && i <= pages) keep.add(i);
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((n, i) => { if (i && n - sorted[i - 1] > 1) out.push(null); out.push(n); });
  return out;
}

/** Header checkbox state for the rows on the current page. */
export function selectionState(pageIds: readonly string[], selected: readonly string[]): "none" | "some" | "all" {
  if (!pageIds.length) return "none";
  const n = pageIds.filter((id) => selected.includes(id)).length;
  return n === 0 ? "none" : n === pageIds.length ? "all" : "some";
}
export function toggleAll(pageIds: readonly string[], selected: readonly string[]): string[] {
  return selectionState(pageIds, selected) === "all" ? selected.filter((id) => !pageIds.includes(id)) : Array.from(new Set([...selected, ...pageIds]));
}
export const toggleOne = (id: string, selected: readonly string[]): string[] => (selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

/** CSV for "Export selected": every cell goes through the shared `csvCell` (quoting and the spreadsheet formula-injection guard). */
export const toCsv = (head: string[], rows: (string | number)[][]): string => [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
