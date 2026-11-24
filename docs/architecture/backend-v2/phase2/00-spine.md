# Design spine v2 (binding for every workstream)

**Spine v2 (Phase 3, 2026-11-23); v1 superseded.**

Version 2 (Phase 3, 2026-11-23): folds in R2-01, R2-03, OD-01 to OD-11, OQ-14, OQ-15, the design-authority rulings DA-01 to DA-15, and the spine deviations SD-A1 to SD-A4, SD-B01 to SD-B05, SD-C1 to SD-C4, SD-D1 to SD-D3, SD-E1 to SD-E5, SD-F-01 to SD-F-03, SD-H1, SD-H2, I-SD1 to I-SD3, J-SD1, J-SD2 (as CR-1). The change table at the end lists every change against v1.

Owner: design authority. Every Phase 2 and Phase 3 document must agree with this spine. If a workstream finds it must deviate, it records the deviation in a "Spine deviations" section with the reason; it never silently differs. The deviations folded in above are no longer deviations.

## S0. Inputs and accepted decisions

- Phase 1 documents: `/home/user/Selvara/docs/architecture/backend-v2/` (discovery summary, inventory, assumptions, decisions, risks, open questions). Read them.
- Existing system (v0.2.5) to learn from, not to copy blindly: `front-end/src/server/**`, `supabase/migrations/0001-0011`, `docs/architecture/BACKEND_FOUNDATION.md`, `docs/security/SOD_MATRIX.md`, `docs/security/CONTROLS.md`.
- ADR-001 (accepted): one Postgres schema per tenant in one Supabase project ("cell"). Residual risk C1-01 is accepted by the owner, with compensating controls.
- Owner answers: no live data (greenfield); one region now, cells later; all sectors (regulated buyers, possible health special-category data); TypeScript and Node; Supabase Auth kept; SSO (SAML/OIDC) and SCIM needed; BYOK needed; all 25 frameworks in the library (OQ-15; the earlier figure of 28 was an error); AI providers pluggable (off by default); integrations configurable; plan limits per user, framework, storage and API calls; four-eyes approval gates; maximum upload size configurable by a super admin under a hard platform ceiling; no team (automate everything except human approvals); back up every change, retained while the client is active; deletion reviewed by super admins and evidenced. (rev P3)
- OQ-01 and OD-07 (owner): platform roles are **Management Approver** (super admin with all access; still bound by four-eyes and no self-approval), **CISO** and **support**. A super admin can create custom platform roles in the Admin Console **only from the fixed list of nine predefined names** in 2E E-73 (Billing Officer, Privacy Officer, Security Analyst, Support Agent, Compliance Reviewer, Internal Auditor (ISMS), Platform Operations Engineer, Release Manager, Customer Success Manager). Each has a permission set inside that name's ceiling (E-74). Extending the list is a code change through the release gate. (rev P3)
- OQ-02 and OD-01 (owner): Stripe is the configured target payment provider. At launch the Pakistan entity `ENT-PK` bills **by bank transfer** through the payment-provider abstraction (ADR-007). The Stripe adapter is built and switched on once a Stripe-eligible Selvara entity (UAE, US or UK) exists; VC-07 is verified first. Merchant-of-record and local-processor adapters stay configurable slots. Risk R-04 stays open and visible. (rev P3)
- OQ-03: crypto-shredding accepted, subject to the conditions in the discovery summary §6.
- Owner decisions of 2026-11-23 (Phase 2 summary §8): OD-02 external cloud account (KMS, scanner, off-site WORM copies); OD-03 protected-file changes approved in principle; OD-04 trials provisioned under one standing four-eyes trial policy with a daily digest; OD-05 dropped: demo card form, S-AD-04, S-ST-42, S-RK-32; kept and built: S-AS-02; fixed: S-RK-23; OD-06 † role changes of 2E E-31; OD-09 reference content ships ids, titles and Selvara paraphrases; OD-10 pseudonymous audit ids; OD-11 cost model as planning basis; OQ-14 home region `R1` = Frankfurt. (rev P3)
- OQ-05 to OQ-12 accepted as recommended:
  - ISO 27005: both methods (asset-based and event-based).
  - Auditors scoped to their engagement.
  - Trust Center: sections chosen per tenant; NDA accepted per person; references by id.
  - RoPA per tenant; Selvara's own RoPA in the control plane.
  - Demo-only features are in scope (no downgrade).
  - Platform staff see only minimal tenant contact data, and every view is logged.
  - Merchant of record allowed later.
  - Two people hold the super-admin roles.
- F1-01 and F1-02 are being fixed in v0.2.x now. v2 must keep both fixes: auditor engagement scope with explicit shared items (S5), and Trust Center section and NDA rules.
- Design-authority rulings DA-01 to DA-15 (Phase 3) are binding and are folded into S1 to S8 below. (rev P3)

## S1. Topology

| Item | Decision |
|---|---|
| Cell | One Supabase project in one region. Launch: cell `c1` in `R1` (Frankfurt). Capacity rule **CR-1**: the provisional threshold is 300 tenant schemas per shared cell until J-PERF measures the knee `K`, then floor_100(0.6 × `K`). Warm-pool, canary, trial and restore schemas count toward it. The secondary triggers of 2A A-PH-03 also apply. A new cell is provisioned at 80% of the threshold, and placement is refused at the threshold. A dedicated cell (one project per enterprise tenant, same layout) is opened on contract or when one tenant exceeds 10% of a shared cell (A-PH-05). (rev P3) |
| Schemas per cell | `ref` (shared reference content, read-only to tenants, versioned; includes `ref.dsar_rules`), `t_<tkey>` one per tenant, `ops` (job queues and job state: `job_dedupe`, `tenant_slots`, `tenant_job_pause`, `provisioning_steps`, `usage_events`, `rate_buckets`, dead-letter queues; no tenant business data), and the Supabase-managed `storage`. Cells do not use their `auth` schema. `control` exists only in `cp` (S2). (rev P3) |
| Tenant key `tkey` | A random 16-character lowercase base32 identifier, assigned at provisioning, never derived from the tenant name or the customer reference. Schema name `t_<tkey>`. |
| Control plane location | A dedicated control-plane project `cp` in `R1` from launch (ADR-010 option B). It holds Supabase Auth, `control` and its own `ops`. Tenant cells hold no control-plane tables and use no Auth; there is no routing replica in cells at launch (ADR-010); a later replica may hold static routing fields only, never sessions, memberships or tenant status (R2-01). A separate key-store project `ks` in `R1` holds wrapped tenant DEKs, subject keys, file keys, blind-index keys and the wrapped platform DEK (ADR-003). Its continuity follows ADR-004: a standby in the DR region and an 8-day off-site key journal (DA-11, S7). (rev P3) |
| Hosting | Two Vercel production projects (R2-03), function region fra1. **`app`** serves the tenant API, account API, SCIM, public endpoints, provider callbacks and worker endpoints. **`console`** serves the platform API and Admin Console on its own hostname, and only `console` holds platform-write credentials. Jobs run through Supabase Queues (pgmq) and `pg_cron` + `pg_net` calling the worker endpoint, with a Vercel Cron watchdog; the fallback is `ops.job` with `FOR UPDATE SKIP LOCKED` (ADR-005). One managed scanner container runs in the external cloud account (ADR-012). Privileged fleet jobs (tenant migrations, decommission drops, large restores) run only in approved GitHub Actions environments. Outbound calls (webhooks, integrations, AI, email, payment) go only to public addresses on per-adapter allow-listed hosts, never to internal or private addresses (2H H-NW-08, DA-15). *(Verify: VC-01, VC-10.)* (rev P3) |
| Object storage | Supabase Storage. Bucket `tenant-files` uses the prefix `<tkey>/...`. `quarantine` holds uploads awaiting their scan. `exports` holds the last 7 per-tenant exports. Every object is application-encrypted with a per-file key under the tenant DEK; the wrapped file key lives in `ks`, and the tenant table holds only its id and version (DA-04). Uploads use Supabase signed upload URLs into `quarantine/<tkey>/<upload_id>` only. Downloads use short-lived, Selvara-signed tokens on a cookieless hostname `files.<domain>`. Only the `storagebroker` module holds the Storage service credential, and paths are derived from router context. Exports are also copied to an object-locked bucket in a separate cloud account and region. (rev P3) |
| External cloud account | Accounts `mgmt`, `kms-prod`, `kms-nonprod` (KEKs, platform KEK, anchor signing key, secrets manager), `workloads-prod`, `workloads-nonprod` (scanner) and `offsite-prod` (WORM bucket, off-site exports and the `ks` key journal, in a region other than `R1`). Two hardware-key administrators (R-A, R-B). Vercel reaches them only by OIDC federation (VC-10). (rev P3) |

## S2. Control plane: what it holds (and only this)

`control.tenants`, `control.tenant_cells`, `control.tenant_schema_versions`, `control.tenant_export_jobs` (final-export job state, FINAL-EXPORT; rev P4), `control.identities` (Supabase user id, email, display name, status, `home_tenant_id`), `control.memberships` (user, tenant, role id, status), `control.tenant_roles` (tenant-defined role ids and names; permissions stay in the tenant schema), `control.platform_staff`, `control.platform_roles` (Management Approver, CISO, support, custom roles named only from the fixed list of nine, OD-07), `control.platform_role_permissions`, `control.platform_approvals` and `platform_approval_votes`, `control.elevations`, `control.support_grants` and `support_sessions`, `control.platform_audit_log` (hash-chained), `control.plans`, `control.plan_entitlements`, `control.billing_entities`, `control.subscriptions`, `control.invoices`, `control.payments`, `control.usage_meters` (aggregated counts only, received as events), `control.provider_configs` (payment, AI, email and scanner providers: secret **references** only), `control.key_registry` (tenant key ids and versions; never key material), `control.deletion_certificates`, `control.support_questions` and `support_messages` (Selvara is the controller for support communication; pasted business content is risk R-60), `control.ropa_selvara` (Selvara's own RoPA), `control.sso_connections` (per-tenant SAML/OIDC metadata), `control.scim_tokens` (hashed). (rev P3)

Accepted additions: `control.sessions` (server-side session record with `active_tenant_id`), `control.invitations`, `control.join_requests`, `control.passkeys`, `control.recovery_codes`, `control.auth_throttle`, `control.account_notices`, `control.sso_domains` (or domain rows under `sso_connections`), the column `control.identities.home_tenant_id`, the column `control.tenants.trust_public_ref`, `control.api_key_routes (key_id, tenant_id, status)`, `control.portal_link_routes (link_id, tenant_id, expires_at)`, `control.idempotency_records` (control-plane responses only), `control.ref_content_releases`, `control.platform_audit_anchor`, the view `control.v_routing` (with `route_mac`), `control.trial_policies` (OD-04), and the billing tables `control.price_lists`, `invoice_lines`, `ledger_entries`, `credit_notes`, `invoice_series`, `provider_events`, `fx_rates`, `tax_rules`, `entitlement_overrides`, `plan_change_requests`, `usage_event_receipts`, `ai_provider_reviews`. (rev P3)

**Allowed catalogue (DA-06).** The two lists above are the complete allowed control-plane catalogue. ADR-010's CI check fails on any other table or view in `cp`; adding one needs a spine change. (rev P3)

**Encryption in `cp` (DA-05).** Personal fields in `control` are E1 under the **platform KEK** in the external KMS (S7), not under a tenant key. `control.identities.email` is E1 under the platform key, with a keyed HMAC blind index (`email_bidx`) for exact-match sign-in lookup. (rev P3)

**Access (R2-03).** The `app` deployment reaches `control` only through `cp_router_ro` (SELECT on `v_routing`) and `cp_tenant_api` (EXECUTE on a fixed set of narrow functions; no table grants). `cp_rw` exists only in `console`. `cp_worker` performs usage ingestion and provisioning, and `migrator` performs DDL. **No session cache (R2-01).** Sessions, memberships and tenant status are read on every request and never cached. Revoking a membership or suspending a tenant revokes the affected `control.sessions` rows in the same transaction. Only static routing fields (cell, schema name, schema version) and entitlements may be cached per function instance, with a TTL of 30 s. (rev P3)

**Load (DA-12).** Because `cp` is read on every request of every cell, it has its own throughput and connection targets (2A A-NFR-07a, A-CN-07) and its own load test (2J H12). (rev P3)

The control plane never holds a tenant's controls, evidence, risks, vendors, policies, audit records, personal data of the tenant's employees beyond member identity, or file contents.

## S3. Request path and isolation (ADR-002)

1. A Selvara session cookie (HttpOnly, `__Host-`) bound to the Supabase user id is verified on the server against `control.sessions`. Supabase Auth tokens are used only during sign-in. The active tenant comes from `control.sessions.active_tenant_id`, never from the request. (rev P3)
2. Control-plane lookup on every request, with no cache for session, membership or tenant status: the session is live, the membership is active, the tenant is Active, and the routing record (`v_routing`, `route_mac` verified) gives the cell, the schema `t_<tkey>` and the schema version. Any miss fails closed (401, 403 or 404). The answer is 503 when the schema version is outside the release's supported window `[N-1, N]`. (rev P3)
3. Tenant transaction on the cell, through the pooler in transaction mode, logged in as `selvara_router_a` or `selvara_router_b` (rotating logins, members of the NOLOGIN group `selvara_router`). The router sets, with transaction scope: the role `t_<tkey>_rw` (or `_ro`); `search_path = t_<tkey>, ref, pg_temp`; `app.tenant_id`, `app.user_id`, `app.request_id` and `app.scope` (member, auditor, vendor, support, trust_public), plus `app.engagement_id` for auditors; `statement_timeout` (8 s default, 60 s on `ro` report and export paths) and `lock_timeout = '3s'`; then it runs the context assertion. Every setup statement is a parameterised statement over the extended protocol (for example `set_config('role', $1, true)`), never a simple-query multi-statement string (DA-02). The role and schema names are derived only from a `tkey` validated against `^[a-z2-7]{16}$`. Every tenant table has `tenant_id uuid not null` with an immutable literal CHECK pinned to the tenant's uuid, a context trigger, and forced row-level security equal to `current_setting('app.tenant_id')`, as defence in depth. (rev P3)
4. Roles: `selvara_router` (NOLOGIN group; logins `_a` and `_b`, NOINHERIT, membership of every `t_*_rw` and `t_*_ro` with `INHERIT FALSE, SET TRUE`, owns nothing); `t_<tkey>_rw` (USAGE on its own schema, SELECT on `ref`); `t_<tkey>_ro` (exports, auditor, support and public reads); `t_<tkey>_purge` (retention purge job only); `t_owner` (NOLOGIN owner of all tenant objects, used only by `migrator`); `ref_owner` (owns `ref`); `tenant_admin` (owns `ops.provision_tenant`, CREATEROLE, not superuser); `fleet_observer` (catalog and statistics views only); `cp_router_ro`, `cp_tenant_api`, `cp_rw` (console only), `cp_worker` and `support_ro` in `cp`; `ks_rw` (key service only) in `ks`; `migrator` (CI only). No application path uses a superuser or the service role for tenant data. The single exception is `storagebroker`, which uses the Storage service credential for object operations only. (rev P3)
5. One routing module (`router`) is the **only** code allowed to issue `SET ROLE`, `RESET ROLE`, `set_config('role', ...)`, `set_config('search_path', ...)` or `set_config('app.*', ...)`, or to open a cell pool. **Critical constraint (R2-06, R-56, DA-02):** if SQL injection exists anywhere in a routed transaction, an injected `SET ROLE` to another tenant's role **succeeds**, because Postgres checks the login's role memberships; RLS and grants do not stop it. The controls (2F F-ISO-06, 2A A-RT-10) are therefore prevention and detection: (a) only `router` issues role and context statements (lint ban elsewhere, CodeQL query, grep of the build bundle); (b) all SQL uses parameterised statements over the extended protocol only, the router's own setup statements included (no simple-query multi-statements); (c) no dynamic SQL is built from input outside `router` and migrations; (d) a database-side detector (pgaudit role and SET classes, or the VC-09 fallback, DU-09) alerts Sev-1 on any role or `app.tenant_id` statement outside the router preamble; (e) F-IT and J-ISO tests prove that each control is in place; they do not claim the attack fails. The residual risk sits inside the owner-accepted C1-01 (R-02). (rev P3)

## S4. Tenant schema: module and table catalogue (names are binding)

The standard columns on every table: `id uuid pk`, `tenant_id uuid`, `ref text unique` (human id, such as CTL-12), `created_at`, `created_by`, `updated_at`, `updated_by`, `version int` (optimistic locking), `deleted_at` (soft delete), `legal_hold bool`, `retention_class text`. History goes to `record_history` (S7). Append-only and immutable tables omit `updated_at`, `updated_by`, `version` and `deleted_at`. `ref` is nullable on child rows without a human id. Every table also carries `created_by_kind` and, where mutable, `updated_by_kind` (user, visitor, API key, agent, job). (rev P3)

Every column has an encryption class E0, E1 or E2 (S7, DA-01); no other class codes are used. (rev P3)

| Module | Tables |
|---|---|
| M01 Settings | `tenant_settings`, `tenant_role`, `tenant_role_permission`, `member_profile` (a tenant-side copy of display data) |
| M02 Frameworks | `framework_scope`, `custom_framework`, `custom_requirement`, `requirement_status`, `control_mapping` |
| M03 Controls | `control`, `control_test`, `test_run`, `control_exception`, `control_attestation` |
| M04 Evidence | `evidence`, `evidence_version`, `evidence_link` (to control, requirement, audit, PBC request, finding, risk, vendor), `evidence_review` |
| M05 Policies | `policy`, `policy_version`, `policy_approval`, `policy_attestation` (acknowledgement history per version), `policy_exception`, `policy_remark` ("My remarks", kept under OD-05) (rev P3) |
| M06 Risk (ISO 27005) | `risk_method_settings`, `risk_criteria`, `asset`, `threat`, `vulnerability`, `risk`, `risk_asset`, `risk_threat`, `risk_vulnerability`, `risk_treatment`, `treatment_action`, `risk_acceptance`, `risk_review`, `interested_party`, `risk_snapshot`, `risk_import` |
| M07 Issues | `issue` (= CorrectiveAction), `issue_task`, `issue_link` |
| M08 Audits | `audit`, `audit_shared_item` (kinds: control, evidence with its files, policy, risk_snapshot; DA-07), `auditor_access`, `pbc_request`, `information_request`, `finding`, `audit_test` (rev P3) |
| M09 Vendors | `vendor`, `vendor_contact`, `vendor_certificate`, `vendor_assessment`, `vendor_finding`, `vendor_request`, `vendor_portal_invite` |
| M10 Questionnaires | `questionnaire_template`, `template_question`, `questionnaire` (inbound and outbound), `question_response`, `answer_library` |
| M11 Trust Center | `trust_settings`, `trust_section`, `trust_document`, `trust_account`, `trust_viewer`, `trust_nda_acceptance`, `trust_access_request`, `trust_subscription`, `trust_chat`, `trust_update` |
| M12 People and access | `person`, `contractor`, `system`, `access_grant`, `access_request`, `access_review` |
| M13 AI governance | `ai_system`, `ai_assessment`, `ai_signal` |
| M14 Privacy | `processing_activity` (RoPA), `dpia`, `data_subject_request`, `dsr_task`, `retention_rule`, `legal_hold` |
| M15 Commitments | `contract`, `commitment`, `incident` |
| M16 Reports | `report_schedule`, `report_run` |
| M17 Integrations | `integration`, `integration_sync_run` (credentials as secret references) |
| M18 API and webhooks | `api_key` (hashed), `webhook`, `webhook_delivery` |
| M19 Assistant and agents | `ai_tenant_settings`, `agent`, `agent_run`, `agent_change` |
| M20 Notifications | `notification`, `notification_pref` (keyed by person, not role) |
| M21 Approvals | `approval`, `approval_vote`, `delegation` (one engine for every module) |
| M22 Audit log | `audit_log_entry` (append-only, hash chain; personal fields enter the hash only as keyed HMACs, DA-03), `audit_anchor` (rev P3) |
| M23 Files | `file_object` (path, hash, size, type, scan state, file key id and version; the wrapped key is in `ks`, DA-04) (rev P3) |
| M24 Help (tenant side) | none; questions live in `control.support_questions` |
| M25 Billing (tenant view) | none; the tenant reads its subscription and invoices through the control-plane API |
| M26 Automation | `automation_rule`, `automation_run` |

Additional tenant tables: `trusted_network`, `ref_counter`, `content_pin`, `content_upgrade`, `control_test_link`, `control_link`, `interested_party_risk`, `kb_document`, `trust_grant`, `visitor_session`, `access_review_item`, `processing_link`, `integration_account`, `schema_migration`, `audit_chain_head`, `record_history` (S7) and `idempotency_record`. `webhook_delivery` doubles as the outbox. M21 registers `policy.approval` and `risk.approval` as approval kinds alongside the M05 history tables. (rev P3)

## S5. Roles

- **Tenant base roles**, kept from today:
  - `admin` (tenant admin)
  - `owner` (control owner or management)
  - `analyst` (contributor)
  - `employee`
  - `auditor` (external, time-boxed, engagement-scoped). Reads only the items shared with its live engagement; the shared kinds are control, evidence (its files included by default; there is no separate files flag), policy and risk_snapshot. Auditors have **no risk list**: `risk.read` for an auditor means only risk snapshots shared with their live engagement. Auditors receive no member list and no member ids; display names on shared records stay. Writes are limited to the engagement's information requests, draft findings and audit tests. (rev P3)
  - `vendor` (scoped to their own assessments)
  - `viewer` (read-only Trust Center member)
- Base-role permissions are those of 2E E-31, including the † changes approved under OD-06 (auditor loses `policies.acknowledge`). An internal read-only role is the custom-role template "Read-only reviewer", not a base role. (rev P3)
- Tenants may also define custom roles (M01) from these base permissions; a custom role can never exceed admin.
- **Privileged role (DA-08):** `admin`, `owner`, and any custom role holding any admin-only permission. `analyst` is **not** privileged. SCIM and JIT provisioning may assign only non-privileged roles; assigning a privileged role needs in-app four-eyes approval. (rev P3)
- **Platform roles:** `management_approver`, `ciso` and `support`, plus custom platform roles named only from the fixed list of nine (2E E-73), within each name's ceiling (E-74). All are bound by elevation, four-eyes, dual-role kinds and no self-approval. (rev P3)

## S6. API conventions

- Base path `/api/v1/<module>/...`. The tenant never appears in a path or body.
- `GET` list with a cursor (`?cursor=&limit=` up to 200) and filters; `GET /:id`; `POST` create; `PATCH /:id` with `version`; action endpoints `POST /:id/<verb>`.
- Errors: `{ error: { code, message } }`, with 400, 401, 403 (with the rule's reason), 404 (also for another tenant's record or an out-of-scope one), 409 (stale version or state), 422 (a rule refused it), 429 (rate limit), 503 (schema mismatch or maintenance).
- `Idempotency-Key` header on every `POST` that creates or performs an action.
- Rate limits per tenant and per user; plan limits are enforced on the server against `control.plan_entitlements`. Entitlements cover seats, frameworks, storage, database size (`db_bytes`), API calls, and the flags BYOK, SSO, SCIM and dedicated cell; trial limits are defined once in 2I (DA-13). (rev P3)
- Control-plane APIs: `/api/v1/platform/...` (staff, served only by `console`), `/api/v1/account/...` (identity, MFA, sessions), and the tenant-caller views `/api/v1/billing/...` and `/api/v1/help/...` (served by `app` through `cp_tenant_api` functions). Provider callbacks: `/api/v1/hooks/<provider>` (scanner, KMS) and `/api/v1/hooks/billing/<config_ref>` (payment), all signature-verified over the raw body. Worker endpoints: `/api/internal/worker/<class>`, HMAC-signed and never publicly routed. File downloads: `files.<domain>` with Selvara-signed tokens. (rev P3)
- No endpoint ever returns an invitation link or token to platform staff; invitation links go by email to the invitee only (DA-09). (rev P3)
- SCIM: `/scim/v2/...`.
- Public: `/api/v1/public/trust/<ref>/...` and `/api/v1/public/vendor-portal/...`.

## S7. Data change journal, backups and keys

- `record_history` (tenant schema, append-only) stores every change as `table`, `row id`, `version`, `before`/`after` (JSON, with encrypted fields still encrypted), `actor`, `at` and `request_id`. This is the "every change is backed up" mechanism (Q-24).
- Backups:
  - Supabase point-in-time restore at project level, for disaster recovery.
  - A nightly per-tenant logical export, in a fixed slot per tenant: JSONL per table, schema version, catalog fingerprint and files manifest. DDL is regenerated from the migrations at that version. It is encrypted with the tenant DEK. The last 7 are kept in `exports`; 35 daily, 12 monthly and 1 yearly copies are kept off-site in an object-locked bucket (compliance mode, 35 days) in a separate cloud account and region while the tenant is active. An hourly logical export of `control` also goes off-site. (rev P3)
  - Restoring one tenant = recreate the schema at the export's version from its export, then replay `record_history` up to the target time (path A). Alternatively, restore the cell's PITR into a scratch project and extract the tenant (path B, VC-02). Both paths need four-eyes approval. (rev P3)
- Keys (ADR-003):
  - Each tenant has a KEK in an **external KMS**, outside the database and its backups, behind a key-provider abstraction. BYOK means the customer's own KMS key.
  - **Encryption classes (DA-01):** **E0** plaintext: titles, refs, enums, dates, scores, ids; searchable and indexable. **E1** tenant DEK: narrative and description free text that may contain personal or confidential data, plus confidential fields. **E2** per-subject key: direct identifiers of natural persons, so that erasure reaches backups. Search over E1 text is decrypt-and-filter inside the tenant's own request with bounded page sizes; no plaintext index of E1 or E2 exists anywhere. (rev P3)
  - **Wrapped DEKs, per-subject keys and per-file keys** are held in the separate key-store project `ks` (PITR off, daily backups kept 7 days). Tenant tables hold only key ids and versions, never wrapped key material (DA-04). `ks` has a standby in the DR region and an off-site key journal (inserts and deletion tombstones, object-locked, each object expiring 8 days after it is written), so keys survive cell or region loss. A destroyed key is unrecoverable from every copy no later than **8 days after its destruction**: the standby applies the deletion at once, the daily backups roll off within 7 days, and the journal objects expire after 8 days; replaying the journal applies the tombstones, so a restore never resurrects a destroyed key (DU-36, DA-11). The KEK and its multi-Region replicas must never sit in the same backups as the data, or shredding fails. (rev P3)
  - **Platform KEK (DA-05):** control-plane encrypted fields (E1 in `cp`) use a platform DEK (2F F-K-31) wrapped by a platform KEK in the external KMS (F-K-30), never a tenant key; the `email_bidx` blind index uses F-K-32 and the audit-log HMACs use F-K-33. (rev P3)
  - Destroying a key needs four-eyes approval and a deletion certificate. Destroying a tenant KEK includes every multi-Region replica. (rev P3)
- Audit log hash (DA-03): personal fields enter the hash input as keyed HMACs, never as plaintext or ciphertext, so retention can null the personal value while the chain still verifies. (rev P3)

## S8. Jobs

- Queues per job type in `ops` (pgmq). Every message carries `tkey` and the job type, and one message touches one tenant. Job state that is not a queue (`job_dedupe`, `tenant_slots`, `tenant_job_pause`, `provisioning_steps`, `usage_events`, `rate_buckets`) lives in `ops` and holds no tenant business data. (rev P3)
- The worker sets the tenant context through the same `router` as the API and reads tenant status live from `cp` before each message (no replica, R2-01); if `cp` is unreachable the tick is skipped and alerted. (rev P3)
- Fair scheduling: round-robin by tenant, with per-tenant concurrency of 1 to 2.
- Job types: reminders, evidence and policy expiry, risk review due, approval expiry sweeps (moved out of GET handlers, inventory F1-05), report generation, exports, malware scanning, audit-log anchoring, webhook delivery, integration syncs, migration rollout, usage metering events, the DSAR deadline clock, retention purges, backup exports, usage aggregation and nightly recount (2I), DEK rotation re-encryption, `ref` content loads, fleet observer (2H H-8) and the `ks` key journal (P3-X3-03). (rev P3)

## S9. Writing rules for Phase 2 and Phase 3 documents

- Expert reader: no basics. Use tables for matrices and Mermaid for diagrams.
- Give every item a numbered ID with the prefix of its workstream: A-, B-, C-, D-, E-, F-, G-, H-, I-, J-, K-.
- Cite standards only when confident. Mark anything else *(verify)*. All compliance content is a **DRAFT** pending qualified legal and compliance review.
- Synthetic placeholders only: no real names, hosts, IPs, keys or emails. Use `example.com` style placeholders if needed.
- No implementation code. Short SQL or TypeScript **sketches** are allowed only to make a design point unambiguous; mark them as sketches.
- Encryption classes are written only as E0, E1 or E2 (DA-01). (rev P3)
- Each workstream ends with: Deliverables list, Decisions required (with ADR ids), Open risks (R- ids, from the unified register `risks.md`), New assumptions (A- ids, from the unified `assumptions-log.md`), and Spine deviations. (rev P3)

## Change table (v1 to v2)

| Change | Spine item | Source |
|---|---|---|
| V2-01 | S0 owner answers: 25 frameworks | OQ-15, P3-X1-46, P3-X3-20 |
| V2-02 | S0 OQ-01 bullet: fixed list of nine platform role names | OD-07 |
| V2-03 | S0 OQ-02 bullet: bank transfer at launch, Stripe as configured target | OD-01 |
| V2-04 | S0 new bullet: owner decisions of 2026-11-23 | Summary §8 |
| — | S0 new bullet: rulings DA-01 to DA-15 | Phase 3 rulings |
| V2-05 | S1 Cell: capacity rule CR-1 | J-SD2, P3-X3-01, DA-10 |
| V2-06 | S1 Schemas per cell: `ref.dsar_rules`, `ops` tables, no `control` or `auth` in cells | SD-D1, SD-D2 |
| V2-07 | S1 Control plane location: `cp`, `ks`, no routing replica | ADR-010, SD-F-03, P3-X1-18, DA-11 |
| V2-08 | S1 Hosting: `app` and `console`; jobs fallback; outbound egress rule | R2-03, SD-H1, DA-06, DA-15 |
| V2-09 | S1 Object storage: `storagebroker`, per-file keys in `ks`, signed tokens | SD-F-01, SD-F-02, SD-H2, DA-04 |
| V2-10 | S1 new row: external cloud account | OD-02, H-AC-05 |
| V2-11 | S2 accepted additions (with `control.idempotency_records`) | SD-A1, SD-B01, SD-C1, SD-C2, SD-C3, SD-E1, SD-E3, SD-F-03, I-SD1, P3-X1-05 |
| — | S2 allowed catalogue for the ADR-010 CI check | DA-06 |
| — | S2 platform KEK and `email_bidx` | DA-05 |
| V2-12 | S2 access (`cp_router_ro`, `cp_tenant_api`, `cp_rw` console only) and no session cache | R2-01, R2-03 |
| — | S2 `cp` load targets and load test | DA-12 |
| V2-13 | S3 step 1: Selvara session cookie | SD-E2 |
| V2-14 | S3 step 2: uncached lookup, `route_mac`, version window | R2-01, SD-A3 |
| V2-15 | S3 step 3: preamble as extended-protocol statements; `app.scope`, `app.engagement_id` | SD-A2, SD-B04, DA-02, P3-X2-02 |
| V2-16 | S3 step 4: role inventory | SD-A2, SD-B03, ADR-003, SD-F-02 |
| V2-17 | S3 step 5: R-56 stated plainly; prevention and detection controls | R2-06, J-SD1, DA-02, P3-X2-23 |
| V2-18 | S4 standard columns | SD-B02, SD-B05 |
| V2-19 | S4 additional tenant tables | SD-B01, SD-C2, SD-D3 |
| — | S4 M05 `policy_remark`; M08 shared kinds; M22 hash; M23 key id; E0/E1/E2 only | OD-05, DA-07, DA-03, DA-04, DA-01 |
| V2-20 | S5 platform roles | OD-07 |
| V2-21 | S5 base-role permissions (OD-06) | OD-06, SD-E4 |
| — | S5 auditor scope; privileged-role definition | DA-07, DA-08 |
| V2-22 | S6 control-plane APIs, callbacks, worker path, downloads | SD-C4, R2-03, I-SD2, P3-X3-18 |
| — | S6 entitlements; no invitation links to staff | DA-13, DA-09 |
| V2-23 | S7 backups bullets 2 and 3 | SD-A4, SD-H2, ADR-004, P3-X3-07 |
| — | S7 encryption classes E0/E1/E2 | DA-01 |
| V2-24 | S7 keys bullet 3: `ks`, standby, journal, 8-day window | SD-F-03, P3-X3-03, DA-04, DA-11 |
| — | S7 platform KEK; KEK replicas in destruction; audit hash | DA-05, P3-X3-25, DA-03 |
| V2-25 | S8 `ops` job state | SD-D1 |
| — | S8 worker reads tenant status live | R2-01, P3-X1-12 |
| V2-26 | S8 job types added | 2I I-4.3, ADR-003, 2H H-8, P3-X3-03 |
| — | S9 E0/E1/E2 only; registers are the unified Phase 3 registers | DA-01, P3-X3-19 |
