import type { CSSProperties, ReactNode } from "react";
import { Icon } from "@/components/ui";

export const card = (extra?: CSSProperties): CSSProperties => ({ padding: 24, gap: 14, ...extra });
export function Section({ children, narrow, pad = 24, gap = 14, label }: { children: ReactNode; narrow?: number; pad?: number; gap?: number; label?: string }) {
  return <section className="card" aria-label={label} style={{ padding: pad, gap, maxWidth: narrow, width: "100%" }}>{children}</section>;
}
export const H1 = ({ children }: { children: ReactNode }) => <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-.01em" }}>{children}</h1>;
export const Lead = ({ children }: { children: ReactNode }) => <div style={{ fontSize: 14, color: "var(--ink-2)" }}>{children}</div>;
export const Hint = ({ children }: { children: ReactNode }) => <div style={{ fontSize: 12, color: "var(--muted)" }}>{children}</div>;
export const ErrLine = ({ msg, id }: { msg: string; id?: string }) => (msg ? <div id={id} role="alert" style={{ fontSize: 13, fontWeight: 600, color: "var(--bad-ink)", display: "flex", gap: 6, alignItems: "center" }}><Icon name="alert" style={{ flex: "0 0 auto" }} />{msg}</div> : null);
/** A message above the current step. The tone is explicit (never guessed from the text): "ok" (done), "bad" (failed: announced at once) or "info".
 *  Colour, icon and, for an error, a hidden "Error:" all say it. All vendor-supplied text goes through here as plain React text. */
export type VpTone = "ok" | "bad" | "info";
export interface VpToast { msg: string; tone: VpTone }
const TONE: Record<VpTone, { bg: string; ink: string; icon: string }> = {
  ok: { bg: "var(--ok-bg)", ink: "var(--ok-ink)", icon: "check" },
  bad: { bg: "var(--bad-bg)", ink: "var(--bad-ink)", icon: "alert" },
  info: { bg: "var(--surface-2)", ink: "var(--ink)", icon: "message" },
};
export const Toast = ({ msg, tone = "info", onClose }: { msg: string; tone?: VpTone; onClose: () => void }) => {
  const t = TONE[tone];
  return (
    <div role={tone === "bad" ? "alert" : "status"} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, background: t.bg, color: t.ink, border: "1px solid var(--line)", borderRadius: 8, padding: "6px 8px 6px 14px", fontSize: 13, fontWeight: 600 }}>
      <span style={{ display: "flex", gap: 8, alignItems: "center" }}><Icon name={t.icon} style={{ flex: "0 0 auto" }} />{tone === "bad" ? <span className="vh">Error: </span> : null}<span>{msg}</span></span>
      <button type="button" className="icon-btn" aria-label="Dismiss message" title="Dismiss" onClick={onClose} style={{ color: "inherit" }}><Icon name="x" /></button>
    </div>
  );
};

/** "How this portal protects you": the portal's security controls, folded by default so the task stays first (the list is long and technical). */
export function SecurityPanel({ controls }: { controls: readonly string[] }) {
  return (
    <details className="vp-sec" style={{ background: "var(--bg-inverse)", color: "var(--text-inverse)", borderRadius: "var(--radius-card)", padding: "14px 18px" }}>
      <summary style={{ fontWeight: 600, cursor: "pointer", display: "flex", gap: 8, alignItems: "center" }}><Icon name="shieldcheck" style={{ flex: "0 0 auto" }} />How this portal protects you<span style={{ fontWeight: 400, color: "var(--text-inverse-muted)" }}>({controls.length} controls)</span><Icon name="chevd" className="vp-sec-chev" /></summary>
      <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {controls.map((c) => <li key={c} style={{ display: "flex", gap: 8, fontSize: 13 }}><span aria-hidden="true" style={{ display: "inline-flex", marginTop: 2 }}><Icon name="check" /></span><span>{c}</span></li>)}
      </ul>
    </details>
  );
}
