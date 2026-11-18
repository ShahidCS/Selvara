/* Database tests for the backend foundation (migration 0003, docs/architecture/BACKEND_FOUNDATION.md): tenant isolation by row level security,
   the approvals guard, the audit hash chain and the schema check, against a real Postgres.

   Run: TEST_DATABASE_URL=postgres://postgres:<password>@localhost:5432/selvara_test npm run test:db
   The URL must name a THROWAWAY database and a superuser: the tests drop and recreate its schemas. Never point it at Supabase. */
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { Db, SCHEMA_VERSION, dbFromEnv } from "@/server/db";
import { UpstreamError } from "@/server/errors";

const URL_ = process.env.TEST_DATABASE_URL;
const ROOT = path.resolve(__dirname, "../../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const now = Date.now();

let admin: Client; let app: Db; let appUrl = "";
const A = randomUUID(), B = randomUUID();                       // two companies
const alex = randomUUID(), blair = randomUUID(), casey = randomUUID(), drew = randomUUID(); // alex, blair in A; casey in B; drew platform
const ctxA = (userId = alex) => ({ tenantId: A, userId });
const ctxB = (userId = casey) => ({ tenantId: B, userId });
const code = async (p: Promise<unknown>) => { try { await p; return "ok"; } catch (e) { return e instanceof UpstreamError ? e.code : String(e); } };

describe.runIf(!!URL_)("tenant isolation in the database (row level security)", () => {
  beforeAll(async () => {
    admin = new Client({ connectionString: URL_ }); await admin.connect();
    await admin.query("drop schema if exists public cascade; drop schema if exists auth cascade; create schema public; grant usage on schema public to public;");
    await admin.query(readFileSync(path.join(__dirname, "bootstrap.sql"), "utf8"));
    for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith(".sql")).sort()) await admin.query(readFileSync(path.join(MIGRATIONS, f), "utf8"));
    const pw = randomBytes(24).toString("base64url");          // a throwaway login for this run only
    await admin.query(`alter role selvara_app with login password '${pw}'`);
    for (const [id, email, person] of [[alex, "alex@a.example.test", "Alex Kim"], [blair, "blair@a.example.test", "Blair Ng"], [casey, "casey@b.example.test", "Casey Ito"], [drew, "drew@platform.example.test", "Drew Platt"]]) {
      await admin.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await admin.query("insert into public.profiles (id, email, person, role, status, requested_ms) values ($1, $2, $3, 'employee', 'Active', $4)", [id, email, person, now]);
    }
    await admin.query("insert into public.tenants (id, ref, name, created_ms) values ($1, 'cust-a', 'Company A', $3), ($2, 'cust-b', 'Company B', $3)", [A, B, now]);
    await admin.query("insert into public.memberships (tenant_id, user_id, role, status, created_ms) values ($1, $2, 'admin', 'Active', $5), ($1, $3, 'owner', 'Active', $5), ($4, $6, 'admin', 'Active', $5)", [A, alex, blair, B, now, casey]);
    await admin.query("insert into public.platform_staff (user_id, role, created_ms) values ($1, 'super', $2)", [drew, now]);
    const u = new URL(URL_!); u.username = "selvara_app"; u.password = pw;
    appUrl = u.toString(); app = dbFromEnv(appUrl);
  });
  afterAll(async () => { await app?.close(); await admin?.end(); });

  it("sees nothing without a request context", async () => {
    const r = await app.tx({ tenantId: null, userId: null }, async (q) => ({
      tenants: (await q.query("select id from tenants")).length, members: (await q.query("select * from memberships")).length,
      profiles: (await q.query("select id from profiles")).length, audit: (await q.query("select seq from audit_log")).length,
    }));
    expect(r).toEqual({ tenants: 0, members: 0, profiles: 0, audit: 0 });
  });

  it("a company sees only its own company, members and their profiles, even with no filter in the query", async () => {
    const r = await app.tx(ctxA(), async (q) => ({
      tenants: (await q.query<{ ref: string }>("select ref from tenants")).map((x) => x.ref),
      members: (await q.query<{ user_id: string }>("select user_id from memberships order by role")).map((x) => x.user_id),
      people: (await q.query<{ person: string }>("select person from profiles order by person")).map((x) => x.person),
    }));
    expect(r).toEqual({ tenants: ["cust-a"], members: [alex, blair], people: ["Alex Kim", "Blair Ng"] });
  });

  it("cannot read, change or add another company's rows", async () => {
    const read = await app.tx(ctxA(), (q) => q.query("select * from memberships where tenant_id = $1", [B]));
    expect(read).toEqual([]);
    const changed = await app.tx(ctxA(), (q) => q.query("update memberships set role = 'viewer' where tenant_id = $1 returning user_id", [B]));
    expect(changed).toEqual([]);
    expect(await code(app.tx(ctxA(), (q) => q.query("insert into memberships (tenant_id, user_id, role, status, created_ms) values ($1, $2, 'admin', 'Active', $3)", [B, alex, now])))).toBe("42501");
    expect(await code(app.tx(ctxA(), (q) => q.query("update memberships set tenant_id = $1 where user_id = $2", [B, blair])))).toBe("42501");
    const stillB = await app.tx(ctxB(), (q) => q.query<{ role: string }>("select role from memberships"));
    expect(stillB).toEqual([{ role: "admin" }]);
  });

  it("a person can list their own memberships across companies (to choose one), and nothing else", async () => {
    const mine = await app.tx({ tenantId: null, userId: casey }, (q) => q.query<{ tenant_id: string }>("select tenant_id from memberships"));
    expect(mine.map((m) => m.tenant_id)).toEqual([B]);
  });

  it("deletes are refused everywhere, and the sign-in tables are out of reach", async () => {
    expect(await code(app.tx(ctxA(), (q) => q.query("delete from memberships where user_id = $1", [blair])))).toBe("42501");
    for (const t of ["sessions", "kv", "recovery_codes", "passkeys", "notices", "audit_chain"]) expect(await code(app.tx(ctxA(), (q) => q.query(`select * from ${t}`)))).toBe("42501");
  });

  it("platform staff see platform data only with the platform flag, and workspace approvals stay with their company", async () => {
    await admin.query("insert into public.approvals (tenant_id, kind, title, approver_roles, requested_by, created_ms, expires_ms, domain) values (null, 'tenant.create', 'New company', '{super}', $1, $2, $3, 'admin')", [drew, now, now + 3_600_000]);
    expect(await app.tx(ctxA(), (q) => q.query("select id from approvals where domain = 'admin'"))).toEqual([]);
    const plat = await app.tx({ tenantId: null, userId: drew, platform: true }, async (q) => ({
      tenants: (await q.query("select id from tenants")).length, admin: (await q.query("select id from approvals where domain = 'admin'")).length,
    }));
    expect(plat).toEqual({ tenants: 2, admin: 1 });
  });

  describe("four-eyes approvals", () => {
    let ap: string;
    beforeAll(async () => {
      ap = (await app.tx(ctxA(alex), (q) => q.query<{ id: string }>(
        "insert into approvals (tenant_id, kind, title, approver_roles, forbid, requested_by, created_ms, expires_ms, domain) values ($1, 'team-role', 'Make Blair admin', '{admin}', $2, $3, $4, $5, 'ws') returning id",
        [A, [blair], alex, now, now + 86_400_000])))[0].id;
    });
    it("another company cannot see the request or vote on it", async () => {
      expect(await app.tx(ctxB(), (q) => q.query("select id from approvals"))).toEqual([]);
      expect(await code(app.tx(ctxB(), (q) => q.query("insert into approval_votes (approval_id, by_user, at_ms, reason) values ($1, $2, $3, 'Looks right to me')", [ap, casey, now])))).toBe("42501");
    });
    it("the requester and the people in forbid can never vote, whatever the server does", async () => {
      expect(await code(app.tx(ctxA(alex), (q) => q.query("insert into approval_votes (approval_id, by_user, at_ms, reason) values ($1, $2, $3, 'Approving my own')", [ap, alex, now])))).toBe("42501");
      expect(await code(app.tx(ctxA(blair), (q) => q.query("insert into approval_votes (approval_id, by_user, at_ms, reason) values ($1, $2, $3, 'I am the subject here')", [ap, blair, now])))).toBe("42501");
    });
    it("a vote is cast only as the signed-in person, once, with a reason of at least 10 characters", async () => {
      const other = randomUUID();
      await admin.query("insert into auth.users (id, email) values ($1, 'eden@a.example.test')", [other]);
      await admin.query("insert into public.profiles (id, email, person, role, status, requested_ms) values ($1, 'eden@a.example.test', 'Eden Ra', 'employee', 'Active', $2)", [other, now]);
      await admin.query("insert into public.memberships (tenant_id, user_id, role, status, created_ms) values ($1, $2, 'admin', 'Active', $3)", [A, other, now]);
      expect(await code(app.tx(ctxA(other), (q) => q.query("insert into approval_votes (approval_id, by_user, at_ms, reason) values ($1, $2, $3, 'Voting as someone else')", [ap, casey, now])))).toBe("42501");
      expect(await code(app.tx(ctxA(other), (q) => q.query("insert into approval_votes (approval_id, by_user, at_ms, reason) values ($1, $2, $3, 'short')", [ap, other, now])))).toBe("23514");
      expect(await code(app.tx(ctxA(other), (q) => q.query("insert into approval_votes (approval_id, by_user, at_ms, reason) values ($1, $2, $3, 'Checked the ticket, fine')", [ap, other, now])))).toBe("ok");
      expect(await code(app.tx(ctxA(other), (q) => q.query("insert into approval_votes (approval_id, by_user, at_ms, reason) values ($1, $2, $3, 'Voting a second time')", [ap, other, now])))).toBe("23505");
    });
  });

  describe("audit log hash chain", () => {
    const log = (ctx: { tenantId: string; userId: string }, action: string) => app.tx(ctx, (q) => q.query(
      "insert into audit_log (at_ms, actor, action, target, cat, space, ip, tenant_id, actor_id, request_id) values ($1, 'Someone', $2, 'target', 'Test', 'ws', '198.51.100.7', $3, $4, 'req-1')",
      [now, action, ctx.tenantId, ctx.userId]));
    it("chains each company separately, also under concurrent writers, and verifies", async () => {
      await Promise.all([log(ctxA(), "a.1"), log(ctxB(), "b.1"), log(ctxA(), "a.2"), log(ctxA(), "a.3"), log(ctxB(), "b.2")]);
      const a = await app.tx(ctxA(), (q) => q.query<{ chain_n: string; prev_hash: string; hash: string }>("select chain_n, prev_hash, hash from audit_log order by chain_n"));
      expect(a.map((x) => Number(x.chain_n))).toEqual([1, 2, 3]);
      expect(a[0].prev_hash).toBe("0".repeat(64));
      expect(a[1].prev_hash).toBe(a[0].hash); expect(a[2].prev_hash).toBe(a[1].hash);
      expect((await admin.query("select public.audit_verify($1) as bad", [A])).rows[0].bad).toBeNull();
      expect((await admin.query("select public.audit_verify($1) as bad", [B])).rows[0].bad).toBeNull();
    });
    it("cannot be changed or deleted, and tampering by a database administrator is detected", async () => {
      expect(await code(app.tx(ctxA(), (q) => q.query("update audit_log set action = 'edited'")))).toBe("42501");
      await expect(admin.query("update public.audit_log set action = 'edited' where tenant_id = $1", [A])).rejects.toThrow(/append-only/);
      await admin.query("alter table public.audit_log disable trigger audit_log_no_change");
      await admin.query("update public.audit_log set action = 'edited' where tenant_id = $1 and chain_n = 2", [A]);
      await admin.query("alter table public.audit_log enable trigger audit_log_no_change");
      expect(Number((await admin.query("select public.audit_verify($1) as bad", [A])).rows[0].bad)).toBe(2);
    });
  });

  describe("schema check and request context", () => {
    it("works at the current schema and fails closed when the database is older than the code", async () => {
      expect(await app.schemaVersion()).toBe(SCHEMA_VERSION);
      await admin.query("delete from public.schema_version where version = $1", [SCHEMA_VERSION]);
      const stale = dbFromEnv(appUrl); // a new server instance: the check is cached per instance
      expect(await code(stale.ensureSchema())).toBe("SCHEMA_OUTDATED");
      await stale.close();
      await admin.query("insert into public.schema_version (version, name, applied_ms) values ($1, '0003_tenancy_foundation', $2)", [SCHEMA_VERSION, now]);
    });
    it("refuses a tenant or user id that is not a uuid (no injection through the context)", async () => {
      expect(await code(app.tx({ tenantId: "x' or true --", userId: null }, (q) => q.query("select 1")))).toBe("BAD_CONTEXT");
    });
    it("a failed unit of work leaves nothing behind", async () => {
      await code(app.tx(ctxA(), async (q) => { await q.query("update memberships set role = 'viewer' where user_id = $1", [blair]); throw new Error("boom"); }));
      expect(await app.tx(ctxA(), (q) => q.query<{ role: string }>("select role from memberships where user_id = $1", [blair]))).toEqual([{ role: "owner" }]);
    });
  });
});

describe.runIf(!URL_)("database tests", () => {
  // Locally they are skipped without a database; in CI a missing database must fail, never pass silently.
  it.runIf(!!process.env.CI)("needs TEST_DATABASE_URL in CI", () => { throw new Error("TEST_DATABASE_URL is not set: the database tests did not run"); });
  it.skipIf(!!process.env.CI)("skipped: set TEST_DATABASE_URL to a throwaway Postgres to run them (CI does)", () => {});
});
