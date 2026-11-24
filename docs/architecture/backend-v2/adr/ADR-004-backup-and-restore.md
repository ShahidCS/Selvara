# ADR-004: Backup and restore: per-tenant logical export plus change journal; project point-in-time restore for disaster recovery

| | |
|---|---|
| Status | Proposed |
| Date | 2026-11-23; revised 2026-11-24 (rev P4); Phase 5 documentation pass 2026-11-24 (rev P5: keep-newest rule RA-01, deputy approver R-D, KS-SNAP texts aligned) |
| Owners | 2H (infrastructure), with 2F/2G for keys and retention |
| Related | ADR-001 C1-03 and C1-08, ADR-003, spine v2 S7, `2H-infrastructure.md` H-9; DA-11, DU-02, DU-36 (rev P3); Phase 4 findings P4-A1-07, P4-A1-08, P4-A1-09, P4-A3-11; shared specifications KS-SNAP and SLA-U (rev P4) |

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

- PITR 7 days on `cp` and every shared cell before the first external tenant, trial or paid; 14 or 28 days on dedicated cells. Used for disaster recovery and as restore path B (rev P3). **Recommendation for DU-02 (rev P4): enable PITR 7 days on `cp`, `c1` and `ks` at launch** *(verify plan tier, minimum compute and cost, about USD 300 per month, VC-08, VC-19)*. On `ks`, the 7-day PITR window stays inside the 8-day destruction bound.
- Nightly per-tenant logical export through `t_<tkey>_ro`, in a fixed slot per tenant (consecutive exports ≤ 26 h apart): JSONL per table, schema version, catalog fingerprint and file manifest, encrypted with the tenant DEK; the DEK travels only wrapped by the KEK (escrow, F-K-02) (rev P3); last 7 in `exports`; 35 daily, 12 monthly and 1 yearly off-site in a separate cloud account and region with object lock (35 days, compliance mode).
- `record_history` in each tenant schema records every change in the same transaction.
- Hourly logical export of `control` off-site, encrypted under the platform KEK (2F F-K-30); its personal fields are already E1 under the platform DEK (F-K-31) (rev P3).
- **Key store `ks` (ADR-003, DA-11):** PITR 7 days (DU-02 recommendation, owner decision pending; rev P4, rev P5); daily provider backups kept 7 days; a standby in the DR region *(verify cross-region replicas, VC-14 family)*; an append-only key journal of every `ks` insert and every deletion (tombstone), wrapped material only, in `offsite-prod` under compliance object lock, each object expiring 8 days after it is written; and **KS-SNAP** (rev P4, below). `ks` is never included in tenant exports, the `control` export or WORM segments; only the key journal and KS-SNAP leave `R1`. Replaying the journal applies the tombstones, so a restore never resurrects a destroyed key. A destroyed key is therefore unrecoverable from every copy no later than **8 days after its destruction** (rev P3, rev P4).
- **KS-SNAP (closes P4-A1-07, rev P4):** a daily encrypted logical snapshot of `ks` (wrapped tenant and platform DEKs, subject keys, file keys, blind-index and audit HMAC keys, key metadata; wrapped material only; content aligned with 2F F-K-40, rev P5) written to the WORM bucket `ks-snap` in `offsite-prod` (second EU region, provider organisation other than Supabase), object lock in compliance mode for exactly 8 days (then removed by the 15-minute deletion job, lifecycle expiry as the backstop, 2F F-K-44), encrypted under a dedicated off-site KEK in that account's KMS that the writer may only encrypt with. The manifest records the key-journal high-water mark. The **backup set** is therefore: Supabase PITR and daily backups, per-tenant exports, `record_history`, hourly `control` exports, the key journal and KS-SNAP. Operation, monitoring and alerts: 2H H-9.1a (H-KS-01..10). Because a tombstone is always written after the snapshot that still holds the key, and both expire 8 days after writing, the 8-day destruction bound holds. KS-SNAP supersedes the journal-only `ks` rebuild that DU-36 / OQ-17 accepted, which would have lost every key older than 8 days after a Supabase organisation loss.
- **Keep-newest rule (rev P5, RA-01; 2F F-K-47, 2H H-KS-11):** when a `ks` loss or compromise is declared (S1 incident), the first step of the `ks` restore runbook places a legal hold in `offsite-prod` on the newest KS-SNAP object and the key-journal objects written after it (an extension of the lock, not a new copy) until `ks` is restored and verified. Placing it needs one approver (R-A, R-B or the deputy approver R-D), because it only preserves data; releasing it needs four-eyes after the restore verification passes. A rebuild that runs past the 8-day lock therefore cannot lose the keys. The hold applies only to objects written before the declared loss; the deletion certificate (2D D-12e) records any key destroyed in that window as "destroyed; unrecoverable once the hold is released", with the release timestamp. It is the one documented exception to the 8-day bound.
- **Who can restore `ks` (rev P5, P4-A3-19; 2F F-K-48, 2H H-KS-12):** `ks.restore`, the `ks-restore` role and `ks.hold_release` need two different people who together cover R-A and R-B; the contracted deputy approver R-D (appointed by the owner) may stand in for either, never for both in the same action. The `ks` restore therefore runs when one principal is unavailable.
- **Restore order after a region loss or Supabase organisation loss (rev P4):** (1) `cp` from the hourly off-site export, with deletions, tombstones and certificates after the restore point re-applied from `platform_audit_log` and the WORM anchors before routing reopens (P4-A3-11 b); (2) `ks` from the DR standby if it survived, otherwise keep-newest hold first, then the newest KS-SNAP plus key-journal replay from its high-water mark, into another Supabase organisation or, if Supabase is unavailable, a managed Postgres host in the DR region of `workloads-prod` *(verify, OD-14)* (rev P5); (3) tenant schemas from their nightly exports, DEKs unwrapped by the tenant's DR-region KEK; (4) `record_history` journal replay where a surviving journal is newer than the export; (5) verification, then routing reopens (2H H-DR-03).
- **Vendor facts and fallbacks (P4-A1-08, rev P4):** the design does not lose data if a vendor fact fails; 2H H-9.4 lists each fact and its fallback. In short: no PITR into a new project (VC-02) → restore from the nightly export plus journal (path A), path B withdrawn; no KMS multi-Region replicas (VC-14) → **an independent second KEK per tenant in the DR region wrapping the same DEKs** (chosen over replicating imported key material or an escrowed offline KEK, because key material never leaves the KMS HSMs and destruction of both keys stays evidenced by KMS; same cost as a replica); no Supabase cross-region replica for `ks` → KS-SNAP plus journal; WAL interval or PITR restore duration worse than stated (VC-16) → figures restated, the journal and exports still hold the changes; no compliance-mode lock (VC-22) → governance mode plus an account-level deny under the hardware-key administrators. The owner verifies VC-02, VC-13, VC-14, VC-16, VC-19, VC-20 and VC-22 against the vendors' documentation before the Phase 5 gate (owner decision 2026-11-24).
- Single-tenant restore paths A (export + journal replay) and B (PITR into a scratch project, then extract the tenant), both behind four-eyes approval, with verification and an atomic schema swap (H-RS-01..10). If VC-02 fails, path B is withdrawn and the RPO with a damaged journal is the last export (rev P3).
- Quarterly automated restore drill per environment on a synthetic canary tenant, and a quarterly KS-SNAP drill (rebuild `ks` from snapshot plus journal into a fresh project with Supabase treated as lost, then decrypt a sample of E2 fields and files); the KS-SNAP drill runs on staging and in production and is also a V2-R0 exit criterion (2K K-2) (rev P4, rev P5).

## Consequences

- RPO / RTO as in A-NFR-13..16, 19, 20: cell loss 5 min / 4 h (once PITR is on); `cp` loss 5 min / 2 h; `ks` loss 5 min / 4 h (including Supabase organisation loss, through KS-SNAP); single-tenant logical error any point in the journal while the schema is intact (otherwise the PITR window, then the last export) / 8 h (4 h enterprise), 24/7 for S1 restores and in business hours for tenant-requested ones (OQ-22); region loss 26 h per tenant and 1 h for `cp` / 72 h (24 h enterprise) (rev P3). RPO and RTO are **objectives, not contractual**; region loss is excluded from the uniform SLA (SLA-U, 2A A-NFR-01) (rev P4).
- Restores never bring back erased subjects or deleted file versions whose keys were destroyed (rev P3).
- Off-site storage is the main backup cost driver (about 16 GB per tenant, A-21). KS-SNAP adds a few dollars a month (2H H-C-24); PITR on `ks` adds about USD 100 a month (H-C-03) (rev P4).
- Exports must be chunked and resumable in the worker (function time limits, R-18).
- Key versions referenced by any retained export cannot be retired until that export expires; `control.key_registry` tracks references.

## Security and privacy implications

- Exports never exist in plaintext at rest; a copied export is useless without the tenant's KEK (and production keys cannot be used from non-production, H-EN-05).
- Crypto-shredding covers E1 and E2 fields and files in every copy, once the KEK and its DR-region copy (every multi-Region replica, or the second KEK of the VC-14 fallback, rev P4) are destroyed (tenant) or the subject or file key is deleted from `ks` (subject, file). E0 plaintext columns remain in Supabase PITR and daily backups until they age out (7 days at the launch setting *(verify)*). The deletion certificate states this residual window and the `ks` roll-off date (≤ 8 days) for subject and file keys. Legal review of this position is pending (A-10, DU-20) (rev P3).
- Object lock prevents an attacker with Supabase or Vercel access from deleting off-site copies.
- KS-SNAP holds only wrapped material, further encrypted under the off-site KEK; its writer can neither read nor delete objects, and its decryption is granted only to a restore role used under four-eyes (R-A and R-B, or R-D for one of them, rev P5) from the `fleet-ops` environment. A stolen snapshot reveals no key without both the off-site KEK and the tenant KEKs (rev P4).
- The deletion certificate lists KS-SNAP among the stores and states its roll-off (≤ 8 days) with the key journal (rev P4), or, for a key destroyed in the 8 days before a declared `ks` loss, "destroyed; unrecoverable once the hold is released" with the release timestamp (rev P5).
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
| V-004-07 | `ks` drill: promote the DR standby, and separately restore the last daily backup (or the newest KS-SNAP, V-004-10) and replay the key journal; RPO and RTO recorded against A-NFR-19 (rev P3, rev P4) |
| V-004-08 | A key destroyed before a `ks` restore stays destroyed after journal replay (tombstones applied) (rev P3) |
| V-004-09 | Static and catalog check: no `ks` table or wrapped key appears in tenant exports, the `control` export, WORM segments or tenant tables (DA-04) (rev P3) |
| V-004-10 | KS-SNAP drill (quarterly and V2-R0 exit): with the Supabase organisation treated as lost, rebuild `ks` from the newest snapshot plus journal into a fresh project; manifest signature and counts verified; a sample of E2 fields and files of canary tenants decrypts; RPO and RTO recorded against A-NFR-19 (2J J-KSS) (rev P4) |
| V-004-11 | KS-SNAP bucket: compliance-mode lock with retain-until 8 days after write on every object; delete and retention-shortening attempts refused; the writer role cannot read or delete (rev P4) |
| V-004-12 | A key destroyed after a snapshot is absent after restore (tombstone applied); 8 days after destruction no snapshot or journal object holds it (rev P4) |
| V-004-13 | Region-loss rebuild follows the restore order above, with the DR-region KEK (replica or second KEK) unwrapping a sample of DEKs; a `cp` restore re-applies deletion tombstones before routing reopens (rev P4) |
| V-004-14 | Vendor-fact record: VC-02, VC-13, VC-14, VC-16, VC-19, VC-20 and VC-22 verified by the owner, with the fallback in force for any that failed, before the Phase 5 gate (rev P4) |
| V-004-15 | Keep-newest drill (rev P5, RA-01): declare a staging `ks` loss; one approver places the hold through `ks-hold`; the deletion job and lifecycle leave the held snapshot and journal objects in place past their 8-day lock; a single person, or R-D with R-A or R-B covering the same role, cannot release the hold; after the restore verification the four-eyes release succeeds and the objects expire; an incident with no hold after 1 h raises S1 (2F F-K-47, 2H H-KS-11) |
| V-004-16 | Deputy restore (rev P5, P4-A3-19): the KS-SNAP drill completes with R-D standing in for R-A (and, in another run, for R-B); an attempt by R-D to cover both roles is refused (2F F-K-48, 2H H-KS-12) |
