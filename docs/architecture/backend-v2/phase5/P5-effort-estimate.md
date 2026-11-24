# Back-end v2, Phase 5: Bottom-up effort estimate and minimum sellable subset

| | |
|---|---|
| Status | **Planning estimate, not a commitment** (rev P5, 2026-11-24). Design-authority deliverable for Phase 5 gate item 6 (P4-A3-17). |
| Purpose | Gives the owner a basis for recording the budget ceiling and per-release target dates (OD-13, 2K K-M07). The owner fills the fields in section 6. |
| Basis | Scope of 2K K-2 as revised in rev P5 (including the Phase 4 additions in K-2a), the endpoint catalogue in 2C (about 400 endpoint rows), the data model in 2B, the test catalogue in 2J, the cost model in 2H H-11. |
| Not a quote | No vendor, tester, counsel or auditor was asked for a price. Every external figure is a planning range *(verify)* to be replaced by quotes. |
| Note | Compliance-related work (ISMS, privacy, legal reviews) is a **DRAFT** pending qualified legal and compliance review. |

## 1. Units and assumptions

| ID | Assumption | Effect on the numbers |
|---|---|---|
| P5-E-01 | **Engineering person-week (pw):** one week of one engineer-equivalent who directs AI-assisted engineering, reviews and integrates its output, runs the suites and fixes failures. It is not a week of unassisted hand coding. | All engineering figures are in pw. |
| P5-E-02 | Throughput of AI-assisted engineering on this design is **unmeasured** (A-K1). The ranges are wide for that reason. "Likely" assumes an endpoint with its validation, rule, audit entry, contract test and authorization cases takes 0.15 to 0.3 pw, and infrastructure items are estimated one by one. | V2-R0 is the calibration point: after it, K-M05 re-plans using measured effort (actual ÷ likely = calibration factor applied to V2-R1 to V2-R6). |
| P5-E-03 | **Low** = everything works first time and vendor facts verify (OD-14). **Likely** = normal rework and one failed vendor fact handled by its H-9.4 fallback. **High** = several fallbacks apply, the isolation or KS-SNAP drills need repeated fixes, and the pen test returns material findings. | The ranges are not statistical confidence intervals. |
| P5-E-04 | Reviewer hours are for the contracted technical reviewer (K-M06, OD-12): about 4 h per pw of security-sensitive code (V2-R0), 3 h per pw for identity (V2-R1) and cutover (V2-R6), and 2 h per pw elsewhere. | Rate per hour is an owner field. |
| P5-E-05 | Approver hours are for R-A, R-B and the deputy approver R-DEP together: gate reviews, drills, four-eyes actions, parity sign-off, DPIA and ISMS work. | These people are unpaid by the project only if the owner says so; otherwise apply a rate. |
| P5-E-06 | Reference content (25 frameworks, OD-09 paraphrases) is written with AI assistance and reviewed by R-B; legal review of the paraphrase position is DU-25 (counsel). | Content effort sits in V2-R2. |
| P5-E-07 | No live data (Q-01), so there is no data migration effort; cutover is a configuration switch (2K V2-R6). | V2-R6 is small in engineering, large in external review. |

## 2. Engineering effort per release (pw)

### 2.1 V2-R0 Foundations (itemised)

| Item | Scope reference | Low | Likely | High |
|---|---|---|---|---|
| Accounts, IaC and environments (`cp`, `c1`, `ks`, `offsite-prod`, KMS, staging) | 2H H-AC, H-CI-06 | 2 | 3 | 5 |
| Router, roles, sessions, R-56 controls, ISO-HARD a to d (`keysvc`, `storagebroker`, tenant-mismatch detector) | ADR-002, 2F F-ISO-06, F-4.5 | 3 | 5 | 8 |
| Key store, key provider, envelope encryption of E1/E2 fields and files | ADR-003, 2F F-7 | 2 | 3.5 | 6 |
| `ks` standby, key journal, **KS-SNAP** with the keep-newest hold and deputy roles, drill | 2F F-7.5, 2H H-9.1a | 1.5 | 2.5 | 4 |
| Migration orchestrator, drift report, fleet observer | ADR-009, 2H H-8 | 2 | 3 | 5 |
| Provisioning, suspension, deletion with certificate, **FINAL-EXPORT** engine (D-12b) | 2D D-12, D-12b, D-12e | 2.5 | 4 | 6 |
| Audit log, hash chain, anchoring to WORM, **J-AUD** generator | ADR-013, 2J J-3.3 | 1.5 | 2.5 | 4 |
| Malware scanner and quarantine flow | ADR-012 | 1 | 1.5 | 3 |
| Backups, single-tenant restore paths A and B, restore and shred drills | ADR-004, 2H H-RS | 2 | 3 | 5 |
| CI gates, proposed workflows, isolation suite F-IT-01 to F-IT-39 and F-IT-100 to F-IT-106 | 2H H-CI, 2F F-4.3, F-SD-01 | 2 | 3 | 5 |
| Observability, alert routing, **SLA-U** probes and calculator | 2H H-OB, H-AL, 2J J-SLA | 1 | 1.5 | 2.5 |
| Admin Console migrations and keys screens, synthetic seed | 2C C-PL-21, C-PL-22 | 1 | 1.5 | 2.5 |
| Load tests (CR-1 knee, `cp`) | 2J J-PERF, DA-10, DA-12 | 0.5 | 1 | 2 |
| **Total V2-R0** | | **22** | **35.5** | **58** |

### 2.2 V2-R1 to V2-R6 (by component group)

| Release | Component groups (low / likely / high pw) | Low | Likely | High |
|---|---|---|---|---|
| V2-R1 Identity and tenancy | Account, MFA, passkeys, recovery (3/4/6); memberships, tenant and platform roles (2/3/5); approval engine, delegation, elevation, support access (2.5/4/6); SAML/OIDC and SCIM (3/4.5/7); tenant settings (1/1.5/2.5); help desk M24 (0.5/1/1.5); Admin Console screens (2/3/4.5); **D-80a** `auth` purge and J-AUTHER (0.5/1/1.5); FINAL-EXPORT tenant endpoints C-M01-23 to C-M01-26 (0.5/1/1.5); authorization-suite generator (1/1.5/2.5) | 16 | 24.5 | 38 |
| V2-R2 Core assurance | `ref` releases and upgrade (2/3/5); frameworks, controls, tests (2/3/4.5); evidence and files (1.5/2.5/4); policies (1.5/2/3); issues (0.5/1/1.5); audits with auditor scope (1.5/2.5/4); reports, overview, My Work (1/1.5/2.5); reference content for 25 frameworks (2/4/7); AS parity suite (1/1.5/2.5) | 13 | 21 | 34 |
| V2-R3 Risk and third parties | Risk, both ISO 27005 methods (2/3/4.5); vendors and vendor portal (2/3/4.5); questionnaires (1/1.5/2.5); Trust Center and public API (1.5/2.5/4); commitments and incidents (1/1.5/2.5); people and access (1/1.5/2.5); AI governance (1/1.5/2.5); RK parity and exposure tests (1/1.5/2.5) | 10.5 | 16 | 25.5 |
| V2-R4 Privacy | RoPA (1/1.5/2.5); DPIA (1/1.5/2.5); DSAR with deadline clock and erasure reaching every `ks` copy (2/3/5); retention rules, purge and legal holds (1.5/2.5/4); automation rules (1/1.5/2.5); per-person notifications (1/1.5/2.5); Selvara RoPA and controller DSAR intake (0.5/1/1.5) | 8 | 12.5 | 20.5 |
| V2-R5 Commercial and integrations | Plans, entitlements, metering (2/3/5); trial policy (0.5/1/1.5); payment adapters, bank transfer and Stripe (1.5/2.5/4); company billing and SLA-U credits (1.5/2.5/4); integrations registry (1/2/3.5); API keys and webhooks (1.5/2/3); assistant and agents, AI provider abstraction (2/3/5); egress tests, providers and plans screens (1/1.5/2.5) | 11 | 17.5 | 28.5 |
| V2-R6 Cutover | Parity to 100% and gap fixes (2/3/5); pen-test remediation (1.5/3/6); DR drill, cutover and rollback rehearsal (1/1.5/2.5); ISMS evidence pack and SoA support (1/1.5/2.5) | 5.5 | 9 | 16 |

### 2.3 Totals

| Release | Engineering pw (low / likely / high) | Technical reviewer hours (low / likely / high) | Approver hours R-A, R-B, R-DEP (low / likely / high) |
|---|---|---|---|
| V2-R0 | 22 / 35.5 / 58 | 88 / 142 / 232 | 40 / 60 / 90 |
| V2-R1 | 16 / 24.5 / 38 | 48 / 74 / 114 | 25 / 40 / 60 |
| V2-R2 | 13 / 21 / 34 | 26 / 42 / 68 | 20 / 30 / 45 |
| V2-R3 | 10.5 / 16 / 25.5 | 21 / 32 / 51 | 20 / 30 / 45 |
| V2-R4 | 8 / 12.5 / 20.5 | 16 / 25 / 41 | 25 / 40 / 60 |
| V2-R5 | 11 / 17.5 / 28.5 | 22 / 35 / 57 | 20 / 30 / 45 |
| V2-R6 | 5.5 / 9 / 16 | 17 / 27 / 48 | 40 / 60 / 100 |
| ISMS work across releases (G-14, mainly R-A and R-B) | n/a | n/a | 80 / 150 / 250 |
| **Total** | **86 / 136 / 221** | **238 / 377 / 611** | **270 / 440 / 695** |

Calendar guide (not dates): with one engineer-equivalent full time, the likely figure is about 136 calendar weeks of build; with two, about 70 to 80 weeks, because V2-R5 can run in parallel with V2-R2 to V2-R4 (it depends only on V2-R1) but V2-R0 and V2-R1 cannot be split much. Add gate waits for reviewer and approver availability. The owner sets the dates (section 6).

## 3. External costs (USD, planning ranges *(verify)*)

| Item | When | Low | Likely | High | Basis |
|---|---|---|---|---|---|
| External penetration test, including one retest | V2-R6 | 15,000 | 25,000 | 45,000 | Web app, API, multi-tenant isolation scope; A-K2 |
| Legal reviews (OD-08; DU-20 to DU-27: retention, DPA, paraphrase position, transfers; Pakistan, UK, EU, UAE as sold) | Before V2-R4 exit and before selling in each market | 15,000 | 35,000 | 70,000 | Gate item 11; market-by-market |
| Contracted technical reviewer (K-M06) | Every release | hours in §2.3 × rate | | | Rate is an owner field |
| Deputy approver R-DEP retainer and on-call | From the first external tenant (P4-A3-19) | owner field | | | Includes drills (2H H-KS-12) |
| Outsourced internal auditor (ISO 27001 clause 9.2) | Pre-certification | 5,000 | 10,000 | 18,000 | G-14.1 Cl. 9 |
| ISO 27001 certification audit (stage 1 and 2; 27701 extension optional) | Pre-certification, after launch | 12,000 | 25,000 | 45,000 | Not in the minimum sellable subset |
| DPO and Art. 27 representatives, if required (DU-22, DU-23) | From the first EU or UK customer, per year | 3,000 | 8,000 | 15,000 | Only if counsel says they are needed |
| Infrastructure during build and before the first customer | From V2-R0 | about 430 per month | about 850 per month | about 1,430 per month | 2H H-PR-01 and H-C-25; low assumes staging-only until V2-R6 |
| AI-assisted engineering tooling | Whole build | owner field | | | Subscriptions and API usage |

These lines feed 2H H-C-27, which stays an owner estimate until quotes exist.

## 4. Minimum sellable subset (MSS)

The smallest product a regulated customer would buy: the assurance core, risk and third parties, and the privacy pieces a buyer's due diligence asks for first.

| In the MSS | Why |
|---|---|
| V2-R0 Foundations, complete | Isolation, keys, KS-SNAP, backups, restore, deletion with certificate and FINAL-EXPORT are what a regulated buyer's security review tests; none can be deferred. |
| V2-R1 Identity and tenancy, complete | SSO, MFA, roles and four-eyes are table stakes. |
| V2-R2 Core assurance, complete | The product itself. |
| V2-R3 Risk and third parties, complete | Risk register, vendors and the Trust Center are what buyers compare. |
| From V2-R4: per-tenant **RoPA**, **DSAR** with the deadline clock and erasure by crypto-shredding, Selvara's own RoPA and controller DSAR intake | Buyers ask for these in due diligence; erasure reaching backups is a GDPR evidence point. |
| From V2-R5: plans and entitlement enforcement, the standing trial policy, bank-transfer billing (`ENT-PK`, OD-01) | Needed to sell and to enforce plan limits on the server. |
| From V2-R6: pen test with findings closed or accepted, DR drill, parity for the MSS screens, cutover | Needed before any external tenant. |

| Moves after launch | Condition |
|---|---|
| DPIA module, automation rules, per-person notification preferences, tenant legal-holds module | Owner sign-off under K-M04 (parity), because OQ-09 kept demo-only features in scope; until moved, their screens stay out of the v2 navigation. |
| Stripe adapter, usage metering beyond seats and storage, company billing extras | OD-01 already defers Stripe until a Stripe-eligible entity exists. |
| Integrations registry, API keys and webhooks, assistant and agents | AI is off by default; integrations are configurable later. |
| ISO 27001 certification audit | Q-17 places it 6 to 36 months after launch. |

| MSS effort | Low | Likely | High |
|---|---|---|---|
| V2-R0 to V2-R3 | 61.5 | 97 | 155.5 |
| V2-R4 pieces (RoPA, DSAR, Selvara RoPA and intake) | 3.5 | 5.5 | 9 |
| V2-R5 pieces (plans and entitlements, trial policy, bank transfer) | 3.5 | 5.5 | 9 |
| V2-R6 for the MSS (parity, pen-test remediation, DR drill, cutover) | 4.5 | 7 | 12.5 |
| **MSS total (pw)** | **73** | **115** | **186** |

The MSS saves about 15% of the likely engineering effort, not more, because V2-R0 and V2-R1 dominate and cannot be cut. Its main value is an earlier first sale and a smaller pen-test and legal scope for launch. K-M07 trigger (c) (projected spend over 80% of the ceiling before V2-R3) should lead to the MSS rather than to a stop, if the owner agrees.

## 5. Risks to the estimate

| Risk | Effect | Reference |
|---|---|---|
| AI-assisted throughput is lower than assumed | Every figure scales; V2-R0 measures it | A-K1, R-05, K-M05 |
| Vendor facts fail (OD-14) | Fallbacks in 2H H-9.4 add work, mainly to V2-R0 | P4-A1-08 |
| Reviewer or approver availability | Gates wait; calendar grows, effort does not | R-03, P4-A3-18, P4-A3-19 |
| Legal outcomes change retention or the paraphrase position | Rework in V2-R2 (content) and V2-R4 (retention) | DU-21, DU-25 |
| Pen test finds isolation or key issues | High end of V2-R6 | F-SD-10 |

## 6. Owner fields (OD-13; recorded 2026-11-24 as OD-21, rev P5b)

Dates are derived from the owner's start date and staffing in [P5-roadmap-calendar.md](P5-roadmap-calendar.md).

| Field | Value | Recorded by | Date |
|---|---|---|---|
| Budget ceiling (people, vendors, external review, pen test) | USD 5,000 *(owner query open: about 2.8 weeks of the team at USD 15/h; see the roadmap §5)* | R-A | 2026-11-24 (OD-21) |
| Scope choice: full V2-R0 to V2-R6, or the MSS first | Full build, V2-R0 to V2-R6 | R-A | 2026-11-24 (OD-21) |
| Engineer-equivalents (staffing) | 3 | R-A | 2026-11-24 (OD-21) |
| Technical reviewer hourly rate | USD 15 (owner rate; recorded for engineers; confirm it also applies to the reviewer) | R-A | 2026-11-24 (OD-21) |
| Deputy approver R-DEP retainer | Not given | R-A | 2026-11-24 (OD-21) |
| Target date V2-R0 | Start 1 Jan 2027; gate 16 Apr 2027 | R-A | 2026-11-24 (OD-21) |
| Target date V2-R1 | Gate 2 Jul 2027 | R-A | 2026-11-24 (OD-21) |
| Target date V2-R2 | Gate 17 Sep 2027 | R-A | 2026-11-24 (OD-21) |
| Target date V2-R3 | Gate 19 Nov 2027 | R-A | 2026-11-24 (OD-21) |
| Target date V2-R4 (or MSS privacy pieces) | Gate 28 Jan 2028 | R-A | 2026-11-24 (OD-21) |
| Target date V2-R5 (or MSS commercial pieces) | Gate 5 Nov 2027 | R-A | 2026-11-24 (OD-21) |
| Target date V2-R6 (cutover) | Gate 17 Mar 2028; cutover 20 Mar 2028 | R-A | 2026-11-24 (OD-21) |
| R-05 (scope too large): accept or treat | Accept | R-A | 2026-11-24 (OD-21) |
