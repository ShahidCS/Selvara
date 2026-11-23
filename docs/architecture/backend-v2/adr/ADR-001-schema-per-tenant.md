# ADR-001: One Postgres schema per tenant on Supabase

| | |
|---|---|
| Status | **Accepted (fixed by the owner).** Revision 2, 2026-11-23: replaces the first brief's "database per tenant". |
| Supersedes | D2 in `docs/architecture/BACKEND_FOUNDATION.md` §12: one shared schema, isolated by row-level security only |
| Type | Fixed decision. Per the engagement rules, it records rationale and consequences only; no alternatives are re-evaluated. |

## Rationale (owner)

- Supabase is the preferred platform (Q-03). On Supabase, a database per tenant means one Supabase project per tenant. That brings a per-project cost floor, separate Auth, Storage and pooler per tenant, and fleet operations for a company with no operations team (Q-23).
- A schema per tenant inside one project gives each tenant a named, separate namespace and its own Postgres role. It keeps one Auth, one Storage, one pooler and one backup system, and provisioning costs almost nothing, so trials get their own schema too (Q-09).
- Production holds no customer data yet (Q-01), so the change needs no data migration.

## Consequences

| ID | Area | Consequence | Compensating design (detailed in Phase 2) |
|---|---|---|---|
| C1-01 | Credentials | Every tenant is reached through one pooled login. Each tenant has its own Postgres role, and each transaction switches to it with `SET LOCAL ROLE`. **The application login can switch to any tenant role.** This is weaker than separate database credentials per tenant. | (1) The tenant is resolved only from the verified Supabase Auth token, at one routing point, and fails closed. (2) Each tenant role is granted only its own schema. (3) A `tenant_id` column with row-level security stays as defence in depth. (4) Automated tests prove that a tenant A request can never read or write tenant B. **The residual risk was accepted by the owner on 2026-11-23** (risk R-02). |
| C1-02 | Encryption keys | Supabase encrypts the whole project at rest with one provider-managed key. No per-tenant database key exists. | Application-level envelope encryption: one data key per tenant, wrapped by a per-tenant master key, held through a key-provider abstraction (supports BYOK, Q-16), plus crypto-shredding. ADR-003. |
| C1-03 | Backup and restore | Point-in-time restore applies to the whole project, so restoring one tenant would roll back all tenants. | Per-tenant logical exports plus a per-tenant change journal for restoring a single tenant. Project-level point-in-time restore is used for disaster recovery only. ADR-004. |
| C1-04 | Noisy neighbour | Tenants share CPU, memory and connections. | Per-tenant rate limits, statement timeouts and query budgets. A tenant above a size threshold moves to its own project ("dedicated cell", enterprise tier). |
| C1-05 | Scale ceiling | The Postgres catalog grows with every schema; very high schema counts slow catalog operations and migrations. | Cell model: a new Supabase project opens past a threshold, which Phase 2J will measure by load test (assumption A-07). The control plane routes each tenant to its cell. |
| C1-06 | Migrations | Every schema change has to run in every tenant schema. | Migration orchestrator: canary tenants, then batches; pause and rollback; a schema-version drift report per tenant; fail closed. ADR-009. |
| C1-07 | Residency | All tenants in a cell share its region. | The launch has one region (Q-05). New regions are new cells; the tenant registry records each tenant's cell. Risk R-01. |
| C1-08 | Offboarding | Dropping a schema removes live data, but backups still hold it. | Crypto-shredding: destroying the tenant's keys makes every remaining copy unreadable. A signed deletion certificate is recorded (Q-24). ADR-003. |

## Security and privacy implications

- **Audit check in Phase 4.** "Each tenant has its own database credentials and no application path reaches another tenant" will be rated **Partial by design**. The evidence will be C1-01's compensating controls and the owner's acceptance.
- **Isolation test suite.** It must include direct attempts to escape the role (`SET ROLE`, `search_path` injection, qualified names) as well as attempts through the API.
