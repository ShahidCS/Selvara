/* Server-only. Companies, memberships, platform staff and per-company settings (migrations 0003 and 0004). The production directory runs every
   query as `selvara_app` inside a transaction that carries the person and, where one is chosen, the company (db.ts), so row level security
   refuses another company's rows even if a query here forgot its filter. Changes write their audit entry in the same transaction.
   MemoryDirectory is the stand-in for the server tests. */
import type { Db } from "./db";
import type { AuditRow, Store } from "./types";

export interface Company { id: string; ref: string; name: string }
export type MemberStatus = "Pending" | "Active" | "Suspended" | "Removed";
export interface Membership { company: Company; role: string; status: MemberStatus }
export interface MemberRow { userId: string; person: string; email: string; role: string; status: MemberStatus; since: number; decidedAt?: number }
export interface Lockout { preset: string; custom?: { attempts: number; minutes: number } }
export type PlatformRole = "super" | "support";

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
  /** Lockout settings of every company the person is an active member of. */
  lockoutsOf(userId: string): Promise<Lockout[]>;
  setLockout(tenantId: string, actorId: string, lockout: Lockout, at: number, entry: AuditRow): Promise<void>;
}

const LIMIT = 500;
const auditSql = "insert into audit_log (at_ms, actor, action, target, cat, space, ip, tenant_id, actor_id) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)";
const auditArgs = (a: AuditRow) => [a.at, a.actor, a.action, a.target, a.cat, a.space, a.ip, a.tenantId ?? null, a.actorId ?? null];
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
  async lockoutsOf(userId: string) { return (await this.companiesOf(userId)).map((c) => this.lockouts.get(c.company.id) ?? { preset: "standard" }); }
  async setLockout(tenantId: string, _actorId: string, lockout: Lockout, _at: number, entry: AuditRow) { this.lockouts.set(tenantId, lockout); await this.store.audit(entry); }
}
