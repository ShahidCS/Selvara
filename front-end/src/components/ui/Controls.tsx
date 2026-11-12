import { useRef, type KeyboardEvent, type ReactNode } from "react";

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
