import { useEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { ACTIONS_W, CHECKBOX_W, COLUMN_WIDTHS, COL_DEFAULT, COL_MAX, COL_MIN, saveSessionWidth, sessionWidths } from "@/lib/columnWidths";
import { useLayer } from "@/hooks/useLayer";
import { useModState } from "@/lib/store";
import { downloadText } from "@/lib/format";
import {
  ALL, nextSort, pageInfo, pageWindow, queryRows, selectionState, toCsv, toggleAll, toggleOne, type TableState,
} from "@/lib/dataTable";
import { Icon } from "./Icon";

export interface DTColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** The column is left out while this is true for every row (for example a "Proposed" column when nothing is proposed). */
  emptyWhen?: (row: T) => boolean;
  /** Plain value used for sorting and for "Export selected". Without `value` or `sortBy` the column is not sortable; without `value` it is not exported. */
  value?: (row: T) => string | number;
  /** Sort key when the text order is not the natural order (for example Critical, High, Medium, Low). Defaults to `value`. */
  sortBy?: (row: T) => string | number;
  align?: "end";
  /** Hide the header text visually (it stays for screen readers); for action columns. */
  hideHeader?: boolean;
  defaultHidden?: boolean;
  /** Locked columns cannot be hidden from the Columns menu. */
  locked?: boolean;
  /** Keep the cell on one line (IDs such as R-014, short statuses): it never breaks as "R-" / "014" on a narrow screen. */
  nowrap?: boolean;
  /** R13: a muted second line under the cell (a linked control, a role, a size). */
  sub?: (row: T) => ReactNode;
  /** I2: default width in px; otherwise COLUMN_WIDTHS[key] (lib/columnWidths.ts); otherwise an equal share of what is left. */
  width?: number;
}
export interface DTTab<T> { key: string; label: string; match: (row: T) => boolean }
export interface DTFilter<T> {
  key: string; label: string; options: string[]; get: (row: T) => string;
  /** Display text for an option when it differs from its value (for example a framework id and its name). */
  labels?: Record<string, string>;
  /** Match rule for a row that has several values for this field. Defaults to `get(row) === option`. */
  test?: (row: T, option: string) => boolean;
  /** R15: a less-used filter, offered under "+ Add filter" until it is added or has a value. */
  more?: boolean;
}
export interface DTBulk<T> { label: string; icon?: string; run: (rows: T[]) => void; disabled?: boolean; title?: string }
export interface DTRowAction<T> { label: string; run: (row: T) => void; /** A reason the action is unavailable; shown and the item is disabled. */ whyNot?: string | null }

export interface DataTableProps<T> {
  /** State key: tab, filters, sort, page, columns and selection persist per id while the app is open. */
  id: string;
  /** Accessible name of the table and of the controls around it. */
  label: string;
  rows: readonly T[];
  rowKey: (row: T) => string;
  columns: DTColumn<T>[];
  tabs?: DTTab<T>[];
  /** Adds a search box. Return the text a row should be found by (names, ids, owners). */
  searchText?: (row: T) => string;
  filters?: DTFilter<T>[];
  bulk?: DTBulk<T>[];
  rowActions?: (row: T) => DTRowAction<T>[];
  onOpen?: (row: T) => void;
  sizes?: number[];
  /** Adds "Export selected" (CSV of the visible columns that have a `value`). */
  exportName?: string;
  /** Shown when the list itself is empty (no search or filter on): say what will appear here, e.g. "No events yet". */
  emptyText?: string;
  /** Human name of a row for the "Select …" and "Actions for …" labels (a person's name rather than a user id). Defaults to `rowKey`. */
  rowLabel?: (row: T) => string;
}

/** A cell with its optional second line (R13); an empty second line is left out. */
function subOf<T>(c: DTColumn<T>, r: T): ReactNode {
  const sub = c.sub?.(r);
  return sub === null || sub === undefined || sub === "" ? c.render(r) : <><div className="cell-main">{c.render(r)}</div><span className="cell-sub">{sub}</span></>;
}
const initial = (sizes: number[], cols: DTColumn<unknown>[]): TableState => ({
  tab: ALL, q: "", filters: {}, sort: null, page: 1, size: sizes[0], hidden: cols.filter((c) => c.defaultHidden).map((c) => c.key), selected: [],
});

function ColumnsMenu<T>({ id, cols, sizes, close }: { id: string; cols: DTColumn<T>[]; sizes: number[]; close: () => void }) {
  const [st, setSt] = useModState<TableState>(`dt.${id}`, initial(sizes, cols as DTColumn<unknown>[]));
  return (
    <>
      <div className="ph">Columns</div>
      {cols.map((c) => {
        const on = !st.hidden.includes(c.key);
        return (
          <button key={c.key} role="menuitemcheckbox" aria-checked={on} disabled={c.locked}
            onClick={() => setSt({ ...st, hidden: on ? [...st.hidden, c.key] : st.hidden.filter((k) => k !== c.key) })}>
            <Icon name={on ? "check" : "blank"} />{c.header || "Actions"}
          </button>
        );
      })}
      <div className="div" />
      <button role="menuitem" onClick={close}>Done</button>
    </>
  );
}

export function DataTable<T>(p: DataTableProps<T>) {
  const L = useLayer();
  const sizes = p.sizes || [10, 25, 50];
  const [st, setSt] = useModState<TableState>(`dt.${p.id}`, initial(sizes, p.columns as DTColumn<unknown>[]));
  const patch = (x: Partial<TableState>) => setSt({ ...st, ...x });

  const cols = p.columns.filter((c) => !st.hidden.includes(c.key) && !(c.emptyWhen && p.rows.length > 0 && p.rows.every(c.emptyWhen)));
  const tab = p.tabs?.find((t) => t.key === st.tab) || null;
  // I2, I3: fixed column widths (session overrides, then the column's own, then the shared defaults); the rest share what is left
  const [colW, setColW] = useState<Record<string, number>>({});
  useEffect(() => { setColW(sessionWidths(p.id)); }, [p.id]); // eslint-disable-line react-hooks/set-state-in-effect -- read this session's widths once, in the browser
  const baseOf = (c: DTColumn<T>) => c.width ?? COLUMN_WIDTHS[c.key] ?? COL_DEFAULT;
  // The table is as wide as its container (spare room shared in proportion) or as wide as its columns, whichever is more; a wider table
  // scrolls inside its container. Measured in pixels: a percentage width resolves against the wrong box inside the page's flex layout.
  const wrapRef = useRef<HTMLDivElement>(null); const [wrapW, setWrapW] = useState(0);
  useEffect(() => {
    const el = wrapRef.current; if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setWrapW(el.clientWidth)); ro.observe(el); return () => ro.disconnect();
  }, []);
  // When the default widths do not fit, they shrink together (to 70% at most); only a table that still does not fit scrolls. A column the
  // person resized keeps exactly their width. Depends only on the container and the configuration, so paging and sorting never move it.
  const fixedW = (p.bulk?.length || p.exportName ? CHECKBOX_W : 0) + (p.rowActions ? ACTIONS_W : 0); // the checkbox column shows when rows can be selected
  // the Actions column keeps its width: its buttons are never squeezed or clipped
  const keeps = (c: DTColumn<T>) => c.key === "act" || colW[c.key] !== undefined;
  const keptW = fixedW + cols.filter(keeps).reduce((a, c) => a + (colW[c.key] ?? baseOf(c)), 0);
  const scalable = cols.filter((c) => !keeps(c)).reduce((a, c) => a + baseOf(c), 0);
  const scale = wrapW && scalable && scalable + keptW > wrapW ? Math.max(0.7, (wrapW - keptW) / scalable) : 1;
  const widthOf = (c: DTColumn<T>) => colW[c.key] ?? (keeps(c) ? baseOf(c) : Math.floor(baseOf(c) * scale));
  const resizeTo = (key: string, px: number, save: boolean) => {
    const w = Math.round(Math.min(COL_MAX, Math.max(COL_MIN, px)));
    setColW((m) => ({ ...m, [key]: w })); if (save) saveSessionWidth(p.id, key, w);
  };
  const valueOf = (key: string) => { const c = p.columns.find((x) => x.key === key); return c?.sortBy || c?.value; };
  const rows = queryRows(p.rows, { tab, search: p.searchText ? { q: st.q || "", text: p.searchText } : null, filters: (p.filters || []).map((f) => ({ key: f.key, get: f.get, test: f.test ? (r: T, want: string) => f.test!(r, want) : undefined })), state: st, value: valueOf });
  const info = pageInfo(rows.length, st.page, st.size);
  const pageRows = rows.slice(info.from ? info.from - 1 : 0, info.to);
  const pageIds = pageRows.map(p.rowKey);
  const live = new Set(p.rows.map(p.rowKey));
  const selected = st.selected.filter((id) => live.has(id));
  const sel = selectionState(pageIds, selected);
  const selectable = !!(p.bulk?.length || p.exportName);
  // "Clear filters" is offered only for a search or a filter chip; a status tab is not a filter to clear (it has its own All tab)
  const filtered = !!(st.q || "").trim() || Object.values(st.filters).some((v) => v && v !== ALL);
  const nameOf = p.rowLabel || p.rowKey;
  const reset = () => patch({ q: "", filters: {}, page: 1, added: [] });
  // R15: filters marked `more` stay under "+ Add filter" until added (or set); the visible sort label opens a sort menu
  const added = st.added || [];
  const shownFilter = (f: DTFilter<T>) => !f.more || added.includes(f.key) || (st.filters[f.key] && st.filters[f.key] !== ALL);
  const hiddenFilters = (p.filters || []).filter((f) => !shownFilter(f));
  const sortable = p.columns.filter((c) => c.value || c.sortBy);
  const sortCol = st.sort ? p.columns.find((c) => c.key === st.sort!.key) : null;
  const addFilter = (ev: React.MouseEvent) => L.popover(ev, (close) => (
    <>{hiddenFilters.map((f) => <button key={f.key} role="menuitem" onClick={() => { close(); patch({ added: [...added, f.key] }); }}>{f.label}</button>)}</>
  ), { label: "Add filter", align: "start" });
  const sortMenu = (ev: React.MouseEvent) => L.popover(ev, (close) => (
    <>
      <div className="ph">Sort by</div>
      <button role="menuitemradio" aria-checked={!st.sort} onClick={() => { close(); patch({ sort: null, page: 1 }); }}><Icon name={!st.sort ? "check" : "blank"} />Default order</button>
      {sortable.flatMap((c) => (["asc", "desc"] as const).map((dir) => {
        const on = st.sort?.key === c.key && st.sort.dir === dir;
        return <button key={c.key + dir} role="menuitemradio" aria-checked={on} onClick={() => { close(); patch({ sort: { key: c.key, dir }, page: 1 }); }}><Icon name={on ? "check" : "blank"} />{c.header}, {dir === "asc" ? "ascending" : "descending"}</button>;
      }))}
    </>
  ), { label: "Sort rows", role: "menu" });

  const headCb = useRef<HTMLInputElement>(null);
  useEffect(() => { if (headCb.current) headCb.current.indeterminate = sel === "some"; }, [sel]);

  const pickFilter = (ev: React.MouseEvent, f: DTFilter<T>) => L.popover(ev, (close) => (
    <>
      {[ALL, ...f.options].map((o) => {
        const on = (st.filters[f.key] || ALL) === o;
        return <button key={o} role="option" aria-selected={on} onClick={() => { patch({ filters: { ...st.filters, [f.key]: o }, page: 1 }); close(); }}><Icon name={on ? "check" : "blank"} />{f.labels?.[o] ?? o}</button>;
      })}
    </>
  ), { role: "listbox", label: f.label, align: "start" });

  const rowMenu = (ev: React.MouseEvent, r: T) => {
    const acts = p.rowActions?.(r) || [];
    L.popover(ev, (close) => (
      <>{acts.map((a) => <button key={a.label} role="menuitem" disabled={!!a.whyNot} title={a.whyNot || undefined} onClick={() => { close(); a.run(r); }}>{a.label}</button>)}</>
    ), { label: `Actions for ${nameOf(r)}` });
  };

  const exportSelected = () => {
    const picked = p.rows.filter((r) => selected.includes(p.rowKey(r)));
    const ec = cols.filter((c) => c.value);
    const ok = downloadText(`${p.exportName || p.id}.csv`, toCsv(ec.map((c) => c.header), picked.map((r) => ec.map((c) => c.value!(r)))), "text/csv;charset=utf-8");
    L.toast(ok ? `Exported ${picked.length} row${picked.length === 1 ? "" : "s"}` : "Download is not available in this browser", ok);
  };

  const onRowClick = (e: React.MouseEvent, r: T) => {
    if (!p.onOpen || (e.target as HTMLElement).closest("button,a,input,select,label,textarea")) return;
    p.onOpen(r);
  };
  const onRowKey = (e: React.KeyboardEvent, r: T) => {
    if (!p.onOpen || e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); p.onOpen(r); }
  };

  const span = cols.length + (selectable ? 1 : 0) + (p.rowActions ? 1 : 0);
  return (
    <div className="dt">
      {p.tabs ? (
        <div className="dt-tabs"><div className="tabs" role="tablist" aria-label={`${p.label} status`}>
          {[{ key: ALL, label: ALL, match: () => true } as DTTab<T>, ...p.tabs].map((t) => (
            <button key={t.key} className="tab" role="tab" aria-selected={st.tab === t.key} onClick={() => patch({ tab: t.key, page: 1 })}>
              {t.label} <span className="dt-n">{p.rows.filter(t.match).length}</span>
            </button>
          ))}
        </div></div>
      ) : null}

      <div className="dt-bar" role="group" aria-label={`${p.label} filters`}>
        {p.searchText ? (
          <label className="dt-search"><span className="vh">Search {p.label}</span><Icon name="search" />
            <input type="search" className="dt-search-in" placeholder="Search" value={st.q || ""} onChange={(e) => patch({ q: e.target.value, page: 1 })} />
          </label>
        ) : null}
        {(p.filters || []).filter(shownFilter).map((f) => {
          const v = st.filters[f.key] || ALL;
          return (
            <button key={f.key} className={`fchip${v !== ALL ? " on" : ""}`} aria-haspopup="listbox" onClick={(e) => pickFilter(e, f)}>
              {f.label}: <b>{f.labels?.[v] ?? v}</b><Icon name="chevd" />
            </button>
          );
        })}
        {hiddenFilters.length ? <button className="fchip add" aria-haspopup="menu" onClick={addFilter}><Icon name="plus" />Add filter</button> : null}
        {filtered ? <button className="btn btn-ghost sm" onClick={reset}>Clear filters</button> : null}
        <span className="dt-spacer" />
        <span className="dt-end"><span className="dt-sum" role="status" aria-live="polite">{rows.length === p.rows.length ? `${rows.length} row${rows.length === 1 ? "" : "s"}` : `${rows.length} of ${p.rows.length} row${p.rows.length === 1 ? "" : "s"}`}{st.sort ? `, sorted by ${p.columns.find((c) => c.key === st.sort!.key)?.header}` : ""}</span>
        {sortable.length ? <button className="dt-sortbtn" aria-haspopup="menu" onClick={sortMenu}><span className="dt-sortlbl">Sorted by <b>{sortCol ? sortCol.header : "default order"}</b></span><span className="vh">{sortCol ? `, ${st.sort!.dir === "asc" ? "ascending" : "descending"}` : ""}. Change sort</span><Icon name="swap" /></button> : null}
        <button className="icon-btn" aria-label="Columns" aria-haspopup="menu" onClick={(e) => L.popover(e, (close) => <ColumnsMenu id={p.id} cols={p.columns} sizes={sizes} close={close} />, { label: "Columns" })}><Icon name="rows" /></button></span>
      </div>

      <div className="tbl-wrap" ref={wrapRef}>
        <table className="tbl dt-fixed" aria-label={p.label} style={{ width: Math.max(wrapW, fixedW + cols.reduce((a, c) => a + widthOf(c), 0)) || undefined }}>
          <colgroup>
            {selectable ? <col style={{ width: CHECKBOX_W }} /> : null}
            {cols.map((c) => <col key={c.key} style={{ width: widthOf(c) }} />)}
            {p.rowActions ? <col style={{ width: ACTIONS_W }} /> : null}
          </colgroup>
          <thead>
            <tr>
              {selectable ? (
                <th scope="col" className="dt-cb"><input ref={headCb} type="checkbox" aria-label="Select all rows" checked={sel === "all"} onChange={() => patch({ selected: toggleAll(pageIds, selected) })} /></th>
              ) : null}
              {cols.map((c) => {
                const s = st.sort && st.sort.key === c.key ? st.sort.dir : null;
                return (
                  <th key={c.key} scope="col" className={`${c.align === "end" ? "r " : ""}${c.nowrap ? "nw " : ""}${c.value || c.sortBy ? "sortable" : ""}`} aria-sort={c.value || c.sortBy ? (s === "asc" ? "ascending" : s === "desc" ? "descending" : "none") : undefined}>
                    {c.value || c.sortBy ? (
                      <button className="th-sort" onClick={() => patch({ sort: nextSort(st.sort, c.key), page: 1 })}>
                        {c.header}<Icon name="chevd" className={`th-car${s ? " on" : ""}${s === "asc" ? " up" : ""}`} />
                      </button>
                    ) : c.hideHeader ? <span className="vh">{c.header}</span> : c.header}
                    <ColResizer header={c.header} width={widthOf(c)} onResize={(px, save) => resizeTo(c.key, px, save)} />
                  </th>
                );
              })}
              {p.rowActions ? <th scope="col" className="r dt-act">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr><td colSpan={span} className="dt-empty">{/* H2: "no results" only when a search or filter is on; otherwise there is simply nothing yet */}
                {filtered ? <span>Nothing matches these filters. <button type="button" className="linkbtn inline" onClick={reset}>Clear filters</button></span>
                  : tab ? "Nothing in this view." : (p.emptyText || "Nothing here yet.")}</td></tr>
            ) : pageRows.map((r) => {
              const id = p.rowKey(r); const on = selected.includes(id);
              return (
                <tr key={id} className={`${p.onOpen ? "clickable" : ""}${on ? " sel" : ""}`}
                  tabIndex={p.onOpen ? 0 : undefined} onClick={(e) => onRowClick(e, r)} onKeyDown={(e) => onRowKey(e, r)}>
                  {selectable ? <td className="dt-cb"><input type="checkbox" aria-label={`Select ${nameOf(r)}`} checked={on} onChange={() => patch({ selected: toggleOne(id, selected) })} /></td> : null}
                  {cols.map((c) => { const t = c.value ? String(c.value(r)) : undefined; return <td key={c.key} className={[c.align === "end" ? "r" : "", c.nowrap ? "nw" : ""].filter(Boolean).join(" ") || undefined}><div className={c.key === "act" ? "dt-c dt-c-act" : "dt-c"} title={c.key === "act" ? undefined : t}>{subOf(c, r)}</div></td>; })}
                  {p.rowActions ? <td className="r dt-act"><button className="icon-btn" aria-label={`Actions for ${nameOf(r)}`} aria-haspopup="menu" onClick={(e) => rowMenu(e, r)}><Icon name="more" /></button></td> : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {info.total ? <div className="dt-foot">
        <span className="dt-sum">{info.total ? `Showing ${info.from} to ${info.to} of ${info.total}` : "No rows"}</span>
        <nav className="pg" aria-label="Pagination">
          <button className="pg-b" aria-label="Previous page" disabled={info.page <= 1} onClick={() => patch({ page: info.page - 1 })}><Icon name="chevl" /></button>
          {pageWindow(info.page, info.pages).map((n, i) => n === null ? <span key={"g" + i} className="pg-gap" aria-hidden="true">…</span> : (
            <button key={n} className="pg-b" aria-label={`Page ${n}`} aria-current={n === info.page ? "page" : undefined} onClick={() => patch({ page: n })}>{n}</button>
          ))}
          <button className="pg-b" aria-label="Next page" disabled={info.page >= info.pages} onClick={() => patch({ page: info.page + 1 })}><Icon name="chevron" /></button>
        </nav>
        <label className="dt-rows">Rows
          <select className="select" value={st.size} onChange={(e) => patch({ size: Number(e.target.value), page: 1 })}>{sizes.map((n) => <option key={n} value={n}>{n}</option>)}</select>
        </label>
      </div> : null}

      {selectable && selected.length ? (
        <div className="dt-bulk" role="toolbar" aria-label={`Actions for ${selected.length} selected`}>
          <span className="dt-bulk-n" role="status" aria-live="polite">{selected.length} selected</span>
          {(p.bulk || []).map((b) => (
            <button key={b.label} className="dt-bulk-b" disabled={b.disabled} title={b.title} onClick={() => b.run(p.rows.filter((r) => selected.includes(p.rowKey(r))))}>{b.icon ? <Icon name={b.icon} /> : null}{b.label}</button>
          ))}
          {p.exportName ? <button className="dt-bulk-b" onClick={exportSelected}><Icon name="download" />Export selected</button> : null}
          <button className="dt-bulk-b" aria-label="Clear selection" onClick={() => patch({ selected: [] })}><Icon name="x" /></button>
        </div>
      ) : null}
    </div>
  );
}

/** I3: the handle on a column's right edge. Drag it, or focus it and use ArrowLeft and ArrowRight (16 px a step), to resize the column for
 *  this session. A focusable separator, as WAI-ARIA describes for a window splitter. */
function ColResizer({ header, width, onResize }: { header: string; width: number; onResize: (px: number, save: boolean) => void }) {
  const start = useRef<{ x: number; w: number } | null>(null);
  const down = (e: RPointerEvent<HTMLSpanElement>) => {
    e.preventDefault(); e.stopPropagation();
    const th = e.currentTarget.parentElement as HTMLElement;
    start.current = { x: e.clientX, w: th.getBoundingClientRect().width }; e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: RPointerEvent<HTMLSpanElement>) => { if (start.current) onResize(start.current.w + e.clientX - start.current.x, false); };
  const up = (e: RPointerEvent<HTMLSpanElement>) => { if (!start.current) return; onResize(start.current.w + e.clientX - start.current.x, true); start.current = null; };
  const key = (e: RKeyboardEvent<HTMLSpanElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault(); e.stopPropagation();
    const th = e.currentTarget.parentElement as HTMLElement;
    onResize(th.getBoundingClientRect().width + (e.key === "ArrowRight" ? 16 : -16), true);
  };
  return <span className="col-rs" role="separator" aria-orientation="vertical" aria-label={`Resize column ${header}`} aria-valuenow={Math.round(width)} aria-valuemin={COL_MIN} aria-valuemax={COL_MAX} tabIndex={0}
    onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { start.current = null; }} onKeyDown={key} onClick={(e) => e.stopPropagation()} />;
}
