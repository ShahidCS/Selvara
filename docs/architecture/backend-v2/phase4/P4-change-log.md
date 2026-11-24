# Back-end v2, Phase 4: change log of the audit fixes

| | |
|---|---|
| Status | Written in the Phase 5 documentation pass (rev P5, 2026-11-24) from the three Phase 4 fixer logs. 2F line 14 cites this file. |
| Scope | The fixes applied after the Phase 4 audit (commits `281bf61`, `0b93439`, `b70d7d1`), marked "(rev P4)" in the documents, plus the register and ADR work of the Phase 5 documentation pass, marked "(rev P5)". |
| Shared specifications | **KS-SNAP** (off-site `ks` snapshot), **ISO-HARD** (isolation hardening), **FINAL-EXPORT** (customer-readable final export), **SLA-U** (uniform SLA). The earlier labels S-1 to S-4 in 2H, 2J and H-C-26 mean these four, in that order. |
| Status of each finding | The Status column of the [Findings Register](00-phase4-summary.md#3-findings-register) |
| Note | Compliance content stays a **draft** pending qualified legal and compliance review. |

## 1. Critical and High findings

| Finding | Sev | What was changed | Where | Status (rev P5) |
|---|---|---|---|---|
| P4-A1-07 Key-store loss | Critical | KS-SNAP: daily encrypted logical snapshot of `ks` to bucket `ks-snap` in `offsite-prod` (provider organisation other than Supabase), compliance lock exactly 8 days, encrypted under `kek/ks-snap` (writer encrypt-only; decrypt only by the four-eyes `ks-restore` role), signed manifest with the journal high-water mark; restore = snapshot + journal replay into a fresh project; quarterly drill and V2-R0 exit; 8-day destruction argument; `ks` PITR on (7 days) as recommended for DU-02. Rev P5: keep-newest legal hold after a declared `ks` loss (RA-01) and alignment of the remaining KS-SNAP texts. | 2F F-D-05, F-D-13, F-7.2, F-7.5 (F-K-40 to F-K-46), F-T-074, F-T-076, F-T-077; ADR-003 decisions 3 and 8, V3-11; ADR-013 decision 3; 2H H-AC-05, H-BK-07, H-BK-08, H-9.1a (H-KS-01 to H-KS-10), H-FL-10, H-DR-04, H-DR-08, H-C-24, H-DR-H; ADR-004 decision, V-004-10 to V-004-12; 2A A-NFR-19, A-LC-08; 2J J-6.3 (J-KSS-01 to J-KSS-09), J-10.5a; `risks.md` R-41; ADR-019 decision 6 (rev P5) | Open-owner action (H-DR-H, DU-02) |
| P4-A1-01 No per-tenant credential | High | ISO-HARD: KMS decrypt bound to the routed `tkey`; `ks` only through SECURITY DEFINER functions reading `app.tkey`; Storage only through `storagebroker` with a derived prefix; tenant-mismatch detector. Owner re-confirmed the acceptance (OD-15). Rev P5: re-confirmations recorded in ADR-001; A-RT-10 aligned. | 2F F-D-14, F-4.5 (F-ISO-40 to F-ISO-43), F-T-075, F-T-045, F-2.13, F-IT-100 to F-IT-104; ADR-002 decision 9, V-002-09; ADR-003 decision 9, V3-12; 2H H-NW-04, H-AL-01; 2J J-2.4 (J-ISO-50 to J-ISO-58); ADR-001 (rev P5) | Closed by owner acceptance |
| P4-A1-08 DR depends on vendor facts | High | A fallback per fact (H-VF-01 to H-VF-08); VC-14 fallback chosen in advance (second KEK per tenant in the DR region); PITR recommendation; RPO/RTO published only after production drills. Rev P5: VC-23 to VC-34 added to the verification list. | 2H H-9.4, H-DR-01 to H-DR-04, H-DR-E, H-DR-G, H-BK-01, H-C-03; ADR-004 V-004-13, V-004-14; 2A A-NFR-13; `assumptions-log.md` "Vendor facts to verify (OD-14)" (rev P5) | Open-owner action (OD-14, DU-02, H-DR-G) |
| P4-A2-01 ASVS chapter level only | High | New requirement-level annex: 266 rows (181 Met, 59 Partial, 6 Gap, 20 N/A), gap register AG-01 to AG-44, corrected "Met" claims; 4.0.3 kept as the baseline, 5.0 re-map planned (P4-A2-02). | 2F-asvs-l2.md (new); 2F F-14 | Closed |
| P4-A3-01 `auth` schema not classified | High | Every `auth.*` table classified (class, encryption, lawful basis, retention, deletion method); minimisation rule B-C29; `auth` purge job D-80a; erasure, DSAR and offboarding reach `auth`; honest E0 statement. | 2B-classification §3.1, B-C27, B-C29, B-C30; 2B-data-model B-RC36, B-RC37, B-DL06, B-V11; 2D D-12a(7), D-79, D-80a, D-56; 2G G-DC-01, G-RET-01, G-RET-28 to G-RET-31, G-OFF-04, G-SAR-06 | Closed (follow-ups in the rev P5 pass) |
| P4-A3-08 Final export not designed | High | FINAL-EXPORT job D-12b: one snapshot, ZIP of JSON + CSV + decrypted files + signed manifest, passphrase shown once after step-up, single-use 7-day link, completeness check, receipt or window gate before deletion; endpoints; `control.tenant_export_jobs`; tests J-FEX-01 to J-FEX-10. | 2D D-12, D-12b, D-12e, D-58, D-73; 2C C-M01-20, C-M01-23 to C-M01-26, C-PL-04; 2B B-E90.39; 2G G-6.1, G-OFF-01, G-OFF-02, G-6.3; 2J J-6.4 | Closed (follow-ups in the rev P5 pass) |
| P4-A3-12 ISO gaps without remediation | High | ISMS remediation plan G-14 (clauses 4 to 10 and SoA, every O or P Annex A row, 27701 P rows) with owner, release and evidence; risk R-49a. | 2G G-14, G-11, G-DR-08; `risks.md` R-49a (row realigned rev P5) | Open-owner action (dates, OD-13) |
| P4-A3-14 Uniform SLA not costed | High | SLA-U: 99.5% *(verify, VC-13)*, credits only, exclusions, region loss excluded; RPO/RTO objectives; credits budgeted at 2% of revenue; contingent plan upgrade; measurement tests. Rev P5: ADR-020; exclusions aligned on 2I I-4.6.4; DU-35 superseded. | 2A A-NFR-01, A-NFR-02, A-NFR-16, A-NFR-21, A-DR-05; 2H H-OB-05, H-11.2a (H-C-25 to H-C-27), H-VF-08, H-DR-I; 2I I-4.6, I-DR8; 2J J-7.3 (J-SLA-01 to J-SLA-07); ADR-020 (rev P5) | Open-owner action (VC-13, H-DR-I) |
| P4-A3-17 MVP feasibility | High | Owner decision OD-13; stop triggers K-M07. Effort estimate and minimum sellable subset in the rev P5 pass. | 2K K-M07; `decisions-log.md` OD-13 | Open-owner action |
| P4-A3-18 No technical approver | High | Owner decision OD-12; contracted reviewer at every release gate. | 2K K-M06, K-D09; 2F F-15, F-ISO-06(7); ADR-002 decision 2 | Open-owner action (appointment) |

## 2. Medium and Low findings fixed or partly fixed in Phase 4

| Finding | Sev | What was changed | Where |
|---|---|---|---|
| P4-A1-02 | M | pgaudit `FUNCTION` class *(verify, VC-28)*; `assert_context` after each mutation and before COMMIT; response buffered; A-RT-10 aligned (rev P5) | 2F F-ISO-03, F-ISO-06, F-AB-02, F-IT-106; ADR-002 decisions 4 and 8, V-002-08; 2A A-RT-10 (rev P5) |
| P4-A1-03 | M (partial) | Prefix check before every Storage call; `tkey`-claim token where supported *(verify, VC-29)* | 2F F-ISO-30, F-ISO-42, F-T-045 |
| P4-A1-04 | M (partial) | Terse Postgres error logging, no parameter logging, SQLSTATE mapping, E0 canaries | 2F F-ISO-34, F-T-123, F-SD-07; ADR-003 V3-08 |
| P4-A1-05 | M | Rotation only by SCRAM verifier, logging off in the rotation session, log-grep test | 2F F-11 rule R-ROT |
| P4-A1-06 | M | Server-side secret detection on support, elevation, MFA-reset, break-glass and incident free text | 2F F-11 rule R-SEC, F-EV-11, F-M-21; 2A A-CP-R1; 2J J-SEC-34 |
| P4-A1-09 | M | Platform-incident restores are S1 (24/7); tenant requests in business hours; A-24 and DU-29 closed (rev P5) | 2A A-NFR-15; 2H H-RS-01, H-RS-09; registers (rev P5) |
| P4-A1-11 | M (partial) | DR region pinned to an EU region other than `R1`; placement, relocation and restore refuse cells outside the residency set | 2H H-AC-05; 2A A-PH-04 |
| P4-A1-12 | M (partial) | Tested `down` or approved `irreversible` label; staged global tracks; wider drift detection | 2H H-CI-14, H-CI-16, H-6.3, H-FL-05 |
| P4-A1-14 | M (partial) | Static IPs and network restrictions recommended as a launch gate and costed | 2H H-NW-01, H-C-08, H-C-20a; `risks.md` R-15 |
| P4-A2-03 | M (partial) | Acceptance rows reflect OQ-16; F-AB-16 listed as pending | 2F F-2.13; `risks.md` residual acceptance |
| P4-A2-04 | M | F-IT-40 to F-IT-97 defined | 2F F-4.3b |
| P4-A2-07 | M | Six missing sensitive reads added to F-EV-03 | 2F F-EV-03 |
| P4-A2-08 | M (partial) | Refused reads logged with roll-up and alert | 2F F-EV-11, F-M-22 |
| P4-A2-09 | M | No direct INSERT on `audit_log_entry`; `audit_append` only | 2F F-ISO-11, F-ISO-12, F-T-033; ADR-013 V13-10 |
| P4-A2-11 | M | Audit-event coverage suite J-AUD-01 to J-AUD-05 | 2J J-3.3 |
| P4-A2-14 | M | Vendor-portal and Trust Center visitor events | 2F F-EV-01, F-EV-03 |
| P4-A2-18 | M | Parent type to permission table for uploads | 2C C-M23-01, C-M23-P |
| P4-A2-21 | M (partial) | `prevent_self_review` from launch | 2H H-CI-15 |
| P4-A3-03 | M | One billing retention rule: 6 years from creation, or a longer statutory period | 2B B-RC15, B-E90.28; 2G G-RET-06 |
| P4-A3-04 | M | E0 personal fields nulled on erasure and at class end; B-RC19 split | 2B B-DL06, B-RC19, B-RC29, B-RC38; 2G G-RET-26 |
| P4-A3-09 | M (partial in P4) | G-6.1 diagram points to G-OFF-03 and D-58; completed in the rev P5 pass | 2G G-6.1 |
| P4-A3-10 | M (test part in P4) | J-SHR-11 checks every certificate store; canonical schema completed in the rev P5 pass | 2J J-SHR-10, J-SHR-11 |
| P4-A3-13 | M | 5.33, 5.34, 8.10, 8.13 re-rated P; 8.30 priority with review procedure; 27701 re-map planned | 2G G-11, G-12 |
| P4-A3-15 | M (partial) | Static IP cost from launch; totals restated; fixed-overhead line | 2H H-C-08, H-C-15, H-C-16, H-C-20a, H-C-27, H-PR-01; 2I I-4.5.1 |
| P4-A3-16 | M (partial) | Trial values 5 seats, 14 days, 500 MB; SSO Enterprise-only; DU-30 closed (rev P5) | 2I I-4.4.3; 2H H-C-22, H-11.1 |
| P4-A3-19 | M → High (partial) | Paging drill; A-24 closed. Rev P5: deputy role R-DEP defined (discovery §4, ADR-015) | 2H H-9.3 |
| P4-A1-13 | L (partial) | H-CI-15 updated; ADR-009 V-009-05 still stale | 2H H-CI-15 |
| P4-A1-15 | L | Content heuristic with recorded override, test; R-60 updated (rev P5) | 2A A-CP-R1; 2J J-SEC-34; `risks.md` R-60 |
| P4-A1-16 | L | Registers aligned with OQ-16 and OD-15 (rev P4); DU-36 and OQ-17 (rev P5) | `risks.md`; `decisions-log.md`; `open-questions.md` |
| P4-A1-17 | L | Postgres 15 fallback (login NOINHERIT) | ADR-002 decision 1, V-002-03; 2F F-ISO-10, F-IT-21 |
| P4-A1-18 | L | Realtime on the cell with `tkey:` channels and an `app`-minted token | 2F F-ISO-39, F-PL-02, F-IT-105, F-S-11 |
| P4-A2-02 | L | 4.0.3 baseline kept; 5.0 re-map on 2027-06-30 (owner to confirm) | 2F-asvs-l2 header, F-14 |
| P4-A2-05 | L | Citations corrected; one cache rule; E-26 Trust Center exception | 2F; 2E E-26 |
| P4-A2-06 | L | SIEM, supply-chain and Storage-credential threats | 2F F-2.14, F-2.15 |
| P4-A2-12 | L (partial) | Fallbacks for compliance lock and TSA | ADR-013 decision 8, V13-09 |
| P4-A2-20 | L | "No rule = OBJ-T" declared; read and write split | 2C §1.8, C-M08-09, C-M08-10 |
| P4-A2-22 | L (partial) | OSV blocking for High and Critical; provenance before the first production tenant; `infra.yml` mandatory | 2H H-6.1, H-CI-06 |
| P4-A2-23 | L | Admin notices; four-eyes for windows over 90 days and shares after freeze | 2C C-M08-04, C-M08-05, C-M08-08; 2D D-K40, D-K41 |
| P4-A2-24 | L | Provider access logs as vendor checks; SIEM streaming; yearly review | 2F F-T-112, F-TB-13 |
| P4-A2-26 | L | No bytes read unless `clean`, in `storagebroker`; test | 2D D-70a; 2C C-26 and import endpoints; 2J J-SEC-33 |
| P4-A3-11 | L (partial) | (b) `cp` restore re-applies deletions, tombstones and certificates before routing reopens | 2H H-DR-02, H-DR-03; ADR-004 restore order |

## 3. Findings with no Phase 4 change

P4-A1-10, P4-A1-19, P4-A2-10, P4-A2-13, P4-A2-15, P4-A2-16, P4-A2-17, P4-A2-19, P4-A2-25, P4-A3-02, P4-A3-05, P4-A3-20. Several are tracked in the ASVS gap register (AG-17, AG-18, AG-27, AG-30, AG-37) with an owner and a target release. P4-A3-06 and P4-A3-07 were done in the rev P5 pass (ADR-015 to ADR-020; ADR-007 amended; ADR-001 re-confirmations; ADR-014 index and titles).

## 4. Phase 5 documentation pass: register and ADR changes (rev P5)

| Item | Change |
|---|---|
| ADR-015 to ADR-020 | New ADRs for the decisions P4-A3-06 listed: approval engine, webhook payload model, CR-1, trial provisioning and SoD, retention and deletion model, service levels and plan tiers |
| ADR-001, ADR-007, decisions-log | OQ-16 and OD-15 re-confirmations recorded; OD-01 launch route recorded in D7-8; ADR-014 index status Accepted; ADR-007 and ADR-010 titles aligned; DU status column; pending owner decisions H-DR-E, H-DR-G, H-DR-H, H-DR-I and the deputy |
| assumptions-log | A-24 closed; VC-23 to VC-34 added under OD-14 |
| risks | R-65 and R-49a rows realigned; R-03, R-05, R-41 (RA-01), R-60 and R-02 updated |
| Findings Register | Status column; RA-01 and re-rated P4-A3-19 added (§3.1) |
| Discovery §4 | Deputy approver R-DEP |
| 2A, 2I | A-RT-10 aligned with F-ISO-06; SLA-U exclusions aligned on I-4.6.4; A-LC-08 aligned with the offboarding rules |
