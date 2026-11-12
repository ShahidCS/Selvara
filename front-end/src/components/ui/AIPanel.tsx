import type { ReactNode } from "react";
import { Icon } from "./Icon";

/** Lavender surface for anything a model wrote. The "AI-assisted" label and the review note are text, so the treatment never rests on colour alone,
 *  and nothing here decides: the actions are for a person to take after review. */
export function AIPanel({ source, meta, statement, children, footer, label = "AI-assisted summary" }: {
  source: string; meta?: string; statement?: string; children?: ReactNode; footer?: ReactNode; label?: string;
}) {
  return (
    <section className="aipanel" aria-label={label}>
      <div className="aipanel-src"><span className="ai-badge"><Icon name="ai" />AI-assisted</span><span className="eyebrow">{source}{meta ? ` · ${meta}` : ""}</span></div>
      {statement ? <p className="aipanel-stmt">{statement}</p> : null}
      {children}
      <p className="aipanel-note">Review before you rely on this.</p>
      {footer ? <div className="aipanel-foot">{footer}</div> : null}
    </section>
  );
}
