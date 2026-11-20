/* Production first-visit guidance for a module (texts in data/tips.ts). Dismissed per person in this browser (a convenience only). */
import { useState } from "react";
import { Icon } from "@/components/ui";
import { MODULE_TIPS } from "@/data/tips";
import { API_ON } from "@/lib/rbac";

const KEY = "selvara.tips.hidden";
const read = (): string[] => { try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } };
const write = (v: string[]) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage unavailable: the tip simply shows again */ } };

/** The tip for `mod`, open until dismissed; `force` shows it again (e.g. when the module has no records yet). */
export function ModuleTip({ mod, force = false }: { mod: string; force?: boolean }) {
  const tip = MODULE_TIPS[mod];
  // Modules render only after the shell has hydrated on the client (AppShell), so reading browser storage here is safe.
  const [hidden, setHidden] = useState(() => typeof window === "undefined" || read().includes(mod));
  if (!API_ON || !tip || (hidden && !force)) return null;
  const close = () => { write([...new Set([...read(), mod])]); setHidden(true); };
  return (
    <section className="banner info" role="note" aria-label={tip.title} style={{ flex: "0 0 auto", marginBottom: 12, display: "flex", gap: 10, alignItems: "flex-start" }}>
      <Icon name="shieldcheck" />
      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
        <b>{tip.title}</b>
        <ol style={{ margin: "6px 0 0", paddingLeft: 18, lineHeight: 1.5 }}>{tip.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        {tip.note ? <p className="field help" style={{ margin: "6px 0 0" }}>{tip.note}</p> : null}
      </div>
      {force ? null : <button className="btn btn-ghost sm" onClick={close} aria-label={`Hide: ${tip.title}`}><Icon name="x" />Hide</button>}
    </section>
  );
}
