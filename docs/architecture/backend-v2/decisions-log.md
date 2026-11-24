# Decisions Log (ADR index)

Every significant decision gets an ADR with its context, at least two options considered, the decision, its consequences and its security and privacy implications. ADR-001 is the exception: the owner fixed it, so it records rationale and consequences only.

| ID | Title | Status | Phase | Mandatory for MVP |
|---|---|---|---|---|
| [ADR-001](adr/ADR-001-schema-per-tenant.md) | One Postgres schema per tenant on Supabase | **Accepted** (owner, 2026-11-23); C1-01 residual risk accepted, extended to R-56 (OQ-16) and re-confirmed with ISO-HARD (OD-15, 2026-11-24); both recorded in the ADR (rev P5) | 1 | Yes |
| [ADR-002](adr/ADR-002-isolation-inside-one-project.md) | Isolation inside one project: a role per tenant, one routing point that fails closed, row-level security as defence in depth | Proposed (Phase 2 written; recommendations accepted 2026-11-23) | 2A / 2F | Yes |
| [ADR-003](adr/ADR-003-envelope-encryption-byok.md) | Envelope encryption, crypto-shredding and BYOK through a key-provider abstraction | Proposed (Phase 2 written; recommendations accepted 2026-11-23) | 2F / 2G | Yes |
| [ADR-004](adr/ADR-004-backup-and-restore.md) | Backup and restore: per-tenant logical export plus change journal; project point-in-time restore for disaster recovery | Proposed (Phase 2 written; recommendations accepted 2026-11-23) | 2H | Yes |
| [ADR-005](adr/ADR-005-hosting-and-jobs.md) | Hosting and jobs: Vercel API plus Supabase-native scheduling and queues plus one scanning container | Proposed (Phase 2 written; recommendations accepted 2026-11-23) | 2A / 2H | Yes |
| [ADR-006](adr/ADR-006-identity.md) | Identity: Supabase Auth, SAML/OIDC per tenant, SCIM 2.0 built in Selvara | Proposed (Phase 2 written; recommendations accepted 2026-11-23) | 2E | Yes |
| [ADR-007](adr/ADR-007-provider-abstractions.md) | Provider abstractions for payment, tax, invoice numbering and AI (title aligned with the file, rev P5) | Proposed (Phase 2 written; recommendations accepted 2026-11-23); amended rev P5: launch route bank transfer, Stripe when an eligible entity exists (OD-01, D7-8) | 2I / 2G | Yes |
| [ADR-008](adr/ADR-008-typed-entity-tables.md) | Typed entity tables replacing `ws_records` | Proposed (Phase 2 written; recommendations accepted 2026-11-23) | 2B | Yes |
| [ADR-009](adr/ADR-009-migration-orchestration.md) | Migration orchestration across tenant schemas | Proposed (Phase 2 written; recommendations accepted 2026-11-23) | 2B / 2H | Yes |
| [ADR-010](adr/ADR-010-control-plane-placement.md) | Control plane: separate schema in a dedicated project, what it holds, who can reach it (title aligned with the file, rev P5) | Proposed (Phase 2 written; recommendations accepted 2026-11-23) | 2A | Yes |
| [ADR-011](adr/ADR-011-reference-content-versioning.md) | Shared reference content (frameworks, controls, templates): distribution and versioning to tenant schemas | Proposed (Phase 2 written; recommendations accepted 2026-11-23) | 2B | Yes |
| [ADR-012](adr/ADR-012-malware-scanning.md) | Malware scanning service | Proposed (Phase 2 written; recommendations accepted 2026-11-23) | 2F | Yes |
| [ADR-013](adr/ADR-013-audit-anchoring-worm.md) | Audit-log anchoring and WORM export target | Proposed (Phase 2 written; recommendations accepted 2026-11-23) | 2F | Yes |
| [ADR-014](adr/ADR-014-custom-roles.md) | Custom roles: tenant custom roles and platform custom roles from predefined names (OD-07) | **Accepted** (owner, 2026-11-23, OD-07), as the ADR file states; index corrected (rev P5, P4-A3-07) | 2E | Yes |
| [ADR-015](adr/ADR-015-approval-engine.md) | One approval engine with a kind registry and two stores (tenant and control plane) | Proposed (rev P5); records DU-19 and 2D D-20 to D-29 | 2D | Yes |
| [ADR-016](adr/ADR-016-webhook-payload-model.md) | Thin webhook payloads, delivered from a transactional outbox | Proposed (rev P5); records DU-18 and 2C C-70 | 2C | Yes (M18) |
| [ADR-017](adr/ADR-017-cell-capacity-cr1.md) | Cell capacity rule CR-1 | Proposed (rev P5); records DA-10 and DU-01; owner confirms `T` at the V2-R0 exit | 2A / 2J | Yes |
| [ADR-018](adr/ADR-018-trial-provisioning-sod.md) | Trial provisioning under one standing four-eyes trial policy | Proposed (rev P5); records OD-04 and OQ-21 (DU-30) | 2D / 2I | Yes |
| [ADR-019](adr/ADR-019-retention-and-deletion-model.md) | Retention and deletion model: retention classes, journal kept with its row, crypto-shredding with a bounded window | Proposed (rev P5); periods DRAFT pending counsel (DU-20, DU-21); includes the RA-01 keep-newest exception | 2G / 2B | Yes |
| [ADR-020](adr/ADR-020-service-levels-and-plan-tiers.md) | Service levels and plan tiers: one uniform SLA (SLA-U) and Enterprise-only BYOK, SSO, SCIM and dedicated cell | Proposed (rev P5); records OQ-23 and OQ-20; supersedes DU-35; figure *(verify)* against VC-13 (H-DR-I) | 2A / 2I | Yes |

Owner decisions OD-01 to OD-11, OQ-14 and OQ-15 are recorded in [phase2/00-phase2-summary.md](phase2/00-phase2-summary.md), section 8. The ADR statuses stay Proposed until the formal change after the Phase 3 revisions (DU-37); ADR-014 is the exception, accepted by the owner under OD-07. ADR-015 to ADR-020 were written in the Phase 5 documentation pass for the decisions that finding P4-A3-06 listed without an ADR; DU-37 now covers ADR-002 to ADR-013 and ADR-015 to ADR-020. DU-04 (cloud provider) and DU-06 (observability and email) get their own ADRs when the owner takes them. (rev P5) The binding design spine is [phase2/00-spine.md](phase2/00-spine.md) (spine v2). (rev P3)

## Owner decisions after Phase 4 (2026-11-24) (rev P4)

| ID | Decision | Closes |
|---|---|---|
| OD-12 | Contract a fractional senior engineer as the technical code reviewer at every release gate (2K K-M06). | P4-A3-18, once appointed |
| OD-13 | The owner sets a budget ceiling and per-release target dates before V2-R0, with a mandatory re-plan after V2-R0 and the stop triggers in 2K K-M07. | P4-A3-17, once the figures are recorded |
| OD-14 | The owner verifies the vendor facts (VC list) against the vendors' own documentation before the Phase 5 gate. The design session cannot reach the vendor sites. The full list is VC-01 to VC-22 (P3-X3 §2.7) plus VC-23 to VC-34, added in the Phase 5 documentation pass: see [assumptions-log.md, "Vendor facts to verify (OD-14)"](assumptions-log.md#vendor-facts-to-verify-od-14) (rev P5). | P4-A1-08, together with the DR fallbacks in 2H and ADR-004 |
| OD-15 | The C1-01 / R-02 isolation acceptance is re-confirmed, with added hardening ISO-HARD (2F, ADR-002). | P4-A1-01 (accepted residual) |

### Owner decisions pending at the Phase 5 gate (rev P5)

These are marked "Owner" in 2H or raised by the readiness assessment, and are not yet recorded as decisions. They are listed here so that the register is complete (readiness evidence §2.1).

| ID | Decision to take | Recommendation (design authority) | Closes |
|---|---|---|---|
| H-DR-E (DU-02) | PITR before the first external tenant | Turn PITR on with a 7-day window in `cp`, the cells and `ks` | P4-A1-08 (part) |
| H-DR-G | VC-14 fallback adopted in advance: a second, independent KEK per tenant in the DR region (2H H-VF-02) | Ratify | P4-A1-08 (part) |
| H-DR-DEP | KS-SNAP replaces the journal-only `ks` rebuild accepted under OQ-17 / DU-36. Stated plainly: without KS-SNAP, losing `ks` together with the Supabase organisation loses every key older than the 8-day journal, so every file and E2 field of every tenant. KS-SNAP includes the keep-newest legal hold after a declared `ks` loss (RA-01; ADR-019 decision 6) | Ratify | P4-A1-07, RA-01 |
| H-DR-I | SLA-U figure and terms (ADR-020), after VC-13 | Confirm once VC-13 is verified | P4-A3-14 |
| Deputy approver (R-DEP) | Contract a deputy who can act for R-A or R-B in four-eyes actions and `ks` recovery, never for both in the same action; record the delegation in SOD_MATRIX (discovery §4, ADR-015 point 7) | Appoint before the first external tenant | P4-A3-19 (re-rated High) |

## Earlier decisions (from `BACKEND_FOUNDATION.md` and `PRODUCTION_PROGRAMME.md`)

| ID | Decision | Status in v2 |
|---|---|---|
| D1 | A person may belong to several companies, with one active company per session | **Kept** |
| D2 | Shared schema isolated by row-level security | **Superseded by ADR-001** (row-level security stays as defence in depth) |
| D3 | Rules as shared pure functions | **Kept** |
| D4 | Modules without a server API are hidden in API mode | Kept until cutover |
| D5 | Database isolation tests in CI | **Kept**, extended to schema-escape tests |
| D6 | Migrations applied by hand with a fail-closed check | **Replaced by ADR-009** |
| D7 | Production programme module groups | To be re-assessed in Phase 2K |

## Decisions still unmade (Phase 3, from review X3 register A) (rev P3)

These exclude everything resolved by the Phase 2 summary §8 (OD-01 to OD-11, OQ-14, OQ-15), by R2-01 to R2-05 and by the rulings DA-01 to DA-15. Owner codes: R-A is the Management Approver, R-B the CISO. "Mandatory" means mandatory for the MVP (V2-R0 to V2-R6). Legal and compliance items are **DRAFT** pending counsel.

| ID | Decision | Source | Mandatory for MVP | Proposed owner | Recommendation | Status (rev P5) |
|---|---|---|---|---|---|---|
| DU-01 | Cell-capacity rule CR-1 (2.2), replacing 300 / 500 / 0.6K | 2A A-DR-04, 2J J-DR2, A-15, A-60 | Yes (V2-R0 exit) | R-A (R-B consulted) | Adopt CR-1. Adopted by the design authority (DA-10); owner confirms at the V2-R0 exit (rev P3) | Made provisionally (DA-10); recorded as ADR-017; owner confirms `T` at the V2-R0 exit |
| DU-02 | PITR on from the first paying tenant, so trials before then have a 24 h RPO | 2H H-DR-E, R-19 | Yes | R-A | Turn PITR on with a 7-day window in `cp`, the cells (`c1` at launch) and `ks` before the first external tenant, trial or paid, because trials are customer data too (2H H-DR-E, about USD 300 a month *(verify)*). The `ks` window stays inside the 8-day destruction bound. Recommended; owner to ratify (rev P5) | **Recommended** (design authority): PITR on in `cp`, cells and `ks`; owner to ratify (H-DR-E) |
| DU-03 | KMS cost lever: a per-cell KMS key wrapping per-tenant KEKs held in a store | 2H H-C-23 ("decision for 2F/2G", not taken) | No | R-B | Reject for the MVP (conflicts with S7 and BYOK); revisit above 1,000 tenants through an ADR-003 amendment | Open |
| DU-04 | Choice of cloud provider (AWS or equivalent) and confirmation of the account layout | 2F F-DR-04 residual after OD-02 | Yes | R-A | AWS, as in H-AC-05 | Open |
| DU-05 | Search model of DA-01 as a product constraint: E0 indexed and searchable; E1 free text searched by decrypt-and-filter inside the tenant request with bounded pages; no plaintext index (rev P3) | 2F F-DR-07, ADR-003 C3-02 | Yes | R-A | Accept; list affected screens in the parity ledger | Open |
| DU-06 | Observability SaaS (and email provider) procurement, both in the EU region | 2F F-DR-08, H-AC-07/08 | Yes | R-B | Choose before V2-R0 (needed for S1 paging) | Open |
| DU-07 | Edits to existing protected workflows (`ci.yml` H-CI-01 to H-CI-04, J-10 gating, release evidence), which OD-03 does not cover | 2J J-DR1, 2H H-DL-05 | Yes | R-A | Approve in principle, as for OD-03 | Open |
| DU-08 | Load tool (k6) and the perf-cell budget | 2J J-DR3, A-61 | Yes (V2-R0 exit "load test sets threshold") | R-A | Approve, on-demand project | Open |
| DU-09 | Accept J-ISO-25 as a documented residual and choose the detector (pgaudit or log drain) | 2J J-DR4, R2-06, VC-09 | Yes | R-B | Accept under R-02 with the R2-06 controls (2F F-ISO-06, DA-02); detector per VC-09 (rev P3) | Partly made: residual accepted (OQ-16, OD-15); detector open (VC-09) |
| DU-10 | Parity ledger as a release gate with owner sign-off | 2J J-DR5, K-M04 | Yes | R-A | Accept | Open |
| DU-11 | Machine-readable RBAC matrix and endpoint registry as the single source | 2J J-DR6, A-64 | Yes | R-B (design authority) | Accept | Open |
| DU-12 | Dunning policy: automatic restriction at D+14, four-eyes suspension at D+30, automatic reinstatement for `non_payment`; SOD_MATRIX update | 2I I-DR3 | Yes (V2-R5) | R-A | Accept | Open |
| DU-13 | "Void" becomes a full credit note | 2I I-DR4 | Yes | R-A (with finance) | Accept | Open |
| DU-14 | Drop the `screenings` and `idv` meters (parity sign-off; not part of OD-05) | 2I I-DR5 | Yes | R-A | Accept | Open |
| DU-15 | External roles do not consume paid seats | 2I I-DR6, A-59 | Yes | R-A | Accept, with an `external_users` soft limit (P3-X3-09) | Open |
| DU-16 | Proration rule for upgrades | 2I I-4.4.1 | Yes (V2-R5) | R-A (finance) | Daily proration in direct mode | Open |
| DU-17 | Exclude API calls made within 10 min after a webhook delivery from metering | 2C R-31 ("decision for Phase 2I", not taken) | No | R-A | Defer; monitor | Open |
| DU-18 | Record the thin-webhook-payload decision (no ADR) | 2C C-DR2 | Yes (M18) | R-B | Record in decisions-log | Recorded as ADR-016 (Proposed); owner acceptance with DU-37 |
| DU-19 | Record one approval engine with two stores (no ADR) | 2D D-DR1 | Yes | R-B | Record as ADR-002 follow-up or a new ADR | Recorded as ADR-015 (Proposed); owner acceptance with DU-37 |
| DU-20 | Confirm that ADR-004 export rotation meets storage limitation | 2G G-DR-02, R-25 | Yes | R-A + counsel | Legal review (OD-08 package) | Open (counsel); model recorded in ADR-019 |
| DU-21 | Retention schedule G-5 and B-RC01 to B-RC34 | 2G G-DR-04, 2B B-Q06 | Yes (V2-R4 exit) | R-A + counsel | OD-08 commissioned; awaiting counsel | Open (counsel); model recorded in ADR-019 |
| DU-22 | Designate a DPO (R-G) or record why not | 2G G-DR-05 | Yes | R-A + counsel | Decide before the first health-sector tenant | Open |
| DU-23 | UK and EU Art. 27 representatives | 2G G-DR-06 | Yes, if selling to the UK or EU | R-A + counsel | Decide with DU-22 | Open |
| DU-24 | DPA outline and subprocessor list for counsel drafting | 2G G-DR-07 | Yes | R-A | Approve after DU-06 and DU-04 | Open |
| DU-25 | Legal confirmation of the paraphrase position | OD-09 | Yes | R-A (legal) | Pending counsel | Open |
| DU-26 | Legal confirmation of pseudonymous audit ids | OD-10, R-23, A-53 | Yes | R-B (legal) | Pending counsel | Open |
| DU-27 | Other OD-08 legal reviews: UAE executive regulations and health localisation, Pakistan bill, staff access from Pakistan (R-48) | OD-08 | Yes | R-A | Tracked to Phase 5 | Open |
| DU-28 | Sizing of `ks` for per-subject keys (tens of thousands per tenant) | 2B B-Q03, A-28 | Yes | R-B | J-PERF measurement | Open |
| DU-29 | Paging target: 24/7 acknowledgement within 15 min, or business hours | A-24, H-AL-01 | Yes | R-A | Decided by OQ-22: 24/7 acknowledgement within 15 min for S1; business hours otherwise; RTOs restated (A-NFR-15, A-NFR-21) (rev P5) | **Closed by owner decision OQ-22** (2026-11-23) |
| DU-30 | Content of the standing trial policy (limits, duration, region, concurrent-trial cap), approved four-eyes under OD-04 | OD-04, H-CC-04 vs I-4.4.3 | Yes | R-A + R-B (four-eyes) | Decided by OQ-21: 5 seats, 14 days, 500 MB, region `R1`, AI off, no BYOK, SSO, SCIM or dedicated cell, concurrent trials at most 10% of the CR-1 threshold, daily cap (2I I-4.4.3) (rev P5) | **Closed by owner decision OQ-21** (2026-11-23); recorded in ADR-018 |
| DU-31 | B2B-only sales (refuse B2C) | A-57 | Yes | R-A | Accept | Open |
| DU-32 | Up to 5 minutes of metering lag is acceptable | A-58 | Yes | R-A | Accept | Open |
| DU-33 | Product-scope confirmations: policy body 200,000 characters (A-30), interested parties as organisations (A-32), no custom fields (A-34), HMAC format (A-36), external roles not customisable (A-44) | 2B, 2C, 2E | Yes | R-A | Accept | Open |
| DU-34 | Interim exposure of the pooler to any IP until Static IPs and network restrictions (R-15) | 2H R-15 | Yes | R-B | Tighten: Static IPs and allowlist before the first external tenant (cost about USD 200 a month for two projects) | Open |
| DU-35 | Whether to offer a contractual SLA (dedicated or shared) before Supabase and Vercel SLAs back it | A-NFR-02 | Yes (before any customer contract; was "No (launch)") (rev P5) | R-A | Superseded by OQ-23: one uniform contractual SLA for every plan (SLA-U, 2A A-NFR-01, 2I I-4.6, ADR-020), at or below the vendor-backed figure (VC-13) (rev P5) | **Closed by owner decision OQ-23** (superseded); recorded in ADR-020; figure pending VC-13 and H-DR-I |
| DU-36 | `ks` continuity (DR-region standby and off-site key journal) | P3-X3-03 | Yes | R-B | Adopted under OQ-17 (DA-11); superseded by KS-SNAP (2F F-7.5, 2H H-9.1a, ADR-004), which needs owner ratification H-DR-DEP (rev P5) | Made by OQ-17, then **superseded by KS-SNAP**; owner ratification pending (H-DR-DEP) |
| DU-37 | Formal status change of ADR-002 to ADR-014 from Proposed to Accepted after the Phase 3 revisions | decisions-log | Yes | R-A + R-B | After Phase 3 | Open (owner); scope now ADR-002 to ADR-013 and ADR-015 to ADR-020 (ADR-014 already Accepted) |
| DU-38 | Provider-callback and worker path, and Trust Center reference column name (naming conflicts) | P3-X3-18 | Yes | R-B (design authority) | As proposed in P3-X3-18 Spine v2 S6 and S2 already use these names (rev P3) | **Closed** (design authority, spine v2) |

### Phase 2 decision requests already resolved (traceability)

| Source DR | Resolved by |
|---|---|
| A-DR-01, H-DR-A/B/C, B-Q01, B-Q02, B-Q07, C-DR4, D-DR2, D-DR3, D-DR4, E-DR1, E-DR4, F-DR-01/02/03, G-DR-01 | ADR recommendations accepted with the Phase 2 approval on 2026-11-23 (formal ADR status: DU-37) |
| A-DR-02, F-DR-05, F-DR-06 | ADR-010 plus R2-03 |
| A-DR-03 | OD-04 |
| B-Q04, B-Q05, C-DR1 | R2-05 (spine deviations accepted) |
| C-DR3 | OD-05 (2C text to correct: P3-X3-21) |
| E-DR2 | ADR-014 plus OD-07 |
| E-DR3 | OD-06 |
| F-DR-04, H-DR-D | OD-02 (provider choice remains open as DU-04) |
| G-DR-03 | OQ-14 |
| H-DR-F | OD-03 (existing-workflow edits remain open as DU-07) |
| I-DR1, I-DR2 | OD-01 |
| I-DR7 | 2F F-D-01 and F-11 (secrets manager in the security account) |
| 2K K-5 decisions | OD-01, OD-02, OD-03, OD-05 to OD-07 |
