# ADR-004: Backup and restore: per-tenant logical export plus change journal; project point-in-time restore for disaster recovery

| | |
|---|---|
| Status | Proposed |
| Date | 2026-11-23 |
| Owners | 2H (infrastructure), with 2F/2G for keys and retention |
| Related | ADR-001 C1-03 and C1-08, ADR-003, spine v2 S7, `2H-infrastructure.md` H-9; DA-11, DU-02, DU-36 (rev P3) |

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

- PITR 7 days on `cp` and every shared cell before the first external tenant, trial or paid (DU-02, owner decision pending); 14 or 28 days on dedicated cells. Used for disaster recovery and as restore path B (rev P3).
- Nightly per-tenant logical export through `t_<tkey>_ro`, in a fixed slot per tenant (consecutive exports ≤ 26 h apart): JSONL per table, schema version, catalog fingerprint and file manifest, encrypted with the tenant DEK; the DEK travels only wrapped by the KEK (escrow, F-K-02) (rev P3); last 7 in `exports`; 35 daily, 12 monthly and 1 yearly off-site in a separate cloud account and region with object lock (35 days, compliance mode).
- `record_history` in each tenant schema records every change in the same transaction.
- Hourly logical export of `control` off-site.
- **Key store `ks` (ADR-003, DA-11):** no PITR; daily provider backups kept 7 days; a standby in the DR region *(verify cross-region replicas, VC-14 family)*; and an append-only key journal of every `ks` insert and every deletion (tombstone), wrapped material only, in `offsite-prod` under compliance object lock, each object expiring 8 days after it is written. `ks` is never included in tenant exports, the `control` export, WORM segments or any other off-site copy; only the key journal leaves `R1`. Replaying the journal applies the tombstones, so a restore never resurrects a destroyed key. A destroyed key is therefore unrecoverable from every copy no later than **8 days after its destruction** (rev P3).
- Single-tenant restore paths A (export + journal replay) and B (PITR into a scratch project, then extract the tenant), both behind four-eyes approval, with verification and an atomic schema swap (H-RS-01..10). If VC-02 fails, path B is withdrawn and the RPO with a damaged journal is the last export (rev P3).
- Quarterly automated restore drill per environment on a synthetic canary tenant.

## Consequences

- RPO / RTO as in A-NFR-13..16, 19, 20: cell loss 5 min / 4 h (once PITR is on); `cp` loss 5 min / 2 h; `ks` loss 5 min / 4 h; single-tenant logical error any point in the journal while the schema is intact (otherwise the PITR window, then the last export) / 8 h (4 h enterprise); region loss 26 h per tenant and 1 h for `cp` / 72 h (24 h enterprise) (rev P3).
- Restores never bring back erased subjects or deleted file versions whose keys were destroyed (rev P3).
- Off-site storage is the main backup cost driver (about 16 GB per tenant, A-21).
- Exports must be chunked and resumable in the worker (function time limits, R-18).
- Key versions referenced by any retained export cannot be retired until that export expires; `control.key_registry` tracks references.

## Security and privacy implications

- Exports never exist in plaintext at rest; a copied export is useless without the tenant's KEK (and production keys cannot be used from non-production, H-EN-05).
- Crypto-shredding covers E1 and E2 fields and files in every copy, once the KEK and every multi-Region replica are destroyed (tenant) or the subject or file key is deleted from `ks` (subject, file). E0 plaintext columns remain in Supabase PITR and daily backups until they age out (7 days at the launch setting *(verify)*). The deletion certificate states this residual window and the `ks` roll-off date (≤ 8 days) for subject and file keys. Legal review of this position is pending (A-10, DU-20) (rev P3).
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
| V-004-07 | `ks` drill: promote the DR standby, and separately restore the last daily backup and replay the key journal; RPO and RTO recorded against A-NFR-19 (rev P3) |
| V-004-08 | A key destroyed before a `ks` restore stays destroyed after journal replay (tombstones applied) (rev P3) |
| V-004-09 | Static and catalog check: no `ks` table or wrapped key appears in tenant exports, the `control` export, WORM segments or tenant tables (DA-04) (rev P3) |
