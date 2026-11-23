import { Icon } from "./Icon";
import { useContext, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PageActsSlot } from "./Blocks";

/** One numbered section of a form page (blueprint form template): a number badge, a title, an optional note, then the fields. */
export function FormSection({ n, title, note, children }: { n: number; title: string; note?: ReactNode; children: ReactNode }) {
  const id = `fs-${n}`;
  return (
    <section className="form-section" aria-labelledby={id}>
      <div className="form-section-head">
        <span className="step-badge" aria-hidden="true">{String(n).padStart(2, "0")}</span>
        <div><h2 id={id}>{title}</h2>{note ? <p className="form-section-note">{note}</p> : null}</div>
      </div>
      <div className="form-section-body">{children}</div>
    </section>
  );
}

/** Footer of a form page: the cancel and save buttons, pinned under the form. */
/** A form page's actions. Inside a Page they render in the page header (R29), which stays in view while the form scrolls: a submit button
 *  there submits this form (it is outside the form element, so the click is passed on), and a hidden submit button keeps Enter working.
 *  Elsewhere they render in place as before. */
export function FormActions({ children }: { children: ReactNode }) {
  const slot = useContext(PageActsSlot);
  const marker = useRef<HTMLSpanElement>(null);
  if (!slot) return <div className="form-actions">{children}</div>;
  const onClick = (e: React.MouseEvent) => {
    const btn = (e.target as HTMLElement).closest("button");
    if (!btn || btn.type !== "submit" || btn.disabled) return;
    e.preventDefault();
    marker.current?.closest("form")?.requestSubmit();
  };
  return (
    <>
      <span ref={marker} hidden><button type="submit" tabIndex={-1} aria-hidden="true" /></span>
      {createPortal(<div className="form-acts-top" onClick={onClick}>{children}</div>, slot)}
    </>
  );
}

/** Inline message under a form. `error` is announced (role alert); a note is a quiet role note. */
export function FormMessage({ id, kind = "error", children }: { id?: string; kind?: "error" | "note"; children: ReactNode }) {
  if (kind !== "error") return <p id={id} className="field help" role="note">{children}</p>;
  // an error carries an icon as well as its colour (status is never colour alone)
  return <p id={id} className="field help" role="alert" style={{ color: "var(--bad-ink)", display: "flex", gap: 6, alignItems: "flex-start" }}><Icon name="alert" style={{ width: 15, height: 15, flex: "0 0 auto", marginTop: 2 }} /><span>{children}</span></p>;
}
