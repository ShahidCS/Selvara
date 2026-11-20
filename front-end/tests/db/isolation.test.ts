/* Database tests for the backend foundation (migrations 0003 and 0004, docs/architecture/BACKEND_FOUNDATION.md): tenant isolation by row level
   security, the approvals guard, the audit hash chain, the schema check, and the company directory the server uses for sessions and roles
   (src/server/directory.ts), against a real Postgres.

   Run: TEST_DATABASE_URL=postgres://postgres:<password>@localhost:5432/selvara_test npm run test:db
   The URL must name a THROWAWAY database and a superuser: the tests drop and recreate its schemas. Never point it at Supabase. */
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { Db, SCHEMA_VERSION, dbFromEnv } from "@/server/db";
import { UpstreamError } from "@/server/errors";
import { PgDirectory } from "@/server/directory";
import { PgPlatform } from "@/server/platform";
import { PgSupport } from "@/server/support";
import { PgWsStore, WsConflict, WsRefused, type Actor } from "@/server/ws/store";
import { MemoryStore } from "@/server/memory";
import type { AuditRow } from "@/server/types";

const URL_ = process.env.TEST_DATABASE_URL;
const ROOT = path.resolve(__dirname, "../../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const now = Date.now();

let admin: Client; let app: Db; let appUrl = "";
const A = randomUUID(), B = randomUUID();                       // two companies
const alex = randomUUID(), blair = randomUUID(), casey = randomUUID(), drew = randomUUID(), gale = randomUUID(); // alex, blair in A; casey in B; drew platform
const ctxA = (userId = alex) => ({ tenantId: A, userId });
const ctxB = (userId = casey) => ({ tenantId: B, userId });
const code = async (p: Promise<unknown>) => { try { await p; return "ok"; } catch (e) { return e instanceof UpstreamError ? e.code : String(e); } };

describe.runIf(!!URL_)("tenant isolation in the database (row level security)", () => {
  beforeAll(async () => {
    admin = new Client({ connectionString: URL_ }); await admin.connect();
    await admin.query("drop schema if exists public cascade; drop schema if exists auth cascade; create schema public; grant usage on schema public to public;");
    await admin.query(readFileSync(path.join(__dirname, "bootstrap.sql"), "utf8"));
    for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith(".sql")).sort()) {
      if (f.startsWith("0004")) { // a platform person with an old global role, from before companies existed (0004 moves it, 0005 drops the column)
        await admin.query("insert into auth.users (id, email) values ($1, 'gale@platform.example.test')", [gale]);
        await admin.query("insert into public.profiles (id, email, person, role, status, requested_ms) values ($1, 'gale@platform.example.test', 'Gale Orr', 'super2', 'Active', $2)", [gale, now]);
      }
      await admin.query(readFileSync(path.join(MIGRATIONS, f), "utf8"));
    }
    const pw = randomBytes(24).toString("base64url");          // a throwaway login for this run only
    await admin.query(`alter role selvara_app with login password '${pw}'`);
    for (const [id, email, person] of [[alex, "alex@a.example.test", "Alex Kim"], [blair, "blair@a.example.test", "Blair Ng"], [casey, "casey@b.example.test", "Casey Ito"], [drew, "drew@platform.example.test", "Drew Platt"]]) {
      await admin.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await admin.query("insert into public.profiles (id, email, person, status, requested_ms) values ($1, $2, $3, 'Active', $4)", [id, email, person, now]);
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
      await admin.query("insert into public.profiles (id, email, person, status, requested_ms) values ($1, 'eden@a.example.test', 'Eden Ra', 'Active', $2)", [other, now]);
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

  describe("company directory (migration 0004, src/server/directory.ts)", () => {
    let dir: PgDirectory;
    const entry = (tenantId: string, actorId: string, action: string): AuditRow => ({ at: now, actor: "Someone", actorId, tenantId, action, target: "target", cat: "Access", space: "ws", ip: "198.51.100.7" });
    beforeAll(async () => {
      dir = new PgDirectory(app);
      await admin.query(`insert into public.tenant_settings (tenant_id, lockout, updated_ms) values ($1, '{"preset":"pci"}', $3), ($2, '{"preset":"custom","custom":{"attempts":3,"minutes":60}}', $3)`, [A, B, now]);
    });

    it("a person sees only the companies and settings of their active memberships, and codes resolve only active companies", async () => {
      expect((await dir.companiesOf(alex)).map((c) => c.company.ref)).toEqual(["cust-a"]);
      expect((await dir.companiesOf(casey)).map((c) => [c.company.ref, c.role])).toEqual([["cust-b", "admin"]]);
      expect(await dir.lockoutsOf(alex)).toEqual([{ preset: "pci" }]);
      expect(await app.tx({ tenantId: null, userId: alex }, (q) => q.query("select tenant_id from tenant_settings"))).toEqual([{ tenant_id: A }]);
      expect(await app.tx({ tenantId: null, userId: alex }, (q) => q.query("select ref from tenants"))).toEqual([{ ref: "cust-a" }]);
      expect(await app.tx(ctxA(), (q) => q.query("update tenant_settings set lockout = '{}' where tenant_id = $1 returning tenant_id", [B]))).toEqual([]);
      expect(await code(app.tx(ctxA(), (q) => q.query("insert into tenant_settings (tenant_id, updated_ms) values ($1, $2) on conflict (tenant_id) do update set version = 9", [B, now])))).toBe("42501");
      expect(await dir.companyByCode(" CUST-B ")).toBe(B);
      expect(await dir.companyByCode("cust-zz")).toBeNull();
      await admin.query("update public.tenants set status = 'Suspended' where id = $1", [B]);
      expect(await dir.companyByCode("cust-b")).toBeNull();
      expect(await dir.companiesOf(casey)).toEqual([]);
      await admin.query("update public.tenants set status = 'Active' where id = $1", [B]);
    });

    it("joining, deciding and settings changes stay in their company and write their audit entry in the same transaction", async () => {
      const fay = randomUUID();
      await admin.query("insert into auth.users (id, email) values ($1, 'fay@a.example.test')", [fay]);
      await admin.query("insert into public.profiles (id, email, person, status, requested_ms) values ($1, 'fay@a.example.test', 'Fay Lund', 'Pending', $2)", [fay, now]);
      expect(await dir.requestToJoin(A, fay, now, entry(A, fay, "team.join.requested"))).toBe(true);
      expect(await dir.requestToJoin(A, fay, now, entry(A, fay, "team.join.requested"))).toBe(false);
      expect((await dir.members(A, alex, "Pending")).map((m) => m.person)).toEqual(["Fay Lund"]);
      expect(await dir.members(B, casey, "Pending")).toEqual([]);
      expect(await dir.membership(B, fay)).toBeNull();
      // a pending member sees no company and no settings yet
      expect(await dir.companiesOf(fay)).toEqual([]);
      expect(await app.tx({ tenantId: null, userId: fay }, async (q) => [...await q.query("select id from tenants"), ...await q.query("select tenant_id from tenant_settings")])).toEqual([]);
      expect(await dir.decide(B, casey, fay, "Active", "Approving from the wrong company", now, entry(B, casey, "team.join.approved"))).toBe(false);
      expect(await dir.decide(A, alex, fay, "Active", "Joined the team this week", now, entry(A, alex, "team.join.approved"))).toBe(true);
      expect(await dir.decide(A, alex, fay, "Removed", "Deciding a second time", now, entry(A, alex, "team.join.rejected"))).toBe(false);
      expect((await dir.membership(A, fay))!.status).toBe("Active");
      await dir.setLockout(A, alex, { preset: "strict" }, now, entry(A, alex, "team.lockout.changed"));
      expect(await dir.lockoutOf(A, alex)).toEqual({ preset: "strict" });
      expect((await admin.query("select lockout, version, updated_by from public.tenant_settings where tenant_id = $1", [A])).rows[0]).toEqual({ lockout: { preset: "strict" }, version: 2, updated_by: alex });
      const log = (await admin.query("select action, tenant_id from public.audit_log where action like 'team.%' order by seq")).rows;
      expect(log).toEqual([{ action: "team.join.requested", tenant_id: A }, { action: "team.join.approved", tenant_id: A }, { action: "team.lockout.changed", tenant_id: A }]);
      await expect(dir.setLockout(A, alex, { preset: "strict" }, now, { ...entry(A, alex, "x"), cat: null as unknown as string })).rejects.toThrow(); // audit fails ...
      expect((await admin.query("select version from public.tenant_settings where tenant_id = $1", [A])).rows[0].version).toBe(2); // ... so the change is undone
    });

    it("bootstrap_company is for the owner only, validates its input, and the functions are not exposed to the public API roles", async () => {
      expect(await code(app.tx(ctxA(), (q) => q.query("select public.bootstrap_company('new-co', 'New Test Co', 'alex@a.example.test')")))).toBe("42501");
      for (const [role, fn] of [["anon", "tenant_id_by_ref(text)"], ["authenticated", "tenant_id_by_ref(text)"], ["anon", "audit_verify(text)"], ["authenticated", "audit_verify(text)"],
        ["selvara_app", "bootstrap_company(text,text,text)"], ["service_role", "bootstrap_company(text,text,text)"], ["anon", "bootstrap_company(text,text,text)"]])
        expect([role, fn, (await admin.query(`select has_function_privilege($1, 'public.${fn}', 'execute') as ok`, [role])).rows[0].ok]).toEqual([role, fn, false]);
      const pgCode = async (sql: string) => { try { await admin.query(sql); return "ok"; } catch (e) { return (e as { code?: string }).code; } };
      expect(await pgCode("select public.bootstrap_company('No Caps', 'New Test Co', 'alex@a.example.test')")).toBe("22023");
      expect(await pgCode("select public.bootstrap_company('cust-a', 'New Test Co', 'alex@a.example.test')")).toBe("23505");
      expect(await pgCode("select public.bootstrap_company('new-co', 'New Test Co', 'nobody@a.example.test')")).toBe("22023");
      expect(await pgCode("select public.bootstrap_company('new-co', 'New Test Co', 'drew@platform.example.test')")).toBe("22023");
      const id = (await admin.query("select public.bootstrap_company(' New-Co ', 'New Test Co', 'ALEX@a.example.test') as id")).rows[0].id as string;
      expect((await dir.companiesOf(alex)).map((c) => [c.company.ref, c.role])).toEqual([["cust-a", "admin"], ["new-co", "admin"]]);
      expect(await dir.lockoutsOf(alex)).toEqual(expect.arrayContaining([{ preset: "standard" }]));
      expect((await admin.query("select public.audit_verify($1) as bad", [id])).rows[0].bad).toBeNull();
      expect((await admin.query("select count(*)::int as n from public.audit_log where tenant_id = $1 and action = 'tenant.created'", [id])).rows[0].n).toBe(1);
    });

    it("moved old platform roles to platform staff; profiles.role is gone, and running 0004 and 0005 again changes nothing", async () => {
      expect(await dir.platformRole(gale)).toBe("super");
      expect(await dir.platformRole(alex)).toBeNull();
      const before = (await admin.query("select (select count(*) from public.tenants)::int as t, (select count(*) from public.platform_staff)::int as s, (select count(*) from public.invitations)::int as i")).rows[0];
      await admin.query(readFileSync(path.join(MIGRATIONS, "0004_company_sessions.sql"), "utf8"));
      await admin.query(readFileSync(path.join(MIGRATIONS, "0005_team_changes.sql"), "utf8"));
      expect((await admin.query("select (select count(*) from public.tenants)::int as t, (select count(*) from public.platform_staff)::int as s, (select count(*) from public.invitations)::int as i")).rows[0]).toEqual(before);
      expect((await admin.query("select count(*)::int as n from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'role'")).rows[0].n).toBe(0);
    });
  });

  describe("role changes, approvals and invitations (migration 0005, src/server/directory.ts)", () => {
    let dir: PgDirectory;
    const log = (tenantId: string, actorId: string) => (action: string, target: string): AuditRow => ({ at: now, actor: "Someone", actorId, tenantId, action, target, cat: "Access", space: "ws", ip: "198.51.100.7" });
    const person = async (email: string, name: string) => {
      const id = randomUUID();
      await admin.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await admin.query("insert into public.profiles (id, email, person, status, requested_ms) values ($1, $2, $3, 'Active', $4)", [id, email, name, now]);
      return id;
    };
    const hash = (n: number) => String(n).repeat(64).slice(0, 64);
    let gus = "", hal = "";
    beforeAll(async () => {
      dir = new PgDirectory(app);
      gus = await person("gus@a.example.test", "Gus Lowe"); hal = await person("hal@a.example.test", "Hal Moss");
      await admin.query("insert into public.memberships (tenant_id, user_id, role, status, created_ms) values ($1, $2, 'employee', 'Active', $4), ($1, $3, 'admin', 'Active', $4)", [A, gus, hal, now]);
    });

    it("an approved grant applies in the decision's transaction; the requester, the subject and another company cannot decide", async () => {
      const id = await dir.requestApproval(A, alex, { kind: "team-role", title: "Grant owner to Gus Lowe", subject: gus, payload: { userId: gus, name: "Gus Lowe", from: "employee", to: "owner" }, needs: 1, approverRoles: ["admin"], forbid: [gus], ttlMs: 3600_000 }, now, log(A, alex)("approval.team-role.requested", "Grant owner to Gus Lowe"));
      expect(await dir.pendingApproval(A, alex, "team-role", gus, now)).toBe(true);
      expect(await dir.approvals(B, casey)).toEqual([]);
      expect(await dir.decideApproval(B, { id: casey, role: "admin" }, id, true, "From the wrong company", now, log(B, casey))).toEqual({ ok: false, code: 404, error: "Request not found." });
      expect(await dir.decideApproval(A, { id: alex, role: "admin" }, id, true, "Approving my own request", now, log(A, alex))).toEqual(expect.objectContaining({ ok: false, code: 403 }));
      // the database refuses the requester's vote even if the server's check were skipped
      expect(await code(app.tx(ctxA(), (q) => q.query("insert into approval_votes (approval_id, by_user, at_ms, reason) values ($1, $2, $3, 'bypassing the server')", [id, alex, now])))).toBe("42501");
      expect(await dir.decideApproval(A, { id: hal, role: "admin" }, id, true, "Gus owns the ISMS now", now, log(A, hal))).toEqual({ ok: true, status: "Approved" });
      expect((await dir.membership(A, gus))!.role).toBe("owner");
      expect((await dir.approvals(A, alex))[0]).toEqual(expect.objectContaining({ status: "Approved", requestedByName: "Alex Kim", votes: [expect.objectContaining({ by: hal, byName: "Hal Moss" })] }));
      const acts = (await admin.query("select action from public.audit_log where target like '%Gus Lowe%' order by seq")).rows.map((r) => r.action);
      expect(acts).toEqual(["approval.team-role.requested", "approval.team-role.approved", "member.role.changed"]);
    });

    it("a grant that can no longer apply rolls back the vote too, and the last admin cannot be demoted even by two requests at once", async () => {
      const id = await dir.requestApproval(A, alex, { kind: "team-role", title: "Grant admin to Gus Lowe", subject: gus, payload: { userId: gus, name: "Gus Lowe", from: "employee", to: "admin" }, needs: 1, approverRoles: ["admin"], forbid: [gus], ttlMs: 3600_000 }, now, log(A, alex)("approval.team-role.requested", "x"));
      expect(await dir.decideApproval(A, { id: hal, role: "admin" }, id, true, "Gus is no longer employee", now, log(A, hal))).toEqual(expect.objectContaining({ ok: false, code: 409 }));
      expect((await admin.query("select count(*)::int as n from public.approval_votes where approval_id = $1", [id])).rows[0].n).toBe(0);
      expect((await dir.approvals(A, alex)).find((x) => x.id === id)!.status).toBe("Pending");
      expect(await dir.withdrawApproval(A, { id: hal, role: "admin" }, id, now, log(A, hal))).toEqual(expect.objectContaining({ ok: false, code: 403 }));
      expect(await dir.withdrawApproval(A, { id: alex, role: "admin" }, id, now, log(A, alex))).toEqual({ ok: true, status: "Withdrawn" });
      // two admins left (alex, hal): demoting both at once must leave one
      await admin.query("update public.memberships set role = 'employee' where tenant_id = $1 and role = 'admin' and user_id not in ($2, $3)", [A, alex, hal]);
      const r = await Promise.all([dir.setRole(A, hal, alex, "admin", "employee", now, log(A, hal)("member.role.changed", "a")), dir.setRole(A, alex, hal, "admin", "employee", now, log(A, alex)("member.role.changed", "b"))]);
      expect(r.filter(Boolean).length).toBe(1);
      expect((await dir.admins(A, alex)).length).toBe(1);
      const left = (await dir.admins(A, alex))[0]; const other = left === alex ? hal : alex;
      await dir.setRole(A, left, other, "employee", "admin", now, log(A, left)("member.role.changed", "restore"));
      expect((await dir.admins(A, alex)).sort()).toEqual([alex, hal].sort());
    });

    it("invitations stay in their company, are found only by their token's hash, and are used once", async () => {
      const id = (await dir.createInvitation(A, alex, { email: "ivy@a.example.test", role: "analyst", tokenHash: hash(1) }, now, log(A, alex)("member.invited", "ivy")))!;
      expect(await dir.createInvitation(A, alex, { email: "ivy@a.example.test", role: "employee", tokenHash: hash(2) }, now, log(A, alex)("member.invited", "ivy"))).toBeNull();
      expect(await dir.invitations(B, casey)).toEqual([]);
      expect(await app.tx(ctxB(), (q) => q.query("update invitations set role = 'admin' where id = $1 returning id", [id]))).toEqual([]);
      expect(await app.tx({ tenantId: null, userId: null }, (q) => q.query("select id from invitations"))).toEqual([]);
      expect(await dir.invitationByToken(hash(9))).toBeNull();
      const found = (await dir.invitationByToken(hash(1)))!;
      expect([found.id, found.tenantId, found.email, found.role]).toEqual([id, A, "ivy@a.example.test", "analyst"]);
      expect((await dir.setInvitationLink(A, alex, id, hash(3), now, log(A, alex)("member.invitation.link_created", "ivy")))!.linkAt).toBe(now);
      expect(await dir.invitationByToken(hash(1))).toBeNull();
      const ivy = await person("ivy@a.example.test", "Ivy Ross");
      expect(await dir.acceptInvitation(B, ivy, id, now, log(B, ivy)("member.invitation.accepted", "ivy"))).toBe(false);
      expect(await dir.acceptInvitation(A, ivy, id, now, log(A, ivy)("member.invitation.accepted", "ivy"))).toBe(true);
      expect(await dir.acceptInvitation(A, ivy, id, now, log(A, ivy)("member.invitation.accepted", "ivy"))).toBe(false);
      expect((await dir.membership(A, ivy))!).toEqual(expect.objectContaining({ role: "analyst", status: "Active" }));
      expect((await admin.query("select token_hash, status from public.invitations where id = $1", [id])).rows[0]).toEqual({ token_hash: null, status: "Accepted" });
      expect(await code(app.tx({ tenantId: null, userId: null }, (q) => q.query("select public.add_company_admin('cust-a', 'ivy@a.example.test')")))).toBe("42501");
    });

    it("add_company_admin is for the owner only and needs an active member who is not platform staff", async () => {
      await admin.query("select public.add_company_admin('cust-a', 'gus@a.example.test')");
      expect((await dir.membership(A, gus))!.role).toBe("admin");
      expect(await code(admin.query("select public.add_company_admin('cust-b', 'gus@a.example.test')"))).toMatch(/not an active member/);
      expect(await code(admin.query("select public.add_company_admin('cust-a', 'drew@platform.example.test')"))).toMatch(/platform staff/);
      expect((await admin.query("select count(*)::int as n from public.audit_log where tenant_id = $1 and action = 'member.role.changed' and actor = 'Platform owner'", [A])).rows[0].n).toBe(1);
      const exposed = (await admin.query(`select r.rolname, p.proname from pg_proc p cross join (values ('anon'), ('authenticated'), ('service_role'), ('selvara_app')) r(rolname)
        where p.proname in ('add_company_admin', 'invitation_by_token') and has_function_privilege(r.rolname, p.oid, 'execute')`)).rows.map((x) => `${x.rolname}:${x.proname}`);
      expect(exposed).toEqual(["selvara_app:invitation_by_token"]);
    });
  });

  describe("Admin Console (migration 0006, src/server/platform.ts)", () => {
    let plat: PgPlatform; let pdir: PgDirectory; let erin = ""; let sid = "";
    const at = () => Date.now();
    const log = (actorId: string) => (action: string, target: string): AuditRow => ({ at: at(), actor: "Someone", actorId, tenantId: null, action, target, cat: "Access", space: "admin", ip: "198.51.100.7" });
    const plain = { reason: "Customer onboarding for a new contract", ticket: "OPS-101", minutes: 30 };
    beforeAll(async () => {
      plat = new PgPlatform(app); pdir = new PgDirectory(app);
      erin = randomUUID(); sid = randomUUID();
      for (const [id, email, name] of [[erin, "erin@platform.example.test", "Erin Vale"], [sid, "sid@platform.example.test", "Sid Low"]]) {
        await admin.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
        await admin.query("insert into public.profiles (id, email, person, status, requested_ms) values ($1, $2, $3, 'Active', $4)", [id, email, name, now]);
      }
      await admin.query("insert into public.platform_staff (user_id, role, created_ms) values ($1, 'super', $3), ($2, 'support', $3)", [erin, sid, now]);
    });

    it("the company functions need an elevated platform super admin, checked in the database", async () => {
      const call = (ctx: { tenantId: string | null; userId: string; platform?: boolean }) => code(app.tx(ctx, (q) => q.query("select platform_set_company_status($1, 'Suspended', 'testing the check')", [B])));
      expect(await call({ tenantId: null, userId: drew, platform: true })).toBe("42501"); // super, not elevated
      expect(await call({ tenantId: null, userId: sid, platform: true })).toBe("42501"); // support
      expect(await call({ tenantId: A, userId: alex })).toBe("42501"); // a company admin
      expect(await call({ tenantId: null, userId: alex, platform: true })).toBe("42501"); // claims the platform flag but is not staff
      expect(await code(app.tx({ tenantId: null, userId: alex }, (q) => q.query("select * from platform_companies()")))).toBe("42501");
      expect(await plat.startElevation(sid, plain, at(), log(sid)("x", "y"))).toBeTruthy(); // support may hold one, the functions still refuse
      expect(await call({ tenantId: null, userId: sid, platform: true })).toBe("42501");
      expect((await admin.query("select status from public.tenants where id = $1", [B])).rows[0].status).toBe("Active");
    });

    it("elevation: one live at a time, 60 minutes at most, an expired one is closed, and ending is audited", async () => {
      expect(await code(plat.startElevation(drew, { ...plain, minutes: 61 }, at(), log(drew)("platform.elevation.started", "x")))).toMatch(/23514|db/);
      await admin.query("insert into public.elevations (user_id, reason, ticket, started_ms, expires_ms) values ($1, 'An old elevation from earlier', 'OPS-1', $2, $3)", [drew, at() - 7200_000, at() - 5400_000]);
      expect(await plat.elevation(drew, at())).toBeNull();
      const e = await plat.startElevation(drew, plain, at(), log(drew)("platform.elevation.started", "drew"));
      expect(e!.expiresAt - e!.startedAt).toBe(30 * 60_000);
      expect(await plat.startElevation(drew, plain, at(), log(drew)("platform.elevation.started", "again"))).toBeNull();
      expect(await code(app.tx({ tenantId: null, userId: erin, platform: true }, (q) => q.query("insert into elevations (user_id, reason, ticket, started_ms, expires_ms) values ($1, 'Elevating someone else here', 'OPS-2', $2, $3)", [drew, at(), at() + 60_000])))).toBe("42501");
      expect(await plat.endElevation(drew, at(), log(drew)("platform.elevation.ended", "drew"))).toBe(true);
      expect(await plat.elevation(drew, at())).toBeNull();
      expect((await admin.query("select count(*)::int as n from public.audit_log where tenant_id is null and action like 'platform.elevation.%' and target like 'drew%'")).rows[0].n).toBe(2);
    });

    it("a company created through a platform approval gets its settings and an admin invitation; staff see counts, not members", async () => {
      await plat.startElevation(drew, plain, at(), log(drew)("platform.elevation.started", "x"));
      await plat.startElevation(erin, plain, at(), log(erin)("platform.elevation.started", "x"));
      const id = await plat.requestApproval(drew, { kind: "platform-company-create", title: "Create cust-c", subject: "cust-c", payload: { ref: "cust-c", name: "Company C", adminEmail: "first@c.example.test" }, ttlMs: 3600_000 }, at(), log(drew)("approval.platform-company-create.requested", "Create cust-c"));
      expect(await plat.pendingApproval(drew, "platform-company-create", "cust-c", at())).toBe(true);
      expect(await pdir.approvals(A, alex)).toEqual(expect.not.arrayContaining([expect.objectContaining({ id })])); // not a company's request
      expect(await plat.decideApproval({ id: drew, role: "super" }, id, true, "Approving my own request", at(), log(drew))).toEqual(expect.objectContaining({ ok: false, code: 403 }));
      expect(await plat.decideApproval({ id: erin, role: "super" }, id, true, "Contract signed yesterday", at(), log(erin))).toEqual({ ok: true, status: "Approved" });
      const c = (await plat.companies(sid)).find((x) => x.ref === "cust-c")!;
      expect(c).toEqual(expect.objectContaining({ name: "Company C", status: "Active", members: 0, admins: 0, pendingInvites: 1 }));
      expect((await plat.companies(sid)).find((x) => x.ref === "cust-a")!.admins).toBeGreaterThan(0);
      expect(await app.tx({ tenantId: null, userId: sid, platform: true }, (q) => q.query("select user_id from memberships where tenant_id = $1", [A]))).toEqual([]);
      expect(await app.tx({ tenantId: null, userId: sid, platform: true }, (q) => q.query("select id from invitations"))).toEqual([]);
      expect((await admin.query("select lockout from public.tenant_settings where tenant_id = $1", [c.id])).rows[0].lockout).toEqual({ preset: "standard" });
      // the first admin's link: only by an elevated super admin, only for the platform's own admin invitation
      expect(await plat.adminInviteLink(drew, A, "a".repeat(64), at(), log(drew)("x", "y"))).toBeNull();
      expect(await plat.adminInviteLink(drew, c.id, "b".repeat(64), at(), log(drew)("platform.company.admin_link_created", "cust-c"))).toEqual(expect.objectContaining({ email: "first@c.example.test" }));
      expect((await pdir.invitationByToken("b".repeat(64)))!.tenantId).toBe(c.id);
      // a second request for a code that is taken by then is refused, and the vote is undone with it
      const dup = await plat.requestApproval(drew, { kind: "platform-company-create", title: "Create cust-c again", subject: "cust-c", payload: { ref: "cust-c", name: "Company C2", adminEmail: "x@c.example.test" }, ttlMs: 3600_000 }, at(), log(drew)("x", "y"));
      expect(await plat.decideApproval({ id: erin, role: "super" }, dup, true, "Approving a duplicate code", at(), log(erin))).toEqual(expect.objectContaining({ ok: false, code: 409 }));
      expect((await admin.query("select count(*)::int as n from public.approval_votes where approval_id = $1", [dup])).rows[0].n).toBe(0);
      expect((await admin.query("select action from public.audit_log where tenant_id = $1", [c.id])).rows.map((r) => r.action)).toEqual(["tenant.created"]);
    });

    it("suspension through a platform approval stops the company resolving and its members' access, and is written to both logs", async () => {
      const id = await plat.requestApproval(drew, { kind: "platform-company-suspend", title: "Suspend cust-b", subject: B, payload: { companyId: B, ref: "cust-b", reason: "Unpaid invoices for months" }, ttlMs: 3600_000 }, at(), log(drew)("x", "y"));
      expect(await plat.decideApproval({ id: erin, role: "super" }, id, true, "Finance confirmed today", at(), log(erin))).toEqual({ ok: true, status: "Approved" });
      expect(await pdir.companyByCode("cust-b")).toBeNull();
      expect(await pdir.membership(B, casey)).toBeNull();
      expect((await admin.query("select action from public.audit_log where tenant_id = $1 and action = 'tenant.suspended'", [B])).rows.length).toBe(1);
      const back = await plat.requestApproval(erin, { kind: "platform-company-reactivate", title: "Reactivate cust-b", subject: B, payload: { companyId: B, ref: "cust-b", reason: "Paid in full" }, ttlMs: 3600_000 }, at(), log(erin)("x", "y"));
      expect(await plat.decideApproval({ id: drew, role: "super" }, back, true, "Payment checked by me", at(), log(drew))).toEqual({ ok: true, status: "Approved" });
      expect(await pdir.companyByCode("cust-b")).toBe(B);
    });

    it("the platform audit log holds only platform entries and its chain verifies; the functions are not exposed to the public API roles", async () => {
      const entries = await plat.auditLog(sid, 500);
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.some((x) => x.action === "tenant.created" || x.action === "tenant.suspended")).toBe(false);
      expect(entries[0].seq).toBeGreaterThan(entries[entries.length - 1].seq);
      expect(await plat.verifyAudit(sid)).toBeNull();
      expect(await code(app.tx({ tenantId: A, userId: alex }, (q) => q.query("select platform_audit_verify()")))).toBe("42501");
      const exposed = (await admin.query(`select r.rolname, p.proname from pg_proc p cross join (values ('anon'), ('authenticated'), ('service_role')) r(rolname)
        where p.proname like 'platform_%' and p.pronamespace = 'public'::regnamespace and has_function_privilege(r.rolname, p.oid, 'execute')`)).rows;
      expect(exposed).toEqual([]);
    });
  });

  describe("support access (migration 0007, src/server/support.ts)", () => {
    let sup: PgSupport; let plat: PgPlatform; let sam = ""; let kim = ""; let grant = "";
    const at = () => Date.now();
    const entry = (actorId: string, tenantId: string | null, action: string): AuditRow => ({ at: at(), actor: "Someone", actorId, tenantId, action, target: "test", cat: "Access", space: tenantId ? "ws" : "admin", ip: "198.51.100.7" });
    const plain = { reason: "Customer asked for help with SSO", ticket: "SUP-77", minutes: 30 };
    const asStaff = (userId: string, tenantId: string | null) => ({ tenantId, userId, platform: true });
    beforeAll(async () => {
      sup = new PgSupport(app); plat = new PgPlatform(app); sam = randomUUID(); kim = randomUUID();
      await admin.query("insert into auth.users (id, email) values ($1, 'sam@platform.example.test'), ($2, 'kim@platform.example.test')", [sam, kim]);
      await admin.query("insert into public.profiles (id, email, person, status, requested_ms) values ($1, 'sam@platform.example.test', 'Sam Hayes', 'Active', $3), ($2, 'kim@platform.example.test', 'Kim Rowe', 'Active', $3)", [sam, kim, now]);
      await admin.query("insert into public.platform_staff (user_id, role, created_ms) values ($1, 'support', $3), ($2, 'support', $3)", [sam, kim, now]);
      await admin.query("update public.elevations set ended_ms = expires_ms where ended_ms is null"); // from the tests above
    });

    it("without a session, the platform flag with a company in the context shows nothing of that company", async () => {
      const r = await app.tx(asStaff(drew, A), async (q) => ({ m: (await q.query("select 1 from memberships")).length, s: (await q.query("select 1 from tenant_settings")).length, a: (await q.query("select 1 from audit_log where tenant_id is not null")).length }));
      expect(r).toEqual({ m: 0, s: 0, a: 0 });
      expect(await sup.view(sam, A, "members", "198.51.100.7")).toBeNull();
      expect(await sup.open(sam, A, plain, "198.51.100.7", at(), entry(sam, null, "platform.support.started"))).toBe("no-grant");
    });

    it("only the company gives a grant (8 hours at most), and platform staff can neither give nor change one", async () => {
      expect(await code(app.tx(ctxA(), (q) => q.query("insert into support_grants (tenant_id, reason, granted_by, created_ms, expires_ms) values ($1, 'Too long a grant here', $2, $3, $4)", [A, alex, at(), at() + 9 * 3600_000])))).toBe("23514");
      expect(await code(app.tx(asStaff(sam, null), (q) => q.query("insert into support_grants (tenant_id, reason, granted_by, created_ms, expires_ms) values ($1, 'Granting myself access', $2, $3, $4)", [A, sam, at(), at() + 3600_000])))).toBe("42501");
      grant = (await sup.grant(A, alex, { reason: "Help with the SSO setup", hours: 1 }, at(), entry(alex, A, "support.grant.created")))!;
      expect(grant).toBeTruthy();
      expect(await sup.grant(A, alex, { reason: "A second one at once", hours: 1 }, at(), entry(alex, A, "support.grant.created"))).toBeNull();
      expect(await sup.grants(B, casey)).toEqual([]); // another company does not see it
      expect((await sup.liveGrants(sam)).map((g) => [g.ref, g.grantedBy])).toEqual([["cust-a", "Alex Kim"]]);
      expect(await code(app.tx(ctxB(), (q) => q.query("select * from platform_support_grants()")))).toBe("42501");
    });

    it("a support session shows that company only, read-only, and writes each view to the company's log", async () => {
      const s = await sup.open(sam, A, plain, "198.51.100.7", at(), entry(sam, null, "platform.support.started"));
      expect(typeof s === "object" && s.company.ref).toBe("cust-a");
      expect(await sup.open(sam, A, plain, "198.51.100.7", at(), entry(sam, null, "x"))).toBe("busy");
      expect(await plat.elevation(sam, at())).toBeNull(); // not a platform elevation
      const m = await sup.view(sam, A, "members", "198.51.100.9");
      const names = m && m.what === "members" ? m.members.map((x) => x.name) : [];
      expect(names).toEqual(expect.arrayContaining(["Alex Kim", "Blair Ng"])); expect(names).not.toContain("Casey Ito");
      expect(await sup.view(sam, B, "members", "198.51.100.9")).toBeNull(); // another company: nothing
      expect(await sup.view(kim, A, "members", "198.51.100.9")).toBeNull(); // another staff member without a session
      expect(await app.tx(asStaff(sam, B), (q) => q.query("select 1 from memberships"))).toEqual([]);
      // read-only, whatever the query: inserts are refused, updates match nothing
      for (const sql of ["insert into memberships (tenant_id, user_id, role, status, created_ms) values ($1, '" + sam + "', 'admin', 'Active', 1)",
        "insert into support_grants (tenant_id, reason, granted_by, created_ms, expires_ms) values ($1, 'Granting myself more time', '" + sam + "', 1, 2)",
        "insert into invitations (tenant_id, email, role, invited_by, created_ms, expires_ms) values ($1, 'x@y.example.test', 'admin', '" + sam + "', 1, 2)",
        "insert into audit_log (at_ms, actor, action, target, cat, space, ip, tenant_id) values (1, 'x', 'x', 'x', 'Access', 'ws', 'x', $1)",
        "insert into approvals (tenant_id, kind, title, approver_roles, requested_by, created_ms, expires_ms, domain) values ($1, 'team-role', 'x', '{admin}', '" + sam + "', 1, 2, 'ws')"])
        expect(await code(app.tx(asStaff(sam, A), (q) => q.query(sql, [A])))).toBe("42501");
      for (const sql of ["update memberships set role = 'viewer' where tenant_id = $1 returning 1", "update tenant_settings set version = version + 1 where tenant_id = $1 returning 1",
        "update support_grants set expires_ms = expires_ms + 1 where tenant_id = $1 returning 1", "update invitations set status = 'Revoked' where tenant_id = $1 returning 1"])
        expect(await app.tx(asStaff(sam, A), (q) => q.query(sql, [A]))).toEqual([]);
      expect((await admin.query("select role from public.memberships where user_id = $1", [blair])).rows[0].role).toBe("owner");
      expect(await code(app.tx(asStaff(sam, A), (q) => q.query("select add_company_admin('cust-a', 'blair@a.example.test')")))).toBe("42501");
      const log = await sup.accessLog(A, alex);
      expect(log.map((x) => x.action)).toEqual(expect.arrayContaining(["support.access.started", "support.viewed"]));
      expect(log.find((x) => x.action === "support.access.started")!.actor).toBe("Sam Hayes (Selvara platform)");
      expect(await sup.close(sam, "ended by platform staff", "198.51.100.7", at(), entry(sam, null, "platform.support.ended"))).toBe(true);
      expect(await sup.view(sam, A, "members", "198.51.100.9")).toBeNull();
      expect(await sup.close(sam, "again", "198.51.100.7", at(), entry(sam, null, "x"))).toBe(false);
    });

    it("revoking the grant ends a live session at once; the support entries keep the company's chain intact", async () => {
      await sup.open(kim, A, plain, "198.51.100.7", at(), entry(kim, null, "platform.support.started"));
      expect(await sup.view(kim, A, "settings", "198.51.100.7")).toEqual(expect.objectContaining({ what: "settings" }));
      // the grant check stands on its own, even if the trigger that closes the sessions did not run
      await admin.query("alter table public.support_grants disable trigger support_grant_revoked");
      await admin.query("update public.support_grants set revoked_ms = $2, revoked_by = $3 where id = $1", [grant, at(), alex]);
      expect(await sup.view(kim, A, "settings", "198.51.100.7")).toBeNull();
      await admin.query("update public.support_grants set revoked_ms = null, revoked_by = null where id = $1", [grant]);
      await admin.query("alter table public.support_grants enable trigger support_grant_revoked");
      expect(await sup.view(kim, A, "settings", "198.51.100.7")).toEqual(expect.objectContaining({ what: "settings" }));
      expect(await sup.revoke(A, alex, grant, at(), entry(alex, A, "support.grant.revoked"))).toBe(true);
      expect(await sup.view(kim, A, "settings", "198.51.100.7")).toBeNull();
      expect(await sup.session(kim, at())).toBeNull();
      expect((await admin.query("select count(*)::int as n from public.elevations where grant_id = $1 and ended_ms is null", [grant])).rows[0].n).toBe(0);
      expect(await sup.liveGrants(sam)).toEqual([]);
      expect(Number((await admin.query("select public.audit_verify($1) as bad", [A])).rows[0].bad)).toBe(2); // the tampering test above; nothing new breaks
      const exposed = (await admin.query(`select r.rolname, p.proname from pg_proc p cross join (values ('anon'), ('authenticated'), ('service_role')) r(rolname)
        where p.proname in ('platform_support_grants', 'platform_open_workspace', 'platform_close_workspace', 'support_viewed', 'support_grant_revoked')
        and p.pronamespace = 'public'::regnamespace and has_function_privilege(r.rolname, p.oid, 'execute')`)).rows;
      expect(exposed).toEqual([]);
    });
  });

  describe("workspace records (migration 0008, src/server/ws/store.ts)", () => {
    let ws: PgWsStore;
    const me = (userId: string, tenantId: string, name = "Someone", role = "admin"): Actor => ({ id: userId, name, role, tenantId, ip: "198.51.100.7" });
    beforeAll(() => { ws = new PgWsStore(app, new MemoryStore(() => Date.now())); });

    it("a company's records are its own; versions refuse a stale copy; ids come from a per-company counter", async () => {
      await ws.tx(me(alex, A), Date.now(), async (t) => {
        await t.insert("control", "GOV-1", { id: "GOV-1", title: "Company A control" });
        expect(await t.next("evidence", 208)).toBe(209); expect(await t.next("evidence", 208)).toBe(210);
        await t.audit("control.created", "GOV-1, Company A control");
      });
      expect(await ws.tx(me(casey, B), Date.now(), (t) => t.list("control"))).toEqual([]);
      expect(await ws.tx(me(casey, B), Date.now(), (t) => t.next("evidence", 208))).toBe(209); // B's own sequence
      expect(await app.tx(ctxB(), (q) => q.query("select * from ws_records where tenant_id = $1", [A]))).toEqual([]);
      expect(await code(app.tx(ctxB(), (q) => q.query("insert into ws_records (tenant_id, kind, id, data, created_ms, updated_ms) values ($1, 'control', 'X-1', '{}', 1, 1)", [A])))).toBe("42501");
      await expect(ws.tx(me(alex, A), Date.now(), (t) => t.update("control", "GOV-1", { id: "GOV-1", title: "stale" }, 7))).rejects.toBeInstanceOf(WsConflict);
      await expect(ws.tx(me(alex, A), Date.now(), (t) => t.insert("control", "GOV-1", {}))).rejects.toBeInstanceOf(WsConflict);
      await ws.tx(me(alex, A), Date.now(), async (t) => { const r = (await t.get<{ title: string }>("control", "GOV-1"))!; await t.update("control", "GOV-1", { ...r.data, title: "Renamed" }, r.version); });
      expect((await ws.tx(me(blair, A), Date.now(), (t) => t.get<{ title: string }>("control", "GOV-1")))!.data.title).toBe("Renamed");
      expect((await admin.query("select count(*)::int as n from public.audit_log where tenant_id = $1 and action = 'control.created'", [A])).rows[0].n).toBe(1);
      // a failed unit of work leaves nothing behind, audit entry included
      await expect(ws.tx(me(alex, A), Date.now(), async (t) => { await t.insert("control", "GOV-2", {}); await t.audit("control.created", "GOV-2"); throw new WsRefused("no"); })).rejects.toBeInstanceOf(WsRefused);
      expect(await ws.tx(me(alex, A), Date.now(), (t) => t.get("control", "GOV-2"))).toBeNull();
    });
    it("records are never deleted or moved: removal keeps the row, the guard refuses rewrites", async () => {
      expect(await code(app.tx(ctxA(), (q) => q.query("delete from ws_records where tenant_id = $1", [A])))).toBe("42501");
      expect(await code(app.tx(ctxA(), (q) => q.query("update ws_records set id = 'GOV-9', version = version + 1 where tenant_id = $1 and id = 'GOV-1'", [A])))).toBe("42501");
      expect(await code(app.tx(ctxA(), (q) => q.query("update ws_records set data = '{}' where tenant_id = $1 and id = 'GOV-1'", [A])))).toBe("40001"); // version must move on
      await ws.tx(me(alex, A), Date.now(), async (t) => { const r = (await t.get("control", "GOV-1"))!; await t.remove("control", "GOV-1", r.version); });
      expect(await ws.tx(me(alex, A), Date.now(), (t) => t.get("control", "GOV-1"))).toBeNull();
      expect((await admin.query("select deleted_ms from public.ws_records where tenant_id = $1 and id = 'GOV-1'", [A])).rows[0].deleted_ms).not.toBeNull();
      expect(await code(app.tx(ctxA(), (q) => q.query("update ws_records set data = '{}', version = version + 1 where tenant_id = $1 and id = 'GOV-1'", [A])))).toBe("42501");
    });
    it("module requests use the approvals engine: the database refuses a self-vote, and Team never sees them", async () => {
      const ap = await ws.tx(me(alex, A, "Alex Kim"), Date.now(), (t) => t.request({ kind: "control.exception", title: "Exception for GOV-3", subject: "GOV-3", payload: {}, needs: 1, approverRoles: ["admin", "owner"], forbid: [blair], ttlMs: 3600_000 }));
      await expect(ws.tx(me(alex, A), Date.now(), (t) => t.vote(ap.id, "Approving my own request"))).rejects.toBeInstanceOf(WsRefused);
      await expect(ws.tx(me(blair, A, "Blair Ng", "owner"), Date.now(), (t) => t.vote(ap.id, "I am the control owner"))).rejects.toBeInstanceOf(WsRefused);
      expect((await new PgDirectory(app).approvals(A, alex)).some((x) => x.id === ap.id)).toBe(false);
      expect((await ws.tx(me(casey, B), Date.now(), (t) => t.approvals(["control.exception"])))).toEqual([]);
      expect(await ws.tx(me(casey, B), Date.now(), (t) => t.approval(ap.id, ["control.exception"]))).toBeNull();
    });
    it("platform staff never write workspace records, and read them only in a support session", async () => {
      expect(await app.tx({ tenantId: A, userId: drew, platform: true }, (q) => q.query("select id from ws_records"))).toEqual([]);
      expect(await code(app.tx({ tenantId: A, userId: drew, platform: true }, (q) => q.query("insert into ws_records (tenant_id, kind, id, data, created_ms, updated_ms) values ($1, 'control', 'P-1', '{}', 1, 1)", [A])))).toBe("42501");
      expect(await code(app.tx({ tenantId: A, userId: drew, platform: true }, (q) => q.query("insert into ws_counters (tenant_id, kind, n) values ($1, 'x', 1)", [A])))).toBe("42501");      // inside a live support session (the customer's grant): the records can be read, still never written
      const wes = randomUUID();
      await admin.query("insert into auth.users (id, email) values ($1, 'wes@platform.example.test')", [wes]);
      await admin.query("insert into public.profiles (id, email, person, status, requested_ms) values ($1, 'wes@platform.example.test', 'Wes Lane', 'Active', $2)", [wes, now]);
      await admin.query("insert into public.platform_staff (user_id, role, created_ms) values ($1, 'support', $2)", [wes, now]);
      const sup = new PgSupport(app); const at = Date.now(); const log = (actorId: string, tenantId: string | null): AuditRow => ({ at, actor: "x", actorId, tenantId, action: "x", target: "x", cat: "Access", space: tenantId ? "ws" : "admin", ip: "198.51.100.7" });
      await sup.grant(A, alex, { reason: "Help with the controls register", hours: 1 }, at, log(alex, A));
      expect(typeof (await sup.open(wes, A, { reason: "Customer asked about controls", ticket: "SUP-9", minutes: 10 }, "198.51.100.7", at, log(wes, null)))).toBe("object");
      await ws.tx(me(alex, A), Date.now(), (t) => t.insert("control", "SUP-1", { id: "SUP-1" }));
      expect((await app.tx({ tenantId: A, userId: wes, platform: true }, (q) => q.query("select id from ws_records where id = 'SUP-1'"))).length).toBe(1);
      for (const sql of ["insert into ws_records (tenant_id, kind, id, data, created_ms, updated_ms) values ($1, 'control', 'P-2', '{}', 1, 1)", "insert into ws_counters (tenant_id, kind, n) values ($1, 'y', 1)"])
        expect(await code(app.tx({ tenantId: A, userId: wes, platform: true }, (q) => q.query(sql, [A])))).toBe("42501");
      expect(await app.tx({ tenantId: A, userId: wes, platform: true }, (q) => q.query("update ws_records set data = '{}', version = version + 1 where tenant_id = $1 returning id", [A]))).toEqual([]);
      await sup.close(wes, "done", "198.51.100.7", Date.now(), log(wes, null));
    });
  });

  describe("offboarding in the directory (production programme group 2)", () => {
    it("removes an active member, never the last admin, and only in the actor's company", async () => {
      const dir = new PgDirectory(app); const e = (action: string): AuditRow => ({ at: Date.now(), actor: "Someone", actorId: alex, tenantId: A, action, target: "x", cat: "Access", space: "ws", ip: "198.51.100.7" });
      const lone = randomUUID();
      await admin.query("insert into auth.users (id, email) values ($1, 'lone@b.example.test')", [lone]);
      await admin.query("insert into public.profiles (id, email, person, status, requested_ms) values ($1, 'lone@b.example.test', 'Lone Admin', 'Active', $2)", [lone, now]);
      const C = randomUUID(); await admin.query("insert into public.tenants (id, ref, name, created_ms) values ($1, 'cust-off', 'Company Off', $2)", [C, now]);
      await admin.query("insert into public.memberships (tenant_id, user_id, role, status, created_ms) values ($1, $2, 'admin', 'Active', $3)", [C, lone, now]);
      expect(await dir.removeMember(C, lone, lone, "test", Date.now(), { ...e("member.removed"), tenantId: C, actorId: lone })).toBe("last-admin");
      expect(await dir.removeMember(A, alex, lone, "not here", Date.now(), e("member.removed"))).toBe("not-active"); // another company's member
      const temp = randomUUID();
      await admin.query("insert into auth.users (id, email) values ($1, 'temp@a.example.test')", [temp]);
      await admin.query("insert into public.profiles (id, email, person, status, requested_ms) values ($1, 'temp@a.example.test', 'Temp Person', 'Active', $2)", [temp, now]);
      await admin.query("insert into public.memberships (tenant_id, user_id, role, status, created_ms) values ($1, $2, 'employee', 'Active', $3)", [A, temp, now]);
      expect(await dir.removeMember(A, alex, temp, "Leaver", Date.now(), e("member.removed"))).toBe("ok");
      expect((await admin.query("select status, reason from public.memberships where tenant_id = $1 and user_id = $2", [A, temp])).rows[0]).toEqual({ status: "Removed", reason: "Leaver" });
      expect(await dir.membership(A, temp)).toEqual(expect.objectContaining({ status: "Removed" }));
    });
  });

  describe("schema check and request context", () => {
    it("works at the current schema and fails closed when the database is older than the code", async () => {
      expect(await app.schemaVersion()).toBe(SCHEMA_VERSION);
      await admin.query("delete from public.schema_version where version = $1", [SCHEMA_VERSION]);
      const stale = dbFromEnv(appUrl); // a new server instance: the check is cached per instance
      expect(await code(stale.ensureSchema())).toBe("SCHEMA_OUTDATED");
      await stale.close();
      await admin.query("insert into public.schema_version (version, name, applied_ms) values ($1, 'restored by the test', $2)", [SCHEMA_VERSION, now]);
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
