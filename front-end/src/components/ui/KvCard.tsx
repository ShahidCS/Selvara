import type { ReactNode } from "react";

/** R38: read-first settings. A card of label and value pairs; Edit in the header opens the form (the caller swaps the card for it). */
export function KvCard({ title, note, items, onEdit, editLabel = "Edit", id }: { title: string; note?: string; items: { k: string; v: ReactNode }[]; onEdit?: () => void; editLabel?: string; id: string }) {
  return (
    <section className="kv-card" aria-labelledby={`${id}-h`}>
      <div className="kv-head"><div><h3 id={`${id}-h`}>{title}</h3>{note ? <p className="cell-sub">{note}</p> : null}</div>
        {onEdit ? <button type="button" className="btn btn-ghost sm" aria-label={`${editLabel}: ${title}`} onClick={onEdit}>{editLabel}</button> : null}</div>
      <dl className="kv-list">{items.map((x) => <div key={x.k}><dt>{x.k}</dt><dd>{x.v}</dd></div>)}</dl>
    </section>
  );
}
