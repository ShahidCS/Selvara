# Phase 3 revision log, reviser B

Files: phase2/2B-data-model.md, phase2/2B-classification.md (rewritten), phase2/2G-privacy.md, adr/ADR-008-typed-entity-tables.md, adr/ADR-011-reference-content-versioning.md. Every changed item ends with "(rev P3)".

| Finding or ruling | File | Item | Change (one line) |
|---|---|---|---|
| DA-01, P3-X1-02 | 2B-classification | §1.2 B-C10 to B-C16, B-C20 to B-C27, every row | Codes now only E0/E1/E2 (hash, secret reference, files described as forms, not codes); about 70 narrative fields moved to E1 |
| DA-01, P3-X1-02 | 2B-data-model | notation, B-D18, new B-D21, ~67 table rows | `_enc` = E1/E2; narrative columns renamed `*_enc bytea` (E1); search = decrypt-and-filter, bounded pages, no plaintext index |
| DA-01 | 2B-data-model | B-D01 | approval payload, risk import rows, AI answers, agent proposals become encrypted JSON (E1) |
| DA-01 | ADR-008 | D8-2, D8-5, new D8-7, new C8-6, S8-2, V8-3 | E0/E1/E2 per column; encrypted JSON; search consequence |
| DA-03, P3-X1-01, P3-X1-09, P3-X2-29, P3-X2-30 | 2B-data-model | B-D17, B-E22.1, M22 diagram, B-RC32 | hash input: HMACs of ip/pd/details; added `details_enc`, `details_hmac`, `ip_prefix`, `outcome`, `refusal_code`, `on_behalf_of`, eight actor kinds |
| DA-03 | ADR-008 | S8-4 | HMAC rule stated |
| DA-04, P3-X1-03, P3-X2-31 | 2B-data-model | B-E23.1, diagram, B-D18, new B-P24, new section `ks` (B-K01 to B-K06), B-DL07, B-E01.5, B-E12.1 | `file_key_id` replaces `wrapped_file_key`; key ids only in tenant tables; `ks` tables and 8-day destruction window |
| DA-05, P3-X1-04, P3-X1-08, P3-X1-30 | 2B-data-model | control-plane intro, B-E90.2, .4, .5, .8 and new rows | control-plane fields E1 under platform KEK (F-K-30/31), blind index F-K-32, audit HMAC F-K-33 |
| DA-05, P3-X1-04, P3-X1-30, P3-X1-47 | 2G | G-DC-01, -03, -04, -05, -06, -07 | encryption class E1 under the platform KEK; billing store corrected |
| DA-05 | 2B-data-model | A-29 | Closed |
| DA-06, P3-X1-05 | 2B-data-model | control-plane intro | B-E90 list declared the spine v2 control-plane catalogue enforced by ADR-010 CI |
| DA-07, P3-X2-02 | 2B-data-model | B-E08.2, diagram, new B-T08 | shared kinds control/evidence (files included)/policy/risk_snapshot; no include flag; restrictive scope RLS; no auditor risk list or member list |
| DA-07 | 2B-classification | `audit_shared_item`, `auditor_access`, `risk_snapshot` rows | same rule noted |
| DA-09 | 2B-data-model | B-E90.4 | invitation link goes by email only |
| DA-11, P3-X3-03 | 2B-data-model | B-K05, B-DL06 | standby, 8-day key journal, destroyed key gone from every copy within 8 days |
| DA-11, P3-X2-32, P3-X3-25 | 2G | G-1.3, G-DR-06, G-DR-13, G-RET-16, G-OFF-07, G-OFF-10, G-6.3 Keys/Backups | 8-day window; KEK and every multi-Region replica deleted and certified |
| DA-13, P3-X3-09 | 2B-data-model | CP_plan_entitlements diagram, B-E90.27 | metrics include db_bytes, byok, sso, scim, dedicated_cell, pitr_days, external_users |
| DA-15, P3-X1-20 | 2B-data-model | B-RF15, B-RF16 | cite C-M02-08/09, `frameworks.upgrade`, D-K36, D-K37, D-82 |
| DA-15, P3-X1-20 | ADR-011 | D11-6, D11-7, new V11-7 | same interfaces; authorization test |
| P3-X1-46, P3-X3-20 | 2B-data-model | B-RF01, A-25, R-24 | 25 frameworks (OQ-15); A-25 closed; licence check per OD-09 |
| P3-X1-46 | ADR-011 | Context, C11-5 | 25 frameworks |
| P3-X1-11 | 2G | G-D-07 | case record only in Selvara's tenant; staff tool in `console` |
| P3-X1-14, P3-X1-15 | 2B-data-model | new B-E90.9 to B-E90.36, B-E18.4 | join_requests, sso_domains, api_key_routes, portal_link_routes, idempotency_records, platform_audit_anchor, v_routing, usage_event_receipts, ai_provider_reviews, a row for every diagram-only control table, tenant idempotency_record |
| P3-X1-14, P3-X1-15 | 2B-classification | §3 | every control table classified |
| P3-X1-16 | 2B-data-model | B-E90.3 | `source`, `expires_at`, `external` |
| P3-X1-17 | 2B-data-model | new `ops` section B-O01 to B-O06, B-E99.4, B-P25 | ops tables defined, `ops.rate_buckets` name; `ref.dsar_rules` |
| P3-X1-19 | 2B-data-model | new "API exposure" B-API01 to B-API11, new B-V21 | exposure per table group (list instead of a column on every row) |
| P3-X1-21 | 2B-data-model | B-E18.1 | `scopes[]`, owner, ip_allowlist, pepper_version, key_id, `uses` |
| P3-X1-22 | 2B-data-model | B-E18.2, B-E18.3 | webhook `disabled`; delivery outbox status, next_attempt_at, event_type |
| P3-X1-23 | 2B-data-model | B-E16.2, new B-RC35 | export kinds and columns; personal-data output purged at 30 days |
| P3-X1-24 | 2B-data-model | B-E12.1, B-E17.4 | `device_posture_enc` (E1, per coordinator); IntegrationCheck = `control_test` (aligned with 2C) |
| P3-X1-25 | 2B-data-model | new B-E90.37 `break_glass_events`, B-E90.6 | break-glass record table; tax rules cite C-PL-29 |
| P3-X1-26 | 2B-data-model, 2B-classification | B-E01.5, B-E90.2, B-W81 | `tour_prefs` moved to `control.identities` |
| P3-X1-27 | 2B-data-model, 2B-classification, 2G | B-E11.6, M11, G-D-02, G-DC-13 | `signer_name_enc` (E2) |
| P3-X1-28 | 2B-data-model | B-E11.12 | visitor session ≤ 60 minutes |
| P3-X1-29 | 2B-data-model | CP_tenants diagram, B-E90.1 | status adds `maintenance` |
| P3-X1-31 | 2G, 2B-data-model, 2B-classification | G-D-02, B-E17.1 | E2 scope list replaced; `config_contact_enc` E2 with subject key id |
| P3-X1-32 | 2G, 2B-data-model, 2B-classification | G-D-03, B-E16.1 | external recipients E2 per subject; purged with the schedule |
| P3-X1-33 | 2B-data-model | B-E90.5 | IP as enc+hmac+prefix; throttling in auth_throttle, buckets in ops |
| P3-X1-34 | 2B-data-model, 2B-classification | new B-RC21 to B-RC28, §3 RC values, B-C27, B-C33 | sign_in_record, account_credential, platform_lifetime, accountability, staff_record, support, ops_short, ops_medium; undefined names removed |
| P3-X1-35 | 2B-data-model, 2G | B-RC15, G-RET-06 | `financial` per billing entity, provisional 6 years |
| P3-X1-36 | 2B-data-model, 2G | B-RC19, B-E01.5, new G-RET-26 | identity 30 days after last membership; member names 7 years unless erased |
| P3-X1-37 | 2B-classification, 2G | §3 support rows, G-RET-07 | class `support`, 2 years |
| P3-X1-38 | 2B-data-model, 2G | B-DL01, B-E90.5, B-E18.3, B-E17.2, B-E20.1, G-RET-09, -10, -11, -21, -22 | shorter or specific periods adopted; notifications capped at 12 months |
| P3-X1-39 | 2G | G-RET-20 | invites hard-deleted 30 days after terminal state |
| P3-X1-40 | 2G, 2B-data-model | G-RET-19, G-1.3, B-DL07 | blocked files 7 days |
| P3-X1-41 | 2B-data-model | B-E03.4, B-E19.3 | column purges cite B-RC30, B-RC31 |
| P3-X2-18 | 2B-data-model, 2B-classification | new B-E05.6 `policy_remark`, M05 diagram | My remarks table (E1 text; policy id and version; OBJ-SELF) |
| P3-X2-28 | 2B-data-model | B-E90.1, B-E90.15 | `route_mac`, view `v_routing` |
| P3-X2-33 | 2B-data-model | B-E09.7, M09 diagram | invite bound to `vendor_assessment_id` |
| P3-X3-10 | 2B-data-model | new B-E90.38 `trial_policies` | standing trial policy table (C-PL-27) |
| P3-X3-28 | 2B-data-model, 2G | R-20, R-28, R-46 | merged-into suffixes |
| X3 register B | 2B-data-model | A-27, A-31 | Closed |
| G-5 alignment (brief) | 2G | G-5 table, new G-RET-27 | column "2B retention class" on every row; join requests and invitations row |
| Coordinator (reviser D IDs) | all files | platform keys | cite F-K-30 to F-K-33, F-K-10 kept for tenant shred |

## Not applied

| Finding | Reason |
|---|---|
| P3-X1-04 (class name "E1-cp", key F-K-10) | Overridden by DA-01 (only E0/E1/E2) and DA-05 / reviser D IDs: written "E1 under the platform KEK" with F-K-30 to F-K-33 |
| P3-X1-19 (one "API" column on every table row) | Applied as a separate API exposure list (B-API01 to B-API11) plus check B-V21, same coverage, far less churn; check ID B-V17 was already taken, so B-V21 is used |
| P3-X1-24 (f) `integration_check` table | Reviser C chose "IntegrationCheck is a `control_test`, no table" in 2C C-M17-06; 2B aligned |
| P3-X1-24 (e) `device_posture` as PD/E0 | Coordinator asked for E1 (free-form summary); applied as E1 |
| P3-X2-02 (c) `include_files` column, item types framework/requirement/test_run/report_run | Overridden by DA-07 (four kinds, files included by default, no flag) |
| P3-X3-02 | No change requested in ADR-008 (140 tables already stated) |
| Other parts of cross-file findings (2A, 2C, 2D, 2E, 2F, 2H, 2I, 2J, 2K, ADR-003/004/010/013) | Outside my files |
