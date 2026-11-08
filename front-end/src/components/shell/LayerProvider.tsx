import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/router";
import { Icon } from "@/components/ui";
import { NAV } from "@/lib/rbac";
import { useGo } from "@/lib/route";

type Content = ReactNode | ((close: () => void) => ReactNode);
type Layer =
  | null
  | { kind: "drawer"; title: string; sub?: ReactNode; body: Content; foot?: Content }
  | { kind: "modal"; title: string; body: Content; foot?: Content; wide?: boolean }
  | { kind: "popover"; top: number; right: number; body: Content; trigger?: HTMLElement | null }
  | { kind: "palette" };

export interface LayerApi {
  openDrawer: (title: string, sub: ReactNode | undefined, body: Content, foot?: Content) => void;
  /** Modal. Default footer is a single "Close" button, as in the prototype. */
  openModal: (title: string, body: Content, foot?: Content, opts?: { wide?: boolean }) => void;
  /** Popover anchored under the clicked element (right-aligned to it). */
  popover: (ev: { currentTarget: EventTarget | null }, body: Content) => void;
  openPalette: () => void;
  closeLayer: () => void;
  toast: (msg: string, ok?: boolean) => void;
}
const Ctx = createContext<LayerApi | null>(null);
export function useLayer(): LayerApi {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLayer must be used inside <LayerProvider>");
  return c;
}

/* A form component rendered inside a modal/drawer body can own its state AND render buttons into the fixed footer: <LayerFoot>...</LayerFoot> */
const FootCtx = createContext<{ el: HTMLElement | null; setHas: (v: boolean) => void } | null>(null);
export function LayerFoot({ children }: { children: ReactNode }) {
  const c = useContext(FootCtx);
  useEffect(() => { c?.setHas(true); return () => c?.setHas(false); }, [c]);
  return c?.el ? createPortal(children, c.el) : null;
}
const run = (c: Content | undefined, close: () => void) => (typeof c === "function" ? c(close) : c);
const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input:not([disabled]),select,[tabindex]:not([tabindex="-1"])';

/** Mounts content, flips the `.on` class on the next frame so the CSS transition runs, traps focus and restores it on close. */
function useDialog(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!active) return;
    const prev = document.activeElement as HTMLElement | null;
    const id = requestAnimationFrame(() => {
      setOn(true);
      const el = ref.current; if (!el) return;
      const f = (el.querySelector("[data-focus]") as HTMLElement) || (el.querySelector(FOCUSABLE) as HTMLElement) || el;
      f.focus?.();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !ref.current) return;
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => x.offsetParent !== null);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { cancelAnimationFrame(id); document.removeEventListener("keydown", onKey); setOn(false); prev?.focus?.(); };
  }, [active]);
  return { ref, on };
}

function Drawer({ l, close }: { l: Extract<Layer, { kind: "drawer" }>; close: () => void }) {
  const { ref, on } = useDialog(true);
  const [footEl, setFootEl] = useState<HTMLElement | null>(null); const [has, setHas] = useState(false);
  const fc = useMemo(() => ({ el: footEl, setHas }), [footEl]);
  return (
    <FootCtx.Provider value={fc}>
      <div className="scrim on" onClick={close} />
      <aside ref={ref} tabIndex={-1} className={`drawer${on ? " on" : ""}`} role="dialog" aria-modal="true" aria-label={l.title}>
        <div className="d-head">
          <div style={{ flex: "1 1 auto", minWidth: 0 }}><h3>{l.title}</h3>{l.sub ? <div className="sub">{l.sub}</div> : null}</div>
          <button className="icon-btn" aria-label="Close" onClick={close}><Icon name="x" /></button>
        </div>
        <div className="d-body scroll">{run(l.body, close)}</div>
        <div className="d-foot" ref={setFootEl} style={l.foot || has ? undefined : { display: "none" }}>{l.foot ? run(l.foot, close) : null}</div>
      </aside>
    </FootCtx.Provider>
  );
}
function Modal({ l, close }: { l: Extract<Layer, { kind: "modal" }>; close: () => void }) {
  const { ref, on } = useDialog(true);
  const [footEl, setFootEl] = useState<HTMLElement | null>(null); const [has, setHas] = useState(false);
  const fc = useMemo(() => ({ el: footEl, setHas }), [footEl]);
  return (
    <FootCtx.Provider value={fc}>
    <div ref={ref} className={`modal${on ? " on" : ""}`} role="dialog" aria-modal="true" aria-label={l.title}>
      <div className="scrim on" style={{ position: "absolute" }} onClick={close} />
      <div className={`mbox${l.wide ? " mbox-wide" : ""}`}>
        <div className="m-head"><h3>{l.title}</h3></div>
        <div className="m-body scroll">{run(l.body, close)}</div>
        <div className="m-foot" ref={setFootEl}>{l.foot ? run(l.foot, close) : has ? null : <button className="btn btn-secondary" onClick={close}>Close</button>}</div>
      </div>
    </div>
    </FootCtx.Provider>
  );
}
function Popover({ l, close }: { l: Extract<Layer, { kind: "popover" }>; close: () => void }) {
  return (
    <>
      <div className="scrim" style={{ background: "transparent", pointerEvents: "auto" }} onClick={close} />
      <div className="pop" role="menu" style={{ top: l.top, right: l.right }}>{run(l.body, close)}</div>
    </>
  );
}

function Palette({ close }: { close: () => void }) {
  const go = useGo();
  const [q, setQ] = useState("");
  const [cur, setCur] = useState(0);
  const { ref, on } = useDialog(true);
  const index = useMemo(() => {
    const out: { key: string; label: string; icon: string; space: string; group: string; path: string }[] = [];
    (["ws", "admin"] as const).forEach((sp) => NAV[sp].forEach((g) => g.items.forEach(([key, label, icon]) => out.push({ key, label, icon, space: sp, group: g.g, path: `/${sp}/${key}` }))));
    return out;
  }, []);
  const ql = q.toLowerCase();
  const list = index.filter((x) => !ql || x.label.toLowerCase().includes(ql) || x.group.toLowerCase().includes(ql));
  const idx = Math.min(cur, Math.max(0, list.length - 1));
  const pick = (x?: (typeof list)[number]) => { if (x) { go(x.path); close(); } };
  const onKey = (e: React.KeyboardEvent) => {
    const n = list.length; if (!n) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setCur((idx + 1) % n); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCur((idx - 1 + n) % n); }
    else if (e.key === "Enter") { e.preventDefault(); pick(list[idx]); }
  };
  return (
    <div ref={ref} className={`cmd${on ? " on" : ""}`} role="dialog" aria-modal="true" aria-label="Command palette" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="cbox">
        <input data-focus placeholder="Jump to any module…" aria-label="Search modules" autoComplete="off" value={q} onChange={(e) => { setQ(e.target.value); setCur(0); }} onKeyDown={onKey}
          role="combobox" aria-expanded="true" aria-controls="palRes" aria-activedescendant={list[idx] ? `pal-${list[idx].space}-${list[idx].key}` : undefined} />
        <div className="res" id="palRes" role="listbox">
          {list.length ? list.map((x, i) => (
            <div key={x.path} id={`pal-${x.space}-${x.key}`} role="option" aria-selected={i === idx} className={`ritem${i === idx ? " cur" : ""}`} onMouseMove={() => setCur(i)} onClick={() => pick(x)}>
              <span className="ic"><Icon name={x.icon} /></span>{x.label}<span className="meta">{x.space === "admin" ? "Admin, " : ""}{x.group}</span>
            </div>
          )) : <div style={{ padding: 16, color: "var(--muted)", fontSize: 13 }}>No module matches that.</div>}
        </div>
      </div>
    </div>
  );
}

export function LayerProvider({ children }: { children: ReactNode }) {
  const [layer, setLayer] = useState<Layer>(null);
  const [toastMsg, setToastMsg] = useState<{ msg: string; neg: boolean; k: number } | null>(null);
  const [toastOn, setToastOn] = useState(false);
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const router = useRouter();

  const closeLayer = useCallback(() => {
    setLayer(null);
    document.querySelectorAll(".icon-btn.ibopen").forEach((b) => b.classList.remove("ibopen"));
  }, []);
  // route change closes any open layer (prototype: route() -> closeLayer())
  useEffect(() => { const h = () => closeLayer(); router.events.on("routeChangeStart", h); return () => router.events.off("routeChangeStart", h); }, [router.events, closeLayer]);
  useEffect(() => {
    if (!layer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); closeLayer(); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [layer, closeLayer]);

  const toast = useCallback((msg: string, ok?: boolean) => {
    const neg = ok === false || /\b(fail|failed|error|unavailable|not available|can['’]?t|cannot|denied|reject|invalid|unable|removed|deleted)\b/i.test(String(msg));
    setToastMsg((p) => ({ msg: String(msg), neg, k: (p?.k || 0) + 1 }));
    setToastOn(true);
    clearTimeout(tRef.current);
    tRef.current = setTimeout(() => setToastOn(false), 2200);
  }, []);

  const api = useMemo<LayerApi>(() => ({
    openDrawer: (title, sub, body, foot) => setLayer({ kind: "drawer", title, sub, body, foot }),
    openModal: (title, body, foot, opts) => setLayer({ kind: "modal", title, body, foot, wide: opts?.wide }),
    popover: (ev, body) => {
      const el = ev.currentTarget as HTMLElement; const b = el.getBoundingClientRect();
      el.classList?.add("ibopen");
      setLayer({ kind: "popover", top: b.bottom + 6, right: window.innerWidth - b.right, body, trigger: el });
    },
    openPalette: () => setLayer({ kind: "palette" }),
    closeLayer, toast,
  }), [closeLayer, toast]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div id="layer">
        {layer?.kind === "drawer" && <Drawer l={layer} close={closeLayer} />}
        {layer?.kind === "modal" && <Modal l={layer} close={closeLayer} />}
        {layer?.kind === "popover" && <Popover l={layer} close={closeLayer} />}
        {layer?.kind === "palette" && <Palette close={closeLayer} />}
      </div>
      <div id="toast" role="status" aria-live="polite" style={{
        position: "fixed", left: "50%", bottom: 24, transform: `translateX(-50%) translateY(${toastOn ? 0 : 6}px)`, background: "var(--ink)", color: "var(--surface)",
        fontSize: 13, fontWeight: 500, padding: "10px 16px", borderRadius: 10, boxShadow: "var(--shadow-lg)", zIndex: 120, opacity: toastOn ? 1 : 0,
        transition: "opacity .2s, transform .2s", pointerEvents: "none", display: "flex", alignItems: "center", gap: 9, maxWidth: "min(92vw,520px)",
      }}>
        {toastMsg && !toastMsg.neg ? (
          <svg key={toastMsg.k} className="tcheck" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: "#49d08b" }}>
            <circle className="tc-ring" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.2" />
            <path className="tc-tick" d="M8 12.4l2.6 2.6L16.2 9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
        <span>{toastMsg?.msg}</span>
      </div>
    </Ctx.Provider>
  );
}
