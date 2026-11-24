# Back-end v2, Phase 5: Readiness gate

| | |
|---|---|
| Status | **Recommendation: No-Go** (2026-11-24) |
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
| Technical approver (contracted reviewer, OD-12) | `<name>` | Design conformance; router, keys and authorisation design; tests and migrations plan | | | | |
| Security approver (R-B, CISO) | `<name>` | Threat model, isolation (incl. C1-01 / R-02 residual, ISO-HARD), keys (KS-SNAP), ASVS L2 plan | R-02 re-confirmed (OD-15); residual Medium items | | | |
| Management approver (R-A, Management Approver) | `<name>` | Scope, budget, dates, stop criteria (K-M07), SLA, commercial decisions | | | | |
| Compliance and legal reviewer | `<name or firm>` | Privacy (RoPA, DPIA, retention, transfers), DPA, ISO 27001 and 27701 plan | DRAFT items accepted pending counsel, if any | | | |
| Deputy approver (P4-A3-19) | `<name>` | Stands in for R-A or R-B in four-eyes actions and key-store recovery | | | | |

Next review date: at each release gate (2K K-4), and before cutover (V2-R6).
