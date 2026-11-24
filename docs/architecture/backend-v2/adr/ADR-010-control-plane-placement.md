# ADR-010: Control plane: separate schema in a dedicated project, what it holds, who can reach it

| | |
|---|---|
| Status | **Accepted** (owner, 2026-11-24, OD-19). |
| Date | 2026-11-23 |
| Owners | 2A |
| Related | Spine v2 S1, S2; ADR-001, ADR-002, ADR-006; `2A-architecture.md` A-3, A-7; R2-01, R2-03, DA-05, DA-06, DA-12 (rev P3) |

## Context

The control plane decides who may enter which tenant, holds identities, platform roles, approvals, billing, key registry and deletion certificates (S2). It must outlive tenants (certificates), survive the restore of a cell, and never hold tenant business data. The spine allows `cp` and `c1` to share a project at launch only if this ADR records the trade-off. Supabase Auth exists once per project, and identities must be global because a person may belong to tenants in different cells (D1).

## Options considered

| Option | Description | Pros | Cons |
|---|---|---|---|
| A. `control` schema inside `c1` at launch, split later | One project | Lowest cost; one connection per request; simpler start | A cell-level PITR restore also rolls back identities, approvals, billing and certificates; tenant cell compromise reaches the control plane; later split is a live migration of identities and Auth |
| B. Dedicated `cp` Supabase project from launch, holding Auth and `control` | Two projects | Independent restore and blast radius; Auth and SSO configured once for all cells; cells are uniform (no special home cell); clean evidence for auditors | Extra compute and PITR (about USD 105 to 115 per month, H-11); two database round trips on a cache miss |
| C. Control plane on a different technology (another database service) | Separate vendor | Maximum separation | Second vendor, second toolchain, Auth would still live in Supabase; no benefit proportional to cost |

## Decision

**Option B: a dedicated `cp` project from launch**, in the home region `R1` (Frankfurt, OQ-14), containing Supabase Auth, schema `control` and an `ops` schema for control-plane jobs. Cells use no Auth and hold no control-plane tables. (rev P3)

**Allowed catalogue (DA-06).** The tables and views allowed in `control` are exactly the spine v2 S2 list, its accepted additions included: the S2 core list (`tenants`, `tenant_cells`, `tenant_schema_versions`, `tenant_export_jobs` (rev P4, FINAL-EXPORT), `identities`, `memberships`, `tenant_roles`, `platform_staff`, `platform_roles`, `platform_role_permissions`, `platform_approvals`, `platform_approval_votes`, `elevations`, `support_grants`, `support_sessions`, `platform_audit_log`, `plans`, `plan_entitlements`, `billing_entities`, `subscriptions`, `invoices`, `payments`, `usage_meters`, `provider_configs`, `key_registry`, `deletion_certificates`, `support_questions`, `support_messages`, `ropa_selvara`, `sso_connections`, `scim_tokens`) plus `sessions`, `invitations`, `join_requests`, `passkeys`, `recovery_codes`, `auth_throttle`, `account_notices`, `sso_domains`, `api_key_routes`, `portal_link_routes`, `idempotency_records`, `ref_content_releases`, `platform_audit_anchor`, the view `v_routing`, `trial_policies`, `price_lists`, `invoice_lines`, `ledger_entries`, `credit_notes`, `invoice_series`, `provider_events`, `fx_rates`, `tax_rules`, `entitlement_overrides`, `plan_change_requests`, `usage_event_receipts` and `ai_provider_reviews`. A CI check (V-010-01) fails on any other table or view; adding one needs a spine change. (rev P3)

**Encryption (DA-05).** Personal fields in `control` are E1 under the platform DEK (2F F-K-31) wrapped by the platform KEK in the external KMS (F-K-30); `identities.email` is E1 with an HMAC blind index `email_bidx` (F-K-32) for sign-in lookup. (rev P3)

Access:

| Principal | Rights |
|---|---|
| `app` deployment (tenant API, account API, SCIM, public endpoints, billing and help views) via `cp_tenant_api` | `EXECUTE` on the fixed function set of 2F F-CP-02 only; no table grants; each function derives the tenant and identity from the session record (R2-03) (rev P3) |
| Router (`app`) via `cp_router_ro` | `SELECT` on the view `control.v_routing` only; `route_mac` verified on every read (rev P3) |
| `console` deployment (platform API, Admin Console) via `cp_rw` group logins; the credential exists only in the `console` Vercel project | DML under RLS keyed on `app.platform`, `app.elevation_id`; no DDL (R2-03) (rev P3) |
| Worker (`app.system` set) via `cp_worker` | Insert-only on `usage_meters`, `usage_event_receipts` and `platform_audit_log`; update on `tenant_schema_versions` and provisioning state (rev P3) |
| Platform staff | Only through `/api/v1/platform/...` with elevation (60 min), four-eyes for state-changing actions, no self-approval; tenant contact data minimal and every view logged (OQ-10) |
| Migrator | DDL, from GitHub environment `production-migrate` |
| Data API (PostgREST) | Disabled or no exposed schemas *(verify)* |
| Supabase org members (2) | Break-glass only; each use reviewed by the other super admin |

Only static routing fields (cell, schema name, schema version) are cached per instance (TTL 30 s, positive results only). Sessions (`control.sessions`), memberships and tenant status are read on every request and never cached (R2-01); revoking a membership or suspending a tenant revokes the affected `control.sessions` rows in the same transaction. No routing replica in cells at launch; a later replica may hold static routing fields only, never sessions, memberships or tenant status. (rev P3)

**Load (DA-12).** `cp` carries the request rate of every cell: throughput target A-NFR-07a (200 requests/s × shared cells sustained, 2.5 × burst, `cp` read p95 under 5 ms), connection ceiling A-CN-07 (per login role on `cp`), and the `cp` load test 2J H12; `cp` compute is sized from that test. (rev P3)

## Consequences

- `cp` availability and capacity are on the critical path of every request: if `cp` is down, all tenants fail closed (503). RPO / RTO for `cp` is 5 min / 2 h (H-DR-02, A-NFR-20); session, membership and tenant-status checks are never cached (R2-01), so a `cp` outage refuses all tenant requests immediately (R-62) (rev P3).
- Two Vercel production projects, `app` and `console` (R2-03), so a compromise of the tenant-facing deployment yields no platform-write credential (rev P3).
- Cells are identical; opening `c2` or a dedicated cell needs no control-plane change beyond a registry row.
- `cp` holds personal data (identities, memberships, billing contacts, support messages); the residency position "global control plane" stays subject to legal review (A-05).

## Security and privacy implications

- Compromise of a cell does not give access to identities, approvals, billing or key registry. Compromise of `app` yields only `cp_router_ro` and `cp_tenant_api`, whose functions are bound to the caller's session (R-61) (rev P3).
- A cell restore cannot erase approvals or deletion certificates.
- The control plane never holds tenant business data; support messages are the one place a customer could paste it (A-CP-R1), controlled by policy, UI warning and retention.
- `control.key_registry` holds key ids and versions only; key material stays in KMS.

## Verification

| ID | Check |
|---|---|
| V-010-01 | Schema inventory of `cp` equals the allowed catalogue above (spine v2 S2 with its accepted additions; generated registry); CI fails on any other table or view (DA-06) (rev P3) |
| V-010-02 | No table in `control` has a column whose name or type matches an S4 business table (lint) |
| V-010-03 | From a cell's router login, no network path or credential reaches `cp` |
| V-010-04 | `anon` and `authenticated` have no grants on `control`; Data API exposes no schema |
| V-010-05 | Restore drill of `c1` (staging) leaves `cp` unchanged |
| V-010-06 | Staff access to tenant contact data writes a platform audit entry per view |
| V-010-07 | Grant audit: `cp_tenant_api` and `cp_router_ro` hold no table grants beyond `v_routing`; no `app` project secret is a `cp_rw` credential (R2-03) (rev P3) |
| V-010-08 | Revocation: a suspended tenant or removed membership is refused on the next request with the static routing cache warm (R2-01) (rev P3) |
| V-010-09 | `cp` load test (2J H12) meets A-NFR-07a at N = 1 and 4 cells (DA-12) (rev P3) |
