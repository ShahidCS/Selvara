/* Every module's guided tour (bubble walkthrough), by sidebar group. The shell starts a module's tour by itself according to the person's
   preference (lib/tours.ts) and plays it again from "Take the tour" in the top bar. */
import { MODULE_TIPS } from "@/data/tips";
import type { ModuleTour, Tours } from "./types";
import { TOURS as CORE } from "./ws-core";
import { TOURS as ASSURANCE } from "./ws-assurance";
import { TOURS as TRUST } from "./ws-trust";
import { TOURS as SETTINGS } from "./ws-settings";
import { TOURS as ADMIN } from "./admin";

export type { ModuleTour, TourStep, Tours } from "./types";
const fromTips: Tours = Object.fromEntries(Object.entries(MODULE_TIPS).map(([k, t]): [string, ModuleTour] => [k, { version: 1, title: t.title, steps: [...t.steps.map((s) => ({ title: t.title, body: s })), ...(t.note ? [{ title: "Good to know", body: t.note }] : [])] }]));
export const MODULE_TOURS: Tours = { ...fromTips, ...CORE, ...ASSURANCE, ...TRUST, ...SETTINGS, ...ADMIN };
