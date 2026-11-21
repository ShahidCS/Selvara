import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { custList } from "@/lib/platform";

/** Prototype: custBody searchbar + wireCustSearch / custSug / custHi. Suggestions are plain text (React escapes); the query only filters in memory. */
export function CustomerSearch({ onPick }: { onPick: (id: string) => void }) {
  const [q, setQ] = useState(""); const [open, setOpen] = useState(false); const [hi, setHi] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const ql = q.toLowerCase();
  const list = custList().filter((c) => !ql || `${c.name} ${c.id} ${c.contact.email}`.toLowerCase().includes(ql));
  const cur = Math.min(hi, Math.max(0, list.length - 1));
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, [open]);
  const show = (v: string) => { setQ(v); setHi(0); setOpen(true); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi(Math.min(cur + 1, list.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi(Math.max(cur - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (open && list[cur]) onPick(list[cur].id); }
    else if (e.key === "Escape") setOpen(false);
  };
  return (
    <div ref={wrap} style={{ position: "relative", maxWidth: 460 }}>
      <div className="field"><label htmlFor="custSearch">Find a customer</label>
        <input className="input" id="custSearch" role="combobox" aria-expanded={open} aria-autocomplete="list" aria-controls="custSug" aria-activedescendant={open && list[cur] ? `custSug-${list[cur].id}` : undefined}
          placeholder="Search by name, ID or email…" autoComplete="off" maxLength={100} value={q} onChange={(e) => show(e.target.value)} onFocus={() => show(q)} onKeyDown={onKey} /></div>
      <div id="custSug" role="listbox" className="pop" style={{ position: "absolute", left: 0, right: 0, top: 66, display: open ? "block" : "none", minWidth: 0 }}>
        {list.length ? list.map((c, i) => (
          <div key={c.id} id={`custSug-${c.id}`} className={`ritem${i === cur ? " cur" : ""}`} role="option" aria-selected={i === cur} onMouseMove={() => setHi(i)} onClick={() => onPick(c.id)}
            style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 11px", borderRadius: 8, cursor: "pointer", fontSize: 13.5, background: i === cur ? "var(--accent-weak)" : undefined, boxShadow: i === cur ? "inset 3px 0 0 var(--accent)" : undefined }}>
            <span className="ic" style={{ display: "inline-flex", flex: "none", width: 17, height: 17, color: i === cur ? "var(--accent-ink)" : "var(--muted)" }}><Icon name="customers" /></span>
            <div style={{ minWidth: 0 }}><div style={{ fontWeight: 500, color: "var(--ink)" }}>{c.name}</div><div style={{ fontSize: 11.5, color: "var(--muted)" }}>{c.id}, {c.contact.email}</div></div>
            <span className="meta" style={{ marginLeft: "auto", flex: "none", fontSize: 11.5, color: "var(--muted)" }}>{c.plan}</span>
          </div>
        )) : <div style={{ padding: 12, color: "var(--muted)", fontSize: 13 }}>No customer matches &quot;{ql}&quot;.</div>}
      </div>
    </div>
  );
}
