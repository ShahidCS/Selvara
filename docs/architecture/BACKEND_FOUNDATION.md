# Backend foundation (design, draft for review)

Status: **design accepted by the owner on 2026-11-18** (all six decisions in [section 12](#12-decisions-needed) as recommended). Still a draft for security and compliance review. **Slice 1 is built** (v0.1.7): migration `0003_tenancy_foundation.sql`, `src/server/db.ts` and the database tests in `tests/db`. **Slice 2a is built** (v0.1.8): migration `0004_company_sessions.sql` and `src/server/directory.ts`. A session belongs to one company and the person's role comes from their membership there (or from platform staff), checked again on every request; a member of several companies switches with `POST /api/auth/company`; requests to join name the company by its code and are decided by that company's admins only; the lockout preset is per company (a person gets the strictest of their companies); `GET /api/team/members` lists the company's members; audit entries carry the company and the actor's id. `DATABASE_URL` is now required. **Slice 2b is built** (v0.1.9): in API mode only modules with a server API are shown (D4, `SERVER_READY` in `lib/rbac.ts`: Team & Rules today, and the account page); Team & Rules reads members, requests to join and the lockout from the server (`GET /api/team/members`, `GET /api/team/settings`); the session carries the company, with a company switcher in the account menu; the deploy builds API mode when the GitHub environment variable `API_MODE` is `http` (`SUPABASE.md` 4c). **Slice 2c is built** (v0.1.10): migration `0005_team_changes.sql` and `src/lib/rules.ts`. The approval, withdrawal, role-change and name rules are shared pure functions (D3) that the server enforces and the browser uses to explain; `lib/approvals.ts`, `lib/sod.ts` and the demonstration's Team service call them. Company admins change roles (`POST /api/team/members/:id/role`); granting admin or owner creates a request a second admin decides (`GET /api/team/approvals`, `POST /api/team/approvals/:id/approve|reject|withdraw`), applied in the decision's transaction. Invitations (`GET|POST /api/team/invitations`, `POST /api/team/invitations/:id/link|revoke`) give the admin a single-use link (`/login#invite=…`, only the token's hash stored) that admits the invited email with the invited role. `profiles.role` is dropped; `add_company_admin` lets the owner add a second admin to a one-admin company. Not yet: delegation and named approvers on the server, and email delivery of invitations (out of scope, section 13). **Slice 3a is built** (v0.1.11): migration `0006_platform_console.sql`, `src/server/platform.ts` and `src/server/admin.ts`. Platform staff see the companies with member counts only (`GET /api/admin/companies`) and the platform audit log with its chain checked (`GET /api/admin/audit`). A platform super admin starts a time-boxed elevation (`POST /api/admin/elevation`: reason, ticket, 60 minutes at most, one at a time; ended by `POST /api/admin/elevation/end` or sign-out), and only then asks to create, suspend or reactivate a company (`POST /api/admin/companies`, `POST /api/admin/companies/:ref/suspend|reactivate`). Another elevated super admin decides (`GET /api/admin/approvals`, `POST /api/admin/approvals/:id/approve|reject|withdraw`), and the change runs in the decision's transaction through database functions that check the elevation themselves. A new company gets its settings and a pending admin invitation; the platform creates its link (`POST /api/admin/companies/:ref/admin-link`). Suspension ends members' access at their next request and is written to the company's own log too. In API mode Customers & Usage, Elevated Access and the Admin Audit Log are shown (`SERVER_READY`, owner-approved change to `rbac.ts`). **Slice 3b is built** (v0.1.12): migration `0007_support_access.sql` and `src/server/support.ts`. Platform staff reach a company's workspace only through a support grant its admin gives (`GET /api/team/support`, `POST /api/team/support/grants`, `POST /api/team/support/grants/:id/revoke`: reason, 8 hours at most, one live at a time, revocable at once) and a support session that names the company (`GET /api/admin/support`, `POST /api/admin/support/open|close`: reason, ticket, 60 minutes at most, never beyond the grant, one live elevation of any kind per person, ended at sign-out). Inside it they read the company's members, sign-in setting and audit log (`GET /api/admin/support/view/members|settings|audit`) and change nothing. The database enforces it: with the platform flag, `app_tenant()` returns the company only during a live session on a live grant, and restrictive policies refuse every platform write to company data. The start, end and every view are written to the company's own audit log, shown to its admins under Team & Rules, Support access. No change to `rbac.ts` or `roles.json`: the platform side is a tab in Customers & Usage, which both platform roles reach. **The remaining modules** move to the server under [PRODUCTION_PROGRAMME.md](PRODUCTION_PROGRAMME.md) (owner decisions of 2026-11-20): group 1 (Frameworks, Controls and Tests, Evidence with real file storage) is built with migration `0008_workspace_records.sql`.

## 1. Goal

Today the server owns sign-in only. Every module (controls, risks, policies, team, ...) still keeps its data in the browser and enforces its rules there, so `NEXT_PUBLIC_API_MODE=http` cannot be switched on: lists would show the synthetic demo company and about 150 actions would answer "Not found". This document designs the foundation every module needs, so that the module work that follows is repetitive and safe:

- companies (tenants), memberships and roles on the server;
- tenant isolation that holds even if a handler has a bug;
- authorisation, segregation of duties and four-eyes approvals enforced on the server, by user id;
- an audit log written in the same transaction as the change it records;
- conventions for module APIs, migrations, tests and rollout.

## 2. Principles

1. **The server is the control.** Browser checks only explain why a button is disabled. Every rule in `src/services` and `src/lib` that protects data runs again on the server, and the server's answer wins.
2. **Deny by default.** No membership, no role, no rule match: refused.
3. **Two layers of tenant isolation.** The application filters by tenant, and the database refuses rows of another tenant anyway (row level security). A missing `where` clause must not leak data.
4. **Identity is a user id.** Names are for display. Segregation of duties compares ids, never names (today's demo compares names: `DECISIONS.md`, Backend).
5. **A change and its audit entry commit together** or not at all.
6. **The tenant comes from the session**, never from the URL or the request body.
7. Synthetic data only until the items in `SUPABASE.md` section 6 are done (Pro plan, own email, DPA).

## 3. What exists today

| Piece | State |
|---|---|
| Sign-in, MFA, passkeys, sessions, lockout, network blocking, join requests | Server (`src/server`, Supabase Auth + tables from `0001`, `0002`) |
| `profiles` | One row per person with **one global role** and no company. Enough for sign-in, not for tenants |
| Module data | Seeded in the browser (`src/data/seed.json`: 30 controls, 12 risks, 9 policies, ...) for the demo company `cust-101` |
| Rules | Browser: `lib/rbac.ts` (role to modules), `lib/sod.ts` (by name), `lib/approvals.ts` (in-memory four-eyes), `services/approvalFlow.ts` (kinds), `lib/audit.ts` (FNV chain, demo) |
| Database access | `supabase-js` with the service key: bypasses row level security, and has **no transactions** |

## 4. Tenancy model

```
tenants ──< memberships >── profiles (person) ──── auth.users (Supabase Auth)
   │                              │
   └──< every module table        └──< platform_staff (super, support: no tenant)
```

| Table | Columns (main) | Notes |
|---|---|---|
| `tenants` | `id uuid`, `ref` (e.g. `cust-101`), `name`, `region`, `status` (Active, Suspended, Closed), `plan`, `created_at` | A customer company. Created only by an elevated platform super admin (four-eyes) |
| `profiles` | `id` (= auth user id), `email`, `person`, `status` | Becomes **identity only**: `role` moves to `memberships` (migration in section 10) |
| `memberships` | `tenant_id`, `user_id`, `role`, `status` (Pending, Active, Suspended, Removed), `invited_by`, `decided_by`, `reason`, timestamps | Primary key `(tenant_id, user_id)`. Roles: `admin`, `owner`, `analyst`, `employee`, `auditor`, `vendor`, `viewer` (the demo's `admin2`/`owner2` are only second personas; the server has base roles) |
| `platform_staff` | `user_id`, `role` (`super`, `support`), `status` | Platform people have **no membership**. They reach a workspace only through an elevated session (decision 2 in `DECISIONS.md`) |

A person may belong to **several tenants** (an external auditor firm, a consultant). A session is bound to **one active tenant**; switching re-checks the membership and is audited. Decided (D1).

Requests to join (built) gain a tenant: the join form names the company by an invitation link or company code, and the request is a `Pending` membership that the company's admin decides.

## 5. Data layout conventions

Every tenant-owned table follows the same shape:

| Column | Purpose |
|---|---|
| `tenant_id uuid not null references tenants` | Isolation key; first column of every index |
| `id uuid` + `ref text` | `ref` is the human id the UI shows (`CTL-12`, `RSK-4`), `unique (tenant_id, ref)` |
| `created_by`, `created_at`, `updated_by`, `updated_at` | User ids and times (server clock) |
| `version int` | Optimistic concurrency: an update names the version it read; a stale one gets **409** |
| `deleted_at`, `legal_hold` (where retention applies) | Deletion honours the retention schedule and legal holds (`SOD_MATRIX.md` section 14) |

Shared reference data (framework catalogues, requirement texts, Annex A) lives in **global read-only tables** without `tenant_id`; a tenant's scope and mappings live in tenant tables. Lists that people filter and sort become real columns; free-form extras may be `jsonb`.

## 6. Tenant isolation: two layers

**Layer 1, application.** Every handler receives a context built from the session cookie:

```ts
interface Ctx { userId: string; tenantId: string | null; role: string; platformRole?: "super" | "support"; elevation?: Elevation; sessionId: string; requestId: string; ip: string }
```

Repository functions take `ctx` and always scope by `ctx.tenantId`; no handler reads a tenant id from the request.

**Layer 2, database (recommended: direct Postgres with row level security).** `supabase-js` uses the service key, which bypasses row level security and cannot run a transaction. The recommendation (decision D2, decided):

- the server connects to Postgres through Supabase's pooler (Supavisor, transaction mode) with the `pg` driver (MIT) as a dedicated role **`selvara_app`** that does **not** bypass row level security;
- every request runs in one transaction that first sets `set local app.tenant_id = '<ctx.tenantId>'` and `app.user_id`;
- every tenant table has the policy `using (tenant_id = current_setting('app.tenant_id')::uuid)` with the same `with check`, so a forgotten filter returns nothing and a write into another tenant fails;
- `supabase-js` stays for Supabase **Auth** only.

New secret: `DATABASE_URL` for `selvara_app` (Vercel, Sensitive). The service key stays for Auth administration.

Alternatives considered: signing per-request JWTs with a `tenant_id` claim for PostgREST (needs the JWT signing secret, still no transactions); application filtering only (one bug leaks a customer's data: not acceptable for regulated customers).

## 7. Authorisation, segregation of duties and approvals on the server

**Permissions.** `roles.json` `ROLE_MODS` (which role may open which module) becomes the server's read permission per module. Each action has a server rule, ported from the module's service (`whyCannotManage`, `assertRole`, owner and author checks).

**Shared rules (decision D3).** Today the rules read the signed-in persona from the browser store (`getActor()`). The recommendation is to refactor them into **pure functions that take the actor and the record** (`canApprove(actor, approval)`), used by the server to enforce and by the browser to explain. One rule, two callers, no drift. This touches the protected files `lib/sod.ts`, `lib/approvals.ts` and `lib/rbac.ts`, so it needs your approval; the alternative is a separate server copy of every rule (drift risk).

**Segregation of duties by id.** `assertNotSelf` compares `ctx.userId` with the record's `requested_by`, `created_by`, `owner_id`, `subject_id`. People fields in module tables become user ids (`owner_id uuid references profiles`), with the name joined for display.

**Approvals engine (server).**

| Table | Columns |
|---|---|
| `approvals` | `id`, `tenant_id` (null for platform), `kind`, `title`, `subject_ref`, `payload jsonb`, `needs` (1 or 2), `approver_roles text[]`, `forbid uuid[]`, `requested_by uuid`, `status`, `created_at`, `expires_at`, `decided_reason`, `ticket`, `domain` (`ws` or `admin`) |
| `approval_votes` | `approval_id`, `by uuid`, `at`, `reason`, `acting_for uuid` (delegation), primary key `(approval_id, by)` |
| `delegations` | `tenant_id`, `from_user`, `to_user`, `starts_at`, `ends_at`, `reason`, `ended_at` (rules: `SOD_MATRIX.md` section 9) |

A decision runs in **one transaction**: lock the approval (`for update`), check status, expiry, approver role, not the requester, not in `forbid`, not already voted, reason of 10 or more characters; record the vote; when the last vote arrives, run that kind's **apply** function in the same transaction, then write the audit entries. Expiry is checked at read and decision time, so no background job is needed for correctness. Each module registers its kinds on the server as it moves (the browser's `registerKind` list is the inventory).

**Elevation (platform).** `elevations`: `user_id`, `reason`, `ticket`, `started_at`, `expires_at` (60 minutes at most), `ended_at`. Every `/api/admin/*` write needs an active elevation; a platform person's access to a tenant workspace is granted only by an elevation naming that tenant and is written to **that tenant's** audit log, so the customer sees it.

## 8. Audit log

`audit_log` (from `0001`) is extended: `tenant_id` (null = platform log), `actor_id`, `actor_name` (snapshot), `action`, `target`, `cat`, `space`, `ip`, `request_id`, `basis` (lawful basis, platform log), `prev_hash`, `hash`.

- Written by the handler **in the same transaction** as the change.
- **Tamper evidence:** a trigger computes `hash = sha256(prev_hash || row)` per tenant (pgcrypto), replacing the browser's FNV demo chain; the append-only trigger from `0001` stays.
- Exported to a SIEM later (`CONTROLS.md` LOG-01 target).

## 9. API conventions

| Topic | Convention |
|---|---|
| Paths | `/api/<module>/...`, e.g. `GET /api/controls`, `POST /api/controls`, `POST /api/controls/:id/attest`. The tenant comes from the session |
| Reads | Each module gains list and detail endpoints; the browser loads from them in API mode instead of `seed.json` (today only writes call the API) |
| Writes | JSON body, origin and content-type checks (as for sign-in), `version` for updates |
| Errors | `{ "error": "..." }`; 400 invalid, 401 signed out, 403 not allowed (with the rule's reason), 404 not found **or another tenant's** (never 403, so ids cannot be probed), 409 stale version or state conflict, 422 rule refused |
| Size | Lists capped (500 rows) with a cursor; tenants are small today |
| Logging | `api.error` lines as now (`LOG-04`) |

## 10. Migrations, operations and rollout

- **Migrations** stay numbered SQL files in `supabase/migrations`. Today's incident (tables run in the wrong project) shows manual runs are error-prone, so: a `schema_version` table, and the server answers 503 with an `api.error` naming the missing migration when the database is older than the code (fail closed). Applying migrations from a protected GitHub workflow is the stronger option (decision D6).
- **Moving the first admin:** the `profiles.role` of the existing account becomes a membership of a new production tenant (`0003`), then the column is dropped.
- **Rollout per module (decision D4):** in API mode, modules not yet on the server are **hidden** from navigation instead of showing demo data. Production switches to API mode once the foundation and Team & Rules are live; each later module appears when its slice ships.
- **Order:** (1) foundation: tenants, memberships, sessions bound to a tenant, approvals, delegations, elevation, audit, isolation tests; (2) Team & Rules; (3) controls and evidence; (4) policies; (5) risks; (6) issues; then vendors, audits, AI, questionnaires, trust, reports, integrations, billing, and the Admin Console.

## 11. Testing

- **Handlers:** pure functions against in-memory stores, as `tests/unit/server.test.ts` does for sign-in, including every refusal path.
- **Isolation:** for each tenant table, a test that tenant A cannot read, update or delete tenant B's rows through the API **and** directly as `selvara_app`.
- **Database tests in CI** need a Postgres service in `ci.yml`, a protected workflow file (decision D5).
- **Rules:** the shared pure rule functions are tested once and used by both sides.

## 12. Decisions

All six were decided by the owner on 2026-11-18 as recommended. D3 and D5 include the owner's approval to change the protected files they name.

| # | Question | Decision |
|---|---|---|
| D1 | Can a person belong to more than one company? | **Yes**, one active company per session (external auditors and consultants need it) |
| D2 | How does the server talk to the database? | **Direct Postgres (`pg`, MIT, new dependency) as a non-bypass role with row level security per tenant**, Supabase Auth unchanged. New secret `DATABASE_URL` |
| D3 | Shared rule functions or a server copy? | **Shared pure functions**, which needs approval to change `lib/sod.ts`, `lib/approvals.ts`, `lib/rbac.ts` |
| D4 | In API mode, what do modules without a server API show? | **Hidden** until their slice ships |
| D5 | Database isolation tests in CI | **Yes**: add a Postgres service to `ci.yml` (protected file, needs approval) |
| D6 | How are migrations applied? | **Now:** manual with `schema_version` and fail-closed. **Later:** a protected workflow applying them with an approval |

## 13. Out of scope here

Billing and money arithmetic, file uploads and malware scanning, email delivery, the vendor portal's external identities, SIEM export, and data residency outside the EU. Each gets its own design when its module moves.
