/* Server-only. "Ask a question" in the Help centre (reference review R4, migration 0011). A company member asks Selvara support a question
   from their workspace; platform staff answer it in the Admin Console's support inbox. The asker sees only their own questions; staff see
   every question but nothing else of the company (the asker's and company's names are copied in when asked). Each step writes an audit
   entry (the company's log for the asker's steps, the platform's log for staff steps); the asker is told in the app, and by email when email
   is set up. The database enforces who may read and write (0011); MemoryHelpDesk is the stand-in for the server tests. */
import { randomUUID } from "node:crypto";
import type { Ctx, Req, Res } from "./core";
import type { Db, Tx } from "./db";
import { auditArgs, auditSql } from "./directory";
import { sendMail } from "./mail";
import type { AuditRow, Deps, Profile, Store } from "./types";

export type QStatus = "Open" | "Answered" | "Closed";
export interface HelpMsg { at: number; by: string; staff: boolean; text: string }
export interface HelpQ { id: string; ref: string; tenantId: string; company: string; askerId: string; asker: string; topic: string; subject: string; status: QStatus; createdAt: number; updatedAt: number; messages: HelpMsg[] }
export const HELP_TOPICS = ["getting-started", "controls-evidence", "risk", "vendors", "audits", "ai", "account-security", "billing", "other"] as const;
export const SUBJECT_MIN = 5, SUBJECT_MAX = 160, BODY_MAX = 4000, OPEN_MAX = 10;
export const refOf = (id: string) => `HQ-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

export interface HelpDesk {
  /* the asker's side (a company session) */
  ask(tenantId: string, userId: string, q: { company: string; asker: string; topic: string; subject: string; body: string }, at: number, entry: (ref: string) => AuditRow): Promise<HelpQ>;
  mine(tenantId: string, userId: string): Promise<HelpQ[]>;
  /** A follow-up on the asker's own question that is not closed (it opens again). Null when it is not theirs or is closed. */
  followUp(tenantId: string, userId: string, asker: string, id: string, text: string, at: number, entry: (ref: string) => AuditRow): Promise<HelpQ | null>;
  /** The asker closes their own question. Null when it is not theirs or is already closed. */
  closeMine(tenantId: string, userId: string, id: string, at: number, entry: (ref: string) => AuditRow): Promise<HelpQ | null>;
  /* platform staff */
  inbox(userId: string): Promise<HelpQ[]>;
  /** Staff answer (the question becomes Answered). Null when not found. */
  answer(userId: string, staffName: string, id: string, text: string, at: number, entry: (ref: string) => AuditRow): Promise<HelpQ | null>;
  /** Staff close or reopen a question. Null when not found or already in that status. */
  setStatus(userId: string, id: string, status: "Open" | "Closed", at: number, entry: (ref: string) => AuditRow): Promise<HelpQ | null>;
}

const n = (v: unknown) => Number(v);
const qRow = (r: Record<string, unknown>, msgs: HelpMsg[]): HelpQ => ({ id: String(r.id), ref: refOf(String(r.id)), tenantId: String(r.tenant_id), company: String(r.company_name), askerId: String(r.asker_id),
  asker: String(r.asker_name), topic: String(r.topic), subject: String(r.subject), status: r.status as QStatus, createdAt: n(r.created_ms), updatedAt: n(r.updated_ms), messages: msgs });
const mRow = (r: Record<string, unknown>): HelpMsg => ({ at: n(r.at_ms), by: String(r.author_name), staff: !!r.staff, text: String(r.body) });

export class PgHelpDesk implements HelpDesk {
  constructor(private db: Db) {}
  private co<T>(tenantId: string, userId: string, work: (q: Tx) => Promise<T>) { return this.db.tx<T>({ tenantId, userId }, work); }
  private plat<T>(userId: string, work: (q: Tx) => Promise<T>) { return this.db.tx<T>({ tenantId: null, userId, platform: true }, work); }
  /** Questions with their messages; row level security decides which questions are visible. */
  private async load(q: Tx, where: string, args: unknown[]): Promise<HelpQ[]> {
    const qs = await q.query(`select * from support_questions ${where} order by updated_ms desc limit 200`, args);
    if (!qs.length) return [];
    const ms = await q.query("select * from support_messages where question_id = any($1::uuid[]) order by at_ms, id", [qs.map((x) => x.id)]);
    return qs.map((x) => qRow(x, ms.filter((m) => m.question_id === x.id).map(mRow)));
  }
  async ask(tenantId: string, userId: string, a: { company: string; asker: string; topic: string; subject: string; body: string }, at: number, entry: (ref: string) => AuditRow) {
    return this.co(tenantId, userId, async (q) => {
      const r = await q.query<{ id: string }>(`insert into support_questions (tenant_id, asker_id, asker_name, company_name, topic, subject, status, created_ms, updated_ms)
        values ($1, $2, $3, $4, $5, $6, 'Open', $7, $7) returning id`, [tenantId, userId, a.asker, a.company, a.topic, a.subject, at]);
      const id = r[0].id;
      await q.query("insert into support_messages (question_id, author_id, author_name, staff, body, at_ms) values ($1, $2, $3, false, $4, $5)", [id, userId, a.asker, a.body, at]);
      await q.query(auditSql, auditArgs(entry(refOf(id))));
      return (await this.load(q, "where id = $1", [id]))[0];
    });
  }
  async mine(tenantId: string, userId: string) { return this.co(tenantId, userId, (q) => this.load(q, "where tenant_id = $1 and asker_id = $2", [tenantId, userId])); }
  async followUp(tenantId: string, userId: string, asker: string, id: string, text: string, at: number, entry: (ref: string) => AuditRow) {
    return this.co(tenantId, userId, async (q) => {
      const u = await q.query("update support_questions set status = 'Open', updated_ms = greatest(updated_ms, $4) where id = $1 and tenant_id = $2 and asker_id = $3 and status <> 'Closed' returning id", [id, tenantId, userId, at]);
      if (!u.length) return null;
      await q.query("insert into support_messages (question_id, author_id, author_name, staff, body, at_ms) values ($1, $2, $3, false, $4, $5)", [id, userId, asker, text, at]);
      await q.query(auditSql, auditArgs(entry(refOf(id))));
      return (await this.load(q, "where id = $1", [id]))[0];
    });
  }
  async closeMine(tenantId: string, userId: string, id: string, at: number, entry: (ref: string) => AuditRow) {
    return this.co(tenantId, userId, async (q) => {
      const u = await q.query("update support_questions set status = 'Closed', updated_ms = greatest(updated_ms, $4) where id = $1 and tenant_id = $2 and asker_id = $3 and status <> 'Closed' returning id", [id, tenantId, userId, at]);
      if (!u.length) return null;
      await q.query(auditSql, auditArgs(entry(refOf(id))));
      return (await this.load(q, "where id = $1", [id]))[0];
    });
  }
  async inbox(userId: string) { return this.plat(userId, (q) => this.load(q, "", [])); }
  async answer(userId: string, staffName: string, id: string, text: string, at: number, entry: (ref: string) => AuditRow) {
    return this.plat(userId, async (q) => {
      const u = await q.query("update support_questions set status = 'Answered', updated_ms = greatest(updated_ms, $2) where id = $1 returning id", [id, at]);
      if (!u.length) return null;
      await q.query("insert into support_messages (question_id, author_id, author_name, staff, body, at_ms) values ($1, $2, $3, true, $4, $5)", [id, userId, staffName, text, at]);
      await q.query(auditSql, auditArgs(entry(refOf(id))));
      return (await this.load(q, "where id = $1", [id]))[0];
    });
  }
  async setStatus(userId: string, id: string, status: "Open" | "Closed", at: number, entry: (ref: string) => AuditRow) {
    return this.plat(userId, async (q) => {
      const u = await q.query("update support_questions set status = $2, updated_ms = greatest(updated_ms, $3) where id = $1 and status <> $2 returning id", [id, status, at]);
      if (!u.length) return null;
      await q.query(auditSql, auditArgs(entry(refOf(id))));
      return (await this.load(q, "where id = $1", [id]))[0];
    });
  }
}

/** In-memory help desk for the server tests (the same rules as the database policies). */
export class MemoryHelpDesk implements HelpDesk {
  list: HelpQ[] = [];
  constructor(private store: Store) {}
  private copy = (x: HelpQ): HelpQ => ({ ...x, messages: x.messages.map((m) => ({ ...m })) });
  async ask(tenantId: string, userId: string, a: { company: string; asker: string; topic: string; subject: string; body: string }, at: number, entry: (ref: string) => AuditRow) {
    const id = randomUUID();
    const x: HelpQ = { id, ref: refOf(id), tenantId, company: a.company, askerId: userId, asker: a.asker, topic: a.topic, subject: a.subject, status: "Open", createdAt: at, updatedAt: at, messages: [{ at, by: a.asker, staff: false, text: a.body }] };
    this.list.unshift(x); await this.store.audit(entry(x.ref)); return this.copy(x);
  }
  async mine(tenantId: string, userId: string) { return this.list.filter((x) => x.tenantId === tenantId && x.askerId === userId).map(this.copy); }
  async followUp(tenantId: string, userId: string, asker: string, id: string, text: string, at: number, entry: (ref: string) => AuditRow) {
    const x = this.list.find((q) => q.id === id && q.tenantId === tenantId && q.askerId === userId && q.status !== "Closed"); if (!x) return null;
    x.status = "Open"; x.updatedAt = Math.max(x.updatedAt, at); x.messages.push({ at, by: asker, staff: false, text });
    await this.store.audit(entry(x.ref)); return this.copy(x);
  }
  async closeMine(tenantId: string, userId: string, id: string, at: number, entry: (ref: string) => AuditRow) {
    const x = this.list.find((q) => q.id === id && q.tenantId === tenantId && q.askerId === userId && q.status !== "Closed"); if (!x) return null;
    x.status = "Closed"; x.updatedAt = Math.max(x.updatedAt, at); await this.store.audit(entry(x.ref)); return this.copy(x);
  }
  async inbox() { return [...this.list].sort((a, b) => b.updatedAt - a.updatedAt).map(this.copy); }
  async answer(_userId: string, staffName: string, id: string, text: string, at: number, entry: (ref: string) => AuditRow) {
    const x = this.list.find((q) => q.id === id); if (!x) return null;
    x.status = "Answered"; x.updatedAt = Math.max(x.updatedAt, at); x.messages.push({ at, by: staffName, staff: true, text });
    await this.store.audit(entry(x.ref)); return this.copy(x);
  }
  async setStatus(_userId: string, id: string, status: "Open" | "Closed", at: number, entry: (ref: string) => AuditRow) {
    const x = this.list.find((q) => q.id === id && q.status !== status); if (!x) return null;
    x.status = status; x.updatedAt = Math.max(x.updatedAt, at); await this.store.audit(entry(x.ref)); return this.copy(x);
  }
}

/* ---------- routes ---------- */
type H = (d: Deps, r: Req) => Promise<Res>;
type Handler = (d: Deps, r: Req, c: Ctx) => Promise<Res>;
export interface HelpHelpers {
  signed: (h: Handler) => H;
  entry: (d: Deps, r: Req, p: Profile, a: Ctx["a"], action: string, target: string) => AuditRow;
  notify: (d: Deps, userId: string, text: string) => Promise<void>;
}
const ok = (body?: unknown): Res => ({ status: body === undefined ? 204 : 200, body });
const err = (status: number, error: string): Res => ({ status, body: { error } });
const clean = (v: unknown, max: number) => String(v ?? "").replace(/\u0000/g, "").replace(/\r\n?/g, "\n").trim().slice(0, max);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Where staff are told about a new question by email, when set (optional). */
const inboxAddress = () => String(process.env.SUPPORT_INBOX_EMAIL ?? "").trim();
/** The asker's view: their own questions; the staff view: every question, with the company. */
const view = (x: HelpQ, staff: boolean) => (staff ? x : { ...x, tenantId: undefined, askerId: undefined });

export function helpRoutes(h: HelpHelpers): Record<string, H> {
  const off = err(503, "The Help centre's questions are not set up on this deployment.");
  const member = (fn: Handler) => h.signed(async (d, r, c) => (!d.help ? off : c.a.company && !c.a.platform ? fn(d, r, c) : err(403, "Questions are asked from a company workspace.")));
  const staff = (fn: Handler) => h.signed(async (d, r, c) => (!d.help ? off : c.a.platform ? fn(d, r, c) : err(403, "Not permitted.")));
  const link = (d: Deps, path: string) => `${d.site.origin}${path}`;

  const mine = member(async (d, _r, c) => ok({ questions: (await d.help!.mine(c.a.company!.id, c.p.id)).map((x) => view(x, false)), topics: HELP_TOPICS }));
  const ask = member(async (d, r, c) => {
    const subject = clean(r.body.subject, SUBJECT_MAX + 1); const body = clean(r.body.body, BODY_MAX + 1); const topic = String(r.body.topic ?? "");
    if (subject.length < SUBJECT_MIN || subject.length > SUBJECT_MAX) return err(400, `Write a subject of ${SUBJECT_MIN} to ${SUBJECT_MAX} characters.`);
    if (!body) return err(400, "Write your question.");
    if (body.length > BODY_MAX) return err(400, `Keep the question under ${BODY_MAX} characters.`);
    if (!(HELP_TOPICS as readonly string[]).includes(topic)) return err(400, "Choose a topic.");
    const open = (await d.help!.mine(c.a.company!.id, c.p.id)).filter((x) => x.status !== "Closed").length;
    if (open >= OPEN_MAX) return err(429, `You have ${OPEN_MAX} open questions. Close one you no longer need first.`);
    const at = d.now();
    const x = await d.help!.ask(c.a.company!.id, c.p.id, { company: c.a.company!.name, asker: c.p.person, topic, subject, body }, at,
      (ref) => h.entry(d, r, c.p, c.a, "help.question.asked", `${ref}: ${subject}`));
    const to = inboxAddress();
    if (to) await sendMail(d, to, { t: "help-question", ref: x.ref, company: c.a.company!.name, subject, link: link(d, "/admin/customers?view=questions") }, { tenantId: null, actor: "Selvara", ip: r.ip });
    return ok({ question: view(x, false) });
  });
  const follow = member(async (d, r, c) => {
    const id = String(r.path[2] ?? ""); if (!UUID_RE.test(id)) return err(404, "Question not found.");
    const text = clean(r.body.text, BODY_MAX + 1); if (!text) return err(400, "Write your message."); if (text.length > BODY_MAX) return err(400, `Keep it under ${BODY_MAX} characters.`);
    const x = await d.help!.followUp(c.a.company!.id, c.p.id, c.p.person, id, text, d.now(), (ref) => h.entry(d, r, c.p, c.a, "help.question.followed_up", ref));
    return x ? ok({ question: view(x, false) }) : err(409, "This question is closed or is not yours. Ask a new one.");
  });
  const closeMine = member(async (d, r, c) => {
    const id = String(r.path[2] ?? ""); if (!UUID_RE.test(id)) return err(404, "Question not found.");
    const x = await d.help!.closeMine(c.a.company!.id, c.p.id, id, d.now(), (ref) => h.entry(d, r, c.p, c.a, "help.question.closed", ref));
    return x ? ok({ question: view(x, false) }) : err(409, "This question is already closed or is not yours.");
  });

  const inbox = staff(async (d, _r, c) => ok({ questions: await d.help!.inbox(c.p.id), mail: !!inboxAddress() }));
  const answer = staff(async (d, r, c) => {
    const id = String(r.path[2] ?? ""); if (!UUID_RE.test(id)) return err(404, "Question not found.");
    const text = clean(r.body.text, BODY_MAX + 1); if (!text) return err(400, "Write the answer."); if (text.length > BODY_MAX) return err(400, `Keep it under ${BODY_MAX} characters.`);
    const x = await d.help!.answer(c.p.id, c.p.person, id, text, d.now(), (ref) => h.entry(d, r, c.p, c.a, "platform.help.answered", ref));
    if (!x) return err(404, "Question not found.");
    // the asker is told in the app, and by email when email is set up (the answer itself stays in Selvara)
    await h.notify(d, x.askerId, `Selvara support answered your question ${x.ref}: ${x.subject.slice(0, 80)}`);
    const p = await d.store.profileById(x.askerId);
    if (p?.email) await sendMail(d, p.email, { t: "help-answered", ref: x.ref, subject: x.subject, link: link(d, `/help/questions?q=${x.id}`) }, { tenantId: x.tenantId, actor: "Selvara support", ip: r.ip });
    return ok({ question: x });
  });
  const setStatus = staff(async (d, r, c) => {
    const id = String(r.path[2] ?? ""); if (!UUID_RE.test(id)) return err(404, "Question not found.");
    const to = r.path[3] === "close" ? "Closed" : "Open";
    const x = await d.help!.setStatus(c.p.id, id, to, d.now(), (ref) => h.entry(d, r, c.p, c.a, to === "Closed" ? "platform.help.closed" : "platform.help.reopened", ref));
    return x ? ok({ question: x }) : err(409, `This question is already ${to.toLowerCase()}.`);
  });

  return {
    "GET help/questions": mine, "POST help/questions": ask, "POST help/questions/:id/follow-up": follow, "POST help/questions/:id/close": closeMine,
    "GET admin/help": inbox, "POST admin/help/:id/answer": answer, "POST admin/help/:id/close": setStatus, "POST admin/help/:id/reopen": setStatus,
  };
}
