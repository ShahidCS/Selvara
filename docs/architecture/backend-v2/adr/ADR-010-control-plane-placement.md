# ADR-010: Control plane: separate schema in a dedicated project, what it holds, who can reach it

| | |
|---|---|
| Status | Proposed |
| Date | 2026-11-23 |
| Owners | 2A |
| Related | Spine S1, S2; ADR-001, ADR-002, ADR-006; `2A-architecture.md` A-3, A-7 |

## Context

The control plane decides who may enter which tenant, holds identities, platform roles, approvals, billing, key registry and deletion certificates (S2). It must outlive tenants (certificates), survive the restore of a cell, and never hold tenant business data. The spine allows `cp` and `c1` to share a project at launch only if this ADR records the trade-off. Supabase Auth exists once per project, and identities must be global because a person may belong to tenants in different cells (D1).

## Options considered

| Option | Description | Pros | Cons |
|---|---|---|---|
| A. `control` schema inside `c1` at launch, split later | One project | Lowest cost; one connection per request; simpler start | A cell-level PITR restore also rolls back identities, approvals, billing and certificates; tenant cell compromise reaches the control plane; later split is a live migration of identities and Auth |
| B. Dedicated `cp` Supabase project from launch, holding Auth and `control` | Two projects | Independent restore and blast radius; Auth and SSO configured once for all cells; cells are uniform (no special home cell); clean evidence for auditors | Extra compute and PITR (about USD 105 to 115 per month, H-11); two database round trips on a cache miss |
| C. Control plane on a different technology (another database service) | Separate vendor | Maximum separation | Second vendor, second toolchain, Auth would still live in Supabase; no benefit proportional to cost |

## Decision

**Option B: a dedicated `cp` project from launch**, in the home region, containing Supabase Auth, schema `control` (exactly the S2 list plus `control.sessions`, SD-A1) and an `ops` schema for control-plane jobs. Cells use no Auth and hold no control-plane tables.

Access:

| Principal | Rights |
|---|---|
| API handlers (account, platform, routing, SCIM) via `cp_rw` group logins | DML under RLS keyed on `app.user_id`, `app.platform`, `app.elevation_id`; no DDL |
| Worker (`app.system` set) | Insert-only on `usage_meters` and `platform_audit_log`; update on `tenant_schema_versions` |
| Platform staff | Only through `/api/v1/platform/...` with elevation (60 min), four-eyes for state-changing actions, no self-approval; tenant contact data minimal and every view logged (OQ-10) |
| Migrator | DDL, from GitHub environment `production-migrate` |
| Data API (PostgREST) | Disabled or no exposed schemas *(verify)* |
| Supabase org members (2) | Break-glass only; each use reviewed by the other super admin |

Routing data is read through a per-instance cache (TTL 30 s, positive results only). No read-only routing replica in cells at launch; it becomes an option if `cp` latency or availability limits are reached.

## Consequences

- `cp` availability is on the critical path of every request: if `cp` is down, all tenants fail closed (503). RTO for `cp` is 2 h (H-DR-02); cache keeps already-authorised sessions working up to 30 s only.
- Cells are identical; opening `c2` or a dedicated cell needs no control-plane change beyond a registry row.
- `cp` holds personal data (identities, memberships, billing contacts, support messages); the residency position "global control plane" stays subject to legal review (A-05).

## Security and privacy implications

- Compromise of a cell does not give access to identities, approvals, billing or key registry.
- A cell restore cannot erase approvals or deletion certificates.
- The control plane never holds tenant business data; support messages are the one place a customer could paste it (A-CP-R1), controlled by policy, UI warning and retention.
- `control.key_registry` holds key ids and versions only; key material stays in KMS.

## Verification

| ID | Check |
|---|---|
| V-010-01 | Schema inventory of `cp` equals the S2 list plus `sessions`; CI fails on any extra table |
| V-010-02 | No table in `control` has a column whose name or type matches an S4 business table (lint) |
| V-010-03 | From a cell's router login, no network path or credential reaches `cp` |
| V-010-04 | `anon` and `authenticated` have no grants on `control`; Data API exposes no schema |
| V-010-05 | Restore drill of `c1` (staging) leaves `cp` unchanged |
| V-010-06 | Staff access to tenant contact data writes a platform audit entry per view |
