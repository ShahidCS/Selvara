/* Server-only. Direct Postgres access as the `selvara_app` role, which row level security binds (docs/architecture/BACKEND_FOUNDATION.md
   section 6, migration 0003). Every unit of work runs in one transaction that first sets the request context (tenant, user, platform) with
   transaction-local settings, so the database itself refuses rows of another company even if a query forgets its filter. Supabase Auth stays
   on supabase-js (supabase.ts). */
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { PassThrough, UpstreamError, upstream } from "./errors";

/** The database version this code needs (schema_version). Older databases are refused: the server fails closed instead of half-working. */
export const SCHEMA_VERSION = 16;

/** Who is acting. The tenant comes from the session, never from the request. */
export interface DbCtx { tenantId: string | null; userId: string | null; platform?: boolean; /** A server job with no person (0010): only the verified billing webhook. */ system?: "billing-webhook" }
/** The query surface handed to a unit of work: parameterised queries only. */
export interface Tx { query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<R[]> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const idOrEmpty = (v: string | null | undefined, what: string): string => {
  if (v == null || v === "") return "";
  if (!UUID.test(v)) throw new UpstreamError("db.context", "BAD_CONTEXT", undefined, `${what} is not a uuid`);
  return v.toLowerCase();
};

export class Db {
  private checkedAt = 0;
  constructor(private pool: Pool, private now: () => number = Date.now) {}

  /** Runs `work` in one transaction with the request context set. Commits on success, rolls back on any error. */
  async tx<T>(ctx: DbCtx, work: (q: Tx) => Promise<T>, opts: { skipSchemaCheck?: boolean } = {}): Promise<T> {
    if (!opts.skipSchemaCheck) await this.ensureSchema();
    let c: PoolClient;
    try { c = await this.pool.connect(); } catch (e) { throw upstream("db.connect", e); }
    try {
      await c.query("begin");
      await c.query("select set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true), set_config('app.platform', $3, true), set_config('app.system', $4, true)",
        [idOrEmpty(ctx.tenantId, "tenant"), idOrEmpty(ctx.userId, "user"), ctx.platform ? "on" : "", ctx.system === "billing-webhook" ? "billing-webhook" : ""]);
      const q: Tx = { query: async (text, values) => { try { return (await c.query(text, values)).rows; } catch (e) { throw upstream("db.query", e); } } };
      const out = await work(q);
      await c.query("commit");
      return out;
    } catch (e) {
      await c.query("rollback").catch(() => { /* the connection is discarded below */ });
      throw e instanceof UpstreamError || e instanceof PassThrough ? e : upstream("db.tx", e);
    } finally { c.release(); }
  }

  /** The database's schema version (0 when the table is missing). */
  async schemaVersion(): Promise<number> {
    return this.tx({ tenantId: null, userId: null }, async (q) => {
      const r = await q.query<{ v: number | null }>("select max(version) as v from public.schema_version");
      return Number(r[0]?.v ?? 0);
    }, { skipSchemaCheck: true }).catch((e) => { if (e instanceof UpstreamError && e.code === "42P01") return 0; throw e; });
  }

  /** Refuses to work against a database older than this code. Checked at most once a minute per server instance. */
  async ensureSchema(): Promise<void> {
    if (this.now() - this.checkedAt < 60_000) return;
    const v = await this.schemaVersion();
    if (v < SCHEMA_VERSION) throw new UpstreamError("db.schema", "SCHEMA_OUTDATED", 503, `database schema ${v}, this server needs ${SCHEMA_VERSION}: run the missing migrations`);
    this.checkedAt = this.now();
  }

  async close(): Promise<void> { await this.pool.end(); }
}

/** Builds the pool from DATABASE_URL. TLS is required and verified against the Supabase CA certificate (DATABASE_CA_CERT, public), except
 *  for a local database. Any sslmode in the URL is ignored so it cannot weaken this. Small pool: each serverless instance serves few requests. */
export function dbFromEnv(url: string, caCert?: string): Db {
  const u = new URL(url);
  u.searchParams.delete("sslmode");
  const local = ["localhost", "127.0.0.1", "::1"].includes(u.hostname);
  if (!local && !caCert) throw new UpstreamError("db.config", "NO_CA", undefined, "DATABASE_CA_CERT is required for a remote database");
  const pool = new Pool({
    connectionString: u.toString(),
    ssl: local ? false : { ca: caCert, rejectUnauthorized: true },
    max: 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 5_000, statement_timeout: 8_000,
    application_name: "selvara-api",
  });
  pool.on("error", () => { /* an idle client failed; the pool replaces it. Failures in requests are logged by handle() */ });
  return new Db(pool);
}
