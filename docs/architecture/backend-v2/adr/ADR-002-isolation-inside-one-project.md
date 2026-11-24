# ADR-002: Isolation inside one project: a role per tenant, one routing point that fails closed, row-level security as defence in depth

| | |
|---|---|
| Status | **Accepted** (owner, 2026-11-24, OD-19). |
| Date | 2026-11-23; revised 2026-11-24 (rev P4) |
| Owners | 2A (architecture), with 2F (security) |
| Related | ADR-001 (accepted; C1-01 residual risk accepted, re-confirmed 2026-11-24 with ISO-HARD, OD-15), ADR-003, ADR-010, spine v2 S3, `2A-architecture.md` A-5, A-6, A-RT-10, `2F-security.md` F-4.5; R2-06, R-56, DA-02 (rev P3); P4-A1-01, P4-A1-02, P4-A1-17, P4-A3-18 (rev P4) |

## Context

ADR-001 puts every tenant in its own schema `t_<tkey>` inside a shared Supabase project (cell). Supabase gives one Postgres instance, one pooler (Supavisor) and one set of platform roles per project. The API runs as short-lived Vercel functions that must reach any tenant in a cell. The owner accepted that one pooled login can switch to any tenant role (C1-01, R-02), on condition that compensating controls make a cross-tenant read or write impossible through the application and testable in CI.

Forces: (1) connection economy at hundreds to thousands of tenants; (2) a small, auditable trusted computing base; (3) fail-closed behaviour when anything in the chain is missing; (4) defence in depth against a single coding error; (5) transaction pooling semantics (no session state).

## Options considered

| Option | Description | Pros | Cons |
|---|---|---|---|
| A. Role per tenant via `SET LOCAL ROLE` from one login, one `router`, plus `tenant_id` + RLS | S3 as written | One pool per cell regardless of tenant count; Postgres grants stop qualified-name and `search_path` escapes; RLS catches a wrong context; router is one small module to audit | The login can assume any tenant role (C1-01); depends on transaction-local discipline |
| B. Shared schema, RLS only (today's v0.2.5 D2) | `tenant_id` column + RLS keyed on `app.tenant_id` | Simple; proven in the codebase | Superseded by ADR-001; one policy mistake exposes all tenants; no per-tenant namespace for export, restore, drift |
| C. Login credentials per tenant role | Each `t_<tkey>_rw` has its own password; API picks the credential per request | Closest to "own credentials per tenant" | Supavisor pools per (user, database): one pool per tenant exhausts server connections at a few dozen active tenants; thousands of secrets to store and rotate in the serverless runtime; still one runtime holding all secrets, so the security gain is small |
| D. One project per tenant | Database-level isolation | Strongest isolation | Rejected by ADR-001 (cost floor, fleet operations); kept only as the dedicated-cell tier |

## Decision

**Option A**, with these specifics:

1. Login roles `selvara_router_a` and `selvara_router_b` (members of NOLOGIN group `selvara_router`), NOINHERIT, own nothing, no privileges of their own. Membership in each `t_<tkey>_rw` and `t_<tkey>_ro` granted with `INHERIT FALSE, SET TRUE` (Postgres 16+ *(verify version)*). A query issued before `SET LOCAL ROLE` has no rights: fail closed. **Fallback (rev P4, P4-A1-17):** on Postgres 15 or earlier, where the per-grant `INHERIT` option does not exist, the logins' own `NOINHERIT` attribute gives the same no-rights-before-`SET ROLE` property; V-002-03 and 2F F-IT-21 assert the property on the deployed version, whichever it is.
2. One `router` module is the only code that opens a cell connection or issues `SET ROLE`, `RESET ROLE`, `set_config('role', ...)`, `set_config('search_path', ...)` or `set_config('app.*', ...)` (ESLint rule, CodeQL query and build-output grep) (rev P3). Changes to the router, migrations and isolation SQL are reviewed by R-B (CODEOWNERS) and by the contracted technical reviewer at each release gate (OD-12, P4-A3-18) (rev P4).
3. The tenant comes only from the verified Selvara session cookie and `control.sessions.active_tenant_id` (Supabase Auth tokens are used only during sign-in, SD-E2); session, membership, tenant status and schema-version window are checked in `control` on every request with no cache (R2-01), and the `v_routing` row's `route_mac` is verified; any miss fails closed (401, 403, 404, 503) (rev P3).
4. Transaction preamble, all with transaction scope: role `t_<tkey>_rw` or `_ro`, `search_path = t_<tkey>, ref, pg_temp`, `app.tenant_id`, `app.user_id`, `app.request_id`, `app.scope` (member, auditor, vendor, support, trust_public) and, for auditors, `app.engagement_id`, `statement_timeout` and `lock_timeout`; then an assertion of `current_user`, `app.tenant_id` and `search_path` (`assert_context`), repeated after each handler statement on mutation paths and, on every routed transaction, as the last statement before COMMIT; the router buffers the response and sends nothing until that assertion and the COMMIT have succeeded, so no response streams from a routed transaction (rev P4, P4-A1-02, 2F F-ISO-03). The preamble is sent as parameterised statements over the extended protocol (`set_config(..., true)` with bound values), never as a simple-query multi-statement string; role and schema names come only from a `tkey` validated against `^[a-z2-7]{16}$` (DA-02) (rev P3).
5. Tenant tables owned by `t_owner` (NOLOGIN, used only by the migrator); `tenant_id` CHECK pinned to the tenant's uuid; RLS enabled and forced.
6. Read-only paths (auditor engagements, exports, support sessions, public Trust Center) use `t_<tkey>_ro`.
7. Banned: session `SET`, `SET SESSION AUTHORIZATION`, session advisory locks, `LISTEN/NOTIFY`, named prepared statements, `SECURITY DEFINER` functions without a pinned `search_path`, simple-query multi-statement strings, and SQL text built from input outside `router` and migrations (rev P3).
8. **R-56 is stated plainly (R2-06, DA-02; control block 2F F-ISO-06, 2A A-RT-10):** if SQL injection exists anywhere inside a routed transaction, an injected `SET ROLE` to another tenant's role **succeeds**, because Postgres checks the login's role memberships; grants and RLS do not stop it. The controls are prevention and detection, not a claim that the attack fails: decisions 2, 4 and 7 (prevention); pgaudit `ROLE`, `MISC` (SET) and `FUNCTION` classes on the router logins (`FUNCTION` added in rev P4 because an injection over the extended protocol must use `set_config(...)` inside an expression, P4-A1-02; *(verify nested calls are logged, VC-09)*), or the VC-09 fallback, streamed to the SIEM with a Sev-1 alert on any role statement or any `set_config` of `role`, `search_path` or `app.%` outside the preamble shape (detection, DU-09); the post-assertions of decision 4, which detect a changed context before any response byte and before COMMIT without relying on logs; and tests that prove each control (V-002-01, V-002-07). The residual risk sits inside the owner-accepted C1-01 (R-02) (rev P3), **re-confirmed by the owner on 2026-11-24 with ISO-HARD (decision 9, OD-15)** (rev P4).
9. **ISO-HARD (rev P4, P4-A1-01; detail 2F F-4.5).** The runtime paths to keys and files are bound to the routed tenant, so a cross-tenant escape in the database does not also reach another tenant's keys or files: (a) KMS `Decrypt` and `GenerateDataKey` on `kek/<tkey>` only from a short-lived session that the router requests for the routed tenant, tagged `tkey`, with encryption context `tkey`; the key policy requires both to equal the key's tenant (F-ISO-40); (b) `ks` reached only through SECURITY DEFINER functions that take no tenant argument and read `app.tkey`, which the router sets on a separate connection to the `ks` project (F-ISO-41); (c) Storage only through `storagebroker`, which derives the prefix from the routed tenant and refuses any other (F-ISO-42); (d) a tenant-mismatch detector that raises a Sev-1 on any KMS or `ks` call whose `tkey` differs from the routed tenant of its request (F-ISO-43, F-M-19). Vendor facts and fallbacks are stated per control in F-4.5. ISO-HARD does not stop code execution in the `app` runtime, which can still request a session for any tenant; that residual stays inside C1-01.

## Consequences

- One pool per cell; tenant count does not change connection counts.
- The router preamble adds one or two round trips per transaction (one bound `set_config` statement plus the assertion, which may be pipelined; target under 5 ms in-region) (rev P3).
- Every role-level setting must be issued with `SET LOCAL`, because role defaults do not apply on `SET ROLE`.
- Catalog growth (about 800 to 850 `pg_class` rows per tenant) and relcache growth on pooled backends become the scaling limit (R-12); handled by the cell capacity rule CR-1 (rev P3).
- The migrator, not the application, owns all tenant objects; the application cannot alter its own isolation.

## Security and privacy implications

- C1-01 remains: a remote code execution in the API runtime, or SQL injection inside a routed transaction (R-56), could assume any tenant role in that cell (rev P3). Compensations: one router, fail-closed preamble, grants, RLS, application-level encryption of confidential fields (ADR-003; a database-level escape still yields ciphertext), separate cells cap blast radius, dedicated cells for the most sensitive tenants.
- Supabase superusers and the dashboard bypass all of this (R-11); covered by break-glass controls.
- Phase 4 audit rates "own credentials per tenant" as **Partial by design** (ADR-001, P4-A1-01). The owner re-confirmed the C1-01 / R-02 acceptance on **2026-11-24** with ISO-HARD added (OD-15); it is reviewed again at the Phase 5 gate against the penetration-test results (rev P4).
- With ISO-HARD, an R-56 escape reaches another tenant's rows in the same cell (E0 plaintext and E1/E2 ciphertext) but not its keys or files, and raises F-M-01 or F-M-19 (2F F-8.2) (rev P4).

## Verification

| ID | Check |
|---|---|
| V-002-01 | CI escape suite (H-CI-02): inside a routed transaction, `SET ROLE t_B_rw` **succeeds** and is detected (R-56; the test asserts that the detector alert fires); `select` on `t_B.<table>` without it fails; `search_path` manipulation in input has no effect; `ops.emit` cannot spoof `tkey`; `ref` is read-only (rev P3) |
| V-002-02 | With a correct role but a wrong `app.tenant_id`, every table returns zero rows (RLS) |
| V-002-03 | A pooled connection, checked at the start of each transaction, always shows `current_user` = login role and default `search_path` (no session leakage); on the deployed Postgres version, the login has no table rights before `SET ROLE` (`INHERIT FALSE` membership on 16+, login `NOINHERIT` on 15 or earlier) (rev P4) |
| V-002-04 | Static check: only `router` imports the cell pool; no `SET ROLE`, `RESET ROLE`, `set_config('role'`, `set_config('search_path'` or `set_config('app.` string elsewhere; no `pg` `name` option; no simple-query multi-statement call anywhere (rev P3) |
| V-002-05 | Catalog audit: every tenant table has RLS enabled and forced, owner `t_owner`, `tenant_id` CHECK; no grants to `PUBLIC`, `anon`, `authenticated` |
| V-002-06 | Revocation test: suspended tenant and removed membership refused on the next request (A-NFR-12, R2-01) (rev P3) |
| V-002-08 | Expression-form escape: an injected `set_config('role' / 'search_path' / 'app.tenant_id', …, true)` inside a SELECT through a handler makes the post-assertion fail, rolls back, sends no response byte and fires F-M-01 (2F F-IT-106) (rev P4) |
| V-002-09 | ISO-HARD: inside tenant A's request, KMS refuses B's KEK; `ks` functions return nothing for B; `storagebroker` refuses B's prefix; a synthetic mismatched KMS call fires F-M-19 (2F F-IT-100 to F-IT-104) (rev P4) |
| V-002-07 | R-56 control tests: CodeQL and lint find no string-built SQL outside `router` and migrations; every handler query is extended-protocol with bound values; injection fuzz through every API input never changes `current_user` (F-IT-24); the privilege snapshot matches (F-IT-23) (rev P3) |
