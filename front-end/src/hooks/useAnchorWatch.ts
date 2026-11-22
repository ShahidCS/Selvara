/* Keeps something drawn at a fixed position (a tour ring and bubble, a popover, a rail flyout) on its anchor while the page moves under it.
   Window resize and scroll events miss most layout changes: the sidebar collapsing or expanding (and its animation), a panel opening,
   content loading, fonts settling. So while `active`, this reads the anchor's box once per frame and calls `onMove` when the box or the
   window size changed. One box read per frame costs next to nothing, and nothing runs when inactive. */
import { useEffect, useRef } from "react";

const key = (r: DOMRect | null) => (r ? `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}` : "-");

export function useAnchorWatch(active: boolean, anchor: () => Element | null, onMove: () => void): void {
  const cb = useRef({ anchor, onMove });
  useEffect(() => { cb.current = { anchor, onMove }; });
  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    let raf = 0, last: string | null = null;
    const tick = () => {
      const el = cb.current.anchor();
      const k = `${key(el && el.isConnected ? el.getBoundingClientRect() : null)}|${window.innerWidth}x${window.innerHeight}`;
      if (last !== null && k !== last) cb.current.onMove();
      last = k;
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [active]);
}
