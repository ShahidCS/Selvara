/* Risk Register shared helpers (ISO/IEC 27005): scales, rating bands, colour helpers, normalisation, role gates.
 * Source: prototype lines 2411-2469. Other modules (Overview, Reports, import wizard) import from here. */
import type { CSSProperties } from "react";
import refs from "@/data/riskRef.json";
import { DATA } from "./data";
import { nowStamp } from "./format";
import { getMe, wsLog } from "./audit";
import { approvals } from "./approvals";
import { appStore } from "./store";
import { SOD } from "./sod";
import { riskNeedsBoard } from "./riskBoard";
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
const PRODUCTION = (process.env.NEXT_PUBLIC_API_MODE || "mock") === "http"; // production fills these from the server (services/ws.ts)
export const RISK_ENT: RiskEnt[] = PRODUCTION ? [] : clone(refs.RISK_ENT);
export interface RiskParty { id?: string; party: string; req: string; loc: string; links: string[] }
/** Mutable (the prototype mutated this list in place). */
export const RISK_PARTIES: RiskParty[] = PRODUCTION ? [] : clone(refs.RISK_PARTIES);
export interface RiskSnapshot { id: string; at: string; count: number; scope: string; hash: string; by: string; shared: boolean; sha256?: string }
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
export const riskCanEdit = (role: string = appStore.get().role) => ["super", "admin", "owner", "analyst"].includes(role.replace(/2$/, ""));
export const riskCanApprove = (role: string = appStore.get().role) => ["super", "admin"].includes(role.replace(/2$/, ""));
/** Append to the risk's own history (prototype riskLog). */
export function riskLog(r: any, a: string) {
  r.history = r.history || [];
  r.history.push({ ts: todayIso(), by: getMe().name, a });
}
/** Acceptance expires within 60 days (prototype `soon`). */
export const expiresSoon = (exp?: string) => !!exp && exp < isoInDays(60);

/* ---- acceptance integrity (owner decision: acceptance threshold 15 is distinct from RISK_APPETITE 11) ---- */
/** Highest rating band index an acceptance covers: the band of the score it was accepted at; legacy records fall back to the band the authority may accept. */
function acceptedCapIdx(acc: any): number {
  if (typeof acc.score === "number") return RBANDS.indexOf(rband(acc.score));
  const rank = ACCEPT_RANK[acc.by] ?? 0; let idx = 0;
  RBANDS.forEach((b, i) => { if ((ACCEPT_RANK[ACCEPT_AUTH[b.name]] ?? 0) <= rank) idx = i; });
  return idx;
}
/** After any score change: if the acceptance no longer holds (residual above the accepted band, or above the Board threshold with no evidence)
 *  the risk goes back to Open and the reason is logged. Returns the reason, or null when the acceptance still holds. */
export function riskRevalidateAcceptance(r: any): string | null {
  if (r.status !== "Accepted" || !r.acceptance) return null;
  const acc = r.acceptance; const sc = r.rl * r.ri; let why = "";
  if (RBANDS.indexOf(rband(sc)) > acceptedCapIdx(acc)) why = "residual rose to " + rband(sc).name + " (" + sc + "), above the accepted band";
  else if (riskNeedsBoard(sc) && !acc.board) why = "residual " + sc + " is above " + SOD.RISK_BOARD_THRESHOLD + " and has no Board approval evidence";
  if (!why) return null;
  r.invalidatedAcceptance = { ...acc, invalidatedAt: todayIso(), invalidatedReason: why };
  delete r.acceptance; r.status = "Open"; r.treat = "Mitigate";
  riskLog(r, "Acceptance invalidated: " + why);
  wsLog("risk.acceptance.invalidated", r.id + ": " + why + (acc.board ? " (Board ref " + acc.board.ref + ")" : ""), "Risk");
  return why;
}
/** Drop an acceptance that is waiting for evidence verification (scores changed, risk closed...) and withdraw its approval request. */
export function riskCancelPending(r: any, why: string): boolean {
  const p = r.pendingAcceptance; if (!p) return false;
  const ap = approvals.get().list.find((a) => a.id === p.approvalId);
  if (ap && ap.status === "Pending") { ap.status = "Withdrawn"; ap.decidedReason = why.slice(0, 300); approvals.set((s) => ({ list: [...s.list] })); }
  delete r.pendingAcceptance; riskLog(r, "Pending acceptance cancelled: " + why);
  wsLog("risk.acceptance.pending_cancelled", r.id + ": " + why + " (" + (p.board?.ref || "") + ", " + (p.approvalId || "") + ")", "Risk");
  return true;
}
/** "Effective" | "Awaiting evidence verification" | "" for display. */
export const riskAcceptState = (r: any): string => (r.pendingAcceptance ? "Awaiting evidence verification" : r.acceptance ? "Effective" : "");
/** Open treatment actions (not done, not cancelled) block closing. */
export const riskOpenActions = (r: any): any[] => (r.actions || []).filter((a: any) => !a.done && !a.cancelled);

export const RISK_CSV_COLS = ["id", "title", "cat", "team", "jur", "owner", "l", "i", "cl", "ci", "rl", "ri", "inherentScore", "currentScore", "residualScore", "rating", "priority", "treat", "status", "review", "identified", "reviewed", "boardRef", "boardDate", "acceptanceState"];
/* friendly header labels so an exported register re-imports cleanly (export -> edit -> re-import by Risk ID) */
export const RISK_CSV_HEADERS = ["Risk ID", "Title", "Category", "Team", "Jurisdiction", "Owner", "Likelihood", "Impact", "Current likelihood", "Current impact", "Residual likelihood", "Residual impact", "Inherent score", "Current score", "Residual score", "Rating", "Priority", "Treatment", "Status", "Review", "Identified", "Reviewed", "Board decision ref", "Board decision date", "Acceptance state"];
