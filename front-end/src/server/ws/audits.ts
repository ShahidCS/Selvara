/* Server-only. Audits and the company audit log on the server (production programme group 5; inventory group 5, sections 1 to 3).
   Management (admins and owners) runs an engagement: requests (PBC), information requests, populations, stages, findings into issues. An
   external auditor (a member with the Auditor role) works only on the engagements they are assigned to, while their access is live: they raise
   information requests, draft findings and close requests. Deliberate differences from the demonstration, decided for production:
   - Auditor access names a person (a member with the Auditor role) and a period, and ends by itself on its last day; it cannot be granted on a
     completed engagement. An auditor sees only the engagements assigned to them while access is live, never other firms' engagements.
   - Every path to Complete applies the same rules: no drafted finding waiting for a decision, no information request still open (an answered
     one is closed with the engagement), and a reason when findings or requests remain open. A completed engagement is locked.
   - Accepting a finding creates a real issue (owner, real due date, linked to the finding) in the same unit of work.
   - Risk register snapshots taken while an auditor's access is live are shared with that engagement's auditor, who can download them here.
   - The company audit log is the real, hash-chained server log: company admins read it, verify it (migration 0009), export it and build an
     evidence package with a SHA-256 manifest. Every export is recorded; at most 10 an hour.
   - Ids are unique per company. The report is a draft and is recorded in the company's own log only. People are compared by user id.
   - What an auditor may see outside this module is what management shares with the engagement (its framework, and the controls, evidence and
     policies listed in `shared`), only while their access is live: `auditorScope` is the one place that works it out, and the Frameworks,
     Controls, Evidence and Policies routes use it (a record outside the scope does not exist for the auditor). */
import { createHash } from "node:crypto";
import { isoDayOf, roleBlock } from "@/lib/rulesWs";
import fwShort from "@/data/fwShort.json";
import type { Deps } from "../types";
import { LIB_FRAMEWORKS } from "./catalogue";
import { invalid, membersOf, missing, ok, refuse, str, txt, wsRoute, type WsHelpers } from "./common";
import { createIssueIn } from "./issues";
import type { RiskSnapshot } from "./risk";
import type { Actor, CompanyAuditEntry, Rec, WsTx } from "./store";

export const AUDIT_STAGES = ["Planned", "Fieldwork", "Reporting", "Complete"] as const;
export const AUDIT_FWS = ["ISO 27001", "SOC 2", "GDPR", "PCI DSS", "NIST CSF", "-"] as const;
const SEVS = ["Critical", "High", "Medium", "Low"];
const PROGRESS = [0, 40, 85, 100];
const ACCESS_MAX_DAYS = 180;
/** What management shares with an engagement's auditor, and the record kind each list names. */
export const SHARE_KINDS = { controls: "control", evidence: "evidence", policies: "policy" } as const;
export type ShareKind = keyof typeof SHARE_KINDS;
export const SHARE_MAX = 500;
type Shared = Record<ShareKind, string[]>;
interface Pbc { id: string; item: string; owner: string; ownerId?: string; status: "Requested" | "Outstanding" | "Received" }
interface Finding { id: string; title: string; sev: string; status: "Draft" | "Open" | "Rejected" | "Closed"; rec: string; issue: string; draftedBy?: string; draftedById?: string; acceptedBy?: string; acceptedAt?: string; rejectedReason?: string; rejectedBy?: string }
interface Ir { id: string; item: string; by: string; byId: string; at: string; status: "Open" | "Answered" | "Closed"; response: string; answeredBy?: string; closedBy?: string }
interface Access { status: "none" | "granted" | "ended"; auditorId?: string; auditor?: string; from?: string; fromAt?: string; until?: string; grantedBy?: string; endedBy?: string; endedAt?: string; endedAtStamp?: string }
export interface Audit {
  id: string; name: string; fw: string; auditor: string; lead: string; stage: string; scope: string; period: string; progress: number; opened: string;
  pbc: Pbc[]; tests: unknown[]; findings: Finding[]; irs: Ir[]; access: Access; populationsFrozen: boolean; frozenAt?: string; frozenBy?: string; createdBy: string; createdById: string; closeReason?: string;
  /** Shared with the auditor (missing on older records: nothing shared). */ shared?: Partial<Shared>;
}
const manageBlock = (role: string) => roleBlock(role, "managing an audit", "admin", "owner");
const stamp = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " "); // the same form as a snapshot's `at`
/** The minutes a snapshot must fall in to be shared with this engagement's auditor: from the grant to the end of access. */
const inWindow = (a: Audit, at: string, now: number) => !!a.access.fromAt && at >= a.access.fromAt && at <= (a.access.endedAtStamp ?? (a.access.until ? `${a.access.until} 23:59` : stamp(now)));
const isOpenFinding = (f: Finding) => f.status !== "Closed" && f.status !== "Draft" && f.status !== "Rejected";
const live = (a: Audit, today: string) => a.access.status === "granted" && !!a.access.until && a.access.until >= today;
const sharedOf = (a: Audit): Shared => ({ controls: a.shared?.controls ?? [], evidence: a.shared?.evidence ?? [], policies: a.shared?.policies ?? [] });
/** The audit as the screens read it (the demonstration's `auditorAccess` flag is derived). */
export const auditView = (a: Audit) => ({ ...a, auditorAccess: a.access.status, shared: sharedOf(a) });
/** What an external auditor receives: names, never the company's internal user ids. */
const forAuditor = (a: Audit) => {
  const { createdById: _c, ...rest } = a; void _c;
  return { ...rest, auditorAccess: a.access.status, shared: sharedOf(a), access: { status: a.access.status, auditor: a.access.auditor, from: a.access.from, until: a.access.until, endedAt: a.access.endedAt, endedBy: a.access.endedBy },
    pbc: a.pbc.map(({ ownerId: _o, ...p }) => (void _o, p)), irs: a.irs.map(({ byId: _b, ...r }) => (void _b, r)), findings: a.findings.map(({ draftedById: _d, ...f }) => (void _d, f)) };
};
async function load(t: WsTx, id: string): Promise<Rec<Audit>> { return (await t.get<Audit>("audit", str(id, 20))) ?? missing("Audit"); }
const save = (t: WsTx, rec: Rec<Audit>) => t.update("audit", rec.id, rec.data, rec.version);
const whyCannotComplete = (a: Audit) => {
  const drafts = a.findings.filter((f) => f.status === "Draft").length; const open = a.irs.filter((r) => r.status === "Open").length;
  return drafts ? `${drafts} auditor-drafted finding${drafts === 1 ? "" : "s"} await${drafts === 1 ? "s" : ""} a management decision.` : open ? `${open} information request${open === 1 ? " is" : "s are"} still open.` : null;
};
/** The framework an engagement names ("ISO 27001", a display name) as the id the frameworks data uses, or null when none matches. */
async function fwIdOf(t: WsTx, fw: string): Promise<string | null> {
  const lib = Object.entries(fwShort as Record<string, string>).find(([, v]) => v === fw)?.[0];
  if (lib && LIB_FRAMEWORKS.some((f) => f.id === lib)) return lib;
  return (await t.list<{ name: string; short: string }>("fw-custom")).find((x) => x.data.short === fw || x.data.name === fw)?.id ?? null;
}
export interface AuditorScope { frameworks: Set<string>; controls: Set<string>; evidence: Set<string>; policies: Set<string> }
/** What the acting auditor may see in Frameworks, Controls, Evidence and Policies: the union, over their engagements whose access is live
 *  today, of the engagement's framework and what management shared with it. Null for every other role (their role decides). Computed on
 *  each request, so it disappears when access ends or runs out. */
export async function auditorScope(t: WsTx): Promise<AuditorScope | null> {
  if (t.actor.role !== "auditor") return null;
  const s: AuditorScope = { frameworks: new Set(), controls: new Set(), evidence: new Set(), policies: new Set() }; const today = isoDayOf(t.now);
  for (const { data: a } of await t.list<Audit>("audit")) {
    if (a.access.auditorId !== t.actor.id || !live(a, today)) continue;
    const fw = await fwIdOf(t, a.fw); if (fw) s.frameworks.add(fw);
    const sh = sharedOf(a); for (const k of Object.keys(SHARE_KINDS) as ShareKind[]) for (const id of sh[k]) s[k].add(id);
  }
  return s;
}
/** Fields that carry a company member's user id. An auditor keeps the display names already on a shared record, never the ids. */
const MEMBER_ID_KEYS = new Set(["ownerId", "byId", "requestedById", "requesterId", "authorId", "editorIds", "lastEditorId", "approverId", "submittedById", "approvedById",
  "publishedById", "creatorId", "userId", "decidedById", "draftedById", "answeredById", "createdById", "auditorId", "forbid"]);
/** A record as an auditor receives it: the same shape, with every member id emptied ("" or []), however deeply nested. */
export function withoutMemberIds<T>(x: T): T {
  if (Array.isArray(x)) return x.map(withoutMemberIds) as T;
  if (!x || typeof x !== "object") return x;
  return Object.fromEntries(Object.entries(x as Record<string, unknown>).map(([k, v]) => [k, MEMBER_ID_KEYS.has(k) ? (Array.isArray(v) ? [] : v == null ? v : "") : withoutMemberIds(v)])) as T;
}
/** For an auditor, a record outside their scope does not exist (404, before anything else); every other role passes. */
export async function scopeGuard(t: WsTx, kind: keyof AuditorScope, id: string, what: string) {
  const s = await auditorScope(t); if (s && !s[kind].has(id)) missing(what);
  return s;
}
const needsReason = (a: Audit) => a.findings.some(isOpenFinding) || a.pbc.some((p) => p.status !== "Received");

/** Access that ran out ends by itself, once, recorded by the system; the auditor is told. */
async function sweepAudits(t: WsTx) {
  const today = isoDayOf(t.now);
  for (const rec of await t.list<Audit>("audit")) {
    const a = rec.data;
    if (a.access.status === "granted" && a.access.until && a.access.until < today) {
      a.access.status = "ended"; a.access.endedBy = "System"; a.access.endedAt = today; a.access.endedAtStamp = `${a.access.until} 23:59`; await save(t, rec);
      await t.audit("audit.auditor.access.expired", `${a.id} ${a.name}: ${a.access.auditor} (until ${a.access.until})`, "Audit", true);
      if (a.access.auditorId) await t.notify(a.access.auditorId, `Your auditor access to ${a.name} ended on ${a.access.until}.`);
    }
  }
}
/** Completes the engagement: ends access, closes answered requests, locks it. */
async function complete(t: WsTx, rec: Rec<Audit>, reason: string, how: string) {
  const a = rec.data; const why = whyCannotComplete(a); if (why) invalid(why);
  if (needsReason(a) && reason.length < 10) invalid("A reason for closing with open findings or outstanding requests of at least 10 characters is required.");
  for (const r of a.irs) if (r.status === "Answered") { r.status = "Closed"; r.closedBy = `${t.actor.name} (with the engagement)`; }
  const wasLive = a.access.status === "granted";
  if (wasLive) { a.access.status = "ended"; a.access.endedBy = t.actor.name; a.access.endedAt = isoDayOf(t.now); a.access.endedAtStamp = stamp(t.now); }
  a.stage = "Complete"; a.progress = 100; a.closeReason = reason || undefined; await save(t, rec);
  await t.audit(wasLive ? "audit.auditor.access.ended" : "audit.stage.advanced", `${a.id} ${a.name} → Complete by ${t.actor.name}${reason ? `: ${reason}` : ""} (${how})`, "Audit");
  if (wasLive && a.access.auditorId) await t.notify(a.access.auditorId, `${a.name} was completed and your auditor access ended.`);
}

export function auditRoutes(h: WsHelpers) {
  const tx = <T,>(d: Deps, c: { actor: Actor }, w: (t: WsTx) => Promise<T>) => d.ws.tx(c.actor, d.now(), w);
  /** A management change on one engagement; refused once the engagement is complete unless `whenComplete`. */
  const manage = (fn: (d: Deps, t: WsTx, rec: Rec<Audit>, b: Record<string, unknown>, p: string[]) => Promise<unknown>, whenComplete = false) => wsRoute(h, "audits", async (d, r, c) => {
    refuse(manageBlock(c.actor.role));
    return tx(d, c, async (t) => {
      await sweepAudits(t); const rec = await load(t, r.path[2]);
      if (rec.data.stage === "Complete" && !whenComplete) invalid("This engagement is complete and locked.");
      return ok({ ok: true, ...((await fn(d, t, rec, r.body, r.path)) as object) });
    });
  });
  /** An action of the assigned auditor while their access is live. */
  const auditor = (fn: (t: WsTx, rec: Rec<Audit>, b: Record<string, unknown>, p: string[]) => Promise<unknown>) => wsRoute(h, "audits", async (d, r, c) => {
    if (c.actor.role !== "auditor") refuse("Not permitted: this auditor action requires auditor.");
    return tx(d, c, async (t) => {
      await sweepAudits(t); const rec = await load(t, r.path[2]); const a = rec.data;
      if (a.access.auditorId !== c.actor.id) missing("Audit"); // another auditor's engagement does not exist for them
      if (!live(a, isoDayOf(t.now))) refuse(a.access.status === "ended" ? "Auditor access for this engagement has ended." : "Auditor access has not been granted for this engagement yet.");
      return ok({ ok: true, ...((await fn(t, rec, r.body, r.path)) as object) });
    });
  });

  const data = wsRoute(h, "audits", async (d, _r, c) => ok(await tx(d, c, async (t) => {
    await sweepAudits(t);
    const today = isoDayOf(t.now); const all = (await t.list<Audit>("audit")).map((x) => x.data);
    const isAuditor = c.actor.role === "auditor";
    const mine = isAuditor ? all.filter((a) => a.access.auditorId === c.actor.id && live(a, today)) : all;
    const snaps = (await t.list<RiskSnapshot>("risk-snapshot")).map((x) => x.data);
    const shared = (a: Audit) => snaps.filter((s) => inWindow(a, s.at, t.now))
      .map((s) => ({ id: s.id, at: s.at, count: s.count, scope: s.scope, hash: s.hash }));
    return {
      audits: mine.map((a) => ({ ...(isAuditor ? forAuditor(a) : auditView(a)), snapshots: shared(a) })).reverse(), stages: AUDIT_STAGES, fws: AUDIT_FWS,
      auditors: isAuditor ? [] : (await membersOf(d, c.actor)).filter((m) => m.role === "auditor").map((m) => ({ id: m.id, name: m.name })),
    };
  })));
  const create = wsRoute(h, "audits", async (d, r, c) => {
    refuse(manageBlock(c.actor.role));
    const name = txt(r.body.name, 120); if (!name) invalid("Audit name is required.");
    const fw = (AUDIT_FWS as readonly string[]).includes(String(r.body.fw)) ? String(r.body.fw) : AUDIT_FWS[0];
    return tx(d, c, async (t) => {
      const id = `AUD-${String(await t.next("audit", 0)).padStart(2, "0")}`;
      await t.insert("audit", id, { id, name, fw, auditor: txt(r.body.auditor, 120) || "Internal Audit", lead: `Internal, ${c.actor.name}`, stage: "Planned", scope: txt(r.body.scope, 500) || "To be defined",
        period: "Planning", progress: 0, opened: isoDayOf(t.now), pbc: [], tests: [], findings: [], irs: [], access: { status: "none" }, populationsFrozen: false, createdBy: c.actor.name, createdById: c.actor.id } satisfies Audit);
      await t.audit("audit.created", `${id} ${name}`, "Audit");
      return ok({ id });
    });
  });
  const grant = manage(async (d, t, rec, b) => {
    const a = rec.data; if (a.access.status === "granted") invalid("Auditor access is already granted.");
    const m = (await membersOf(d, t.actor)).find((x) => x.id === str(b.auditorId, 100) && x.role === "auditor");
    if (!m) invalid("Choose the external auditor. Invite them in Team & Rules with the Auditor role first.");
    const today = isoDayOf(t.now); const until = txt(b.until, 10);
    const ms = Date.parse(until + "T00:00:00Z"); // a real calendar day only ("2026-13-45" or "9999-99-99" never pass)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || Number.isNaN(ms) || isoDayOf(ms) !== until || until < today || ms > t.now + ACCESS_MAX_DAYS * 86400_000) invalid(`Choose an end date within ${ACCESS_MAX_DAYS} days.`);
    a.access = { status: "granted", auditorId: m!.id, auditor: m!.name, from: today, fromAt: stamp(t.now), until, grantedBy: t.actor.name }; a.lead = `External, ${m!.name}`;
    if (a.stage === "Planned") { a.stage = "Fieldwork"; a.progress = PROGRESS[1]; }
    a.period = `Access ${today} to ${until}`; await save(t, rec);
    await t.audit("audit.auditor.access.granted", `${a.id} ${a.name} → ${m!.name} until ${until}`, "Audit");
    await t.notify(m!.id, `${t.actor.name} gave you auditor access to ${a.name} until ${until}.`);
    return { auditor: m!.name, until };
  });
  /** Management adds (on) or removes one control, evidence item or policy from what the engagement's auditor may see. */
  const share = manage(async (_d, t, rec, b) => {
    const a = rec.data; const kind = str(b.kind, 20) as ShareKind; const id = str(b.id, 40); const on = b.on !== false;
    if (!Object.keys(SHARE_KINDS).includes(kind)) invalid("Choose controls, evidence or policies.");
    if (!id) invalid("Choose an item to share.");
    const sh = sharedOf(a); const list = sh[kind]; const has = list.includes(id);
    if (on) {
      if (has) return {};
      if (!(await t.get(SHARE_KINDS[kind], id))) invalid("Unknown item: choose one of the company's records.");
      if (list.length >= SHARE_MAX) invalid(`At most ${SHARE_MAX} ${kind} can be shared with one engagement.`);
      sh[kind] = [...list, id];
    } else {
      if (!has) return {};
      sh[kind] = list.filter((x) => x !== id);
    }
    a.shared = sh; await save(t, rec);
    await t.audit(on ? "audit.shared.added" : "audit.shared.removed", `${a.id} ${a.name}: ${kind} ${id} by ${t.actor.name}`, "Audit");
    if (a.access.auditorId && live(a, isoDayOf(t.now))) await t.notify(a.access.auditorId, on ? `${t.actor.name} shared ${id} with you on ${a.name}.` : `${t.actor.name} stopped sharing ${id} with you on ${a.name}.`);
    return { shared: sh };
  });
  const end = manage(async (_d, t, rec, b) => { if (rec.data.access.status !== "granted") invalid("Auditor access is not granted."); await complete(t, rec, txt(b.reason, 500), "complete and end auditor access"); return {}; });
  const freeze = manage(async (_d, t, rec) => {
    const a = rec.data; if (a.populationsFrozen) invalid("Populations are already frozen.");
    a.populationsFrozen = true; a.frozenAt = new Date(t.now).toISOString(); a.frozenBy = t.actor.name; await save(t, rec);
    await t.audit("audit.populations.frozen", `${a.id} ${a.name}`, "Audit");
    return {};
  });
  const advance = manage(async (_d, t, rec, b) => {
    const a = rec.data; const i = (AUDIT_STAGES as readonly string[]).indexOf(a.stage); const to = AUDIT_STAGES[Math.max(0, i) + 1];
    if (to === "Complete") {
      if (a.access.status === "granted") invalid("Use “Complete & end auditor access” so the external auditor is revoked and the reason is recorded.");
      await complete(t, rec, txt(b.reason, 500), "advance stage"); return { stage: "Complete" };
    }
    a.stage = to; a.progress = PROGRESS[AUDIT_STAGES.indexOf(to)]; await save(t, rec);
    await t.audit("audit.stage.advanced", `${a.id} ${a.name} → ${to}`, "Audit");
    return { stage: to };
  });
  const addPbc = manage(async (d, t, rec, b) => {
    const a = rec.data; const item = txt(b.item, 300); if (!item) invalid("Request description is required.");
    const m = b.ownerId ? (await membersOf(d, t.actor)).find((x) => x.id === str(b.ownerId, 100)) : null;
    const id = `PBC-${await t.next("audit-pbc", 0)}`;
    a.pbc.push({ id, item, owner: m?.name ?? (txt(b.owner, 80) || "Unassigned"), ownerId: m?.id, status: "Requested" }); await save(t, rec);
    await t.audit("audit.pbc.added", `${a.id}: ${item}`, "Audit");
    if (m && m.id !== t.actor.id) await t.notify(m.id, `${t.actor.name} asked you for audit evidence (${a.name}): ${item.slice(0, 120)}`);
    return { id };
  });
  const advancePbc = manage(async (_d, t, rec, _b, p) => {
    const a = rec.data; const x = a.pbc.find((y) => y.id === str(p[4], 20)) ?? missing("Request");
    x.status = x.status === "Requested" ? "Outstanding" : x.status === "Outstanding" ? "Received" : "Requested"; await save(t, rec);
    await t.audit("audit.pbc.updated", `${a.id}: ${x.id} ${x.status}`, "Audit");
    return { status: x.status };
  });
  const promote = manage(async (_d, t, rec, _b, p) => {
    const a = rec.data; const f = a.findings.find((y) => y.id === str(p[4], 20)) ?? missing("Finding");
    if (f.issue || f.status === "Closed" || f.status === "Rejected") invalid("This finding cannot become an issue.");
    const iss = await createIssueIn(t, { title: f.title.slice(0, 200), sev: SEVS.includes(f.sev) ? f.sev : "High", owner: { id: t.actor.id, name: t.actor.name }, dueDate: isoDayOf(t.now + 14 * 86400_000), source: `${a.id}/${f.id}` });
    const wasDraft = f.status === "Draft";
    f.issue = iss.id; f.status = "Open"; f.acceptedBy = t.actor.name; f.acceptedAt = isoDayOf(t.now); await save(t, rec);
    await t.audit("audit.finding.promoted", `${a.id} ${f.id} → ${iss.id}${wasDraft ? ` (accepted draft by ${f.draftedBy})` : ""} by ${t.actor.name}`, "Audit");
    if (wasDraft && f.draftedById) await t.notify(f.draftedById, `${t.actor.name} accepted your finding ${f.id} on ${a.name} as issue ${iss.id}.`);
    return { issue: iss.id };
  });
  const reject = manage(async (_d, t, rec, b, p) => {
    const a = rec.data; const f = a.findings.find((y) => y.id === str(p[4], 20)) ?? missing("Finding");
    if (f.status !== "Draft") invalid("Only a drafted finding can be declined.");
    const reason = txt(b.reason, 500); if (reason.length < 10) invalid("A reason of at least 10 characters is required.");
    f.status = "Rejected"; f.rejectedReason = reason; f.rejectedBy = t.actor.name; await save(t, rec);
    await t.audit("audit.finding.rejected", `${a.id} ${f.id} by ${t.actor.name}: ${reason}`, "Audit");
    if (f.draftedById) await t.notify(f.draftedById, `${t.actor.name} declined your finding ${f.id} on ${a.name}: ${reason.slice(0, 120)}`);
    return {};
  });
  const respond = manage(async (_d, t, rec, b, p) => {
    const a = rec.data; const x = a.irs.find((y) => y.id === str(p[4], 20)) ?? missing("Request");
    if (x.status !== "Open") invalid("The request is not open.");
    const resp = txt(b.response, 500); if (resp.length < 5) invalid("A response of at least 5 characters is required.");
    x.status = "Answered"; x.response = resp; x.answeredBy = t.actor.name; await save(t, rec);
    await t.audit("audit.ir.answered", `${a.id} ${x.id} by ${t.actor.name}`, "Audit");
    await t.notify(x.byId, `${t.actor.name} answered your information request ${x.id} on ${a.name}.`);
    return {};
  });
  /** Management closes an answered request (so a request the auditor never closes cannot block completion); the auditor closes any. */
  const closeIr = wsRoute(h, "audits", async (d, r, c) => tx(d, c, async (t) => {
    await sweepAudits(t); const rec = await load(t, r.path[2]); const a = rec.data; const me = c.actor;
    if (me.role === "auditor" && (a.access.auditorId !== me.id || !live(a, isoDayOf(t.now)))) missing("Audit"); // nothing about another engagement is revealed
    if (a.stage === "Complete") invalid("This engagement is complete and locked.");
    const x = a.irs.find((y) => y.id === str(r.path[4], 20)) ?? missing("Request");
    if (x.status === "Closed") invalid("The request is already closed.");
    if (me.role !== "auditor") {
      refuse(manageBlock(me.role));
      if (x.status !== "Answered") refuse("Only the auditor can close a request that has not been answered.");
    }
    x.status = "Closed"; x.closedBy = me.name; await save(t, rec);
    await t.audit("audit.ir.closed", `${a.id} ${x.id} by ${me.name}`, "Audit");
    return ok({ ok: true });
  }));
  const raiseIr = auditor(async (t, rec, b) => {
    const a = rec.data; const item = txt(b.item, 500); if (item.length < 5) invalid("Describe what you need (at least 5 characters).");
    const id = `IR-${await t.next("audit-ir", 0)}`;
    a.irs.push({ id, item, by: t.actor.name, byId: t.actor.id, at: isoDayOf(t.now), status: "Open", response: "" }); await save(t, rec);
    await t.audit("audit.ir.raised", `${a.id} ${id} by ${t.actor.name}`, "Audit");
    for (const m of [a.createdById]) if (m) await t.notify(m, `${t.actor.name} raised an information request on ${a.name}: ${item.slice(0, 120)}`);
    return { id };
  });
  const draft = auditor(async (t, rec, b) => {
    const a = rec.data; const title = txt(b.title, 500); if (title.length < 10) invalid("Finding must be at least 10 characters.");
    const sev = str(b.sev, 10); if (!SEVS.includes(sev)) invalid("Unknown severity.");
    const id = `F-${await t.next("audit-finding", 0)}`;
    a.findings.push({ id, title, sev, status: "Draft", rec: txt(b.rec, 500), issue: "", draftedBy: t.actor.name, draftedById: t.actor.id }); await save(t, rec);
    await t.audit("audit.finding.drafted", `${a.id} ${id} (${sev}) by ${t.actor.name}`, "Audit");
    if (a.createdById) await t.notify(a.createdById, `${t.actor.name} drafted a finding on ${a.name} for your decision.`);
    return { id };
  });
  /** The engagement report (draft), for management and the assigned auditor while access is live. */
  const report = wsRoute(h, "audits", async (d, r, c) => tx(d, c, async (t) => {
    const rec = await load(t, r.path[2]); const a = rec.data;
    if (c.actor.role === "auditor" ? a.access.auditorId !== c.actor.id || !live(a, isoDayOf(t.now)) : !!manageBlock(c.actor.role)) missing("Audit");
    const lines = [`${a.name} (DRAFT REPORT)`, `Framework: ${a.fw}. Auditor: ${a.auditor}${a.access.auditor ? ` (${a.access.auditor})` : ""}. Stage: ${a.stage}.`, `Scope: ${a.scope}`, "",
      "Requests (PBC)", ...a.pbc.map((p) => `  ${p.id} ${p.item} — ${p.owner}, ${p.status}`), "", "Information requests", ...a.irs.map((x) => `  ${x.id} ${x.item} — ${x.status}${x.response ? `: ${x.response}` : ""}`),
      "", "Findings", ...a.findings.filter((f) => f.status !== "Draft").map((f) => `  ${f.id} [${f.sev}] ${f.title} — ${f.status}${f.issue ? `, issue ${f.issue}` : ""}${f.rec ? `. Recommendation: ${f.rec}` : ""}`),
      "", `Generated ${new Date(t.now).toISOString().slice(0, 16).replace("T", " ")} UTC by ${c.actor.name}. Draft only: requires review by qualified personnel before use.`];
    await t.audit("audit.report.generated", `${a.id} ${a.name}`, "Audit");
    return ok({ fileName: `${a.id}-report.txt`, content: lines.join("\n") + "\n" });
  }));
  /** A risk register snapshot shared with this engagement's auditor (taken while their access ran). */
  const snapshot = wsRoute(h, "audits", async (d, r, c) => tx(d, c, async (t) => {
    const rec = await load(t, r.path[2]); const a = rec.data;
    if (c.actor.role === "auditor" ? a.access.auditorId !== c.actor.id || !live(a, isoDayOf(t.now)) : !!manageBlock(c.actor.role)) missing("Audit");
    const s = (await t.get<RiskSnapshot>("risk-snapshot", str(r.path[4], 20))) ?? missing("Snapshot");
    if (!inWindow(a, s.data.at, t.now)) missing("Snapshot");
    await t.audit("risk.register.snapshot.downloaded", `${s.id} (SHA-256 ${s.data.sha256}) for ${a.id} by ${c.actor.name}`, "Risk");
    return ok(c.actor.role === "auditor" ? withoutMemberIds(s.data) : s.data); // the external auditor: names, never member ids
  }));

  /* ----- the company audit log (company admins) ----- */
  const logRoute = (fn: (d: Deps, t: WsTx, b: Record<string, unknown>, q: Record<string, unknown>) => Promise<unknown>) => wsRoute(h, "auditlog", async (d, r, c) => {
    refuse(roleBlock(c.actor.role, "reading the audit log", "admin"));
    return tx(d, c, async (t) => ok(await fn(d, t, r.body, r.body)));
  });
  const shape = (e: CompanyAuditEntry) => ({ seq: e.chainN, at: new Date(e.at).toISOString().slice(0, 16).replace("T", " "), actor: e.actor, action: e.action, target: e.target, cat: e.cat, hash: e.hash, prev: e.prevHash });
  const logData = logRoute(async (_d, t) => ({
    entries: (await t.auditPage(null, 500)).map(shape), verification: (await t.get<{ at: string; by: string; firstBad: number | null; entries: number }>("audit-verify", "last"))?.data ?? null,
    packages: (await t.list<{ id: string; at: string; by: string; entries: number; sha: string }>("audit-package")).map((x) => x.data).reverse(),
  }));
  const verify = logRoute(async (_d, t) => {
    const bad = await t.auditVerify(); const n = (await t.auditPage(null, 1))[0]?.chainN ?? 0;
    const last = { at: stamp(t.now), by: t.actor.name, firstBad: bad, entries: n }; const prev = await t.get("audit-verify", "last");
    if (prev) await t.update("audit-verify", "last", last, prev.version); else await t.insert("audit-verify", "last", last);
    await t.audit("auditlog.chain.verified", bad == null ? `intact, ${n} entries` : `BROKEN at entry ${bad}`, "System");
    return { intact: bad == null, entries: n, firstBad: bad };
  });
  /** At most 10 exports an hour per company (application security spec). */
  const exportLimit = async (t: WsTx) => { // an hourly counter taken under the counter's row lock, so parallel requests cannot all pass
    const n = await t.next(`auditx-${Math.floor(t.now / 3600_000)}`, 0);
    if (n > 10) invalid("At most 10 exports an hour. Try again later.");
  };
  /** The newest 5,000 entries (newest first). */
  const newest = async (t: WsTx) => {
    const rows: CompanyAuditEntry[] = []; let before: number | null = null;
    for (let i = 0; i < 10; i++) { const page = await t.auditPage(before, 500); rows.push(...page); if (page.length < 500) break; before = page[page.length - 1].chainN; }
    return rows;
  };
  const exportLog = logRoute(async (_d, t, b) => {
    const format = str(b.format, 4); if (format !== "json" && format !== "csv") invalid("Choose JSON or CSV.");
    await exportLimit(t);
    const rows = await newest(t);
    const cell = (v: unknown) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const content = format === "json" ? JSON.stringify(rows.map(shape), null, 2)
      : ["chain_n,at,actor,action,target,cat,hash,prev_hash", ...rows.map((e) => [e.chainN, new Date(e.at).toISOString(), e.actor, e.action, e.target, e.cat, e.hash, e.prevHash].map(cell).join(","))].join("\r\n");
    await t.audit("auditlog.exported", `${rows.length} entries, ${format.toUpperCase()}`, "System");
    return { fileName: `workspace-audit-log.${format}`, type: format === "json" ? "application/json" : "text/csv", content };
  });
  const pack = logRoute(async (_d, t) => {
    await exportLimit(t);
    const rows = (await newest(t)).map(shape).reverse();
    const body = JSON.stringify(rows); const sha = createHash("sha256").update(body).digest("hex");
    const id = `WEXP-${String(await t.next("audit-package", 0)).padStart(3, "0")}`; const at = new Date(t.now).toISOString();
    await t.insert("audit-package", id, { id, at: at.slice(0, 16).replace("T", " "), by: t.actor.name, entries: rows.length, sha });
    await t.audit("evidence.package.generated", `${id}, ${rows.length} entries, SHA-256 ${sha}`, "System");
    return { fileName: `${id}.json`, content: JSON.stringify({ package: id, generated: at, generatedBy: t.actor.name, entries: rows, manifest: { algorithm: "SHA-256", entries: rows.length, sha256: sha, firstBad: await t.auditVerify() },
      note: "Evidence package for an auditor. manifest.sha256 is the SHA-256 of JSON.stringify(entries) (compact, no spaces); each entry also carries the server's own hash chain." }, null, 2) };
  });

  return {
    "GET ws/data/audits": data, "POST ws/audits": create,
    "POST ws/audits/:id/auditor-access": grant, "POST ws/audits/:id/shared": share, "POST ws/audits/:id/auditor-access/end": end, "POST ws/audits/:id/populations/freeze": freeze,
    "POST ws/audits/:id/advance": advance, "POST ws/audits/:id/pbc": addPbc, "POST ws/audits/:id/pbc/:pid/advance": advancePbc,
    "POST ws/audits/:id/findings": draft, "POST ws/audits/:id/findings/:fid/issue": promote, "POST ws/audits/:id/findings/:fid/reject": reject,
    "POST ws/audits/:id/information-requests": raiseIr, "POST ws/audits/:id/information-requests/:rid/respond": respond, "POST ws/audits/:id/information-requests/:rid/close": closeIr,
    "POST ws/audits/:id/report": report, "GET ws/audits/:id/snapshots/:sid": snapshot,
    "GET ws/data/auditlog": logData, "POST ws/auditlog/verify": verify, "POST ws/auditlog/exports": exportLog, "POST ws/auditlog/packages": pack,
  };
}
