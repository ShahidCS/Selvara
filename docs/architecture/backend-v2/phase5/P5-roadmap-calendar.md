# Back-end v2, Phase 5: Roadmap and tracking calendar

| | |
|---|---|
| Status | **Tracking baseline** (2026-11-24). Built from the owner decisions OD-21 (full build, 3 engineer-equivalents, start 1 January 2027) and OD-22 (ISO plan dates as tracking dates). Planning dates, not commitments to customers. |
| Basis | Likely effort in [P5-effort-estimate.md](P5-effort-estimate.md) §2; release scope in 2K K-2 and K-2a; ISMS rows in 2G G-14. |
| Re-plan | **Mandatory after V2-R0** (2K K-M05, K-M07), using the measured effort. Every date after V2-R0 moves by the calibration factor (actual ÷ likely). |
| Budget | The engineering cost of this calendar is far above the recorded budget ceiling. See section 5 and decisions-log OD-21: **the budget figure needs the owner's clarification before V2-R0 starts.** |
| Note | ISMS, privacy and legal items are a **DRAFT** pending qualified compliance and legal review. |

## 1. Scheduling assumptions

| ID | Assumption |
|---|---|
| RM-01 | Work starts on Friday 1 January 2027 (owner date, OD-21). The first full working week starts on Monday 4 January 2027. |
| RM-02 | Three engineer-equivalents work full time (OD-21). V2-R0 and V2-R1 are hard to split, so they progress at about 2.5 engineer-equivalents (estimate §2.3 calendar guide). |
| RM-03 | After V2-R1 there are two streams. Stream A (two people) runs V2-R2, V2-R3 and V2-R4 in sequence. Stream B (one person) runs V2-R5, which depends only on V2-R1. |
| RM-04 | Each release ends with a one-week gate review (2K K-4): the technical reviewer, R-A or R-B, and R-DEP where four-eyes applies. |
| RM-05 | A two-week year-end break is assumed from 20 December 2027 to 2 January 2028. |
| RM-06 | V2-R6 includes a three-week external window for the penetration test and its retest. The test is booked at least 8 weeks ahead. |
| RM-07 | The "likely" effort column is used throughout. The "high" column adds about 60%. |

## 2. Release calendar

Status values: Not started, On track, At risk, Late, Done. Update the status at each gate and at the monthly review.

| Release | Effort (likely, pw) | Build start | Build end | Gate review (go / no-go) | Status |
|---|---|---|---|---|---|
| Pre-start: remaining owner actions (section 4) | n/a | 24 Nov 2026 | 31 Dec 2026 | 31 Dec 2026 | Not started |
| **V2-R0** Foundations | 35.5 | Mon 4 Jan 2027 | Fri 9 Apr 2027 | **Fri 16 Apr 2027** | Not started |
| Re-plan with measured effort (K-M05, K-M07) | n/a | Mon 19 Apr 2027 | Fri 23 Apr 2027 | Fri 23 Apr 2027 | Not started |
| **V2-R1** Identity and tenancy | 24.5 | Mon 19 Apr 2027 | Fri 25 Jun 2027 | **Fri 2 Jul 2027** | Not started |
| **V2-R2** Core assurance (stream A) | 21 | Mon 5 Jul 2027 | Fri 10 Sep 2027 | **Fri 17 Sep 2027** | Not started |
| **V2-R5** Commercial and integrations (stream B) | 17.5 | Mon 5 Jul 2027 | Fri 29 Oct 2027 | **Fri 5 Nov 2027** | Not started |
| **V2-R3** Risk and third parties (stream A) | 16 | Mon 20 Sep 2027 | Fri 12 Nov 2027 | **Fri 19 Nov 2027** | Not started |
| **V2-R4** Privacy (stream A; includes the year-end break) | 12.5 | Mon 22 Nov 2027 | Fri 21 Jan 2028 | **Fri 28 Jan 2028** | Not started |
| **V2-R6** Cutover (parity, pen test and retest, DR drill) | 9 | Mon 31 Jan 2028 | Fri 10 Mar 2028 | **Fri 17 Mar 2028** | Not started |
| Cutover to v2 (2K V2-R6) | n/a | Mon 20 Mar 2028 | Mon 20 Mar 2028 | n/a | Not started |

The build takes about 62 weeks from the first working day to the cutover gate. With the "high" effort it would take about 95 weeks, ending around early 2029.

## 3. Milestones to track

| Date | Milestone | Owner | Source |
|---|---|---|---|
| By 31 Dec 2026 | Remaining vendor facts verified (VC-01, VC-03 to VC-12, VC-15, VC-17, VC-18, VC-20, VC-23 to VC-34); VC-22 region check | R-B | OD-14 |
| By 31 Dec 2026 | Budget clarified (section 5); DU-04 (cloud provider) and DU-06 (observability and email vendors) decided | R-A, R-B | OD-21, decisions-log |
| By 31 Dec 2026 | Technical reviewer engaged on the recorded terms (OD-12) | R-A | 2K K-M06 |
| Fri 16 Apr 2027 | First KS-SNAP restore drill with the combined holder and R-DEP (V-021-05); first isolation suite green | R-B, R-DEP | 2H H-KS-12, 2F F-IT |
| Fri 16 Apr 2027 | Timed test restore into a new project; measured RTO recorded (VC-16 follow-up) | R-B | assumptions-log VC-16 |
| Monthly from Jan 2027 | Independent review of the platform audit log while combined-role mode is on | Technical reviewer or R-D | ADR-021 decision 5 |
| By Fri 19 Nov 2027 | Penetration test booked (at least 8 weeks ahead of the V2-R6 window) | R-B | RM-06 |
| By Fri 28 Jan 2028 | Counsel review of the legal assumptions for the first market (RA2-04, deferred by OD-24) | R-A | OD-24 |
| Fri 17 Mar 2028 | DR drill passed; pen-test findings closed or accepted; parity signed | R-A, R-B | 2K V2-R6 |
| Mon 20 Mar 2028 | Cutover; combined-role mode ended or R-66 re-accepted (ADR-021 decision 7) | R-A | ADR-021 |

## 4. ISMS (ISO 27001 and 27701) tracking dates

Each G-14 row is due at the gate of its target release (2K K-M08). Rows marked ★ are priority rows. Owners are as in 2G G-14.

| Due (gate) | G-14 rows due |
|---|---|
| **Fri 16 Apr 2027** (V2-R0) | Clauses 4 and 5; Annex A 5.1 ★, 5.2, 5.8, 5.9, 5.10, 5.12, 5.19 ★ (core providers), 5.20 ★ (Supabase, Vercel, cloud provider), 5.23, 5.24 ★ (draft), 5.30 ★ (first drill), 6.1, 6.2, 6.3 ★, 6.6, 6.7, 7.7, 7.9, 7.10, 8.1 ★, 8.9, 8.13, 8.20, 8.22, 8.23, 8.30 ★ (before the first V2 merge, so by 4 Jan 2027); 27701 G-27701-01 |
| **Fri 2 Jul 2027** (V2-R1) | Clauses 6 and 7; Annex A 5.4, 5.7, 5.25 ★, 6.5, 8.11, 8.18; 27701 G-27701-04 |
| **Fri 17 Sep 2027** (V2-R2) | Clause 10; Annex A 5.13, 5.27 ★, 5.36 |
| **Fri 28 Jan 2028** (V2-R4) | Annex A 5.5, 5.31, 5.33, 5.34 (LIAs and notice), 8.10; 27701 G-27701-03, -05, -06; 27701-MAP (draft) |
| **Fri 17 Mar 2028** (V2-R6) | Clause 8; clause 9 management review; Statement of Applicability (draft); Annex A 5.11, 5.20 ★ (all providers), 5.22, 5.24 ★ (tested), 5.26 ★, 5.29, 5.30 ★ (DR drill), 5.34 (DPO and representatives), 5.35 (pen test), 5.37, 6.8, 7.14, 8.6, 8.12, 8.14, 8.34; 27701 G-27701-10 |
| **Fri 30 Jun 2028** (pre-certification) | Clause 9 internal audit by the outsourced internal auditor R-D; Annex A 5.6, 6.4, 5.35 (internal audit); 27701 G-27701-02 |
| **Fri 28 Jul 2028** (pre-certification) | Statement of Applicability (final, approved by R-A); 27701-MAP (final) |
| **Fri 29 Sep 2028** (target) | ISO 27001 stage 1 audit, about 6 months after cutover (Q-17 allows 6 to 36 months) |
| **Fri 24 Nov 2028** (target) | ISO 27001 stage 2 audit; the 27701 extension is optional |

The certification dates are targets. If no customer or tender asks for ISO 27001 by the V2-R6 gate, the owner may move stage 1 to about 12 months after cutover (around March 2029). Risk R-49a tracks the case where the documents fall behind.

## 5. Cost tracking against the recorded budget

The rate is the owner's figure of USD 15 an hour (OD-21). One person-week is 40 hours, so USD 600.

| Release | Likely effort (pw) | Engineering cost at USD 15/h (likely) | Cumulative |
|---|---|---|---|
| V2-R0 | 35.5 | USD 21,300 | USD 21,300 |
| V2-R1 | 24.5 | USD 14,700 | USD 36,000 |
| V2-R2 | 21 | USD 12,600 | USD 48,600 |
| V2-R5 | 17.5 | USD 10,500 | USD 59,100 |
| V2-R3 | 16 | USD 9,600 | USD 68,700 |
| V2-R4 | 12.5 | USD 7,500 | USD 76,200 |
| V2-R6 | 9 | USD 5,400 | USD 81,600 |

| Other likely costs *(verify; planning ranges, not quotes)* | Amount |
|---|---|
| Technical reviewer, 377 h (at USD 15/h if the same rate applies) | USD 5,655 |
| Infrastructure during the build, about USD 850 a month for about 15 months, plus PITR from the first external tenant (DU-02) | about USD 13,000 |
| Penetration test with one retest | about USD 25,000 |
| Outsourced internal auditor (pre-certification) | about USD 10,000 |
| Legal reviews (deferred, OD-24) | about USD 35,000 when commissioned |
| ISO 27001 certification audit (after cutover) | about USD 25,000 |

**Likely total to cutover, excluding legal and certification: about USD 135,000.** The recorded ceiling is USD 5,000. That covers about 2.8 weeks of the 3-person team at USD 15 an hour (USD 1,800 a week). Stop trigger K-M07(c) ("projected spend exceeds 80% of the ceiling before V2-R3") therefore fires before work starts. The owner is asked to confirm what the USD 5,000 covers (OD-21, open query).

## 6. How to keep this calendar

- Update the Status column at each gate, and record slips in the Gate review column as "planned → actual".
- At the V2-R0 re-plan, recompute every later date with the calibration factor and record it as revision 2 of this file.
- A slip of more than 2× on V2-R0 is stop trigger K-M07(a), and leads to an owner decision.
