/* Guided tours: each person's preference for how often a module's walkthrough starts by itself, and which version of each tour they
   finished or skipped. Production: saved on the person's account (GET/PUT /api/me/tours), so it follows them to any browser. Demo: this
   browser. A display preference only, never a control.
   - "first":   a module's tour starts the first time the person opens the module (the default).
   - "updates": as "first", and again when the tour's steps change in a later release (its version goes up).
   - "off":     never starts by itself; "Take the tour" in the top bar still plays it. */
import { useSyncExternalStore } from "react";
import { createStore } from "@/lib/store";
import { API_MODE, apiFetch } from "@/services/http";

export type TourFreq = "first" | "updates" | "off";
export interface TourPrefs { freq: TourFreq; seen: Record<string, number> }
export const TOUR_FREQ_LABEL: Record<TourFreq, string> = { first: "First visit only", updates: "Again after updates", off: "Off" };

const LS = "selvara.tours.v1";
const DEFAULT: TourPrefs = { freq: "first", seen: {} };
const live = () => API_MODE === "http";
const store = createStore<{ prefs: TourPrefs; loaded: boolean }>({ prefs: DEFAULT, loaded: false });

const clean = (v: unknown): TourPrefs => {
  const o = (v && typeof v === "object" ? v : {}) as Partial<TourPrefs>;
  const freq: TourFreq = o.freq === "updates" || o.freq === "off" ? o.freq : "first";
  const seen: Record<string, number> = {};
  if (o.seen && typeof o.seen === "object") for (const [k, n] of Object.entries(o.seen)) if (/^[a-z]{2,20}$/.test(k) && Number.isInteger(n)) seen[k] = n as number;
  return { freq, seen };
};
const readLocal = (): TourPrefs => { try { return clean(JSON.parse(localStorage.getItem(LS) || "null")); } catch { return DEFAULT; } };
const writeLocal = (p: TourPrefs) => { try { localStorage.setItem(LS, JSON.stringify(p)); } catch { /* storage unavailable: tours may show again */ } };

/** Loads the person's preference once per sign-in (call after the session is known). */
export async function loadTourPrefs(): Promise<void> {
  if (!live()) { store.set({ prefs: readLocal(), loaded: true }); return; }
  try { store.set({ prefs: clean(await apiFetch<TourPrefs>("/me/tours")), loaded: true }); }
  catch { store.set({ prefs: DEFAULT, loaded: false }); } // not known: do not start tours by themselves rather than guess
}
export const resetTourPrefs = () => store.set({ prefs: DEFAULT, loaded: false });

async function save(patch: { freq?: TourFreq; seen?: Record<string, number>; reset?: boolean }): Promise<void> {
  const cur = store.get().prefs;
  const next: TourPrefs = { freq: patch.freq ?? cur.freq, seen: patch.reset ? {} : { ...cur.seen, ...(patch.seen ?? {}) } };
  store.set({ prefs: next });
  if (!live()) { writeLocal(next); return; }
  try { store.set({ prefs: clean(await apiFetch<TourPrefs>("/me/tours", { method: "PUT", body: JSON.stringify(patch) })) }); }
  catch { /* kept for this visit; saved again with the next change */ }
}
export const setTourFreq = (freq: TourFreq) => save({ freq });
/** Finished or skipped: remembered with the tour's version. */
export const markTourSeen = (mod: string, version: number) => save({ seen: { [mod]: version } });
/** "Show all tours again": forget progress (the frequency stays). */
export const resetTourProgress = () => save({ reset: true });

/** Whether `mod`'s tour (at `version`) should start by itself now. */
export function shouldAutoStart(mod: string, version: number): boolean {
  const { prefs, loaded } = store.get();
  if (!loaded || prefs.freq === "off") return false;
  const seen = prefs.seen[mod];
  return seen === undefined || (prefs.freq === "updates" && seen < version);
}
export function useTourPrefs(): { prefs: TourPrefs; loaded: boolean } {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
