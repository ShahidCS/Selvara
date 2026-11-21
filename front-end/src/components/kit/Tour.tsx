/* Guided tour: a bubble that points at one part of the page at a time, with Back, Next (Done on the last step) and Skip tour.
   Steps come from data/tours; a step whose element is not on the page is left out, so each role sees only what it can use.
   The page stays usable underneath (no blocking scrim): the bubble is a non-modal dialog, Escape skips, and focus moves into it on
   each step and back to where it was when the tour ends. Finishing or skipping is remembered (lib/tours.ts). */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { createStore } from "@/lib/store";
import { markTourSeen } from "@/lib/tours";
import { MODULE_TOURS, type TourStep } from "@/data/tours";
import { Icon } from "@/components/ui";

const visible = (el: Element | null): el is HTMLElement => !!el && el instanceof HTMLElement && el.offsetParent !== null && el.getClientRects().length > 0;
const find = (s: TourStep): HTMLElement | null => { if (!s.target) return null; try { const el = document.querySelector(s.target); return visible(el) ? el : null; } catch { return null; } };

const tourStore = createStore<{ mod: string | null; steps: TourStep[]; i: number }>({ mod: null, steps: [], i: 0 });
let returnFocus: HTMLElement | null = null;
/** Plays `mod`'s tour from the first step (replay or auto-start). Keeps the steps whose element is on the page now (or that need none).
 *  Returns false when the module has no tour. */
export function startTour(mod: string): boolean {
  const tour = MODULE_TOURS[mod]; if (!tour) return false;
  const keep = tour.steps.filter((s) => !s.target || find(s));
  returnFocus = document.activeElement as HTMLElement | null;
  tourStore.set({ mod, i: 0, steps: keep.length ? keep : [{ title: tour.title, body: "There is nothing to point at on this page yet. Add your first record to get started." }] });
  return true;
}
export const hasTour = (mod: string) => !!MODULE_TOURS[mod];
export const tourRunning = () => tourStore.get().mod !== null;

const GAP = 12, EDGE = 16, W = 340;
interface Pos { top: number; left: number; arrow: "up" | "down" | null; arrowX: number; ring: DOMRect | null; sheet: boolean }

export function TourHost() {
  const { mod, steps, i } = useSyncExternalStore(tourStore.subscribe, tourStore.get, tourStore.get);
  const setI = (n: number) => tourStore.set({ i: n });
  const [pos, setPos] = useState<Pos | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const tour = mod ? MODULE_TOURS[mod] : null;

  const end = useCallback((remember: boolean) => {
    if (mod && tour && remember) void markTourSeen(mod, tour.version);
    tourStore.set({ mod: null, steps: [], i: 0 }); setPos(null);
    const b = returnFocus; returnFocus = null;
    if (b && document.contains(b)) b.focus({ preventScroll: true });
  }, [mod, tour]);

  const step = steps[i];
  const place = useCallback(() => {
    if (!step || !box.current) return;
    const el = find(step); const vw = window.innerWidth, vh = window.innerHeight;
    const bw = Math.min(W, vw - 2 * EDGE), bh = box.current.offsetHeight;
    if (vw < 600) { setPos({ top: 0, left: 0, arrow: null, arrowX: 0, ring: el ? el.getBoundingClientRect() : null, sheet: true }); return; }
    if (!el) { setPos({ top: Math.max(EDGE, (vh - bh) / 2), left: (vw - bw) / 2, arrow: null, arrowX: 0, ring: null, sheet: false }); return; }
    const r = el.getBoundingClientRect();
    const below = vh - r.bottom >= bh + GAP + EDGE || r.top < bh + GAP + EDGE;
    const top = below ? Math.min(r.bottom + GAP, vh - bh - EDGE) : r.top - GAP - bh;
    const left = Math.min(Math.max(EDGE, r.left + r.width / 2 - bw / 2), vw - bw - EDGE);
    const arrowX = Math.min(Math.max(18, r.left + r.width / 2 - left), bw - 18);
    setPos({ top, left, arrow: below ? "up" : "down", arrowX, ring: r, sheet: false });
  }, [step]);

  // each step: bring its element into view, place the bubble, move focus into it
  useLayoutEffect(() => {
    if (!step) return;
    const el = find(step);
    if (el) el.scrollIntoView({ block: "center", inline: "nearest" });
    const raf = window.requestAnimationFrame(place);
    const t = window.setTimeout(() => { place(); box.current?.focus({ preventScroll: true }); }, 60);
    return () => { window.cancelAnimationFrame(raf); window.clearTimeout(t); };
  }, [step, place]);
  useEffect(() => {
    if (!mod) return;
    const on = () => place();
    window.addEventListener("resize", on); document.addEventListener("scroll", on, true);
    return () => { window.removeEventListener("resize", on); document.removeEventListener("scroll", on, true); };
  }, [mod, place]);
  // leaving the page ends the tour without marking it seen (it was not finished or skipped)
  useEffect(() => { if (!mod) return; const p = window.location.pathname; const iv = window.setInterval(() => { if (window.location.pathname !== p) end(false); }, 400); return () => window.clearInterval(iv); }, [mod, end]);

  if (!tour || !step) return null;
  const last = i === steps.length - 1;
  const next = () => (last ? end(true) : setI(i + 1));
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); end(true); }
    else if (e.key === "ArrowRight") { e.preventDefault(); next(); }
    else if (e.key === "ArrowLeft" && i > 0) { e.preventDefault(); setI(i - 1); }
  };
  const ring = pos?.ring;
  return (
    <>
      {ring ? <div className="tour-ring" aria-hidden="true" style={{ top: ring.top - 4, left: ring.left - 4, width: ring.width + 8, height: ring.height + 8 }} /> : null}
      <div ref={box} className={`tour-bubble${pos?.sheet ? " sheet" : ""}`} role="dialog" aria-modal="false" aria-labelledby="tour-t" aria-describedby="tour-b" tabIndex={-1} onKeyDown={onKey}
        style={pos && !pos.sheet ? { top: pos.top, left: pos.left, width: Math.min(W, window.innerWidth - 2 * EDGE) } : pos ? undefined : { visibility: "hidden" }}>
        {pos?.arrow ? <span className={`tour-arrow ${pos.arrow}`} style={{ left: pos.arrowX }} aria-hidden="true" /> : null}
        <div className="tour-top"><span className="tour-k">{tour.title}</span><span className="tour-n" aria-label={`Step ${i + 1} of ${steps.length}`}>{i + 1} / {steps.length}</span></div>
        <h2 id="tour-t">{step.title}</h2>
        <p id="tour-b">{step.body}</p>
        <div className="tour-dots" aria-hidden="true">{steps.map((_, k) => <span key={k} className={k === i ? "on" : ""} />)}</div>
        <div className="tour-acts">
          <button className="btn btn-ghost sm" onClick={() => end(true)}>Skip tour</button>
          <span className="tour-sp" />
          {i > 0 ? <button className="btn btn-secondary sm" onClick={() => setI(i - 1)}><Icon name="chevl" />Back</button> : null}
          <button className="btn btn-primary sm" onClick={next}>{last ? <><Icon name="check" />Done</> : <>Next<Icon name="chevron" /></>}</button>
        </div>
        {last ? <p className="tour-foot">Choose how often tours start in <Link href="/auth#tours" onClick={() => end(true)}>Sign-in &amp; security › Guided tours</Link>.</p> : null}
      </div>
    </>
  );
}
