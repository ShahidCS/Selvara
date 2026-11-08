/* Risk Register shared helpers (ISO/IEC 27005): scales, rating bands, colour helpers, normalisation, role gates.
 * Source: prototype lines 2411-2469. Other modules (Overview, Reports, import wizard) import from here. */
import type { CSSProperties } from "react";
import refs from "@/data/riskRef.json";
import { DATA } from "./data";
import { nowStamp } from "./format";
import { getMe } from "./audit";
import { appStore } from "./store";
export { riskOpen, sInh, sCur, sRes } from "./metrics";
import { sCur, sRes } from "./metrics";

/* eslint-disable @typescript-eslint/no-explicit-any */
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export const Lb = ["Rare", "Unlikely", "Possible", "Likely", "Almost certain"];
export const Ib = ["Insignificant", "Minor", "Moderate", "Major", "Severe"];

export type BandName = "Low" | "Medium" | "High" | "Extreme";
export interface RBand { name: BandName; lo: number; hi: number; col: string; pill: string }
/* ISO 27005 rating bands on a 5x5 scale: Low <=5, Medium 6-10, High 11-19, Extreme 20-25 */
export const RBANDS: RBand[] = [
  { name: "Low", lo: 1, hi: 5, col: "#217A4A", pill: "ok" },
  { name: "Medium", lo: 6, hi: 10, col: "#846200", pill: "warn" },
  { name: "High", lo: 11, hi: 19, col: "#A34708", pill: "high" },
  { name: "Extreme", lo: 20, hi: 25, col: "#B4231E", pill: "bad" },
];
export const rband = (score: number): RBand => RBANDS.find((b) => score >= b.lo && score <= b.hi) || RBANDS[0];
export const heatColor = (score: number) => rband(score).col;
export const RISK_APPETITE = 11;
export const bandTint = (col: string, p: number) => `color-mix(in srgb, ${col} ${p}%, var(--surface))`;
export const bandText = (col: string) => `color-mix(in srgb, ${col} 50%, var(--ink))`;
export const HEAT_P: Record<BandName, number> = { Low: 12, Medium: 20, High: 30, Extreme: 42 };
export const heatFill = (b: RBand) => bandTint(b.col, HEAT_P[b.name]);
export const heatInk = (b: RBand) => `color-mix(in srgb, ${b.col} 34%, var(--ink))`;
export const heatEdge = (b: RBand, sc: number): CSSProperties =>
  sc >= RISK_APPETITE ? { boxShadow: `inset 0 0 0 1.5px ${b.col}`, borderColor: "transparent" } : { borderColor: bandTint(b.col, 30) };

export const riskPriority = (r: any): string => ({ Extreme: "P1", High: "P2", Medium: "P3", Low: "P4" } as Record<string, string>)[rband(sCur(r)).name];
export const riskRatingOf = (r: any): BandName => rband(sCur(r)).name;

export const CAT_TEAM = refs.CAT_TEAM as Record<string, string>;
export const RISK_JUR = refs.RISK_JUR as Record<string, string>;
export const ACCEPT_AUTH = refs.ACCEPT_AUTH as Record<string, string>;
export const ACCEPT_RANK = refs.ACCEPT_RANK as Record<string, number>;
export const RISK_CATS = ["Technology", "People", "Third party", "AI", "Operational", "Compliance", "AML"];
export const RISK_TREATS = ["Mitigate", "Transfer", "Accept", "Avoid"];
export const RISK_STATUSES = ["Open", "In review", "Accepted", "Closed"];
export const RISK_SCORE_FIELDS = ["l", "i", "cl", "ci", "rl", "ri"];

export interface RiskEnt { id: string; title: string; owner: string; kids: string[] }
export const RISK_ENT: RiskEnt[] = clone(refs.RISK_ENT);
export interface RiskParty { party: string; req: string; loc: string; links: string[] }
/** Mutable (the prototype mutated this list in place). */
export const RISK_PARTIES: RiskParty[] = clone(refs.RISK_PARTIES);
export interface RiskSnapshot { id: string; at: string; count: number; scope: string; hash: string; by: string; shared: boolean }
export const RISK_SNAPSHOTS: RiskSnapshot[] = [];

export const todayIso = () => nowStamp().slice(0, 10);
const isoPlusDays = (ms: number) => new Date(Date.now() + ms).toISOString().slice(0, 10);
export const isoInDays = (d: number) => isoPlusDays(d * 864e5);

/** Fill defaults the prototype derived lazily (idempotent: `_n` marks a normalised risk). Also used by the import wizard. */
export function riskNorm(r: any) {
  if (r._n) return;
  if (r.cl == null) r.cl = Math.max(r.rl, r.l - 1);
  if (r.ci == null) r.ci = Math.max(r.ri, r.i - 1);
  if (!r.team) r.team = CAT_TEAM[r.cat] || "Operations";
  if (!r.jur) r.jur = RISK_JUR[r.id] || "Global";
  if (!r.register) r.register = "Information Security";
  if (!r.review) r.review = r.status === "In review" ? "Submitted" : "Approved";
  const ent = RISK_ENT.find((e) => e.kids.includes(r.id));
  if (ent && !r.parent) r.parent = { id: ent.id, title: ent.title };
  if (!r.history) r.history = [{ ts: r.identified || todayIso(), by: r.owner, a: "Risk identified and entered" }, { ts: r.reviewed || todayIso(), by: r.owner, a: "Reviewed; scores confirmed" }];
  if (r.status === "Accepted" && !r.acceptance) {
    const need = ACCEPT_AUTH[rband(sRes(r)).name];
    const t = new Date(r.reviewed || todayIso()).getTime();
    /* source threw RangeError on an unparsable date; fall back to today instead */
    const base = Number.isNaN(t) ? Date.now() : t;
    const until = new Date(base + 300 * 864e5).toISOString().slice(0, 10);
    r.acceptance = { by: need, at: r.reviewed || todayIso(), until, note: "Residual within appetite; accepted by management pending next annual review.", comp: "Monitored under continuity and third-party controls." };
  }
  r._n = true;
}
export const riskNormAll = () => { DATA.risks.forEach(riskNorm); };
export const riskFindR = (id: string) => DATA.risks.find((x) => x.id === id);
export const riskCtrl = (id: string) => DATA.controls.find((c) => c.id === id);
/** Role gates (prototype riskCanEdit / riskCanApprove). UI-only: the API must enforce them. */
export const riskCanEdit = (role: string = appStore.get().role) => ["super", "admin", "owner", "analyst"].includes(role);
export const riskCanApprove = (role: string = appStore.get().role) => ["super", "admin"].includes(role);
/** Append to the risk's own history (prototype riskLog). */
export function riskLog(r: any, a: string) {
  r.history = r.history || [];
  r.history.push({ ts: todayIso(), by: getMe().name, a });
}
/** Acceptance expires within 60 days (prototype `soon`). */
export const expiresSoon = (exp?: string) => !!exp && exp < isoInDays(60);

export const RISK_CSV_COLS = ["id", "title", "cat", "team", "jur", "owner", "l", "i", "cl", "ci", "rl", "ri", "inherentScore", "currentScore", "residualScore", "rating", "priority", "treat", "status", "review", "identified", "reviewed"];
/* friendly header labels so an exported register re-imports cleanly (export -> edit -> re-import by Risk ID) */
export const RISK_CSV_HEADERS = ["Risk ID", "Title", "Category", "Team", "Jurisdiction", "Owner", "Likelihood", "Impact", "Current likelihood", "Current impact", "Residual likelihood", "Residual impact", "Inherent score", "Current score", "Residual score", "Rating", "Priority", "Treatment", "Status", "Review", "Identified", "Reviewed"];
