/* Server-only. The Admin Console's data (slice 3a, migration 0006): time-boxed elevation, companies as platform staff see them, platform
   approvals (four-eyes, domain 'admin', no company) and the platform audit log. Every query runs as `selvara_app` with the platform flag set;
   creating, suspending and reactivating a company and creating its first admin's link go through database functions that check, in the
   database, that the caller is an active platform super admin with a live elevation. MemoryPlatform is the stand-in for the server tests. */
import { withdrawBlock } from "@/lib/rules";
import type { Db, Tx } from "./db";
import { ApplyConflict, auditArgs, auditSql, loadApprovals, names, refuse, type ApprovalRow, type Log, type MemoryDirectory, type Outcome } from "./directory";
import { UpstreamError } from "./errors";
import type { AuditRow, Store } from "./types";
import { WsConflict, WsRefused } from "./ws/store";

export interface ElevationRow { id: string; reason: string; ticket: string; startedAt: number; expiresAt: number }
export type CompanyStatus = "Active" | "Suspended" | "Closed";
export interface PlatformCompany { id: string; ref: string; name: string; status: CompanyStatus; createdAt: number; members: number; admins: number; pendingInvites: number }
export interface PlatformAuditRow { seq: number; at: number; actor: string; action: string; target: string; ip: string; chainN: number | null; hash: string | null }
export type PlatformKind = "platform-company-create" | "platform-company-suspend" | "platform-company-reactivate" | (string & {});
/** `forbid`: people who may never approve (the requester always excluded); a payload's `named` approver is enforced by the admin routes. */
export interface NewPlatformApproval { kind: PlatformKind; title: string; subject: string; payload: Record<string, unknown>; ttlMs: number; forbid?: string[] }
/** The change an approved request of a group 8 kind makes, inside the decision's transaction (Pg) or before the in-memory decision is kept. */
export type ApplyExtra = (q: Tx | null, a: ApprovalRow, approvers: string) => Promise<void>;
const COMPANY_KINDS = ["platform-company-create", "platform-company-suspend", "platform-company-reactivate"];

export interface Platform {
  /** The person's live, unexpired elevation, or null. */
  elevation(userId: string, at: number): Promise<ElevationRow | null>;
  /** Starts an elevation. Null when one is already live. */
  startElevation(userId: string, e: { reason: string; ticket: string; minutes: number }, at: number, entry: AuditRow): Promise<ElevationRow | null>;
  endElevation(userId: string, at: number, entry: AuditRow): Promise<boolean>;
  companies(userId: string): Promise<PlatformCompany[]>;
  pendingApproval(userId: string, kind: PlatformKind, subject: string, at: number): Promise<boolean>;
  /** Platform requests are decided by another platform super admin (one vote). */
  requestApproval(userId: string, a: NewPlatformApproval, at: number, entry: AuditRow): Promise<string>;
  approvals(userId: string): Promise<ApprovalRow[]>;
  decideApproval(actor: { id: string; role: string }, id: string, approve: boolean, reason: string, at: number, log: Log, extra?: ApplyExtra): Promise<Outcome>;
  withdrawApproval(actor: { id: string; role: string }, id: string, at: number, log: Log): Promise<Outcome>;
  /** Sets the link of a new company's pending admin invitation. Null when there is none (accepted, revoked, expired or not from the platform). */
  adminInviteLink(userId: string, companyId: string, tokenHash: string, at: number, entry: AuditRow): Promise<{ email: string; expiresAt: number } | null>;
  /** The platform's own audit entries (no company), newest first. */
  auditLog(userId: string, limit: number): Promise<PlatformAuditRow[]>;
  /** Active platform super admins (to know whether a second one can approve). */
  superAdmins(userId: string): Promise<string[]>;
  /** The first chain position that does not verify, or null when the whole platform chain verifies. */
  verifyAudit(userId: string): Promise<number | null>;
  /** EDGE-19: the database part of an approved erasure (migration 0015 erase_person); an elevated super admin. */
  erasePerson(userId: string, person: string, pseudonym: string): Promise<{ auditEntries: number; records: number; companies: number }>;
  /** Every company's admins and owners (for admin-level MFA resets, 0010): no other member. */
  companyAdmins(userId: string): Promise<{ tenantId: string; ref: string; company: string; userId: string; person: string; email: string; role: string }[]>;
}

const CONFLICT: Record<string, string> = {
  "23505": "That company code was taken after the request. Reject this request and ask again with another code.",
  "22023": "The request can no longer be applied (its details are not valid any more, or the admin email now belongs to platform staff). Reject this request.",
  "42501": "Elevate to make changes.",
};
/** A rule's refusal while applying (the group 8 kinds raise the workspace store's refusals): the request stays pending, with the reason. */
const refusal = (e: unknown): string | null => (e instanceof WsRefused || e instanceof WsConflict ? e.message : null);
const elev = (r: Record<string, unknown>): ElevationRow => ({ id: String(r.id), reason: String(r.reason), ticket: String(r.ticket), startedAt: Number(r.started_ms), expiresAt: Number(r.expires_ms) });

export class PgPlatform implements Platform {
  constructor(private db: Db) {}
  private tx<T>(userId: string, work: (q: Tx) => Promise<T>) { return this.db.tx({ tenantId: null, userId, platform: true }, work); }
  async elevation(userId: string, at: number) {
    const r = await this.tx(userId, (q) => q.query("select * from elevations where user_id = $1 and tenant_id is null and ended_ms is null and expires_ms > $2 order by started_ms desc limit 1", [userId, at]));
    return r[0] ? elev(r[0]) : null;
  }
  async startElevation(userId: string, e: { reason: string; ticket: string; minutes: number }, at: number, entry: AuditRow) {
    return this.tx(userId, async (q) => {
      await q.query("update elevations set ended_ms = expires_ms where user_id = $1 and ended_ms is null and expires_ms <= $2", [userId, at]); // ran out: close it
      const r = await q.query(`insert into elevations (user_id, reason, ticket, started_ms, expires_ms) values ($1, $2, $3, $4, $5)
        on conflict (user_id) where ended_ms is null do nothing returning *`, [userId, e.reason, e.ticket, at, at + e.minutes * 60_000]);
      if (!r.length) return null;
      await q.query(auditSql, auditArgs(entry));
      return elev(r[0]);
    });
  }
  async endElevation(userId: string, at: number, entry: AuditRow) {
    return this.tx(userId, async (q) => {
      const r = await q.query("update elevations set ended_ms = least($2, expires_ms) where user_id = $1 and tenant_id is null and ended_ms is null returning id, expires_ms", [userId, at]);
      if (r.some((x) => Number(x.expires_ms) > at)) await q.query(auditSql, auditArgs(entry)); // only a live one is worth an entry
      return r.length > 0;
    });
  }
  async companies(userId: string) {
    const r = await this.tx(userId, (q) => q.query("select * from platform_companies()"));
    return r.map((x) => ({ id: String(x.id), ref: String(x.ref), name: String(x.name), status: x.status as CompanyStatus, createdAt: Number(x.created_ms), members: Number(x.members), admins: Number(x.admins), pendingInvites: Number(x.pending_invites) }));
  }
  async pendingApproval(userId: string, kind: PlatformKind, subject: string, at: number) {
    const r = await this.tx(userId, (q) => q.query("select 1 from approvals where tenant_id is null and domain = 'admin' and kind = $1 and subject_ref = $2 and status = 'Pending' and expires_ms > $3 limit 1", [kind, subject, at]));
    return r.length > 0;
  }
  async requestApproval(userId: string, a: NewPlatformApproval, at: number, entry: AuditRow) {
    return this.tx(userId, async (q) => {
      const r = await q.query<{ id: string }>(`insert into approvals (tenant_id, kind, title, subject_ref, payload, needs, approver_roles, forbid, requested_by, created_ms, expires_ms, domain)
        values (null, $1, $2, $3, $4, 1, '{super}', $8::uuid[], $5, $6, $7, 'admin') returning id`, [a.kind, a.title, a.subject, JSON.stringify(a.payload), userId, at, at + a.ttlMs, (a.forbid ?? []).filter((x) => /^[0-9a-f-]{36}$/i.test(x))]);
      await q.query(auditSql, auditArgs({ ...entry, target: `${entry.target} (${r[0].id})` }));
      return r[0].id;
    });
  }
  async approvals(userId: string) { return this.tx(userId, (q) => loadApprovals(q, null)); }
  async decideApproval(actor: { id: string; role: string }, id: string, approve: boolean, reason: string, at: number, log: Log, extra?: ApplyExtra): Promise<Outcome> {
    return this.tx(actor.id, async (q) => {
      const a = (await loadApprovals(q, null, id))[0];
      if (a && a.status === "Pending" && a.expiresAt <= at) { await q.query("update approvals set status = 'Expired' where id = $1", [id]); await q.query(auditSql, auditArgs(log(`approval.${a.kind}.expired`, `${a.title} (${a.id})`))); }
      const no = refuse(a, actor, at); if (no) return no;
      if (!approve) {
        await q.query("update approvals set status = 'Rejected', decided_reason = $2 where id = $1", [id, reason]);
        await q.query(auditSql, auditArgs(log(`approval.${a.kind}.rejected`, `${a.title} (${a.id}); reason: ${reason}`)));
        return { ok: true, status: "Rejected" } as Outcome;
      }
      await q.query("savepoint decide");
      try {
        await q.query("insert into approval_votes (approval_id, by_user, at_ms, reason) values ($1, $2, $3, $4)", [id, actor.id, at, reason]);
        await q.query("update approvals set status = 'Approved', decided_reason = $2 where id = $1", [id, reason]);
        await q.query(auditSql, auditArgs(log(`approval.${a.kind}.approved`, `${a.title} (${a.id}); reason: ${reason}`)));
        const me = (await q.query<{ person: string }>("select person from profiles where id = $1", [actor.id]))[0]?.person;
        if (COMPANY_KINDS.includes(a.kind)) await applyPg(q, a, log, names(a, me));
        else if (extra) await extra(q, a, names(a, me)); else throw new ApplyConflict("This request cannot be applied here.");
        return { ok: true, status: "Approved" } as Outcome;
      } catch (e) {
        const msg = e instanceof ApplyConflict ? e.message : e instanceof UpstreamError && e.code && CONFLICT[e.code] ? CONFLICT[e.code] : refusal(e);
        if (!msg) throw e;
        await q.query("rollback to savepoint decide"); return { ok: false, code: 409, error: msg } as Outcome;
      }
    });
  }
  async withdrawApproval(actor: { id: string; role: string }, id: string, _at: number, log: Log): Promise<Outcome> {
    return this.tx(actor.id, async (q) => {
      const a = (await loadApprovals(q, null, id))[0]; if (!a) return { ok: false, code: 404, error: "Request not found." } as Outcome;
      const why = withdrawBlock({ key: actor.id, base: actor.role }, a); if (why) return { ok: false, code: a.status !== "Pending" ? 409 : 403, error: why } as Outcome;
      await q.query("update approvals set status = 'Withdrawn' where id = $1", [id]);
      await q.query(auditSql, auditArgs(log(`approval.${a.kind}.withdrawn`, `${a.title} (${a.id})`)));
      return { ok: true, status: "Withdrawn" } as Outcome;
    });
  }
  async adminInviteLink(userId: string, companyId: string, tokenHash: string, _at: number, entry: AuditRow) {
    return this.tx(userId, async (q) => {
      const r = await q.query<{ email: string; expires_ms: string }>("select * from platform_admin_invite_link($1, $2)", [companyId, tokenHash]);
      if (!r.length) return null;
      await q.query(auditSql, auditArgs(entry));
      return { email: r[0].email, expiresAt: Number(r[0].expires_ms) };
    });
  }
  async auditLog(userId: string, limit: number) {
    const r = await this.tx(userId, (q) => q.query(`select seq, at_ms, actor, action, target, ip, chain_n, hash from audit_log where tenant_id is null order by seq desc limit ${Math.min(Math.max(1, limit | 0), 500)}`));
    return r.map((x) => ({ seq: Number(x.seq), at: Number(x.at_ms), actor: String(x.actor), action: String(x.action), target: String(x.target), ip: String(x.ip), chainN: x.chain_n == null ? null : Number(x.chain_n), hash: (x.hash as string | null) ?? null }));
  }
  async superAdmins(userId: string) {
    const r = await this.tx(userId, (q) => q.query<{ user_id: string }>("select user_id from platform_staff where role = 'super' and status = 'Active'"));
    return r.map((x) => x.user_id);
  }
  async verifyAudit(userId: string) {
    const r = await this.tx(userId, (q) => q.query<{ bad: string | null }>("select platform_audit_verify() as bad"));
    return r[0]?.bad == null ? null : Number(r[0].bad);
  }
  async erasePerson(userId: string, person: string, pseudonym: string) {
    const r = await this.tx(userId, (q) => q.query<{ r: { auditEntries: number; records: number; companies: number } }>("select public.erase_person($1, $2) as r", [person, pseudonym]));
    return r[0].r;
  }
  async companyAdmins(userId: string) {
    const r = await this.tx(userId, (q) => q.query("select * from platform_company_admins()"));
    return r.map((x) => ({ tenantId: String(x.tenant_id), ref: String(x.ref), company: String(x.company), userId: String(x.user_id), person: String(x.person), email: String(x.email), role: String(x.role) }));
  }
}

/** The change an approved platform request makes, in the decision's transaction (the database functions check the elevation again). */
async function applyPg(q: Tx, a: ApprovalRow, log: Log, approvers: string) {
  const p = a.payload; const by = `requested by ${a.requestedByName}, approved by ${approvers}`;
  if (a.kind === "platform-company-create") {
    await q.query("select platform_create_company($1, $2, $3, $4, $5)", [p.ref, p.name, p.adminEmail, a.requestedBy, a.id]);
    await q.query(auditSql, auditArgs(log("platform.company.created", `${p.ref}: ${p.name}; first admin invited: ${p.adminEmail}; ${by}`)));
  } else if (a.kind === "platform-company-suspend" || a.kind === "platform-company-reactivate") {
    const to = a.kind === "platform-company-suspend" ? "Suspended" : "Active";
    const r = await q.query<{ ok: boolean }>("select platform_set_company_status($1, $2, $3) as ok", [p.companyId, to, String(p.reason ?? "")]);
    if (!r[0]?.ok) throw new ApplyConflict(`The company is no longer ${to === "Suspended" ? "active" : "suspended"}. Reject this request.`);
    await q.query(auditSql, auditArgs(log(to === "Suspended" ? "platform.company.suspended" : "platform.company.reactivated", `${p.ref}; reason: ${p.reason}; ${by}`)));
  } else throw new ApplyConflict("Unknown request.");
}

/** In-memory platform for the server tests, over the in-memory directory (companies and invitations live there). */
export class MemoryPlatform implements Platform {
  /** Platform elevations, and support sessions (slice 3b: `tenantId` and `grantId` set, kept here because one person holds one live elevation of either kind). */
  elevations: (ElevationRow & { userId: string; endedAt?: number; tenantId?: string; grantId?: string })[] = [];
  requests: ApprovalRow[] = [];
  constructor(private store: Store, private dir: MemoryDirectory) {}
  private async person(id: string) { return (await this.store.profileById(id))?.person ?? ""; }
  private live(userId: string, at: number) { return this.elevations.find((e) => e.userId === userId && !e.tenantId && !e.endedAt && e.expiresAt > at) ?? null; }
  /** Any live elevation, platform or support session (the database's one-live-per-person index). */
  anyLive(userId: string, at: number) { return this.elevations.find((e) => e.userId === userId && !e.endedAt && e.expiresAt > at) ?? null; }
  /** What the database functions check: an active super admin with a live elevation. */
  private elevatedSuper(userId: string, at: number) { return this.dir.staff.get(userId) === "super" && !!this.live(userId, at); }
  async elevation(userId: string, at: number) { const e = this.live(userId, at); return e ? { id: e.id, reason: e.reason, ticket: e.ticket, startedAt: e.startedAt, expiresAt: e.expiresAt } : null; }
  async startElevation(userId: string, e: { reason: string; ticket: string; minutes: number }, at: number, entry: AuditRow) {
    if (this.anyLive(userId, at)) return null;
    const row = { id: `e${this.elevations.length + 1}`, userId, reason: e.reason, ticket: e.ticket, startedAt: at, expiresAt: at + e.minutes * 60_000 };
    this.elevations.push(row); await this.store.audit(entry); return this.elevation(userId, at);
  }
  async endElevation(userId: string, at: number, entry: AuditRow) { const e = this.live(userId, at); if (!e) return false; e.endedAt = at; await this.store.audit(entry); return true; }
  async companies() {
    return [...this.dir.companies.values()].map((c) => {
      const ms = this.dir.memberships.filter((m) => m.tenantId === c.id && m.status === "Active");
      return { id: c.id, ref: c.ref, name: c.name, status: c.status, createdAt: 0, members: ms.length, admins: ms.filter((m) => m.role === "admin").length, pendingInvites: this.dir.invites.filter((i) => i.tenantId === c.id && i.status === "Pending").length };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }
  async pendingApproval(_userId: string, kind: PlatformKind, subject: string, at: number) { return this.requests.some((a) => a.kind === kind && a.subject === subject && a.status === "Pending" && a.expiresAt > at); }
  async requestApproval(userId: string, a: NewPlatformApproval, at: number, entry: AuditRow) {
    const id = `c0000000-0000-4000-8000-${String(this.requests.length + 1).padStart(12, "0")}`;
    this.requests.unshift({ id, kind: a.kind, title: a.title, subject: a.subject, payload: a.payload, needs: 1, approverRoles: ["super"], forbid: a.forbid ?? [], requestedBy: userId, requestedByName: await this.person(userId), status: "Pending", createdAt: at, expiresAt: at + a.ttlMs, votes: [] });
    await this.store.audit({ ...entry, target: `${entry.target} (${id})` }); return id;
  }
  async approvals() { return structuredClone(this.requests); }
  async decideApproval(actor: { id: string; role: string }, id: string, approve: boolean, reason: string, at: number, log: Log, extra?: ApplyExtra): Promise<Outcome> {
    const a = this.requests.find((x) => x.id === id);
    if (a && a.status === "Pending" && a.expiresAt <= at) { a.status = "Expired"; await this.store.audit(log(`approval.${a.kind}.expired`, `${a.title} (${a.id})`)); }
    const no = refuse(a, actor, at); if (no || !a) return no!;
    if (!approve) { a.status = "Rejected"; a.decidedReason = reason; await this.store.audit(log(`approval.${a.kind}.rejected`, `${a.title} (${a.id}); reason: ${reason}`)); return { ok: true, status: "Rejected" }; }
    if (!this.elevatedSuper(actor.id, at)) return { ok: false, code: 409, error: CONFLICT["42501"] };
    const p = a.payload; const who = await this.person(actor.id); const by = `requested by ${a.requestedByName}, approved by ${names(a, who)}`;
    let after: () => Promise<void>;
    if (!COMPANY_KINDS.includes(a.kind)) {
      if (!extra) return { ok: false, code: 409, error: "This request cannot be applied here." };
      const approvers = names(a, who); // before this vote is added, as the database path reads it
      a.votes.push({ by: actor.id, byName: who, at, reason }); a.status = "Approved"; a.decidedReason = reason;
      try { await extra(null, a, approvers); }
      catch (e) { const m = refusal(e); if (!m) throw e; a.votes.pop(); a.status = "Pending"; delete a.decidedReason; return { ok: false, code: 409, error: m }; }
      await this.store.audit(log(`approval.${a.kind}.approved`, `${a.title} (${a.id}); reason: ${reason}`));
      return { ok: true, status: "Approved" };
    }
    if (a.kind === "platform-company-create") {
      if ([...this.dir.companies.values()].some((c) => c.ref === p.ref)) return { ok: false, code: 409, error: CONFLICT["23505"] };
      after = async () => {
        const tid = this.dir.addCompany(String(p.ref), String(p.name));
        this.dir.invites.unshift({ tenantId: tid, id: `d0000000-0000-4000-8000-${String(this.dir.invites.length + 1).padStart(12, "0")}`, email: String(p.adminEmail), role: "admin", status: "Pending", invitedBy: a.requestedByName, invitedById: a.requestedBy, createdAt: at, expiresAt: at + 72 * 3600_000, approvalId: a.id, tokenHash: null });
        await this.store.audit({ ...log("tenant.created", `${p.ref}: ${p.name}; first admin invited: ${p.adminEmail}`), actor: "Platform", actorId: null, tenantId: tid, space: "ws" });
        await this.store.audit(log("platform.company.created", `${p.ref}: ${p.name}; first admin invited: ${p.adminEmail}; ${by}`));
      };
    } else {
      const to = a.kind === "platform-company-suspend" ? "Suspended" : "Active"; const c = this.dir.companies.get(String(p.companyId));
      if (!c || c.status === to || c.status === "Closed") return { ok: false, code: 409, error: `The company is no longer ${to === "Suspended" ? "active" : "suspended"}. Reject this request.` };
      after = async () => {
        c.status = to;
        await this.store.audit({ ...log(to === "Suspended" ? "tenant.suspended" : "tenant.reactivated", `${p.ref}; reason: ${p.reason}`), actor: "Platform", actorId: null, tenantId: c.id, space: "ws" });
        await this.store.audit(log(to === "Suspended" ? "platform.company.suspended" : "platform.company.reactivated", `${p.ref}; reason: ${p.reason}; ${by}`));
      };
    }
    a.votes.push({ by: actor.id, byName: who, at, reason }); a.status = "Approved"; a.decidedReason = reason;
    await this.store.audit(log(`approval.${a.kind}.approved`, `${a.title} (${a.id}); reason: ${reason}`));
    await after(); return { ok: true, status: "Approved" };
  }
  async withdrawApproval(actor: { id: string; role: string }, id: string, _at: number, log: Log): Promise<Outcome> {
    const a = this.requests.find((x) => x.id === id); if (!a) return { ok: false, code: 404, error: "Request not found." };
    const why = withdrawBlock({ key: actor.id, base: actor.role }, a); if (why) return { ok: false, code: a.status !== "Pending" ? 409 : 403, error: why };
    a.status = "Withdrawn"; await this.store.audit(log(`approval.${a.kind}.withdrawn`, `${a.title} (${a.id})`)); return { ok: true, status: "Withdrawn" };
  }
  async adminInviteLink(userId: string, companyId: string, tokenHash: string, at: number, entry: AuditRow) {
    if (!this.elevatedSuper(userId, at)) return null;
    const i = this.dir.invites.find((x) => x.tenantId === companyId && x.role === "admin" && x.status === "Pending" && x.expiresAt > at && x.approvalId && this.requests.some((r) => r.id === x.approvalId && r.kind === "platform-company-create"));
    if (!i) return null;
    i.tokenHash = tokenHash; i.linkAt = at; await this.store.audit(entry); return { email: i.email, expiresAt: i.expiresAt };
  }
  async auditLog(_userId: string, limit: number) {
    return (this.store as unknown as { auditLog: AuditRow[] }).auditLog.map((x, i) => ({ x, i })).filter(({ x }) => !x.tenantId).reverse().slice(0, limit)
      .map(({ x, i }) => ({ seq: i + 1, at: x.at, actor: x.actor, action: x.action, target: x.target, ip: x.ip, chainN: null, hash: null }));
  }
  async superAdmins() { return [...this.dir.staff.entries()].filter(([, r]) => r === "super").map(([id]) => id); }
  async verifyAudit() { return null; }
  /** The stand-in does what erase_person does to the data it keeps (profiles, credentials, the audit list); workspace records are covered
   *  by the database tests. */
  async erasePerson(userId: string, person: string, pseudonym: string) {
    if (!this.live(userId, Date.now())) throw new PassThroughErasure("an elevated platform super admin is required", "42501");
    const st = this.store as unknown as import("./memory").MemoryStore; const p = st.profiles.get(person);
    if (!p) throw new PassThroughErasure("no such person", "P0002");
    if (p.status === "Erased") throw new PassThroughErasure("already erased", "55000");
    if (this.dir.memberships.some((m) => m.userId === person && m.status === "Active")) throw new PassThroughErasure("still an active member", "55000");
    if (this.dir.staff.has(person)) throw new PassThroughErasure("active platform staff", "55000");
    let n = 0; const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const e of st.auditLog) {
      const hit = e.actorId === person || e.target.toLowerCase().includes(p.person.toLowerCase()) || e.target.toLowerCase().includes(p.email.toLowerCase());
      if (!hit) continue;
      if (e.actorId === person) { e.actor = pseudonym; e.ip = ""; }
      e.target = e.target.replace(new RegExp(esc(p.email), "gi"), "[erased address]").replace(new RegExp(esc(p.person), "gi"), pseudonym); n++;
    }
    for (const [k, s] of st.sessions) if (s.userId === person) st.sessions.delete(k);
    st.passkeys = st.passkeys.filter((x) => x.userId !== person); st.recovery = st.recovery.filter((x) => x.userId !== person); st.notices = st.notices.filter((x) => x.userId !== person);
    Object.assign(p, { person: pseudonym, email: `erased-${person.replace(/-/g, "")}@erased.invalid`, status: "Erased", decidedBy: undefined, reason: undefined });
    return { auditEntries: n, records: 0, companies: new Set(this.dir.memberships.filter((m) => m.userId === person).map((m) => m.tenantId)).size };
  }
  async companyAdmins() {
    const out = [];
    for (const m of this.dir.memberships.filter((x) => x.status === "Active" && (x.role === "admin" || x.role === "owner"))) {
      const c = this.dir.companies.get(m.tenantId); const p = await this.store.profileById(m.userId); if (!c || !p || c.status === "Closed") continue;
      out.push({ tenantId: c.id, ref: c.ref, company: c.name, userId: p.id, person: p.person, email: p.email, role: m.role });
    }
    return out;
  }
}

/** The stand-in's refusals carry the database's error codes, as UpstreamError does for Postgres. */
export class PassThroughErasure extends Error { constructor(message: string, public code: string) { super(message); } }
