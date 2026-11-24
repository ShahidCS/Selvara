# Phase 5 readiness evidence: Selvara back-end v2

| | |
|---|---|
| Assessor | Independent readiness assessor. I did not write the design or the Phase 4 fixes. I worked read-only on the repository. |
| Date | 2026-11-24 |
| Baseline | `docs/architecture/backend-v2/` at commit `b70d7d1` (the Phase 4 fixes are commits `281bf61`, `0b93439` and `b70d7d1`) |
| Binding inputs | ADR-001 schema per tenant, with the residual C1-01 / R-02 accepted and re-confirmed by OD-15. Owner decisions OD-01 to OD-15 and OQ-05 to OQ-25. |
| Note | Compliance content (ISO, GDPR, ASVS) is a **draft**. Qualified compliance and legal staff must review it. This report rates design readiness only. |

## 0. Verdict summary

| Gate | Criterion | Verdict |
|---|---|---|
| G1 | No open Critical or High findings | **Not met.** Of the 10 Critical and High findings, 1 is closed by documented owner acceptance and 3 are closed in design with follow-ups. 6 are open: 5 are waiting on owner action and 1 (Critical) is fixed in design but waits for owner ratification and design-authority consistency fixes. I also propose 2 new or re-rated High items. |
| G2 | Every decision that is mandatory for the MVP is made and recorded as an ADR | **Not met.** 35 DU items are mandatory. None is recorded as an ADR. About 6 are made in substance through OQ, OD or DA rulings. ADR-002 to ADR-013 are Proposed. ADR-014 is inconsistent (Accepted in the file, Proposed in the index). |
| G3 | Every high-impact assumption is validated or explicitly accepted | **Not met.** 26 high-impact (HI) assumptions are open. Owner acceptance covers 1 (A-05). None of VC-01 to VC-22 has a recorded result. |
| G4 | The coverage matrix has no "Missing" cell for an MVP module | **Met, with a caveat.** The only Missing cell, M24 in column K, is closed in 2K V2-R1. The Phase 4 additions are not yet in the 2K release table, which re-opens some cells in column K as Partial but creates no Missing cell. |
| G5 | Provisioning, isolation testing, multi-schema migration and single-tenant restore are designed and have test plans | **Met.** All four pass. Provisioning tests are thin, and P4-A1-12 (migration rollback) is still a Medium. |
| G6 | Sign-off by technical, security and management approvers | **Not met.** There is no Phase 5 sign-off table, and the technical approver has not been appointed. |

**Overall: No-Go.** Section 9 lists, in order, what must be resolved for a Go.

---

## 1. G1: Critical and High findings

Status keys: **Closed**, **Closed by documented owner acceptance**, **Open**, **Open pending owner action**.

| Finding | Sev | Status | Evidence | What remains |
|---|---|---|---|---|
| P4-A1-07 Key-store loss | Critical | **Open pending owner action** (fixed in design) | KS-SNAP is designed consistently in its core: 2F F-D-13 and F-7.5 (F-K-40 to F-K-46: "compliance mode for exactly 8 days", off-site KEK `kek/ks-snap`, restore by snapshot plus journal replay); 2H H-BK-08 and H-9.1a (H-KS-01 to H-KS-10); ADR-003 decision 5; ADR-004 V-004-10 and V-004-11; 2J J-KSS-01 to J-KSS-09; risks R-41 re-rated L. | (1) KS-SNAP replaces the journal-only design the owner accepted under OQ-17 and DU-36. 2H H-DR-H marks this as an "Owner" decision, but `decisions-log.md` records no such decision; OD-12 to OD-15 do not cover it. The auditor also asked that OQ-17 be restated to the owner with the loss stated plainly. (2) The binding spine S7 (`00-spine.md`, line 141) and 2B B-K05 still say "`ks` (PITR off …)", and B-K05 says `ks` is "never included in … other off-site copies", which contradicts KS-SNAP. (3) The 2K V2-R0 exit criteria do not include the KS-SNAP drill, although F-K-45, V-004-10, H-KS-09 and J-10.5a all call it a V2-R0 exit criterion. (4) There is a new gap, proposed as High in §1.1: there is no rule to keep the newest snapshot after `ks` is lost. (5) R-41 stays open until the first drill passes (an implementation item, acceptable). |
| P4-A1-01 No per-tenant credential | High | **Closed by documented owner acceptance** | `decisions-log.md` OD-15: "C1-01 / R-02 isolation acceptance is re-confirmed, with added hardening ISO-HARD". `risks.md` R-02: "re-confirmed by the owner OD-15 (2026-11-24) with ISO-HARD". ADR-002 decision 9 and V-002-09; 2F F-4.5 (F-ISO-40 to F-ISO-43) and F-IT-100 to F-IT-104; 2J J-ISO-50 to J-ISO-58. The residual F-T-075 is stated plainly: "code execution in `app` can still mint a session for any tenant". | (1) ADR-001 has no record of the OQ-16 or OD-15 re-confirmation (grep finds no OQ-16, OD-15 or R-56 in the file; P4-A3-07 is not fixed). (2) The acceptance says "review at the Phase 5 gate against the pen-test results", but the pen test is in V2-R6, so the gate review has to be a design-time re-confirmation. Record it that way. (3) The auditor's hardening items 1 and 3 were not adopted: unwrap behind a separate cloud identity, and dedicated cells by default for regulated tenants. `keysvc` is a module inside `app` (F-ISO-40). This is covered by the acceptance, but the gate record should say so. (4) Three residual-M items are still "pending owner acceptance": F-AB-16, F-T-122 and F-T-130 (2F F-2.13, lines 312 to 314). |
| P4-A1-08 DR depends on unverified vendor facts | High | **Open pending owner action** | OD-14: the owner verifies the VC list "before the Phase 5 gate". 2H H-9.4 (H-VF-01 to H-VF-08) sets out the fallbacks well, and ADR-004 states "the design does not lose data if a vendor fact fails". | (1) None of VC-01 to VC-22 has a recorded result (P3-X3, lines 306 to 327: only fallbacks). (2) DU-02 (PITR) is still undecided. H-DR-E says "**recommendation** … Owner (DU-02)", yet 2F F-D-05 and ADR-004 already treat "PITR on 7 days (DU-02, rev P4)" as fact. (3) H-DR-G (the VC-14 fallback, a second KEK per tenant) is marked "Owner" but is not recorded as an owner decision. |
| P4-A2-01 ASVS gaps only at chapter level | High | **Closed** (with a verification caveat) | `phase2/2F-asvs-l2.md`: 266 requirement rows, each with status, design reference, owner and target release. Counts per chapter: 181 Met, 59 Partial, 6 Gap, 20 N/A, and "No chapter is Met". Gap register AG-01 to AG-44, each with an owner and a release. The old false "Met" claims are corrected (2.1.7 → Partial AG-09, 7.2.2 → Partial AG-26). | (1) The requirement IDs and wording are "as recalled in this design session, which could not reach owasp.org", so they must be checked against the published standard (OD-14). (2) There is no test-ID column, although the auditor asked for one. (3) The owner must confirm the 2027-06-30 date for re-mapping to ASVS 5.0. None of these blocks closure. |
| P4-A3-01 `auth` schema not classified | High | **Closed** (in design; Medium follow-ups) | 2B-classification §3.1 (every `auth.*` table has class, encryption, retention class and deletion method; ADM and APJ); B-C29 (minimisation); 2D D-80a (`auth` purge job), D-56; 2G G-DC-01 ("Two states, stated honestly"), G-RET-01, G-OFF-04; 2J J-AUTHER. | (1) The timing contradicts itself. 2B-classification line 445 says the Auth user is deleted "**at the same time** as `control.identities` is pseudonymised". 2D D-12a(7) and 2G G-OFF-04 say "the Supabase Auth user deleted … 30 days later". (2) J-AUTHER is a single catalogue row with no test cases, and it points to section J-6.4, which is FINAL-EXPORT. §3.1 itself still says "2J case to add; a follow-up for workstream J". (3) The hard-delete cascade is marked "(verify)" and is not on the VC list. |
| P4-A3-08 Final export not designed | High | **Closed** (in design; Medium follow-ups) | 2D D-12 (state machine), D-12b-1 to D-12b-9 (job, ZIP of JSON and CSV, decrypted files, signed manifest, completeness check against the same snapshot, age passphrase shown once in the app, single-use email link valid 7 days, deletion precondition D-12b-7); 2C C-M01-20 and C-M01-23 to C-M01-26, C-PL-04; 2B B-E90.39 `control.tenant_export_jobs`; 2G G-OFF-01 and G-OFF-02, G-DR-17, G-RET-32; 2J J-FEX-01 to J-FEX-10. D-73 is now marked "never handed to the customer". | (1) The window anchor differs between files (§8, items 14 and 15). (2) D-12b-9 calls for a negative test ("a deliberately dropped row fails the completeness check"), which no J-FEX case covers. (3) Nothing places FINAL-EXPORT in a 2K release, although V2-R0 already includes "deletion with certificate". (4) The approval rule (P4-A3-09) and the certificate (P4-A3-10) are still inconsistent, and both sit on this path. |
| P4-A3-12 ISO gaps without remediation | High | **Open pending owner action** (design part done) | 2G G-14 (G-14.1 clauses 4 to 10 and the SoA; G-14.2 Annex A rows rated O or P; G-14.3 27701), each with owner, target release and evidence; `risks.md` R-49a. | The resolution path requires "owners confirm the dates". G-14 says that "calendar dates follow the owner's per-release target dates (2K K-M07)", and those dates are not recorded (OD-13 is not yet carried out). 2K still has no ISMS workstream. The R-49a row in `risks.md` is malformed: no Source column and no Status. |
| P4-A3-14 Uniform SLA not costed or backed | High | **Open pending owner action** (design part done) | SLA-U: 2A A-NFR-01, A-NFR-02 and A-NFR-21 (99.5%, credits only, region loss excluded, RPO/RTO objectives only); 2I I-4.6.1 to I-4.6.7; 2H H-11.2a H-C-25 (+574 contingent) and H-C-26 (credits at 2% of revenue), H-VF-08; 2J J-SLA-01 to J-SLA-07. | (1) The figure is "*(verify)* against VC-13", which is not verified. H-DR-I says "decided in principle". (2) `decisions-log.md` DU-35 still says "Objective only until VC-13 is verified" and "Mandatory: No (launch)", which contradicts OQ-23 and A-NFR-01 ("Supersedes … DU-35"). (3) The auditor asked for an ADR recording the decision (P4-A3-06, ADR-020). None exists. |
| P4-A3-17 MVP feasibility not shown | High | **Open pending owner action** (and a design-authority deliverable) | OD-13; 2K K-M07 (stop triggers a to d; "Closes P4-A3-17 once the owner has recorded the figures"). | (1) No budget ceiling and no per-release dates are recorded. (2) There is no bottom-up estimate, although the finding asks for one: "Before the Phase 5 gate: produce a bottom-up estimate per release … with a budget envelope". (3) There is no defined minimum sellable subset beyond "V2-R4 and R5 can move after launch". (4) R-05 (H/H) is still "Open" with no acceptance, and A-K1 is open. (5) K-M07 sets the deadline as "before V2-R0 starts", while the finding says "before the Phase 5 gate". |
| P4-A3-18 No technical approver | High | **Open pending owner action** | OD-12 ("Closes P4-A3-18, once appointed"); 2K K-M06 and K-D09; ADR-002 decision 2; F-ISO-06(7). | Nobody has been appointed. `docs/security/SOD_MATRIX.md` and the role table in discovery §4 do not name the role (grep for "technical reviewer" or "fractional" finds only R-B's row). There is no review SLA, no budget line beyond H-C-27, and no competence record (G-14 Cl. 7). |

### 1.1 Medium findings: made worse by the fixes, or should be High

| Item | Assessment | Evidence | Recommendation |
|---|---|---|---|
| **New, RA-01: KS-SNAP has no rule to freeze the newest snapshot after `ks` is lost** | **Proposed High** | F-K-44: "A deletion job every 15 minutes removes each object whose lock has expired, and a lifecycle expiration at 8 days is the backstop." H-BK-08: "then deleted by a lifecycle rule". Once `ks` (or the Supabase organisation) is lost, no new snapshot is written, and the newest snapshot and journal objects expire at most 8 days after their write. If the rebuild is not finished in that window, every key is lost for good: the Critical P4-A1-07 failure returns. Several things can delay the rebuild: the `ks-restore` role needs R-A **and** R-B together (F-K-42), the interim restore target is "(verify)" (F-K-45), and the VC-22 fallback is unverified. No document mentions extending retention or suspending deletion during an incident (my grep for extend, freeze, suspend or hold on KS-SNAP found nothing). | The deletion job and lifecycle must never remove the newest manifest-valid snapshot, or the journal objects after it, while `ks` is unhealthy (H-FL-10 or S1 open). The runbook should extend retain-until (compliance mode allows extension) and send an S1 alert at day 5. State this as a documented exception to the 8-day destruction bound, and have the certificate record any extension. Add a J-KSS case. |
| P4-A3-19 Two-person operating load | **Re-rate to High** (made worse) | The fixes add more work that needs both people at once, and there is still no deputy. Restoring `ks` requires "hardware-key MFA by R-A **and** R-B together" (F-K-42, H-KS-02) to meet a 24/7 S1 RTO of 4 h (A-NFR-19, A-NFR-21). Every SLA exclusion must be "approved by the other approver" (J-SLA-03). R-B is paged on ExportFailed (D-12b-5). OD-12 adds a third party but no deputy. A-24 and A-39 are still Open. | The Critical fix's recovery path, the 24/7 S1 promise and FINAL-EXPORT all fail when one person is unavailable. Contract a deputy approver, with a delegation recorded in SOD_MATRIX, before the first external tenant. Model the operating hours. Run a paging drill. |
| P4-A3-10 Certificate store coverage | Medium, **made worse** | KS-SNAP and the final-export bundles add stores. ADR-004 line 52 and H-KS-10 say "The certificate lists KS-SNAP among the stores", and J-SHR-11 tests "every store named in the deletion certificate schema (2G)": off-site prefixes, `cp` exports, KS-SNAP, observability and email logs, `auth`. But 2G G-6.3 and G-OFF-10 name none of these (G-OFF-10 lists only "backups, standby, off-site key journal"), and 2D D-12c is unchanged since rev P3. Issuance timing still differs three ways: G-OFF-11 "when G-OFF-10 dates pass", D-12 "KMS confirms destruction", A-LC-08 "after KEK destruction". | Keep it Medium, but treat it as must-fix before Go. As written, J-SHR-11 cannot be run, and the certificate is the GDPR evidence. |
| P4-A3-09 Deletion approval and legal hold | Medium, unchanged, **matters more now** | G-OFF-03 still says "requester never approves", while D-58 says "the requester counts as one of them only if they hold one of those roles". FINAL-EXPORT now routes every deletion through D-58 (D-12b-7). B-DL08 still allows a hold override. | Choose D-58 and update G-OFF-03 and G-6.1. |
| P4-A3-06 Significant decisions without an ADR, and P4-A3-07 ADR records inconsistent | Medium, not fixed | No ADR-015 to ADR-020 exists (grep). ADR-014 says "Accepted" in its file but "Proposed" in the index. ADR-001 has no re-confirmation recorded. The titles of ADR-007 and ADR-010 still differ from the index. | These feed G2. |
| P4-A1-12 and P4-A1-13 Migration rollback and global tracks | Medium and Low, not fixed | ADR-009 has no rev P4 change. V-009-05 still reads "(once two maintainers exist)", while H-CI-15 now turns on `prevent_self_review` "from launch". | Fix before V2-R0. |
| P4-A3-16 Trial values | Medium, partly fixed | I-4.4.3 and H-C-22 are updated. 2D D-11a and D-P14 still say "≤30 days", and DU-30 still says "P3-X3-10 values". | Register and text clean-up. |
| P4-A1-09 OQ-22 in the restore RTO | Medium, fixed in design | A-NFR-15 and H-RS-09 now use business hours. `assumptions-log.md` A-24 and `decisions-log.md` DU-29 still say Open. | Register clean-up. |

---

## 2. G2: Mandatory decisions and ADRs

### 2.1 DU items marked "Mandatory for MVP = Yes" (35; DU-03, DU-17 and DU-35 are marked No)

| DU | Decision (short) | Status | ADR |
|---|---|---|---|
| DU-01 | Capacity rule CR-1 | Adopted by DA-10; the owner confirms at the V2-R0 exit. **Not made by the owner.** | None (P4-A3-06 asks for ADR-017) |
| DU-02 | PITR on before the first external tenant | **Not made.** The design already assumes it (F-D-05, ADR-004, H-C-03). | ADR-004 (Proposed) |
| DU-04 | Cloud provider (AWS) | Not made | None |
| DU-05 | DA-01 search model as a product constraint | Not made | None |
| DU-06 | Observability and email procurement (EU) | Not made | None |
| DU-07 | Edits to existing protected workflows | Not made | None |
| DU-08 | k6 and the perf-cell budget | Not made | None |
| DU-09 | J-ISO-25 residual and detector choice | Residual accepted in substance (OQ-16, OD-15); the detector depends on VC-09. **Partly made.** | ADR-002 (Proposed) |
| DU-10 | Parity ledger as a release gate | Not made | None |
| DU-11 | Machine-readable RBAC matrix and endpoint registry | Not made (design-authority item) | None |
| DU-12 | Dunning policy | Not made | None |
| DU-13 | Void becomes a credit note | Not made | None |
| DU-14 | Drop the screenings and IDV meters | Not made | None |
| DU-15 | External roles are not paid seats | Not made | None |
| DU-16 | Proration rule | Not made | None |
| DU-18 | Thin webhooks | Not made, **and an ADR is required** | None (ADR-016 requested) |
| DU-19 | One approval engine | Not made, **and an ADR is required** | None (ADR-015 requested) |
| DU-20 | ADR-004 export rotation and storage limitation | Not made (counsel) | ADR-004 (Proposed) |
| DU-21 | Retention schedule | Not made (counsel; OD-08 commissioned) | None (ADR-019 requested) |
| DU-22 | DPO | Not made | None |
| DU-23 | Art. 27 representatives (if selling to the UK or EU) | Not made | None |
| DU-24 | DPA outline and subprocessor list | Not made | None |
| DU-25 | Legal: the paraphrase position | Not made (counsel) | None |
| DU-26 | Legal: pseudonymous audit ids | Not made (counsel) | None |
| DU-27 | Other OD-08 legal reviews | Not made | None |
| DU-28 | Sizing of `ks` | Not made (J-PERF) | None |
| DU-29 | Paging target | **Made in substance** by OQ-22 (24/7 for S1); the register still says Open | None |
| DU-30 | Trial policy content | **Made in substance** by OQ-21; the register text is stale | None (ADR-018 requested) |
| DU-31 | B2B only | Not made | None |
| DU-32 | 5 minutes of metering lag | Not made | None |
| DU-33 | Product-scope confirmations | Not made | None |
| DU-34 | Static IPs before the first external tenant | Not made. It is costed as if decided (H-C-08, H-C-20a). | None |
| DU-36 | `ks` continuity | Made by OQ-17, then **superseded by KS-SNAP**, which still needs H-DR-H | ADR-003 and ADR-004 (Proposed) |
| DU-37 | ADR-002 to ADR-014 to Accepted | **Not made** | n/a |
| DU-38 | Naming conflicts | Made by the design authority (spine v2) | None |

Result: 0 of 35 are "made and recorded as an ADR". About 6 are made in substance (DU-09 partly, DU-29, DU-30, DU-36 then superseded, DU-38, and DU-01 provisionally). Owner decisions taken after Phase 4 also need recording: H-DR-G, H-DR-H and H-DR-I are all marked "Owner" in 2H but are not in `decisions-log.md`.

### 2.2 ADR statuses

| ADR | File status | Index status |
|---|---|---|
| ADR-001 | Accepted (fixed by the owner) | Accepted; C1-01 accepted. The OD-15 re-confirmation is not recorded in the ADR. |
| ADR-002 to ADR-013 | Proposed | Proposed ("recommendations accepted 2026-11-23"; formal change pending DU-37) |
| ADR-014 | **Accepted** (OD-07) | **Proposed**: a contradiction (P4-A3-07) |

---

## 3. G3: High-impact assumptions and vendor facts

`assumptions-log.md` was not revised in Phase 4 (it has no "rev P4" mark).

| HI assumption still Open | Covered by owner acceptance? |
|---|---|
| A-05 global `cp` holds identity data outside the region | **Yes:** "Open (owner-accepted; legal pending)" |
| A-07, A-11, A-15, A-60 (capacity, CR-1) | No. DA-10 is provisional; measured in J-PERF. |
| A-09, A-37 (Supabase features, pgmq and cron) | No (VC-01, VC-02, VC-04, VC-06) |
| A-10 crypto-shredding acceptable for backups | No (counsel) |
| A-13 Vercel serverless is enough | No (VC-01, VC-10) |
| A-14 health customers make Selvara a processor of special-category data | No (counsel) |
| A-16 Postgres 16 or later | No. A fallback is designed (ADR-002 decision 1, NOINHERIT; VC-05). |
| A-17, A-46 Data API off; pgaudit and log drains | No (VC-03, VC-09) |
| A-20 PITR into a new project | No. The fallback H-VF-01 withdraws path B. |
| A-23 KMS multi-Region replicas | No. The H-VF-02 fallback is chosen; the owner decision H-DR-G is not recorded. |
| A-24 24/7 paging | Answered by OQ-22, but the register still says "Open" |
| A-26 role and catalogue scale | No (J-PERF) |
| A-28 `ks` holds one key per subject | No (DU-28) |
| A-41 Supabase SAML tier | No (VC-06) |
| A-45 Vercel OIDC federation | No (VC-10) |
| A-47 Storage objects not in database backups | No (VC-04) |
| A-48 KMS cross-account grants with context conditions | No (VC-21). **ISO-HARD now also depends on it**: F-ISO-40 says "verify that the chosen KMS supports session tags in key-policy conditions, A-48". |
| A-51 PITR and backup windows can be evidenced | No (VC-19) |
| A-52 Selvara is a processor | No (counsel) |
| A-62 representative load profile | No |
| A-63 pooler `SET LOCAL` semantics and role-change log | No (VC-09) |

That is 26 HI assumptions open, and owner acceptance covers 1. OD-14 is a commitment to verify, not an acceptance.

**Vendor facts the owner must verify (OD-14).** VC-01 to VC-22 are in P3-X3, lines 306 to 327. None has a recorded result. Gate priority: VC-02, VC-13, VC-14, VC-16, VC-19, VC-21, VC-22 (DR, SLA, keys, WORM), then VC-09, VC-05, VC-06, VC-03, VC-01, VC-10, VC-04, VC-15, VC-20, then VC-07, VC-08, VC-11, VC-12, VC-17, VC-18.

**Items marked "(verify)" in Phase 4 that are not on the VC list** (the design authority should add them as VC-23 onward so that OD-14 is complete):
- KMS session tags in key-policy conditions (F-ISO-40)
- KMS audit log carrying context and tags, and the SIEM join (F-ISO-43)
- the interim `ks` restore target if the Supabase organisation is lost (F-K-45)
- object-lock lifecycle deletion lag (H-BK-08)
- Supabase Auth hard-delete cascade (2B-classification §3.1)
- pgaudit `FUNCTION` logging of nested built-in calls (F-ISO-06(5))
- Supabase Storage per-request token with a `tkey` claim (F-ISO-42)
- ASVS 4.0.3 requirement wording (annex header)
- Supabase Auth hash algorithm and cost, TOTP seed protection, Vercel OCSP stapling and the trusted client-IP header (AG-10, AG-14, AG-31, AG-44)

---

## 4. G4: Coverage matrix

| Check | Result | Evidence |
|---|---|---|
| X1 matrix: Missing cells | 1 (M24 Help, column K, footnote 25) | P3-X1 §2.1 line 65; Phase 3 summary §3: "**Missing** 1: M24 Help desk had no release in 2K" |
| Closure | **Closed** | 2K K-2, V2-R1 scope: "Help desk: tenant questions (M24, C-M24-01) and staff answers (C-PL-10)" |
| Independent re-measure in Phase 4 | Not evidenced | The Phase 3 summary says "Phase 4 re-measures the matrix independently", but no Phase 4 report contains a re-measured matrix (grep for "coverage matrix" or "re-measur" in `phase4/` finds nothing). |
| Gaps created by later changes | **No Missing cell. Some cells in column K become Partial.** | The 2K release table has no rev P4 changes except K-M06, K-M07 and K-D09. FINAL-EXPORT (D-12b, C-M01-23 to C-M01-26), D-80a, KS-SNAP (H-KS-*), ISO-HARD tests (F-IT-100 to F-IT-106, J-ISO-50 to J-ISO-58), SLA-U (I-4.6, J-SLA), J-AUD and the G-14 ISMS rows are not in any release scope or exit criterion. The V2-R0 exit still reads "F-IT-01 to F-IT-37", while F-SD-01 requires F-IT-01 to F-IT-39 and F-IT-100 to F-IT-106. |

Verdict: **Met.** Before Go, the design authority should update the 2K scope and exits (blocker 7).

---

## 5. G5: Lifecycle designs and test plans

| Capability | Design items | 2J test IDs | Pass/Fail |
|---|---|---|---|
| Tenant provisioning | 2H H-PV-01 to H-PV-09 (four-eyes gate, random `tkey`, `ops.provision_tenant`, warm pool, KEK and its DR copy, seed, Storage and off-site prefixes, backups, monitoring; each step with a compensation); 2A A-LC lifecycle, A-NFR-10; trials D-11a and I-4.4.3 | J-MIG-09 (provisioning during a rollout), J-ISO-27 (catalogue assertions "run on every schema"), J-MIG-01 (tenant created mid-rollout), J-PERF H5 (≤ 10 s p95) | **Pass, but thin.** No dedicated case covers step failure and compensation, KEK and DR-key creation, or the off-site prefix lock. Suggest a J-PRV group. |
| Isolation testing | ADR-002 decisions 1 to 9, V-002-01 to V-002-09; 2F F-4.1 to F-4.5 (F-ISO-01 to F-ISO-43), F-ISO-06 (R-56) | J-ISO-01 to J-ISO-58 (J-2.1 API, J-2.2 direct DB, J-2.3 pooling, J-2.4 ISO-HARD); F-IT-01 to F-IT-39, F-IT-40 to F-IT-97 (now defined in F-4.3b, closing P4-A2-04), F-IT-100 to F-IT-106; J-AUTHZ; J-AUD; F-SD-01 blocks merge | **Pass.** The V2-R0 exit range needs correcting (§4). |
| Multi-schema migration | ADR-009 decisions 1 to 9, V-009-01 to V-009-05; 2H H-6.3, H-CI-10 to H-CI-15, H-FL-04 and H-FL-05 | J-MIG-01 to J-MIG-10 (N = 20, 200 and 1,000; mid-batch failure, pause and resume, rollback, expand and contract, drift, `ref` upgrade, timing) | **Pass.** P4-A1-12 is still an open Medium (rollback optional, global tracks unstaged), and V-009-05 is stale. |
| Single-tenant restore | ADR-004 paths A and B, V-004-01 to V-004-11; 2H H-RS-01 to H-RS-10, H-VF-01; A-NFR-15 (RTO in business hours for tenant requests) | J-RST-01 to J-RST-09 (neighbour B unaffected: J-RST-04; KEK unavailable fails closed: J-RST-07); `ks` restore J-RST-09 and J-KSS-01 to J-KSS-09 | **Pass.** Path B depends on VC-02; fallback H-VF-01. |

Verdict: **Met.**

---

## 6. G6: Sign-off

What exists: 2K K-D09 requires "technical (the contracted reviewer, K-M06), security (R-B CISO) and management (R-A Management Approver) approvers". The V2-R6 exit says "Sign-off table signed by technical, security and management approvers". The organisation policy requires technical, security and management review before deployment, and qualified compliance or legal review of compliance content.

What a Phase 5 sign-off table needs and the documents lack:
1. **A Phase 5 gate sign-off table or template.** None exists. README marks Phase 5 "Not started", and the Phase 4 summary is still "Draft for the owner's review".
2. **A named technical approver.** OD-12 is not carried out. SOD_MATRIX and discovery §4 do not define the role, its independence from the AI tooling, or its competence evidence.
3. **Approver identity and evidence for owner decisions.** OD-12 to OD-15 are single rows with no approver or evidence. OQ-16 names "approver R-A" for risks owned by R-B; the CISO's own concurrence is not recorded.
4. **A compliance and legal reviewer line.** It is needed for the draft GDPR, ISO and ASVS content (DU-20 to DU-27, OD-08), or else an explicit record that the gate approves the design "subject to counsel" with dates.
5. **A record of Phase 4 closure verification.** 2F line 14 cites "the Phase 4 change log", which does not exist. The Findings Register has no status or closure column, so there is no single place to see which of the 65 findings are fixed.
6. **Separation of duties for the gate.** The record should show that someone independent of the authors verified the closures. This report can serve that purpose.
7. **Conditions and expiry.** Residual-risk reviews "at the Phase 5 gate" (OQ-16, OD-15, F-2.13) need a recorded outcome and a next-review date.

Verdict: **Not met.**

---

## 7. Other observations

- `risks.md`: the R-65 row has misaligned columns ("Medium | Medium" sit in the Source and L columns). R-49a has 6 cells in an 8-column table, with no Source and no Status.
- The shared-specification labels S-1 to S-4 (used by H-9.1a, J-2.4, J-6.3, J-6.4, J-7.3 and H-C-26) and the "Phase 4 shared specifications" that 2H names as a binding input are not defined in any document.
- `assumptions-log.md` was not touched in Phase 4. The `decisions-log.md` DU table was not updated after Phase 4: DU-02, DU-29, DU-30, DU-35 and DU-36 are stale.

---

## 8. Consistency spot-check of the four Phase 4 fix specifications

Arithmetic and job IDs that **are consistent**:
- **Costs.** The 2H H-C-15 totals add up (856, 1,377 and 6,441; I recomputed every line). Per tenant: 86, 13.8 and 6.4, matching I-4.5.1 and R-19. H-PR-01 gives "about 850" and "about 1,430" with H-C-25 (856 + 574). The PITR cost on `ks` of about USD 100 (ADR-004) matches H-C-03. The KS-SNAP cost of USD 2, 2 and 5 (H-C-24) matches F-K-46 ("one KMS key … eight small snapshot objects") and ADR-004 ("a few dollars"). DU-34's "about USD 200" equals H-C-08 plus H-C-20a.
- **Job IDs.** D-12b is the final export and D-12e the certificate, consistently across 2B, 2C, 2D, 2F-asvs and 2G. No stale "D-12b certificate" remains. D-82 stays the content-upgrade job, so it does not clash with the auditor's suggested ID.
- **Windows.** The 8-day lock and the 8-day bound agree in F-K-44, H-KS-01, H-KS-10, ADR-003, ADR-004, J-KSS-09, J-SHR-10 and A-LC-08, apart from items 1 and 4 below.

Contradictions:

| # | Spec | Contradiction | Where |
|---|---|---|---|
| 1 | KS-SNAP / 7-day PITR | `ks` PITR is "on with a 7-day window (DU-02, rev P4)" in F-D-05, ADR-003, ADR-004 and H-BK-07, but "**PITR off**" in the binding spine S7 and in 2B B-K05. DU-02 is undecided, and its recommendation in `decisions-log.md` names only "`cp` and `c1`", while H-DR-E and H-C-03 name "`cp`, `c1` and `ks`". | `00-spine.md` line 141; 2B-data-model line 1928; `decisions-log.md` DU-02 |
| 2 | KS-SNAP | B-K05 says `ks` is "never included in … other off-site copies". The spine S7 has no KS-SNAP and promises survival only of "cell or region loss", not loss of the organisation. | 2B B-K05; spine S7 |
| 3 | KS-SNAP | The drill is a "V2-R0 exit criterion (2K)" in F-K-45, ADR-004 V-004-10, ADR-003 V3-11, H-KS-09 and J-10.5a, but the 2K V2-R0 exit list does not include it. | 2K K-2, V2-R0 row |
| 4 | KS-SNAP / 8-day bound | The deletion mechanism differs. F-K-44 uses a 15-minute deletion job with lifecycle as the backstop, so the bound is "lock end plus at most 15 minutes". H-BK-08 uses a "lifecycle rule … if any [lag], the certificate states 8 days plus that lag". F-D-13 says "exactly 8 days". | 2F F-K-44, F-D-13; 2H H-BK-08 |
| 5 | KS-SNAP | Alert triggers differ. F-K-43 and F-M-20: "missing by 04:00 UTC … Sev-2; Sev-1 after two consecutive days". H-KS-07 and H-FL-10: "older than 26 h … S2; older than 50 h … S1". | 2F F-K-43, F-M-20; 2H H-KS-07, H-FL-10 |
| 6 | KS-SNAP | The restore target differs: "managed Postgres in the cloud account *(verify)*" (F-K-45) versus "a Postgres host in the DR region" (H-KS-08). | 2F F-K-45; 2H H-KS-08 |
| 7 | KS-SNAP | The drill environment differs: "on staging with synthetic tenants" (F-K-45) versus "quarterly (staging and production)" (H-KS-09, J-KSS, J-10.5a). | 2F, 2H, 2J |
| 8 | KS-SNAP | The content differs: F-D-13 and F-K-40 include "audit HMAC keys"; H-BK-08 and ADR-004 line 32 do not. | 2F, 2H, ADR-004 |
| 9 | KS-SNAP / certificate | "The certificate lists KS-SNAP" (ADR-004 line 52, H-KS-10), but 2G G-6.3, G-OFF-10 and 2D D-12c do not. | 2G, 2D |
| 10 | ISO-HARD | 2A A-RT-10 says it is "identical in 2A, 2F F-ISO-06 and 2J", but it has only the pgaudit `ROLE` and `MISC` classes. It lacks the `FUNCTION` class, response buffering and the ISO-HARD reference that F-ISO-06 gained in rev P4. 2A has no ISO-HARD mention at all. | 2A line 253 versus 2F line 352 |
| 11 | ISO-HARD | Test ranges differ: "F-IT-100 to F-IT-104" (F-4.5, V-002-09) versus "F-IT-100 to F-IT-106" (F-SD-01). There is no mapping between F-IT-100 to F-IT-104 and J-ISO-50 to J-ISO-58. The V2-R0 exit says "F-IT-01 to F-IT-37". | 2F, ADR-002, 2J, 2K |
| 12 | ISO-HARD | OD-15 and ADR-002 record the re-confirmation; ADR-001 and its index row do not. | ADR-001; `decisions-log.md` |
| 13 | FINAL-EXPORT | The window anchor differs: "30 days after the first ready", extended for link expiry, holds or disputes (D-12 and D-12b-1); "30 days pass after delivery" (J-FEX-09); "grace 30 days (export available)" from the termination notice, with no mention of the receipt precondition (A-LC-08). | 2D, 2J, 2A |
| 14 | FINAL-EXPORT | D-12b-7 requires "the latest generation is `ready`", but B-E90.39 moves a generation to `confirmed` or `window_expired`, so a confirmed export would fail its own precondition. | 2D D-12b-7; 2B B-E90.39 |
| 15 | FINAL-EXPORT | D-12b-9 lists the negative case "a deliberately dropped row fails the completeness check"; J-FEX-01 to J-FEX-10 has no such case. | 2D, 2J |
| 16 | FINAL-EXPORT | Deletion approval: D-58 versus G-OFF-03 "requester never approves" (P4-A3-09). | 2D, 2G |
| 17 | FINAL-EXPORT / D-12e | Certificate issuance happens at three different times (G-OFF-11, D-12, A-LC-08). The fields differ: D-12e has catalog proof but no PITR, `ks` or off-site roll-off dates; G-6.3 has those dates but no catalog proof. | 2G, 2D, 2A |
| 18 | P4-A3-01 (linked to FINAL-EXPORT offboarding) | Auth user deletion: "at the same time" as pseudonymisation (2B-classification §3.1) versus "30 days later" (D-12a(7), G-OFF-04). J-AUTHER has no cases and points to J-6.4. | 2B-classification line 445; 2D; 2G; 2J line 40 |
| 19 | SLA-U | DU-35 says "objective only; not mandatory", against OQ-23 and A-NFR-01 ("supersedes DU-35"). | `decisions-log.md` |
| 20 | SLA-U | The exclusions differ. I-4.6.4 excludes suspension and restriction (I-5) and the Trust Center public pages. A-NFR-01 and J-SLA-03 do not, so the J-SLA calculator would propose credits for suspended tenants. | 2I, 2A, 2J |
| 21 | SLA-U | H-DR-I is "decided in principle"; the 99.5% figure is "(verify)" everywhere. This is consistent across files, but it is not final. | 2A, 2I, 2H |

---

## 9. Ordered list of what must be resolved for a "Go"

DA = design authority (documentation). Owner = R-A and/or R-B.

| # | Item | Who | Closes |
|---|---|---|---|
| 1 | Add the KS-SNAP rule to keep the newest snapshot after `ks` is lost (RA-01). Align the KS-SNAP texts: spine S7, B-K05, 2K V2-R0 exit, deletion mechanism, alerts, restore target, content, certificate (§8, items 1 to 9). | DA | P4-A1-07 (design), RA-01 |
| 2 | Ratify H-DR-H (KS-SNAP replaces the OQ-17 design) and H-DR-G (second-KEK fallback). Decide DU-02 (PITR on `cp`, cells and `ks`). | Owner (R-A and R-B) | P4-A1-07, P4-A1-08 (part) |
| 3 | Extend the VC list with the Phase 4 "(verify)" items (§3). Then carry out OD-14: verify VC-01 to VC-22 and the new items against vendor documentation, record the results in P3-X3, and apply the H-9.4 fallbacks where facts fail. | DA (list), then Owner | P4-A1-08, G3, P4-A2-01 caveat |
| 4 | Appoint the technical reviewer (OD-12). Record the role, independence, scope, SLA and budget in SOD_MATRIX and discovery §4 (the DA drafts; the owner approves). | Owner | P4-A3-18, G6 |
| 5 | Contract a deputy approver and record the delegation (re-rated P4-A3-19). | Owner | P4-A3-19 (High) |
| 6 | Produce a bottom-up effort estimate and a minimum sellable subset (DA). Record the budget ceiling and per-release dates (OD-13), and accept or treat R-05 (owner). | DA, then Owner | P4-A3-17 |
| 7 | Confirm the G-14 dates from item 6. Confirm the SLA-U figure after VC-13 (H-DR-I). The DA updates DU-35, adds the P4 work to 2K (FINAL-EXPORT, D-80a, KS-SNAP, ISO-HARD tests, SLA-U, J-AUD, ISMS) and corrects the V2-R0 F-IT range. | Owner, DA | P4-A3-12, P4-A3-14, G4 caveat |
| 8 | Fix FINAL-EXPORT, certificate and `auth` inconsistencies (§8, items 13 to 18; P4-A3-09; P4-A3-10). Write the J-AUTHER cases and the J-FEX completeness negative case. Align the SLA-U exclusions (item 20) and A-RT-10 (item 10). | DA | P4-A3-01 and P4-A3-08 follow-ups, P4-A3-09, P4-A3-10 |
| 9 | Write ADR-015 to ADR-020 (P4-A3-06). Amend ADR-007 for OD-01. Record the OD-15 re-confirmation in ADR-001. Fix the ADR-014 index. | DA | G2 |
| 10 | Decide the remaining mandatory DUs (§2.1). Carry out DU-37 (accept ADR-002 to ADR-014). Accept the residual-M items F-AB-16, F-T-122 and F-T-130. Record the gate re-confirmation of R-02 as a design-time review. | Owner | G2, G1 (P4-A1-01 conditions) |
| 11 | Legal HI assumptions (A-10, A-14, A-52, A-05) and DU-20 to DU-27: get counsel's results, or an explicit owner acceptance as DRAFT pending counsel, with dates and a market-by-market sales restriction. | Owner + counsel | G3 |
| 12 | Clean up the registers: A-24 and DU-29 (OQ-22), DU-30 (OQ-21), the R-65 and R-49a rows, a status column for the Findings Register, a Phase 4 change log, and README. | DA | G6 evidence |
| 13 | Produce the Phase 5 sign-off table: technical, security and management approvers, plus a compliance and legal reviewer line. Include conditions, residual acceptances and the next review date. Attach this independent verification. | DA (template), then Owner and the appointed reviewer sign | G6 |
