/* Risk import: scale conversion, compute preview, commit to DATA. Source lines 2884-2934.
 * All imported strings are clamped; numerics are range-checked after conversion; new rows can never reuse an existing id. */
import { DATA } from "@/lib/data";
import { nowStamp, } from "@/lib/format";
import { clampText } from "@/lib/security";
import type { Grid } from "./parse";
import { riskLog, riskNorm } from "./riskLocal";

export const CATS = ["Technology", "People", "Third party", "AI", "Operational", "Compliance", "AML"];
export const MAX_FIELD = 500; // clampText cap for imported strings
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

/* ---- scale conversion ---- */
const TEXT_SCORES: Record<string, number> = { "very low": 1, low: 1, minimal: 1, negligible: 1, insignificant: 1, rare: 1, "very unlikely": 1, minor: 2, unlikely: 2, medium: 3, moderate: 3, possible: 3, high: 4, major: 4, likely: 4, "very high": 5, critical: 5, severe: 5, extreme: 5, catastrophic: 5, "almost certain": 5, certain: 5 };
export function textScore(v: unknown): number | null {
  const s = String(v == null ? "" : v).toLowerCase().trim();
  return Object.prototype.hasOwnProperty.call(TEXT_SCORES, s) ? TEXT_SCORES[s] : null;
}
const NUM_RE = /^\s*-?\d+(\.\d+)?\s*$/;
export function scaleMax(vals: unknown[]): number {
  let mx = 0, any = false;
  vals.forEach((v) => { const n = parseFloat(String(v)); if (!isNaN(n) && NUM_RE.test(String(v))) { any = true; if (n > mx) mx = n; } });
  return any ? mx : 0;
}
const c15 = (n: number) => (Number.isFinite(n) ? Math.max(1, Math.min(5, n)) : 3);
export function toFive(v: unknown, smax: number): number | null {
  const t = textScore(v); if (t != null) return t;
  const n = parseFloat(String(v)); if (isNaN(n) || !NUM_RE.test(String(v))) return null;
  if (smax <= 3) return c15(Math.round(1 + (n - 1) * 2));
  if (smax <= 5) return c15(Math.round(n));
  if (smax <= 10) return c15(Math.ceil(n / 2));
  return c15(Math.ceil((n / smax) * 5));
}
export function treatOf(v: unknown): string {
  const s = String(v == null ? "" : v).toLowerCase();
  if (/accept|toler/.test(s)) return "Accept"; if (/transfer|insur|share/.test(s)) return "Transfer"; if (/avoid|elimin|stop|terminat/.test(s)) return "Avoid"; return "Mitigate";
}
export function statusOf(v: unknown): string {
  const s = String(v == null ? "" : v).toLowerCase().trim();
  if (!s) return "Open"; if (/clos|done|complete|resolv/.test(s)) return "Closed"; if (/accept/.test(s)) return "Accepted"; if (/review|pending|submit|await/.test(s)) return "In review"; return "Open";
}
const okYear = (iso: string) => { const y = +iso.slice(0, 4); return y >= 1900 && y <= 2200; };
export function dateOf(v: unknown): string {
  const s = String(v == null ? "" : v).trim().slice(0, 64); if (!s) return "";
  let out = "";
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = parseFloat(s);
    if (n > 20000 && n < 80000) out = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 864e5).toISOString().slice(0, 10); // Excel serial
  }
  if (!out) {
    const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) out = m[1] + "-" + String(m[2]).padStart(2, "0") + "-" + String(m[3]).padStart(2, "0");
    else { const d = new Date(s); out = isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10); }
  }
  // positive validation: real calendar date in a sane range, otherwise dropped (source accepted any parseable string)
  return /^\d{4}-\d{2}-\d{2}$/.test(out) && !Number.isNaN(Date.parse(out)) && okYear(out) ? out : "";
}
/** Source impNeutral: a leading = + - @ tab CR gets an apostrophe so a formula is only ever plain text. */
export const neutral = (s: unknown) => { const x = String(s == null ? "" : s); return /^[=+\-@\t\r]/.test(x) ? "'" + x : x; };

/* ---- compute preview ---- */
export interface Apply { id: string; mode: "New" | "Update"; title: string; cat: string; owner: string; l: number; i: number; rl: number; ri: number; treat: string; status: string; due: string; controls: string }
export interface Parsed { row: number; result: "New" | "Update" | "Skip"; title: string; id: string; cat: string; owner: string; inh: number | ""; res: number | ""; notes: string; _apply?: Apply }
export interface Counts { total: number; nNew: number; nUpd: number; nWarn: number; nErr: number }

export function compute(g: Grid, map: Record<string, number>, conflict: "update" | "new"): { parsed: Parsed[]; counts: Counts } {
  const col = (k: string) => map[k];
  const colVals = (k: string) => { const ci = map[k]; return ci == null || ci < 0 ? [] : g.rows.map((r) => r[ci]); };
  const lMax = scaleMax(colVals("l")), iMax = scaleMax(colVals("i")), rlMax = scaleMax(colVals("rl")), riMax = scaleMax(colVals("ri"));
  const existing = new Set<string>(DATA.risks.map((r) => r.id)); const usedNew = new Set<string>(); let nextN = DATA.risks.length;
  const genId = () => { let id: string; do { nextN++; id = "RK-" + String(nextN).padStart(2, "0"); } while (existing.has(id) || usedNew.has(id)); usedNew.add(id); return id; };
  const out: Parsed[] = []; const counts: Counts = { total: 0, nNew: 0, nUpd: 0, nWarn: 0, nErr: 0 };
  g.rows.forEach((r, ri0) => {
    counts.total++;
    const get = (k: string) => { const c = col(k); return c == null || c < 0 ? "" : neutral(r[c]); };
    const title = clampText(get("title"), MAX_FIELD);
    if (!title) { out.push({ row: ri0 + 2, result: "Skip", title: "(no title)", id: "", cat: "", owner: "", inh: "", res: "", notes: "No risk title — row skipped" }); counts.nErr++; return; }
    const warns: string[] = []; let mode: "New" | "Update"; let id: string;
    let rawId = clampText(get("id"), 80);
    if (rawId && !ID_RE.test(rawId)) { warns.push("ID not valid (letters, digits, . _ - only), new ID assigned"); rawId = ""; }
    if (rawId && existing.has(rawId)) {
      if (conflict === "update") { mode = "Update"; id = rawId; }
      else { mode = "New"; id = genId(); warns.push("ID " + rawId + " exists; added as " + id); }
    } else if (rawId) { mode = "New"; id = rawId; existing.add(rawId); }
    else { mode = "New"; id = genId(); }
    let l = toFive(get("l"), lMax), i = toFive(get("i"), iMax);
    if (l == null) { l = 3; warns.push(col("l") >= 0 ? "likelihood not recognised, set 3" : "no likelihood, set 3"); }
    if (i == null) { i = 3; warns.push(col("i") >= 0 ? "impact not recognised, set 3" : "no impact, set 3"); }
    let rl = toFive(get("rl"), rlMax), riv = toFive(get("ri"), riMax);
    if (rl == null) rl = Math.max(1, l - 1); if (riv == null) riv = Math.max(1, i - 1);
    if (rl > l || riv > i) warns.push("residual above inherent");
    let cat = clampText(get("cat"), MAX_FIELD); const catN = CATS.find((c) => c.toLowerCase() === cat.toLowerCase());
    if (cat && !catN) warns.push('category "' + cat.slice(0, 60) + '" kept as Operational'); cat = catN || "Operational";
    const treat = treatOf(get("treat")), status = statusOf(get("status")), owner = clampText(get("owner"), MAX_FIELD) || "Unassigned", due = dateOf(get("due")), controls = clampText(get("controls"), MAX_FIELD);
    if (warns.length) counts.nWarn++; if (mode === "New") counts.nNew++; else counts.nUpd++;
    out.push({ row: ri0 + 2, result: mode, id, title, cat, owner, inh: l * i, res: rl * riv, notes: warns.join("; "), _apply: { id, mode, title, cat, owner, l, i, rl, ri: riv, treat, status, due, controls } });
  });
  return { parsed: out, counts };
}

/* ---- run import (mutates DATA; caller does wsLog is done here, then toast/bumpData) ---- */
export function applyImport(parsed: Parsed[], fileName: string, wsLog: (a: string, t: string, c?: string) => unknown): { nNew: number; nUpd: number } {
  let nNew = 0, nUpd = 0; const fn = clampText(fileName, 120);
  const today = () => nowStamp().slice(0, 10);
  parsed.filter((p) => p.result !== "Skip").forEach((p) => {
    const a = p._apply as Apply;
    const found = DATA.risks.find((x) => x.id === a.id);
    if (a.mode === "Update") {
      const r = found; if (!r) return; // source: silently skipped when the id is gone
      r.title = a.title; r.cat = a.cat; r.owner = a.owner; r.l = a.l; r.i = a.i; r.rl = a.rl; r.ri = a.ri;
      r.cl = Math.max(a.rl, a.l - 1); r.ci = Math.max(a.ri, a.i - 1); r.treat = a.treat; r.status = a.status === "Accepted" ? r.status : a.status;
      if (a.due) r.planned = a.due;
      if (a.controls) r.desc = clampText((r.desc ? r.desc + " · " : "") + "Existing controls: " + a.controls, 2000);
      r.reviewed = today();
      riskLog(r, "Updated by import (" + fn + ")"); nUpd++;
    } else {
      if (found) return; // never overwrite or duplicate an id that appeared after the preview was computed
      const st = a.status === "Accepted" ? "Open" : a.status;
      const r: any = { id: a.id, title: a.title, desc: a.controls ? "Existing controls: " + a.controls : "", cat: a.cat, owner: a.owner, l: a.l, i: a.i, cl: Math.max(a.rl, a.l - 1), ci: Math.max(a.ri, a.i - 1), rl: a.rl, ri: a.ri, treat: a.treat, status: st, review: "Draft", linked: [], imported: true, planned: a.due || "", identified: today(), reviewed: today() };
      riskNorm(r); r.review = "Draft"; r.status = st; riskLog(r, "Imported from " + fn); DATA.risks.push(r); nNew++;
    }
  });
  wsLog("risk.register.imported", nNew + " new, " + nUpd + " updated (" + fn + ")", "Risk");
  return { nNew, nUpd };
}
