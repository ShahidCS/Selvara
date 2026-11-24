# ADR-019: Retention and deletion model: retention classes, journal kept with its row, crypto-shredding with a bounded window

| | |
|---|---|
| Status | **Proposed** (rev P5, 2026-11-24). Records the model designed in 2B and 2G. Every retention period is a **DRAFT** pending counsel (DU-20, DU-21, OD-08). Owner acceptance pending, together with DU-37. |
| Date | 2026-11-24 |
| Workstream | 2G (schedule G-5, offboarding G-6), 2B (retention classes B-RC, deletion B-DL), 2D (purge jobs, D-12 to D-12e), 2F (keys F-7), 2H (backups) |
| Related | Q-24; ADR-001 C1-03 and C1-08, ADR-003 (crypto-shredding), ADR-004 (backups, exports, KS-SNAP); OQ-24, OQ-25; DU-20, DU-21; A-10, A-51; risks R-25, R-34, R-49; findings P4-A3-06 (8), P4-A1-10, P4-A3-03, P4-A3-04, P4-A3-10; RA-01 |
| Detail | [2G-privacy.md](../phase2/2G-privacy.md) G-5 and G-6; [2B-data-model.md](../phase2/2B-data-model.md) §7 (B-RC, B-DL); [2B-classification.md](../phase2/2B-classification.md) |

## Context

- The owner asked to "back up every change; keep for the client's lifetime; deletion by a super admin with an evidence chain" (Q-24).
- GDPR and UK GDPR Art. 5(1)(e) (storage limitation) and erasure rights apply to personal data inside tenants *(DRAFT; counsel to confirm)*. Selvara is assumed to be a processor for tenant data (A-52) and a controller for its own records.
- Backups, PITR, exports and the change journal (`record_history`) hold copies of data that may later have to be erased. Rewriting provider backups is not possible on Supabase.
- Keys live only in `ks` (DA-04), so destroying a key makes every copy of the data it protects unreadable.

## Options considered

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Keep everything for the tenant's lifetime (Q-24 read literally) | Simple; full history | Conflicts with storage limitation for personal data inside a tenant (R-49); erasure cannot be honoured in history or backups |
| B (recommended) | **Retention classes with automatic purge**; `record_history` kept with its row and purged with it; crypto-shredding for erasure in history, exports and backups, within a stated window; redaction for E1 free text; a deletion certificate | Meets Q-24 for live records and their history; meets erasure through shredding; bounded and evidenced windows | Many classes to maintain; every period needs counsel; E0 plaintext in provider backups survives until the backups roll off |
| C | One short global retention (for example 7 years for everything) | Easy to explain | Wrong for both short-lived data (sessions, IP logs) and long-lived records (policies, accountability) |
| D | Physical deletion from every backup instead of shredding | No ciphertext residue | Not possible with provider backups; would require rebuilding backups; breaks restore guarantees |

## Decision

Option **B**.

1. **Retention classes.** Every table has a default `retention_class` (B-RC01 to B-RC38) with a period, a floor and an anchor; column purges (B-RC30 to B-RC35) remove high-risk fields earlier than their rows. Tenants may lengthen within the floor rules. All periods are **DRAFT** pending counsel (DU-21).
2. **Journal.** `record_history` keeps every change with its row for the row's life, and is purged with the row, leaving a content-free purge marker (G-RET-10, B-PG03). This is how Q-24's "every change" is kept.
3. **Erasure.** A subject's E2 fields are protected by a per-subject key; destroying it makes history, exports and backups unreadable for those fields. E0 personal fields are nulled or generalised (B-DL06, P4-A3-04). E1 free-text mentions are redacted by a four-eyes procedure (G-RET-10).
4. **Exports and backups.** Per-tenant exports rotate as ADR-004 states (7 in `exports`; 35 daily, 12 monthly, 1 yearly off-site while the tenant is active); counsel confirms this meets storage limitation (DU-20).
5. **Destruction window.** No copy holds a destroyed key more than 8 days after destruction: `ks` PITR (7 days), daily backups, the key journal (8 days) and KS-SNAP (8-day compliance lock) all end within the bound (F-7.2, F-K-44).
6. **Exception after a declared `ks` loss (RA-01, rev P5).** When a `ks` loss or compromise is declared (incident S1), the newest KS-SNAP object and the journal segments after it are placed under legal hold in the off-site account immediately, as an extension of the existing lock, not a new copy, until `ks` is restored and verified. The 8-day guarantee for keys destroyed deliberately is unaffected: the hold applies only to snapshots taken before the declared loss, and the deletion certificate (D-12e) records any key destroyed in that window as "destroyed; unrecoverable once the hold is released", with the release timestamp.
7. **Billing records** are kept 6 years from creation for every selling entity (OQ-25), or longer where counsel confirms a statutory period (the later of the two).
8. **Operational data** is kept 13 months for metrics and 12 months for notifications (OQ-24).
9. **Offboarding.** Final export (D-12b), four-eyes deletion (D-58), key destruction and a signed deletion certificate (D-12e) whose store list and timing are defined once in 2G G-6.3 (P4-A3-10).
10. **Provider-held E0 plaintext.** Supabase backups and PITR hold E0 tenant values under the provider key until they roll off. This is disclosed in the DPA and in the certificate's residual window (P4-A1-10, A-51).

## Consequences

- A machine-readable registry of tables, classes and deletion methods (B-C27, B-V11) is needed for the purge jobs and for CI (P4-A3-05).
- The certificate is issued only when every listed store has passed its roll-off date; RA-01 holds extend that date and the certificate states it.
- Counsel review (OD-08) is a precondition for the purge job going live with final periods (V2-R4 exit).
- R-49 (lifetime journal challenged) stays open until counsel confirms the position.

## Security and privacy implications

- Storage limitation: met for live data by classes and purges, and for copies by shredding within 8 days *(DRAFT; A-10 counsel)*.
- Erasure: E2 and files are unreadable everywhere within the window; E0 residue in provider backups is disclosed, not hidden.
- The RA-01 hold is a narrow, logged, time-limited exception for availability of every tenant's keys; its release needs four-eyes and is recorded on any affected certificate.
- Accountability records (certificates, destroyed-key rows, WORM anchors) are kept 10 years *(verify)* and hold no tenant business data.

## Verification

| ID | Check |
|---|---|
| V-019-1 | The purge job deletes rows past their class period, writes purge markers, and never deletes rows under legal hold (J-SHR). |
| V-019-2 | After subject erasure, no E2 field of the subject decrypts from history, the latest export or a restored backup after 8 days (J-SHR, J-KSS-09). |
| V-019-3 | Every store named in the certificate schema is checked against its roll-off date (J-SHR-11). |
| V-019-4 | A declared `ks` loss places the newest KS-SNAP object and later journal segments under hold; release needs a second approver; a key destroyed in the window is marked on the certificate with the release time (J-KSS). |
| V-019-5 | A table without a retention class or deletion method fails CI (B-V11). |
