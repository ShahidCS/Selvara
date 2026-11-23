# Phase 3 revision log, reviser D

Files: phase2/2F-security.md, adr/ADR-003, adr/ADR-012, adr/ADR-013, phase2/2I-billing.md, adr/ADR-007, phase2/2J-testing.md. Every edited cell or line ends with "(rev P3)".

| Finding or ruling | File | Item | Change (one line) |
|---|---|---|---|
| R2-03 | 2F | F-D-03, F-D-04, F-DR-05, F-DR-06 | "Proposed amendment" replaced by "accepted as R2-03" |
| DA-11, P3-X3-03, P3-X2-31 | 2F | F-D-05, F-C-09, F-7.2 `ks` row | `ks` DR-region standby, 8-day off-site key journal with tombstones, exclusion from exports/WORM/off-site; destruction window stated precisely: no copy holds a destroyed key more than 8 days after destruction |
| DA-04, P3-X1-03 | 2F | F-D-06 | Wrapped file and subject keys only in `ks`; tenant tables hold key ids and versions only |
| DA-03, P3-X1-01, P3-X2-29 | 2F | F-D-09, F-L-03, F-AB-06 | Hash input excludes `ip_enc`, `pd_enc`, `details_enc`; carries their keyed HMACs (B-D17) |
| P3-X1-09, P3-X2-29 | 2F | F-L-02 | Field names aligned with 2B B-E22.1 (`chain_n`, `ip_enc`/`ip_hmac`/`ip_prefix`, `pd_enc`/`pd_hmac`, `detail` E0, `details_enc`/`details_hmac`); kept `outcome`, `refusal_code`, `on_behalf_of`, `actor_principal` |
| DA-01, DA-05, P3-X1-02, P3-X1-04, P3-X1-10 | 2F | F-D-12 | Only E0/E1/E2; E1 = narrative free text; decrypt-and-filter E1 search, no plaintext index; `cp` E1 under platform DEK with blind index; secrets removed from E1 |
| DA-05, P3-X1-04 | 2F | F-K-30, F-K-31, F-K-32 (new) | Platform KEK, platform DEK for `cp` E1 fields, platform blind-index key |
| DA-03 | 2F | F-K-33 (new) | Audit HMAC key for hashed personal fields |
| DA-01 | 2F | F-ISO-33, F-DR-07 | E1 decrypt-and-filter search within the tenant's request |
| P3-X3-18 (P3-X1-25) | 2F | F-C-02 | Payment callbacks `/api/v1/hooks/billing/<config_ref>` |
| Brief (wrong refs), P3-X2-34 | 2F | F-T-003, 004, 005, 012, 013, 016, 017, 030, 032, 033, 051, 052, 074, 081, 085, 092, 093, 094, 101 | Ref column now cites existing items (2C C-20/C-22, 2E E-26, 2C C-55 to C-59, F-4.2 F-ISO-xx, F-AB-03/E-35, F-CP-05, F-ISO-32, F-7.2, 2H H-EM-04, ADR-007 D7-9/2D D-90, 2C C-58, 2D D-06/2B B-E09.7, F-ISO-14, F-AB-12) |
| DA-02, P3-X2-23 | 2F | F-T-011, F-AB-02, F-ISO-03, F-ISO-04, F-ISO-06 (new), F-IT-11, F-IT-12, F-IT-38 and F-IT-39 (new), F-SD-01, F-SD-03 | Injected `SET ROLE` succeeds if SQL injection exists; one R-56 control block; extended protocol only incl. router prologue; tests prove controls; residual inside owner-accepted C1-01 (R-02) |
| P3-X3-14 | 2F | F-ISO-11, F-T-016 | No role-level timeouts; `statement_timeout`/`lock_timeout` from the router prologue |
| P3-X2-25 | 2F | F-T-033, F-T-051, F-ISO-32 | One SECURITY DEFINER allow-list; `ops.enqueue()` renamed `ops.emit()` |
| R2-01, P3-X2-27 | 2F | F-IT-02, F-T-024, F-ISO-31 | No cache of sessions, memberships, tenant status; only static routing fields 30 s |
| P3-X2-28 | 2F | F-ISO-01 | `control.sessions` (`identity_id`, `tenant_id`), `POST /account/session/tenant`, target-tenant log only (E-26) |
| P3-X2-13 | 2F | F-T-026 | E-73 fixed names, E-74 never-grantable list, dual-role four-eyes |
| P3-X2-33 | 2F | F-T-093, F-T-094 | Vendor scope bound to `vendor_assessment`; restrictive RLS with `app.vendor_assessment_id` |
| P3-X2-36 | 2F | F-T-100 | IdP-initiated login disabled (E-51) |
| DA-08, P3-X2-04 | 2F | F-T-102, F-AB-12, F-IT-34 to F-IT-37 | Privileged = admin, owner, custom with admin-only permission; analyst not privileged; SCIM/JIT only non-privileged; privileged only by in-app four-eyes `team.role` |
| DA-07, P3-X2-01(d), P3-X2-02(d) | 2F | F-AB-08, F-ISO-12, F-ISO-14 | Shared kinds control/evidence (files included)/policy/risk_snapshot; no risk list; no member list or ids; RLS deny elsewhere; auditor writes incl. audit tests; scope settings |
| P3-X2-15, OD-04 | 2F | F-AB-10 | Trials only by staff under the trial policy (2I I-4.4.3); shred by 30 days after trial end |
| DA-15, P3-X1-42 | 2F | F-AB-13 to F-AB-16 (new), F-TLS-06, F-4.3 suite note | Fraudulent DSAR, SSRF via webhooks and integrations (2H egress design), automation-rule abuse, external report distribution |
| P3-X2-35 | 2F | F-2.13 (new) | Residual acceptance register for all M residuals |
| P3-X2-32, P3-X3-25 | 2F | F-K-10, F-7.2 KMS row | KEK deletion includes every multi-Region replica |
| P3-X2-12 | 2F | F-K-13, F-CP-04 | Dual-role vote (D-P04); staff removal immediate (E-77) |
| P3-X2-26 | 2F | F-CP-02 | `cp_tenant_api` function catalogue enumerated |
| P3-X2-16 | 2F | F-CP-03 | Support views through the router as `t_<tkey>_ro` with scope `support`; `support_ro` removed |
| P3-X1-10 | 2F | F-S-06 | Webhook secret in the secrets manager, `signing_secret_ref` |
| P3-X3-28 | 2F | R-40 | Marked merged into R-56; treatment = R-56 controls |
| P3-X3-03, P3-X2-32 | 2F | R-41 | Region loss added; re-rated M/Crit; standby and journal |
| DA-05 | ADR-003 | Decision 2 | Platform KEK defined (F-K-30..32) |
| DA-04, DA-11, P3-X3-03 | ADR-003 | Decision 3 | `ks` tables incl. platform DEK; no wrapped keys in tenant tables; DR standby, 8-day journal, precise destruction window |
| DA-01 | ADR-003 | Decision 4, C3-02 | E0/E1/E2 only; E1 free text; decrypt-and-filter search |
| P3-X2-32 | ADR-003 | Decision 6 | Replica keys deleted with the KEK |
| P3-X3-08, DA-13 | ADR-003 | C3-01 | Cost lines for `ks` standby, replica keys, platform KEK |
| DA-11 | ADR-003 | C3-04, C3-05, Security implications | 8-day window covers standby and journal |
| P3-X3-25 | ADR-003 | V3-04 | Replica keys deleted |
| DA-11, DA-04 | ADR-003 | V3-09, V3-10 (new) | `ks` loss drill; no wrapped keys in tenant tables |
| P3-X2-34 | ADR-012 | Decision 1, V12-07 (new) | Container restarted after N scans (default 100) |
| DA-03, P3-X1-01 | ADR-013 | Context, Decision 4, Security implications, V13-08 (new) | Hash over keyed HMACs of personal fields, not ciphertext |
| P3-X3-18 | ADR-007 | D7-6 | Path `/api/v1/hooks/billing/<config_ref>` |
| P3-X2-34, DA-15 | ADR-007 | D7-9 (new), C7-5 | Queue with retry and dead-letter (D-90); egress via 2H egress design |
| OD-01 | ADR-007 | D7-8 | Cites OD-01 |
| P3-X3-18 | 2I | I-3.2.2, I-11.4, I-SD2 | Path `/api/v1/hooks/billing/<config_ref>` |
| P3-X3-15 | 2I | I-4.1.5, I-4.3 diagram | Entitlements cached per instance 30 s by `entitlements_version`; worker uses `cp_worker` |
| P3-X3-09, DA-13 | 2I | I-4.2.2, I-4.2.10 to I-4.2.14 (new), I-D5 | `db_bytes`, `byok`, `sso`/`scim`, `dedicated_cell`/`pitr_days`, `external_users`; `plan.feature_not_included` |
| P3-X3-10, OD-04, DA-13, DA-10 | 2I | I-4.4.3, I-SD1 | Trial limits defined once (trial policy, caps incl. 10% of CR-1), decommission path; `trial_policies` added |
| DA-13, P3-X3-08, DA-10 | 2I | I-4.5 (new) | Cost coverage: corrected cost model, cost drivers as entitlements, CR-1 basis |
| P3-X1-34, P3-X1-35 | 2I | I-6.3.5 | `financial` (B-RC15), period per entity, provisional 6 years *(verify)* |
| DA-15 | 2I | I-9.5 | Egress through the 2H egress design |
| R2-03 | 2I | I-11.1 | Tenant billing views via `cp_tenant_api` functions |
| P3-X3-10 (register R-64) | 2I | R-64 (new) | Trial flood risk |
| R2-01 | 2J | J-ISO-05 | No cache of sessions, memberships, tenant status |
| DA-02, P3-X2-23 | 2J | J-ISO-25, J-SEC-30, J-SEC-32 | Succeeds if injection exists; tests prove controls (F-ISO-06, F-IT-38/39); extended protocol incl. router |
| P3-X2-25 | 2J | J-ISO-26, J-ISO-27 | No TEMPORARY exception; shared SECURITY DEFINER allow-list |
| DA-07 | 2J | J-AUTHZ-20 | Shared kinds, no risk list, no member list or ids |
| DA-08 | 2J | J-AUTHZ-32 | SCIM only non-privileged roles |
| DA-11 | 2J | J-RST-09 (new), J-SHR-06, J-SHR-10 (new) | `ks` loss drill; standby, journal and replicas in the shred post-check; 8-day window test |
| P3-X3-12 | 2J | J-7.1, H13 (new) | Open-loop traffic at A-NFR-07; fairness hypothesis |
| P3-X3-11 | 2J | H1, H4 | List target; 45 min migration |
| P3-X3-04, DA-12 | 2J | H2, H12 (new), J-7.2.1, J-7.2.2 | Uncached `cp` read in routing budget; `cp` aggregate load test; knee list |
| P3-X3-02 | 2J | H3, J-7.2.5 | 140 tables, 800 to 850 relations; 2B catalogue |
| DA-10, P3-X3-01 | 2J | J-7.2.3, J-7.2.4, J-DR2, J-SD2, A-60 | CR-1 (provisional 300, floor_100(0.6 K), triggers, 80% provision, refuse) |
| P3-X3-16 | 2J | J-DR1 | Existing-workflow edits need DU-07 |
| P3-X3-28 | 2J | R-56, R-58, R-59 | R-56 master for R-40, residual inside accepted C1-01; R-58 → R-12; R-59 → R-10 |
| OD-05 | 2J | J-PAR-06 | S-AD-04 dropped by owner |

## Not applied

| Finding | Part not applied | Reason |
|---|---|---|
| P3-X1-04 | Key ID "F-K-10" for the control-plane key and class "E1-cp" | F-K-10 already exists (tenant crypto-shred procedure, cited by 2G G-RET-02 and ADR-003); new IDs F-K-30..F-K-32 used instead. "E1-cp" conflicts with DA-01 (only E0/E1/E2); written as "E1 under the platform DEK". **2G and 2B revisers must cite F-K-30/F-K-31/F-K-32, not F-K-10.** |
| P3-X1-02 | Named E0 exceptions in F-D-12 / ADR-003 | DA-01 sets the rule; no exceptions kept. |
| P3-X2-04 | "analyst is privileged under E-33d"; SCIM privileged mapping creates a pending `team.role` approval | DA-08: analyst is not privileged; SCIM may assign only non-privileged roles (refused, then in-app four-eyes). |
| P3-X2-01(d) | RLS list "M02 to M06, M08, M16, M22, M23" | DA-07 shared kinds applied instead: deny-by-default RLS on every `_ro`-readable table, admitting only shared items and the engagement's M08 rows. |
| P3-X2-02(a) | Item types framework/requirement/test_run/report_run and `includeFiles` | DA-07: kinds are control, evidence (files included by default), policy, risk_snapshot; no `includeFiles` flag. |
| P3-X2-23 (item 4) | Prologue may be one simple-protocol string | DA-02: router setup statements also use the extended protocol; no simple-query multi-statements. |
| P3-X2-24 | F-T-011 residual "owner acceptance pending" | DA-02: residual is inside the owner-accepted C1-01 (R-02). R-40 marked merged into R-56 (P3-X3-28). |
| P3-X2-32 | Accepted residual R-41a for region loss | Superseded by DA-11 (DR-region standby and key journal); R-41 re-rated instead. |
| P3-X2-29 | Drop `details_e1` in favour of `detail` only | P3-X1-09 adopted (superset: `detail` E0 plus `details_enc` E1 with `details_hmac`), consistent with DA-03. |
| P3-X1-25 | Path `/api/v1/hooks/<provider>/<config_ref>` | P3-X3-18 chosen (`/api/v1/hooks/billing/<config_ref>`); one path, same intent. |
| P3-X2-34 | F-T-017 ref "2C §1.8" | §1.8 is not an item ID in 2C; cited "2C §1 (authorisation notation)". F-T-003 "2C C-11" and F-T-005 "C-60" do not exist; cited C-20/C-22 and C-55 to C-59. |
| P3-X2-34 | F-7.2 "synchronous standby *(verify plan)*" | Replaced by the DA-11 DR-region standby. |
| Cross-file parts of every finding above (2A, 2B, 2C, 2D, 2E, 2G, 2H, ADR-002, ADR-004, ADR-010, ADR-014, risks.md, summary) | — | Outside reviser D's files. |
