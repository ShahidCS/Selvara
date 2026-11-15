import { useSyncExternalStore } from "react";

type Listener = () => void;
export function createStore<T extends object>(initial: T) {
  let state = initial;
  const ls = new Set<Listener>();
  return {
    get: () => state,
    set(patch: Partial<T> | ((s: T) => Partial<T>)) {
      const p = typeof patch === "function" ? patch(state) : patch;
      state = { ...state, ...p };
      ls.forEach((l) => l());
    },
    subscribe(l: Listener) { ls.add(l); return () => { ls.delete(l); }; },
  };
}

/* ---------- application shell state (was the global `S` in the prototype) ---------- */
export type Theme = "auto" | "light" | "dark";
export type Density = "comfortable" | "compact";
export interface AppState {
  role: string;
  collapsed: boolean;
  theme: Theme;
  density: Density;
  scope: string;
  groupsOpen: Record<string, boolean>;
  navOpen: string | null;
  mobOpen: boolean;
  hydrated: boolean;
}
export const appStore = createStore<AppState>({
  role: "super", collapsed: false, theme: "auto", density: "comfortable", scope: "ISO 27001", groupsOpen: {}, navOpen: null, mobOpen: false, hydrated: false,
});
export function useApp<R>(sel: (s: AppState) => R): R {
  return useSyncExternalStore(appStore.subscribe, () => sel(appStore.get()), () => sel(appStore.get()));
}
export const PKEY = "assurance.v1";
export function persist() {
  try {
    const s = appStore.get();
    localStorage.setItem(PKEY, JSON.stringify({ role: s.role, collapsed: s.collapsed, theme: s.theme, density: s.density }));
  } catch { /* storage unavailable (private mode): the UI still works */ }
}
export function loadPersisted(validRoles: string[]) {
  try {
    const o = JSON.parse(localStorage.getItem(PKEY) || "{}");
    const patch: Partial<AppState> = {};
    if (o && typeof o === "object") {
      if (o.role && validRoles.includes(o.role)) patch.role = o.role;
      if (o.theme === "auto" || o.theme === "light" || o.theme === "dark") patch.theme = o.theme;
      if (o.density === "comfortable" || o.density === "compact") patch.density = o.density;
      if (typeof o.collapsed === "boolean") patch.collapsed = o.collapsed;
    }
    appStore.set({ ...patch, hydrated: true });
  } catch { appStore.set({ hydrated: true }); }
}
export function resetPersisted() { try { localStorage.removeItem(PKEY); } catch { /* ignore */ } }

/* ---------- mutable demo dataset version (modules mutate DATA, then bumpData()) ---------- */
const dataStore = createStore({ v: 0 });
export const bumpData = () => dataStore.set((s) => ({ v: s.v + 1 }));
/** Subscribe a component to DATA mutations. Returns the version (use it only to trigger re-render). */
export function useData(): number {
  return useSyncExternalStore(dataStore.subscribe, () => dataStore.get().v, () => 0);
}

/* ---------- per-module UI state that survives navigation (prototype used module-level `let`s) ---------- */
const modStore = createStore<{ m: Record<string, unknown> }>({ m: {} });
export function getModState<T>(key: string, init: T): T {
  const m = modStore.get().m;
  return key in m ? (m[key] as T) : init;
}
export function setModState<T>(key: string, val: T) {
  modStore.set((s) => ({ m: { ...s.m, [key]: val } }));
}
/** useState-like hook backed by a module-level store, so filters/tabs persist when you leave and return. */
export function useModState<T>(key: string, init: T): [T, (v: T | ((p: T) => T)) => void] {
  const m = useSyncExternalStore(modStore.subscribe, () => modStore.get().m, () => modStore.get().m);
  const val = (key in m ? m[key] : init) as T;
  const set = (v: T | ((p: T) => T)) => {
    const cur = getModState<T>(key, init);
    setModState(key, typeof v === "function" ? (v as (p: T) => T)(cur) : v);
  };
  return [val, set];
}

/** Re-render when any module state changes (used by the sidebar so sub-nav highlights follow module tabs). */
export function useModVersion(): unknown {
  return useSyncExternalStore(modStore.subscribe, () => modStore.get().m, () => modStore.get().m);
}
