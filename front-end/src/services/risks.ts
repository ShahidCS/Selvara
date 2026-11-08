/* Risk register API stubs (see services/issues.ts for the pattern). In mock mode they mutate the in-memory DATA exactly as the prototype did.
 * The real API MUST authorize every mutation server-side (edit vs approve vs accept) and enforce segregation of duties; the checks here are a demo. */
import { DATA } from "@/lib/data";
import { appStore } from "@/lib/store";
import { getMe, hashStr } from "@/lib/audit";
import { csvCell, nowStamp } from "@/lib/format";
import { clampText, isIsoDate } from "@/lib/security";
import {
  ACCEPT_AUTH, ACCEPT_RANK, RISK_CATS, RISK_CSV_COLS, RISK_CSV_HEADERS, RISK_PARTIES, RISK_SCORE_FIELDS, RISK_SNAPSHOTS, RISK_TREATS,
  isoInDays, rband, riskCanApprove, riskCanEdit, riskCtrl, riskFindR, riskLog, riskNorm, riskNormAll, riskPriority, sCur, sInh, sRes, todayIso,
} from "@/lib/risk";
import { apiFetch, viaApi } from "./http";

/* eslint-disable @typescript-eslint/no-explicit-any */
/* tsconfig is not strict, so a plain flag (not a discriminated union) is used: check `res.ok`, then read the fields. */
export type Res<T = object> = { ok: boolean; msg?: string } & Partial<T>;
const DENIED = { ok: false, msg: "You do not have permission to do this" };
const NOT_FOUND = { ok: false, msg: "Risk not found" };
const post = <T,>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
const enc = encodeURIComponent;
const role = () => appStore.get().role;
const edit = () => riskCanEdit(role());
const approve = () => riskCanApprove(role());
const score = (v: unknown) => Math.max(1, Math.min(5, Math.trunc(Number(v)) || 1)); // 1..5 int (source: parseInt || 1)

export interface RiskInput { title: string; desc: string; cat: string; owner: string; l: number; i: number; rl: number; ri: number; treat: string }

export function createRisk(f: RiskInput): Promise<Res<{ id: string }>> {
  return viaApi<Res<{ id: string }>>(() => {
    if (!edit()) return DENIED;
    const title = clampText(f.title, 200); if (!title) return { ok: false, msg: "Risk title is required." };
    const l = score(f.l), i = score(f.i), rl = score(f.rl), ri = score(f.ri);
    let n = DATA.risks.length + 1, id = "RK-" + String(n).padStart(2, "0");
    while (DATA.risks.some((x) => x.id === id)) { n++; id = "RK-" + String(n).padStart(2, "0"); } // source could collide after imports
    const r: any = {
      id, status: "Open", review: "Draft", linked: [], identified: todayIso(), reviewed: todayIso(),
      title, desc: clampText(f.desc, 1000), cat: RISK_CATS.includes(f.cat) ? f.cat : RISK_CATS[0], owner: clampText(f.owner, 100) || "Unassigned",
      l, i, rl, ri, cl: Math.max(rl, l - 1), ci: Math.max(ri, i - 1), treat: RISK_TREATS.includes(f.treat) ? f.treat : "Mitigate",
    };
    riskNorm(r); r.review = "Draft"; DATA.risks.push(r);
    return { ok: true, id };
  }, () => post<Res<{ id: string }>>("/risks", f));
}
export function setScore(id: string, field: string, val: unknown): Promise<Res<{ value: number }>> {
  return viaApi<Res<{ value: number }>>(() => {
    if (!edit()) return DENIED;
    const r = riskFindR(id); if (!r) return NOT_FOUND;
    if (!RISK_SCORE_FIELDS.includes(field)) return { ok: false, msg: "Invalid score field" };
    r[field] = score(val); r.reviewed = todayIso(); riskLog(r, "Score updated (" + field + "=" + r[field] + ")");
    return { ok: true, value: r[field] as number };
  }, () => post<Res<{ value: number }>>(`/risks/${enc(id)}/score`, { field, value: val }));
}
export function mapControl(id: string, cid: string): Promise<Res> {
  return viaApi<Res>(() => {
    if (!edit()) return DENIED;
    const r = riskFindR(id); if (!r) return NOT_FOUND;
    if (!cid || !riskCtrl(cid)) return { ok: false, msg: "Control not found" };
    r.linked = r.linked || [];
    if (r.linked.includes(cid)) return { ok: false, msg: "Control already mapped" };
    r.linked.push(cid); riskLog(r, "Mapped control " + cid);
    return { ok: true };
  }, () => post<Res>(`/risks/${enc(id)}/controls`, { controlId: cid }));
}
export function unmapControl(id: string, cid: string): Promise<Res> {
  return viaApi<Res>(() => {
    if (!edit()) return DENIED;
    const r = riskFindR(id); if (!r) return NOT_FOUND;
    r.linked = (r.linked || []).filter((x: string) => x !== cid); riskLog(r, "Unmapped control " + cid);
    return { ok: true };
  }, () => post<Res>(`/risks/${enc(id)}/controls/${enc(cid)}/delete`, {}));
}
export function toggleAction(id: string, ai: number): Promise<Res<{ done: boolean; text: string }>> {
  return viaApi<Res<{ done: boolean; text: string }>>(() => {
    if (!edit()) return DENIED;
    const r = riskFindR(id); if (!r || !r.actions || !r.actions[ai]) return NOT_FOUND;
    r.actions[ai].done = !r.actions[ai].done;
    if (r.actions.every((a: any) => a.done)) {
      r.actions.forEach((a: any) => { if (!a.at) a.at = todayIso(); });
      riskLog(r, "All treatment actions complete; exposure at residual");
    }
    return { ok: true, done: !!r.actions[ai].done, text: String(r.actions[ai].text) };
  }, () => post<Res<{ done: boolean; text: string }>>(`/risks/${enc(id)}/actions/${ai}/toggle`, {}));
}
export function addAction(id: string, a: { text: string; owner: string; due: string }): Promise<Res<{ text: string }>> {
  return viaApi<Res<{ text: string }>>(() => {
    if (!edit()) return DENIED;
    const r = riskFindR(id); if (!r) return NOT_FOUND;
    const t = clampText(a.text, 300); if (!t) return { ok: false, msg: "Action is required." };
    r.actions = r.actions || [];
    r.actions.push({ text: t, owner: clampText(a.owner, 100), due: isIsoDate(a.due) ? a.due : "", done: false });
    riskLog(r, "Action added: " + t);
    return { ok: true, text: t };
  }, () => post<Res<{ text: string }>>(`/risks/${enc(id)}/actions`, a));
}
export function submitRisk(id: string): Promise<Res> {
  return viaApi<Res>(() => {
    if (!edit()) return DENIED;
    const r = riskFindR(id); if (!r) return NOT_FOUND;
    if (!(r.linked && r.linked.length)) return { ok: false, msg: "Map at least one control before submitting" };
    r.review = "Submitted"; r.status = r.status === "Open" ? "In review" : r.status; riskLog(r, "Submitted for approval");
    return { ok: true };
  }, () => post<Res>(`/risks/${enc(id)}/submit`, {}));
}
/** Approval is an authority action (company admin). Segregation of duties (approver != submitter) is NOT checked in the prototype: the API must. */
export function approveRisk(id: string): Promise<Res> {
  return viaApi<Res>(() => {
    if (!approve()) return DENIED;
    const r = riskFindR(id); if (!r) return NOT_FOUND;
    r.review = "Approved"; if (r.status === "In review") r.status = "Open"; riskLog(r, "Approved");
    return { ok: true };
  }, () => post<Res>(`/risks/${enc(id)}/approve`, {}));
}
export function requestChanges(id: string, noteIn: string): Promise<Res> {
  return viaApi<Res>(() => {
    if (!approve()) return DENIED;
    const note = clampText(noteIn, 500); if (!note) return { ok: false, msg: "A note is required to request changes" };
    const r = riskFindR(id); if (!r) return NOT_FOUND;
    r.review = "Changes requested"; riskLog(r, "Changes requested: " + note);
    return { ok: true };
  }, () => post<Res>(`/risks/${enc(id)}/request-changes`, { note: noteIn }));
}
export function acceptRisk(id: string, f: { by: string; why: string; until: string; comp: string }): Promise<Res> {
  return viaApi<Res>(() => {
    if (!edit()) return DENIED;
    const r = riskFindR(id); if (!r) return NOT_FOUND;
    const why = clampText(f.why, 1000), comp = clampText(f.comp, 500), by = f.by, until = f.until;
    const need = ACCEPT_AUTH[rband(sRes(r)).name];
    if (!why) return { ok: false, msg: "A rationale is required." };
    if (!(by in ACCEPT_RANK)) return { ok: false, msg: "Choose an accepting authority." };
    if (ACCEPT_RANK[by] < ACCEPT_RANK[need]) return { ok: false, msg: "Residual rating needs at least " + need + " to accept." };
    if (until && !isIsoDate(until)) return { ok: false, msg: "Enter a valid date." }; // added: positive date check
    const maxUntil = isoInDays(365);
    if (until && until > maxUntil) return { ok: false, msg: "Acceptance cannot exceed 12 months (" + maxUntil + ")." };
    r.status = "Accepted"; r.treat = "Accept"; r.acceptance = { by, at: todayIso(), until: until || maxUntil, note: why, comp };
    riskLog(r, "Risk accepted by " + by);
    return { ok: true };
  }, () => post<Res>(`/risks/${enc(id)}/accept`, f));
}
export function reopenRisk(id: string): Promise<Res> {
  return viaApi<Res>(() => {
    if (!edit()) return DENIED;
    const r = riskFindR(id); if (!r) return NOT_FOUND;
    r.status = "Open"; r.treat = "Mitigate"; delete r.acceptance; riskLog(r, "Risk reopened");
    return { ok: true };
  }, () => post<Res>(`/risks/${enc(id)}/reopen`, {}));
}
export function closeRisk(id: string, whyIn: string): Promise<Res> {
  return viaApi<Res>(() => {
    if (!edit()) return DENIED;
    const r = riskFindR(id); if (!r) return NOT_FOUND;
    const why = clampText(whyIn, 300);
    r.status = "Closed"; riskLog(r, "Risk closed" + (why ? ": " + why : ""));
    return { ok: true };
  }, () => post<Res>(`/risks/${enc(id)}/close`, { reason: whyIn }));
}

/* ---- interested parties (module-level list, as in the prototype) ---- */
export function linkParty(pi: number, rid: string): Promise<Res<{ party: string }>> {
  return viaApi<Res<{ party: string }>>(() => {
    if (!edit()) return DENIED;
    const p = RISK_PARTIES[pi]; if (!p || !rid) return { ok: false, msg: "Not found" };
    if (!riskFindR(rid)) return NOT_FOUND;
    if (!p.links.includes(rid)) p.links.push(rid);
    return { ok: true, party: p.party };
  }, () => post<Res<{ party: string }>>(`/risk-parties/${pi}/links`, { riskId: rid }));
}
export function unlinkParty(pi: number, rid: string): Promise<Res<{ party: string }>> {
  return viaApi<Res<{ party: string }>>(() => {
    if (!edit()) return DENIED;
    const p = RISK_PARTIES[pi]; if (!p) return { ok: false, msg: "Not found" };
    p.links = p.links.filter((x) => x !== rid);
    return { ok: true, party: p.party };
  }, () => post<Res<{ party: string }>>(`/risk-parties/${pi}/links/${enc(rid)}/delete`, {}));
}
export function addParty(f: { party: string; req: string; loc: string }): Promise<Res<{ party: string }>> {
  return viaApi<Res<{ party: string }>>(() => {
    if (!edit()) return DENIED;
    const p = clampText(f.party, 200); if (!p) return { ok: false, msg: "Party name required" };
    RISK_PARTIES.push({ party: p, req: clampText(f.req, 500) || "—", loc: clampText(f.loc, 100) || "Global", links: [] });
    return { ok: true, party: p };
  }, () => post<Res<{ party: string }>>("/risk-parties", f));
}

/* ---- governance snapshots (admin only, like the source) ---- */
export function takeSnapshot(scopeIn: string): Promise<Res<{ count: number; scope: string; hash: string }>> {
  return viaApi<Res<{ count: number; scope: string; hash: string }>>(() => {
    if (!approve()) return DENIED;
    const scope = scopeIn === "approved" ? "approved" : "all";
    const pool = scope === "approved" ? DATA.risks.filter((r) => r.review === "Approved") : DATA.risks;
    const payload = pool.map((r) => [r.id, sInh(r), sCur(r), sRes(r), r.treat, r.status, r.review, r.reviewed].join("|")).join("\n");
    const hash = (hashStr(payload) + hashStr(payload.split("").reverse().join(""))).slice(0, 12);
    const inAudit = !!DATA.audits && DATA.audits.some((a) => a.stage === "Fieldwork" || a.stage === "Planned");
    RISK_SNAPSHOTS.unshift({ id: "RS-" + String(RISK_SNAPSHOTS.length + 1).padStart(3, "0"), at: nowStamp(), count: pool.length, scope: scope === "approved" ? "Approved risks" : "All risks", hash, by: getMe().name, shared: inAudit });
    return { ok: true, count: pool.length, scope, hash };
  }, () => post<Res<{ count: number; scope: string; hash: string }>>("/risks/snapshots", { scope: scopeIn }));
}

/** CSV text of the whole register (every cell through csvCell: formula-injection guard). */
export function exportRegisterCsv(): Promise<string> {
  return viaApi<string>(() => {
    riskNormAll();
    const rows = DATA.risks.map((r) => ({
      id: r.id, title: r.title, cat: r.cat, team: r.team, jur: r.jur, owner: r.owner, l: r.l, i: r.i, cl: r.cl, ci: r.ci, rl: r.rl, ri: r.ri,
      inherentScore: sInh(r), currentScore: sCur(r), residualScore: sRes(r), rating: rband(sCur(r)).name, priority: riskPriority(r),
      treat: r.treat, status: r.status, review: r.review, identified: r.identified, reviewed: r.reviewed,
    } as Record<string, unknown>));
    return [RISK_CSV_HEADERS.join(",")].concat(rows.map((r) => RISK_CSV_COLS.map((c) => csvCell(r[c])).join(","))).join("\r\n");
  }, () => apiFetch<string>("/risks/export"));
}
