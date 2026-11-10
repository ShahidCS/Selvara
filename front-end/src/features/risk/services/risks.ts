/* Risk register API stubs (see features/issues/services/issues.ts for the pattern). In mock mode they mutate the in-memory DATA exactly as the prototype did.
 * The real API MUST authorize every mutation server-side (edit vs approve vs accept) and enforce segregation of duties; the checks here are a demo. */
import { DATA } from "@/lib/data";
import { appStore } from "@/lib/store";
import { getMe, hashStr, wsLog } from "@/lib/audit";
import { approve as approveReq, getApproval, reject as rejectReq, requestApproval, sweepExpired, withdraw as withdrawReq, whyCannotApprove } from "@/lib/approvals";
import { SOD, SodError, assertNotSelf, assertRole, getActor, isMe } from "@/lib/sod";
import { type BoardEvidence, type BoardEvidenceInput, riskNeedsBoard, validateAcceptExpiry, validateBoardEvidence } from "@/lib/riskBoard";
import { csvCell, nowStamp } from "@/lib/format";
import { clampText, isIsoDate } from "@/lib/security";
import {
  ACCEPT_AUTH, ACCEPT_RANK, RISK_CATS, RISK_CSV_COLS, RISK_CSV_HEADERS, RISK_PARTIES, RISK_SCORE_FIELDS, RISK_SNAPSHOTS, RISK_TREATS,
  isoInDays, rband, riskAcceptState, riskCancelPending, riskCanApprove, riskCanEdit, riskCtrl, riskFindR, riskLog, riskNorm, riskNormAll, riskOpen, riskOpenActions,
  riskPriority, riskRevalidateAcceptance, sCur, sInh, sRes, todayIso,
} from "@/lib/risk";
import { apiFetch, viaApi } from "@/services/http";

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
/** Record the acting person as last editor (segregation of duties: the last editor can never accept, approve or close this risk). */
const touch = (r: any) => { r.lastEditedBy = getActor().name; };
const BOARD = "Board / CEO";
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
    riskNorm(r); r.review = "Draft"; touch(r); DATA.risks.push(r);
    return { ok: true, id };
  }, () => post<Res<{ id: string }>>("/risks", f));
}
export function setScore(id: string, field: string, val: unknown): Promise<Res<{ value: number; invalidated: string }>> {
  return viaApi<Res<{ value: number; invalidated: string }>>(() => {
    if (!edit()) return DENIED;
    const r = riskFindR(id); if (!r) return NOT_FOUND;
    if (!RISK_SCORE_FIELDS.includes(field)) return { ok: false, msg: "Invalid score field" };
    r[field] = score(val); r.reviewed = todayIso(); touch(r); riskLog(r, "Score updated (" + field + "=" + r[field] + ")");
    /* an acceptance only holds for the scores it was given on: re-check, and drop a pending acceptance whose evidence no longer matches */
    const invalidated = riskRevalidateAcceptance(r);
    if (r.pendingAcceptance && sRes(r) !== r.pendingAcceptance.score) riskCancelPending(r, "residual score changed to " + sRes(r) + " before the evidence was verified");
    return { ok: true, value: r[field] as number, invalidated: invalidated || "" };
  }, () => post<Res<{ value: number; invalidated: string }>>(`/risks/${enc(id)}/score`, { field, value: val }));
}
export function mapControl(id: string, cid: string): Promise<Res> {
  return viaApi<Res>(() => {
    if (!edit()) return DENIED;
    const r = riskFindR(id); if (!r) return NOT_FOUND;
    if (!cid || !riskCtrl(cid)) return { ok: false, msg: "Control not found" };
    r.linked = r.linked || [];
    if (r.linked.includes(cid)) return { ok: false, msg: "Control already mapped" };
    r.linked.push(cid); touch(r); riskLog(r, "Mapped control " + cid);
    return { ok: true };
  }, () => post<Res>(`/risks/${enc(id)}/controls`, { controlId: cid }));
}
export function unmapControl(id: string, cid: string): Promise<Res> {
  return viaApi<Res>(() => {
    if (!edit()) return DENIED;
    const r = riskFindR(id); if (!r) return NOT_FOUND;
    r.linked = (r.linked || []).filter((x: string) => x !== cid); touch(r); riskLog(r, "Unmapped control " + cid);
    return { ok: true };
  }, () => post<Res>(`/risks/${enc(id)}/controls/${enc(cid)}/delete`, {}));
}
export function toggleAction(id: string, ai: number): Promise<Res<{ done: boolean; text: string }>> {
  return viaApi<Res<{ done: boolean; text: string }>>(() => {
    if (!edit()) return DENIED;
    const r = riskFindR(id); if (!r || !r.actions || !r.actions[ai]) return NOT_FOUND;
    if (r.actions[ai].cancelled) return { ok: false, msg: "This action was cancelled." };
    r.actions[ai].done = !r.actions[ai].done; touch(r);
    if (r.actions.every((a: any) => a.done || a.cancelled)) {
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
    r.actions.push({ text: t, owner: clampText(a.owner, 100), due: isIsoDate(a.due) ? a.due : "", done: false }); touch(r);
    riskLog(r, "Action added: " + t);
    return { ok: true, text: t };
  }, () => post<Res<{ text: string }>>(`/risks/${enc(id)}/actions`, a));
}
export function submitRisk(id: string): Promise<Res> {
  return viaApi<Res>(() => {
    if (!edit()) return DENIED;
    const r = riskFindR(id); if (!r) return NOT_FOUND;
    if (!(r.linked && r.linked.length)) return { ok: false, msg: "Map at least one control before submitting" };
    r.review = "Submitted"; r.status = r.status === "Open" ? "In review" : r.status; r.submittedBy = getActor().name; touch(r); riskLog(r, "Submitted for approval");
    return { ok: true };
  }, () => post<Res>(`/risks/${enc(id)}/submit`, {}));
}
/** Approval is an authority action (company admin). Segregation of duties: the approver must not be the person who edited or submitted the risk (throws SodError). */
export function approveRisk(id: string): Promise<Res> {
  return viaApi<Res>(() => {
    if (!approve()) return DENIED;
    const r = riskFindR(id); if (!r) return NOT_FOUND;
    assertNotSelf("you edited or submitted this risk, so a different person must approve it", r.lastEditedBy, r.submittedBy);
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
export interface AcceptInput { by: string; why: string; until: string; comp: string; board?: BoardEvidenceInput }
/** Accept a risk. Residual <= 15: authority ladder (the Board / CEO rung is not available), effective at once.
 *  Residual > 15: Board approval evidence is mandatory; it is recorded here and becomes effective only after a SECOND person verifies it
 *  (approvals engine, kind "risk.board-evidence"). Throws SodError for segregation-of-duties / role failures. */
export function acceptRisk(id: string, f: AcceptInput): Promise<Res<{ pending: boolean; approvalId: string }>> {
  return viaApi<Res<{ pending: boolean; approvalId: string }>>(() => {
    if (!edit()) return DENIED;
    const r = riskFindR(id); if (!r) return NOT_FOUND;
    if (!riskOpen(r)) return { ok: false, msg: "This risk is already accepted or closed." };
    if (r.pendingAcceptance) return { ok: false, msg: "An acceptance is already awaiting evidence verification." };
    assertNotSelf("you own, edited or submitted this risk, so a different person must record its acceptance", r.owner, r.lastEditedBy, r.submittedBy);
    const why = clampText(f.why, 1000), comp = clampText(f.comp, 500), until = f.until;
    const sc = sRes(r); const me = getActor().name; const maxUntil = isoInDays(365);
    if (!why) return { ok: false, msg: "A rationale is required." };
    if (riskNeedsBoard(sc)) {
      assertRole("recording a Board-approved acceptance", "admin");
      const ev = validateBoardEvidence(f.board); if (!ev.ok) return { ok: false, msg: ev.msg };
      if (why.length < 20) return { ok: false, msg: "Give a reason of at least 20 characters." };
      const bad = validateAcceptExpiry(until); if (bad) return { ok: false, msg: bad };
      const e: BoardEvidence = ev.value as BoardEvidence;
      const ap = requestApproval({
        kind: "risk.board-evidence", title: "Verify Board evidence " + e.ref + " for " + r.id, subject: r.id, needs: 1, approverRoles: ["admin", "owner"],
        forbid: [r.owner, r.lastEditedBy, r.submittedBy].filter(Boolean), ttlHours: 72,
        payload: { riskId: r.id, ref: e.ref, date: e.date, body: e.body, minutes: e.minutes, residual: sc },
      });
      r.pendingAcceptance = { by: BOARD, at: todayIso(), until, note: why, comp, recordedBy: me, score: sc, board: e, approvalId: ap.id };
      riskLog(r, "Board evidence " + e.ref + " recorded for acceptance; awaiting verification (" + ap.id + ")");
      wsLog("risk.board-evidence.recorded", r.id + " — Board ref " + e.ref + " (" + e.date + ", " + e.body + "), approval " + ap.id, "Risk");
      return { ok: true, pending: true, approvalId: ap.id };
    }
    if (!(f.by in ACCEPT_RANK)) return { ok: false, msg: "Choose an accepting authority." };
    if (f.by === BOARD) return { ok: false, msg: "Board / CEO acceptance applies only above " + SOD.RISK_BOARD_THRESHOLD + " and needs Board approval evidence." };
    const need = ACCEPT_AUTH[rband(sc).name];
    if (ACCEPT_RANK[f.by] < ACCEPT_RANK[need]) return { ok: false, msg: "Residual rating needs at least " + need + " to accept." };
    if (until) { const bad = validateAcceptExpiry(until); if (bad) return { ok: false, msg: bad }; }
    r.status = "Accepted"; r.treat = "Accept";
    r.acceptance = { by: f.by, at: todayIso(), until: until || maxUntil, note: why, comp, recordedBy: me, score: sc };
    riskLog(r, "Risk accepted by " + f.by);
    wsLog("risk.accepted", r.id + " — " + f.by + " (residual " + sc + ", recorded by " + me + ")", "Risk");
    return { ok: true, pending: false };
  }, () => post<Res<{ pending: boolean; approvalId: string }>>(`/risks/${enc(id)}/accept`, f));
}
/** Make a verified Board acceptance effective (called when its approval is Approved). Idempotent. */
function finalizeBoardAcceptance(r: any): void {
  const p = r.pendingAcceptance; if (!p) return;
  const ap = getApproval(p.approvalId);
  if (sRes(r) !== p.score) { riskCancelPending(r, "residual score changed before the evidence was verified"); return; }
  const v = ap && ap.approvals[ap.approvals.length - 1];
  r.status = "Accepted"; r.treat = "Accept";
  r.acceptance = { ...p, board: { ...p.board, verifiedBy: v?.by || "", verifiedAt: v?.at ? v.at.slice(0, 10) : todayIso(), approvalId: p.approvalId } };
  delete r.pendingAcceptance;
  riskLog(r, "Board evidence " + p.board.ref + " verified by " + (v?.by || "second approver") + "; risk accepted");
  wsLog("risk.accepted", r.id + " — " + BOARD + " (Board ref " + p.board.ref + ", approval " + p.approvalId + ", recorded by " + p.recordedBy + ")", "Risk");
}
/** Why the current person cannot verify the evidence for this risk (null = may verify). For disabling buttons. */
export function boardVerifyBlock(r: any): string | null {
  const p = r.pendingAcceptance; if (!p) return "No evidence is waiting for verification.";
  const ap = getApproval(p.approvalId); if (!ap) return "Verification request not found.";
  return whyCannotApprove(ap);
}
/** Second person verifies (approve) or rejects the recorded Board evidence. Throws SodError. */
export function decideBoardEvidence(id: string, decision: "approve" | "reject", reasonIn: string): Promise<Res> {
  return viaApi<Res>(() => {
    const r = riskFindR(id); if (!r) return NOT_FOUND;
    const p = r.pendingAcceptance; if (!p) return { ok: false, msg: "No evidence is waiting for verification." };
    assertRole("verifying Board evidence", "admin", "owner");
    assertNotSelf("you recorded, own or last edited this risk, so you cannot verify its Board evidence", p.recordedBy, r.owner, r.lastEditedBy, r.submittedBy);
    const reason = clampText(reasonIn, 300); if (reason.length < 10) return { ok: false, msg: "Give a reason of at least 10 characters." };
    if (decision === "approve") {
      const ap = approveReq(p.approvalId, reason);           // engine: second person, approver role, not the requester or a forbidden person
      wsLog("risk.board-evidence.verified", r.id + " — Board ref " + p.board.ref + ", approval " + p.approvalId, "Risk");
      if (ap.status === "Approved") finalizeBoardAcceptance(r);
    } else {
      rejectReq(p.approvalId, reason);
      delete r.pendingAcceptance; riskLog(r, "Board evidence " + p.board.ref + " rejected: " + reason);
      wsLog("risk.board-evidence.rejected", r.id + " — Board ref " + p.board.ref + ", approval " + p.approvalId, "Risk");
    }
    return { ok: true };
  }, () => post<Res>(`/risks/${enc(id)}/board-evidence/decision`, { decision, reason: reasonIn }));
}
/** The recorder can withdraw evidence that is still awaiting verification. */
export function withdrawBoardEvidence(id: string): Promise<Res> {
  return viaApi<Res>(() => {
    const r = riskFindR(id); if (!r) return NOT_FOUND;
    const p = r.pendingAcceptance; if (!p) return { ok: false, msg: "No evidence is waiting for verification." };
    withdrawReq(p.approvalId);                                   // only the requester can withdraw (throws SodError)
    delete r.pendingAcceptance; riskLog(r, "Board evidence " + p.board.ref + " withdrawn by recorder");
    wsLog("risk.board-evidence.withdrawn", r.id + " — Board ref " + p.board.ref + ", approval " + p.approvalId, "Risk");
    return { ok: true };
  }, () => post<Res>(`/risks/${enc(id)}/board-evidence/withdraw`, {}));
}
/** Reconcile pending acceptances with their approval requests (approved elsewhere, rejected, withdrawn or expired). Safe to call repeatedly. */
export function syncBoardEvidence(): void {
  sweepExpired();
  DATA.risks.forEach((r: any) => {
    const p = r.pendingAcceptance; if (!p) return;
    const ap = getApproval(p.approvalId);
    if (!ap) return;
    if (ap.status === "Approved") finalizeBoardAcceptance(r);
    else if (ap.status !== "Pending") {
      delete r.pendingAcceptance; riskLog(r, "Board evidence " + p.board.ref + " " + ap.status.toLowerCase() + "; acceptance not effective");
      wsLog("risk.board-evidence." + ap.status.toLowerCase(), r.id + " — Board ref " + p.board.ref + ", approval " + p.approvalId, "Risk");
    }
  });
}
export function reopenRisk(id: string): Promise<Res> {
  return viaApi<Res>(() => {
    if (!edit()) return DENIED;
    const r = riskFindR(id); if (!r) return NOT_FOUND;
    r.status = "Open"; r.treat = "Mitigate"; delete r.acceptance; touch(r); riskLog(r, "Risk reopened");
    return { ok: true };
  }, () => post<Res>(`/risks/${enc(id)}/reopen`, {}));
}
/** Cancel a treatment action that is no longer needed (counts as handled for closing). Reason required. */
export function cancelAction(id: string, ai: number, whyIn: string): Promise<Res<{ text: string }>> {
  return viaApi<Res<{ text: string }>>(() => {
    if (!edit()) return DENIED;
    const r = riskFindR(id); if (!r || !r.actions || !r.actions[ai]) return NOT_FOUND;
    const a = r.actions[ai]; if (a.done || a.cancelled) return { ok: false, msg: "This action is already done or cancelled." };
    const why = clampText(whyIn, 300); if (why.length < 10) return { ok: false, msg: "Give a reason of at least 10 characters." };
    a.cancelled = true; a.cancelReason = why; touch(r); riskLog(r, "Action cancelled: " + a.text + " (" + why + ")");
    return { ok: true, text: String(a.text) };
  }, () => post<Res<{ text: string }>>(`/risks/${enc(id)}/actions/${ai}/cancel`, { reason: whyIn }));
}
/** Why the current person cannot close this risk (null = may close). Used by the UI and re-checked in closeRisk. */
export function closeBlock(r: any): string | null {
  const open = riskOpenActions(r);
  if (open.length) return "Close or cancel the open actions first.";
  if (r.lastEditedBy && isMe(r.lastEditedBy)) return "Segregation of duties: you last edited this risk, so a different person must close it.";
  if ((r.actions || []).length && isMe(r.owner)) return "Segregation of duties: you own this risk, so a different person must close it.";
  return null;
}
export function closeRisk(id: string, whyIn: string): Promise<Res> {
  return viaApi<Res>(() => {
    if (!edit()) return DENIED;
    const r = riskFindR(id); if (!r) return NOT_FOUND;
    if (riskOpenActions(r).length) throw new SodError("Close or cancel the open actions first.");
    assertNotSelf("you last edited this risk, so a different person must close it", r.lastEditedBy);
    if ((r.actions || []).length) assertNotSelf("you own this risk and it has treatment actions, so a different person must close it", r.owner);
    const why = clampText(whyIn, 300);
    if (r.pendingAcceptance) riskCancelPending(r, "risk closed");
    r.status = "Closed"; riskLog(r, "Risk closed" + (why ? ": " + why : ""));
    wsLog("risk.closed", r.id + (why ? " — " + why.slice(0, 80) : ""), "Risk");
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
      boardRef: (r.acceptance?.board || r.pendingAcceptance?.board)?.ref || "", boardDate: (r.acceptance?.board || r.pendingAcceptance?.board)?.date || "", acceptanceState: riskAcceptState(r),
    } as Record<string, unknown>));
    return [RISK_CSV_HEADERS.join(",")].concat(rows.map((r) => RISK_CSV_COLS.map((c) => csvCell(r[c])).join(","))).join("\r\n");
  }, () => apiFetch<string>("/risks/export"));
}
