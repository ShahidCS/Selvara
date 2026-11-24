/* R24: a document or evidence file as a small card: a type badge from its extension, the name, a meta line and its actions. */
import type { ReactNode } from "react";

export const extOf = (name: string) => { const m = /\.([a-z0-9]{1,5})$/i.exec(name || ""); return m ? m[1].toUpperCase() : "FILE"; };
export function DocCard({ name, meta, status, actions }: { name: string; meta?: ReactNode; status?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="doc-card">
      <span className="doc-ext" aria-hidden="true">{extOf(name)}</span>
      <div className="doc-b">
        <div className="doc-n">{name}</div>
        {status ? <div>{status}</div> : null}
        {meta ? <div className="doc-m">{meta}</div> : null}
        {actions ? <div className="doc-a">{actions}</div> : null}
      </div>
    </div>
  );
}
export const DocGrid = ({ children }: { children: ReactNode }) => <div className="doc-grid">{children}</div>;
