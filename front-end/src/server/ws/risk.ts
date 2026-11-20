/* Server-only. The risk register on the server (production programme group 3; inventory group 3, section 1): risks with their review workflow,
   scores, mapped controls, treatment actions, acceptance on the ISO/IEC 27005 ladder, Board-approved acceptance above 15 verified by a second
   person (four-eyes request `risk.board-evidence`), closing, interested parties, register snapshots and the import of a register (an import
   that changes existing risks waits for a second admin, request `risk.import`). People are compared by user id. Deliberate differences from the
   demonstration, decided for production: approve and request changes only on a submitted risk, and requesting changes returns the risk to Open;
   submit only from a draft; close only an open risk; reopen only an accepted one; an import never sets a status (the workflow does) and never
   creates a closed or accepted risk; a snapshot keeps the frozen register and a SHA-256 seal; parties have ids, link only existing risks and
   are not duplicated; an acceptance that runs out is recorded once and its owner told. */
import { createHash } from "node:crypto";
import { approvalBlock, reasonBlock } from "@/lib/rules";
import { validateAcceptExpiry, validateBoardEvidence } from "@/lib/riskBoard";
import {
  RISK_BOARD_TTL_H, RISK_CATEGORIES, RISK_CAT_TEAM, RISK_IMPORT_MAX_ROWS, RISK_IMPORT_TTL_H, RISK_SCORES, RISK_TREATMENTS, isoDayOf,
  riskAcceptRoleBlock, riskAcceptSodBlock, riskBand, riskCloseBlock, riskCloseRoleBlock, riskDecideBlock, riskEditBlock, riskLadderBlock, riskScore, riskSubmitBlock, roleBlock,
} from "@/lib/rulesWs";
import type { Deps } from "../types";
import { approvalsView, invalid, memberRef, membersOf, missing, modAllowed, ok, refuse, str, sweepApprovals, txt, wsRoute, type WsHelpers } from "./common";
import { WsConflict, type Actor, type Rec, type WsTx } from "./store";

/** A member who may own risk work: someone whose role opens the risk register or My Work (never a vendor or viewer account). */
export async function workOwner(d: Deps, a: Actor, v: { id?: unknown; name?: unknown }, mod: string, fallbackSelf = true) {
  const m = await memberRef(d, a, v, fallbackSelf);
  const role = (await membersOf(d, a)).find((x) => x.id === m.id)?.role ?? "";
  if (!modAllowed(role, mod) && !modAllowed(role, "work")) invalid("Choose a member whose role can work on this.");
  return m;
}

export interface RiskAction { text: string; owner: string; ownerId?: string; due: string; done: boolean; cancelled?: boolean; cancelReason?: string; at?: string }
export interface Acceptance {
  by: string; at: string; until: string; note: string; comp: string; recordedBy: string; recordedById: string; score: number;
  board?: { ref: string; date: string; body: string; minutes: string; verifiedBy?: string; verifiedById?: string; verifiedAt?: string; approvalId?: string };
  approvalId?: string; expiredLogged?: boolean; invalidatedAt?: string; invalidatedReason?: string;
}
export interface Risk {
  id: string; title: string; desc: string; cat: string; team: string; jur: string; register: string; owner: string; ownerId: string;
  l: number; i: number; cl: number; ci: number; rl: number; ri: number; status: "Open" | "In review" | "Accepted" | "Closed"; treat: string;
  review: "Draft" | "Submitted" | "Approved" | "Changes requested"; linked: string[]; identified: string; reviewed: string;
  history: { ts: string; by: string; a: string }[]; actions: RiskAction[]; planned?: string;
  acceptance?: Acceptance; pendingAcceptance?: Acceptance; invalidatedAcceptance?: Acceptance;
  lastEditedBy?: string; lastEditedById?: string; submittedBy?: string; submittedById?: string; imported?: boolean;
}
export interface RiskParty { id: string; party: string; req: string; loc: string; links: string[] }
export interface RiskSnapshot { id: string; at: string; count: number; scope: string; hash: string; sha256: string; by: string; byId: string; shared: boolean; content: unknown[] }
interface ImportRow { id: string; title: string; cat: string; owner: string; l: number; i: number; rl: number; ri: number; treat: string; status: string; due: string; controls: string }
interface StagedImport { id: string; fileName: string; rows: ImportRow[]; nNew: number; nUpd: number; importer: string; importerId: string; approvalId: string; applied: boolean }

export const RISK_KINDS = ["risk.board-evidence", "risk.import"];
const BOARD = "Board / CEO";
const sRes = (r: Risk) => r.rl * r.ri;
const isOpen = (r: Risk) => r.status !== "Accepted" && r.status !== "Closed";
const openActions = (r: Risk) => (r.actions ?? []).filter((a) => !a.done && !a.cancelled);
const BANDS = ["Low", "Medium", "High", "Extreme"];
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isIso = (v: string) => ISO.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z"));
const neutral = (s: string) => (/^[=+\-@\t\r]/.test(s) ? "'" + s : s);

async function load(t: WsTx, id: string): Promise<Rec<Risk>> { return (await t.get<Risk>("risk", str(id, 40))) ?? missing("Risk"); }
const log = (t: WsTx, r: Risk, a: string, system = false) => { (r.history ??= []).push({ ts: isoDayOf(t.now), by: system ? "System" : t.actor.name, a: a.slice(0, 500) }); };
const touch = (t: WsTx, r: Risk) => { r.lastEditedBy = t.actor.name; r.lastEditedById = t.actor.id; };
const save = (t: WsTx, rec: Rec<Risk>) => t.update("risk", rec.id, rec.data, rec.version);

/** The highest band index an acceptance covers: the band it was accepted at. */
const capIdx = (acc: Acceptance) => BANDS.indexOf(riskBand(acc.score));
/** After a score change: an acceptance that no longer holds goes away (kept as `invalidatedAcceptance`) and the risk is Open again. */
async function revalidate(t: WsTx, r: Risk): Promise<string | null> {
  if (r.status !== "Accepted" || !r.acceptance) return null;
  const acc = r.acceptance; const sc = sRes(r); let why = "";
  if (BANDS.indexOf(riskBand(sc)) > capIdx(acc)) why = `residual rose to ${riskBand(sc)} (${sc}), above the accepted band`;
  else if (sc > 15 && !acc.board) why = `residual ${sc} is above 15 and has no Board approval evidence`;
  if (!why) return null;
  r.invalidatedAcceptance = { ...acc, invalidatedAt: isoDayOf(t.now), invalidatedReason: why };
  delete r.acceptance; r.status = "Open"; r.treat = "Mitigate";
  log(t, r, "Acceptance invalidated: " + why);
  await t.audit("risk.acceptance.invalidated", `${r.id}: ${why}${acc.board ? ` (Board ref ${acc.board.ref})` : ""}`, "Risk");
  return why;
}
/** Drops an acceptance waiting for evidence verification and withdraws its request. */
async function cancelPending(t: WsTx, r: Risk, why: string) {
  const p = r.pendingAcceptance; if (!p) return;
  const a = p.approvalId ? await t.approval(p.approvalId, RISK_KINDS) : null;
  if (a && a.status === "Pending") await t.setApproval(a.id, "Withdrawn", why.slice(0, 300));
  delete r.pendingAcceptance; log(t, r, "Pending acceptance cancelled: " + why);
  await t.audit("risk.acceptance.pending_cancelled", `${r.id}: ${why} (${p.board?.ref ?? ""}, ${p.approvalId ?? ""})`, "Risk");
}
function finalize(t: WsTx, r: Risk, by: { id: string; name: string }) {
  const p = r.pendingAcceptance!;
  r.status = "Accepted"; r.treat = "Accept";
  r.acceptance = { ...p, board: { ...p.board!, verifiedBy: by.name, verifiedById: by.id, verifiedAt: isoDayOf(t.now), approvalId: p.approvalId } };
  delete r.pendingAcceptance;
  log(t, r, `Board evidence ${p.board!.ref} verified by ${by.name}; risk accepted`);
}

/** Requests that ran out, pending acceptances whose request ended elsewhere, staged imports that ended, and acceptances past their date. */
export async function sweepRisk(t: WsTx) {
  await sweepApprovals(t, RISK_KINDS);
  const aps = await t.approvals(RISK_KINDS); const today = isoDayOf(t.now);
  for (const rec of await t.list<Risk>("risk")) {
    const r = rec.data; let changed = false;
    const p = r.pendingAcceptance;
    if (p) {
      const a = aps.find((x) => x.id === p.approvalId);
      const st = !a ? "Withdrawn" : a.status === "Pending" && a.expiresAt <= t.now ? "Expired" : a.status;
      if (st !== "Pending" && st !== "Approved") {
        delete r.pendingAcceptance; changed = true;
        log(t, r, `Board evidence ${p.board?.ref} ${st.toLowerCase()}; acceptance not effective`, true);
        await t.audit(`risk.board-evidence.${st.toLowerCase()}`, `${r.id} — Board ref ${p.board?.ref}, approval ${p.approvalId}`, "Risk", true);
      }
    }
    if (r.status === "Accepted" && r.acceptance && !r.acceptance.expiredLogged && r.acceptance.until < today) {
      r.acceptance.expiredLogged = true; changed = true;
      log(t, r, `Acceptance expired on ${r.acceptance.until}; review the risk and accept it again or reopen it`, true);
      await t.audit("risk.acceptance.expired", `${r.id}: accepted by ${r.acceptance.by} until ${r.acceptance.until}`, "Risk", true);
      if (r.ownerId) await t.notify(r.ownerId, `The acceptance of risk ${r.id} ${r.title.slice(0, 80)} expired on ${r.acceptance.until}. Review it.`);
    }
    if (changed) await save(t, rec);
  }
  for (const rec of await t.list<StagedImport>("risk-import")) {
    const x = rec.data; if (x.applied) continue;
    const a = aps.find((y) => y.id === x.approvalId);
    if (!a || (a.status !== "Pending" && a.status !== "Approved") || a.expiresAt <= t.now && a.status === "Pending") { await t.remove("risk-import", rec.id, rec.version); }
  }
}

/** The register as the screens read it. */
export async function riskData(d: Deps, t: WsTx) {
  await sweepRisk(t);
  const names = new Map((await membersOf(d, t.actor)).map((m) => [m.id, m.name]));
  const snapshots = (await t.list<RiskSnapshot>("risk-snapshot")).map((x) => { const { content: _c, ...s } = x.data; void _c; return s; }).reverse();
  return {
    risks: (await t.list<Risk>("risk")).map((x) => x.data),
    parties: (await t.list<RiskParty>("risk-party")).map((x) => x.data),
    snapshots, approvals: await approvalsView(t, RISK_KINDS, names),
  };
}

function newRisk(t: WsTx, id: string, f: { title: string; desc: string; cat: string; owner: { id: string; name: string }; l: number; i: number; rl: number; ri: number; treat: string }): Risk {
  const today = isoDayOf(t.now);
  return {
    id, title: f.title, desc: f.desc, cat: f.cat, team: RISK_CAT_TEAM[f.cat] ?? "Operations", jur: "Global", register: "Information Security", owner: f.owner.name, ownerId: f.owner.id,
    l: f.l, i: f.i, rl: f.rl, ri: f.ri, cl: Math.max(f.rl, f.l - 1), ci: Math.max(f.ri, f.i - 1), status: "Open", treat: f.treat, review: "Draft", linked: [],
    identified: today, reviewed: today, history: [], actions: [], lastEditedBy: t.actor.name, lastEditedById: t.actor.id,
  };
}
const nextRiskId = async (t: WsTx) => { for (;;) { const id = `RK-${String(await t.next("risk", 0)).padStart(2, "0")}`; if (!(await t.get("risk", id))) return id; } };

/** Applies an import's rows (re-validated on the server) as `editor`. Existing ids update, others are new; an import never sets a status. */
async function applyRows(t: WsTx, rows: ImportRow[], fileName: string, editor: { id: string; name: string }, members: { id: string; name: string }[]) {
  let nNew = 0, nUpd = 0; const today = isoDayOf(t.now);
  const ownerOf = (name: string) => { const hits = members.filter((m) => m.name.toLowerCase() === name.toLowerCase()); return hits.length === 1 ? hits[0] : null; };
  for (const a of rows) {
    const rec = a.id ? await t.get<Risk>("risk", a.id) : null;
    if (rec) {
      const r = rec.data; const o = a.owner ? ownerOf(a.owner) : null;
      r.title = a.title; r.cat = a.cat; r.l = a.l; r.i = a.i; r.rl = a.rl; r.ri = a.ri; r.cl = Math.max(a.rl, a.l - 1); r.ci = Math.max(a.ri, a.i - 1);
      if (o) { r.owner = o.name; r.ownerId = o.id; }
      if (r.status !== "Accepted") r.treat = a.treat;
      if (a.status && a.status !== r.status) log(t, r, `Import asked for status ${a.status}; status kept (use the workflow to change it)`);
      r.lastEditedBy = editor.name; r.lastEditedById = editor.id;
      if (a.due) r.planned = a.due;
      if (a.controls) r.desc = ((r.desc ? r.desc + " · " : "") + "Existing controls: " + a.controls).slice(0, 2000);
      r.reviewed = today; log(t, r, `Updated by import (${fileName})`);
      await revalidate(t, r);
      if (r.pendingAcceptance && sRes(r) !== r.pendingAcceptance.score) await cancelPending(t, r, "residual score changed by import");
      await save(t, rec); nUpd++;
    } else {
      const id = a.id && ID_RE.test(a.id) ? a.id : await nextRiskId(t);
      if (await t.get("risk", id)) continue;
      const o = (a.owner && ownerOf(a.owner)) || { id: "", name: "Unassigned" };
      const r = newRisk(t, id, { title: a.title, desc: a.controls ? "Existing controls: " + a.controls : "", cat: a.cat, owner: o, l: a.l, i: a.i, rl: a.rl, ri: a.ri, treat: a.treat === "Accept" ? "Mitigate" : a.treat });
      r.imported = true; r.lastEditedBy = editor.name; r.lastEditedById = editor.id; if (a.due) r.planned = a.due;
      log(t, r, `Imported from ${fileName}`);
      await t.insert("risk", id, r); nNew++;
    }
  }
  await t.audit("risk.register.imported", `${nNew} new, ${nUpd} updated (${fileName})`, "Risk");
  return { nNew, nUpd };
}
/** One imported row, checked again: lengths, enums, 1..5 scores, a real date, a valid id. */
function cleanRow(x: Record<string, unknown>): ImportRow | null {
  const title = neutral(txt(x.title, 500)); if (!title) return null;
  const cat = RISK_CATEGORIES.find((c) => c.toLowerCase() === txt(x.cat, 60).toLowerCase()) ?? "Operational";
  const treat = (RISK_TREATMENTS as readonly string[]).includes(String(x.treat)) ? String(x.treat) : "Mitigate";
  const id = txt(x.id, 40); const due = txt(x.due, 10);
  return {
    id: ID_RE.test(id) ? id : "", title, cat, owner: neutral(txt(x.owner, 100)), l: riskScore(x.l), i: riskScore(x.i), rl: riskScore(x.rl), ri: riskScore(x.ri), treat,
    status: ["Open", "In review", "Accepted", "Closed"].includes(String(x.status)) ? String(x.status) : "", due: isIso(due) && due >= "1900-01-01" && due <= "2200-12-31" ? due : "", controls: neutral(txt(x.controls, 500)),
  };
}

export function riskRoutes(h: WsHelpers) {
  const tx = <T,>(d: Deps, c: { actor: Actor }, w: (t: WsTx) => Promise<T>) => d.ws.tx(c.actor, d.now(), w);
  /** A change by someone who may edit risks, on one risk, in one unit of work. */
  const edit = (fn: (d: Deps, t: WsTx, rec: Rec<Risk>, body: Record<string, unknown>, path: string[]) => Promise<unknown>) => wsRoute(h, "risk", async (d, r, c) => {
    refuse(riskEditBlock(c.actor.role));
    return tx(d, c, async (t) => { await sweepRisk(t); const rec = await load(t, r.path[2]); const out = await fn(d, t, rec, r.body, r.path); return ok({ ok: true, ...(out as object) }); });
  });

  /* reading also records expiries; when two people load at the same moment one of them retries once instead of seeing a conflict */
  const data = wsRoute(h, "risk", async (d, _r, c) => {
    try { return ok(await tx(d, c, (t) => riskData(d, t))); }
    catch (e) { if (!(e instanceof WsConflict)) throw e; return ok(await tx(d, c, (t) => riskData(d, t))); }
  });
  const create = wsRoute(h, "risk", async (d, r, c) => {
    refuse(riskEditBlock(c.actor.role));
    const title = txt(r.body.title, 200); if (!title) invalid("Risk title is required.");
    const owner = await workOwner(d, c.actor, { id: r.body.ownerId, name: r.body.owner }, "risk");
    return tx(d, c, async (t) => {
      const id = await nextRiskId(t);
      const cat = (RISK_CATEGORIES as readonly string[]).includes(String(r.body.cat)) ? String(r.body.cat) : RISK_CATEGORIES[0];
      const treat = (RISK_TREATMENTS as readonly string[]).includes(String(r.body.treat)) ? String(r.body.treat) : "Mitigate";
      const risk = newRisk(t, id, { title, desc: txt(r.body.desc, 1000), cat, owner, l: riskScore(r.body.l), i: riskScore(r.body.i), rl: riskScore(r.body.rl), ri: riskScore(r.body.ri), treat });
      log(t, risk, "Risk identified and entered");
      await t.insert("risk", id, risk);
      await t.audit("risk.created", `${id} ${title}`, "Risk");
      if (owner.id !== t.actor.id) await t.notify(owner.id, `${t.actor.name} made you the owner of risk ${id} ${title.slice(0, 80)}.`);
      return ok({ ok: true, id });
    });
  });
  const scoreR = edit(async (_d, t, rec, b) => {
    const r = rec.data; const field = str(b.field, 4);
    if (!(RISK_SCORES as readonly string[]).includes(field)) invalid("Invalid score field");
    const v = riskScore(b.value); (r as unknown as Record<string, number>)[field] = v;
    r.reviewed = isoDayOf(t.now); touch(t, r); log(t, r, `Score updated (${field}=${v})`);
    const invalidated = await revalidate(t, r);
    if (r.pendingAcceptance && sRes(r) !== r.pendingAcceptance.score) await cancelPending(t, r, `residual score changed to ${sRes(r)} before the evidence was verified`);
    await save(t, rec); await t.audit("risk.scored", `${r.id} ${field}=${v}`, "Risk");
    return { value: v, invalidated: invalidated ?? "" };
  });
  const mapC = edit(async (_d, t, rec, b) => {
    const r = rec.data; const cid = str(b.controlId, 40);
    if (!cid || !(await t.get("control", cid))) invalid("Control not found");
    if ((r.linked ??= []).includes(cid)) invalid("Control already mapped");
    r.linked.push(cid); touch(t, r); log(t, r, "Mapped control " + cid); await save(t, rec);
    await t.audit("risk.control.mapped", `${r.id} ← ${cid}`, "Risk");
  });
  const unmapC = edit(async (_d, t, rec, _b, p) => {
    const r = rec.data; const cid = str(p[4], 40);
    if (!(r.linked ?? []).includes(cid)) invalid("That control is not mapped.");
    r.linked = r.linked.filter((x) => x !== cid); touch(t, r); log(t, r, "Unmapped control " + cid); await save(t, rec);
    await t.audit("risk.control.unmapped", `${r.id} ✕ ${cid}`, "Risk");
  });
  const addAct = edit(async (d, t, rec, b) => {
    const r = rec.data; const text = txt(b.text, 300); if (!text) invalid("Action is required.");
    const who = b.ownerId || b.owner ? await workOwner(d, t.actor, { id: b.ownerId, name: b.owner }, "risk", false) : null;
    const due = txt(b.due, 10);
    (r.actions ??= []).push({ text, owner: who?.name ?? "", ownerId: who?.id, due: isIso(due) ? due : "", done: false });
    touch(t, r); log(t, r, "Action added: " + text); await save(t, rec);
    await t.audit("risk.action.added", `${r.id}: ${text}`, "Risk");
    if (who && who.id !== t.actor.id) await t.notify(who.id, `${t.actor.name} gave you a treatment action on risk ${r.id}: ${text.slice(0, 120)}`);
    return { text };
  });
  const actionAt = (r: Risk, p: string[]) => { const n = Number(p[4]); const a = Number.isInteger(n) ? r.actions?.[n] : undefined; return a ?? missing("Action"); };
  const toggleAct = edit(async (_d, t, rec, _b, p) => {
    const r = rec.data; const a = actionAt(r, p);
    if (a.cancelled) invalid("This action was cancelled.");
    a.done = !a.done; touch(t, r);
    if (r.actions.every((x) => x.done || x.cancelled)) { r.actions.forEach((x) => { x.at ??= isoDayOf(t.now); }); log(t, r, "All treatment actions complete; exposure at residual"); }
    await save(t, rec); await t.audit(`risk.action.${a.done ? "done" : "reopened"}`, `${r.id}: ${a.text}`, "Risk");
    return { done: a.done, text: a.text };
  });
  const cancelAct = edit(async (_d, t, rec, b, p) => {
    const r = rec.data; const a = actionAt(r, p);
    if (a.done || a.cancelled) invalid("This action is already done or cancelled.");
    const why = txt(b.reason, 300); if (why.length < 10) invalid("Give a reason of at least 10 characters.");
    a.cancelled = true; a.cancelReason = why; touch(t, r); log(t, r, `Action cancelled: ${a.text} (${why})`); await save(t, rec);
    await t.audit("risk.action.cancelled", `${r.id}: ${a.text}`, "Risk");
    return { text: a.text };
  });
  const submit = edit(async (_d, t, rec) => {
    const r = rec.data; const bad = riskSubmitBlock(r.review, (r.linked ?? []).length); if (bad) invalid(bad);
    if (!isOpen(r)) invalid("Only an open risk can be submitted.");
    r.review = "Submitted"; r.status = "In review"; r.submittedBy = t.actor.name; r.submittedById = t.actor.id; touch(t, r); log(t, r, "Submitted for approval");
    await save(t, rec); await t.audit("risk.submitted", r.id, "Risk");
  });
  const decideReview = (approve: boolean) => wsRoute(h, "risk", async (d, r, c) => tx(d, c, async (t) => {
    const rec = await load(t, r.path[2]); const x = rec.data;
    refuse(riskDecideBlock({ role: c.actor.role, review: x.review, isEditorOrSubmitter: x.lastEditedById === c.actor.id || x.submittedById === c.actor.id, approve }));
    if (approve) { x.review = "Approved"; if (x.status === "In review") x.status = "Open"; log(t, x, "Approved"); await save(t, rec); await t.audit("risk.approved", x.id, "Risk"); }
    else {
      const note = txt(r.body.note, 500); if (!note) invalid("A note is required to request changes");
      x.review = "Changes requested"; if (x.status === "In review") x.status = "Open"; log(t, x, "Changes requested: " + note); await save(t, rec);
      await t.audit("risk.changes_requested", `${x.id}: ${note.slice(0, 200)}`, "Risk");
      if (x.submittedById && x.submittedById !== c.actor.id) await t.notify(x.submittedById, `${c.actor.name} asked for changes to risk ${x.id}: ${note.slice(0, 120)}`);
    }
    return ok({ ok: true });
  }));
  const accept = edit(async (_d, t, rec, b) => {
    const r = rec.data; const me = t.actor;
    if (!isOpen(r)) invalid("This risk is already accepted or closed.");
    if (r.pendingAcceptance) invalid("An acceptance is already awaiting evidence verification.");
    if (r.review === "Submitted") invalid("The risk is awaiting approval. Decide the review first.");
    refuse(riskAcceptRoleBlock(me.role, sRes(r)));
    refuse(riskAcceptSodBlock([r.ownerId, r.lastEditedById, r.submittedById].includes(me.id)));
    const why = txt(b.why, 1000), comp = txt(b.comp, 500), until = txt(b.until, 10); const sc = sRes(r); const now = new Date(t.now);
    if (!why) invalid("A rationale is required.");
    if (sc > 15) {
      refuse(roleBlock(me.role, "recording a Board-approved acceptance", "admin") ? "Only a company admin can record Board-approved acceptance." : null);
      const ev = validateBoardEvidence(b.board as never, now); if (!ev.ok) invalid(ev.msg!);
      if (why.length < 20) invalid("Give a reason of at least 20 characters.");
      const bad = validateAcceptExpiry(until, now); if (bad) invalid(bad);
      const e = ev.value!;
      const ap = await t.request({
        kind: "risk.board-evidence", title: `Verify Board evidence ${e.ref} for ${r.id}`, subject: r.id, needs: 1, approverRoles: ["admin", "owner"],
        forbid: [r.ownerId, r.lastEditedById, r.submittedById].filter((x): x is string => !!x), ttlMs: RISK_BOARD_TTL_H * 3600_000,
        payload: { riskId: r.id, ref: e.ref, date: e.date, body: e.body, minutes: e.minutes, residual: sc },
      });
      r.pendingAcceptance = { by: BOARD, at: isoDayOf(t.now), until, note: why, comp, recordedBy: me.name, recordedById: me.id, score: sc, board: e, approvalId: ap.id };
      log(t, r, `Board evidence ${e.ref} recorded for acceptance; awaiting verification (${ap.id})`); await save(t, rec);
      await t.audit("risk.board-evidence.recorded", `${r.id} — Board ref ${e.ref} (${e.date}, ${e.body}), approval ${ap.id}`, "Risk");
      return { pending: true, approvalId: ap.id };
    }
    const by = str(b.by, 40); const bad = riskLadderBlock(by, sc); if (bad) invalid(bad);
    if (until) { const e = validateAcceptExpiry(until, now); if (e) invalid(e); }
    r.status = "Accepted"; r.treat = "Accept";
    r.acceptance = { by, at: isoDayOf(t.now), until: until || isoDayOf(t.now + 365 * 86400_000), note: why, comp, recordedBy: me.name, recordedById: me.id, score: sc };
    log(t, r, "Risk accepted by " + by); await save(t, rec);
    await t.audit("risk.accepted", `${r.id} — ${by} (residual ${sc}, recorded by ${me.name})`, "Risk");
    return { pending: false };
  });
  const boardDecide = wsRoute(h, "risk", async (d, r, c) => {
    const me = c.actor; const decision = str(r.body.decision, 10); if (decision !== "approve" && decision !== "reject") invalid("Choose approve or reject.");
    return tx(d, c, async (t) => {
      await sweepRisk(t);
      const rec = await load(t, r.path[2]); const x = rec.data; const p = x.pendingAcceptance; if (!p) invalid("No evidence is waiting for verification.");
      refuse(roleBlock(me.role, "verifying Board evidence", "admin", "owner"));
      refuse([p!.recordedById, x.ownerId, x.lastEditedById, x.submittedById].includes(me.id) ? "Segregation of duties: you recorded, own or last edited this risk, so you cannot verify its Board evidence." : null);
      const reason = txt(r.body.reason, 300); if (reason.length < 10) invalid("Give a reason of at least 10 characters.");
      const a = (await t.approval(p!.approvalId!, RISK_KINDS)) ?? missing("Verification request");
      refuse(approvalBlock({ key: me.id, base: me.role }, { status: a.status, expiresAt: a.expiresAt, approverRoles: a.approverRoles, requestedBy: a.requestedBy, forbid: a.forbid, votes: a.votes.map((v) => v.by) }, t.now));
      if (decision === "reject") {
        await t.setApproval(a.id, "Rejected", reason); await t.audit("approval.risk.board-evidence.rejected", `${a.title} (${a.id}); reason: ${reason}`, "Approval");
        delete x.pendingAcceptance; log(t, x, `Board evidence ${p!.board!.ref} rejected: ${reason}`); await save(t, rec);
        await t.audit("risk.board-evidence.rejected", `${x.id} — Board ref ${p!.board!.ref}, approval ${a.id}`, "Risk");
        if (p!.recordedById) await t.notify(p!.recordedById, `${me.name} rejected the Board evidence ${p!.board!.ref} for risk ${x.id}: ${reason.slice(0, 120)}`);
        return ok({ ok: true });
      }
      await t.vote(a.id, reason); await t.setApproval(a.id, "Approved", reason);
      await t.audit("approval.risk.board-evidence.approved", `${a.title} (${a.id}); reason: ${reason}`, "Approval");
      await t.audit("risk.board-evidence.verified", `${x.id} — Board ref ${p!.board!.ref}, approval ${a.id}`, "Risk");
      if (sRes(x) !== p!.score) await cancelPending(t, x, "residual score changed before the evidence was verified");
      else { finalize(t, x, me); await t.audit("risk.accepted", `${x.id} — ${BOARD} (Board ref ${p!.board!.ref}, approval ${a.id}, recorded by ${p!.recordedBy})`, "Risk"); }
      await save(t, rec);
      return ok({ ok: true });
    });
  });
  const boardWithdraw = wsRoute(h, "risk", async (d, r, c) => tx(d, c, async (t) => {
    await sweepRisk(t);
    const rec = await load(t, r.path[2]); const x = rec.data; const p = x.pendingAcceptance; if (!p) invalid("No evidence is waiting for verification.");
    if (p!.recordedById !== c.actor.id) refuse("Only the person who recorded the evidence can withdraw it.");
    const a = await t.approval(p!.approvalId!, RISK_KINDS);
    if (a?.status === "Pending") { await t.setApproval(a.id, "Withdrawn"); await t.audit("approval.risk.board-evidence.withdrawn", `${a.title} (${a.id})`, "Approval"); }
    delete x.pendingAcceptance; log(t, x, `Board evidence ${p!.board!.ref} withdrawn by recorder`); await save(t, rec);
    await t.audit("risk.board-evidence.withdrawn", `${x.id} — Board ref ${p!.board!.ref}, approval ${p!.approvalId}`, "Risk");
    return ok({ ok: true });
  }));
  const reopen = edit(async (_d, t, rec, b) => {
    const r = rec.data; if (r.status !== "Accepted" || !r.acceptance) invalid("Only an accepted risk can be reopened.");
    const why = txt(b.reason, 300);
    r.invalidatedAcceptance = { ...r.acceptance!, invalidatedAt: isoDayOf(t.now), invalidatedReason: why ? `reopened: ${why}` : `reopened by ${t.actor.name}` };
    r.status = "Open"; r.treat = "Mitigate"; delete r.acceptance; touch(t, r); log(t, r, "Risk reopened" + (why ? ": " + why : "")); await save(t, rec);
    await t.audit("risk.reopened", r.id + (why ? ` — ${why.slice(0, 80)}` : ""), "Risk");
  });
  const close = edit(async (_d, t, rec, b) => {
    const r = rec.data; const me = t.actor;
    if (!isOpen(r)) invalid(r.status === "Closed" ? "This risk is already closed." : "Reopen the accepted risk before closing it.");
    refuse(riskCloseRoleBlock(me.role));
    if (r.review === "Submitted") invalid("The risk is awaiting approval. Decide the review first.");
    refuse(riskCloseBlock({ openActions: openActions(r).length, isLastEditor: r.lastEditedById === me.id, isOwner: r.ownerId === me.id, hasActions: (r.actions ?? []).length > 0 }));
    const why = txt(b.reason, 300);
    if (r.pendingAcceptance) await cancelPending(t, r, "risk closed");
    r.status = "Closed"; log(t, r, "Risk closed" + (why ? ": " + why : "")); await save(t, rec);
    await t.audit("risk.closed", r.id + (why ? ` — ${why.slice(0, 80)}` : ""), "Risk");
  });

  /* ----- interested parties ----- */
  const party = wsRoute(h, "risk", async (d, r, c) => {
    refuse(riskEditBlock(c.actor.role));
    const name = txt(r.body.party, 200); if (!name) invalid("Party name required");
    return tx(d, c, async (t) => {
      if ((await t.list<RiskParty>("risk-party")).some((x) => x.data.party.toLowerCase() === name.toLowerCase())) invalid("That interested party is already listed.");
      const id = `IP-${await t.next("risk-party", 0)}`;
      await t.insert("risk-party", id, { id, party: name, req: txt(r.body.req, 500) || "—", loc: txt(r.body.loc, 100) || "Global", links: [] } satisfies RiskParty);
      await t.audit("risk.party.added", name, "Risk");
      return ok({ ok: true, party: name, id });
    });
  });
  const partyLink = (on: boolean) => wsRoute(h, "risk", async (d, r, c) => {
    refuse(riskEditBlock(c.actor.role));
    return tx(d, c, async (t) => {
      const rec = (await t.get<RiskParty>("risk-party", str(r.path[2], 20))) ?? missing("Interested party"); const p = rec.data;
      const rid = on ? str(r.body.riskId, 40) : str(r.path[4], 40);
      if (on) { if (!(await t.get("risk", rid))) missing("Risk"); if (p.links.includes(rid)) invalid("That risk is already linked."); p.links.push(rid); }
      else { if (!p.links.includes(rid)) invalid("That risk is not linked."); p.links = p.links.filter((x) => x !== rid); }
      await t.update("risk-party", rec.id, p, rec.version);
      await t.audit(on ? "risk.party.linked" : "risk.party.unlinked", `${p.party} ${on ? "←" : "✕"} ${rid}`, "Risk");
      return ok({ ok: true, party: p.party });
    });
  });

  /* ----- snapshots ----- */
  const snapshot = wsRoute(h, "risk", async (d, r, c) => {
    refuse(roleBlock(c.actor.role, "taking a register snapshot", "admin"));
    const scope = r.body.scope === "approved" ? "approved" : "all";
    return tx(d, c, async (t) => {
      const pool = (await t.list<Risk>("risk")).map((x) => x.data).filter((x) => scope === "all" || x.review === "Approved");
      const content = pool.map((x) => ({ id: x.id, title: x.title, cat: x.cat, owner: x.owner, l: x.l, i: x.i, cl: x.cl, ci: x.ci, rl: x.rl, ri: x.ri, treat: x.treat, status: x.status, review: x.review, reviewed: x.reviewed, linked: x.linked, acceptance: x.acceptance ? { by: x.acceptance.by, until: x.acceptance.until, board: x.acceptance.board?.ref ?? null } : null }));
      const sha256 = createHash("sha256").update(JSON.stringify(content)).digest("hex");
      const id = `RS-${String(await t.next("risk-snapshot", 0)).padStart(3, "0")}`;
      // shared with the auditor of any engagement whose access is live now (they download it from the engagement, server/ws/audits.ts)
      const today = isoDayOf(t.now);
      const shared = (await t.list<{ access?: { status: string; until?: string } }>("audit")).some((x) => x.data.access?.status === "granted" && (x.data.access.until ?? "") >= today);
      const at = new Date(t.now).toISOString().slice(0, 16).replace("T", " ");
      await t.insert("risk-snapshot", id, { id, at, count: pool.length, scope: scope === "approved" ? "Approved risks" : "All risks", hash: sha256.slice(0, 12), sha256, by: c.actor.name, byId: c.actor.id, shared, content } satisfies RiskSnapshot);
      await t.audit("risk.register.snapshot", `${pool.length} risks (${scope}), SHA-256 ${sha256}`, "Risk");
      return ok({ ok: true, count: pool.length, scope, hash: sha256.slice(0, 12) });
    });
  });
  /** A stored snapshot's frozen content, for download (admins). */
  const snapshotGet = wsRoute(h, "risk", async (d, r, c) => {
    refuse(roleBlock(c.actor.role, "reading a register snapshot", "admin"));
    return tx(d, c, async (t) => {
      const s = (await t.get<RiskSnapshot>("risk-snapshot", str(r.path[3], 20))) ?? missing("Snapshot");
      await t.audit("risk.register.snapshot.downloaded", `${s.id} (SHA-256 ${s.data.sha256})`, "Risk");
      return ok(s.data);
    });
  });

  /* ----- import ----- */
  const imp = wsRoute(h, "risk", async (d, r, c) => {
    if (riskEditBlock(c.actor.role)) refuse("Not permitted: importing risks requires an editing role.");
    const fileName = txt(r.body.fileName, 120) || "import";
    const raw = Array.isArray(r.body.rows) ? (r.body.rows as Record<string, unknown>[]) : [];
    if (!raw.length) invalid("There are no rows to import.");
    if (raw.length > RISK_IMPORT_MAX_ROWS) invalid(`At most ${RISK_IMPORT_MAX_ROWS} rows can be imported at once.`);
    const rows = raw.map((x) => (x && typeof x === "object" ? cleanRow(x) : null)).filter((x): x is ImportRow => !!x);
    const ms = (await membersOf(d, c.actor)).map((m) => ({ id: m.id, name: m.name }));
    return tx(d, c, async (t) => {
      const existing = new Set((await t.list<Risk>("risk")).map((x) => x.id));
      const nUpd = rows.filter((x) => x.id && existing.has(x.id)).length; const nNew = rows.length - nUpd;
      if (!nUpd) return ok(await applyRows(t, rows, fileName, c.actor, ms));
      const id = `IM-${await t.next("risk-import", 0)}`;
      const ap = await t.request({
        kind: "risk.import", title: `Risk import ${fileName}: ${nNew} new, ${nUpd} update${nUpd !== 1 ? "s" : ""}`, subject: fileName, needs: 1, approverRoles: ["admin"],
        forbid: [], ttlMs: RISK_IMPORT_TTL_H * 3600_000, payload: { importId: id, fileName, nNew, nUpd, ids: rows.filter((x) => x.id && existing.has(x.id)).slice(0, 50).map((x) => x.id) },
      });
      await t.insert("risk-import", id, { id, fileName, rows, nNew, nUpd, importer: c.actor.name, importerId: c.actor.id, approvalId: ap.id, applied: false } satisfies StagedImport);
      await t.audit("risk.import.staged", `${ap.id}: ${nNew} new, ${nUpd} updates (${fileName}) awaiting approval`, "Risk");
      return ok({ nNew, nUpd, staged: true, approvalId: ap.id });
    });
  });
  const impDecide = wsRoute(h, "risk", async (d, r, c) => {
    const me = c.actor; const decision = str(r.path[3], 10);
    if (!["approve", "reject", "withdraw"].includes(decision)) missing("Action");
    const ms = (await membersOf(d, me)).map((m) => ({ id: m.id, name: m.name }));
    return tx(d, c, async (t) => {
      await sweepRisk(t);
      const a = (await t.approval(str(r.path[2], 60), ["risk.import"])) ?? missing("Request");
      const rec = (await t.list<StagedImport>("risk-import")).find((x) => x.data.approvalId === a.id);
      if (decision === "withdraw") {
        if (a.requestedBy !== me.id) refuse("Only the person who imported the file can withdraw it.");
        if (a.status !== "Pending") invalid(`Request is ${a.status.toLowerCase()}.`);
        await t.setApproval(a.id, "Withdrawn"); await t.audit("approval.risk.import.withdrawn", `${a.title} (${a.id})`, "Approval");
        if (rec) await t.remove("risk-import", rec.id, rec.version);
        await t.audit("risk.import.withdrawn", `${a.id}: ${a.payload.fileName} not applied`, "Risk");
        return ok({ nNew: 0, nUpd: 0 });
      }
      refuse(roleBlock(me.role, "deciding a risk import", "admin"));
      refuse(approvalBlock({ key: me.id, base: me.role }, { status: a.status, expiresAt: a.expiresAt, approverRoles: a.approverRoles, requestedBy: a.requestedBy, forbid: a.forbid, votes: a.votes.map((v) => v.by) }, t.now));
      const reason = txt(r.body.reason, 300); const bad = reasonBlock(reason); if (bad) invalid(bad);
      if (decision === "reject") {
        await t.setApproval(a.id, "Rejected", reason); await t.audit("approval.risk.import.rejected", `${a.title} (${a.id}); reason: ${reason}`, "Approval");
        if (rec) await t.remove("risk-import", rec.id, rec.version);
        await t.audit("risk.import.rejected", `${a.id}: ${a.payload.fileName} not applied`, "Risk");
        return ok({ nNew: 0, nUpd: 0 });
      }
      if (!rec || rec.data.applied) invalid("The staged import is no longer available.");
      await t.vote(a.id, reason); await t.setApproval(a.id, "Approved", reason);
      await t.audit("approval.risk.import.approved", `${a.title} (${a.id}); reason: ${reason}`, "Approval");
      const res = await applyRows(t, rec!.data.rows, rec!.data.fileName, { id: rec!.data.importerId, name: rec!.data.importer }, ms);
      await t.remove("risk-import", rec!.id, rec!.version); // applied once: the staged rows go
      await t.audit("risk.import.approved", `${a.id}: applied ${res.nNew} new, ${res.nUpd} updated (${rec!.data.fileName})`, "Risk");
      return ok(res);
    });
  });

  return {
    "GET ws/data/risk": data, "POST ws/risks": create, "POST ws/risks/snapshots": snapshot, "GET ws/risks/snapshots/:id": snapshotGet,
    "POST ws/risks/import": imp, "POST ws/risk-imports/:id/:decision": impDecide,
    "POST ws/risks/:id/score": scoreR, "POST ws/risks/:id/controls": mapC, "POST ws/risks/:id/controls/:cid/delete": unmapC,
    "POST ws/risks/:id/actions": addAct, "POST ws/risks/:id/actions/:n/toggle": toggleAct, "POST ws/risks/:id/actions/:n/cancel": cancelAct,
    "POST ws/risks/:id/submit": submit, "POST ws/risks/:id/approve": decideReview(true), "POST ws/risks/:id/request-changes": decideReview(false),
    "POST ws/risks/:id/accept": accept, "POST ws/risks/:id/board-evidence/decision": boardDecide, "POST ws/risks/:id/board-evidence/withdraw": boardWithdraw,
    "POST ws/risks/:id/reopen": reopen, "POST ws/risks/:id/close": close,
    "POST ws/risk-parties": party, "POST ws/risk-parties/:id/links": partyLink(true), "POST ws/risk-parties/:id/links/:rid/delete": partyLink(false),
  };
}
