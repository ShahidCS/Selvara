# ADR-004: Backup and restore: per-tenant logical export plus change journal; project point-in-time restore for disaster recovery

| | |
|---|---|
| Status | Proposed |
| Date | 2026-11-23 |
| Owners | 2H (infrastructure), with 2F/2G for keys and retention |
| Related | ADR-001 C1-03 and C1-08, ADR-003, spine S7, `2H-infrastructure.md` H-9 |

## Context

Supabase point-in-time restore (PITR) and daily backups work at project level, so restoring one tenant with them would roll back every tenant in the cell (C1-03). The owner requires every change to be backed up and kept while the client is active (Q-24), deletion that is reviewed and evidenced, and crypto-shredding so that erasure reaches backups (OQ-03). Regulated buyers will ask for stated RPO and RTO and for restore drills. There is no operations team, so restore must be scripted end to end.

## Options considered

| Option | Description | Pros | Cons |
|---|---|---|---|
| A. Project PITR and daily backups only | Rely on Supabase | No build effort | Single-tenant restore impossible without rolling back all tenants; no off-site copy; no per-tenant retention or shredding control |
| B. PITR for DR + per-tenant nightly logical export (DEK-encrypted) + `record_history` journal + off-site object-locked copies | S7 as written, extended off-site | Single-tenant restore to any point (journal) without touching other tenants; per-tenant encryption makes shredding reach every copy; survives region or account loss | Build effort (export, replay, verify); storage cost grows with retention; journal adds write amplification |
| C. `pg_dump` per schema nightly from a runner | Classic per-schema dumps | Familiar tooling | Needs a long-running host with direct database access; dumps are plaintext unless separately encrypted; catalog-wide locks and slowness as schemas grow |
| D. Logical replication of each tenant schema to a standby | Continuous copy | Low RPO | Publication per tenant at scale is heavy; replicates mistakes instantly; does not solve point-in-time restore |

## Decision

**Option B.**

- PITR 7 days on `cp` and every shared cell from the first paying tenant; 14 or 28 days on dedicated cells. Used for disaster recovery and as restore path B.
- Nightly per-tenant logical export through `t_<tkey>_ro`: JSONL per table, schema version, catalog fingerprint and file manifest, encrypted with the tenant DEK; last 7 in `exports`; 35 daily, 12 monthly and 1 yearly off-site in a separate cloud account and region with object lock (35 days, compliance mode).
- `record_history` in each tenant schema records every change in the same transaction.
- Hourly logical export of `control` off-site.
- Single-tenant restore paths A (export + journal replay) and B (PITR into a scratch project, then extract the tenant), both behind four-eyes approval, with verification and an atomic schema swap (H-RS-01..10).
- Quarterly automated restore drill per environment on a synthetic canary tenant.

## Consequences

- RPO / RTO as in A-NFR-13..16: cell loss 5 min / 4 h; single-tenant logical error any point in the journal / 8 h (4 h enterprise); region loss 24 h / 72 h (24 h enterprise).
- Off-site storage is the main backup cost driver (about 16 GB per tenant, A-21).
- Exports must be chunked and resumable in the worker (function time limits, R-18).
- Key versions referenced by any retained export cannot be retired until that export expires; `control.key_registry` tracks references.

## Security and privacy implications

- Exports never exist in plaintext at rest; a copied export is useless without the tenant's KEK (and production keys cannot be used from non-production, H-EN-05).
- Crypto-shredding covers DEK-encrypted fields and files in every copy. Plaintext columns remain in Supabase PITR and daily backups until they age out (7 days at the launch setting *(verify)*); the deletion certificate states this residual window. Legal review of this position is pending (A-10).
- Object lock prevents an attacker with Supabase or Vercel access from deleting off-site copies.
- Restores are platform actions: four-eyes, logged in the platform audit log and the tenant's own audit log.

## Verification

| ID | Check |
|---|---|
| V-004-01 | Fleet report shows every Active tenant with an export under 26 h old |
| V-004-02 | Quarterly drill evidence: path A and path B timed, verification checks passed, RTO recorded |
| V-004-03 | Attempt to decrypt a production export from a non-production role fails |
| V-004-04 | Off-site bucket: object lock in compliance mode, separate account, separate region, deletion attempt refused |
| V-004-05 | After a decommission test, the certificate lists keys destroyed, approvers, residual windows; restoring the old export fails to decrypt |
| V-004-06 | Invariant test: every committed change in a tenant has a `record_history` row |
