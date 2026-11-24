# Phase 3 reviser C: change log

Files: `phase2/2C-api.md`, `phase2/2D-workflows.md`, `phase2/2E-iam.md`, `adr/ADR-006-identity.md`, `adr/ADR-014-custom-roles.md`. Every revised item carries "(rev P3)".

New IDs allocated here (other revisers may cite them): C-03a, C-12a, C-63, C-M01-19..22, C-M02-08/09, C-M05-14..16, C-M08-15, C-M09-17, C-M13-09, C-M14-14, C-M23-04, C-PL-27 (trial policy), C-PL-28 (provider hooks), C-PL-29 (tax rules); D-11a, D-12d, D-15..D-17, D-82, D-K36 `content.upgrade`, D-K37 `content.upgrade.in_audit`, D-K38 `tenant.offboard`, D-K39 `tenant.byok`, D-P13 `platform.tenant.admin-reset`, D-P14 `platform.trial.policy`, D-P15 `platform.tenant.restore`, D-P16 `billing.tax_rule`; E-72i, `frameworks.upgrade`; V-014-7. Findings proposed clashing IDs (X1-20 and X2-22 both D-K36/37; X1-25, X2-11, X2-15 all D-P13 or C-PL-27); they were renumbered as listed.

| Finding or ruling | File | Item | Change (one line) |
|---|---|---|---|
| DA-06, P3-X1-06, P3-X2-26, P3-X3-18 | 2C | C-01, C-04, C-05, C-12a, §4 intro | Sessions read via `cp_tenant_api.session_resolve`, never cached; C-05 uses `cp_tenant_api` functions; console only holds `cp_rw` |
| DA-06, R2-01, P3-X2-26 | 2E | §2.1, §2.2 diagram, E-21, SD-E5 | No cache for sessions/memberships/tenant status; static routing cache only; CP participant `cp_router_ro + cp_tenant_api`; permission set read in transaction |
| DA-06, R2-01 | ADR-006 | Decision 1, V-006-2 | No session cache, `cp_tenant_api`; revocation test with warm routing cache |
| DA-07, P3-X2-01 | 2C | OBJ-AUD, M06 section note, C-M06-17 | Shared kinds control/evidence/policy/risk_snapshot; 404 for unsharable routes; no risk list; snapshots only via C-M08-13 |
| DA-07, P3-X2-01 | 2E | E-31 M06 risk.read auditor cell | "S = risk snapshots shared with live engagement only; no risk list" |
| DA-07, P3-X2-02 | 2C | AuditSharedItem shape, C-M08-05 | Four kinds, files included by default, `frozen`; revoke refused `AUD-FROZEN` when frozen |
| DA-07, P3-X2-02(e) | 2E | §2.2 diagram | Prologue sets `app.scope` and, for auditors, `app.engagement_id` |
| DA-07 | 2C | C-20, C-M01-01, C-M22-05, S-AS-43 | Auditors get no member list or ids; display names on shared records only |
| DA-07 | 2E | E-42, E-43 | Kinds per DA-07, no includeFiles; no member list or ids |
| P3-X2-03 | 2C | C-SH-02, C-SH-03, C-M21-01, C-M05-02, C-M02-01/02/07, C-M03-10/14, C-M04-07, C-M23-02/03 | Engagement scope on aggregates and cross-module routes; `auditor.viewed` in OBJ-AUD |
| DA-08, P3-X2-04 | 2C | C-M01-02, C-M01-05, C-M01-03, C-SC-03, C-SC-05 | Single privileged definition; analyst not privileged; SCIM non-privileged only |
| DA-08, P3-X2-04, P3-X2-14 | 2D | Kinds header, D-K05 | Privileged definition stated; D-K05 needs 2 when adding any S permission |
| DA-08 | 2E | E-33d, E-54a, E-55 | Privileged = admin, owner, custom with admin-only permission; SCIM/JIT non-privileged only |
| DA-08 | ADR-006 | Decision 4, 5, V-006-5 | Same definition; SCIM non-privileged |
| DA-08 | ADR-014 | Decision tenant 4, V-014-7 | Same definition; new verification check |
| DA-09, P3-X2-11 | 2C | C-PL-05, C-AC-13, S-AD-06 | Resend first-admin invitation by email only; no link to staff; 4E D-P13 on email change; invitee one-time code |
| DA-09, P3-X2-11 | 2D | D-P13, D-11a | New kind `platform.tenant.admin-reset`; invitation by email only |
| DA-09 | 2E | E-72i | Staff never receive invitation links or tokens |
| DA-14, P3-X2-18, P3-X3-21, P3-X1-48 | 2C | C-M05-14, C-M05-15, S-AS-02, C-DR3 | "My remarks" endpoints; C-DR3 resolved by OD-05 |
| DA-14, P3-X2-19, P3-X3-21 | 2C | C-M13-09, S-RK-23 | Risk-classify endpoint; matrix says fixed, not dropped |
| DA-14, P3-X2-20 | 2C | §8 legend, S-RK-32, S-ST-30, S-ST-42, S-AD-04 | Labelled "Dropped by owner (OD-05)" |
| DA-15, P3-X1-20 | 2C | C-M02-08, C-M02-09, §8.5 | Reference-content upgrade preview and request endpoints |
| DA-15, P3-X1-20 | 2D | D-K36, D-K37, D-82 | Approval kinds and apply job |
| DA-15, P3-X1-20 | 2E | E-30.10, E-31 | `frameworks.upgrade` (S), admin only |
| C-M23-02/03 orphans, P3-X2-21 | 2C | C-26, C-M23-02/03/04, S-AS-23/24, S-RK-06/28/34 | Download token (F-U-06), upload complete; endpoints mapped to screens |
| P3-X2-05 | 2C | C-M13-02/03/04/06, C-M14-07, C-M06-08, C-M09-10/12, C-M14-01, C-M17-03 | Permission plus object rule on every route (E-35) |
| P3-X2-06 | 2C | C-M06-09 | Reopen of Closed needs `risk.approve` |
| P3-X2-07 | 2C, 2D | C-M12-04, D-K03 | Membership change needs `members.manage` or 4E `team.offboard` |
| P3-X2-08 | 2C | C-M18-01/02, C-M19-01, C-M01-02/03/13 | STEP per E-16; `read:evidence-files` is 4E |
| P3-X2-09 | 2C | C-03a, C-M03-12, C-M04-03/04, C-M07-01..03 | OBJ-KEY on write scopes; non-OBJ-KEY routes refuse keys |
| P3-X2-10 | 2C, 2D | §4 intro exceptions, C-PL-13, platform header | No-ELEV exceptions listed; D-P12 request exception |
| P3-X2-12 | 2C | C-PL-17, C-PL-18, C-PL-25 | staff.read GET, immediate suspend, last-holder; roles.read; custodian + reviewer ≠ opener |
| P3-X2-13 | 2C | C-PL-06 | Assign vs manage split; 4E `platform.limits` |
| P3-X2-13 | 2E | E-73a, E-80.05 | Billing Officer ceiling gains `approvals.decide` (D-P10/11/16) |
| P3-X2-13 | ADR-014 | Status, platform 2 | Accepted (OD-07); Billing Officer decide note |
| P3-X2-15 | 2C | C-PL-02, C-PL-27 | `kind`; trial policy endpoint |
| P3-X2-15 | 2D | D-11, D-11a, D-12d, D-P14, D-80 | Trial policy kind, auto-approval inside policy, trial deletion, daily digest |
| P3-X2-16 | 2C | C-M01-17 | Never files, DSAR data or secrets |
| P3-X2-17 | 2C, 2E | C-SC-04/05, E-55, E-57 | Last two admins, bulk pause, IP allow-list |
| P3-X2-22 | 2C | C-M05-16, C-M08-04, C-M08-15, C-M09-17, C-M14-14, C-M01-19..22, C-M19-01, C-PL-28 | Endpoints for workflow transitions and controls without one |
| P3-X2-22 | 2D | D-K38, D-K39, D-P15, D-12 diagram, D-14 note | Offboarding, BYOK, restore kinds; customer request path |
| P3-X2-30 | 2C | C-63, C-M22-01, F-EV-03 markers | Audit convention; eight actor kinds; outcome/refusalCode; audited reads |
| P3-X2-31 | 2D | D-12a(5), D-12c | Delete every `ks` row; E0 plaintext until PITR end; `ks` roll-off date (8 days, DA-11) |
| P3-X2-36 | 2C | C-PU-07, C-M11-09 | Chat answers only from public or granted corpus |
| P3-X1-10 | 2C | C-87 | Webhook secret in secrets manager by reference |
| P3-X1-11 | 2C, 2D | C-PL-23, C-D8, C-AC-16, D-56 | Selvara-as-controller DSARs run in Selvara's own tenant |
| P3-X1-12 | 2D | D-61 | Live `v_routing` via `cp_router_ro`; fail closed, no 15-min replica |
| P3-X1-23 | 2C | C-EX-01 | Rows are `report_run` kind `module_export` |
| P3-X1-24 | 2C, 2D | Evidence, Questionnaire, TrustChat, VendorPortalInvite, Person shapes; C-M17-06; §2.19 note; C-PL-11; D-63, D-03 diagram | Names aligned with 2B; storage notes; `expires_on` |
| P3-X1-25, P3-X3-18 | 2C, 2D | C-09, C-PL-28, C-PL-29, D-P16 | Hook paths per X3-18; tax-rule endpoint and kind |
| P3-X1-25 | 2E | E-78b | Break-glass record is a platform audit-log entry |
| P3-X1-29, P3-X3-18 | 2C | C-07, SD-C3, C-PL-01/02 | `trust_public_ref`; `customerRef` |
| P3-X3-18 | 2C | C-10 | Worker path `/api/internal/worker/<class>` |
| P3-X1-33 | 2E | E-10a, §2.1 | `control.auth_throttle`; `ip_enc`/`ip_hmac`/`ip_prefix` |
| DA-05 | 2E, ADR-006 | E-27, §2.1, Personal data | Identity email E1 under platform KEK + blind index; session IP E1 |
| P3-X1-44 | 2D | D-15, D-16, D-17, D-62, D-66 | Questionnaire, AI review, support-question state machines; incident deadlines; support grant end |
| P3-X3-28 | 2D | R-32 | Suffix "(merged into R-18, Phase 3 register)" |

## Not applied

| Finding | Reason |
|---|---|
| P3-X2-02 (a) item list (evidence_version, ref_requirement, test_run, report_run, includeFiles) | Overridden by DA-07 (four kinds, files included by default, no flag). |
| P3-X2-03 "includeFiles=true" wording (C-M23-02/03, C-M04-07) | Overridden by DA-07; replaced by "parent evidence shared". |
| P3-X2-01 (a) cell text "— (… no `risk.read`)" | DA-07 keeps auditor `risk.read` as S, defined as shared snapshots only. |
| P3-X2-04 (a) "includes base admin, owner and analyst"; (d) owner question | Overridden by DA-08 (analyst not privileged; definition by admin-only permission). |
| P3-X2-05 note on an E-31 row for non-admin AI system owners | Role change outside OD-06; owner decision (X2 open item 4). 2C text applied as proposed, so `ai.read` + OBJ-OWN only reaches holders of `ai.read` (today admin and owner). |
| P3-X1-25 C-09 path `/api/v1/hooks/<provider>/<config_ref>` | Conflicts with P3-X3-18, which also edits 2I and ADR-007; X3-18 path used. |
| P3-X1-21 rename `uses`/`useCount` | Either side may rename; left to the 2B reviser to avoid a double rename. |
| P3-X1-24 (e) drop `devicePosture` | Chose the other option (keep it); 2C now notes it needs 2B column `person.device_posture`. |
| P3-X1-26, P3-X1-14, P3-X1-16, P3-X1-22, P3-X1-27, P3-X1-28, P3-X1-32, P3-X1-34 parts naming 2C | Proposed edits land only in 2B/2G (2C text already matches the proposals). |
| P3-X2-28 | Proposed edits land in 2B, 2A and 2F only; 2C and 2E already use `POST /account/session/tenant` and active-tenant-only logging. |
| P3-X2-15 F-AB-10 text, P3-X2-26 other files, P3-X2-27, P3-X3-13 | Not in my files (2F, ADR-010, 2A, 2H). |
