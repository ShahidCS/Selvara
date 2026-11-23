# Phase 2 design spine (binding for every workstream)

Owner: design authority. Every Phase 2 document must agree with this spine. If a workstream finds it must deviate, it records the deviation in a "Spine deviations" section with the reason; it never silently differs.

## S0. Inputs and accepted decisions

- Phase 1 documents: `/home/user/Selvara/docs/architecture/backend-v2/` (discovery summary, inventory, assumptions, decisions, risks, open questions). Read them.
- Existing system (v0.2.5) to learn from, not to copy blindly: `front-end/src/server/**`, `supabase/migrations/0001-0011`, `docs/architecture/BACKEND_FOUNDATION.md`, `docs/security/SOD_MATRIX.md`, `docs/security/CONTROLS.md`.
- ADR-001 (accepted): one Postgres schema per tenant in one Supabase project ("cell"). Residual risk C1-01 is accepted by the owner, with compensating controls.
- Owner answers: no live data (greenfield); one region now, cells later; all sectors (regulated buyers, possible health special-category data); TypeScript and Node; Supabase Auth kept; SSO (SAML/OIDC) and SCIM needed; BYOK needed; all 28 frameworks; AI providers pluggable (off by default); integrations configurable; plan limits per user, framework, storage and API calls; four-eyes approval gates; maximum upload size configurable by a super admin under a hard platform ceiling; no team (automate everything except human approvals); back up every change, retained while the client is active; deletion reviewed by super admins and evidenced.
- OQ-01 (owner): platform roles are **Management Approver** (super admin with all access; still bound by four-eyes and no self-approval) and **CISO**. A super admin can create **custom platform roles** in the Admin Console from **predefined role names**, each with a configurable permission set.
- OQ-02 (owner): **Stripe now**; payment providers pluggable and configurable later (the provider abstraction). Billing entity in Pakistan now, with UAE, US and UK later. Risk R-04 (Stripe availability for a Pakistan entity) stays open and visible.
- OQ-03: crypto-shredding accepted, subject to the conditions in the discovery summary §6.
- OQ-05 to OQ-12 accepted as recommended:
  - ISO 27005: both methods (asset-based and event-based).
  - Auditors scoped to their engagement.
  - Trust Center: sections chosen per tenant; NDA accepted per person; references by id.
  - RoPA per tenant; Selvara's own RoPA in the control plane.
  - Demo-only features are in scope (no downgrade).
  - Platform staff see only minimal tenant contact data, and every view is logged.
  - Merchant of record allowed later.
  - Two people hold the super-admin roles.
- F1-01 and F1-02 are being fixed in v0.2.x now. v2 must keep both fixes: auditor engagement scope with explicit shared items, and Trust Center section and NDA rules.

## S1. Topology

| Item | Decision |
|---|---|
| Cell | One Supabase project in one region. Launch: cell `c1`. A new cell opens when a measured threshold (Phase 2J) is reached, or for a dedicated enterprise tenant. |
| Schemas per cell | `control` (control plane, only in the home cell, see S2), `ref` (shared reference content, read-only to tenants, versioned), `t_<tkey>` one per tenant, `ops` (job queues and job state, no tenant business data), Supabase-managed `auth`, `storage` |
| Tenant key `tkey` | A random 16-character lowercase base32 identifier, assigned at provisioning, never derived from the tenant name or the customer reference. Schema name `t_<tkey>`. |
| Control plane location | A dedicated control-plane project (`cp`) in the home region. Tenant cells hold no control-plane tables apart from a read-only routing replica if needed. At launch, `cp` and `c1` may be the same project only if ADR-010 records the trade-off. |
| Hosting | The API runs as Next.js route handlers on Vercel (ADR-005 recommended). Jobs run through Supabase Queues (pgmq) and pg_cron, plus a worker endpoint that a scheduler invokes. One small managed container does malware scanning. *(Verify feature availability.)* |
| Object storage | Supabase Storage. Bucket `tenant-files` uses the path prefix `<tkey>/...`; bucket `quarantine` holds uploads awaiting their scan; bucket `exports` holds per-tenant exports and backups, encrypted with the tenant key. Access is only through signed URLs issued by the API. |

## S2. Control plane: what it holds (and only this)

`control.tenants`, `control.tenant_cells`, `control.tenant_schema_versions`, `control.identities` (Supabase user id, email, display name, status), `control.memberships` (user, tenant, role id, status), `control.tenant_roles` (tenant-defined role ids and names; permissions stay in the tenant schema), `control.platform_staff`, `control.platform_roles` (Management Approver, CISO, custom roles from predefined names), `control.platform_role_permissions`, `control.platform_approvals` and `platform_approval_votes`, `control.elevations`, `control.support_grants` and `support_sessions`, `control.platform_audit_log` (hash-chained), `control.plans`, `control.plan_entitlements`, `control.billing_entities`, `control.subscriptions`, `control.invoices`, `control.payments`, `control.usage_meters` (aggregated counts only, received as events), `control.provider_configs` (payment, AI, email and scanner providers: secret **references** only), `control.key_registry` (tenant key ids and versions; never key material), `control.deletion_certificates`, `control.support_questions` and `support_messages` (Selvara is the controller for support communication), `control.ropa_selvara` (Selvara's own RoPA), `control.sso_connections` (per-tenant SAML/OIDC metadata), `control.scim_tokens` (hashed).

The control plane never holds a tenant's controls, evidence, risks, vendors, policies, audit records, personal data of the tenant's employees beyond member identity, or file contents.

## S3. Request path and isolation (ADR-002)

1. The Supabase Auth session (HttpOnly cookie) is verified on the server, giving the user id. The active tenant comes from the server-side session record, never from the request.
2. Control-plane lookup: the membership is active, the tenant is Active, and the routing record gives the cell, the schema `t_<tkey>` and the schema version. Any miss means the request fails closed (401, 403 or 404; 503 when the schema version does not match).
3. Tenant transaction on the cell, through the pooler, logged in as `selvara_router`:
   - `SET LOCAL ROLE t_<tkey>_rw`
   - `SET LOCAL search_path = t_<tkey>, ref, pg_temp`
   - `set_config('app.tenant_id', <uuid>, true)` and `set_config('app.user_id', ...)`
   - Every tenant table also has `tenant_id uuid not null`, with a check and row-level security equal to `current_setting('app.tenant_id')`, as defence in depth.
4. Roles:
   - `selvara_router` has NOINHERIT membership of every `t_*_rw` role and owns nothing.
   - `t_<tkey>_rw` has USAGE on its own schema only, plus SELECT on `ref`.
   - `t_<tkey>_ro` exists for exports and auditor reads.
   - `cp_rw` exists for control-plane handlers.
   - `migrator` is used only by the CI migration job.
   - No application path uses a superuser or the service role for tenant data.
5. One routing module (`router`) is the **only** code allowed to issue `SET ROLE`, enforced by a lint rule and by tests.

## S4. Tenant schema: module and table catalogue (names are binding)

The standard columns on every table: `id uuid pk`, `tenant_id uuid`, `ref text unique` (human id, such as CTL-12), `created_at`, `created_by`, `updated_at`, `updated_by`, `version int` (optimistic locking), `deleted_at` (soft delete), `legal_hold bool`, `retention_class text`. History goes to `record_history` (S7).

| Module | Tables |
|---|---|
| M01 Settings | `tenant_settings`, `tenant_role`, `tenant_role_permission`, `member_profile` (a tenant-side copy of display data) |
| M02 Frameworks | `framework_scope`, `custom_framework`, `custom_requirement`, `requirement_status`, `control_mapping` |
| M03 Controls | `control`, `control_test`, `test_run`, `control_exception`, `control_attestation` |
| M04 Evidence | `evidence`, `evidence_version`, `evidence_link` (to control, requirement, audit, PBC request, finding, risk, vendor), `evidence_review` |
| M05 Policies | `policy`, `policy_version`, `policy_approval`, `policy_attestation` (acknowledgement history per version), `policy_exception` |
| M06 Risk (ISO 27005) | `risk_method_settings`, `risk_criteria`, `asset`, `threat`, `vulnerability`, `risk`, `risk_asset`, `risk_threat`, `risk_vulnerability`, `risk_treatment`, `treatment_action`, `risk_acceptance`, `risk_review`, `interested_party`, `risk_snapshot`, `risk_import` |
| M07 Issues | `issue` (= CorrectiveAction), `issue_task`, `issue_link` |
| M08 Audits | `audit`, `audit_shared_item`, `auditor_access`, `pbc_request`, `information_request`, `finding`, `audit_test` |
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
| M22 Audit log | `audit_log_entry` (append-only, hash chain), `audit_anchor` |
| M23 Files | `file_object` (path, hash, size, type, scan state, encryption key version) |
| M24 Help (tenant side) | none; questions live in `control.support_questions` |
| M25 Billing (tenant view) | none; the tenant reads its subscription and invoices through the control-plane API |
| M26 Automation | `automation_rule`, `automation_run` |

## S5. Roles

- **Tenant base roles**, kept from today:
  - `admin` (tenant admin)
  - `owner` (control owner or management)
  - `analyst` (contributor)
  - `employee`
  - `auditor` (external, time-boxed, engagement-scoped, read-only on shared items)
  - `vendor` (scoped to their own assessments)
  - `viewer` (read-only Trust Center member)
- Tenants may also define custom roles (M01) from these base permissions; a custom role can never exceed admin.
- **Platform roles:** `management_approver`, `ciso`, `support`, plus custom platform roles built from predefined names. All are bound by elevation, four-eyes and no self-approval.

## S6. API conventions

- Base path `/api/v1/<module>/...`. The tenant never appears in a path or body.
- `GET` list with a cursor (`?cursor=&limit=` up to 200) and filters; `GET /:id`; `POST` create; `PATCH /:id` with `version`; action endpoints `POST /:id/<verb>`.
- Errors: `{ error: { code, message } }`, with 400, 401, 403 (with the rule's reason), 404 (also for another tenant's record or an out-of-scope one), 409 (stale version or state), 422 (a rule refused it), 429 (rate limit), 503 (schema mismatch or maintenance).
- `Idempotency-Key` header on every `POST` that creates or performs an action.
- Rate limits per tenant and per user; plan limits are enforced on the server against `control.plan_entitlements`.
- Control-plane APIs: `/api/v1/platform/...` (staff) and `/api/v1/account/...` (identity, MFA, sessions).
- SCIM: `/scim/v2/...`.
- Public: `/api/v1/public/trust/<ref>/...` and `/api/v1/public/vendor-portal/...`.

## S7. Data change journal, backups and keys

- `record_history` (tenant schema, append-only) stores every change as `table`, `row id`, `version`, `before`/`after` (JSON, with encrypted fields still encrypted), `actor`, `at` and `request_id`. This is the "every change is backed up" mechanism (Q-24).
- Backups:
  - Supabase point-in-time restore at project level, for disaster recovery.
  - A nightly per-tenant logical export (schema dump plus files manifest), encrypted with the tenant data key, kept in `exports` while the tenant is active.
  - Restoring one tenant = recreate the schema from its export, then replay `record_history` up to the target time.
- Keys (ADR-003):
  - Each tenant has a KEK in an **external KMS**, outside the database and its backups, behind a key-provider abstraction. BYOK means the customer's own KMS key.
  - A per-tenant DEK, wrapped by the KEK, encrypts confidential and personal fields and files.
  - **Per-subject keys** for erasure that must reach backups are held in a separate key store whose own backups have a short retention period. The KEK must never sit in the same backups as the data, or shredding fails.
  - Destroying a key needs four-eyes approval and a deletion certificate.

## S8. Jobs

- Queues per job type in `ops` (pgmq). Every message carries `tkey` and the job type, and one message touches one tenant.
- The worker sets the tenant context through the same `router` as the API.
- Fair scheduling: round-robin by tenant, with per-tenant concurrency of 1 to 2.
- Job types: reminders, evidence and policy expiry, risk review due, approval expiry sweeps (moved out of GET handlers, inventory F1-05), report generation, exports, malware scanning, audit-log anchoring, webhook delivery, integration syncs, migration rollout, usage metering events, the DSAR deadline clock, retention purges, and backup exports.

## S9. Writing rules for Phase 2 documents

- Expert reader: no basics. Use tables for matrices and Mermaid for diagrams.
- Give every item a numbered ID with the prefix of its workstream: A-, B-, C-, D-, E-, F-, G-, H-, I-, J-, K-.
- Cite standards only when confident. Mark anything else *(verify)*. All compliance content is a **DRAFT** pending qualified legal and compliance review.
- Synthetic placeholders only: no real names, hosts, IPs, keys or emails. Use `example.com` style placeholders if needed.
- No implementation code. Short SQL or TypeScript **sketches** are allowed only to make a design point unambiguous; mark them as sketches.
- Each workstream ends with: Deliverables list, Decisions required (with ADR ids), Open risks (R- ids, new ones numbered from R-11 in your own block, see your brief), New assumptions (A- ids from the range in your brief), and Spine deviations.
