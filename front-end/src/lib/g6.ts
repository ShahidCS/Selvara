/* Production (API mode) data of the AI Assistant and API modules (programme group 6), filled by services/ws.ts from the server. Shared code
   so the loader can fill it; the feature modules read it when API_ON. Nothing here is used by the demonstration. */
import { useSyncExternalStore } from "react";
import { createStore } from "@/lib/store";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface G6Settings {
  enabled: boolean; mode: "block" | "mask"; trackRecord: number; configured: boolean; model: string | null; enablePending?: string; maskPending?: string;
  history: { at: string; by: string; what: string }[]; limits: { askMax: number; recordsMax: number; perHour: number };
}
export const G6 = {
  shadow: [] as any[], agents: [] as any[], runs: [] as any[], mcp: [] as any[],
  keys: [] as any[], hooks: [] as any[], tests: [] as any[], events: [] as any[], webhookEvents: [] as string[], revealMinutes: 60,
};
export const g6Settings = createStore<{ s: G6Settings | null }>({ s: null });
/** The company's AI setting as the server last sent it (null until loaded). */
export function useG6Settings(): G6Settings | null { return useSyncExternalStore(g6Settings.subscribe, () => g6Settings.get().s, () => g6Settings.get().s); }
export function clearG6() {
  for (const k of ["shadow", "agents", "runs", "mcp", "keys", "hooks", "tests", "events", "webhookEvents"] as const) G6[k].length = 0;
  g6Settings.set({ s: null });
}
