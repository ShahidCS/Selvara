# ADR-003: Envelope encryption, crypto-shredding and BYOK through a key-provider abstraction

| | |
|---|---|
| Status | Proposed |
| Date | 2026-11-23 |
| Workstreams | 2F (owner), 2G |
| Related | ADR-001 (C1-02, C1-08), ADR-004 (backups), ADR-010 (control plane), spine S7, `2F-security.md` F-7, `2G-privacy.md` G-6 |

## Context

- Supabase encrypts each project at rest with one provider-managed key. There is no per-tenant database key (ADR-001 C1-02).
- The owner needs BYOK (Q-16), lifetime backups of every change (Q-24), and deletion that is evidenced (Q-24). Crypto-shredding is accepted subject to the conditions in discovery §6 (OQ-03).
- Spine S7 requires: a per-tenant KEK in an external KMS outside the database and its backups; a per-tenant DEK; per-subject keys in a separate store with short backups; four-eyes and a certificate for key destruction.
- Supabase Vault stores secrets inside the database, so its contents travel with database backups. pgsodium is pending deprecation. Neither can hold a key that must not be in the data's backups.
- Health-sector customers may store special-category data (A-14).

## Options considered

| Option | Description | Pros | Cons |
|---|---|---|---|
| O1 Provider encryption only | Rely on Supabase at-rest encryption | No work; no latency | No per-tenant keys, no BYOK, no shredding; fails Q-16, Q-24, C1-08 |
| O2 Per-tenant KEK in external KMS, DEK in the database (Vault) | Envelope encryption with wrapped DEK kept in Vault | Simple; one external call per DEK unwrap | Tenant-level shredding works (KEK destruction), but per-subject keys in Vault sit in long backups, so subject erasure cannot reach backups |
| **O3 Per-tenant KEK in external KMS; wrapped DEKs, subject keys and file keys in a separate key store `ks` with short backups** | Three-level hierarchy; key-provider abstraction; BYOK by cross-account key | Meets S7 fully; tenant, subject and file shredding all reach backups within a known window; BYOK natural | One more database project; key-store availability becomes critical; field encryption limits search |
| O4 One KMS key per subject | Every subject key in the KMS | Strongest shredding evidence | Cost and KMS quota per key at scale; latency; impractical for thousands of subjects per tenant |
| O5 Database per tenant with separate encryption | Rejected by ADR-001 | Strong separation | Not available (ADR-001 fixed) |

## Decision

Adopt **O3**.

1. **Key-provider abstraction** (`KeyProvider`): `generateDataKey(ctx)`, `wrap(ctx, key)`, `unwrap(ctx, wrapped)`, `scheduleDestroy(keyRef, approvalId)`, `health(keyRef)`. Adapters: the KMS in `kms-prod` (H-AC-05, launch), customer KMS (BYOK, same provider family at launch), others later.
2. **Hierarchy** (F-K-01 to F-K-05): tenant KEK in KMS; tenant DEK (AES-256-GCM) wrapped by the KEK; subject keys, file keys and the blind-index key wrapped by the DEK.
3. **Key store `ks`**: separate small Postgres project in `R1`; PITR off; daily backups kept 7 days; reachable only by the `keysvc` module role `ks_rw`; tables `ks.tenant_dek`, `ks.subject_key`, `ks.file_key`. Holds wrapped material only.
4. **Encryption classes** E0, E1, E2 per column (F-D-12); E2 scope per 2G (G-D-02). Ciphertext carries key id and version; AAD binds tenant, table, column and row (files: object id, version, segment).
5. **Exports and history** keep ciphertext as stored; the export (including the off-site copies of ADR-004) escrows the tenant DEK wrapped by the KEK, which stays in `kms-prod`.
6. **Destruction**: tenant (offboarding), subject (erasure), file (deletion) per F-K-10 to F-K-12. KEK destruction needs a four-eyes `control.platform_approvals` id; a KMS event without one raises an alert and is cancelled within the waiting period.
7. **BYOK**: customer KMS key referenced in `control.key_registry`; test wrap with context; tenant four-eyes; re-wrap of DEKs; hourly health; revocation sets `KeyUnavailable`.
8. **Rotation**: KEK yearly (KMS automatic); DEK yearly with background re-encryption; subject keys re-wrapped on DEK rotation; file keys never rotate.

## Consequences

| ID | Consequence |
|---|---|
| C3-01 | A new project (`ks`) and per-tenant KMS keys are added; about USD 1 per key per month on AWS KMS (2H H-P-11 *(verify)*). |
| C3-02 | E1 and E2 fields cannot be filtered, sorted or full-text searched in SQL; full-text search covers E0 only; E2 email lookup by blind index. Product screens (2C) must accept this. |
| C3-03 | Cold-start latency: one KMS unwrap per tenant per function instance per 5 minutes (A-50 to measure). |
| C3-04 | `ks` availability gates reading E2 fields and files; it needs a standby, integrity checks and drills (R-41). |
| C3-05 | Erasure in backups completes within 8 days for subject and file keys, and within the KMS waiting period plus PITR window for a tenant; certificates state the dates. |
| C3-06 | BYOK customers can make their tenant unavailable at will; DPA wording required. |

## Security and privacy implications

- Meets discovery §6 conditions 1 to 4: granularity (tenant, subject, file), every copy destroyed (KEK only in KMS, wrapped keys only in `ks` with 7-day backups), AES-256-GCM with no plaintext copies (F-K-R4), evidence (certificate, KMS logs, anchored audit entry).
- E0 plaintext (titles, states, ids) remains in Supabase backups until roll-off; disclosed in the DPA (G-6.2).
- A compromised `app` function can still decrypt any tenant's data through KMS with the right context (C1-01 class risk); detection by KMS anomaly alerts (F-M-06).
- Provider operators of Supabase see ciphertext for E1/E2 and files; keys sit with a different provider account.

## Verification (Phase 4)

| ID | Check |
|---|---|
| V3-01 | Database dump of a synthetic tenant contains no plaintext of seeded E1/E2 values or file content (grep for canary strings). |
| V3-02 | Ciphertext copied between rows or tenants fails to decrypt (AAD test). |
| V3-03 | Crypto-shred drill: destroy a subject key; restore the latest cell backup into a scratch project; the subject's E2 values cannot be decrypted; after 8 days no `ks` backup contains the key. |
| V3-04 | Tenant shred drill: destroy KEK (waiting period on a synthetic tenant); exports, WORM segments and backups unreadable; certificate fields complete and signature verifies. |
| V3-05 | KMS key policy denies decrypt without encryption context and from any principal other than the federated `app` and worker roles. |
| V3-06 | A KMS deletion event without an approval id triggers F-M-07 and is cancelled. |
| V3-07 | BYOK: revoke the test customer key; tenant enters `KeyUnavailable` within 3 health cycles; no plaintext served after cache expiry. |
| V3-08 | Logs captured during the full test suite contain no DEK, subject key or E2 canary value. |
