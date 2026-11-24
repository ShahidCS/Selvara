# ADR-009: Migration orchestration across tenant schemas

| | |
|---|---|
| Status | **Accepted** (owner, 2026-11-24, OD-19). |
| Date | 2026-11-23 |
| Owners | 2H, with 2B (schema) |
| Related | ADR-001 C1-06; replaces D6 (manual migrations); `2H-infrastructure.md` H-6.3, H-8; `2A-architecture.md` A-D-06, A-PH-02 (CR-1) (rev P3) |

## Context

Every tenant schema must carry the same structure, so each schema change runs N times per cell (C1-06). Today migrations are applied by hand and the server refuses an older database (`SCHEMA_VERSION`, `db.ts`). At hundreds of schemas per cell a single all-or-nothing run is slow, holds locks across tenants and makes one bad tenant block everyone. Drift (a schema that differs from its version) is a security risk when it touches grants, RLS or functions.

## Options considered

| Option | Description | Pros | Cons |
|---|---|---|---|
| A. One transaction migrates all schemas of a cell | All or nothing | Simple; consistent | Long locks across all tenants; one failure aborts everything; does not scale past tens of schemas |
| B. Orchestrated per-schema migrations: canary, batches, pause, roll back, drift report, with a version window in the application | Per-schema transactions driven by a runner, state in `control` | Bounded blast radius; resumable; observable; old and new versions coexist safely | Application must support two versions (expand/contract discipline); orchestrator to build |
| C. Lazy migration on first request per tenant | Migrate when a tenant is next used | No rollout job | Request latency spikes, races, DDL rights in the API runtime; violates fail-closed routing |
| D. Template schema clone for new versions | Create new schema, copy data, swap | Clean structure | Data copy per tenant per release; heavy and slow; risky for large tenants |

## Decision

**Option B.**

1. Migrations are versioned in four tracks: `control`, `ops`, `ref`, `tenant`. Tenant migrations are classified **expand** (additive, backward compatible) or **contract** (removals, renames, tightening).
2. A release of the application supports tenant versions `[N-1, N]`. The router returns 503 only outside that window (SD-A3).
3. Order: deploy app N, then run migrations (environment `production-migrate`, manual approval). Contract steps ship only in a later release after every tenant reports N.
4. Runner: GitHub Actions job with the `migrator` login via the session pooler; per cell, global tracks first, then the canary tenant (synthetic), then batches of 5%, 25%, remainder; 4 schemas in parallel per cell; one transaction per schema with `lock_timeout 3s` and up to 5 retries; warm-pool schemas included.
5. State per tenant in `control.tenant_schema_versions` (current, target, state, attempts, last error, fingerprint). The job is resumable from that state.
6. Health gates between batches (H-CI-12); automatic pause on failure; manual pause flag; resume needs approval.
7. Rollback: forward-fix by default; expand steps may ship a tested per-schema `down`; contract steps are not rolled back (they run only when no code path needs the old shape).
8. Drift report nightly (H-FL-05) comparing each schema's catalog fingerprint with the attested fingerprint for its version; security-relevant drift sets the tenant to `Maintenance`.
9. Migration lint in CI (H-CI-01).

## Consequences

- Developers must write expand/contract migrations and keep the API compatible with `N-1` for one release (contract test H-CI-04).
- Rollout time is bounded per cell (target under 45 min, A-NFR-11) and is a secondary trigger of the cell capacity rule CR-1 (A-PH-03) (rev P3).
- `SCHEMA_VERSION` single-number check in `db.ts` becomes a per-tenant window check in `router`.

## Security and privacy implications

- DDL rights stay with `migrator` in an approved GitHub environment; the application cannot alter schemas.
- Drift in grants, policies or `SECURITY DEFINER` functions fails closed for that tenant.
- Every rollout is recorded in the platform audit log with the attested build and fingerprint, giving change-management evidence for ISO 27001 and SOC 2 *(DRAFT)*.

## Verification

| ID | Check |
|---|---|
| V-009-01 | Staging rollout across 2 cells with synthetic schemas at the CR-1 threshold count (provisional 300; warm-pool and canary schemas included) within 45 min per cell, with an injected failure on one schema: pause, report, resume (rev P3) |
| V-009-02 | Contract test: build N passes against schemas at N-1 and N |
| V-009-03 | Manual change to a policy in one staging schema is detected by the drift report and the tenant goes to `Maintenance` |
| V-009-04 | A migration containing a session `SET` or a `DROP` in an expand step fails lint |
| V-009-05 | Production migration cannot start without environment approval by a person other than the release author (once two maintainers exist) |
