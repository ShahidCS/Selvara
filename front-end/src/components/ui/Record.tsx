import type { ReactNode } from "react";

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
export function FormActions({ children }: { children: ReactNode }) {
  return <div className="form-actions">{children}</div>;
}

/** Inline message under a form. `error` is announced (role alert); a note is a quiet role note. */
export function FormMessage({ id, kind = "error", children }: { id?: string; kind?: "error" | "note"; children: ReactNode }) {
  return <p id={id} className="field help" role={kind === "error" ? "alert" : "note"} style={kind === "error" ? { color: "var(--bad-ink)" } : undefined}>{children}</p>;
}
