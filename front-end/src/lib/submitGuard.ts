/**
 * EDGE-11: one save per click, on every button.
 *
 * A capture-phase listener notes which button (or form) the person activated. Every write to the server (`beginWrite`, called by the
 * HTTP layer for each non-GET request) is credited to the button activated just before it, which is then marked busy (`aria-busy`,
 * `data-busy`) until the write and the reload after it finish. A second activation of a busy button, by click, Enter or Space, is stopped
 * before any screen code sees it. Other buttons, Cancel for instance, stay usable. Screens need no code of their own; `BusyButton` keeps
 * its own state (`data-busy-owner`) and is left alone.
 *
 * This is a usability guard, not a control: the server checks record versions (EDGE-18) and the HTTP layer sends identical writes that
 * are still in flight only once.
 */

/** A write that starts this soon after an activation is credited to it (the handler may validate or await a little first). */
export const CREDIT_MS = 1000;

/** The part of a DOM element the guard uses (kept small so it can be tested without a browser). */
export interface GuardEl {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  hasAttribute(name: string): boolean;
}

let armed: { el: GuardEl; at: number } | null = null;
const busy = new Map<GuardEl, number>();

export function isBusy(el: GuardEl | null | undefined): boolean { return !!el && (busy.get(el) ?? 0) > 0; }

/** Records that the person activated `el`. */
export function noteActivation(el: GuardEl, now = Date.now()): void { armed = { el, at: now }; }

/** Called when a write to the server starts; returns the function to call when it ends (safe to call more than once). */
export function beginWrite(now = Date.now()): () => void {
  const a = armed && (now - armed.at <= CREDIT_MS || isBusy(armed.el)) ? armed.el : null;
  if (!a || a.hasAttribute("data-busy-owner")) return () => {};
  busy.set(a, (busy.get(a) ?? 0) + 1);
  a.setAttribute("aria-busy", "true"); a.setAttribute("data-busy", "");
  let ended = false;
  return () => {
    if (ended) return; ended = true;
    const n = (busy.get(a) ?? 1) - 1;
    if (n > 0) { busy.set(a, n); return; }
    busy.delete(a); a.removeAttribute("aria-busy"); a.removeAttribute("data-busy");
  };
}

/** Runs `fn` as one write credited to the last activation. */
export async function guardedWrite<T>(fn: () => Promise<T>): Promise<T> {
  const done = beginWrite();
  try { return await fn(); } finally { done(); }
}

/** For tests: forget every activation and busy mark. */
export function resetSubmitGuard(): void { armed = null; busy.clear(); }

type Target = { closest?: (sel: string) => (GuardEl & object) | null };
const ACTIVATABLE = "button, input[type=submit], input[type=button], [role=button]";

/** Decides what to do with a click or submit event: "block" (the button or form is busy) or "allow" (and remember it). */
export function onActivation(kind: "click" | "submit", target: Target | null, submitter: (GuardEl & Target) | null = null, now = Date.now()): "block" | "allow" {
  const el = kind === "click" ? target?.closest?.(ACTIVATABLE) ?? null : (submitter ?? (target as unknown as GuardEl | null));
  if (!el) return "allow";
  if (isBusy(el)) return "block";
  noteActivation(el, now);
  return "allow";
}

/** Installs the guard on the page (once, from the app root). Returns a function that removes it. */
export function installSubmitGuard(doc: Document): () => void {
  const handle = (kind: "click" | "submit") => (e: Event) => {
    const submitter = kind === "submit" ? ((e as SubmitEvent).submitter as unknown as (GuardEl & Target) | null) : null;
    if (onActivation(kind, e.target as unknown as Target, submitter) === "block") { e.preventDefault(); e.stopImmediatePropagation(); }
  };
  const click = handle("click"), submit = handle("submit");
  doc.addEventListener("click", click, true); doc.addEventListener("submit", submit, true);
  return () => { doc.removeEventListener("click", click, true); doc.removeEventListener("submit", submit, true); };
}
