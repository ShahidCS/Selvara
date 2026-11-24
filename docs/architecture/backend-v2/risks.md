# Risk register (unified, Phase 3)

| | |
|---|---|
| Status | Unified register, Phase 3 (2026-11-23). Replaces the Phase 1 seed and the per-workstream "Open risks" blocks; duplicates merged (P3-X3-28). R-60 to R-64 added. (rev P3) Phase 4 (2026-11-24): R-41 re-rated L by KS-SNAP, R-02 re-confirmed by the owner (OD-15) with ISO-HARD, residual acceptances recorded from OQ-16, F-AB-16 added as pending (rev P4). Phase 5 documentation pass (2026-11-24): R-65 and R-49a rows corrected to the table's columns; R-03, R-05, R-41, R-60 treatments updated; deputy approver R-DEP and the RA-01 keep-newest rule referenced (rev P5) |
| Scale | Likelihood (L) and Impact (I): H, M, L or Crit. Owner: R-A (Management Approver) or R-B (CISO). "→" means merged into the master risk; the merged ID stays as an alias so references in the documents keep resolving. No ID is reused for a different risk. |

| ID | Risk | Source | L | I | Owner | Treatment (short) | Status |
|---|---|---|---|---|---|---|---|
| R-01 | Single region blocks in-country deals | P1 | H | H | R-A | Cells per region later | Accepted (OQ-04) |
| R-02 | Pooled login can assume any tenant role (C1-01) | P1 | L | Crit | R-B | ADR-002 controls (one routing point, a role per tenant, RLS as defence in depth, escape tests in CI), plus the R-56 controls (injection prevention and detection, 2F F-ISO-06, DA-02); extended to R-56 by OQ-16 (2026-11-23) (rev P3); ISO-HARD added (KMS, `ks` and Storage bound to the routed tenant, tenant-mismatch detector; 2F F-D-14, F-4.5, ADR-002 decision 9) (rev P4) | Accepted with controls; **re-confirmed by the owner OD-15 (2026-11-24) with ISO-HARD** (rev P4), recorded in ADR-001 (rev P5). Residual: code execution in `app` can still request any tenant's keys (2F F-T-075). The Phase 5 gate review is a design-time re-confirmation (owner action); the review against pen-test results happens at the V2-R6 gate, then yearly (rev P5) |
| R-03 | No team: approvals block | P1 | M | H | R-A | Two approvers; automation; deputy approver R-DEP who can act for R-A or R-B in four-eyes actions and `ks` recovery, never for both in the same action (ADR-015 point 7; owner appointment pending, P4-A3-19 re-rated High); paging drill before the first external tenant (rev P5) | Open (A-08 validated; A-24 closed by OQ-22; A-39 open) (rev P5) |
| R-04 | No payment provider for a Pakistan entity | P1 | H | H | R-A | OD-01 bank transfer; adapters | Treated (OD-01); residual open until a Stripe-eligible entity or MoR exists |
| R-05 | Full MVP scope too large | P1 | H | H | R-A | Ordered releases (K-M01); bottom-up effort estimate and minimum sellable subset (2K, Phase 5 documentation pass); budget ceiling, per-release dates and stop triggers (OD-13, K-M07) (rev P5) | **Accepted** by the owner (OD-21, 2026-11-24) with the full build, 3 engineer-equivalents and the roadmap calendar; K-M07 stop triggers still apply; the budget ceiling needs clarification (OD-21 query) (rev P5b) |
| R-06 | Vendor plan limits, feature gaps or unverified facts (Supabase, Vercel, Stripe, KMS) | P1 + R-K1 | H | M | R-B | VC-01 to VC-22 before Phase 5 | Open (**master for R-K1**) |
| R-07 | Free AI models keep or train on data | P1 | M | H | R-B | Review per provider; off by default | Open |
| R-08 | Auditors read the whole tenant (F1-01) | P1 | H | H | R-B | OBJ-AUD scope: auditors read only items shared with their live engagement (control, evidence with its files, policy, risk_snapshot); no risk list; no member list or member ids (DA-07); restrictive RLS on `app.scope`; J tests (rev P3) | Treated by design; open until V2-R2 tests |
| R-09 | Trust Center over-exposes (F1-02) | P1 | M | H | R-B | Per-section publishing, NDA per person | Treated by design; open until V2-R3 tests |
| R-10 | Demo-only behaviour lost (no downgrade) | P1 | M | M | R-A | Parity ledger gate | Open (**master for R-59**) |
| R-11 | Supabase org owners and dashboard reach every schema | 2A | L | Crit | R-B | Two members, MFA, break-glass, field encryption | Open |
| R-12 | Catalog and relcache growth lowers the cell threshold | 2A | M | H | R-B | J-PERF H3; CR-1 | Open (**master for R-20, R-58**) |
| R-13 | Storage credential reaches every prefix | 2A | M | H | R-B | `storagebroker` exception (SD-F-02), per-file keys | Treated by design; residual accepted under SD-F-02 |
| R-14 | Cached session state delays revocation | 2A | L | L | R-B | R2-01: no cache | **Closed** |
| R-15 | Pooler reachable from any IP until Static IPs | 2H | M | H | R-B | Credentials, pinned TLS; allowlist (DU-34) | Open |
| R-16 | Terraform provider alpha; Queues maturity | 2H | M | M | R-B | Pin; Management API scripts; `ops.job` fallback | Open |
| R-17 | Region loss gives a 24 h RPO (26 h effective) | 2H | M | H | R-A | Hourly `cp` export; fixed nightly export slot (≤ 26 h); enterprise option (rev P3) | Open |
| R-18 | Function duration limits break long jobs (and pg_net reliability) | 2H + R-32 | M | M | R-B | Chunked jobs; GitHub runners; watchdog | Open (**master for R-32**) |
| R-19 | Cost per tenant at small scale outruns revenue | 2H | H | M | R-A | PITR timing; pricing floor | Open (cost understated, P3-X3-08) |
| R-20 | → R-12 (140 tables per tenant) | 2B | | | | | Merged |
| R-21 | Per-subject keys make name display depend on `ks` | 2B | M | M | R-B | Batch unwrap; "unavailable" label | Open |
| R-22 | Arcs, allow-list and SoD triggers add cost and complexity | 2B | M | M | R-A | Generated DDL; B-V13, B-V15 | Open |
| R-23 | Member names kept 7 years vs erasure | 2B | M | M | R-B | OD-10 pseudonymous ids | Treatment decided (OD-10); legal pending (DU-26) |
| R-24 | Framework text infringes copyright | 2B | M | H | R-A | OD-09 ids, titles, paraphrases | Treatment decided (OD-09); legal pending (DU-25) |
| R-25 | Exports held while active exceed retention; restore resurrects purged data | 2B | M | H | R-B | B-PG05; rotation; legal | Open (DU-20) |
| R-26 | Content upgrade remaps requirements wrongly | 2B | L | H | R-A | Preview, crosswalk review, canary | Open |
| R-27 | Failed or quarantined tenants block contract migrations | 2B | M | M | R-A | Time limit; B-M22 gate | Open |
| R-28 | → R-34 (free text holds PD) | 2B | | | | | Merged |
| R-29 | `member_profile`/`tenant_role` diverge from `control` | 2B | M | H | R-B | `cp` authoritative; reconciliation | Open |
| R-30 | A handler misses an object-scope rule (re-opens F1-01) | 2C | M | H | R-B | Scoped query builder; generated tests | Open |
| R-31 | Thin webhooks raise API usage against limits | 2C | M | L | R-A | DU-17 | Open |
| R-32 | → R-18 | 2D | | | | | Merged |
| R-33 | DSAR clock rules wrong | 2D | M | H | R-B | Legal review of `ref.dsar_rules` | Open |
| R-34 | Erasure incomplete: PD in unflagged or E1 free text (history and exports until rotation) | 2D + R-28 + R-46 | H | H | R-B | PD catalogue; PII warning; redaction; DPA disclosure | Open (**master for R-28, R-46**) |
| R-35 | Supabase Auth limits differ from assumptions | 2E | M | H | R-B | ADR-006 fallback | Open |
| R-36 | Tenant admin or IdP affects a shared identity in another tenant | 2E | M | H | R-B | E-53, E-56 | Open |
| R-37 | Custom-role sprawl | 2E | M | M | R-B | Ceiling; four-eyes; quarterly review | Open |
| R-38 | Collusion or one compromised super admin | 2E | L | Crit | R-A | Passkeys; dual-role; external anchor; R-D review | Open |
| R-39 | Break-glass used without trace | 2E | L | H | R-B | Alerts on two channels; drills | Open |
| R-40 | → R-56 (injection or router defect defeats C1-01 controls) | 2F | | | | | Merged |
| R-41 | `ks` loss beyond its window loses subject and file keys (incl. region loss or loss of the Supabase organisation) | 2F | L (rev P4; was M) | Crit (was H) | R-B | `ks` standby in the DR region, PITR 7 days, an 8-day off-site key journal with tombstones (DA-11, DU-36) (rev P3), and **KS-SNAP**: a daily snapshot of `ks` to the `ks-snap` bucket in `offsite-prod` under an 8-day compliance lock, encrypted under `kek/ks-snap`, restored by snapshot plus journal replay, drilled quarterly and at the V2-R0 exit (2F F-D-13, F-7.5; 2H H-9.1a; 2J J-KSS) (rev P4). Destroyed keys unrecoverable from every copy after 8 days. Residual depends on KEK survival (VC-14) and compliance lock (VC-22, fallback 2F F-K-46). **Keep-newest rule (RA-01, rev P5):** when a `ks` loss or compromise is declared (S1), the newest KS-SNAP object and the journal segments after it are put under legal hold in `offsite-prod` (an extension of the lock, set by one approver: R-A, R-B or R-DEP) until `ks` is restored and verified; release is four-eyes; keys destroyed in that window are recorded on the certificate as "destroyed; unrecoverable once the hold is released" (ADR-019 decision 6). Owner ratification: H-DR-H | Open, **re-rated L** (rev P4); stays open until the first KS-SNAP drill passes |
| R-42 | KMS outage or BYOK revocation makes tenants unavailable | 2F | M | M | R-A | 5-minute DEK cache; `KeyUnavailable` | Open |
| R-43 | Security account adds a subprocessor and cost before revenue | 2F | M | L | R-A | Managed per-use services | Open |
| R-44 | Operator access exposes E0 plaintext and metadata | 2F | L | M | R-A | Attestations; E1/E2 | Open |
| R-45 | Vercel streaming limits block large downloads | 2F | M | L | R-A | Bundle fallback; ceiling | Open |
| R-46 | → R-34 | 2G | | | | | Merged |
| R-47 | UAE health (or Pakistan) localisation blocks single region | 2G | M | H | R-A | Cell per region (R-01) | Open |
| R-48 | Staff access from Pakistan is a restricted transfer | 2G | H | M | R-B | SCCs/UK Addendum; legal (DU-27) | Open |
| R-49 | Lifetime retention of `record_history` challenged | 2G | M | M | R-A | Retention rules; redaction; legal | Open |
| R-50 | Card self-serve unavailable at launch (`ENT-PK`) | 2I | H | M | R-A | Bank transfer; foreign entity | Open (consequence of OD-01, related to R-04) |
| R-51 | MoR or PSP rejects or freezes payouts | 2I | M | H | R-A | Bank transfer always available | Open |
| R-52 | Tax registrations or e-invoicing missed | 2I | M | H | R-A | Hard refusal without `tax_rules` | Open |
| R-53 | Metering drift | 2I | L | M | R-B | Outbox, dedupe, recount | Open |
| R-54 | Provider secret misuse (refund fraud, payout diversion) | 2I | L | H | R-B | Secret refs; four-eyes | Open |
| R-55 | Knee `K` is low, so cells multiply early (cost and operations) | 2J | M | M | R-A | Measure early; dedicated cells | Open |
| R-56 | Injection or router defect inside a routed transaction can `SET ROLE` or `set_config` to another tenant | 2J, 2K + R-40 | L (with controls) | Crit | R-B | If SQL injection exists in a routed transaction, an injected `SET ROLE` succeeds. Prevention and detection (2F F-ISO-06, 2A A-RT-10, DA-02): router-only role statements, extended-protocol parameterised SQL only (router setup included), no dynamic SQL from input, pgaudit alert (DU-09), F-IT tests prove the controls. Residual inside C1-01 (R-02) (rev P3) | Open (part of R-02; **master for R-40**). Defined in both 2J and 2K with the same meaning, so not an ID conflict |
| R-57 | Large-N boundary suites too slow, so they get skipped | 2J | M | H | R-B | Small N on PR, large N nightly | Open |
| R-58 | → R-12 | 2J | | | | | Merged |
| R-59 | → R-10 | 2J | | | | | Merged |
| R-K1 | → R-06 | 2K | | | | | Merged |
| R-K2 | Protected files must change | 2K | H | M | R-A | OD-03 plus DU-07 | Open |
| R-K3 | AI-written code with no in-house engineers | 2K | M | H | R-A | CI gates; human review; pen test | Open |
| R-60 | Customer pastes business content into a support message (2A A-CP-R1) | 2A | M | M | R-B | Text only; warning; 2-year retention (G-RET-07); content heuristic with a recorded override and secret detection on support messages (2A A-CP-R1, 2F rule R-SEC, 2J J-SEC-34; P4-A1-15, P4-A1-06) (rev P5) | Open (rev P3) |
| R-61 | `control.identities` and `memberships` reveal who works where (2A A-CP-R2) | 2A | L | M | R-B | `cp_tenant_api` functions only (R2-03); staff views logged | Open (rev P3) |
| R-62 | `cp` is on every request (R2-01): overload or outage stops all tenants; no capacity NFR or test | P3-X3-04 | M | H | R-B | `cp` NFR A-NFR-07a, 2J H12 load test, connection ceiling A-CN-07 (DA-12) | Open (rev P3) |
| R-63 | Cost model omits lines, so plans are priced below cost | P3-X3-08 | M | M | R-A | Recompute before pricing (VC-08) | Open (rev P3) |
| R-64 | Trial flood fills cell capacity and KMS key count | P3-X3-10 | M | M | R-A | Concurrent-trial cap in the trial policy | Open (rev P3) |
| R-65 | A uniform contractual SLA (OQ-23) is committed above what the underlying Supabase and Vercel plans guarantee, creating penalty exposure | OQ-23, P4-A3-14 | M | M | R-A | Set the SLA at or below the combined vendor SLAs once VC-13 is verified; service credits only (capped at 25% of the monthly fee) budgeted at 2% of revenue (2H H-C-26); exclusions per 2I I-4.6.4; ADR-020 (row realigned, rev P5) | Open, treated (OD-23, 2026-11-24): VC-13 shows vendor SLAs only on Enterprise plans, so 99.0% is self-backed; bounded by the vendor-wide-outage exclusion, the credit cap and the 2% revenue budget; the figure is configurable and lowered only at renewal (rev P5b) |
| R-49a | Certification readiness: the ISMS documents and evidence of G-14 are not ready when a customer or tender requires ISO 27001 (Q-17), because two people carry all rows (rev P4, P4-A3-12) | 2G G-14, P4-A3-12 | H | M | R-A | G-14 plan with priority rows by V2-R6; progress reviewed at each gate; outsourced internal auditor (R-D) before certification; calendar dates follow OD-13 (row realigned, rev P5) | Open (owner dates pending, OD-13) |
| R-66 | Concentration of authority: one person holds R-A and R-B (combined-role mode, ADR-021); independence between security and management judgement is reduced, and the deputy R-DEP becomes the only second person | ADR-021, OD-16 | M | H | R-A | ADR-021 decision 5: distinct-person four-eyes, R-DEP mandatory, combined-mode flag, elevation alerts to R-DEP, monthly independent review (technical reviewer or R-D), break-glass review; exit by second appointment, reviewed at every release gate | **Accepted by the owner on 2026-11-24** (OD-18), with the ADR-021 controls; reviewed at every release gate |
| R-67 | Restore into a new project (path B) is a Beta feature at Supabase; it may change or fail, and a binary copy starts `pg_cron` and `pg_net` jobs at once (duplicate emails, webhooks or jobs against live services) | VC-02 (owner, 2026-11-24) | M | M | R-B | Restore hygiene before the copy is reachable (ADR-004 V-004-17); quarterly drill; path A (journal replay) and the per-tenant exports remain; re-check the feature status at each release gate | Open (rev P5b) |


## Residual acceptance (P3-X2-35, 2F F-2.13)

These threats and abuse cases in 2F carry a residual rating of M with a named owner. The owner accepted the Phase 3 items on 2026-11-23 (OQ-16; approver R-A Management Approver), for review at the Phase 5 gate and then yearly. Items added in Phase 4, and F-AB-16, which was missing from the Phase 3 list, are put to the owner at the Phase 5 gate. The authoritative per-item table is 2F F-2.13. (rev P3, rev P4)

| 2F item | Owner | Acceptance status | Review date |
|---|---|---|---|
| F-T-005, F-T-016, F-T-030, F-T-061, F-T-063, F-T-073, F-T-083, F-T-084, F-T-101, F-T-111, F-T-112 | Per 2F F-2.13 | Accepted by owner OQ-16 (2026-11-23) (rev P4) | Phase 5 gate, then yearly |
| F-T-074 (R-41) | R-B | Accepted by owner OQ-16 (2026-11-23) at M; re-rated L by KS-SNAP, listed until the first KS-SNAP drill passes (rev P4) | Phase 5 gate, then yearly |
| F-T-011 (R-56) | R-B | Accepted by owner OQ-16 (2026-11-23); inside C1-01 / R-02, re-confirmed by owner OD-15 (2026-11-24) with ISO-HARD (rev P4) | Phase 5 gate, then yearly |
| F-T-024, F-T-081 | Per 2F F-2.13 | Accepted by owner OQ-16 (2026-11-23) (rev P4) | Phase 5 gate, then yearly |
| F-AB-02 (R-56) | R-B | Accepted by owner OQ-16 (2026-11-23); inside C1-01 / R-02, re-confirmed by owner OD-15 (2026-11-24) with ISO-HARD (rev P4) | Phase 5 gate, then yearly |
| F-AB-05, F-AB-09, F-AB-10, F-AB-11, F-AB-12 | Per 2F F-2.13 | Accepted by owner OQ-16 (2026-11-23) (rev P4) | Phase 5 gate, then yearly |
| F-T-075, F-T-045 | R-B | Inside C1-01 / R-02, re-confirmed by owner OD-15 (2026-11-24) with ISO-HARD (rev P4) | Phase 5 gate (against pen-test results), then yearly |
| F-AB-16 (external report distribution) | R-B | Not covered by OQ-16 (missing from the Phase 3 list): pending owner acceptance (rev P4) | Phase 5 gate, then yearly |
| F-T-122, F-T-130 (new in Phase 4) | Per 2F F-2.13 | Pending owner acceptance (rev P4) | Phase 5 gate, then yearly |

## Not adopted

- R-41a (P3-X2-32, "`ks` lost in region loss, accepted residual") is not registered: DA-11 adds a DR-region standby and an off-site key journal instead (R-41 treatment). (rev P3)

