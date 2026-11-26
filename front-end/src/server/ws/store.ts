/* Server-only. The workspace modules' storage (production programme, decision D7; migration 0008). Every unit of work runs in one transaction
   that carries the person and the company (row level security), so a module's change, its audit entry in the company's hash-chained log and any
   four-eyes request are written together or not at all. Records keep the shapes the screens use; a version number refuses a change made on a
   stale copy. MemoryWsStore is the stand-in for the server tests. */
import { randomUUID } from "node:crypto";
import type { Db, Tx } from "../db";
import { auditArgs, auditSql, loadApprovals, type ApprovalRow, type ApprovalStatus } from "../directory";
import { PassThrough, UpstreamError } from "../errors";
import type { AuditRow, Store } from "../types";

/** Who acts: always from the session, never from the request. `role` is the base company role (admin, owner, analyst, ...). */
export interface Actor { id: string; name: string; role: string; tenantId: string; ip: string; /** EDGE-18: the version of the record named in the path that the person loaded (X-Record-Version); checked once per request. */ expect?: { id: string; version: number; done?: boolean }; /** EDGE-16: the viewer's IANA time zone (validated), for "today"; undefined means UTC. */ tz?: string; /** Filled after a commit with what was audited (webhook events, server/ws/webhooks.ts). */ committed?: { action: string; target: string }[] }
export interface Rec<T = Record<string, unknown>> { id: string; data: T; version: number }
export interface NewWsApproval { kind: string; title: string; subject: string; payload: Record<string, unknown>; needs: 1 | 2; approverRoles: string[]; forbid: string[]; ttlMs: number }

/** A change that cannot be made as asked (stale copy, taken id, request decided meanwhile). Becomes a 409 with this message. */
export class WsConflict extends PassThrough {}
/** A rule refused the change. Becomes a 403 (or `status`) with the rule's own message, exactly as the browser explains it. */
export class WsRefused extends PassThrough { constructor(msg: string, public status = 403) { super(msg); } }

export interface WsTx {
  readonly actor: Actor;
  readonly now: number;
  get<T = Record<string, unknown>>(kind: string, id: string): Promise<Rec<T> | null>;
  list<T = Record<string, unknown>>(kind: string): Promise<Rec<T>[]>;
  insert(kind: string, id: string, data: object): Promise<void>;
  /** Replaces the record's data if it is still at `version`. */
  update(kind: string, id: string, data: object, version: number): Promise<void>;
  /** Marks the record removed (it stays, for the audit trail). */
  remove(kind: string, id: string, version: number): Promise<void>;
  /** The next number of a per-company sequence, starting after `start`. */
  next(kind: string, start: number): Promise<number>;
  /** An entry in the company's log; `system` attributes it to "System" (an expiry noticed during someone else's action). */
  audit(action: string, target: string, cat?: string, system?: boolean): Promise<void>;
  /* four-eyes requests of this module (approvals and approval_votes, migration 0003) */
  request(a: NewWsApproval): Promise<ApprovalRow>;
  approvals(kinds: string[]): Promise<ApprovalRow[]>;
  /** One request, locked for the decision. */
  approval(id: string, kinds: string[]): Promise<ApprovalRow | null>;
  vote(id: string, reason: string): Promise<void>;
  setApproval(id: string, status: ApprovalStatus, reason?: string): Promise<void>;
  /** An in-app notice for one person. */
  notify(userId: string, text: string): Promise<void>;
  /** The company's own audit log, newest first: entries before chain number `before` (all when null), at most `limit`. */
  auditPage(before: number | null, limit: number): Promise<CompanyAuditEntry[]>;
  /** The first chain number of the company's log that does not verify, or null when every entry does (0009). */
  auditVerify(): Promise<number | null>;
}
export interface CompanyAuditEntry { chainN: number; at: number; actor: string; action: string; target: string; cat: string; hash: string; prevHash: string }
export interface WsStore { tx<T>(actor: Actor, now: number, work: (t: WsTx) => Promise<T>): Promise<T> }

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
/** People without an account (API keys, vendor contacts, public Trust Center visitors) act with an empty id: stored as null, never as text. */
const entry = (a: Actor, at: number, action: string, target: string, cat = "Control", system = false): AuditRow =>
  ({ at, actor: system ? "System" : a.name, actorId: system || !isUuid(a.id) ? null : a.id, tenantId: a.tenantId, action, target: target.slice(0, 1000), cat, space: "ws", ip: system ? "system" : a.ip });
const KIND_RE = /^[a-z][a-z0-9.-]{1,39}$/;
const checkKind = (k: string) => { if (!KIND_RE.test(k)) throw new Error("bad kind"); };

export class PgWsStore implements WsStore {
  constructor(private db: Db, private store: Store) {}
  async tx<T>(actor: Actor, now: number, work: (t: WsTx) => Promise<T>): Promise<T> {
    const store = this.store; const notices: { userId: string; text: string }[] = []; const done: { action: string; target: string }[] = [];
    const by = isUuid(actor.id) ? actor.id : null; // the record's last writer (null for someone without an account)
    try {
      const out = await this.db.tx({ tenantId: actor.tenantId, userId: actor.id }, async (q: Tx) => {
        const t: WsTx = {
          actor, now,
          async get<R>(kind: string, id: string) {
            checkKind(kind);
            const r = await q.query("select id, data, version from ws_records where tenant_id = $1 and kind = $2 and id = $3 and deleted_ms is null for update", [actor.tenantId, kind, id]);
            return r[0] ? { id: String(r[0].id), data: r[0].data as R, version: Number(r[0].version) } : null;
          },
          async list<R>(kind: string) {
            checkKind(kind);
            const r = await q.query("select id, data, version from ws_records where tenant_id = $1 and kind = $2 and deleted_ms is null order by created_ms, id limit 5000", [actor.tenantId, kind]);
            return r.map((x) => ({ id: String(x.id), data: x.data as R, version: Number(x.version) }));
          },
          async insert(kind, id, data) {
            checkKind(kind);
            const r = await q.query(`insert into ws_records (tenant_id, kind, id, data, created_ms, updated_ms, updated_by) values ($1, $2, $3, $4, $5, $5, $6)
              on conflict (tenant_id, kind, id) do nothing returning id`, [actor.tenantId, kind, id, JSON.stringify(data), now, by]);
            if (!r.length) throw new WsConflict("That id is already taken. Reload and try again.");
          },
          async update(kind, id, data, version) {
            const r = await q.query(`update ws_records set data = $4, version = version + 1, updated_ms = $5, updated_by = $6
              where tenant_id = $1 and kind = $2 and id = $3 and version = $7 and deleted_ms is null returning id`, [actor.tenantId, kind, id, JSON.stringify(data), now, by, version]);
            if (!r.length) throw new WsConflict("Someone changed this record meanwhile. Reload and try again.");
          },
          async remove(kind, id, version) {
            const r = await q.query(`update ws_records set deleted_ms = $4, version = version + 1, updated_ms = $4, updated_by = $5
              where tenant_id = $1 and kind = $2 and id = $3 and version = $6 and deleted_ms is null returning id`, [actor.tenantId, kind, id, now, by, version]);
            if (!r.length) throw new WsConflict("Someone changed this record meanwhile. Reload and try again.");
          },
          async next(kind, start) {
            checkKind(kind);
            const r = await q.query<{ n: string }>(`insert into ws_counters (tenant_id, kind, n) values ($1, $2, $3 + 1)
              on conflict (tenant_id, kind) do update set n = greatest(ws_counters.n, $3) + 1 returning n`, [actor.tenantId, kind, start]);
            return Number(r[0].n);
          },
          async audit(action, target, cat, system) { await q.query(auditSql, auditArgs(entry(actor, now, action, target, cat, system))); done.push({ action, target }); },
          async request(a) {
            const r = await q.query<{ id: string }>(`insert into approvals (tenant_id, kind, title, subject_ref, payload, needs, approver_roles, forbid, requested_by, created_ms, expires_ms, domain)
              values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'ws') returning id`,
              [actor.tenantId, a.kind, a.title.slice(0, 300), a.subject, JSON.stringify(a.payload), a.needs, a.approverRoles, a.forbid.filter(isUuid), actor.id, now, now + a.ttlMs]);
            await q.query(auditSql, auditArgs(entry(actor, now, `approval.${a.kind}.requested`, `${a.title} (${r[0].id})`, "Approval")));
            return (await loadApprovals(q, actor.tenantId, r[0].id, [a.kind]))[0];
          },
          approvals: (kinds) => loadApprovals(q, actor.tenantId, undefined, kinds),
          async approval(id, kinds) { return /^[0-9a-f-]{36}$/i.test(id) ? (await loadApprovals(q, actor.tenantId, id, kinds))[0] ?? null : null; },
          async vote(id, reason) {
            try { await q.query("insert into approval_votes (approval_id, by_user, at_ms, reason) values ($1, $2, $3, $4)", [id, actor.id, now, reason]); }
            catch (e) { if (e instanceof UpstreamError && e.code === "42501") throw new WsRefused("Segregation of duties: you cannot approve this request."); throw e; } // the database's own guard (0003)
          },
          async setApproval(id, status, reason) { await q.query("update approvals set status = $2, decided_reason = coalesce($3, decided_reason) where id = $1", [id, status, reason ?? null]); },
          async notify(userId, text) { if (isUuid(userId)) notices.push({ userId, text }); }, // sent only once the change has committed
          async auditPage(before, limit) {
            const r = await q.query(`select chain_n, at_ms, actor, action, target, cat, hash, prev_hash from audit_log where tenant_id = $1 and chain_n is not null
              and ($2::bigint is null or chain_n < $2) order by chain_n desc limit $3`, [actor.tenantId, before, Math.min(500, Math.max(1, limit))]);
            return r.map((x) => ({ chainN: Number(x.chain_n), at: Number(x.at_ms), actor: String(x.actor), action: String(x.action), target: String(x.target), cat: String(x.cat), hash: String(x.hash ?? ""), prevHash: String(x.prev_hash ?? "") }));
          },
          async auditVerify() { const r = await q.query<{ v: string | null }>("select public.company_audit_verify() as v"); return r[0]?.v == null ? null : Number(r[0].v); },
        };
        return work(versioned(t));
      });
      for (const n of notices) await store.insertNotice({ id: randomUUID().replace(/-/g, "").slice(0, 12), userId: n.userId, at: now, text: n.text.slice(0, 300) }).catch(() => undefined);
      actor.committed?.push(...done);
      return out;
    } catch (e) {
      if (e instanceof UpstreamError && (e.code === "40001" || e.code === "23505")) throw new WsConflict("Someone changed this record meanwhile. Reload and try again.");
      throw e;
    }
  }
}

/** In-memory workspace storage for the server tests. A unit of work that throws leaves nothing behind (its company's state is restored). */
export class MemoryWsStore implements WsStore {
  private st = {
    rows: new Map<string, { tenantId: string; kind: string; id: string; data: unknown; version: number; created: number; deleted?: number }>(),
    counters: new Map<string, number>(),
    requests: [] as (ApprovalRow & { tenantId: string; forbidIds: string[] })[],
  };
  get rows() { return this.st.rows; }
  constructor(private store: Store) {}
  private key = (t: string, k: string, i: string) => `${t}\u0000${k}\u0000${i}`;
  async tx<T>(actor: Actor, now: number, work: (t: WsTx) => Promise<T>): Promise<T> {
    const st = this.st; const key = this.key;
    const snap = { rows: structuredClone([...st.rows]), counters: new Map(st.counters), requests: structuredClone(st.requests), log: (this.store as unknown as { auditLog: AuditRow[] }).auditLog.length };
    const store = this.store;
    const person = async (id: string) => (await store.profileById(id))?.person ?? "";
    const pending: AuditRow[] = []; const pending2: { userId: string; text: string }[] = [];
    const t: WsTx = {
      actor, now,
      async get<R>(kind: string, id: string) { const r = st.rows.get(key(actor.tenantId, kind, id)); return r && !r.deleted ? { id, data: structuredClone(r.data) as R, version: r.version } : null; },
      async list<R>(kind: string) {
        return [...st.rows.values()].filter((r) => r.tenantId === actor.tenantId && r.kind === kind && !r.deleted).sort((a, b) => a.created - b.created || a.id.localeCompare(b.id))
          .map((r) => ({ id: r.id, data: structuredClone(r.data) as R, version: r.version }));
      },
      async insert(kind, id, data) { checkKind(kind); const k = key(actor.tenantId, kind, id); if (st.rows.has(k)) throw new WsConflict("That id is already taken. Reload and try again."); st.rows.set(k, { tenantId: actor.tenantId, kind, id, data: structuredClone(data), version: 1, created: now }); },
      async update(kind, id, data, version) { const r = st.rows.get(key(actor.tenantId, kind, id)); if (!r || r.deleted || r.version !== version) throw new WsConflict("Someone changed this record meanwhile. Reload and try again."); r.data = structuredClone(data); r.version += 1; },
      async remove(kind, id, version) { const r = st.rows.get(key(actor.tenantId, kind, id)); if (!r || r.deleted || r.version !== version) throw new WsConflict("Someone changed this record meanwhile. Reload and try again."); r.deleted = now; r.version += 1; },
      async next(kind, start) { const k = `${actor.tenantId}\u0000${kind}`; const n = Math.max(st.counters.get(k) ?? 0, start) + 1; st.counters.set(k, n); return n; },
      async audit(action, target, cat, system) { pending.push(entry(actor, now, action, target, cat, system)); },
      async request(a) {
        const id = randomUUID();
        const row = { tenantId: actor.tenantId, forbidIds: a.forbid, id, kind: a.kind, title: a.title, subject: a.subject, payload: a.payload, needs: a.needs, approverRoles: a.approverRoles, forbid: a.forbid,
          requestedBy: actor.id, requestedByName: actor.name, status: "Pending" as ApprovalStatus, createdAt: now, expiresAt: now + a.ttlMs, votes: [] };
        st.requests.unshift(row); pending.push(entry(actor, now, `approval.${a.kind}.requested`, `${a.title} (${id})`, "Approval"));
        return structuredClone(row);
      },
      async approvals(kinds) { return structuredClone(st.requests.filter((r) => r.tenantId === actor.tenantId && kinds.includes(r.kind))); },
      async approval(id, kinds) { const r = st.requests.find((x) => x.id === id && x.tenantId === actor.tenantId && kinds.includes(x.kind)); return r ? structuredClone(r) : null; },
      async vote(id, reason) {
        const r = st.requests.find((x) => x.id === id)!;
        if (r.requestedBy === actor.id || r.forbidIds.includes(actor.id)) throw new WsRefused("Segregation of duties: you cannot approve this request."); // the database trigger's rule
        r.votes.push({ by: actor.id, byName: await person(actor.id), at: now, reason });
      },
      async setApproval(id, status, reason) { const r = st.requests.find((x) => x.id === id)!; r.status = status; if (reason) r.decidedReason = reason; },
      async notify(userId, text) { pending2.push({ userId, text }); },
      async auditPage(before, limit) { // the stand-in has no hash chain: numbered in order, no hashes
        const log = (store as unknown as { auditLog: AuditRow[] }).auditLog.map((e, i) => ({ e, n: i + 1 })).filter((x) => x.e.tenantId === actor.tenantId)
          .map((x, i) => ({ chainN: i + 1, at: x.e.at, actor: x.e.actor, action: x.e.action, target: x.e.target, cat: x.e.cat, hash: "", prevHash: "" }));
        return log.filter((x) => before == null || x.chainN < before).reverse().slice(0, limit);
      },
      async auditVerify() { return null; },
    };
    try {
      const out = await work(versioned(t));
      for (const e of pending) await store.audit(e);
      for (const n of pending2) await store.insertNotice({ id: randomUUID().slice(0, 12), userId: n.userId, at: now, text: n.text.slice(0, 300) });
      actor.committed?.push(...pending.map((e) => ({ action: e.action, target: e.target })));
      return out;
    } catch (e) {
      st.rows = new Map(snap.rows); st.counters = snap.counters; st.requests = snap.requests;
      (store as unknown as { auditLog: AuditRow[] }).auditLog.length = snap.log;
      throw e;
    }
  }
}

/* EDGE-18: versioned edits. Every record the server reads carries its version as `_v` (so the screens know which copy they hold); `_v` is never
   stored. When the request names the version the person loaded (X-Record-Version, for the record whose id is in the path), the first change to
   that record compares it: a save made from an older copy is refused (409) instead of silently replacing a newer change. */
export const STALE_COPY = "This record changed since you opened it. Reload to see the latest version, then make your change again.";
const withVersion = <R,>(rec: Rec<R> | null): Rec<R> | null =>
  rec && rec.data && typeof rec.data === "object" && !Array.isArray(rec.data) ? { ...rec, data: { ...(rec.data as object), _v: rec.version } as R } : rec;
const withoutVersion = (data: object): object => {
  if (!data || typeof data !== "object" || Array.isArray(data) || !("_v" in data)) return data;
  const { _v, ...rest } = data as Record<string, unknown>; void _v; return rest;
};
export function versioned(t: WsTx): WsTx {
  const check = (id: string, version: number) => {
    const ex = t.actor.expect; if (!ex || ex.done || ex.id !== id) return;
    ex.done = true; if (ex.version !== version) throw new WsConflict(STALE_COPY);
  };
  return {
    ...t,
    async get<R>(kind: string, id: string) { return withVersion(await t.get<R>(kind, id)); },
    async list<R>(kind: string) { return (await t.list<R>(kind)).map((r) => withVersion(r)!); },
    insert: (kind, id, data) => t.insert(kind, id, withoutVersion(data)),
    update: (kind, id, data, version) => { check(id, version); return t.update(kind, id, withoutVersion(data), version); },
    remove: (kind, id, version) => { check(id, version); return t.remove(kind, id, version); },
  };
}
