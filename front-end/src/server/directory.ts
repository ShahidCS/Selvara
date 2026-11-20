/* Server-only. Companies, memberships, platform staff and per-company settings (migrations 0003 and 0004). The production directory runs every
   query as `selvara_app` inside a transaction that carries the person and, where one is chosen, the company (db.ts), so row level security
   refuses another company's rows even if a query here forgot its filter. Changes write their audit entry in the same transaction.
   MemoryDirectory is the stand-in for the server tests. */
import { approvalBlock, INVITE_TTL_H, withdrawBlock } from "@/lib/rules";
import type { Db, Tx } from "./db";
import type { AuditRow, Store } from "./types";

export interface Company { id: string; ref: string; name: string }
export type MemberStatus = "Pending" | "Active" | "Suspended" | "Removed";
export interface Membership { company: Company; role: string; status: MemberStatus }
export interface MemberRow { userId: string; person: string; email: string; role: string; status: MemberStatus; since: number; decidedAt?: number }
export interface Lockout { preset: string; custom?: { attempts: number; minutes: number } }
export type PlatformRole = "super" | "support";
export type ApprovalStatus = "Pending" | "Approved" | "Rejected" | "Withdrawn" | "Expired";
export interface ApprovalVote { by: string; byName: string; at: number; reason: string }
/** A four-eyes request in a company (approvals and approval_votes, migration 0003). `subject` is the member's id (team-role) or email (team-invite). */
export interface ApprovalRow { id: string; kind: string; title: string; subject: string | null; payload: Record<string, unknown>; needs: number; approverRoles: string[]; forbid: string[]; requestedBy: string; requestedByName: string; status: ApprovalStatus; createdAt: number; expiresAt: number; decidedReason?: string; votes: ApprovalVote[] }
export interface NewApproval { kind: "team-role" | "team-invite"; title: string; subject: string; payload: Record<string, unknown>; needs: 1 | 2; approverRoles: string[]; forbid: string[]; ttlMs: number }
export type InvitationStatus = "Pending" | "Accepted" | "Revoked" | "Expired";
export interface InvitationRow { id: string; email: string; role: string; status: InvitationStatus; invitedBy: string; createdAt: number; expiresAt: number; linkAt?: number; approvalId?: string }
/** The result of a decision: done, or refused with the HTTP status and the reason (404 for another company's request, never 403). */
export type Outcome = { ok: true; status: ApprovalStatus } | { ok: false; code: 403 | 404 | 409; error: string };
/** Builds an audit entry for the acting person (core.ts knows the name, address and company). */
export type Log = (action: string, target: string) => AuditRow;

export interface Directory {
  /** The person's platform role, if they are active platform staff. */
  platformRole(userId: string): Promise<PlatformRole | null>;
  /** The active companies the person is an active member of, by name. */
  companiesOf(userId: string): Promise<{ company: Company; role: string }[]>;
  /** The person's membership in one company (any status), or null. */
  membership(tenantId: string, userId: string): Promise<Membership | null>;
  /** The id of the active company with this code, or null. */
  companyByCode(code: string): Promise<string | null>;
  /** Adds a pending membership (or reopens a removed one). False when the person already has one. */
  requestToJoin(tenantId: string, userId: string, at: number, entry: AuditRow): Promise<boolean>;
  members(tenantId: string, actorId: string, status?: MemberStatus): Promise<MemberRow[]>;
  /** Decides a pending membership. False when it is no longer pending. */
  decide(tenantId: string, actorId: string, userId: string, to: "Active" | "Removed", reason: string, at: number, entry: AuditRow): Promise<boolean>;
  /** The company's own lockout setting (standard when none is stored). */
  lockoutOf(tenantId: string, actorId: string): Promise<Lockout>;
  /** Lockout settings of every company the person is an active member of. */
  lockoutsOf(userId: string): Promise<Lockout[]>;
  setLockout(tenantId: string, actorId: string, lockout: Lockout, at: number, entry: AuditRow): Promise<void>;

  /* Role changes and invitations (slice 2c, migration 0005). */
  /** Ids of the company's active admins. */
  admins(tenantId: string, actorId: string): Promise<string[]>;
  /** Changes an active member's role from `from` to `to`. False when the member or their role changed meanwhile, or the change would leave no admin. */
  setRole(tenantId: string, actorId: string, userId: string, from: string, to: string, at: number, entry: AuditRow): Promise<boolean>;
  /** True when an unexpired request of this kind is open for this subject. */
  pendingApproval(tenantId: string, actorId: string, kind: string, subject: string, at: number): Promise<boolean>;
  requestApproval(tenantId: string, actorId: string, a: NewApproval, at: number, entry: AuditRow): Promise<string>;
  /** The company's most recent requests (100), newest first. */
  approvals(tenantId: string, actorId: string): Promise<ApprovalRow[]>;
  /** Records a vote or a rejection under a row lock; the last vote applies the change in the same transaction (or nothing happens). */
  decideApproval(tenantId: string, actor: { id: string; role: string }, id: string, approve: boolean, reason: string, at: number, log: Log): Promise<Outcome>;
  withdrawApproval(tenantId: string, actor: { id: string; role: string }, id: string, at: number, log: Log): Promise<Outcome>;
  invitations(tenantId: string, actorId: string): Promise<InvitationRow[]>;
  /** A new pending invitation (72 hours). Null when one is already pending for the email. */
  createInvitation(tenantId: string, actorId: string, inv: { email: string; role: string; tokenHash: string | null; approvalId?: string }, at: number, entry: AuditRow): Promise<string | null>;
  /** Replaces the invitation's link (the old one stops working). Null when it is not pending or has expired. */
  setInvitationLink(tenantId: string, actorId: string, id: string, tokenHash: string, at: number, entry: AuditRow): Promise<InvitationRow | null>;
  revokeInvitation(tenantId: string, actorId: string, id: string, at: number, entry: AuditRow): Promise<boolean>;
  /** The pending invitation with this link, in an active company, or null. */
  invitationByToken(tokenHash: string): Promise<{ id: string; tenantId: string; email: string; role: string; expiresAt: number } | null>;
  /** Uses the invitation: the person becomes an active member with the invited role. False when it was used, revoked or expired meanwhile, or
   *  the person is already an active member. */
  acceptInvitation(tenantId: string, userId: string, id: string, at: number, entry: AuditRow): Promise<boolean>;
}

/** Thrown when an approved change can no longer be applied. The Postgres directory catches it inside the transaction and rolls back to a savepoint
 *  taken before the vote, so the vote and the change are undone together. */
export class ApplyConflict extends Error {}
const INVITE_MS = INVITE_TTL_H * 3600_000;
const facts = (a: ApprovalRow) => ({ status: a.status, expiresAt: a.expiresAt, approverRoles: a.approverRoles, requestedBy: a.requestedBy, forbid: a.forbid, votes: a.votes.map((v) => v.by) });
/** The engine's rules, shared by both directories: who may decide (rules.ts), then expiry and state. */
export function refuse(a: ApprovalRow | undefined, actor: { id: string; role: string }, at: number): Outcome | null {
  if (!a) return { ok: false, code: 404, error: "Request not found." };
  if (a.status === "Expired" || (a.status === "Pending" && a.expiresAt <= at)) return { ok: false, code: 409, error: "Request has expired." };
  if (a.status !== "Pending") return { ok: false, code: 409, error: `Request is ${a.status.toLowerCase()}.` };
  const why = approvalBlock({ key: actor.id, base: actor.role }, facts(a), at);
  return why ? { ok: false, code: 403, error: why } : null;
}
export const names = (a: ApprovalRow, extra?: string) => [...a.votes.map((v) => v.byName), ...(extra ? [extra] : [])].join(", ");

const LIMIT = 500;
export const auditSql = "insert into audit_log (at_ms, actor, action, target, cat, space, ip, tenant_id, actor_id) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)";
export const auditArgs = (a: AuditRow) => [a.at, a.actor, a.action, a.target, a.cat, a.space, a.ip, a.tenantId ?? null, a.actorId ?? null];
const row = (r: Record<string, unknown>): MemberRow => ({ userId: String(r.user_id), person: String(r.person), email: String(r.email), role: String(r.role), status: r.status as MemberStatus, since: Number(r.created_ms), decidedAt: r.decided_ms == null ? undefined : Number(r.decided_ms) });

export class PgDirectory implements Directory {
  constructor(private db: Db) {}
  async platformRole(userId: string) {
    const r = await this.db.tx({ tenantId: null, userId }, (q) => q.query<{ role: PlatformRole }>("select role from platform_staff where user_id = $1 and status = 'Active'", [userId]));
    return r[0]?.role ?? null;
  }
  async companiesOf(userId: string) {
    const r = await this.db.tx({ tenantId: null, userId }, (q) => q.query<{ id: string; ref: string; name: string; role: string }>(
      "select t.id, t.ref, t.name, m.role from memberships m join tenants t on t.id = m.tenant_id where m.user_id = $1 and m.status = 'Active' and t.status = 'Active' order by t.name, t.ref", [userId]));
    return r.map((x) => ({ company: { id: x.id, ref: x.ref, name: x.name }, role: x.role }));
  }
  async membership(tenantId: string, userId: string) {
    const r = await this.db.tx({ tenantId, userId }, (q) => q.query<{ role: string; status: MemberStatus; ref: string; name: string }>(
      "select m.role, m.status, t.ref, t.name from memberships m join tenants t on t.id = m.tenant_id where m.tenant_id = $1 and m.user_id = $2 and t.status = 'Active'", [tenantId, userId]));
    return r[0] ? { company: { id: tenantId, ref: r[0].ref, name: r[0].name }, role: r[0].role, status: r[0].status } : null;
  }
  async companyByCode(code: string) {
    const r = await this.db.tx({ tenantId: null, userId: null }, (q) => q.query<{ id: string | null }>("select tenant_id_by_ref($1) as id", [code]));
    return r[0]?.id ?? null;
  }
  async requestToJoin(tenantId: string, userId: string, at: number, entry: AuditRow) {
    return this.db.tx({ tenantId, userId }, async (q) => {
      const r = await q.query(`insert into memberships (tenant_id, user_id, role, status, created_ms) values ($1, $2, 'employee', 'Pending', $3)
        on conflict (tenant_id, user_id) do update set status = 'Pending', role = 'employee', created_ms = $3, decided_by = null, decided_ms = null, reason = null
        where memberships.status = 'Removed' returning user_id`, [tenantId, userId, at]);
      if (r.length) await q.query(auditSql, auditArgs(entry));
      return r.length === 1;
    });
  }
  async members(tenantId: string, actorId: string, status?: MemberStatus) {
    const r = await this.db.tx({ tenantId, userId: actorId }, (q) => q.query(
      `select m.user_id, p.person, p.email, m.role, m.status, m.created_ms, m.decided_ms from memberships m join profiles p on p.id = m.user_id
       where m.tenant_id = $1 and ($2::text is null or m.status = $2) order by p.person limit ${LIMIT}`, [tenantId, status ?? null]));
    return r.map(row);
  }
  async decide(tenantId: string, actorId: string, userId: string, to: "Active" | "Removed", reason: string, at: number, entry: AuditRow) {
    return this.db.tx({ tenantId, userId: actorId }, async (q) => {
      const r = await q.query("update memberships set status = $3, decided_by = $4, reason = $5, decided_ms = $6 where tenant_id = $1 and user_id = $2 and status = 'Pending' returning user_id",
        [tenantId, userId, to, actorId, reason, at]);
      if (r.length) await q.query(auditSql, auditArgs(entry));
      return r.length === 1;
    });
  }
  async lockoutOf(tenantId: string, actorId: string) {
    const r = await this.db.tx({ tenantId, userId: actorId }, (q) => q.query<{ lockout: Lockout }>("select lockout from tenant_settings where tenant_id = $1", [tenantId]));
    return r[0]?.lockout ?? { preset: "standard" };
  }
  async lockoutsOf(userId: string) {
    const r = await this.db.tx({ tenantId: null, userId }, (q) => q.query<{ lockout: Lockout }>(
      "select s.lockout from tenant_settings s join memberships m on m.tenant_id = s.tenant_id where m.user_id = $1 and m.status = 'Active'", [userId]));
    return r.map((x) => x.lockout);
  }
  async setLockout(tenantId: string, actorId: string, lockout: Lockout, at: number, entry: AuditRow) {
    await this.db.tx({ tenantId, userId: actorId }, async (q) => {
      await q.query(`insert into tenant_settings (tenant_id, lockout, updated_by, updated_ms) values ($1, $2, $3, $4)
        on conflict (tenant_id) do update set lockout = excluded.lockout, updated_by = excluded.updated_by, updated_ms = excluded.updated_ms, version = tenant_settings.version + 1`,
        [tenantId, JSON.stringify(lockout), actorId, at]);
      await q.query(auditSql, auditArgs(entry));
    });
  }
  async admins(tenantId: string, actorId: string) {
    const r = await this.db.tx({ tenantId, userId: actorId }, (q) => q.query<{ user_id: string }>("select user_id from memberships where tenant_id = $1 and role = 'admin' and status = 'Active'", [tenantId]));
    return r.map((x) => x.user_id);
  }
  async setRole(tenantId: string, actorId: string, userId: string, from: string, to: string, at: number, entry: AuditRow) {
    return this.db.tx({ tenantId, userId: actorId }, async (q) => { const done = await changeRole(q, tenantId, userId, from, to); if (done) await q.query(auditSql, auditArgs(entry)); return done; });
  }
  async pendingApproval(tenantId: string, actorId: string, kind: string, subject: string, at: number) {
    const r = await this.db.tx({ tenantId, userId: actorId }, (q) => q.query("select 1 from approvals where tenant_id = $1 and kind = $2 and subject_ref = $3 and status = 'Pending' and expires_ms > $4 limit 1", [tenantId, kind, subject, at]));
    return r.length > 0;
  }
  async requestApproval(tenantId: string, actorId: string, a: NewApproval, at: number, entry: AuditRow) {
    return this.db.tx({ tenantId, userId: actorId }, async (q) => {
      const r = await q.query<{ id: string }>(`insert into approvals (tenant_id, kind, title, subject_ref, payload, needs, approver_roles, forbid, requested_by, created_ms, expires_ms, domain)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'ws') returning id`, [tenantId, a.kind, a.title, a.subject, JSON.stringify(a.payload), a.needs, a.approverRoles, a.forbid, actorId, at, at + a.ttlMs]);
      await q.query(auditSql, auditArgs({ ...entry, target: `${entry.target} (${r[0].id})` }));
      return r[0].id;
    });
  }
  async approvals(tenantId: string, actorId: string) { return this.db.tx({ tenantId, userId: actorId }, (q) => loadApprovals(q, tenantId)); }
  async decideApproval(tenantId: string, actor: { id: string; role: string }, id: string, approve: boolean, reason: string, at: number, log: Log): Promise<Outcome> {
    try {
      return await this.db.tx({ tenantId, userId: actor.id }, async (q) => {
        const a = (await loadApprovals(q, tenantId, id))[0];
        if (a && a.status === "Pending" && a.expiresAt <= at) {
          await q.query("update approvals set status = 'Expired' where id = $1", [id]); await q.query(auditSql, auditArgs(log(`approval.${a.kind}.expired`, `${a.title} (${a.id})`)));
        }
        const no = refuse(a, actor, at); if (no) return no;
        await q.query("savepoint decide");
        try { return await this.vote(q, tenantId, a, actor, approve, reason, at, log); }
        catch (e) { if (!(e instanceof ApplyConflict)) throw e; await q.query("rollback to savepoint decide"); return { ok: false, code: 409, error: e.message } as Outcome; }
      });
    } catch (e) { if (e instanceof ApplyConflict) return { ok: false, code: 409, error: e.message }; throw e; }
  }
  private async vote(q: Tx, tenantId: string, a: ApprovalRow, actor: { id: string; role: string }, approve: boolean, reason: string, at: number, log: Log): Promise<Outcome> {
    const id = a.id;
    if (!approve) {
      await q.query("update approvals set status = 'Rejected', decided_reason = $2 where id = $1", [id, reason]);
      await q.query(auditSql, auditArgs(log(`approval.${a.kind}.rejected`, `${a.title} (${a.id}); reason: ${reason}`)));
      return { ok: true, status: "Rejected" };
    }
    await q.query("insert into approval_votes (approval_id, by_user, at_ms, reason) values ($1, $2, $3, $4)", [id, actor.id, at, reason]);
    if (a.votes.length + 1 < a.needs) { await q.query(auditSql, auditArgs(log(`approval.${a.kind}.approval.recorded`, `${a.title} (${a.id})`))); return { ok: true, status: "Pending" }; }
    await q.query("update approvals set status = 'Approved', decided_reason = $2 where id = $1", [id, reason]);
    await q.query(auditSql, auditArgs(log(`approval.${a.kind}.approved`, `${a.title} (${a.id}); reason: ${reason}`)));
    await applyPg(q, tenantId, a, at, log, names(a, (await q.query<{ person: string }>("select person from profiles where id = $1", [actor.id]))[0]?.person));
    return { ok: true, status: "Approved" };
  }
  async withdrawApproval(tenantId: string, actor: { id: string; role: string }, id: string, at: number, log: Log): Promise<Outcome> {
    return this.db.tx({ tenantId, userId: actor.id }, async (q) => {
      const a = (await loadApprovals(q, tenantId, id))[0]; if (!a) return { ok: false, code: 404, error: "Request not found." };
      const why = withdrawBlock({ key: actor.id, base: actor.role }, a); if (why) return { ok: false, code: a.status !== "Pending" ? 409 : 403, error: why };
      await q.query("update approvals set status = 'Withdrawn' where id = $1", [id]);
      await q.query(auditSql, auditArgs(log(`approval.${a.kind}.withdrawn`, `${a.title} (${a.id})`)));
      return { ok: true, status: "Withdrawn" };
    });
  }
  async invitations(tenantId: string, actorId: string) {
    const r = await this.db.tx({ tenantId, userId: actorId }, (q) => q.query(`select i.id, i.email, i.role, i.status, coalesce(p.person, '') as person, i.created_ms, i.expires_ms, i.link_ms, i.approval_id
      from invitations i left join profiles p on p.id = i.invited_by where i.tenant_id = $1 order by i.created_ms desc limit ${LIMIT}`, [tenantId]));
    return r.map(inv);
  }
  async createInvitation(tenantId: string, actorId: string, i: { email: string; role: string; tokenHash: string | null; approvalId?: string }, at: number, entry: AuditRow) {
    return this.db.tx({ tenantId, userId: actorId }, async (q) => { const id = await insertInvitation(q, tenantId, actorId, i, at); if (id) await q.query(auditSql, auditArgs({ ...entry, target: `${entry.target}; ${id}` })); return id; });
  }
  async setInvitationLink(tenantId: string, actorId: string, id: string, tokenHash: string, at: number, entry: AuditRow) {
    return this.db.tx({ tenantId, userId: actorId }, async (q) => {
      const r = await q.query("update invitations set token_hash = $3, link_ms = $4 where tenant_id = $1 and id = $2 and status = 'Pending' and expires_ms > $4 returning id", [tenantId, id, tokenHash, at]);
      if (!r.length) return null;
      await q.query(auditSql, auditArgs(entry));
      return (await q.query(`select i.id, i.email, i.role, i.status, coalesce(p.person, '') as person, i.created_ms, i.expires_ms, i.link_ms, i.approval_id from invitations i left join profiles p on p.id = i.invited_by where i.id = $1`, [id])).map(inv)[0];
    });
  }
  async revokeInvitation(tenantId: string, actorId: string, id: string, at: number, entry: AuditRow) {
    return this.db.tx({ tenantId, userId: actorId }, async (q) => {
      const r = await q.query("update invitations set status = 'Revoked', token_hash = null, decided_ms = $3 where tenant_id = $1 and id = $2 and status = 'Pending' returning id", [tenantId, id, at]);
      if (r.length) await q.query(auditSql, auditArgs(entry));
      return r.length === 1;
    });
  }
  async invitationByToken(tokenHash: string) {
    const r = await this.db.tx({ tenantId: null, userId: null }, (q) => q.query<{ id: string; tenant_id: string; email: string; role: string; expires_ms: string }>("select * from invitation_by_token($1)", [tokenHash]));
    return r[0] ? { id: r[0].id, tenantId: r[0].tenant_id, email: r[0].email, role: r[0].role, expiresAt: Number(r[0].expires_ms) } : null;
  }
  async acceptInvitation(tenantId: string, userId: string, id: string, at: number, entry: AuditRow) {
    return this.db.tx({ tenantId, userId }, async (q) => {
      await q.query("savepoint accept");
      try { return await acceptPg(q, tenantId, userId, id, at, entry); }
      catch (e) { if (!(e instanceof ApplyConflict)) throw e; await q.query("rollback to savepoint accept"); return false; }
    });
  }
}

async function acceptPg(q: Tx, tenantId: string, userId: string, id: string, at: number, entry: AuditRow): Promise<boolean> {
  const i = await q.query<{ role: string }>(`update invitations set status = 'Accepted', token_hash = null, decided_ms = $3, accepted_by = $4
    where tenant_id = $1 and id = $2 and status = 'Pending' and expires_ms > $3 returning role`, [tenantId, id, at, userId]);
  if (!i.length) return false;
  const m = await q.query(`insert into memberships (tenant_id, user_id, role, status, invited_by, reason, created_ms, decided_ms)
    select $1, $2, $3, 'Active', invited_by, 'Accepted an invitation', $4, $4 from invitations where id = $5
    on conflict (tenant_id, user_id) do update set role = excluded.role, status = 'Active', invited_by = excluded.invited_by, reason = excluded.reason, decided_ms = excluded.decided_ms, decided_by = null
    where memberships.status <> 'Active' returning user_id`, [tenantId, userId, i[0].role, at, id]);
  if (!m.length) throw new ApplyConflict("already a member");
  await q.query(auditSql, auditArgs(entry));
  return true;
}

const inv = (r: Record<string, unknown>): InvitationRow => ({ id: String(r.id), email: String(r.email), role: String(r.role), status: r.status as InvitationStatus, invitedBy: String(r.person), createdAt: Number(r.created_ms), expiresAt: Number(r.expires_ms), linkAt: r.link_ms == null ? undefined : Number(r.link_ms), approvalId: (r.approval_id as string | null) ?? undefined });
/** Locks the company's admin rows first, so two concurrent demotions cannot both pass the last-admin check. */
async function changeRole(q: Tx, tenantId: string, userId: string, from: string, to: string): Promise<boolean> {
  const admins = await q.query("select user_id from memberships where tenant_id = $1 and role = 'admin' and status = 'Active' order by user_id for update", [tenantId]);
  if (from === "admin" && to !== "admin" && admins.length <= 1) return false;
  const r = await q.query("update memberships set role = $4 where tenant_id = $1 and user_id = $2 and status = 'Active' and role = $3 returning user_id", [tenantId, userId, from, to]);
  return r.length === 1;
}
async function insertInvitation(q: Tx, tenantId: string, actorId: string, i: { email: string; role: string; tokenHash: string | null; approvalId?: string }, at: number) {
  const r = await q.query<{ id: string }>(`insert into invitations (tenant_id, email, role, token_hash, invited_by, approval_id, created_ms, expires_ms, link_ms)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict do nothing returning id`, [tenantId, i.email, i.role, i.tokenHash, actorId, i.approvalId ?? null, at, at + INVITE_MS, i.tokenHash ? at : null]);
  return r[0]?.id ?? null;
}
/** A company's requests (domain ws), or the platform's (tenant null, domain admin). With an id: that one request, locked for the decision. */
export async function loadApprovals(q: Tx, tenantId: string | null, id?: string): Promise<ApprovalRow[]> {
  const rows = await q.query(`select a.*, coalesce(p.person, '') as requester from approvals a left join profiles p on p.id = a.requested_by
    where ${tenantId ? "a.tenant_id = $1 and a.domain = 'ws'" : "a.tenant_id is null and $1::uuid is null and a.domain = 'admin'"} and ($2::uuid is null or a.id = $2)
    order by a.created_ms desc limit 100 ${id ? "for update of a" : ""}`, [tenantId, id ?? null]);
  if (!rows.length) return [];
  const votes = await q.query(`select v.approval_id, v.by_user, coalesce(p.person, '') as person, v.at_ms, v.reason from approval_votes v left join profiles p on p.id = v.by_user
    where v.approval_id = any($1::uuid[]) order by v.at_ms`, [rows.map((r) => r.id)]);
  return rows.map((r) => ({
    id: String(r.id), kind: String(r.kind), title: String(r.title), subject: (r.subject_ref as string | null) ?? null, payload: (r.payload ?? {}) as Record<string, unknown>,
    needs: Number(r.needs), approverRoles: r.approver_roles as string[], forbid: (r.forbid as string[]) ?? [], requestedBy: String(r.requested_by), requestedByName: String(r.requester),
    status: r.status as ApprovalStatus, createdAt: Number(r.created_ms), expiresAt: Number(r.expires_ms), decidedReason: (r.decided_reason as string | null) ?? undefined,
    votes: votes.filter((v) => v.approval_id === r.id).map((v) => ({ by: String(v.by_user), byName: String(v.person), at: Number(v.at_ms), reason: String(v.reason) })),
  }));
}
/** The change an approved request makes, in the decision's transaction. */
async function applyPg(q: Tx, tenantId: string, a: ApprovalRow, at: number, log: Log, approvers: string) {
  const p = a.payload;
  if (a.kind === "team-role") {
    if (!(await changeRole(q, tenantId, String(p.userId), String(p.from), String(p.to)))) throw new ApplyConflict("The member's role or status changed since the request, or no admin would remain. Reject this request and ask again.");
    await q.query(auditSql, auditArgs(log("member.role.changed", `${p.name}: ${p.from} → ${p.to}; requested by ${a.requestedByName}, approved by ${approvers}`)));
  } else if (a.kind === "team-invite") {
    const id = await insertInvitation(q, tenantId, a.requestedBy, { email: String(p.email), role: String(p.role), tokenHash: null, approvalId: a.id }, at);
    if (!id) throw new ApplyConflict("An invitation for this email is already pending. Reject this request.");
    await q.query(auditSql, auditArgs(log("member.invited", `${p.email} (${p.role}); ${id}; requested by ${a.requestedByName}, approved by ${approvers}`)));
  } else throw new ApplyConflict("Unknown request.");
}

/** In-memory directory for the server tests. Audit entries go to the store's log, as the real one writes them to audit_log. */
export class MemoryDirectory implements Directory {
  companies = new Map<string, Company & { status: "Active" | "Suspended" | "Closed" }>();
  memberships: { tenantId: string; userId: string; role: string; status: MemberStatus; since: number; decidedAt?: number; decidedBy?: string; reason?: string }[] = [];
  staff = new Map<string, PlatformRole>();
  lockouts = new Map<string, Lockout>();
  constructor(private store: Store) {}
  /** Test helper: a company with an id, code and name. */
  addCompany(ref: string, name: string) { const id = `00000000-0000-4000-8000-${String(this.companies.size + 1).padStart(12, "0")}`; this.companies.set(id, { id, ref, name, status: "Active" }); return id; }
  addMember(tenantId: string, userId: string, role: string, status: MemberStatus = "Active") { this.memberships.push({ tenantId, userId, role, status, since: 0 }); }
  private company(id: string) { const c = this.companies.get(id); return c && c.status === "Active" ? { id: c.id, ref: c.ref, name: c.name } : null; }
  async platformRole(userId: string) { return this.staff.get(userId) ?? null; }
  async companiesOf(userId: string) {
    return this.memberships.filter((m) => m.userId === userId && m.status === "Active").flatMap((m) => { const c = this.company(m.tenantId); return c ? [{ company: c, role: m.role }] : []; })
      .sort((a, b) => a.company.name.localeCompare(b.company.name));
  }
  async membership(tenantId: string, userId: string) {
    const m = this.memberships.find((x) => x.tenantId === tenantId && x.userId === userId); const c = this.company(tenantId);
    return m && c ? { company: c, role: m.role, status: m.status } : null;
  }
  async companyByCode(code: string) { const c = [...this.companies.values()].find((x) => x.ref === code.trim().toLowerCase() && x.status === "Active"); return c?.id ?? null; }
  async requestToJoin(tenantId: string, userId: string, at: number, entry: AuditRow) {
    const m = this.memberships.find((x) => x.tenantId === tenantId && x.userId === userId);
    if (m && m.status !== "Removed") return false;
    if (m) Object.assign(m, { role: "employee", status: "Pending", since: at, decidedAt: undefined, decidedBy: undefined, reason: undefined });
    else this.memberships.push({ tenantId, userId, role: "employee", status: "Pending", since: at });
    await this.store.audit(entry); return true;
  }
  async members(tenantId: string, _actorId: string, status?: MemberStatus) {
    const out: MemberRow[] = [];
    for (const m of this.memberships.filter((x) => x.tenantId === tenantId && (!status || x.status === status))) {
      const p = await this.store.profileById(m.userId); if (p) out.push({ userId: m.userId, person: p.person, email: p.email, role: m.role, status: m.status, since: m.since, decidedAt: m.decidedAt });
    }
    return out.sort((a, b) => a.person.localeCompare(b.person));
  }
  async decide(tenantId: string, actorId: string, userId: string, to: "Active" | "Removed", reason: string, at: number, entry: AuditRow) {
    const m = this.memberships.find((x) => x.tenantId === tenantId && x.userId === userId && x.status === "Pending"); if (!m) return false;
    Object.assign(m, { status: to, decidedBy: actorId, reason, decidedAt: at }); await this.store.audit(entry); return true;
  }
  async lockoutOf(tenantId: string) { return this.lockouts.get(tenantId) ?? { preset: "standard" }; }
  async lockoutsOf(userId: string) { return (await this.companiesOf(userId)).map((c) => this.lockouts.get(c.company.id) ?? { preset: "standard" }); }
  async setLockout(tenantId: string, _actorId: string, lockout: Lockout, _at: number, entry: AuditRow) { this.lockouts.set(tenantId, lockout); await this.store.audit(entry); }

  requests: (ApprovalRow & { tenantId: string })[] = [];
  invites: (InvitationRow & { tenantId: string; tokenHash: string | null; invitedById: string })[] = [];
  private uuid(n: number, kind: string) { return `${kind}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`; }
  private async person(id: string) { return (await this.store.profileById(id))?.person ?? ""; }
  async admins(tenantId: string) { return this.memberships.filter((m) => m.tenantId === tenantId && m.role === "admin" && m.status === "Active").map((m) => m.userId); }
  private change(tenantId: string, userId: string, from: string, to: string) {
    if (from === "admin" && to !== "admin" && this.memberships.filter((m) => m.tenantId === tenantId && m.role === "admin" && m.status === "Active").length <= 1) return false;
    const m = this.memberships.find((x) => x.tenantId === tenantId && x.userId === userId && x.status === "Active" && x.role === from); if (!m) return false;
    m.role = to; return true;
  }
  async setRole(tenantId: string, _actorId: string, userId: string, from: string, to: string, _at: number, entry: AuditRow) { const ok = this.change(tenantId, userId, from, to); if (ok) await this.store.audit(entry); return ok; }
  async pendingApproval(tenantId: string, _actorId: string, kind: string, subject: string, at: number) { return this.requests.some((a) => a.tenantId === tenantId && a.kind === kind && a.subject === subject && a.status === "Pending" && a.expiresAt > at); }
  async requestApproval(tenantId: string, actorId: string, a: NewApproval, at: number, entry: AuditRow) {
    const id = this.uuid(this.requests.length + 1, "a");
    this.requests.unshift({ tenantId, id, kind: a.kind, title: a.title, subject: a.subject, payload: a.payload, needs: a.needs, approverRoles: a.approverRoles, forbid: a.forbid, requestedBy: actorId, requestedByName: await this.person(actorId), status: "Pending", createdAt: at, expiresAt: at + a.ttlMs, votes: [] });
    await this.store.audit({ ...entry, target: `${entry.target} (${id})` }); return id;
  }
  async approvals(tenantId: string) { return this.requests.filter((a) => a.tenantId === tenantId).map(({ tenantId: _t, ...a }) => (void _t, structuredClone(a))); }
  async decideApproval(tenantId: string, actor: { id: string; role: string }, id: string, approve: boolean, reason: string, at: number, log: Log): Promise<Outcome> {
    const a = this.requests.find((x) => x.tenantId === tenantId && x.id === id);
    if (a && a.status === "Pending" && a.expiresAt <= at) { a.status = "Expired"; await this.store.audit(log(`approval.${a.kind}.expired`, `${a.title} (${a.id})`)); }
    const no = refuse(a, actor, at); if (no || !a) return no!;
    if (!approve) { a.status = "Rejected"; a.decidedReason = reason; await this.store.audit(log(`approval.${a.kind}.rejected`, `${a.title} (${a.id}); reason: ${reason}`)); return { ok: true, status: "Rejected" }; }
    const who = await this.person(actor.id);
    if (a.votes.length + 1 < a.needs) { a.votes.push({ by: actor.id, byName: who, at, reason }); await this.store.audit(log(`approval.${a.kind}.approval.recorded`, `${a.title} (${a.id})`)); return { ok: true, status: "Pending" }; }
    const p = a.payload; const approvers = names(a, who);
    // apply first: a change that can no longer be made leaves the request untouched, as the rolled-back transaction does
    if (a.kind === "team-role") {
      if (!this.change(tenantId, String(p.userId), String(p.from), String(p.to))) return { ok: false, code: 409, error: "The member's role or status changed since the request, or no admin would remain. Reject this request and ask again." };
    } else if (a.kind === "team-invite") {
      if (this.invites.some((x) => x.tenantId === tenantId && x.email === p.email && x.status === "Pending")) return { ok: false, code: 409, error: "An invitation for this email is already pending. Reject this request." };
    }
    a.votes.push({ by: actor.id, byName: who, at, reason }); a.status = "Approved"; a.decidedReason = reason;
    await this.store.audit(log(`approval.${a.kind}.approved`, `${a.title} (${a.id}); reason: ${reason}`));
    if (a.kind === "team-role") await this.store.audit(log("member.role.changed", `${p.name}: ${p.from} → ${p.to}; requested by ${a.requestedByName}, approved by ${approvers}`));
    else { const iid = await this.addInvite(tenantId, a.requestedBy, { email: String(p.email), role: String(p.role), tokenHash: null, approvalId: a.id }, at); await this.store.audit(log("member.invited", `${p.email} (${p.role}); ${iid}; requested by ${a.requestedByName}, approved by ${approvers}`)); }
    return { ok: true, status: "Approved" };
  }
  async withdrawApproval(tenantId: string, actor: { id: string; role: string }, id: string, _at: number, log: Log): Promise<Outcome> {
    const a = this.requests.find((x) => x.tenantId === tenantId && x.id === id); if (!a) return { ok: false, code: 404, error: "Request not found." };
    const why = withdrawBlock({ key: actor.id, base: actor.role }, a); if (why) return { ok: false, code: a.status !== "Pending" ? 409 : 403, error: why };
    a.status = "Withdrawn"; await this.store.audit(log(`approval.${a.kind}.withdrawn`, `${a.title} (${a.id})`)); return { ok: true, status: "Withdrawn" };
  }
  private async addInvite(tenantId: string, actorId: string, i: { email: string; role: string; tokenHash: string | null; approvalId?: string }, at: number) {
    if (this.invites.some((x) => x.tenantId === tenantId && x.email === i.email && x.status === "Pending")) return null;
    const id = this.uuid(this.invites.length + 1, "b");
    this.invites.unshift({ tenantId, id, email: i.email, role: i.role, status: "Pending", invitedBy: await this.person(actorId), invitedById: actorId, createdAt: at, expiresAt: at + INVITE_MS, linkAt: i.tokenHash ? at : undefined, approvalId: i.approvalId, tokenHash: i.tokenHash });
    return id;
  }
  private view(x: (typeof this.invites)[number]): InvitationRow { const { tenantId: _t, tokenHash: _h, invitedById: _i, ...v } = x; void _t; void _h; void _i; return { ...v }; }
  async invitations(tenantId: string) { return this.invites.filter((x) => x.tenantId === tenantId).map((x) => this.view(x)); }
  async createInvitation(tenantId: string, actorId: string, i: { email: string; role: string; tokenHash: string | null; approvalId?: string }, at: number, entry: AuditRow) {
    const id = await this.addInvite(tenantId, actorId, i, at); if (id) await this.store.audit({ ...entry, target: `${entry.target}; ${id}` }); return id;
  }
  async setInvitationLink(tenantId: string, _actorId: string, id: string, tokenHash: string, at: number, entry: AuditRow) {
    const x = this.invites.find((v) => v.tenantId === tenantId && v.id === id && v.status === "Pending" && v.expiresAt > at); if (!x) return null;
    x.tokenHash = tokenHash; x.linkAt = at; await this.store.audit(entry); return this.view(x);
  }
  async revokeInvitation(tenantId: string, _actorId: string, id: string, at: number, entry: AuditRow) {
    const x = this.invites.find((v) => v.tenantId === tenantId && v.id === id && v.status === "Pending"); if (!x) return false;
    x.status = "Revoked"; x.tokenHash = null; void at; await this.store.audit(entry); return true;
  }
  async invitationByToken(tokenHash: string) {
    const x = this.invites.find((v) => v.tokenHash === tokenHash && v.status === "Pending" && this.company(v.tenantId));
    return x ? { id: x.id, tenantId: x.tenantId, email: x.email, role: x.role, expiresAt: x.expiresAt } : null;
  }
  async acceptInvitation(tenantId: string, userId: string, id: string, at: number, entry: AuditRow) {
    const x = this.invites.find((v) => v.tenantId === tenantId && v.id === id && v.status === "Pending" && v.expiresAt > at); if (!x) return false;
    const m = this.memberships.find((v) => v.tenantId === tenantId && v.userId === userId);
    if (m?.status === "Active") return false;
    x.status = "Accepted"; x.tokenHash = null;
    if (m) Object.assign(m, { role: x.role, status: "Active", decidedAt: at, decidedBy: undefined, reason: "Accepted an invitation" });
    else this.memberships.push({ tenantId, userId, role: x.role, status: "Active", since: at, decidedAt: at, reason: "Accepted an invitation" });
    await this.store.audit(entry); return true;
  }
}
