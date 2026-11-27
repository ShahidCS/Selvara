import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/router";
import { Icon } from "@/components/ui";
import { NAV, modAllowed } from "@/lib/rbac";
import { appStore } from "@/lib/store";
import { useGo } from "@/lib/route";
import { useAnchorWatch } from "@/hooks/useAnchorWatch";

type PopPos = { top?: number; bottom?: number; maxH: number; right?: number; left?: number };
/** Below the trigger, or above it when there is little room below (a row menu near the bottom of the screen). */
function popPos(el: HTMLElement, align?: "start" | "end"): PopPos {
  const b = el.getBoundingClientRect();
  const below = window.innerHeight - b.bottom, up = below < 320 && b.top > below;
  return { ...(up ? { bottom: window.innerHeight - b.top + 6, maxH: b.top - 18 } : { top: b.bottom + 6, maxH: below - 18 }), ...(align === "start" ? { left: Math.max(8, Math.min(b.left, window.innerWidth - 248)) } : { right: Math.max(8, window.innerWidth - b.right) }) };
}

type Content = ReactNode | ((close: () => void) => ReactNode);
type Layer =
  | null
  | { kind: "drawer"; title: string; sub?: ReactNode; body: Content; foot?: Content }
  | { kind: "modal"; title: string; body: Content; foot?: Content; wide?: boolean }
  | ({ kind: "popover"; body: Content; trigger?: HTMLElement | null; align?: "start" | "end"; role?: "menu" | "listbox"; label?: string } & PopPos)
  | { kind: "palette" };

export type ToastTone = "ok" | "bad" | "info";
export interface LayerApi {
  openDrawer: (title: string, sub: ReactNode | undefined, body: Content, foot?: Content) => void;
  /** Modal: title with a close icon, body, and the footer given (primary on the right, Cancel on its left). No footer when there are no actions. */
  openModal: (title: string, body: Content, foot?: Content, opts?: { wide?: boolean }) => void;
  /** Popover anchored under the clicked element (right-aligned to it). */
  popover: (ev: { currentTarget: EventTarget | null }, body: Content, opts?: { role?: "menu" | "listbox"; label?: string; align?: "start" | "end" }) => void;
  openPalette: () => void;
  closeLayer: () => void;
  /** Toast. `tone` says what it is, it is never guessed from the text: "ok" (default, a success tick), "bad" (an error: alert icon, red on the
   *  inverse surface, "Error:" for screen readers) or "info" (no icon). `true` and `false` are kept for existing callers (`false` is "bad").
   *  With `action` (for example Undo) it stays 7 s, pauses while hovered or focused, and the button runs `run` once. */
  toast: (msg: string, tone?: ToastTone | boolean, opts?: { action?: { label: string; run: () => void }; ms?: number }) => void;
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
        <div className="m-head"><h3>{l.title}</h3><button className="icon-btn" aria-label="Close" onClick={close}><Icon name="x" /></button></div>
        <div className="m-body scroll">{run(l.body, close)}</div>
        {/* G2: one footer, primary action on the right and Cancel on its left. No separate "Close" button: the header's close icon, Cancel and
            Esc dismiss. A modal with no actions has no footer. */}
        <div className="m-foot" ref={setFootEl} hidden={!l.foot && !has}>{l.foot ? run(l.foot, close) : null}</div>
      </div>
    </div>
    </FootCtx.Provider>
  );
}
/** Menu and listbox popovers: focus moves to the first item on open and back to the trigger on close; ArrowUp/ArrowDown/Home/End move between
 *  items (roving focus, as a `menu` or `listbox` role promises); Tab closes the popover; Escape closes it (LayerProvider). */
const ITEMS = '[role^="menuitem"]:not([disabled]),[role="option"]:not([disabled])';
function itemsOf(el: HTMLElement | null): HTMLElement[] {
  if (!el) return [];
  const own = Array.from(el.querySelectorAll<HTMLElement>(ITEMS));
  return (own.length ? own : Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE))).filter((x) => x.offsetParent !== null);
}
function Popover({ l, close }: { l: Extract<Layer, { kind: "popover" }>; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const trigger = l.trigger;
  // stays on its trigger when the page moves (window resized, sidebar collapsed with the keyboard, content loading); keeps its place if the trigger is gone
  const [moved, setMoved] = useState<{ l: typeof l; p: PopPos } | null>(null);
  useAnchorWatch(!!trigger, () => trigger ?? null, () => { if (trigger?.isConnected && trigger.getClientRects().length) setMoved({ l, p: popPos(trigger, l.align) }); });
  const p: PopPos = moved && moved.l === l ? moved.p : l;
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const it = itemsOf(ref.current);
      const sel = it.find((x) => x.getAttribute("aria-selected") === "true");
      (sel || it[0] || ref.current)?.focus();
    });
    return () => {
      cancelAnimationFrame(id);
      // back to the trigger, unless the chosen item already moved focus somewhere real (a dialog it opened, a field)
      const a = document.activeElement;
      if (trigger?.isConnected && (!a || a === document.body)) trigger.focus();
    };
  }, [trigger]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Tab") { e.preventDefault(); close(); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const it = itemsOf(ref.current); if (!it.length) return;
    e.preventDefault();
    const i = it.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "Home" ? 0 : e.key === "End" ? it.length - 1 : e.key === "ArrowDown" ? (i + 1) % it.length : (i - 1 + it.length) % it.length;
    it[next].focus();
  };
  return (
    <>
      <div className="scrim" style={{ background: "transparent", pointerEvents: "auto" }} onClick={close} />
      <div ref={ref} tabIndex={-1} className="pop" role={l.role || "menu"} aria-label={l.label} style={{ top: p.top, bottom: p.bottom, right: p.right, left: p.left, maxHeight: p.maxH, overflowY: "auto" }} onKeyDown={onKey}>{run(l.body, close)}</div>
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
    const role = appStore.get().role; // only the modules this role may open (and, in production, that have a server API)
    (["ws", "admin"] as const).forEach((sp) => NAV[sp].forEach((g) => g.items.forEach(([key, label, icon]) => { if (modAllowed(role, sp, key)) out.push({ key, label, icon, space: sp, group: g.g, path: `/${sp}/${key}` }); })));
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
          )) : <div style={{ padding: 16, color: "var(--muted)", fontSize: ".8125rem" }}>No module matches that.</div>}
        </div>
      </div>
    </div>
  );
}

export function LayerProvider({ children }: { children: ReactNode }) {
  const [layer, setLayer] = useState<Layer>(null);
  const [toastMsg, setToastMsg] = useState<{ msg: string; tone: ToastTone; k: number; action?: { label: string; run: () => void } } | null>(null);
  const [toastOn, setToastOn] = useState(false);
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const router = useRouter();

  const closeLayer = useCallback(() => {
    setLayer(null);
    document.querySelectorAll(".ibopen").forEach((b) => { b.classList.remove("ibopen"); if (b.hasAttribute("aria-haspopup")) b.setAttribute("aria-expanded", "false"); });
  }, []);
  // route change closes any open layer (prototype: route() -> closeLayer())
  useEffect(() => { const h = () => closeLayer(); router.events.on("routeChangeStart", h); return () => router.events.off("routeChangeStart", h); }, [router.events, closeLayer]);
  useEffect(() => {
    if (!layer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if ((e.target as Element | null)?.closest?.("[data-lb-open]")) return; // an open listbox closes itself first; the next Esc closes the layer
      e.stopPropagation(); closeLayer();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [layer, closeLayer]);

  const toast = useCallback((msg: string, tone?: ToastTone | boolean, opts?: { action?: { label: string; run: () => void }; ms?: number }) => {
    const t: ToastTone = tone === false ? "bad" : tone === true || tone === undefined ? "ok" : tone;
    setToastMsg((p) => ({ msg: String(msg), tone: t, k: (p?.k || 0) + 1, action: opts?.action }));
    setToastOn(true);
    clearTimeout(tRef.current);
    tRef.current = setTimeout(() => setToastOn(false), opts?.ms ?? (opts?.action ? 7000 : t === "bad" ? 6000 : 2200)); // an error stays long enough to read
  }, []);
  // a toast with an action is hoverable: hovering or focusing it holds it open, leaving gives a short grace period
  const holdToast = () => clearTimeout(tRef.current);
  const releaseToast = () => { clearTimeout(tRef.current); tRef.current = setTimeout(() => setToastOn(false), 2500); };
  const runToastAction = () => { const a = toastMsg?.action; clearTimeout(tRef.current); setToastOn(false); a?.run(); };

  const api = useMemo<LayerApi>(() => ({
    openDrawer: (title, sub, body, foot) => setLayer({ kind: "drawer", title, sub, body, foot }),
    openModal: (title, body, foot, opts) => setLayer({ kind: "modal", title, body, foot, wide: opts?.wide }),
    popover: (ev, body, opts) => {
      const el = ev.currentTarget as HTMLElement;
      el.classList?.add("ibopen"); if (el.hasAttribute?.("aria-haspopup")) el.setAttribute("aria-expanded", "true");
      setLayer({ kind: "popover", ...popPos(el, opts?.align), body, trigger: el, align: opts?.align, role: opts?.role, label: opts?.label });
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
      {/* Styled by #toast in portal.css (no style attribute: it is in every server-rendered page, CSP style-src 'self'). */}
      <div id="toast" role="status" aria-live="polite" data-tone={toastMsg?.tone} data-on={toastOn ? "" : undefined}
        data-action={toastOn && toastMsg?.action ? "" : undefined} onMouseEnter={toastMsg?.action ? holdToast : undefined} onMouseLeave={toastMsg?.action ? releaseToast : undefined}
        onFocus={toastMsg?.action ? holdToast : undefined} onBlur={toastMsg?.action ? releaseToast : undefined}>
        {toastMsg?.tone === "ok" ? (
          <svg key={toastMsg.k} className="tcheck" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: "var(--ok-ink-inverse)" }}>
            <circle className="tc-ring" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.2" />
            <path className="tc-tick" d="M8 12.4l2.6 2.6L16.2 9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : toastMsg?.tone === "bad" ? (
          <Icon key={toastMsg.k} name="alert" width={16} height={16} style={{ color: "var(--bad-ink-inverse)", flex: "0 0 auto" }} />
        ) : null}
        {toastMsg?.tone === "bad" ? <span className="vh">Error: </span> : null}
        <span>{toastMsg?.msg}</span>
        {toastMsg?.action ? (
          <button type="button" tabIndex={toastOn ? 0 : -1} onClick={runToastAction}
            style={{ marginLeft: 6, border: 0, background: "none", color: "inherit", font: "inherit", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer", padding: "2px 6px", borderRadius: 999 }}>
            {toastMsg.action.label}
          </button>
        ) : null}
      </div>
    </Ctx.Provider>
  );
}
