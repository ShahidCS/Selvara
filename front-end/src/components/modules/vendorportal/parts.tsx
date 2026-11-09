import type { CSSProperties, ReactNode } from "react";

export const card = (extra?: CSSProperties): CSSProperties => ({ padding: 24, gap: 14, ...extra });
export function Section({ children, narrow, pad = 24, gap = 14, label }: { children: ReactNode; narrow?: number; pad?: number; gap?: number; label?: string }) {
  return <section className="card" aria-label={label} style={{ padding: pad, gap, maxWidth: narrow, width: "100%" }}>{children}</section>;
}
export const H1 = ({ children }: { children: ReactNode }) => <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-.01em" }}>{children}</h1>;
export const Lead = ({ children }: { children: ReactNode }) => <div style={{ fontSize: 14, color: "var(--ink-2)" }}>{children}</div>;
export const Hint = ({ children }: { children: ReactNode }) => <div style={{ fontSize: 12, color: "var(--muted)" }}>{children}</div>;
export const ErrLine = ({ msg }: { msg: string }) => (msg ? <div role="alert" style={{ fontSize: 13, fontWeight: 600, color: "var(--bad-ink)" }}>{msg}</div> : null);
/** All vendor-supplied text goes through here as plain React text. */
export const Toast = ({ msg, onClose }: { msg: string; onClose: () => void }) => (
  <div role="status" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, background: "var(--ok-bg)", color: "var(--ok-ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "6px 8px 6px 14px", fontSize: 13, fontWeight: 600 }}>
    <span>{msg}</span>
    <button type="button" className="icon-btn" aria-label="Dismiss" onClick={onClose} style={{ color: "inherit" }}>×</button>
  </div>
);
