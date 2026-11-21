/* Every module's guided tour (bubble walkthrough), by sidebar group. The shell starts a module's tour by itself according to the person's
   preference (lib/tours.ts) and plays it again from "Take the tour" in the top bar. */
import type { Tours } from "./types";
import { TOURS as CORE } from "./ws-core";
import { TOURS as ASSURANCE } from "./ws-assurance";
import { TOURS as TRUST } from "./ws-trust";
import { TOURS as SETTINGS } from "./ws-settings";
import { TOURS as ADMIN } from "./admin";

export type { ModuleTour, TourStep, Tours } from "./types";
export const MODULE_TOURS: Tours = { ...CORE, ...ASSURANCE, ...TRUST, ...SETTINGS, ...ADMIN };
