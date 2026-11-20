/* Server-only. The platform's own records (production programme group 8, migration 0010): the billing ledger, rates and tax, invoice
   numbers. Platform staff may never write company rows, so these live in platform-owned tables; a company reads only its own rows. Every unit
   of work runs in one transaction with the platform flag set (or, for the verified payment webhook, the billing-webhook flag), so a change and
   its audit entry in the platform's hash-chained log are written together. The database refuses writes from anyone but an elevated super
   admin or the verified webhook (0010). MemoryPlatStore is the stand-in for the server tests. */
import { randomUUID } from "node:crypto";
import type { Db, Tx } from "./db";
import { auditArgs, auditSql } from "./directory";
import { UpstreamError } from "./errors";
import type { AuditRow, Store } from "./types";
import { WsConflict } from "./ws/store";

export interface PActor { id: string | null; name: string; ip: string; system?: "billing-webhook" }
export interface PRec<T = Record<string, unknown>> { id: string; tenantId: string | null; data: T; version: number }
export interface PTx {
  readonly now: number; readonly actor: PActor;
  get<T = Record<string, unknown>>(kind: string, id: string): Promise<PRec<T> | null>;
  list<T = Record<string, unknown>>(kind: string, tenantId?: string): Promise<PRec<T>[]>;
  insert(kind: string, id: string, tenantId: string | null, data: object): Promise<void>;
  update(kind: string, id: string, data: object, version: number): Promise<void>;
  next(kind: string, start: number): Promise<number>;
  /** An entry in the platform's own log (and, when `tenantId` is given, the same entry in that company's log, attributed to "Platform"). */
  audit(action: string, target: string, cat?: string, tenantId?: string | null): Promise<void>;
}
/** A company's view: its own rows of the platform's records, and its admins' billing requests (0010 company_billing_request). */
export interface CompanyView {
  list<T = Record<string, unknown>>(kind: string): Promise<PRec<T>[]>;
  request(kind: "billing-plan-request" | "billing-checkout", id: string, data: object): Promise<void>;
  /** The price list in force (the same for every company). */
  prices<T>(): Promise<T | null>;
}
export interface PlatStore {
  /** `read`: a read-only unit of work. Rows are then read without a lock: under row level security a locking read also applies the write
   *  policy, which would hide every row from a reader who may not write (support, a super admin not elevated). */
  tx<T>(actor: PActor, now: number, work: (t: PTx) => Promise<T>, opts?: { read?: boolean }): Promise<T>;
  /** The same operations inside a transaction already open (a platform approval's decision applies its change there). */
  over(q: Tx | null, actor: PActor, now: number, read?: boolean): PTx;
  company<T>(tenantId: string, userId: string, now: number, work: (v: CompanyView) => Promise<T>): Promise<T>;
}

const KIND_RE = /^[a-z][a-z0-9.-]{1,39}$/;
const check = (k: string) => { if (!KIND_RE.test(k)) throw new Error("bad kind"); };
const entry = (a: PActor, at: number, action: string, target: string, cat: string, tenantId: string | null): AuditRow =>
  ({ at, actor: tenantId ? "Platform" : a.name, actorId: tenantId ? null : a.id, tenantId, action, target: target.slice(0, 1000), cat, space: tenantId ? "ws" : "admin", ip: a.system ? "system" : a.ip });

export class PgPlatStore implements PlatStore {
  constructor(private db: Db) {}
  async tx<T>(actor: PActor, now: number, work: (t: PTx) => Promise<T>, opts?: { read?: boolean }): Promise<T> {
    try { return await this.db.tx({ tenantId: null, userId: actor.id, platform: true, system: actor.system }, (q) => work(this.over(q, actor, now, !!opts?.read))); }
    catch (e) { if (e instanceof UpstreamError && (e.code === "40001" || e.code === "23505")) throw new WsConflict("Someone changed this record meanwhile. Reload and try again."); throw e; }
  }
  over(q: Tx | null, actor: PActor, now: number, read = false): PTx {
    const db = q!;
    const row = <R,>(x: Record<string, unknown>): PRec<R> => ({ id: String(x.id), tenantId: (x.tenant_id as string | null) ?? null, data: x.data as R, version: Number(x.version) });
    return {
      now, actor,
      async get<R>(kind: string, id: string) { check(kind); const r = await db.query(`select id, tenant_id, data, version from platform_records where kind = $1 and id = $2 and deleted_ms is null${read ? "" : " for update"}`, [kind, id]); return r[0] ? row<R>(r[0]) : null; },
      async list<R>(kind: string, tenantId?: string) {
        check(kind);
        const r = await db.query(`select id, tenant_id, data, version from platform_records where kind = $1 and deleted_ms is null ${tenantId ? "and tenant_id = $2" : ""} order by created_ms, id limit 20000`, tenantId ? [kind, tenantId] : [kind]);
        return r.map((x) => row<R>(x));
      },
      async insert(kind, id, tenantId, data) {
        check(kind);
        const r = await db.query(`insert into platform_records (kind, id, tenant_id, data, created_ms, updated_ms, updated_by) values ($1, $2, $3, $4, $5, $5, $6) on conflict (kind, id) do nothing returning id`, [kind, id, tenantId, JSON.stringify(data), now, actor.id]);
        if (!r.length) throw new WsConflict("That id is already taken. Reload and try again.");
      },
      async update(kind, id, data, version) {
        const r = await db.query(`update platform_records set data = $3, version = version + 1, updated_ms = $4, updated_by = $5 where kind = $1 and id = $2 and version = $6 and deleted_ms is null returning id`, [kind, id, JSON.stringify(data), now, actor.id, version]);
        if (!r.length) throw new WsConflict("Someone changed this record meanwhile. Reload and try again.");
      },
      async next(kind, start) {
        check(kind);
        const r = await db.query<{ n: string }>("insert into platform_counters (kind, n) values ($1, $2 + 1) on conflict (kind) do update set n = greatest(platform_counters.n, $2) + 1 returning n", [kind, start]);
        return Number(r[0].n);
      },
      async audit(action, target, cat = "Billing", tenantId = null) {
        await db.query(auditSql, auditArgs(entry(actor, now, action, target, cat, null)));
        // a company's own log gets its entry through the platform function that already writes there for company changes (0006)
        if (tenantId) await db.query("select platform_company_audit($1, $2, $3, $4)", [tenantId, action, target.slice(0, 1000), cat]);
      },
    };
  }
  async company<T>(tenantId: string, userId: string, now: number, work: (v: CompanyView) => Promise<T>): Promise<T> {
    return this.db.tx({ tenantId, userId }, (q) => work({
      async list<R>(kind: string) {
        check(kind);
        const r = await q.query("select id, tenant_id, data, version from platform_records where kind = $1 and tenant_id = $2 and deleted_ms is null order by created_ms, id", [kind, tenantId]);
        return r.map((x) => ({ id: String(x.id), tenantId, data: x.data as R, version: Number(x.version) }));
      },
      async request(kind, id, data) { await q.query("select company_billing_request($1, $2, $3, $4)", [id, kind, JSON.stringify(data), now]); },
      async prices<R>() { const r = await q.query("select data from platform_records where kind = 'billing-price' and id = 'current' and deleted_ms is null"); return (r[0]?.data as R) ?? null; },
    }));
  }
}

/** In-memory stand-in: the same records and rules the server relies on (the database's write rules are checked by the routes here). */
export class MemoryPlatStore implements PlatStore {
  rows = new Map<string, { kind: string; id: string; tenantId: string | null; data: unknown; version: number; created: number }>();
  counters = new Map<string, number>();
  constructor(private store: Store) {}
  private key = (k: string, i: string) => `${k}\u0000${i}`;
  async tx<T>(actor: PActor, now: number, work: (t: PTx) => Promise<T>): Promise<T> { // reads need no special path in memory
    const snap = { rows: structuredClone([...this.rows]), counters: new Map(this.counters), log: (this.store as unknown as { auditLog: AuditRow[] }).auditLog.length };
    try { return await work(this.over(null, actor, now)); }
    catch (e) { this.rows = new Map(snap.rows); this.counters = snap.counters; (this.store as unknown as { auditLog: AuditRow[] }).auditLog.length = snap.log; throw e; }
  }
  over(_q: Tx | null, actor: PActor, now: number): PTx {
    const { rows, counters, key, store } = this; const self = { rows, counters, key, store };
    return {
      now, actor,
      async get<R>(kind: string, id: string) { const r = self.rows.get(self.key(kind, id)); return r ? { id, tenantId: r.tenantId, data: structuredClone(r.data) as R, version: r.version } : null; },
      async list<R>(kind: string, tenantId?: string) {
        return [...self.rows.values()].filter((r) => r.kind === kind && (!tenantId || r.tenantId === tenantId)).sort((a, b) => a.created - b.created || a.id.localeCompare(b.id))
          .map((r) => ({ id: r.id, tenantId: r.tenantId, data: structuredClone(r.data) as R, version: r.version }));
      },
      async insert(kind, id, tenantId, data) { check(kind); const k = self.key(kind, id); if (self.rows.has(k)) throw new WsConflict("That id is already taken. Reload and try again."); self.rows.set(k, { kind, id, tenantId, data: structuredClone(data), version: 1, created: now + self.rows.size / 1e6 }); },
      async update(kind, id, data, version) { const r = self.rows.get(self.key(kind, id)); if (!r || r.version !== version) throw new WsConflict("Someone changed this record meanwhile. Reload and try again."); r.data = structuredClone(data); r.version += 1; },
      async next(kind, start) { const n = Math.max(self.counters.get(kind) ?? 0, start) + 1; self.counters.set(kind, n); return n; },
      async audit(action, target, cat = "Billing", tenantId = null) {
        await self.store.audit(entry(actor, now, action, target, cat, null));
        if (tenantId) await self.store.audit(entry(actor, now, action, target, cat, tenantId));
      },
    };
  }
  async company<T>(tenantId: string, userId: string, now: number, work: (v: CompanyView) => Promise<T>): Promise<T> {
    const { rows, key } = this; const self = { rows, key };
    return work({
      async list<R>(kind: string) { return [...self.rows.values()].filter((r) => r.kind === kind && r.tenantId === tenantId).map((r) => ({ id: r.id, tenantId, data: structuredClone(r.data) as R, version: r.version })); },
      async request(kind, id, data) { const k = self.key(kind, id); if (self.rows.has(k)) throw new WsConflict("That id is already taken."); self.rows.set(k, { kind, id, tenantId, data: { ...structuredClone(data), by: userId }, version: 1, created: now }); },
      async prices<R>() { return (structuredClone(self.rows.get(self.key("billing-price", "current"))?.data) as R) ?? null; },
    });
  }
}
export const newId = () => randomUUID();
