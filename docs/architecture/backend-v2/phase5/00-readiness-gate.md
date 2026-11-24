# Back-end v2, Phase 5: Readiness gate

| | |
|---|---|
| Status | **Recommendation: No-Go** (2026-11-24); **re-confirmed No-Go after the owner's sign-off** (re-assessment of 2026-11-24, [P5-reassessment-2026-11-24.md](P5-reassessment-2026-11-24.md)); **still No-Go after the second batch of owner decisions** (OD-19 to OD-24, section 6, rev P5b) |
| Basis | Independent readiness assessment ([P5-readiness-evidence.md](P5-readiness-evidence.md)) of the design after the Phase 4 fixes. The assessor did not write the design or the fixes. |
| Rule (brief) | "Go" only if: no open Critical or High findings; all mandatory MVP decisions are made and recorded as ADRs; all high-impact assumptions are validated or explicitly accepted; the coverage matrix has no Missing cells for MVP modules; provisioning, isolation testing, migration and single-tenant restore are designed with test plans; and a sign-off table is prepared. |
| Note | All compliance content is a **draft** pending qualified legal and compliance review. |

## 1. Readiness scorecard

| # | Criterion | Verdict | Evidence (summary) |
|---|---|---|---|
| G1 | No open Critical or High findings | **Not met** | Of the 10 Phase 4 Critical and High findings, P4-A1-01 is closed by documented owner acceptance (OD-15), and P4-A2-01, P4-A3-01 and P4-A3-08 are closed in the design, with follow-ups. Five wait on owner action (A1-08, A3-12, A3-14, A3-17, A3-18). The Critical **P4-A1-07** is fixed in the design but needs a "keep-newest snapshot" rule and owner ratification. The assessor raises two new Highs: RA-01 (KS-SNAP without a keep-newest rule) and P4-A3-19 re-rated High (the `ks` restore needs both approvers at once, with no deputy). |
| G2 | Mandatory MVP decisions made and recorded as ADRs | **Not met** | 35 mandatory DU items are not yet recorded as ADRs. ADR-002 to ADR-013 are still Proposed. ADR-015 to ADR-020 are needed (P4-A3-06). |
| G3 | High-impact assumptions validated or explicitly accepted | **Not met** | 26 high-impact assumptions are open; only A-05 is owner-accepted. No vendor fact (VC-01 to VC-22) has a recorded result, because the design session cannot reach the vendor sites (OD-14 makes this an owner action). |
| G4 | No Missing coverage cells for MVP modules | **Met** | The one Missing cell (M24 help desk) is in V2-R1. Caveat: 2K does not yet schedule the Phase 4 additions. |
| G5 | Provisioning, isolation testing, migration and single-tenant restore designed with test plans | **Met** | All four have designs and test IDs in 2J. Caveat: the provisioning tests are thin. |
| G6 | Sign-off table prepared | **Not met → prepared below** | Section 3 provides the table. The technical reviewer is not yet appointed (OD-12). |

## 2. What must be resolved, in order

The full table with evidence is in [P5-readiness-evidence.md §9](P5-readiness-evidence.md). DA = design authority (documentation; Claude can do it). Owner = R-A Management Approver and/or R-B CISO.

| # | Item | Who |
|---|---|---|
| 1 | Add the KS-SNAP **keep-newest-snapshot** rule after `ks` is lost (RA-01), and align every KS-SNAP text: spine S7 and B-K05 still say "PITR off"; the V2-R0 exit, the alerts and the certificate. | DA |
| 2 | Ratify H-DR-H (KS-SNAP replaces the OQ-17 design) and H-DR-G (second-KEK fallback); decide DU-02 (PITR on `cp`, cells and `ks`). | Owner |
| 3 | Extend the vendor-fact list with the Phase 4 "(verify)" items (DA), then **verify every VC fact** against vendor documentation and record the result (Owner, OD-14). | DA, then Owner |
| 4 | **Appoint the technical reviewer** (OD-12) and record the role. | Owner |
| 5 | **Contract a deputy approver** and record the delegation (P4-A3-19). | Owner |
| 6 | Produce a bottom-up effort estimate and a minimum sellable subset (DA); then **record the budget ceiling and per-release dates** (OD-13). | DA, then Owner |
| 7 | Confirm the ISO plan dates and the SLA figure (after VC-13). Schedule all Phase 4 additions in 2K. | Owner, DA |
| 8 | Fix the remaining contradictions in FINAL-EXPORT, the deletion certificate and `auth` deletion; add the missing test cases. | DA |
| 9 | Write ADR-015 to ADR-020; amend ADR-007 for OD-01; record OD-15 in ADR-001. | DA |
| 10 | Decide the remaining mandatory DU items; **accept ADR-002 to ADR-014** (DU-37); accept the residual Medium items F-AB-16, F-T-122 and F-T-130. | Owner |
| 11 | Commission counsel on the legal high-impact assumptions (A-10, A-14, A-52, A-05; DU-20 to DU-27), or accept them explicitly as DRAFT with a market-by-market sales restriction. | Owner + counsel |
| 12 | Clean up the registers and add a status column to the Findings Register. | DA |
| 13 | Complete and sign the sign-off table (section 3). | Owner and the appointed reviewer |

**Fastest path to "Go".** Items 1, 3 (list), 6 (estimate), 7 (2K part), 8, 9 and 12 are design-authority work and can be done in one pass. The rest are owner actions: 2, 3 (verification), 4, 5, 6 (figures), 7 (confirmations), 10, 11 and 13. Once both are complete, re-run the independent readiness assessment.

## 3. Sign-off table

Sign only when section 2 is complete and the re-assessment recommends "Go". Names are placeholders.

| Role | Name | Scope of approval | Conditions and residual risks accepted | Decision (Go / No-Go) | Date | Signature |
|---|---|---|---|---|---|---|
| Technical approver (contracted reviewer, OD-12) | `Hamza` | Design conformance; router, keys and authorisation design; tests and migrations plan | Accepted | Go | 24-11-2026 | Hamza |
| Security approver (R-B, CISO) | `Shahid` | Threat model, isolation (incl. C1-01 / R-02 residual, ISO-HARD), keys (KS-SNAP), ASVS L2 plan | R-02 re-confirmed (OD-15); residual Medium items | Go | 24-11-2026| Shahid |
| Management approver (R-A, Management Approver) | `Shahid M.` | Scope, budget, dates, stop criteria (K-M07), SLA, commercial decisions | Accepted | Go | 24-11-2026 | Shahid |
| Compliance and legal reviewer | `Sara` | Privacy (RoPA, DPIA, retention, transfers), DPA, ISO 27001 and 27701 plan | DRAFT items accepted | Go | 24-11-2026 | Sara |
| Deputy approver (P4-A3-19) | `Hamid` | Stands in for R-A or R-B in four-eyes actions and key-store recovery | Approved | Go | 24-11-2026 | Hamid |

Next review date: at each release gate (2K K-4), and before cutover (V2-R6).

## 4. Status after the documentation pass (2026-11-24, rev P5)

All design-authority (DA) items from section 2 are done. **The recommendation stays No-Go** until the owner actions below are complete. After that, the independent readiness assessment is re-run.

| # | Item | Status |
|---|---|---|
| 1 | KS-SNAP keep-newest rule (RA-01) and alignment of every KS-SNAP text | **Done (DA).** Spine S7, 2F F-K-47, 2H H-KS-11, ADR-003, ADR-004, 2B B-K05, ADR-019. Owner ratification (H-DR-H) is pending. |
| 3 | Vendor-fact list extended (VC-23 to VC-34) | **Done (DA).** The table is in [assumptions-log.md](../assumptions-log.md), "Vendor facts to verify (OD-14)". **Owner verification pending.** |
| 6 | Bottom-up effort estimate and minimum sellable subset | **Done (DA):** [P5-effort-estimate.md](P5-effort-estimate.md). Full build 86 / 136 / 221 person-weeks (low / likely / high); minimum sellable subset 73 / 115 / 186. **Owner: budget ceiling and dates.** |
| 7 | Phase 4 additions scheduled in 2K; deputy role defined | **Done (DA).** 2K K-2a and K-M08; deputy approver **R-DEP** in K-M03 and K-D09 and in the discovery §4 roles table. R-D remains the internal auditor. |
| 8 | FINAL-EXPORT, certificate and `auth` deletion contradictions; missing tests | **Done (DA).** 2B, 2D, 2G, 2C, 2J (J-AUTHER-01 to 10, J-FEX-11 and 12), 2A A-LC-08. |
| 9 | ADR-015 to ADR-020; ADR-001, ADR-007 and ADR-014 updates | **Done (DA)**, all Proposed. **Owner acceptance pending** (DU-37). |
| 12 | Registers cleaned up; Findings Register status column; Phase 4 change log | **Done (DA):** [phase4/00-phase4-summary.md](../phase4/00-phase4-summary.md), [P4-change-log.md](../phase4/P4-change-log.md) |
| 13 | Sign-off table | Template in section 3, with the deputy row labelled R-DEP. **Signatures pending.** |

**Remaining owner actions, in order:**
1. Ratify H-DR-H and H-DR-G, and decide DU-02 (PITR on `cp`, the cells and `ks`).
2. Verify VC-01 to VC-34 against vendor documentation (OD-14). Apply the 2H H-9.4 fallbacks where a fact fails.
3. Appoint the technical reviewer (OD-12).
4. Appoint the deputy approver R-DEP (P4-A3-19).
5. Record the budget ceiling and per-release dates (OD-13), using P5-effort-estimate.md; accept or treat R-05.
6. Confirm the ISO plan dates (G-14) and the SLA figure after VC-13.
7. Decide the remaining mandatory DU items; accept ADR-002 to ADR-020; accept residual Medium items F-AB-16, F-T-122 and F-T-130.
8. Get counsel's view on the legal assumptions, or accept them explicitly as DRAFT with market restrictions.
9. Sign the sign-off table.

**Findings Register now:** 30 Closed, 1 Closed by owner acceptance, 12 open pending owner action, 22 open for DA. The 22 DA items are all Medium or Low and are scheduled into releases; none blocks the gate. Every Critical and High finding is now either closed or waiting on an owner action.

## 5. After the re-assessment (2026-11-24, rev P5)

| Re-assessment finding | Status |
|---|---|
| RA2-01 (Critical): R-A and R-B held by one person | **Design changed per the owner's instruction OD-16.** [ADR-021](../adr/ADR-021-flexible-platform-roles.md) lets one person hold several platform roles while every four-eyes action still needs two different people, with R-DEP as the mandatory second person and compensating controls. A-08 is superseded by A-08b; new risk R-66. **Closed (2026-11-24):** ADR-021 and R-66 accepted (OD-18); deputy delegation recorded in `docs/security/SOD_MATRIX.md` §16. |
| RA2-02 (High): signed before Go | Open (owner). The signatures stay in place; they are not valid gate approval until the re-assessment recommends Go. |
| RA2-03 (High): signature provenance | Open (owner). Each signatory should confirm in their own pull request review or approval. |
| RA2-04 (Medium): compliance acceptance not specific | Open (owner, deferred with the section 4 owner actions, OD-17). |
| RA2-05 (Low): H-DR-H / H-DR-DEP mismatch | **Fixed (DA):** `decisions-log.md` now uses H-DR-H. |
| RA2-06 (Low): D-58 called the deputy "R-D" | **Fixed (DA):** 2D D-58, 2G and 2B now say R-DEP; R-D stays the internal auditor. |

The gate stays **No-Go** until the owner actions are recorded (deferred by the owner, OD-17) and ADR-021 is accepted. The independent assessment is then re-run.

## 6. After the owner decisions of 2026-11-24, second batch (rev P5b)

The owner recorded OD-19 to OD-24 and seven vendor-fact results (decisions-log, assumptions-log "Results recorded").

| Owner action (section 4 list) | Status |
|---|---|
| 1. Ratify H-DR-H and H-DR-G; decide DU-02 | **Done:** DU-02 option A, H-DR-H ratified, H-DR-G closed as a fallback (OD-20) |
| 2. Verify VC-01 to VC-34 | **Partly done:** VC-02, VC-13, VC-14, VC-16, VC-19 and VC-21 recorded; VC-22 not confirmed; 27 facts still to verify (tracking date 31 Dec 2026) |
| 3. Technical reviewer (OD-12) | Named in the sign-off table; engagement terms to record by 31 Dec 2026 |
| 4. Deputy approver R-DEP | **Done** (OD-18, SOD_MATRIX §16) |
| 5. Budget ceiling and dates; R-05 | **Recorded, with an open query** (OD-21): the USD 5,000 ceiling against about USD 135,000 likely to cutover. R-05 accepted |
| 6. ISO dates and SLA figure | **Done:** ISO tracking dates (OD-22, [P5-roadmap-calendar.md](P5-roadmap-calendar.md)); SLA 99.0%, configurable (OD-23, ADR-020) |
| 7. Mandatory DU items; ADR acceptance; residual Mediums | **ADR-002 to ADR-020 accepted** (OD-19, DU-37 closed). Still open: the other mandatory DU items (for example DU-04, DU-06, DU-10 to DU-16, DU-31 to DU-34) and F-AB-16, F-T-122, F-T-130 |
| 8. Legal assumptions | **Deferred** by the owner (OD-24); RA2-04 open |
| 9. Sign the table | Signatures present; valid only after a Go recommendation (RA2-02, RA2-03) |

| Criterion | Verdict now | Why |
|---|---|---|
| G1 No open Critical or High | **Not met** | P4-A1-08 (part), P4-A3-17 (budget query), RA2-02 and RA2-03 are still open |
| G2 Mandatory decisions as ADRs | **Not met (progress)** | All ADRs accepted; mandatory DU items still open |
| G3 High-impact assumptions | **Not met** | Legal A-05, A-10, A-14, A-52 deferred (OD-24); most vendor facts unverified |
| G4 Coverage | Met | Unchanged |
| G5 Test plans | Met | Strengthened: V-004-17 to V-004-19, V-020-5 |
| G6 Sign-off table | Prepared | Signatures need confirmation after a Go |

**The recommendation stays No-Go.** The shortest remaining path: (1) clarify the budget; (2) verify the remaining vendor facts; (3) decide the open mandatory DU items, most of which are "accept" recommendations; (4) either accept the legal assumptions explicitly as DRAFT with stated limits, or get counsel's view (G3 cannot be met while they are simply deferred); (5) signatories confirm in their own pull request approvals. Then the independent assessment is re-run.
