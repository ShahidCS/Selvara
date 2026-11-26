/* Server-only. Support access to a company's workspace (slice 3b, migration 0007). A company admin gives the platform a support grant: a reason,
   read-only, 8 hours at most, revocable at any time. Platform staff (super admins and support) then open a support session that names the company:
   a reason, a ticket, 60 minutes at most and never beyond the grant, one at a time (it is an elevation that names the company). Inside it they
   read the company's members, sign-in setting and audit log, nothing else, and never change anything. The start, the end and each view go to the
   company's own audit log, so the customer sees them; the start and end go to the platform log too.

   The database enforces it whatever this code does: with the platform flag, the company is visible only during a live session on a live grant,
   and restrictive policies refuse every platform write to company data. MemorySupport is the stand-in for the server tests. */
import { scalarText } from "@/server/text";
import { elevationBlock, supportGrantBlock, SUPPORT_GRANT_MAX_H } from "@/lib/rules";
import type { Ctx, Req, Res } from "./core";
import type { Db, Tx } from "./db";
import { auditArgs, auditSql, type Company, type Lockout, type MemoryDirectory } from "./directory";
import { UpstreamError } from "./errors";
import type { MemoryPlatform } from "./platform";
import type { AuditRow, Deps, Profile, Store } from "./types";

export type GrantStatus = "Live" | "Expired" | "Revoked";
/** A grant as the company's admins see it. */
export interface GrantRow { id: string; reason: string; grantedBy: string; createdAt: number; expiresAt: number; revokedAt: number | null; revokedBy: string | null }
/** A live grant as platform staff see it. */
export interface LiveGrant { id: string; companyId: string; ref: string; name: string; reason: string; grantedBy: string; createdAt: number; expiresAt: number }
export interface SupportSession { id: string; company: Company; ticket: string; reason: string; startedAt: number; expiresAt: number }
export interface LogLine { at: number; actor: string; action: string; target: string }
export type SupportWhat = "members" | "settings" | "audit";
export type SupportView =
  | { what: "members"; members: { name: string; email: string; role: string; status: string; since: number }[] }
  | { what: "settings"; lockout: Lockout }
  | { what: "audit"; entries: LogLine[] };
export type OpenResult = SupportSession | "no-grant" | "busy";

export interface Support {
  /* the company's side (its admins) */
  grants(tenantId: string, actorId: string): Promise<GrantRow[]>;
  /** Gives a grant. Null when one is already live. */
  grant(tenantId: string, actorId: string, g: { reason: string; hours: number }, at: number, entry: AuditRow): Promise<string | null>;
  /** Revokes a live grant; any session on it ends at once. False when it is not live. */
  revoke(tenantId: string, actorId: string, id: string, at: number, entry: AuditRow): Promise<boolean>;
  /** The company's log entries about support access (grants, sessions, views), newest first. */
  accessLog(tenantId: string, actorId: string): Promise<LogLine[]>;
  /* the platform's side (staff) */
  /** Live grants of active companies (the database uses its own clock for `at`). */
  liveGrants(userId: string, at: number): Promise<LiveGrant[]>;
  session(userId: string, at: number): Promise<SupportSession | null>;
  open(userId: string, companyId: string, e: { reason: string; ticket: string; minutes: number }, ip: string, at: number, entry: AuditRow): Promise<OpenResult>;
  /** Ends the person's live session, if any. False when none was live. */
  close(userId: string, note: string, ip: string, at: number, entry: AuditRow): Promise<boolean>;
  /** Reads one part of the session's company and records the view in its log. Null when no session is live for that company. */
  view(userId: string, companyId: string, what: SupportWhat, ip: string, at: number): Promise<SupportView | null>;
}

const LOG_LIMIT = 200;
const n = (v: unknown) => Number(v);
const grantRow = (r: Record<string, unknown>): GrantRow => ({ id: String(r.id), reason: String(r.reason), grantedBy: String(r.by_name), createdAt: n(r.created_ms), expiresAt: n(r.expires_ms),
  revokedAt: r.revoked_ms == null ? null : n(r.revoked_ms), revokedBy: r.revoked_name == null ? null : String(r.revoked_name) });
const line = (r: Record<string, unknown>): LogLine => ({ at: n(r.at_ms), actor: String(r.actor), action: String(r.action), target: String(r.target) });

export class PgSupport implements Support {
  constructor(private db: Db) {}
  private co<T>(tenantId: string, userId: string, work: (q: Tx) => Promise<T>) { return this.db.tx<T>({ tenantId, userId }, work); }
  private plat<T>(userId: string, tenantId: string | null, work: (q: Tx) => Promise<T>) { return this.db.tx<T>({ tenantId, userId, platform: true }, work); }

  async grants(tenantId: string, actorId: string) {
    const r = await this.co(tenantId, actorId, (q) => q.query(`select g.*, p.person as by_name, x.person as revoked_name from support_grants g join profiles p on p.id = g.granted_by
      left join profiles x on x.id = g.revoked_by where g.tenant_id = $1 order by g.created_ms desc limit 50`, [tenantId]));
    return r.map(grantRow);
  }
  async grant(tenantId: string, actorId: string, g: { reason: string; hours: number }, at: number, entry: AuditRow) {
    return this.co(tenantId, actorId, async (q) => {
      const r = await q.query<{ id: string }>(`insert into support_grants (tenant_id, reason, granted_by, created_ms, expires_ms) select $1, $2, $3, $4, $5
        where not exists (select 1 from support_grants where tenant_id = $1 and revoked_ms is null and expires_ms > $4) returning id`, [tenantId, g.reason, actorId, at, at + g.hours * 3600_000]);
      if (!r.length) return null;
      await q.query(auditSql, auditArgs(entry));
      return r[0].id;
    });
  }
  async revoke(tenantId: string, actorId: string, id: string, at: number, entry: AuditRow) {
    return this.co(tenantId, actorId, async (q) => {
      const r = await q.query("update support_grants set revoked_ms = $3, revoked_by = $4 where tenant_id = $1 and id = $2 and revoked_ms is null and expires_ms > $3 returning id", [tenantId, id, at, actorId]);
      if (r.length) await q.query(auditSql, auditArgs(entry));
      return r.length > 0;
    });
  }
  async accessLog(tenantId: string, actorId: string) {
    const r = await this.co(tenantId, actorId, (q) => q.query("select at_ms, actor, action, target from audit_log where tenant_id = $1 and action like 'support.%' order by seq desc limit 100", [tenantId]));
    return r.map(line);
  }
  async liveGrants(userId: string) { // the database's clock decides what is live
    const r = await this.plat(userId, null, (q) => q.query("select * from platform_support_grants()"));
    return r.map((x) => ({ id: String(x.id), companyId: String(x.tenant_id), ref: String(x.ref), name: String(x.name), reason: String(x.reason), grantedBy: String(x.granted_by), createdAt: n(x.created_ms), expiresAt: n(x.expires_ms) }));
  }
  async session(userId: string, at: number) {
    const r = await this.plat(userId, null, (q) => q.query(`select e.id, e.tenant_id, e.ticket, e.reason, e.started_ms, e.expires_ms, t.ref, t.name from elevations e join tenants t on t.id = e.tenant_id
      where e.user_id = $1 and e.tenant_id is not null and e.ended_ms is null and e.expires_ms > $2 and t.status = 'Active' order by e.started_ms desc limit 1`, [userId, at]));
    const x = r[0]; if (!x) return null;
    return { id: String(x.id), company: { id: String(x.tenant_id), ref: String(x.ref), name: String(x.name) }, ticket: String(x.ticket), reason: String(x.reason), startedAt: n(x.started_ms), expiresAt: n(x.expires_ms) };
  }
  async open(userId: string, companyId: string, e: { reason: string; ticket: string; minutes: number }, ip: string, at: number, entry: AuditRow): Promise<OpenResult> {
    try {
      await this.plat(userId, null, async (q) => {
        await q.query("select * from platform_open_workspace($1, $2, $3, $4, $5)", [companyId, e.reason, e.ticket, e.minutes, ip]);
        await q.query(auditSql, auditArgs(entry));
      });
    } catch (x) {
      if (x instanceof UpstreamError && x.code === "P0002") return "no-grant";
      if (x instanceof UpstreamError && x.code === "23505") return "busy";
      throw x;
    }
    return (await this.session(userId, at)) ?? "no-grant";
  }
  async close(userId: string, note: string, ip: string, _at: number, entry: AuditRow) {
    return this.plat(userId, null, async (q) => {
      const r = await q.query<{ t: string | null }>("select platform_close_workspace($1, $2) as t", [note, ip]);
      if (!r[0]?.t) return false;
      await q.query(auditSql, auditArgs(entry));
      return true;
    });
  }
  async view(userId: string, companyId: string, what: SupportWhat, ip: string): Promise<SupportView | null> {
    try {
      return await this.plat(userId, companyId, async (q): Promise<SupportView> => {
        await q.query("select support_viewed($1, $2)", [what, ip]); // refuses (42501) unless the session and grant are live
        if (what === "members") {
          const r = await q.query(`select p.person, p.email, m.role, m.status, m.created_ms from memberships m join profiles p on p.id = m.user_id
            where m.tenant_id = $1 and m.status <> 'Removed' order by p.person limit 500`, [companyId]);
          return { what, members: r.map((x) => ({ name: String(x.person), email: String(x.email), role: String(x.role), status: String(x.status), since: n(x.created_ms) })) };
        }
        if (what === "settings") {
          const r = await q.query<{ lockout: Lockout }>("select lockout from tenant_settings where tenant_id = $1", [companyId]);
          return { what, lockout: r[0]?.lockout ?? { preset: "standard" } };
        }
        const r = await q.query(`select at_ms, actor, action, target from audit_log where tenant_id = $1 order by seq desc limit ${LOG_LIMIT}`, [companyId]);
        return { what, entries: r.map(line) };
      });
    } catch (x) { if (x instanceof UpstreamError && x.code === "42501") return null; throw x; }
  }
}

/** In-memory support access for the server tests, over the in-memory directory and platform (support sessions are elevations there too). */
export class MemorySupport implements Support {
  grantsList: (GrantRow & { tenantId: string })[] = [];
  constructor(private store: Store, private dir: MemoryDirectory, private plat: MemoryPlatform) {}
  private async person(id: string) { return (await this.store.profileById(id))?.person ?? ""; }
  private liveGrant(tenantId: string, at: number) {
    const c = this.dir.companies.get(tenantId);
    return c && c.status === "Active" ? this.grantsList.find((g) => g.tenantId === tenantId && g.revokedAt === null && g.expiresAt > at) ?? null : null;
  }
  private log() { return (this.store as unknown as { auditLog: AuditRow[] }).auditLog; }
  async grants(tenantId: string) { return this.grantsList.filter((g) => g.tenantId === tenantId).map(({ tenantId: _t, ...g }) => (void _t, { ...g })); }
  async grant(tenantId: string, actorId: string, g: { reason: string; hours: number }, at: number, entry: AuditRow) {
    if (this.liveGrant(tenantId, at)) return null;
    const id = `f0000000-0000-4000-8000-${String(this.grantsList.length + 1).padStart(12, "0")}`;
    this.grantsList.unshift({ id, tenantId, reason: g.reason, grantedBy: await this.person(actorId), createdAt: at, expiresAt: at + g.hours * 3600_000, revokedAt: null, revokedBy: null });
    await this.store.audit(entry); return id;
  }
  async revoke(tenantId: string, actorId: string, id: string, at: number, entry: AuditRow) {
    const g = this.grantsList.find((x) => x.tenantId === tenantId && x.id === id && x.revokedAt === null && x.expiresAt > at); if (!g) return false;
    g.revokedAt = at; g.revokedBy = await this.person(actorId);
    for (const e of this.plat.elevations) if (e.grantId === id && !e.endedAt) e.endedAt = Math.min(at, e.expiresAt);
    await this.store.audit(entry); return true;
  }
  async accessLog(tenantId: string) { return this.log().filter((x) => x.tenantId === tenantId && x.action.startsWith("support.")).reverse().slice(0, 100).map((x) => ({ at: x.at, actor: x.actor, action: x.action, target: x.target })); }
  async liveGrants(_userId: string, at: number) {
    return this.grantsList.filter((g) => this.liveGrant(g.tenantId, at)?.id === g.id).map((g) => {
      const c = this.dir.companies.get(g.tenantId)!;
      return { id: g.id, companyId: g.tenantId, ref: c.ref, name: c.name, reason: g.reason, grantedBy: g.grantedBy, createdAt: g.createdAt, expiresAt: g.expiresAt };
    });
  }
  async session(userId: string, at: number) {
    const e = this.plat.anyLive(userId, at); if (!e?.tenantId || !e.grantId) return null;
    const g = this.grantsList.find((x) => x.id === e.grantId); const c = this.dir.companies.get(e.tenantId);
    if (!g || g.revokedAt !== null || g.expiresAt <= at || !c || c.status !== "Active") return null;
    return { id: e.id, company: { id: c.id, ref: c.ref, name: c.name }, ticket: e.ticket, reason: e.reason, startedAt: e.startedAt, expiresAt: e.expiresAt };
  }
  async open(userId: string, companyId: string, e: { reason: string; ticket: string; minutes: number }, ip: string, at: number, entry: AuditRow): Promise<OpenResult> {
    if (!this.dir.staff.get(userId)) return "no-grant";
    const g = this.liveGrant(companyId, at); if (!g) return "no-grant";
    if (this.plat.anyLive(userId, at)) return "busy";
    const ends = Math.min(at + e.minutes * 60_000, g.expiresAt);
    this.plat.elevations.push({ id: `s${this.plat.elevations.length + 1}`, userId, tenantId: companyId, grantId: g.id, reason: e.reason, ticket: e.ticket, startedAt: at, expiresAt: ends });
    await this.store.audit({ at, actor: `${await this.person(userId)} (Selvara platform)`, actorId: userId, tenantId: companyId, action: "support.access.started", target: `Read-only support session; ticket ${e.ticket}; reason: ${e.reason}`, cat: "Access", space: "ws", ip });
    await this.store.audit(entry);
    return (await this.session(userId, at))!;
  }
  async close(userId: string, note: string, ip: string, at: number, entry: AuditRow) {
    const e = this.plat.elevations.find((x) => x.userId === userId && x.tenantId && !x.endedAt && x.expiresAt > at);
    for (const x of this.plat.elevations) if (x.userId === userId && x.tenantId && !x.endedAt && x.expiresAt <= at) x.endedAt = x.expiresAt;
    if (!e) return false;
    e.endedAt = at;
    await this.store.audit({ at, actor: `${await this.person(userId)} (Selvara platform)`, actorId: userId, tenantId: e.tenantId, action: "support.access.ended", target: `Ticket ${e.ticket}; ${note}`, cat: "Access", space: "ws", ip });
    await this.store.audit(entry); return true;
  }
  async view(userId: string, companyId: string, what: SupportWhat, ip: string, at: number): Promise<SupportView | null> {
    const s = await this.session(userId, at); if (!s || s.company.id !== companyId) return null;
    await this.store.audit({ at, actor: `${await this.person(userId)} (Selvara platform)`, actorId: userId, tenantId: companyId, action: "support.viewed", target: what, cat: "Access", space: "ws", ip });
    if (what === "members") return { what, members: (await this.dir.members(companyId, userId)).filter((m) => m.status !== "Removed").map((m) => ({ name: m.person, email: m.email, role: m.role, status: m.status, since: m.since })) };
    if (what === "settings") return { what, lockout: await this.dir.lockoutOf(companyId) };
    return { what, entries: this.log().filter((x) => x.tenantId === companyId).reverse().slice(0, LOG_LIMIT).map((x) => ({ at: x.at, actor: x.actor, action: x.action, target: x.target })) };
  }
}

/* ---------- routes ---------- */
type H = (d: Deps, r: Req) => Promise<Res>;
type Handler = (d: Deps, r: Req, c: Ctx) => Promise<Res>;
export interface SupportHelpers {
  signed: (h: Handler) => H;
  /** core's company-admin wrapper: an admin of the session's company. */
  companyAdmin: (h: (d: Deps, r: Req, c: Ctx & { company: Company }) => Promise<Res>) => H;
  entry: (d: Deps, r: Req, p: Profile, a: Ctx["a"], action: string, target: string) => AuditRow;
}
const ok = (body?: unknown): Res => ({ status: body === undefined ? 204 : 200, body });
const err = (status: number, error: string): Res => ({ status, body: { error } });
const s = (v: unknown, max = 300) => scalarText(v).slice(0, max);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const statusOf = (g: GrantRow, at: number): GrantStatus => (g.revokedAt !== null ? "Revoked" : g.expiresAt <= at ? "Expired" : "Live");
export const NO_SESSION = "Open a support session first. It needs a live support grant from the company.";
const WHATS: SupportWhat[] = ["members", "settings", "audit"];

export function supportRoutes(h: SupportHelpers): Record<string, H> {
  const staff = (fn: Handler) => h.signed(async (d, r, c) => (c.a.platform ? fn(d, r, c) : err(403, "Not permitted.")));

  /* ---------- the company's side ---------- */
  const companyGet = h.companyAdmin(async (d, _r, c) => {
    const at = d.now();
    return ok({ grants: (await d.sup.grants(c.company.id, c.p.id)).map((g) => ({ ...g, status: statusOf(g, at) })), log: await d.sup.accessLog(c.company.id, c.p.id), maxHours: SUPPORT_GRANT_MAX_H });
  });
  const grantCreate = h.companyAdmin(async (d, r, c) => {
    const reason = s(r.body.reason).trim(); const hours = Number(r.body.hours); const at = d.now();
    const live = (await d.sup.grants(c.company.id, c.p.id)).some((g) => statusOf(g, at) === "Live");
    const why = supportGrantBlock({ reason, hours, live }); if (why) return err(live ? 409 : 400, why);
    const id = await d.sup.grant(c.company.id, c.p.id, { reason, hours }, at, h.entry(d, r, c.p, c.a, "support.grant.created", `Read-only support access for ${hours} hour${hours === 1 ? "" : "s"}; reason: ${reason}`));
    return id ? ok({ id, expiresAt: at + hours * 3600_000 }) : err(409, "A support grant is already live. Revoke it first to give a new one.");
  });
  const grantRevoke = h.companyAdmin(async (d, r, c) => {
    const id = s(r.path[3], 100); if (!UUID_RE.test(id)) return err(404, "Grant not found.");
    const done = await d.sup.revoke(c.company.id, c.p.id, id, d.now(), h.entry(d, r, c.p, c.a, "support.grant.revoked", `Support access ended by the company; ${id}`));
    return done ? ok() : err(409, "This grant is no longer live.");
  });

  /* ---------- the platform's side ---------- */
  const platformGet = staff(async (d, _r, c) => ok({ grants: await d.sup.liveGrants(c.p.id, d.now()), session: await d.sup.session(c.p.id, d.now()) }));
  const open = staff(async (d, r, c) => {
    const ref = s(r.body.ref, 40).trim().toLowerCase(); const e = { reason: s(r.body.reason).trim(), ticket: s(r.body.ticket, 20).trim(), minutes: Number(r.body.minutes) };
    const why = elevationBlock(e); if (why) return err(400, why);
    const g = (await d.sup.liveGrants(c.p.id, d.now())).find((x) => x.ref === ref); if (!g) return err(409, "This company has no live support grant. Its admin gives one in Team & Rules.");
    const res = await d.sup.open(c.p.id, g.companyId, e, r.ip, d.now(), h.entry(d, r, c.p, c.a, "platform.support.started", `${g.ref}: ${e.minutes} minutes at most; ticket ${e.ticket}; reason: ${e.reason}`));
    if (res === "busy") return err(409, "End your elevation or support session first: one at a time.");
    if (res === "no-grant") return err(409, "This company has no live support grant. Its admin gives one in Team & Rules.");
    return ok({ session: res });
  });
  const close = staff(async (d, r, c) => {
    const sess = await d.sup.session(c.p.id, d.now());
    const done = await d.sup.close(c.p.id, "ended by platform staff", r.ip, d.now(), h.entry(d, r, c.p, c.a, "platform.support.ended", sess ? `${sess.company.ref}; ticket ${sess.ticket}` : "ended"));
    return done ? ok() : err(409, "No support session is open.");
  });
  const view = staff(async (d, r, c) => {
    const what = r.path[3] as SupportWhat; if (!WHATS.includes(what)) return err(404, "Not found.");
    const sess = await d.sup.session(c.p.id, d.now()); if (!sess) return err(403, NO_SESSION);
    const v = await d.sup.view(c.p.id, sess.company.id, what, r.ip, d.now());
    return v ? ok({ company: { ref: sess.company.ref, name: sess.company.name }, ...v }) : err(403, NO_SESSION);
  });

  return {
    "GET team/support": companyGet, "POST team/support/grants": grantCreate, "POST team/support/grants/:id/revoke": grantRevoke,
    "GET admin/support": platformGet, "POST admin/support/open": open, "POST admin/support/close": close, "GET admin/support/view/:what": view,
  };
}
