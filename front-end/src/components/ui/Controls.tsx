import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

/** Toggle switch (`role="switch"`). The label is always visible text; the state is also written (On or Off) so it never rests on position or colour alone. */
export function Switch({ checked, onChange, label, id, disabled, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string; disabled?: boolean; hint?: string }) {
  return (
    <div className="sw-row">
      <span className="sw-txt"><span id={id ? id + "-l" : undefined}>{label}</span>{hint ? <span className="sw-hint">{hint}</span> : null}</span>
      <button type="button" role="switch" id={id} aria-checked={checked} aria-labelledby={id ? id + "-l" : undefined} aria-label={id ? undefined : label} disabled={disabled}
        className="sw" onClick={() => onChange(!checked)}>
        <span className="sw-knob" aria-hidden="true" /><span className="sw-state">{checked ? "On" : "Off"}</span>
      </button>
    </div>
  );
}

/** Segmented control for choosing one value (`radiogroup`). Arrow keys move and select; only the selected segment is in the tab order.
 *  Use `tablist` instead when the control switches panels of content. */
export function Segmented<V extends string>({ value, options, onChange, label }: { value: V; options: { value: V; label: ReactNode; text?: string }[]; onChange: (v: V) => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return; e.preventDefault();
    const n = (i + d + options.length) % options.length;
    onChange(options[n].value);
    (ref.current?.querySelectorAll<HTMLElement>('[role="radio"]')[n])?.focus();
  };
  return (
    <div className="seg" role="radiogroup" aria-label={label} ref={ref}>
      {options.map((o, i) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} aria-label={o.text} tabIndex={o.value === value ? 0 : -1} onClick={() => onChange(o.value)} onKeyDown={(e) => move(e, i)}>{o.label}</button>
      ))}
    </div>
  );
}

/** Loading placeholder: shimmering blocks in a busy live region. Replace it with the real content when data resolves. */
export function Skeleton({ rows = 3, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div className="skeleton" aria-busy="true" aria-live="polite">
      <span className="vh">{label}</span>
      <div className="skel sk-line" style={{ width: "40%" }} />
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skel sk-row" />)}
    </div>
  );
}

export interface ListboxOption { value: string; label: string; /** Shown but not choosable, with the reason (G3: a role that cannot be assigned here). */ disabled?: string }
/** G1: the shared single-choice list, for use in modals and forms instead of a native <select>. The list opens in the page flow directly
 *  under the field, so it never covers the dialog's title or content. Keyboard: Enter, Space or ArrowDown opens; ArrowUp/ArrowDown, Home and
 *  End move; Enter or Space chooses; Esc or Tab closes (Esc does not close the dialog while the list is open). A disabled option shows why. */
export function Listbox({ id, label, value, options, onChange, describedBy, invalid }: { id: string; label: string; value: string; options: ListboxOption[]; onChange: (v: string) => void; describedBy?: string; invalid?: boolean }) {
  const [open, setOpen] = useState(false);
  const cur = Math.max(0, options.findIndex((o) => o.value === value));
  const [act, setAct] = useState(cur);
  const btn = useRef<HTMLButtonElement>(null); const list = useRef<HTMLUListElement>(null);
  useEffect(() => { if (open) list.current?.focus(); }, [open]);
  const show = () => { setAct(cur); setOpen(true); };
  const close = (refocus = true) => { setOpen(false); if (refocus) btn.current?.focus(); };
  const pick = (i: number) => { const o = options[i]; if (!o || o.disabled) return; onChange(o.value); close(); };
  const step = (from: number, d: 1 | -1) => { let i = from; for (let n = 0; n < options.length; n++) { i = (i + d + options.length) % options.length; if (!options[i].disabled) return i; } return from; };
  const onBtnKey = (e: KeyboardEvent) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); show(); } };
  const onListKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setAct((a) => step(a, 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAct((a) => step(a, -1)); }
    else if (e.key === "Home") { e.preventDefault(); setAct(step(options.length - 1, 1)); }
    else if (e.key === "End") { e.preventDefault(); setAct(step(0, -1)); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(act); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Tab") close(false);
  };
  const chosen = options[cur];
  return (
    <div className="lb" data-lb-open={open ? "" : undefined}>
      <button ref={btn} type="button" id={id} className={`input lb-btn${invalid ? " bad" : ""}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`} aria-label={`${label}: ${chosen?.label ?? ""}`}
        aria-describedby={describedBy} onClick={() => (open ? close() : show())} onKeyDown={onBtnKey}>
        <span className="lb-v">{chosen?.label ?? ""}</span><svg className="lb-chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
      </button>
      {open ? (
        <ul ref={list} id={`${id}-list`} className="lb-list" role="listbox" aria-label={label} tabIndex={-1} aria-activedescendant={`${id}-o${act}`} onKeyDown={onListKey} onBlur={(e) => { if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) setOpen(false); }}>
          {options.map((o, i) => (
            <li key={o.value} id={`${id}-o${i}`} role="option" aria-selected={o.value === value} aria-disabled={o.disabled ? true : undefined} data-active={i === act ? "" : undefined}
              onMouseDown={(e) => e.preventDefault()} onClick={() => pick(i)} onMouseEnter={() => !o.disabled && setAct(i)}>
              <span className="lb-ol">{o.label}</span>{o.disabled ? <span className="lb-why">{o.disabled}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
