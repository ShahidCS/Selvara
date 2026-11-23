import { ReactNode, useEffect, useRef, useState } from "react";
import { Presence } from "./Presence";
import Link from "next/link";
import { Icon } from "./Icon";
import { TITLE } from "@/lib/rbac";

/** Standardised delta indicator under a KPI. */
export function Delta({ tone, text, dir }: { tone: "good" | "bad" | "flat"; text: string; dir?: "up" | "down" | "" }) {
  const cls = tone === "good" ? "up" : tone === "bad" ? "down" : "flat";
  const ico = dir === "up" ? "trendup" : dir === "down" ? "trenddown" : "";
  return <div className={`d ${cls}`}>{ico ? <Icon name={ico} /> : null}<span>{text}</span></div>;
}
export const KPI_TONE: Record<string, [string, string]> = {
  accent: ["var(--accent-ink)", "var(--accent-weak)"], good: ["var(--ok-ink)", "var(--ok-bg)"], bad: ["var(--bad-ink)", "var(--bad-bg)"],
  warn: ["var(--warn-ink)", "var(--warn-bg)"], info: ["var(--info-ink)", "var(--info-bg)"], neutral: ["var(--ink-2)", "var(--surface-2)"],
};
export function Kpi({ icon, label, value, tone = "neutral", sub, ...rest }: { icon: string; label: string; value: string | number; tone?: string; sub?: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  const T = KPI_TONE[tone] || KPI_TONE.neutral;
  return (
    <div className="kpi" {...rest}>
      <div className="kpi-top"><span className="kpi-ico" style={{ color: T[0], background: T[1] }}><Icon name={icon} /></span><span className="kpi-lbl">{label}</span></div>
      <div className="v">{String(value)}</div>
      {sub == null || sub === "" ? null : typeof sub === "string" ? <div className="kpi-sub">{sub}</div> : sub}
    </div>
  );
}
export interface Col { t: string; r?: boolean }
/** Generic table. `rows` are <tr> elements. Wraps in a horizontally scrolling container with an edge-shadow affordance. */
export function Table({ cols, children, minw }: { cols: Col[]; children: ReactNode; minw?: number }) {
  const mw = minw || (cols.length > 4 ? cols.length * 118 : 0);
  // a region that scrolls must be reachable by keyboard (WCAG 2.1.1); one that fits is not an extra tab stop
  const ref = useRef<HTMLDivElement>(null); const [scrolls, setScrolls] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const check = () => setScrolls(el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight);
    check();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(check); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="tbl-wrap" tabIndex={scrolls ? 0 : undefined} role={scrolls ? "region" : undefined} aria-label={scrolls ? "Table, scrollable" : undefined} style={mw ? ({ ["--tmw" as string]: `${mw}px` } as React.CSSProperties) : undefined}>
      <table className="tbl">
        <thead><tr>{cols.map((c, i) => <th key={i} scope="col" className={c.r ? "r" : ""}>{c.t}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
/** Page scaffold: title/subtitle come from the module registry (TITLE) unless overridden. */
/* Record and form pages (those with `back`) show who else has the record open. */
export function Page({ mod, title, sub, acts, back, status, eyebrow, children }: { mod?: string; title?: string; sub?: string; acts?: ReactNode; /** A small line above the title (the date on the Overview). */ eyebrow?: string; /** Record pages: a link back to the list, shown above the title. */ back?: { href: string; label: string }; /** Record pages: the status chip, shown beside the title. */ status?: ReactNode; children: ReactNode }) {
  const [t, s] = mod ? TITLE[mod] || ["", ""] : ["", ""];
  const T = title ?? t, S = sub ?? s;
  return (
    <div className="page">
      <div className="page-head">
        <div className="pt">{eyebrow ? <div className="page-eyebrow">{eyebrow}</div> : null}{back ? <Link className="back-link" href={back.href}><Icon name="back" />{back.label}</Link> : null}{status ? <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}><h1>{T}</h1>{status}</div> : <h1>{T}</h1>}{S ? <div className="sub">{S}</div> : null}</div>
        {acts ? <div className="acts">{acts}</div> : null}
      </div>
      {back ? <Presence /> : null}
      {children}
    </div>
  );
}
export function Empty({ icon = "search", title, children, action }: { icon?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty"><div className="ei"><Icon name={icon} /></div><h4>{title}</h4>{children ? <p>{children}</p> : null}{action}</div>;
}

/** Props that make a non-button element keyboard-operable (Enter / Space), for rows and cards that the prototype made clickable with onclick. */
export function activate(fn: () => void) {
  return {
    role: "button" as const, tabIndex: 0, onClick: fn,
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } },
  };
}
