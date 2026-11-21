import { Icon } from "./Icon";
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
  if (kind !== "error") return <p id={id} className="field help" role="note">{children}</p>;
  // an error carries an icon as well as its colour (status is never colour alone)
  return <p id={id} className="field help" role="alert" style={{ color: "var(--bad-ink)", display: "flex", gap: 6, alignItems: "flex-start" }}><Icon name="alert" style={{ width: 15, height: 15, flex: "0 0 auto", marginTop: 2 }} /><span>{children}</span></p>;
}
