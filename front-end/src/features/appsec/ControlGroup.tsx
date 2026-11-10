import { useId } from "react";
import { Icon } from "@/components/ui";

export interface Group { id: string; title: string; threat: string; controls: string[]; refs: string; test: string }

/** Collapsible control group card: threat, controls, "Maps to", "Test". Text only. */
export function ControlGroup({ g, n, open, onToggle }: { g: Group; n: number; open: boolean; onToggle: () => void }) {
  const bid = useId();
  return (
    <section className="card" id={`appsec-${g.id}`} aria-labelledby={`${bid}-h`}>
      <h3 id={`${bid}-h`} style={{ margin: 0 }}>
        <button type="button" aria-expanded={open} aria-controls={bid} onClick={onToggle}
          style={{ all: "unset", boxSizing: "border-box", width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", cursor: "pointer", font: "inherit", fontWeight: 600, color: "var(--ink)" }}>
          <span className="tag" aria-hidden="true">{n}</span>
          <span style={{ flex: 1 }}>{n}. {g.title}</span>
          <span aria-hidden="true" style={{ display: "inline-flex", transform: open ? "rotate(90deg)" : "none" }}><Icon name="chevron" /></span>
        </button>
      </h3>
      <div id={bid} role="region" aria-labelledby={`${bid}-h`} hidden={!open}>
        <div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 0 }}>
          <p style={{ margin: 0, color: "var(--ink-2)" }}><strong>Threat:</strong> {g.threat}</p>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, color: "var(--ink-2)" }}>{g.controls.map((c, i) => <li key={i}>{c}</li>)}</ul>
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted)" }}><strong>Maps to:</strong> {g.refs}</p>
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted)" }}><strong>Test:</strong> {g.test}</p>
        </div>
      </div>
    </section>
  );
}
