# Phase 5 re-assessment: Selvara back-end v2 (after the documentation pass and the sign-off commit)

| | |
|---|---|
| Date | 2026-11-24 |
| Assessor | Independent readiness assessor (did not write the design, the fixes or the documentation pass). Read-only on the repository. |
| Inputs | `phase5/00-readiness-gate.md` at HEAD `c2913da` ("Update 00-readiness-gate.md"); the previous assessment `phase5/P5-readiness-evidence.md`; `decisions-log.md`, `assumptions-log.md`, `risks.md`, `open-questions.md`, `00-discovery-summary.md` §4, ADR-001 to ADR-020, `phase2/2D`, `2F`, `2H`, `2K`, `phase4/00-phase4-summary.md`, `phase5/P5-effort-estimate.md`, `docs/security/SOD_MATRIX.md`. |
| Privacy | People are referred to by role only. |
| Note | Compliance content is a draft pending qualified legal and compliance review. |

## 0. Verdict

| Gate | Criterion | Verdict |
|---|---|---|
| G1 | No open Critical or High | **Not met** (1 Critical and 7 High still open pending owner action; 1 new Critical and 2 new High raised below) |
| G2 | All mandatory MVP decisions made and recorded as Accepted ADRs | **Not met** (ADR-002 to ADR-013 and ADR-015 to ADR-020 all Proposed; DU-37 Open) |
| G3 | High-impact assumptions validated or explicitly accepted | **Not met** (no VC result recorded; legal HI assumptions still Open; A-08 now contradicted) |
| G4 | No Missing coverage | **Met** (unchanged; the 2K caveat is closed by K-2a and K-M08) |
| G5 | Provisioning, isolation, migration, single-tenant restore designed with test plans | **Met** (unchanged; provisioning tests still thin) |
| G6 | Sign-off table prepared and valid | **Not met** (prepared, but the signatures are invalid: signed against a No-Go, precondition unmet, R-A and R-B held by one person) |

**Overall: No-Go.** The sign-off does not change the gate. It closes no Critical or High finding outright and introduces a Critical separation-of-duties defect. It should be treated as void and re-signed only after the items in section 5.

## 1. What the HEAD commit changed

`git diff 716350d HEAD --stat`: one file, `phase5/00-readiness-gate.md`, 5 lines. Only the section 3 sign-off table changed: all five rows (technical, security R-B, management R-A, compliance and legal, deputy R-DEP) marked "Go", dated 24-11-2026. Nothing else in the repository changed: no decisions-log row, no assumptions-log status, no VC result, no ADR status, no SOD_MATRIX entry, no effort-estimate owner field.

Observations on the commit itself:
- It was committed through the GitHub web editor directly on `main` (committer "GitHub", contained in `origin/main`, no pull request). The repository convention is "Do not push to `main`".
- The same account entered all five rows, including the "Signature" column of the three other signatories. The signature column is typed text; there is no evidence that the technical reviewer, the compliance and legal reviewer or the deputy assented themselves (no review, comment, separate commit or signed record).
- Section 1 of the same file still says "Recommendation: No-Go", and section 4 still says "The recommendation stays No-Go" and "Signatures pending". The table header says: "Sign only when section 2 is complete and the re-assessment recommends Go." Neither condition held when it was signed.

## 2. The R-A / R-B same-person issue

### 2.1 Evidence that one person holds both roles

- Security approver (R-B, CISO) row: Name = a given name; Signature = the same given name.
- Management approver (R-A) row: Name = the same given name followed by a surname initial; Signature = the same given name, identical text to the R-B row.
- The commit author account carries the same given name.
- There is no second person's record anywhere (SOD_MATRIX, discovery §4, decisions-log) that would distinguish two holders.

Conclusion: on the evidence in the repository, R-A and R-B are held by **one person**. If they are in fact two different people with the same given name, that must be recorded unambiguously (full role holder record in SOD_MATRIX, distinct signatures, distinct identities), and the finding below drops away. Until then it stands.

### 2.2 Why this breaks the design

| Design element | What it requires | Effect of one person holding R-A and R-B |
|---|---|---|
| Discovery §4 (OQ-01) | "Four-eyes approval needs two different people." R-A "Person 1", R-B "Person 2"; "R-A and R-B approve each other's requests; neither can approve their own." | The minimum-people model is not met. |
| A-08 "Two people hold R-A and R-B" | Marked **Validated** via OQ-12 ("Confirm that two people will hold the roles R-A and R-B ... Four-eyes approval cannot work with one person": Resolved, confirmed) | The sign-off contradicts a validated assumption. A-08 and OQ-12 must reopen. |
| 2D D-58 (single deletion-approval rule) | Two different people, one `management_approver` and one `ciso`; no person casts two votes | One person cannot satisfy it alone. The only second person is R-DEP, who may stand in only for an absent principal and "never in an approval where the person they stand in for has already voted or is the requester". When the combined R-A/R-B person requests or votes, R-DEP cannot stand in for either capacity, because the person stood in for has voted. Strictly applied, every tenant deletion deadlocks; loosely applied, the deputy becomes a permanent second approver and the deputy rule is meaningless. |
| ADR-015 (approval engine) points 4 and 7, V-015-3; dual-role platform kinds (e.g. D-P04) | One `management_approver` and one `ciso` among requester and voters, from two distinct people; deputy counted for one capacity only and only for an absent principal | Same deadlock or degeneration for every dual-role platform kind: tenant deletion, provider activation, `ks` restore, trial policy. ADR-015 line 53 already notes that collusion between the two approvers is not engine-preventable; with one person, there is nobody to collude with: four-eyes becomes two-eyes plus a contractor. |
| 2F F-K-42 / F-K-48 and 2H H-KS-02 / H-KS-12 (`ks` recovery) | `ks-restore` assumable only with hardware-key MFA "by two different people covering both roles, R-A and R-B", R-DEP "may stand in for either one but never both" | The Critical P4-A1-07 recovery path now always needs R-DEP, and R-DEP must "stand in" for a principal who is present, contrary to F-K-48 ("why the principal was unavailable"; "the absent principal reviews it"). If R-DEP is unreachable, `ks` cannot be restored and the 4 h S1 RTO (A-NFR-19) fails; if the R-A/R-B holder is unreachable, it also fails. The single-point-of-failure that re-rated P4-A3-19 to High is reintroduced, worse. |
| SOD_MATRIX ("Never self-approve") and organisation policy | Separate technical, security and management review | Security and management approval of the gate itself were given by one person: the gate has two independent approvals (technical, compliance) plus one person signing twice, not three. |
| ISO 27001 role separation (2G G-14, K-M08: R-A ISMS owner, R-B security reviewer) | Assigned responsibilities and independent challenge | The ISMS owner reviews their own security decisions. |
| R-C break-glass custodian | "R-A or R-B, with the other reviewing" | No "other" to review. |
| R-G DPO (if R-B) | Independence from management decisions | Likely conflict of interest (legal to confirm). |

### 2.3 Options (owner decision; the DA then updates the design)

1. Appoint a second, different person as R-A or R-B and re-sign. This is the design as written.
2. If only one founder exists, redesign formally: make the deputy a permanent second approver (rename the role, remove the "absent principal" clauses from F-K-48, H-KS-12, ADR-015 point 7, D-58 and discovery §4), record that the contractor holds one capacity permanently, record the risk (R-03, R-38) and re-run this assessment. This is a design change, not a signature, and needs an ADR.

## 3. Gate criteria in detail

### G1: No open Critical or High findings. **Not met.**

| Finding | Sev | Status now | Does the sign-off close it? |
|---|---|---|---|
| P4-A1-07 Key-store loss | Critical | Open-owner action | **No.** Ratification of KS-SNAP (H-DR-H; called H-DR-DEP in decisions-log) is not recorded. A table signature labelled "Accepted" is not the ratification decision the register asks for. The recovery path it ratifies is also broken by RA2-01. |
| P4-A1-08 DR depends on unverified vendor facts | High | Open-owner action | **No.** The "Result (owner)" column for VC-23 to VC-34 is empty; P3-X3 VC-01 to VC-22 have no results. DU-02 is "Recommended ... owner to ratify". H-DR-G is in "Owner decisions pending". |
| P4-A3-12 ISO gaps without remediation dates | High | Open-owner action | **No.** G-14 dates follow OD-13 dates, which are not recorded. |
| P4-A3-14 SLA not costed or backed | High | Open-owner action | **No.** VC-13 unverified; H-DR-I "decided in principle"; ADR-020 Proposed. |
| P4-A3-17 MVP feasibility | High | Open-owner action | **No.** `P5-effort-estimate.md` §6: every owner field (budget ceiling, scope choice, staffing, all seven release dates, R-05) is still `<owner to fill>`. R-05 Open. |
| P4-A3-18 No technical approver | High | Open-owner action | **Partly.** A person is named in the technical row. Not closed: OD-12 not marked carried out; SOD_MATRIX and discovery §4 do not record the role, independence from AI tooling, scope, SLA, budget or competence (requested in the previous evidence §9 item 4). Their signature was entered by another account. Closes when recorded and self-attested. |
| P4-A3-19 Two-person operating load (re-rated High) | High | Open-owner action | **No; made worse.** A deputy is named, but the delegation is not in SOD_MATRIX, and with R-A = R-B the deputy is no longer a deputy but the only second person (RA2-01). |
| RA-01 KS-SNAP keep-newest | High | Closed in design | Unaffected; awaits ratification with H-DR-H. |
| P4-A1-01, P4-A2-01, P4-A3-01, P4-A3-08 | High | Closed (design / owner acceptance) | Unchanged. Note: OD-15 (the P4-A1-01 acceptance) and the R-02 re-confirmation in the R-B row were given by the same person who holds R-A; the CISO's independent concurrence, already questioned in the previous evidence §6 point 3, is still not independent. |

New findings from this re-assessment:

| ID | Finding | Severity | Owner |
|---|---|---|---|
| RA2-01 | R-A and R-B are held by one person (section 2). Contradicts validated A-08 / OQ-12 and discovery §4; four-eyes approval (D-58, ADR-015 dual-role kinds) either deadlocks or collapses to one person plus a contractor; `ks` recovery (F-K-42/48, H-KS-02/12) depends on R-DEP always being available, reopening the single point of failure behind P4-A3-19 and the Critical P4-A1-07 recovery. | **Critical** | Owner (appoint a second person or commission a redesign); DA (reopen A-08, OQ-12, R-03, R-38; update design if option 2) |
| RA2-02 | Sign-off given against a standing No-Go and before section 2 was complete, contrary to the table's own precondition; sections 1 and 4 of the same file still say No-Go and "Signatures pending". The gate record is internally contradictory and could be read as an approval to start V2-R0. | **High** | Owner |
| RA2-03 | Signatures lack provenance: all five rows (including three other people's signatures) typed by one account, committed directly to `main` without a pull request or review. No evidence of each signatory's own assent; "Accepted" / "Approved" with no conditions or residual items listed in three rows. | **High** | Owner |
| RA2-04 | Compliance and legal row: "DRAFT items accepted" by a named individual with no firm, qualification or scope stated, no list of which DRAFT items, no market-by-market sales restriction, no dates. `assumptions-log.md` A-10, A-14, A-52 (and A-33, A-53, A-54) are unchanged "Open". | Medium | Owner and the compliance and legal reviewer |
| RA2-05 | ID mismatch: the gate (sections 2 and 4) and the evidence say "H-DR-H"; `decisions-log.md` calls the same decision "H-DR-DEP"; 2H has neither. | Low | DA |
| RA2-06 | 2D D-58 says "the deputy approver **R-D** may act for either"; R-D is the internal auditor; the deputy is R-DEP. An auditor acting as approver would break auditor independence. | Low (text), must fix | DA |

### G2: Mandatory MVP decisions made and recorded as Accepted ADRs. **Not met.**

- ADR statuses at HEAD: ADR-001 Accepted; ADR-014 Accepted; ADR-002 to ADR-013 Proposed; ADR-015 to ADR-020 Proposed ("Owner acceptance pending, together with DU-37").
- `decisions-log.md` DU-37: "Open (owner)".
- Mandatory DUs: no change since the previous evidence §2.1 apart from DA-side records (DU-35 superseded by OQ-23 into ADR-020, Proposed; DU-02 "Recommended"). The owner decided none in the register.
- The R-A "Accepted" signature with scope "Scope, budget, dates, stop criteria, SLA, commercial decisions" does not accept any ADR by ID and records no figures. A signature is not an ADR status change. DU-37 also needs "R-A + R-B": with one person, this is not a two-person acceptance.

### G3: High-impact assumptions validated or explicitly accepted. **Not met.**

- VC results: none recorded (VC-01 to VC-22 in P3-X3; VC-23 to VC-34 in `assumptions-log.md`, Result column empty). OD-14 required this "before the Phase 5 gate".
- HI assumptions still Open: A-07, A-09, A-10, A-11, A-13, A-14, A-15, A-16, A-17, A-20, A-23, A-26, A-28, A-37, A-41, A-45, A-46, A-47, A-48, A-51, A-52, A-62, A-63 (A-24 now Closed by OQ-22; A-05 owner-accepted, legal pending).
- Legal HI assumptions: the compliance row "DRAFT items accepted" is **not** the explicit acceptance asked for (gate item 8 / evidence §9 item 11: owner acceptance as DRAFT, pending counsel, with dates and a market-by-market sales restriction). At most it is evidence that a reviewer saw the drafts. Not closed (RA2-04).
- A-08 (two people hold R-A and R-B), currently "Validated", is contradicted by the sign-off and must reopen (RA2-01).

### G4: No Missing coverage. **Met.**

Unchanged. The earlier caveat (Phase 4 additions not in 2K) is addressed by 2K K-2a and K-M08 (rev P5).

### G5: Provisioning, isolation, migration, single-tenant restore designed with test plans. **Met.**

Unchanged. Caveat: provisioning tests remain thin (no J-PRV group). The `ks` restore drill design (F-K-45, J-KSS) assumes R-DEP stands in for an *absent* approver at least yearly; with RA2-01, every drill and every real restore needs R-DEP, which the test plan does not reflect.

### G6: Sign-off table prepared and valid. **Not met.**

- Prepared: yes (template with five rows, scopes, conditions, next review date).
- Valid: no. (1) Signed while the recommendation was No-Go and section 2 incomplete (RA2-02). (2) Security and management approvals by one person, so the required separation between security and management approval is absent (RA2-01). (3) No provenance for the other signatures (RA2-03). (4) Three rows record "Accepted"/"Approved" with no conditions or residual items; the R-B row lists "residual Medium items" without naming F-AB-16, F-T-122, F-T-130, which are still "pending owner acceptance". (5) Technical reviewer and deputy not recorded in SOD_MATRIX (protected file; owner action).

## 4. Owner actions from gate section 4: recorded anywhere?

| # | Owner action | Recorded in the repository? | Evidence |
|---|---|---|---|
| 1 | Ratify H-DR-H and H-DR-G; decide DU-02 | **No** | decisions-log "Owner decisions pending at the Phase 5 gate" still lists H-DR-E (DU-02), H-DR-G, H-DR-DEP; DU-02 "Recommended ... owner to ratify". |
| 2 | Verify VC-01 to VC-34 (OD-14) | **No** | Result columns empty (assumptions-log VC-23 to VC-34; P3-X3 VC-01 to VC-22). |
| 3 | Appoint the technical reviewer (OD-12) | **Partly** (name in sign-off table only) | OD-12 row unchanged; SOD_MATRIX and discovery §4 have no technical-reviewer entry. |
| 4 | Appoint R-DEP (P4-A3-19) | **Partly** (name in sign-off table only) | decisions-log "Deputy approver (R-DEP) ... Appoint before the first external tenant" still pending; SOD_MATRIX has no R-DEP entry. |
| 5 | Budget ceiling and per-release dates (OD-13); R-05 | **No** | `P5-effort-estimate.md` §6 all `<owner to fill>`; R-05 Open. |
| 6 | ISO plan dates (G-14) and SLA figure after VC-13 | **No** | G-14 dates follow K-M07 (unset); H-DR-I "decided in principle"; VC-13 unverified. |
| 7 | Decide remaining mandatory DUs; accept ADR-002 to ADR-020; accept F-AB-16, F-T-122, F-T-130 | **No** | ADRs Proposed; DU-37 Open; P4-A2-03 Open-owner action. |
| 8 | Counsel's view on legal assumptions, or explicit DRAFT acceptance with market restrictions | **No** (weak partial evidence only) | Compliance row text only; A-10, A-14, A-52 Open; no restriction or dates. |
| 9 | Sign the sign-off table | **Done, but invalid** | See G6. |

## 5. What remains, in order, and who does it

| # | Item | Who |
|---|---|---|
| 1 | Resolve RA2-01: appoint a second, different person as R-A or R-B (preferred), or commission a formal redesign that makes the contractor a permanent second approver (ADR, update D-58, ADR-015 point 7, F-K-48, H-KS-12, discovery §4). Reopen A-08 and OQ-12 until done. | Owner (R-A); DA for the redesign or register updates |
| 2 | Void the current sign-off (mark the section 3 rows "withdrawn, signed before Go") so the gate record is not read as an approval. | Owner |
| 3 | Record the technical reviewer (OD-12) and the deputy R-DEP in SOD_MATRIX (protected; owner approves) with role, period, independence, competence, scope, SLA and budget. Closes P4-A3-18; P4-A3-19 only once item 1 is resolved. | Owner; DA drafts |
| 4 | Ratify H-DR-H (fix the ID mismatch with H-DR-DEP first, RA2-05) and H-DR-G; decide DU-02. Record in decisions-log, by two different people. | DA (ID), then R-A and R-B |
| 5 | Verify VC-01 to VC-34 and fill the Result column with source and date; apply H-9.4 fallbacks where a fact fails. Gate priority VC-02, 13, 14, 16, 19, 21, 22, then 23 to 29. | Owner (OD-14); technical reviewer can assist |
| 6 | Fill `P5-effort-estimate.md` §6 (budget ceiling, scope, dates); accept or treat R-05; then G-14 dates. | R-A |
| 7 | Confirm the SLA figure after VC-13 (H-DR-I). | R-A |
| 8 | Decide the remaining mandatory DUs; carry out DU-37 (ADR-002 to ADR-013, ADR-015 to ADR-020 to Accepted, with date and the two approvers); accept F-AB-16, F-T-122, F-T-130. | R-A and R-B (two different people) |
| 9 | Legal assumptions: counsel's written view, or an explicit owner acceptance as DRAFT naming the items (A-05, A-10, A-14, A-52; DU-20 to DU-27), the reviewer's qualification or firm, dates and a market-by-market sales restriction; update assumptions-log statuses. | Owner + compliance and legal reviewer |
| 10 | Fix D-58 "R-D" to "R-DEP" (RA2-06) and the H-DR-H / H-DR-DEP naming (RA2-05). | DA |
| 11 | Re-run the independent readiness assessment. | Independent assessor |
| 12 | Only after a Go: each signatory signs their own row (own commit, PR review or signed record), through a pull request, not a direct push to `main`, listing conditions and residual items by ID. | Technical reviewer, R-B, R-A, compliance and legal reviewer, R-DEP |

## 6. Bottom line

The documentation pass did its part; the design-authority items are done and G4 and G5 hold. G1, G2, G3 and G6 still fail because none of the owner actions are recorded, and the sign-off itself adds one Critical and two High findings. The single most important item is that R-A and R-B must be two different people (or the design must be formally changed to say they are not). Recommendation: **No-Go**; no conditional Go is supportable while a Critical is open and four-eyes rests on one person.
