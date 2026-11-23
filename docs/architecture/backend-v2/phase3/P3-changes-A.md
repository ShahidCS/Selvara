# Phase 3 reviser A: change log

Files: phase2/00-spine.md, 2A, 2H, 2K; ADR-002, ADR-004, ADR-005, ADR-009, ADR-010; assumptions-log.md, risks.md, decisions-log.md, open-questions.md. Every revised item is marked "(rev P3)". The coordinator's ID update was applied: F-ISO-06 is cited for the R-56 controls, and F-K-30 to F-K-33 for control-plane and audit keys.

| Finding or ruling | File | Item | Change (one line) |
|---|---|---|---|
| X3 V2-01..V2-26, DA-01..DA-15 | 00-spine.md | whole | Rewritten as Spine v2: header line, X3's 26 replacement texts, rulings folded in, change table at the end |
| P3-X1-18 | 00-spine.md | S1 Control plane | No routing replica at launch; a later replica holds static fields only |
| P3-X1-46, P3-X3-20 | 00-spine.md | S0 | 25 frameworks |
| P3-X1-05 | 00-spine.md | S2 | `control.idempotency_records` added to the accepted additions |
| DA-02 vs V2-15 | 00-spine.md | S3.3, S3.5 | Preamble uses extended-protocol bound `set_config`, not one round-trip multi-statement; R-56 succeeds, controls are prevention and detection (F-ISO-06) |
| DA-03/04/05/07/08/09/11/12/13/15 | 00-spine.md | S2, S4, S5, S6, S7 | Audit HMAC hash; keys only in `ks`; platform KEK F-K-30/31/32/33; auditor shared kinds; privileged role; no invitation links to staff; 8-day `ks` window with journal tombstones; `cp` load; entitlements; egress |
| P3-X2-18 (spine part) | 00-spine.md | S4 M05 | `policy_remark` listed (OD-05) |
| P3-X1-05, DA-06 | 2A | A-PL-01, A-3.1 heading, A-CP-40..49 | Spine v2 catalogue; rows for the accepted additions (IDs from A-CP-40 because A-CP-30..37 are taken) |
| P3-X1-06, P3-X2-26, R2-03, DA-06 | 2A | A-2 diagram, A-PL-03, A-CP-30, A-CP-31, A-CP-36, A-CP-37, A-CP-R2 | `app`/`console`; `cp_tenant_api`, `cp_router_ro`, `cp_worker`; `cp_rw` console only; `ks` in diagram |
| P3-X1-29 | 2A | A-CP-01 | 2B status enum, `customer_ref`, `trust_public_ref` |
| P3-X1-33, DA-05 | 2A | A-CP-04, A-CP-25 | Email E1 under platform key with blind index; IP `ip_enc`/`ip_hmac`/prefix |
| P3-X1-37, P3-X3-19 | 2A | A-CP-R1, A-CP-R2 | Registered as R-60/R-61; retention class `support` 2 years |
| P3-X2-23, DA-02 | 2A | A-RT-02, A-RT-05, new A-RT-10, A-5.1 | Lint scope; extended protocol preamble; R-56 control block |
| P3-X2-02(e), DA-07 | 2A | A-5.1, A-RT-04 | `app.scope`, `app.engagement_id` |
| P3-X2-28 | 2A | A-RT-01, A-5.1 | `route_mac` verification, 503 on mismatch |
| SD-E2 (spine v2) | 2A | A-5.1 | Selvara session cookie, no JWT verification per request |
| P3-X1-12, R2-01 | 2A | A-RT-08 | Job status read live; skip tick if `cp` down |
| P3-X2-25 | 2A | A-CN-03, A-XT-01 | No TEMPORARY; definer allow-list |
| P3-X3-04, DA-12 | 2A | A-CN-07, A-NFR-05, new A-NFR-07a | Per-project ceiling incl. `cp`/`ks`; uncached routing budget; `cp` throughput target |
| P3-X3-02 | 2A, ADR-002 | A-CN-09, A-DP-02, ADR-002 Consequences | 800–850 `pg_class` rows, about 140 tables |
| P3-X3-01, DA-10 | 2A | A-PH-02, A-PH-03, A-NFR-09, A-DR-04, A-15 | CR-1 |
| P3-X3-05 | 2A | A-NFR-01, A-NFR-02 | Objectives, not contractual |
| P3-X3-06 | 2A | A-NFR-13 | PITR before the first external tenant (DU-02) |
| P3-X3-07 | 2A | A-NFR-16 | 26 h per tenant, 1 h `cp` |
| P3-X3-24 | 2A | A-NFR-15 | Path A/B/export; destroyed keys never restored |
| P3-X3-03, DA-11 | 2A | new A-NFR-19, A-NFR-20, A-PH-01 | `ks` and `cp` RPO/RTO; `ks` as third project |
| P3-X3-25, P3-X2-31 | 2A | A-LC-08, residual window | KEK and replicas; delete all `ks` rows; E0 residual |
| P3-X3-10 | 2A | A-LC-02, A-DR-03 | OD-04 approved; limits in 2I |
| P3-X3-26 | 2A | A-D-01 | Small compute + PITR, about USD 115 |
| P3-X1-17 | 2A | A-TS-03, A-DP-05 | `ops.rate_buckets` |
| DA-01 | 2A | A-TS-06 | E0 indexed; E1 decrypt-and-filter; no plaintext index |
| DA-04, SD-F-02 | 2A | A-DP-06, A-TS-05, A-PL-04, A-LC-01, R-13 | Per-file keys in `ks`; storagebroker; R-13 treated by design |
| P3-X2-16 | 2A | A-XT-04 | Support views via `app` router as `_ro`, console holds no cell credential |
| P3-X3-19, P3-X3-28 | 2A | R-14, R-12, risk note | R-14 row fixed; master note; R-60..62 pointer |
| P3-X1-07, P3-X2-26, R2-03 | 2H | H-AC-04, H-EN-03, H-EN-04 | `app-*`/`console-*` projects |
| P3-X1-43, DA-15 | 2H | new H-NW-08 | Egress design (public addresses only, allow-listed provider hosts, no redirects) |
| P3-X2-31 | 2H | H-PV-05, H-BK-04, H-BK-05 | DEK in `ks.tenant_dek`; per-file keys; no `ks` keys in exports |
| P3-X3-03, P3-X2-31, DA-11 | 2H | new H-BK-07, new H-DR-08, H-DR-03, H-DR-04 | `ks` standby, 8-day journal with tombstones, exclusion from exports |
| P3-X3-07 | 2H | H-BK-04, H-DR-03/04, R-17 | Fixed slot, ≤ 26 h; RPO 26 h / 1 h |
| P3-X3-06 | 2H | H-BK-01, H-DR-01, H-DR-E | PITR before first external tenant (DU-02) |
| P3-X3-24 | 2H | H-RS-03 | VC-02 fallback; no key resurrection |
| P3-X3-08, DA-13 | 2H | new H-C-17..H-C-20c, H-C-15, H-C-16, H-C-20, H-PR-01, H-PR-02, H-CC-05, usage note | Omitted cost lines added; totals restated |
| P3-X3-27 | 2H | H-C-05, H-C-15 | SSO MAU 3 / 37; totals 554 / 1,075 / 6,336 (both corrections combined) |
| P3-X3-09, DA-13 | 2H | H-PR-03, H-PR-04, H-FL-01 | Database exports drive off-site cost; `db_bytes`; plan flags |
| P3-X3-10, DA-13 | 2H | H-CC-04 | Trial limits referenced from 2I |
| P3-X3-23 | 2H | H-C-23 | Not adopted for MVP (DU-03) |
| P3-X3-04, DA-12 | 2H | H-C-02, H-AL-02, H-OB-05 | `cp` sized from J H12; `cp`/`ks` alerts and probes |
| P3-X3-01 | 2H | H-AL-03, H-FL-09, H-RS-04 | CR-1 provision-ahead and counting |
| DA-02 | 2H | H-CI-02, H-CI-03 | Escape suite proves controls; lint/CodeQL scope |
| P3-X3-16 | 2H | H-DL-05, H-DR-F | DU-07 for existing workflows |
| Owner decisions | 2H | H-DR-D, A-19, A-22, A-23, A-24, R-18, R-19 | OD-02 validated; VC refs; master note; cost note |
| DA-05 / F-K-30..31 | 2H, ADR-004 | H-BK-06, H-BK-07, ADR-004 control export | Platform KEK and DEK cited |
| P3-X1-45, DA-15 | 2K | V2-R0, V2-R1, V2-R4, V2-R5 | Help desk M24, tenant settings, console pages, RoPA and DSAR intake, providers, plans assigned to releases |
| DA-15 (P3-X1-20 part) | 2K | V2-R2 | Reference-content upgrade release |
| OD-05, DA-14 | 2K | K-M04, V2-R2, V2-R3 | Drops labelled; S-AS-02 kept; S-RK-23 fixed |
| DA-07, DA-08, DA-09, DA-10, DA-11, DA-12 | 2K | V2-R0..R2 exit and scope | Auditor scope, SCIM rule, email-only invitations, CR-1, `ks` drill, `cp` load test |
| P3-X3-19, P3-X3-22, P3-X3-28 | 2K | K-5, R-K1, R-10, R-K2 | A-K1/A-K2 table; R-K1 merged into R-06 (VC-01..22); DU-07 |
| DA-02 | 2K | R-56 | Stated plainly with prevention and detection |
| P3-X2-23, DA-02 | ADR-002 | Decisions 2, 3, 4, 7, new 8; V-002-01, V-002-04, new V-002-07 | R-56 succeeds; extended protocol; F-ISO-06; control tests |
| P3-X3-13, R2-01 | ADR-002 | V-002-06 | Refused on the next request |
| P3-X2-02(e) | ADR-002 | Decision 4 | `app.scope`, `app.engagement_id` |
| P3-X2-31, P3-X3-03, DA-11 | ADR-004 | Decision `ks` bullet, Security, V-004-07..09 | `ks` exclusions, standby, journal, 8-day window, certificate roll-off date |
| P3-X3-06, P3-X3-07, P3-X3-24 | ADR-004 | Decision, Consequences | PITR timing; fixed slot; RPO list incl. `ks` and `cp` |
| P3-X3-25 | ADR-004 | Security | KEK and every replica |
| P3-X3-01 | ADR-005, ADR-009 | V-005-01, V-009-01, ADR-009 Consequences | CR-1 threshold count |
| P3-X2-25 | ADR-005 | Decision 1 | `ops.emit`/`ops.emit_usage`, no `ops.enqueue` |
| R2-03, R2-01, X3 §2.7 VC-01, DA-15 | ADR-005 | Decisions 0, 3, 7, 8 | Two projects; live status; fallback tick; egress |
| P3-X1-05, DA-06 | ADR-010 | Decision catalogue, V-010-01 | Allowed list = spine v2 S2 incl. additions; CI fails on others |
| P3-X1-06, P3-X2-26, R2-03 | ADR-010 | Access table, Consequences, Security, V-010-07 | `cp_tenant_api`, `cp_router_ro`, `cp_rw` console only, `cp_worker` |
| P3-X1-13, P3-X2-27, P3-X3-13, R2-01 | ADR-010 | Decision cache sentence, Consequences, V-010-08 | Static fields only; sessions never cached |
| P3-X1-18 | ADR-010 | Decision | Replica: static fields only |
| DA-05 | ADR-010 | Decision encryption paragraph | Platform KEK F-K-30, DEK F-K-31, blind index F-K-32 |
| DA-12 | ADR-010 | Decision load paragraph, V-010-09 | `cp` targets and load test |
| X3 register B, owner decisions | assumptions-log.md | whole | Replaced with the unified register (A-01..A-64, A-K1, A-K2); A-08, A-19 validated, A-25 closed, A-29 closed per DA-05; Phase 3 changes table |
| X3 register C, P3-X2-24, P3-X2-35, DA-02, DA-07, DA-11 | risks.md | whole | Unified register; R-60..R-64 added; R-02, R-08, R-17, R-41, R-56, R-62 treatments; residual acceptance section |
| X3 register A | decisions-log.md | appended | ADR index kept; "Decisions still unmade" DU-01..DU-38 (ID, decision, source, mandatory, owner, recommendation); resolved traceability; DU-01, DU-05, DU-09, DU-36, DU-38 updated per rulings |
| Owner decisions, X1/X2/X3 §4 | open-questions.md | OQ-05..OQ-25 | OQ-05..OQ-15 resolved; OQ-16..OQ-25 added |

## Not applied

| Finding (part) | Reason |
|---|---|
| P3-X2-23 item (4): router prologue may be one simple-protocol string | DA-02 overrides: no simple-query multi-statements, the router's own setup included. Bound `set_config` statements are used instead. |
| X3 V2-15 "all in one round trip" | Same conflict with DA-02; replaced by one bound `set_config` statement plus the assertion, which may be pipelined. |
| P3-X2-28: rename `control.sessions.active_tenant_id` to `tenant_id` in 2A | Conflicts with spine v2 V2-13 (X3), which keeps `active_tenant_id`. Kept the spine name. |
| P3-X2-32: register R-41a as an accepted region-loss residual for `ks` | Superseded by DA-11 (DR-region standby and key journal). Recorded under "Not adopted" in risks.md. |
| P3-X1-05: A-3.1 row IDs A-CP-26..A-CP-40 | A-CP-30..A-CP-35 already exist in A-3.2, so the new rows use A-CP-40..A-CP-49 (and A-CP-36, A-CP-37 for access rows). |
| P3-X1-43: ID H-NW-05 for egress | H-NW-05 already exists; used H-NW-08. |
| P3-X3-08 totals as written (about 1,080 and 6,374) | Combined with the P3-X3-27 SSO correction, so the totals are about 1,075 and 6,336. |
| X1 U-1 and X2 §4 items 1 and 5 as owner questions | Resolved by DA-01, DA-08 and DA-07. |
| X1 U-5, U-6, U-7; X2 §4 items 6 and 7; X3 §4 items 2 and 7 | Vendor verification, load-test or design-authority items, not owner questions. They are tracked by VC-05, VC-09, VC-22, DU-28 and DU-38. |
| X3 §4 item 8 (legal DU-20..DU-27) | Already owner actions under OD-08; tracked in decisions-log, not duplicated as OQs. |
| Parts of X1/X2/X3 findings that land in 2B, 2C, 2D, 2E, 2F, 2G, 2I, 2J, the summary and other ADRs | Not my files (other revisers). |
