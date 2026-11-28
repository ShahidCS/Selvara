/* EDGE-13: is the browser's text size above its default? The stylesheet sizes type in rem, and 1rem is the browser's default font size,
   16px unless the person raised it (Chrome: Settings, Appearance, Font size). Page zoom does not count: it keeps 1rem at 16 CSS px.
   With large text, one-line labels wrap instead of ending in "…", counts sit beside their icon, and the phone tab bar shows fewer tabs;
   at the default size the design is unchanged. AppShell mirrors the answer on <html data-text="large"> for the stylesheet (portal.css).
   One hidden 1rem-wide probe and a ResizeObserver notice a change of setting while the page is open; nothing runs per frame. */
import { useSyncExternalStore } from "react";

/** The browser default font size, in CSS px. */
export const DEFAULT_TEXT_PX = 16;
/** True when the root font size (1rem) is above the default by more than rounding. */
export const isLargeText = (remPx: number) => Number.isFinite(remPx) && remPx > DEFAULT_TEXT_PX + 0.5;

const subs = new Set<() => void>();
let probe: HTMLElement | null = null;
let ro: ResizeObserver | null = null;
let large = false;

const read = () => isLargeText(parseFloat(getComputedStyle(document.documentElement).fontSize));

function subscribe(cb: () => void) {
  subs.add(cb);
  if (!probe && typeof ResizeObserver !== "undefined") {
    large = read();
    probe = document.createElement("div");
    probe.className = "rem-probe"; probe.setAttribute("aria-hidden", "true");
    document.body.appendChild(probe);
    ro = new ResizeObserver(() => { const next = read(); if (next !== large) { large = next; subs.forEach((f) => f()); } });
    ro.observe(probe);
  }
  return () => {
    subs.delete(cb);
    if (!subs.size && probe) { ro?.disconnect(); probe.remove(); probe = null; ro = null; }
  };
}

/** Whether the browser's text size is above its default (false on the server and before the first check). */
export function useLargeText(): boolean {
  return useSyncExternalStore(subscribe, () => (probe ? large : false), () => false);
}
