/* Production (API mode) data of the Integrations module (programme group 7), filled by services/ws.ts from the server. Shared code so the
   loader can fill it; the feature reads it when API_ON. Account lists hold employee data: they are loaded only for admins (the module is
   admin-only) and are cleared with everything else when the company or role changes. */
import { useSyncExternalStore } from "react";
import { createStore } from "@/lib/store";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface G7Provider { id: string; name: string; type: string; scope: string; ready: string | null; active: boolean }
export const g7 = createStore<{ providers: G7Provider[]; connections: any[]; runs: any[] }>({ providers: [], connections: [], runs: [] });
export const useG7 = () => useSyncExternalStore(g7.subscribe, g7.get, g7.get);
export const clearG7 = () => g7.set({ providers: [], connections: [], runs: [] });
