# Decisions Log (ADR index)

Every significant decision gets an ADR with its context, at least two options considered, the decision, its consequences and its security and privacy implications. ADR-001 is the exception: the owner fixed it, so it records rationale and consequences only.

| ID | Title | Status | Phase | Mandatory for MVP |
|---|---|---|---|---|
| [ADR-001](adr/ADR-001-schema-per-tenant.md) | One Postgres schema per tenant on Supabase | **Accepted** (owner, 2026-11-23); C1-01 residual risk accepted | 1 | Yes |
| ADR-002 | Isolation inside one project: a role per tenant, one routing point that fails closed, row-level security as defence in depth | Proposed | 2A / 2F | Yes |
| ADR-003 | Envelope encryption, crypto-shredding and BYOK through a key-provider abstraction | Proposed | 2F / 2G | Yes |
| ADR-004 | Backup and restore: per-tenant logical export plus change journal; project point-in-time restore for disaster recovery | Proposed | 2H | Yes |
| ADR-005 | Hosting and jobs: Vercel API plus Supabase-native scheduling and queues plus one scanning container | Proposed | 2A / 2H | Yes |
| ADR-006 | Identity: Supabase Auth, SAML/OIDC per tenant, SCIM 2.0 built in Selvara | Proposed | 2E | Yes |
| ADR-007 | Provider abstractions: payment (merchant of record, local provider or Stripe) and AI | Proposed | 2I / 2G | Yes |
| ADR-008 | Typed entity tables replacing `ws_records` | Proposed | 2B | Yes |
| ADR-009 | Migration orchestration across tenant schemas | Proposed | 2B / 2H | Yes |
| ADR-010 | Control plane: separate schema, what it holds, who can reach it | Proposed | 2A | Yes |
| ADR-011 | Shared reference content (frameworks, controls, templates): distribution and versioning to tenant schemas | Proposed | 2B | Yes |
| ADR-012 | Malware scanning service | Proposed | 2F | Yes |
| ADR-013 | Audit-log anchoring and WORM export target | Proposed | 2F | Yes |

## Earlier decisions (from `BACKEND_FOUNDATION.md` and `PRODUCTION_PROGRAMME.md`)

| ID | Decision | Status in v2 |
|---|---|---|
| D1 | A person may belong to several companies, with one active company per session | **Kept** |
| D2 | Shared schema isolated by row-level security | **Superseded by ADR-001** (row-level security stays as defence in depth) |
| D3 | Rules as shared pure functions | **Kept** |
| D4 | Modules without a server API are hidden in API mode | Kept until cutover |
| D5 | Database isolation tests in CI | **Kept**, extended to schema-escape tests |
| D6 | Migrations applied by hand with a fail-closed check | **Replaced by ADR-009** |
| D7 | Production programme module groups | To be re-assessed in Phase 2K |
