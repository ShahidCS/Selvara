# Phase 2C: API design

| | |
|---|---|
| Status | Draft (Phase 2 design). Documents only; no implementation code. |
| Owner | Workstream C |
| Binding inputs | `00-spine.md` (S3 request path, S4 catalogue, S5 roles, S6 conventions), Phase 1 inventory `inventory/01..04`, `2E-iam.md` (permission catalogue, referenced here as `perm`), `2D-workflows.md` (approval kinds and state machines) |
| Compliance note | Anything regulatory is a **DRAFT** pending qualified legal and compliance review. |

This document gives the API contract outline for every S4 module, the control-plane (`/api/v1/platform`), account (`/api/v1/account`), SCIM (`/scim/v2`) and public (`/api/v1/public`) surfaces, the conventions they share, the outbound webhook design, and a matrix from every Phase 1 screen to its endpoints.

---

## 1. Conventions (spine S6, made precise)

### 1.1 Surfaces and principals

| ID | Surface | Base path | Principal | Authenticated by | Tenant resolved from |
|---|---|---|---|---|---|
| C-01 | Tenant API (browser) | `/api/v1/<module>/...` | Member (identity + membership) | Session cookie `__Host-sv` (E-10) | Server session record (`control.sessions.tenant_id`), read through `cp_tenant_api.session_resolve` on every request and never cached (R2-01, R2-03); never the request (rev P3) |
| C-02 | Tenant API (integration) | `/api/v1/<module>/...` (same routes, subset allowed per scope) | API key (tenant service principal) | `Authorization: Bearer slv_...` (E-60) | `control.api_key_routes` lookup by key id (spine deviation SD-C1) |
| C-03 | Account API | `/api/v1/account/...` | Identity (may be pre-MFA during sign-in) | Sign-in ticket or session cookie | Not tenant-routed, except `session/tenant` (switch) |
| C-04 | Control-plane (staff) | `/api/v1/platform/...` | Platform staff | Session cookie of a staff session (no tenant) + elevation for writes | Never; tenant named in path as `tenantRef` (control id, not `tkey`). Served only by the `console` deployment, the only holder of `cp_rw` (R2-03) (rev P3) |
| C-05 | Tenant billing and help (control-plane data, tenant caller) | `/api/v1/billing/...`, `/api/v1/help/...` | Member | Session cookie | Session record; the handler calls `cp_tenant_api` functions (for example `billing_subscription_mine`, `support_question_create`) that derive the tenant from the session record; the `app` deployment holds no `cp_rw` grant (R2-03) (rev P3) |
| C-06 | SCIM 2.0 | `/scim/v2/...` | Tenant SCIM client | Bearer SCIM token (`control.scim_tokens`, hashed) | Token record |
| C-07 | Public Trust Center | `/api/v1/public/trust/<trustRef>/...` | Anonymous or verified visitor | Optional visitor cookie `__Host-vv` (purpose `trust`) | `control.tenants.trust_public_ref` (public reference, not `tkey`) (rev P3) |
| C-08 | Public vendor portal | `/api/v1/public/vendor-portal/...` | Verified vendor visitor | Link token (hash match) then `__Host-vv` (purpose `vendor-portal`) | Invite record routed via `control` link index (SD-C1) |
| C-09 | Provider callbacks | `/api/v1/hooks/<provider>` (scanner, KMS) and `/api/v1/hooks/billing/<config_ref>` (payment); endpoint row C-PL-28 | Provider | Provider signature over raw body | Provider event metadata mapped in control plane (rev P3) |
| C-10 | Worker | `/api/internal/worker/<class>` (ADR-005, 2F) | Scheduler | Signed scheduler token (rotating, from Vault), allow-listed caller | Message `tkey`, through the router (D-60) (rev P3) |

Rules:
- C-11: The tenant identifier never appears in a tenant API path or body (S6). A body field named `tenantId` is rejected with 400 `tenant_field_forbidden`.
- C-12: Staff never call tenant routes. A staff session on a `/api/v1/<module>` route is 403. Staff read tenant data only through `/api/v1/platform/support/sessions/:id/view/...` (E-75).
- C-13: Every state-changing request passes the origin check (cookie surfaces) and CSRF defence (SameSite=Strict + `Origin` match). API-key and SCIM surfaces are exempt from the origin check and never accept cookies.
- C-03a: An endpoint accepts an API key only if its authorisation column names OBJ-KEY; every other endpoint returns 403 `scope_missing` to an API key (rev P3).
- C-12a: Platform-staff routes (C-04) are served only by the `console` deployment; the tenant-facing `app` deployment reaches the control plane only through `cp_router_ro` (view `control.v_routing`) and the `cp_tenant_api` function set, never `cp_rw` (R2-03, DA-06) (rev P3).

### 1.2 Versioning

| ID | Rule |
|---|---|
| C-14 | Major version in the path (`/v1`). Additive changes (new fields, new endpoints, new enum values flagged `x-extensible`) are non-breaking and ship in `v1`. |
| C-15 | A breaking change creates `/v2` for the affected module only; `v1` runs in parallel at least 6 months for API-key clients. Responses of deprecated routes carry `Deprecation` and `Sunset` headers *(verify current RFC numbers before publishing)*. |
| C-16 | Clients must ignore unknown fields. Enum values unknown to a client must be treated as "other". |
| C-17 | The browser front end ships with the API; it always targets the newest version. A schema-version mismatch on the tenant (S3) is 503 `schema_upgrading` with `Retry-After`. |

### 1.3 Resource conventions

| ID | Rule |
|---|---|
| C-20 | Standard read fields (`STD`): `id` (uuid), `ref` (human id, for example `CTL-12`), `version`, `createdAt`, `createdBy` (person id), `updatedAt`, `updatedBy`. People are always ids; display names are resolved through `GET /api/v1/settings/members` (fixes inventory gap AS-6, F1-09). Exception (DA-07): auditor callers receive no member list and no person ids; person fields on shared records are returned as display names only (rev P3). |
| C-21 | Timestamps are RFC 3339 UTC strings; money is integer minor units plus ISO 4217 currency; durations ISO 8601. |
| C-22 | `PATCH /:id` requires `version` in the body; a stale version is 409 `stale_version` with the current `version`. |
| C-23 | Delete is `POST /:id/delete` (soft delete, reason where the rule requires it). No hard delete through the API. Records under `legal_hold` answer 422 `legal_hold`. |
| C-24 | Action endpoints are `POST /:id/<verb>`; they carry `version` (the record version the actor saw, replaces today's `seen`) and `reason` where a rule asks for one. |
| C-25 | Child collections are addressed by id, never by array index (fixes `/actions/:n`, `/tasks/:n`, `/accounts/:index`). |
| C-26 | Files: upload is two-step: `POST /api/v1/files/uploads` (declares name, size, type, parent) returns a signed upload URL into `quarantine`; the client confirms with `POST /files/uploads/:id/complete` (sha256, C-M23-04); the worker finalises after a signed scanner verdict (2F F-10.1). No handler or job reads file bytes unless `scan_state = clean`; `storagebroker` enforces it (2D D-70a; rev P4). Downloads: `POST /files/:fileId/download-token` (C-M23-03, or the module route that wraps it) returns a Selvara download token for `files.<domain>/d/<token>`, bound to user, tenant, file version and purpose, valid 5 min, single use for exports (2F F-U-06); never a Supabase Storage signed URL. Every token issue is audited. (rev P3) |
| C-27 | A list response never includes a field the caller could not read in the single-record response (no "figures-only copies" leaking through lists). Aggregates (overview, KPIs) are computed server-side from records the caller may read, or from aggregate-only permissions explicitly listed in E-30. |

### 1.4 Pagination, filtering, sorting

| ID | Rule |
|---|---|
| C-30 | `GET` list: `?limit=` (default 50, max 200) and `?cursor=`. Response `{ data: [...], page: { nextCursor, limit } }`. No total count by default; `?count=estimate` returns `page.estimate` for KPI strips. |
| C-31 | The cursor is opaque: base64url of (sort key, last id, filter hash, tenant id, expiry 24 h) with an HMAC. A cursor issued for one tenant or one filter set is rejected (400 `bad_cursor`) elsewhere, so a cursor cannot carry a request across tenants. |
| C-32 | Filters: `filter[<field>]=<value>` (equality, comma for OR), `filter[<field>][gte|lte]=` for dates and scores, `q=` for text search over an allow-listed set of fields per resource. Unknown filter fields are 400, not ignored. |
| C-33 | Sort: `sort=<field>` or `-<field>` from an allow-list per resource; the id is always the final tie-breaker. |
| C-34 | Exports (CSV, JSON, PDF) are asynchronous: `POST /api/v1/exports` `{ kind, filters }` creates a `report_run`-style job; result delivered through a signed link in `exports`. Every export is audited with its kind and row count (closes the "Export selected is never audited" gap AS-9). |

### 1.5 Error model

`{ "error": { "code": "<snake_case>", "message": "<human text>", "reason": "<rule id, optional>", "requestId": "<uuid>", "details": [{ "field", "code" }] } }`

| ID | HTTP | Codes (examples) | Use |
|---|---|---|---|
| C-40 | 400 | `invalid_body`, `invalid_field`, `bad_cursor`, `unknown_filter`, `tenant_field_forbidden` | Shape errors |
| C-41 | 401 | `unauthenticated`, `session_expired`, `mfa_required` | No or ended session |
| C-42 | 403 | `forbidden` with `reason` (`role`, `elevation_required`, `step_up_required`, `sso_required`, `scope_missing`, `self_approval`, `engagement_closed`) | Permission known to fail |
| C-43 | 404 | `not_found` | Missing, other tenant, or out of the caller's object scope (auditor, vendor). Never 403 for object scope, so existence is not revealed. |
| C-44 | 409 | `stale_version`, `invalid_state`, `duplicate`, `idempotency_conflict` | Concurrency and state |
| C-45 | 422 | `rule_refused` with `reason` = SoD or business rule id (for example `SOD-NOT-REQUESTER`, `RISK-NEEDS-CONTROL`), `legal_hold`, `plan_limit` (with `limit`, `used`) | A rule refused it |
| C-46 | 429 | `rate_limited` + `Retry-After`, `RateLimit-*` headers | Rate limits |
| C-47 | 503 | `schema_upgrading`, `maintenance`, `tenant_unavailable` | Router fail-closed (S3) |
| C-48 | 500 | `internal` (message generic; detail only in logs under `requestId`) | Never leaks SQL, schema names or `tkey` |

### 1.6 Idempotency

| ID | Rule |
|---|---|
| C-50 | `Idempotency-Key` (UUID or 16 to 64 URL-safe chars) is **required** on every `POST` that creates or acts, on every surface except sign-in steps. Missing: 400 `idempotency_key_required`. |
| C-51 | Stored in the tenant schema table `idempotency_record` (key, principal, route, request hash, status, response status, response body reference, expires 24 h) in the same transaction as the change (spine deviation SD-C2). Control-plane calls use `control.idempotency_records`. |
| C-52 | Same key + same principal + same request hash returns the stored response (`Idempotent-Replayed: true`). Same key with a different body: 409 `idempotency_conflict`. A key in flight: 409 `in_progress`. |
| C-53 | Four-eyes votes are naturally idempotent (one vote per person per approval, D-24) and still take the header. |

### 1.7 Rate limits and plan limits

| ID | Limit | Default (configurable in `control.plan_entitlements`) | Key |
|---|---|---|---|
| C-55 | Per tenant, browser + API combined | 600 requests/min burst 1,200 | `tenant_id` |
| C-56 | Per user per tenant | 120/min; writes 30/min | `(identity, tenant)` |
| C-57 | Per API key | plan `api_calls_per_hour` (today 600/h), plus monthly metered `api_calls` | key id |
| C-58 | Sensitive endpoints | sign-in 5 failures/email/5 min (preset), 10/IP/15 min; OTP 5 codes/h/address; exports 10/h/user; AI ask 30/h/user; Trust Center and vendor-portal limits as today (inventory RK actions table) | per rule |
| C-59 | SCIM | 300 requests/min per token | token id |

- C-60: Token-bucket counters live in `ops.rate_buckets` (unlogged table, keyed by a hash of the key; no business data). On database unavailability the limiter fails closed for writes and open for reads of the caller's own session (to allow sign-out).
- C-61: Plan limits (users, frameworks in scope, storage bytes, API calls) are checked server-side against `control.plan_entitlements` at the write that would exceed them (422 `plan_limit`). Usage events go to `control.usage_meters` through the metering job (D-74).
- C-62: Statement timeout per tenant transaction: 5 s browser, 30 s exports (run as jobs).
- C-63: Every state-changing request writes an `audit_log_entry` in its own transaction with `outcome` allowed; every 403, 404-by-scope, 409 or 422 refusal of a state change writes an entry with `outcome` refused and `refusal_code`; every read listed in 2F F-EV-03 (marked "audited (F-EV-03)" below) writes an entry with `outcome` allowed (rev P3).

### 1.8 Authorisation notation used in section 2

Every endpoint names a permission (`perm`, from the catalogue in `2E-iam.md` section E-30) **and** an object rule. **Where a row names no object rule, the rule is OBJ-T**, and no other default exists: auditor and vendor callers never reach a row that names only OBJ-T (they get 404, C-43). The machine-readable endpoint registry that drives J-AUTHZ-01 stores an explicit object rule on every row (OBJ-T written out), so a missing rule fails CI (rev P4, P4-A2-20). Object rules:

| ID | Object rule | Meaning |
|---|---|---|
| OBJ-T | tenant | Any record of the session tenant (the router guarantees the schema). |
| OBJ-OWN | owner | The actor is the record's `owner_id` (or the policy owner, control owner, system owner). |
| OBJ-SELF | self | The actor is the subject or requester (own requests, own grants, own acknowledgements, own notifications). |
| OBJ-AUD | auditor scope | Role `auditor`: the record (or the evidence a file belongs to) is listed in `audit_shared_item` for an `audit` where the actor has an `auditor_access` row with status `Live` and `now` inside `[starts_at, ends_at]`. Otherwise 404. Write never. (F1-01 fix, OQ-06.) Shared item kinds (DA-07): `control`, `evidence` (its versions and files included by default; there is no separate files flag), `policy`, `risk_snapshot`. OBJ-AUD applies to every read route of a module the auditor can read; a route whose resource cannot be shared returns 404 to an auditor. Auditors receive no member list and no member ids; display names on shared records stay. Every successful auditor read writes `auditor.viewed` (record ref, engagement id) (E-43, F-EV-03). (rev P3) |
| OBJ-VEN | vendor scope | Role `vendor`: the record belongs to a `vendor_assessment` / `questionnaire` whose `vendor_contact.person_id` is the actor. Otherwise 404. |
| OBJ-PUB | published only | Callers without `policies.read_all` see only the live published version, with draft text, notes and approval reasons removed. |
| OBJ-KEY | API key scope | API key principal: the route's module is in the key's scopes (`read:<module>` / `write:<module>`). Keys never vote on approvals. |
| SOD-* | separation rule | Evaluated by the approval engine or the module rule (list in `2D-workflows.md` D-20 and `2E-iam.md` E-40). |
| STEP | step-up | Password or passkey confirmed within 5 min (E-16). |
| ELEV | elevation | Platform staff with a live elevation (E-70). |
| 4E:`kind` | four-eyes | The call creates an `approval` of that kind; the change applies on the final vote (D-20). |

---

## 2. Endpoint catalogue

Each module lists resource shapes once, then endpoints. Shapes are field lists (`STD` = C-20 fields). "List" endpoints accept the filters named in brackets.

### 2.1 Shell, overview and My Work (no table of their own)

| ID | Endpoint | Request | Response | Authorisation |
|---|---|---|---|---|
| C-SH-01 | `GET /api/v1/overview` | `period` | KPI set (weightedCompliance, openRisks, controlsFailing, openIssues, upcomingAudits, vendorReviewsDue), frameworkReadiness[6], needsAttention[], calendar[6 months], coverageHeatmap | perm `overview.read`; each figure computed only from modules the caller can read; otherwise the figure is omitted (C-27). Auditor: figures from shared items only. |
| C-SH-02 | `GET /api/v1/overview/trend` | `metric`, `from`, `to` | series [{date, value}] from `report_run` daily snapshots | `overview.read`; same per-module filter; auditor: 404 (tenant-wide series) (rev P3) |
| C-SH-03 | `POST /api/v1/overview/board-pack` | `period`, `format` | export job id | `overview.read` + `data.export`; audited; not available to auditor, vendor or viewer (rev P3) |
| C-SH-04 | `GET /api/v1/work` | `tab` (tasks, policies, delegation) | counts {assigned, overdue, dueThisWeek, approvalsWaiting}, items [{type, recordRef, title, due, action}] | `work.read`; OBJ-SELF (items assigned to or awaiting the caller) |
| C-SH-05 | `GET /api/v1/approvals` | filter[status, kind, module], `mine=decide|requested` | approval list (see C-M21) | `work.read`; only approvals the caller requested or may decide (engine eligibility, D-22) |
| C-SH-06 | `GET /api/v1/session` | — | person {id, displayName}, tenant {ref, name, plan}, role, permissions[], memberships [{tenantRef, name, role}], elevation?, stepUpUntil | Any session |

### 2.2 M01 Settings (team, roles, tenant settings, SSO, support grants)

Shapes: **Member** `id (person id), displayName, email, roleId, roleName, status (Invited, Active, Suspended, Removed), source (invite, join, jit, scim), since, external (bool), expiresAt`; **Invitation** `id, email, roleId, status, expiresAt, createdBy`; **JoinRequest** `id, displayName, email, status, createdAt`; **TenantSettings** `reviewCycleMonths, riskAppetite, controlSlaDays, criticalSlaDays, brand {name, logoFileId}, lockout {preset, attempts, minutes}, passwordMinLength, trustedNetworks[], agentTrackRecord, sessionIdleMinutes (within ceiling), requirePasskeyFor[]`; **Role** `id, name, base (bool), description, permissions[], memberCount, status`; **SsoConnection** `id, protocol (saml|oidc), status, domains[{domain, verified, verifiedAt}], enforce (off|domain|all), jit {enabled, defaultRoleId, groupMappings[{group, roleId}]}, metadataUrl|issuer, clientId, certificateExpiresAt`; **ScimToken** `id, label, prefix, createdAt, expiresAt, lastUsedAt, status`; **SupportGrant** `id, reason, scope[], startsAt, endsAt, status, createdBy`.

| ID | Endpoint | Request | Response | Authorisation |
|---|---|---|---|---|
| C-M01-01 | `GET /settings/members` [status, roleId, q] | | Member[] (email only to `members.read`; others get id + displayName) | any member: id+name directory (vendor, viewer: only people referenced by records they can see); auditor: 404, no member list and no member ids (DA-07; names appear on shared records only); `members.read` for email/status (rev P3) |
| C-M01-02 | `POST /settings/members/:id/role` | roleId, reason, version | Member or approval | `members.manage`; privileged target role (E-33d: `admin`, `owner`, or a custom role holding any admin-only permission; `analyst` is not privileged, DA-08) → 4E:`team.role` + STEP; SOD: not own role; last admin cannot be demoted (rev P3) |
| C-M01-03 | `POST /settings/members/:id/suspend` / `reactivate` / `remove` | reason ≥10 | Member | `members.manage`; remove: + STEP (E-16); not self; last admin rule; remove of a privileged member (E-33d) → 4E:`team.offboard` (D-28); revokes sessions (E-17) (rev P3) |
| C-M01-04 | `POST /settings/members/:id/sign-out` | reason | 204 | `members.manage`; revokes the member's sessions in this tenant only |
| C-M01-05 | `GET /settings/invitations`; `POST /settings/invitations` | email, roleId, expiresInHours ≤72 | Invitation (+ link once if `deliver=link`) | `members.manage`; privileged role (E-33d, DA-08 definition as in C-M01-02) → 4E:`team.invite`; auditor/vendor roles need `engagementId`/`vendorId` (scoped invite) (rev P3) |
| C-M01-06 | `POST /settings/invitations/:id/link` / `revoke` | | link once / 204 | `members.manage` |
| C-M01-07 | `GET /settings/join-requests`; `POST /settings/join-requests/:id/approve|reject` | reason ≥10 | JoinRequest | `members.manage`; SOD not own request; joins as `employee` only |
| C-M01-08 | `GET /settings/roles`; `GET /settings/roles/:id` | | Role[] | `settings.read` |
| C-M01-09 | `POST /settings/roles`; `PATCH /settings/roles/:id`; `POST /settings/roles/:id/retire` | name, description, permissions[], version | Role or approval | `roles.manage`; 4E:`tenant.role.change` (E-34); ceiling check (E-33) |
| C-M01-10 | `GET /settings/permissions` | | catalogue [{perm, module, description, sensitive}] | `settings.read` |
| C-M01-11 | `GET /settings`; `PATCH /settings` | TenantSettings subset, version | TenantSettings | read: `settings.read`; write `settings.manage`; loosening fields (shorter lockout, longer idle, removing passkey requirement, adding trusted network) → 4E:`team.setting.loosen`; tightening immediate |
| C-M01-12 | `GET /settings/sso`; `POST /settings/sso` | protocol, metadataUrl or xml / issuer, clientId, clientSecretRef | SsoConnection | `sso.manage` + STEP; activation → 4E:`sso.activate` |
| C-M01-13 | `POST /settings/sso/:id/domains` ; `POST /settings/sso/:id/domains/:domain/verify` | domain | {txtName, txtValue} / verified state | `sso.manage` + STEP (E-16); domain unique across tenants (E-50) (rev P3) |
| C-M01-14 | `PATCH /settings/sso/:id` (enforce, jit, mappings) | fields, version | SsoConnection | `sso.manage` + STEP; enforce change, mapping to a privileged role → 4E:`sso.policy`; turning enforcement off → 4E |
| C-M01-15 | `POST /settings/sso/:id/test` | | test-login URL | `sso.manage` |
| C-M01-16 | `GET /settings/scim-tokens`; `POST /settings/scim-tokens`; `POST /settings/scim-tokens/:id/revoke` | label, expiresInDays ≤365 | ScimToken (+ secret once, to requester, within 60 min of approval) | `sso.manage` + STEP; create → 4E:`scim.token`; revoke immediate |
| C-M01-17 | `GET /settings/support-grants`; `POST /settings/support-grants`; `POST /settings/support-grants/:id/revoke` | reason 10..300, hours ≤8, scope[] (`members`, `settings`, `auditlog`, optional module read scopes chosen by the customer) | SupportGrant | `support_grant.manage` (admin); revoke immediate; grant written to tenant audit log and `control.support_grants`; scope never includes files, DSAR data or secrets (E-75) (rev P3) |
| C-M01-18 | `GET /settings/support-activity` | | support session views [{sessionId, staffRole, at, part}] | `support_grant.manage` |
| C-M01-19 | `POST /settings/members/:id/unlock` | reason ≥10 | Member | `members.manage`; not self; audited (rev P3) |
| C-M01-20 | `POST /settings/offboarding`; `GET /settings/offboarding` | reason ≥15, `exportRecipientId` (a tenant admin; default the requester) (rev P4) | approval / offboarding state, final-export state (generation, state, `windowEndsAt`, `linkExpiresAt`, receipt; never the passphrase or a token) and notices | `settings.manage` + STEP (admin); starts D-12 through 4E:`tenant.offboard` (D-K38, approver `settings.manage`; 2 approvals when two admins exist); entering `OffboardingRequested` starts the final export D-12b; GET `settings.read` (rev P4) |
| C-M01-21 | `POST /settings/restore-requests`; `GET /settings/restore-requests` | targetTime, reason ≥15 | restore request | `settings.manage` + STEP; creates platform 4E:`platform.tenant.restore` (D-P15, dual role) per 2H H-RS-01; tenant informed of the write freeze (rev P3) |
| C-M01-23 | `POST /settings/offboarding/final-export` (request or regenerate the final export, FINAL-EXPORT) (rev P4) | reason ≥10 | export job {generation, state} | `settings.manage` + STEP + OBJ-SELF (caller is the export recipient of `control.tenant_export_jobs`); tenant status offboarding with the window open (else 409 `invalid_state`); at most 3 generations (422 `rule_refused`, `OFF-EXPORT-LIMIT`); supersedes the previous bundle, passphrase and link (D-12b-1); audited; served through a `cp_tenant_api` function that derives the tenant from the session (C-05 pattern) |
| C-M01-24 | `POST /settings/offboarding/final-export/passphrase` (reveal once) (rev P4) | generation | {passphrase} returned once, `Cache-Control: no-store` | `settings.manage` + **STEP** (≤5 min) + OBJ-SELF (recipient only); generation `ready`; the function returns `passphrase_enc` decrypted and nulls it in the same transaction, so a second call is 409 `invalid_state` (`passphrase_already_revealed`), and the recipient must request a new generation (C-M01-23) if it is lost; never available to staff, support sessions, API keys or other admins; audited (`export.passphrase.revealed`, no secret in the entry). C-M01-24 to C-M01-26 use the same `cp_tenant_api` pattern as C-M01-23 |
| C-M01-25 | `GET /settings/offboarding/final-export/link/:linkToken` (from the email); `POST /settings/offboarding/final-export/download-token` (rev P4) | linkToken / generation | app page / download token for `files.<domain>/d/<token>` | signed-in session, `settings.manage` + OBJ-SELF (recipient); link token single use (hash match in `control.tenant_export_jobs`), valid 7 days, consumed when the first download token is issued, removed from the URL at once by redirect and redacted in logs; download token single use, bound to user, tenant, generation and purpose `final_export`, valid 5 min, HTTP range requests allowed on that token for 60 min to resume a large file; a new link is sent only by regeneration; every issue and completed download audited and shown in the notices; never a Supabase signed URL (C-26) |
| C-M01-26 | `POST /settings/offboarding/final-export/receipt` (rev P4) | outcome (`received` or `declined`), reason ≥15 when declined | export job | `settings.manage` + STEP + OBJ-SELF (recipient); generation `ready`; `received` allowed only after at least one completed download; `declined` allowed without download and recorded as the customer's instruction; moves D-12 to `ReceiptConfirmed` and satisfies D-12b-7; all tenant admins and the contract contact notified; audited |
| C-M01-22 | `GET /settings/keys/byok`; `POST /settings/keys/byok` | provider, keyRef | BYOK registration state (key reference, test result, state; never key material) | `settings.manage` + STEP; tenant 4E:`tenant.byok` (D-K39, 2 approvals); Selvara performs the test wrap and re-wrap (2F F-K-21); destruction of the Selvara KEK after 30 days is platform 4E:`platform.key.destroy` (D-P04) (rev P3) |

### 2.3 M02 Frameworks

Shapes: **Framework** `id (ref framework id or custom id), kind, shortName, name, version, region, inScope, snoozedUntil, requirementCount, mappedCount, readiness`; **Requirement** `id, frameworkId, code, title, guidance, status (applicable, not_applicable), naReason, mappedControls[], mappedBy, mappedAt`; **ControlMapping** `id, frameworkId, requirementId, controlId, source (library, manual, import), createdBy, createdAt`.

| ID | Endpoint | Request | Response | Authorisation |
|---|---|---|---|---|
| C-M02-01 | `GET /frameworks` [kind, region, inScope] | | Framework[] | `frameworks.read`; auditor: only frameworks to which a shared control is mapped (frameworks are not a shared kind, DA-07) (rev P3) |
| C-M02-02 | `GET /frameworks/:id`; `GET /frameworks/:id/requirements` [status, q] | | Framework; Requirement[] | `frameworks.read`; auditor: only requirements mapped to a shared control (DA-07) (rev P3) |
| C-M02-03 | `POST /frameworks/:id/scope` / `snooze` | inScope / until, reason | Framework | `frameworks.manage`; scope adds count against plan `frameworks` (C-61) |
| C-M02-04 | `POST /frameworks` (custom) ; `PATCH /frameworks/:id` | shortName, name, version, kind, region, requirements[] ≤300 | Framework | `frameworks.manage` |
| C-M02-05 | `POST /frameworks/:id/requirements/:reqId/mappings`; `POST /mappings/:mappingId/delete` | controlId | ControlMapping | `frameworks.manage` or `controls.manage` |
| C-M02-06 | `POST /frameworks/:id/requirements/:reqId/not-applicable` / `applicable` | reason ≥15 | Requirement | `frameworks.manage` |
| C-M02-07 | `GET /frameworks/templates` | | template list from `ref` | `frameworks.read`; not available to auditor (404) (rev P3) |
| C-M02-08 | `GET /frameworks/content/pins`; `GET /frameworks/content/pins/:package/upgrade-preview?release=` | | pins; preview {affected requirement_status, control_mapping, evidence_link, audit_shared_item counts, orphaned} | `frameworks.read`; not available to auditor (DA-15, ADR-011 D11-6) (rev P3) |
| C-M02-09 | `POST /frameworks/content/pins/:package/upgrade` | release, version | approval, then `content_upgrade` | `frameworks.upgrade` + STEP; framework in an audit in Fieldwork or Reporting → 4E:`content.upgrade.in_audit` (D-K37, 2 approvals), else 4E:`content.upgrade` (D-K36); applied by job D-82 (DA-15) (rev P3) |

### 2.4 M03 Controls

Shapes: **Control** `STD, title, domain, ownerId, status (Pass, Fail, NeedsEvidence, NotTested), libraryRef, mappings[], linkedTests[], attestation {by, at, statement}, exceptions[]`; **ControlTest** `STD, name, source (manual, automated, integration), condition, controlIds[], cadence, lastRunAt, result, active`; **TestRun** `id, testId, at, result, note, items {count, failing}`; **ControlException** `STD, controlId, reason, compensating, expiresAt, status, approvalId`.

| ID | Endpoint | Request | Response | Authorisation |
|---|---|---|---|---|
| C-M03-01 | `GET /controls` [status, domain, frameworkId, ownerId, q] | | Control[] | `controls.read`; OBJ-AUD |
| C-M03-02 | `GET /controls/:id` | | Control | `controls.read`; OBJ-AUD |
| C-M03-03 | `POST /controls`; `PATCH /controls/:id` | title, domain, ownerId | Control | `controls.manage`; owner must be an active member |
| C-M03-04 | `POST /controls/adopt` | libraryRefs[] ≤200, ownerId | Control[] | `controls.manage` |
| C-M03-05 | `POST /controls/:id/owner` | ownerId, reason | Control | `controls.manage` |
| C-M03-06 | `POST /controls/:id/attest` | statement ≤500, version | Control | `controls.attest` + OBJ-OWN |
| C-M03-07 | `POST /controls/:id/status` | status, reason ≥10, version | Control | `controls.attest` + OBJ-OWN; refused when a test is linked |
| C-M03-08 | `POST /controls/:id/evidence-requests` | note | 204 (notification) | `controls.test` |
| C-M03-09 | `POST /controls/:id/exceptions` | reason ≥10, compensating ≥20, expiresAt ≤366 d | approval | `controls.exception.request`; 4E:`control.exception` |
| C-M03-10 | `GET /controls/tests` [source, result]; `GET /controls/tests/:id` ; `GET /controls/tests/:id/runs` | | ControlTest[], TestRun[] | `controls.read`; OBJ-AUD (tests and runs of shared controls only); failing items naming accounts collapsed to counts without `people.read` (rev P3) |
| C-M03-11 | `POST /controls/tests`; `POST /controls/tests/:id/deactivate` | name, condition, source, controlIds | ControlTest | `controls.manage`; automated tests cannot be deactivated |
| C-M03-12 | `POST /controls/tests/:id/run`; `POST /controls/tests/:id/results`; `POST /controls/tests/sync` | result, note ≥10 | TestRun | `controls.test`; manual tests only for results; API key: OBJ-KEY `write:control-tests` (results for tests with source `integration` only) (rev P3) |
| C-M03-13 | `POST /controls/:id/tickets` | integrationId, summary | external ticket ref | `controls.test`; needs a connected ticketing integration (M17); else 422 `integration_missing` |
| C-M03-14 | `GET /controls/matrix` | frameworkIds[] (≤8) | rows control × framework | `controls.read`; OBJ-AUD (rows of shared controls only) (rev P3) |

### 2.5 M04 Evidence

Shapes: **Evidence** `STD, name, type, description, ownerId (the collector), reviewState (Pending, Accepted, Rejected), validFrom, expiresOn, currentVersion, links[{targetType, targetId}], deletionPending (bool), legalHold` (field names aligned with 2B, rev P3); **EvidenceVersion** `id, n, note, files[{fileId, name, size, sha256, scanState}], createdBy, createdAt`; **EvidenceReview** `id, versionN, decision, note, by, at`.

| ID | Endpoint | Request | Response | Authorisation |
|---|---|---|---|---|
| C-M04-01 | `GET /evidence` [reviewState, type, ownerId, expiring, linkedTo] (rev P3) | | Evidence[] | `evidence.read`; OBJ-AUD |
| C-M04-02 | `GET /evidence/:id`; `GET /evidence/:id/versions` | | Evidence; EvidenceVersion[] | `evidence.read`; OBJ-AUD |
| C-M04-03 | `POST /evidence`; `PATCH /evidence/:id` | name, type, description, expiresOn, links[] | Evidence (review reset to Pending) | `evidence.write`; API key: OBJ-KEY `write:evidence` (rev P3) |
| C-M04-04 | `POST /evidence/:id/versions` | note, fileIds[] (≤20, from C-26 uploads) | EvidenceVersion | `evidence.write`; API key: OBJ-KEY `write:evidence` (rev P3) |
| C-M04-05 | `POST /evidence/:id/links`; `POST /evidence/:id/links/:linkId/delete` | targetType (control, requirement, audit, pbc_request, finding, risk, vendor), targetId | link | `evidence.write` + read on target |
| C-M04-06 | `POST /evidence/:id/review` | decision, note (≥10 if reject), version | EvidenceReview | `evidence.review`; SOD: reviewer ≠ collector, any version author, any uploader (D-31) |
| C-M04-07 | `POST /evidence/:id/files/:fileId/link` | | download token (C-26) | `evidence.read`; OBJ-AUD (evidence shared with the engagement; its files are included, DA-07); scan state Clean only; audited `evidence.file.downloaded` (rev P3) |
| C-M04-08 | `POST /evidence/:id/files/:fileId/remove` | reason | EvidenceVersion | `evidence.write`; creates a new version (files are never edited in place) |
| C-M04-09 | `POST /evidence/:id/delete` | reason ≥15, version | approval | `evidence.delete`; 4E:`evidence.delete`; legal hold → 422 |

### 2.6 M05 Policies

Shapes: **Policy** `STD, name, ownerId, state (Draft, InReview, Approved, Active, ReviewDue, Retired), currentVersion, liveVersion, reviewCycleMonths, nextReviewAt, mappedControls[], approverId, emergencyException?`; **PolicyVersion** `id, n (semver-like 1.0), text, changeReason, authors[], state, approvedBy, approvedAt, effectiveAt, publishedAt`; **PolicyAttestation** `id, policyId, versionId, personId, state, assignedAt, dueAt, acknowledgedAt`; **PolicyException** `STD, policyId, scope, reason, expiresAt, status`.

| ID | Endpoint | Request | Response | Authorisation |
|---|---|---|---|---|
| C-M05-01 | `GET /policies` [state, ownerId] | | Policy[] | `policies.read`; OBJ-PUB; OBJ-AUD for auditor |
| C-M05-02 | `GET /policies/:id`; `GET /policies/:id/versions`; `GET /policies/:id/change-log` | | Policy, PolicyVersion[] | `policies.read` (OBJ-PUB) or `policies.read_all`; OBJ-AUD for auditor (rev P3) |
| C-M05-03 | `POST /policies`; `PATCH /policies/:id` | name, text, reviewCycleMonths, changeReason (≥10 for new version) | Policy | `policies.write`; edit only by OBJ-OWN and only in Draft |
| C-M05-04 | `POST /policies/:id/submit` | approverId, version | Policy | `policies.write` + OBJ-OWN; approver eligible (D-30) |
| C-M05-05 | `POST /policies/:id/approve` / `return` / `publish` | reason ≥10, effectiveAt (≤+90 d), version | Policy | `policies.approve`; named approver or live delegate; SOD not author/editor |
| C-M05-06 | `POST /policies/:id/emergency-publish` | justification ≥20 | Policy + approval | `policies.emergency` (admin); 4E:`policy.emergency` (retrospective) |
| C-M05-07 | `POST /policies/:id/owner` | ownerId, reason ≥10 | Policy | `policies.write` + admin base permission `members.manage` |
| C-M05-08 | `POST /policies/:id/controls`; `POST /policies/:id/controls/:cid/delete` | controlId | Policy | `policies.write` |
| C-M05-09 | `POST /policies/:id/remind` | | count reminded | `policies.write`; once per 24 h |
| C-M05-10 | `GET /policies/:id/attestations` [state] | | PolicyAttestation[] (person ids) | `policies.read_all` |
| C-M05-11 | `POST /policies/:id/acknowledge` | versionId | PolicyAttestation | `policies.acknowledge`; OBJ-SELF; live version only; **auditor, vendor, viewer have no `policies.acknowledge`** (F1-01) |
| C-M05-12 | `GET /me/attestations` | | own PolicyAttestation[] with policy names | `policies.acknowledge`; OBJ-SELF |
| C-M05-13 | `POST /policies/:id/exceptions`; `POST /policies/:id/exceptions/:exId/decide` | scope, reason, expiresAt / decision, reason | PolicyException / approval | `policies.write` / `policies.approve`; 4E:`policy.exception` |
| C-M05-14 | `GET /me/remarks` [status] | | own PolicyRemark[] {id, policyId, policyName, versionId, section, text, dueAt, status} | `policies.acknowledge`; OBJ-SELF; "My remarks" kept by owner (OD-05, DA-14) (rev P3) |
| C-M05-15 | `POST /policies/:id/versions/:vid/remarks`; `POST /policies/remarks/:rid/resolve` | section, text ≤2000 (E1, DA-01) / reason ≥10 | PolicyRemark | create: `policies.read` + OBJ-PUB (or `policies.read_all` for drafts); resolve: `policies.write` + OBJ-OWN (policy owner); auditor, vendor, viewer: none (needs 2B table `policy_remark`) (rev P3) |
| C-M05-16 | `POST /policies/:id/retire`; `POST /policies/:id/review/confirm` | reason ≥10, version | approval / Policy | retire: `policies.write` + OBJ-OWN, 4E:`policy.retire` (D-K15); review confirm (D-01 ReviewDue → Active): `policies.approve`, named approver, SOD D-30 (rev P3) |

### 2.7 M06 Risk (ISO 27005, both methods)

Auditor rule (DA-07): auditors have no risk list. Every M06 route returns 404 to an auditor; an auditor reads only risk snapshots shared with a live engagement, through C-M08-13 (`risk.read` "S" in E-31 means exactly this) (rev P3).

Shapes: **Risk** `STD, title, scenario, method (event, asset), category, team, jurisdiction, ownerId, inherent {l, i, score}, current {l, i, score}, residual {l, i, score}, treatmentOption, status (Draft, Submitted, ChangesRequested, Open, Treating, Accepted, Closed), assets[], threats[], vulnerabilities[], controls[], nextReviewAt, acceptanceId?`; **RiskTreatment** `STD, riskId, option, plan, ownerId, dueAt, status, controls[]`; **TreatmentAction** `STD, treatmentId, text, ownerId, dueAt, status (Open, Done, Cancelled), cancelReason`; **RiskAcceptance** `STD, riskId, band, authority, rationale, expiresAt, status, boardEvidence {ref, date, body, minutesFileId}, approvalId`; **RiskReview** `STD, riskId, dueAt, completedAt, outcome, reviewerId`; **Asset/Threat/Vulnerability** `STD, name, type, ownerId, description, (asset: classification, value), (threat: source, category), (vulnerability: affectedAssets[], severity)`; **RiskCriteria** `likelihoodScale[], impactScale[], matrix, bands[], acceptanceLadder[], appetite, boardThreshold`; **InterestedParty** `STD, name, requirement, location, riskIds[]`; **RiskSnapshot** `id, kind (approved, all), sha256, createdBy, createdAt, sharedWithAudits[]`; **RiskImport** `STD, rows, newCount, updateCount, status, approvalId`.

| ID | Endpoint | Request | Response | Authorisation |
|---|---|---|---|---|
| C-M06-01 | `GET /risk/risks` [status, band, category, team, ownerId, mine, cell, method] | | Risk[] | `risk.read` |
| C-M06-02 | `GET /risk/risks/:id`; `GET /risk/risks/:id/history` | | Risk; history from `record_history` | `risk.read` |
| C-M06-03 | `POST /risk/risks`; `PATCH /risk/risks/:id` | fields above | Risk | `risk.write` |
| C-M06-04 | `POST /risk/risks/:id/score` | inherent/current/residual l,i, version | Risk (acceptance revalidated, D-41) | `risk.write` |
| C-M06-05 | `POST /risk/risks/:id/links` ; `.../links/:linkId/delete` | type (control, asset, threat, vulnerability, party), targetId | Risk | `risk.write` |
| C-M06-06 | `POST /risk/risks/:id/submit` / `approve` / `request-changes` | note, version | Risk | submit `risk.write`; approve/request `risk.approve`; SOD approver ≠ last editor, submitter |
| C-M06-07 | `POST /risk/risks/:id/acceptances` | rationale, expiresAt ≤12 mo, boardEvidence? | RiskAcceptance (+ approval when Board) | `risk.accept` with rank ≥ band authority (E-41); SOD ≠ owner, last editor, submitter; residual >15 → 4E:`risk.board-evidence` |
| C-M06-08 | `POST /risk/acceptances/:id/withdraw` | reason | RiskAcceptance | `risk.accept` + OBJ-SELF (recorder) (rev P3) |
| C-M06-09 | `POST /risk/risks/:id/reopen` / `close` | reason, version | Risk | reopen of a Closed risk: `risk.approve` (reason ≥10, D-04); reopen of an Accepted risk: `risk.write`; close: `risk.approve` with SOD rules (D-32) (rev P3) |
| C-M06-10 | `GET/POST /risk/risks/:id/treatments`; `PATCH /risk/treatments/:id` | option, plan, ownerId, dueAt | RiskTreatment | `risk.write` |
| C-M06-11 | `POST /risk/treatments/:id/actions`; `POST /risk/actions/:id/complete` / `cancel` | text, ownerId, dueAt / reason ≥10 | TreatmentAction | `risk.write`; complete also OBJ-OWN of the action |
| C-M06-12 | `GET/POST/PATCH /risk/assets`, `/risk/threats`, `/risk/vulnerabilities` (+ `/:id/delete`) | shapes above | records | read `risk.read`; write `risk.write` |
| C-M06-13 | `GET /risk/criteria`; `PATCH /risk/criteria` | RiskCriteria, version | RiskCriteria | read `risk.read`; write `risk.configure`; 4E:`risk.criteria` (changes acceptance authority) |
| C-M06-14 | `GET /risk/method`; `PATCH /risk/method` | method enablement | settings | `risk.configure` |
| C-M06-15 | `GET/POST /risk/parties`; `POST /risk/parties/:id/links`; `.../links/:rid/delete`; `/risk/parties/:id/delete` | | InterestedParty | `risk.read` / `risk.write` |
| C-M06-16 | `GET /risk/reviews` [due, overdue]; `POST /risk/reviews/:id/complete` | outcome, note | RiskReview | `risk.read` / `risk.write` + OBJ-OWN or `risk.approve` |
| C-M06-17 | `POST /risk/snapshots`; `GET /risk/snapshots`; `POST /risk/snapshots/:id/link` | kind | RiskSnapshot / download token | create `risk.snapshot`; list and download `risk.read` (not auditor); auditor: C-M08-13 only, OBJ-AUD on the snapshot; link audited (F-EV-03) (rev P3) |
| C-M06-18 | `POST /risk/imports` (upload fileId or rows ≤5,000) ; `GET /risk/imports/:id` ; `POST /risk/imports/:id/withdraw` | mapping, rows | RiskImport | `risk.write`; updates of existing → 4E:`risk.import`; a `fileId` whose scan state is not clean is 409 `invalid_state` (`file_not_scanned`), and the parser reads bytes only through `storagebroker` (D-70a) (rev P4) |

### 2.8 M07 Issues (corrective actions)

Shapes: **Issue** `STD, title, severity, ownerId, dueAt, status (Open, InProgress, ClosurePending, Closed, Cancelled), rootCause, correctiveAction, source (manual, finding, risk, control, automation, agent), links[], tasks[], closure {proposedBy, note, approvalId}`; **IssueTask** `id, text, done, ownerId`.

| ID | Endpoint | Request | Response | Authorisation |
|---|---|---|---|---|
| C-M07-01 | `GET /issues` [status, severity, ownerId, due, source] | | Issue[] | `issues.read`; API key: OBJ-KEY `read:issues` (rev P3) |
| C-M07-02 | `GET /issues/:id` | | Issue | `issues.read`; API key: OBJ-KEY `read:issues` (rev P3) |
| C-M07-03 | `POST /issues`; `PATCH /issues/:id` | title, severity, ownerId, dueAt | Issue | `issues.write`; owner, due, severity changes need `issues.manage`; locked while ClosurePending; High/Critical cannot be lowered while open; API key: OBJ-KEY `write:issues` (create and PATCH only) (rev P3) |
| C-M07-04 | `POST /issues/:id/status` | status, version | Issue | `issues.write`; reopen needs `issues.manage` |
| C-M07-05 | `POST /issues/:id/closure` / `closure/withdraw` | note ≥10 | approval | `issues.write`; High/Critical → 4E:`issue.close` |
| C-M07-06 | `POST /issues/:id/rca` | rootCause, correctiveAction | Issue | `issues.write` |
| C-M07-07 | `POST /issues/:id/tasks`; `PATCH /issues/:id/tasks/:taskId` | text, ownerId / done | IssueTask | `issues.write` |
| C-M07-08 | `POST /issues/:id/links`; `.../links/:linkId/delete` | targetType, targetId | Issue | `issues.write` + read on target |
| C-M07-09 | `POST /issues/:id/delete` | reason | 204 | `issues.manage`; not High/Critical unless Closed; not if a finding references it |

### 2.9 M08 Audits

Shapes: **Audit** `STD, name, frameworkId, scope, leadId, stage (Planning, Fieldwork, Reporting, Complete), startAt, fieldworkStartAt, endAt, progress, populationsFrozenAt, locked`; **AuditorAccess** `id, auditId, personId, startsAt, endsAt, status (Pending, Live, Ended, Expired)`; **AuditSharedItem** `id, auditId, itemType (control, evidence, policy, risk_snapshot), itemId, versionId (evidence and policy: the version shared; evidence files of a shared evidence item are included by default, DA-07), sharedBy (display name only when the caller is an auditor), sharedAt, frozen, revokedAt` (rev P3); **PbcRequest** `STD, auditId, item, ownerId, status, evidenceIds[]`; **InformationRequest** `STD, auditId, text, raisedBy, status, response, respondedBy`; **Finding** `STD, auditId, title, severity, status (Drafted, Declined, Accepted, Remediating, Closed), issueId, declineReason`; **AuditTest** `STD, auditId, controlId, result, note, testedBy`.

| ID | Endpoint | Request | Response | Authorisation |
|---|---|---|---|---|
| C-M08-01 | `GET /audits` [stage] | | Audit[] | `audits.read` (all) or role auditor: OBJ-AUD on the audit itself (assigned, live) |
| C-M08-02 | `GET /audits/:id` | | Audit + access state | as above |
| C-M08-03 | `POST /audits`; `PATCH /audits/:id` | name, frameworkId, scope, dates | Audit | `audits.manage` |
| C-M08-04 | `POST /audits/:id/auditor-access`; `POST /audits/:id/auditor-access/:accessId/end` | personId (role auditor), startsAt, endsAt ≤180 d / reason | AuditorAccess | `audits.manage`; ending is immediate; also `POST /audits/:id/auditor-access/:accessId/extend` (endsAt ≤ startsAt + 180 d, `audits.manage`) (rev P3). A grant or extension whose total window exceeds 90 days → 4E:`audit.access.long` (D-K40). Every grant and extension notifies all tenant admins (bell and email: auditor display name, audit, window) (rev P4, P4-A2-23) |
| C-M08-05 | `GET /audits/:id/shared-items`; `POST /audits/:id/shared-items` ; `POST /audits/:id/shared-items/:sid/revoke` | items[{itemType, itemId}] (≤500) | AuditSharedItem[] | list: `audits.manage` or OBJ-AUD; share/revoke `audits.manage`; item kinds per DA-07 (sharing evidence includes its files); revoke refused (422 `rule_refused`, reason `AUD-FROZEN`) when the row is frozen (rev P3). A share after the population freeze → 4E:`audit.share.late` (D-K41). The first share to an engagement notifies all tenant admins (rev P4, P4-A2-23) |
| C-M08-06 | `POST /audits/:id/populations/freeze` | | Audit (shared set becomes immutable; later shares need reason) | `audits.manage` |
| C-M08-07 | `POST /audits/:id/advance`; `POST /audits/:id/complete` | reason ≥10 when open items | Audit | `audits.manage`; complete refused with Drafted findings or open IRs; ends all auditor access |
| C-M08-08 | `GET/POST /audits/:id/pbc`; `POST /audits/:id/pbc/:pid/status`; `POST /audits/:id/pbc/:pid/evidence` | item, ownerId / status / evidenceId | PbcRequest | read `audits.read` or OBJ-AUD; write `audits.manage`; linking evidence auto-shares it, under the same rules as C-M08-05 (first-share notice; after the freeze the link waits for 4E:`audit.share.late`) (rev P4) |
| C-M08-09 | `GET/POST /audits/:id/information-requests`; `POST .../:rid/respond`; `POST .../:rid/close` | text ≥5 / response / — | InformationRequest | read (GET): `audits.read` + OBJ-T for members, or `audits.engage` + OBJ-AUD for the auditor; raise (POST), close: `audits.engage` + OBJ-AUD; respond: `audits.manage` + OBJ-T (rev P4, P4-A2-20) |
| C-M08-10 | `GET/POST /audits/:id/tests`; `PATCH /audits/:id/tests/:tid` | controlId (must be shared), result, note | AuditTest | read (GET): `audits.read` + OBJ-T, or `audits.engage` + OBJ-AUD; write (POST, PATCH): `audits.engage` + OBJ-AUD only (the auditor records tests); `audits.read` alone never writes (rev P4, P4-A2-20) |
| C-M08-11 | `GET/POST /audits/:id/findings`; `POST .../:fid/accept`; `POST .../:fid/decline` | title ≥10, severity / issue fields / reason ≥10 | Finding (+ Issue) | draft: `audits.engage` + OBJ-AUD; accept/decline: `audits.manage` |
| C-M08-12 | `POST /audits/:id/report` | | export job | `audits.manage` or `audits.engage` + OBJ-AUD |
| C-M08-13 | `GET /audits/:id/snapshots/:sid/link` | | download token (C-26) | OBJ-AUD (snapshot shared) or `audits.read`; audited (F-EV-03) (rev P3) |
| C-M08-14 | `GET /auditor/engagements` | | own engagements with windows | role auditor, OBJ-SELF |
| C-M08-15 | `POST /audits/:id/findings/:fid/verify`; `POST /audits/:id/findings/:fid/reject-verification`; `POST /audits/:id/findings/:fid/link-acceptance` | reason ≥10 / riskAcceptanceId | Finding | verify, reject-verification: `audits.manage` (≠ issue owner), or `audits.engage` + OBJ-AUD while the engagement is Live; link-acceptance (D-07 RiskAccepted): `audits.manage` (rev P3) |

### 2.10 M09 Vendors

Shapes: **Vendor** `STD, name, category, tier, riskScore, status (Requested, Onboarding, Approved, Blocked, Offboarded), processesPersonalData, subprocessor (bool, public), region, nextReviewAt, logoFileId, ownerId`; **VendorContact** `id, vendorId, personId?, email (masked to non-managers), name`; **VendorCertificate** `id, vendorId, type, fileId, issuedAt, expiresAt, waiver?`; **VendorAssessment** `STD, vendorId, templateId, kind (onboarding, periodic, ad_hoc), channel (member, portal), contactId, dueAt, status, score, outcome, submissions[{version, at}]`; **VendorFinding** `STD, vendorId, assessmentId?, text, severity, status, closeReason, issueId?`; **VendorRequest** `STD, name, category, criticality, purpose, processesPersonalData, status, requesterId`; **VendorPortalInvite** `id, assessmentId, vendorContactId, expiresAt, state, failedAttempts` (rev P3).

| ID | Endpoint | Request | Response | Authorisation |
|---|---|---|---|---|
| C-M09-01 | `GET /vendors` [tier, status, reviewDue]; `GET /vendors/:id` | | Vendor[] | `vendors.read` |
| C-M09-02 | `POST /vendors`; `PATCH /vendors/:id` | fields | Vendor | `vendors.manage` |
| C-M09-03 | `POST /vendors/:id/gate` | decision (approve, block), reason | Vendor / approval | `vendors.approve`; SOD ≠ requester, adder; Critical → 4E:`vendor.gate` |
| C-M09-04 | `POST /vendors/:id/tier` | tier, reason | approval | `vendors.manage`; 4E:`vendor.tier` |
| C-M09-05 | `GET/POST /vendors/:id/certificates`; `POST /vendors/:id/waivers` | type, fileId, expiresAt / reason, expiry ≤12 mo | certificate / approval | `vendors.manage`; 4E:`vendor.waiver` |
| C-M09-06 | `GET/POST /vendors/:id/findings`; `POST /vendors/findings/:fid/close` | text, severity / reason ≥10 | VendorFinding | `vendors.manage` |
| C-M09-07 | `POST /vendors/:id/logo` / `logo/delete` | fileId (image) | Vendor | `vendors.manage` |
| C-M09-08 | `GET/POST /vendors/:id/contacts` | name, email, personId? | VendorContact | `vendors.manage` |
| C-M09-09 | `GET /vendors/:id/assessments`; `POST /vendors/:id/assessments` | templateId, kind, channel, contactId, dueAt (3..60 d) | VendorAssessment (+ portal invite emailed) | `vendors.manage`; portal needs a work email (no free-mail domains) |
| C-M09-10 | `GET /vendors/assessments/:id` | | assessment, answers, files (names), readiness | `vendors.read`; or `vendors.respond` + OBJ-VEN (rev P3) |
| C-M09-11 | `POST /vendors/assessments/:id/reopen` / `link` / `complete` / `cancel` | questionIds[], note ≥10 / — / score, outcome / reason | VendorAssessment | `vendors.manage`; complete: SOD ≠ the person who sent it when Critical (D-45) |
| C-M09-12 | `POST /vendors/assessments/:id/files/:questionId/link` | | download token (C-26) | `vendors.read`; or `vendors.respond` + OBJ-VEN; audited (F-EV-03) (rev P3) |
| C-M09-13 | `GET /vendors/assessments/mine`; `PUT /vendors/assessments/:id/answers`; `POST /vendors/assessments/:id/submit` | answers[{questionId, answer, comment, fileId}] | VendorAssessment | `vendors.respond` + OBJ-VEN (member-vendor variant) |
| C-M09-14 | `GET /vendors/requests`; `POST /vendors/requests` | name, category, criticality, purpose, processesPersonalData | VendorRequest | create `vendors.request` (≤20 pending per requester, no duplicate pending name); list: `vendors.read` or OBJ-SELF |
| C-M09-15 | `POST /vendors/requests/:id/approve` / `dismiss` | reason ≥10 | Vendor / VendorRequest / approval | `vendors.approve`; SOD ≠ requester; Critical → 4E:`vendor.request.critical` |
| C-M09-16 | `POST /vendors/:id/reassessments` | score, outcome | VendorAssessment (kind periodic, channel internal) | `vendors.manage` |
| C-M09-17 | `POST /vendors/assessments/:id/extend`; `POST /vendors/assessments/:id/portal-invite/revoke` | dueAt (≤60 d), reason ≥10 / reason | VendorAssessment / VendorPortalInvite | `vendors.manage`; revoke immediate and audited (D-06) (rev P3) |

### 2.11 M10 Questionnaires (inbound customer questionnaires, templates, answer library)

Shapes: **QuestionnaireTemplate** `STD, name, version, questions[]`; **TemplateQuestion** `id, text, critical, evidenceRequired, answerType`; **Questionnaire** `STD, name, direction (inbound, outbound), requester, dueAt, status (NotStarted, InProgress, Sent, Submitted, Reopened, Complete) (aligned with 2B, rev P3), questionCount, answeredCount, authorIds[]`; **QuestionResponse** `id, questionnaireId, questionText, answer, libraryAnswerId?, status`; **AnswerLibraryEntry** `STD, question, answer, verified, verifiedBy, uses`; **KbDocument** `STD, name, fileId`.

| ID | Endpoint | Request | Response | Authorisation |
|---|---|---|---|---|
| C-M10-01 | `GET /questionnaires` [status, direction]; `GET /questionnaires/:id` | | Questionnaire[] | `questionnaires.read` |
| C-M10-02 | `POST /questionnaires` (import: fileId or questions[]) | name, dueAt, questions | Questionnaire | `questionnaires.write`; `fileId` must be clean (D-70a, 409 `file_not_scanned`) (rev P4) |
| C-M10-03 | `GET /questionnaires/:id/responses`; `PATCH /questionnaires/:id/responses/:rid` | answer, libraryAnswerId | QuestionResponse | `questionnaires.write` |
| C-M10-04 | `POST /questionnaires/:id/autofill` | | suggestions from verified library (and AI if on) | `questionnaires.write`; AI only if `ai_tenant_settings.enabled` |
| C-M10-05 | `POST /questionnaires/:id/send` | reason | approval | `questionnaires.write`; all answered; 4E:`q.send` |
| C-M10-06 | `GET/POST /questionnaires/answers`; `PATCH /questionnaires/answers/:id`; `POST /questionnaires/answers/:id/verify` | question, answer | AnswerLibraryEntry | read `questionnaires.read`; write `questionnaires.write`; verify `answers.verify`, SOD ≠ author, any editor |
| C-M10-07 | `GET/POST /questionnaires/kb-docs`; `POST /questionnaires/kb-docs/:id/link`; `/kb-docs/:id/delete` | fileId, name | KbDocument | `questionnaires.read` / `questionnaires.write`; indexing reads the file only when clean (D-70a) (rev P4) |
| C-M10-08 | `GET/POST/PATCH /questionnaires/templates` | | QuestionnaireTemplate | `questionnaires.write` (templates used by M09) |

### 2.12 M11 Trust Center (tenant side)

Shapes: **TrustSettings** `publicPageOn, trustRef, sections [{key, visibility (hidden, public, nda)}], brand, chatbotOn, ndaDocumentFileId, ndaVersion, blockedDomains[]`; **TrustDocument** `STD, title, sectionKey, access (Public, OnRequest), fileId, publishedState`; **TrustAccount** `STD, organisation, domain, status, documentIds[] (by id), viewers[]`; **TrustViewer** `id, accountId, emailMasked, personId?, ndaAcceptedVersion, ndaAcceptedAt, status`; **TrustAccessRequest** `STD, viewerEmailMasked, organisation, documentIds[], reason, status, decidedBy, note`; **TrustUpdate** `STD, title, body, publishedAt`; **TrustChat** `id, at, questionPreview (decrypted for `trust.manage` only), answerRef, visitorKind` (rev P3); **TrustSubscription** `id, viewerId|personId, status`.

| ID | Endpoint | Request | Response | Authorisation |
|---|---|---|---|---|
| C-M11-01 | `GET /trust/settings`; `PATCH /trust/settings` | sections, brand, chatbotOn, ndaDocumentFileId, version | TrustSettings | `trust.manage`; making a section `public` or the page on → 4E:`trust.public-page` / `trust.section.public`; off and stricter immediate |
| C-M11-02 | `GET/POST /trust/documents`; `PATCH /trust/documents/:id`; `POST /trust/documents/:id/file`; `POST /trust/documents/:id/link` | title, section, access, fileId | TrustDocument | `trust.manage`; access Public → 4E:`trust.publish`; new file resets Public to OnRequest |
| C-M11-03 | `GET /trust/requests` [status]; `POST /trust/requests/:id/approve` / `deny` | documentIds[], note | TrustAccessRequest | `trust.approve`; SOD ≠ requester (id and email), not a member address, not the unblocker of the domain; blocked domain refused |
| C-M11-04 | `GET /trust/accounts`; `POST /trust/accounts/:id/revoke`; `POST /trust/accounts/:id/viewers/:vid/revoke` | reason ≥10 | TrustAccount | `trust.manage` |
| C-M11-05 | `POST /trust/blocked-domains`; `POST /trust/blocked-domains/:domain/delete` | domain / reason ≥10 | settings | `trust.manage` |
| C-M11-06 | `GET /trust/activity`; `GET /trust/chats` | | viewer activity, change history, chat log | `trust.manage` |
| C-M11-07 | `GET/POST /trust/updates`; `POST /trust/updates/:id/publish` | title, body | TrustUpdate | `trust.manage`; publish to subscribers via notification job |
| C-M11-08 | `GET /trust/view` (member view) | | the same projection as the public page, plus "your access" | `trust.view` |
| C-M11-09 | `POST /trust/view/access-requests`; `POST /trust/view/nda`; `POST /trust/view/subscriptions`; `POST /trust/view/questions`; `POST /trust/view/documents/:id/link` | reason / ndaVersion / — / question / — | as public | `trust.view` + OBJ-SELF; document link needs live account + this person's NDA for that version (per person, OQ-07) unless Public; document link audited (F-EV-03); `questions`: answers drawn only from the caller's granted documents and public sections, NDA document names never revealed (F-AB-07) (rev P3) |

### 2.13 M12 People and access

Shapes: **Person** `STD, kind (member, contractor), personId?, displayName, department, jobTitle, managerId, status, devicePosture? (fed by D-69; needs 2B column `person.device_posture`), mfaEnrolled (from control for members)` (rev P3); **System** `STD, name, owner, privileged (explicit flag, replaces regex)`; **AccessGrant** `STD, personId, systemId, level, grantedAt, status, source (recorded, request, integration)`; **AccessRequest** `STD, beneficiaryId, systemId, level, reason, status, stage, approvalId`; **AccessReview** `STD, name, scope, frozenAt, items[{grantId, decision, decidedBy}], status`.

| ID | Endpoint | Request | Response | Authorisation |
|---|---|---|---|---|
| C-M12-01 | `GET /people` [kind, department, mfa]; `GET /people/:id` | | Person[] | `people.read` |
| C-M12-02 | `POST /people/contractors`; `PATCH /people/:id` | displayName, department, jobTitle | Person | `people.manage` |
| C-M12-03 | `POST /people/:id/mfa-reset` | identityChecks[3], reasonCode, details ≥10, ticket, approverId | approval | `people.mfa_reset` + STEP; SOD not self/subject; 4E:`mfa-reset-member` (2 approvals when subject privileged); refused when identity is not tenant-owned (E-56) |
| C-M12-04 | `POST /people/:id/offboard` | transferToId, reason | result / approval | `people.manage` + STEP for the `person` record; when the person has a membership, the membership change also needs `members.manage`, or becomes 4E:`team.offboard` (approver `members.manage`) whatever the subject's role; not self; not last admin (rev P3) |
| C-M12-05 | `GET/POST /access/systems`; `PATCH /access/systems/:id` | name, privileged | System | `access.manage`; privileged flag change → 4E:`access.system.privileged` |
| C-M12-06 | `GET /access/grants` [personId, systemId]; `POST /access/grants`; `POST /access/grants/:id/revoke` | personId, systemId, level, reason ≥10 | AccessGrant | read `access.read` or OBJ-SELF (own grants); write `access.manage`; SOD not own access |
| C-M12-07 | `GET /access/requests`; `POST /access/requests` | beneficiaryId (self unless `access.manage`), systemId, level, reason | AccessRequest | create `access.request`; list `access.read` or OBJ-SELF |
| C-M12-08 | `POST /access/requests/:id/decide` | decision, reason ≥10 | AccessRequest / approval | `access.approve`; SOD ≠ requester, beneficiary; privileged → 4E:`access-request` second stage |
| C-M12-09 | `GET/POST /access/reviews`; `POST /access/reviews/:id/items/:itemId/decide`; `POST /access/reviews/:id/complete` | name, scope / keep, revoke / — | AccessReview | `access.review`; SOD not own account; privileged reviews completed by ≠ creator |

### 2.14 M13 AI governance

Shapes: **AiSystem** `STD, name, surface, model, provider, purpose, dataReached, autonomy, users, ownerId, euClass {draft, confirmed, by}, guardrailTier, status (Registered, InReview, Approved, Archived), oversight`; **AiAssessment** `STD, systemId, kind (impact, fria, bias, review), status, summary, submittedBy, approvedBy, result`; **AiSignal** `STD, systemId?, source, kind, description, status (Open, RaisedRisk, RaisedIssue, Dismissed)`.

| ID | Endpoint | Request | Response | Authorisation |
|---|---|---|---|---|
| C-M13-01 | `GET /ai/systems`; `GET /ai/systems/:id`; `GET /ai/signals` | | AiSystem[], AiSignal[] | `ai.read` |
| C-M13-02 | `POST /ai/systems`; `PATCH /ai/systems/:id` | fields | AiSystem | `ai.manage`; or `ai.read` + OBJ-OWN (system owner) for PATCH; archived read-only (rev P3) |
| C-M13-03 | `POST /ai/systems/:id/owner` / `evidence` / `oversight` | | AiSystem | `ai.manage`; or `ai.read` + OBJ-OWN (rev P3) |
| C-M13-04 | `POST /ai/systems/:id/classification` ; `.../classification/confirm` | class, rationale | AiSystem | draft `ai.manage`, or `ai.read` + OBJ-OWN; confirm `ai.approve`, SOD ≠ drafter, ≠ owner (rev P3) |
| C-M13-05 | `POST /ai/systems/:id/guardrail` / `archive` | tier / reason | approval | `ai.manage`; 4E:`ai.guardrail` / `ai.archive` |
| C-M13-06 | `POST /ai/systems/:id/assessments`; `POST /ai/assessments/:id/submit` / `approve` / `return` | kind, summary / reason ≥10 | AiAssessment | write `ai.manage`, or `ai.read` + OBJ-OWN (rev P3); approve/return `ai.approve`, SOD ≠ submitter, author, owner |
| C-M13-07 | `POST /ai/systems/:id/review/complete` / `review/restart` | reason | AiSystem | `ai.approve`, SOD ≠ registrant, owner |
| C-M13-08 | `POST /ai/signals/:id/raise-risk` / `raise-issue` / `dismiss` | reason ≥10 | AiSignal (+ risk/issue) | `ai.manage` (+ `risk.write` / `issues.write`) |
| C-M13-09 | `POST /ai/systems/:id/risk-classification` | tier, rationale ≥15 | AiSystem (draft classification) | `ai.manage`, or `ai.read` + OBJ-OWN; records a draft classification (same record as C-M13-04); takes effect only on `…/classification/confirm` (`ai.approve`, SOD ≠ drafter, ≠ owner); if the confirmed tier changes the guardrail tier, 4E:`ai.guardrail`; rules of 2I I-10. Risk-classify fixed, not dropped (OD-05, DA-14) (rev P3) |

### 2.15 M14 Privacy

Shapes: **ProcessingActivity** `STD, name, purpose, lawfulBasis, dataSubjects[], dataCategories[], specialCategory, recipients[], transfers[], retentionRuleId, systems[], ownerId, status (Draft, Approved), reviewAt, templateRef`; **Dpia** `STD, activityId?, aiSystemId?, title, status (Draft, InReview, Approved, Rejected), risks[], measures, residualRisk, consultationRequired, approvedBy`; **DataSubjectRequest** `STD, type (access, rectification, erasure, restriction, portability, objection), jurisdiction, channel, subjectRef (pseudonymous), receivedAt, identityStatus, dueAt, extendedTo, pausedFor[], status, outcome, responseFileId`; **DsrTask** `STD, dsrId, systemId, action, assigneeId, status, completedAt, note`; **RetentionRule** `STD, recordType, period, floor, basis, status`; **LegalHold** `STD, scope, reason, placedBy, status, releasedBy`.

| ID | Endpoint | Request | Response | Authorisation |
|---|---|---|---|---|
| C-M14-01 | `GET/POST /privacy/activities`; `PATCH /privacy/activities/:id`; `POST /privacy/activities/:id/approve`; `POST /privacy/activities/from-template` | | ProcessingActivity | read `privacy.read`; write `privacy.manage`; approve `dpia.approve`, SOD ≠ author (owner may approve, OD-06) (rev P3) |
| C-M14-02 | `GET/POST /privacy/dpias`; `PATCH /privacy/dpias/:id`; `POST /privacy/dpias/:id/submit` / `approve` / `return` | | Dpia | read `privacy.read`; write and submit `privacy.manage`; approve/return `dpia.approve`, SOD ≠ author, ≠ submitter; 4E:`privacy.dpia` when residual risk is High (consultation flag) |
| C-M14-03 | `GET /privacy/dsars` [status, type, due]; `GET /privacy/dsars/:id` | | DataSubjectRequest | `dsar.handle` |
| C-M14-04 | `POST /privacy/dsars` | type, jurisdiction, channel, subject contact (encrypted with a per-subject key), receivedAt | DataSubjectRequest | `dsar.handle` |
| C-M14-05 | `POST /privacy/dsars/:id/identity` | method, result, evidenceFileId | DataSubjectRequest | `dsar.handle`; verifier recorded |
| C-M14-06 | `POST /privacy/dsars/:id/extend` / `pause` / `resume` | reason, newDueAt (≤ legal maximum from `ref`) | DataSubjectRequest | `dsar.handle`; extension → notification to subject task |
| C-M14-07 | `GET /privacy/dsars/:id/tasks`; `POST /privacy/dsars/:id/tasks/generate`; `PATCH /privacy/dsr-tasks/:id` | systems from RoPA | DsrTask[] | `dsar.handle`; or `privacy.read` + OBJ-OWN (task assignee): task fields only, never subject contact data (rev P3) |
| C-M14-08 | `POST /privacy/dsars/:id/discover` | | in-Selvara matches (record refs by table) | `dsar.handle`; runs D-52 search job; audited (F-EV-03) (rev P3) |
| C-M14-09 | `POST /privacy/dsars/:id/erasure` | scope (records, subject key) | approval | `dsar.handle`; 4E:`dsar.erasure` (approver `dsar.approve`, ≠ requester); key destruction needs certificate (D-53) |
| C-M14-10 | `POST /privacy/dsars/:id/respond` / `close` | responseFileId, outcome / — | DataSubjectRequest | `dsar.handle`; disclosure package → 4E:`dsar.disclose` |
| C-M14-11 | `GET/POST/PATCH /privacy/retention-rules` | period | RetentionRule | read `privacy.read`; lengthen `privacy.manage`; shorten → 4E:`team.retention` (not below floor) |
| C-M14-12 | `GET/POST /privacy/legal-holds`; `POST /privacy/legal-holds/:id/release` | scope, reason | LegalHold | place `privacy.manage` (immediate); release → 4E:`team.hold` (placer forbidden) |
| C-M14-13 | `POST /privacy/retention/dry-run` | recordType | counts due | `privacy.read` |
| C-M14-14 | `POST /privacy/dsars/:id/reject` | reason ≥15 | DataSubjectRequest | `dsar.approve`, SOD ≠ handler (D-10 IdentityCheck → Rejected) (rev P3) |

### 2.16 M15 Commitments

Shapes: **Contract** `STD, counterparty, kind, fileId, effectiveAt, endsAt, ownerId`; **Commitment** `STD, contractId, clause, detail, obligationType, dueRule, status, reviewedBy, reviewNote`; **Incident** `STD, summary, startedAt, severity, personalDataInvolved, notifyDeadlines[{party, dueAt}], status, outcome, closedAt, issueIds[]`.

| ID | Endpoint | Request | Response | Authorisation |
|---|---|---|---|---|
| C-M15-01 | `GET /commitments`; `GET /commitments/contracts` | | Commitment[], Contract[] | `commitments.read` |
| C-M15-02 | `POST /commitments/contracts` (import fileId) ; `POST /commitments` | | Contract / Commitment | `commitments.manage`; the import parses the file only when clean (D-70a, 409 `file_not_scanned`) (rev P4) |
| C-M15-03 | `POST /commitments/:id/review` | note ≥10 | Commitment | `commitments.manage`; SOD ≠ importer |
| C-M15-04 | `POST /commitments/analysis` | contractId | job id; result clauses[] | `commitments.manage`; AI only if enabled; the contract file must be clean (D-70a) (rev P4) |
| C-M15-05 | `GET /commitments/incidents`; `POST /commitments/incidents`; `POST /commitments/incidents/:id/close`; `POST /commitments/incidents/:id/links` | summary / outcome ≥10 / issueId | Incident | `commitments.manage`; several concurrent incidents allowed |

### 2.17 M16 Reports

Shapes: **ReportSchedule** `STD, pack, frequency, sendOn, recipients [{personId} | {externalEmail (encrypted)}], external (bool), status, approvalId, nextRunAt`; **ReportRun** `id, scheduleId?, pack, period, status, fileId, rowCounts, createdBy, createdAt`.

| ID | Endpoint | Request | Response | Authorisation |
|---|---|---|---|---|
| C-M16-01 | `GET /reports/catalogue`; `GET /reports/runs`; `GET /reports/metrics` [metric, period] | | catalogue, ReportRun[], series | `reports.read` |
| C-M16-02 | `POST /reports/runs` | pack, period, format | ReportRun (async) | `reports.read` + `data.export` |
| C-M16-03 | `POST /reports/runs/:id/link` | | download token (C-26) | `reports.read`, OBJ-SELF or `reports.manage`; audited (F-EV-03) (rev P3) |
| C-M16-04 | `GET/POST /reports/schedules`; `PATCH /reports/schedules/:id`; `POST /reports/schedules/:id/delete` | fields, reason (≥10 if external) | ReportSchedule / approval | `reports.manage`; external recipients → 4E:`report.distribution` |

### 2.18 M17 Integrations

Shapes: **Integration** `STD, provider, status (Draft, PendingApproval, Connected, Error, Disconnected), config (non-secret fields), secretRef (never returned), scopes[], lastSyncAt, nextSyncAt, health`; **IntegrationSyncRun** `id, integrationId, startedAt, finishedAt, status, counts, error`; **IntegrationCheck** `id, integrationId, name, controlIds[]`.

| ID | Endpoint | Request | Response | Authorisation |
|---|---|---|---|---|
| C-M17-01 | `GET /integrations/providers`; `GET /integrations`; `GET /integrations/:id`; `GET /integrations/:id/runs`; `GET /integrations/:id/accounts` | | lists | `integrations.read`; accounts (personal data) need `people.read` |
| C-M17-02 | `POST /integrations` ; `POST /integrations/:id/connect` | provider / config fields | Integration (test read, then approval) | `integrations.manage` + STEP; 4E:`integration.connect` |
| C-M17-03 | `GET /integrations/oauth/callback` | state, code | redirect | `integrations.manage`; state bound to session and integration id (rev P3) |
| C-M17-04 | `POST /integrations/:id/sync`; `POST /integrations/sync-all` | | IntegrationSyncRun (job) | `integrations.manage`; 1 per 5 min |
| C-M17-05 | `POST /integrations/:id/disconnect` | reason | Integration (account data erased) | `integrations.manage` |
| C-M17-06 | `POST /integrations/checks/:id/controls`; `.../controls/:cid/delete` | controlId | IntegrationCheck (a `control_test` with `source = integration`; no separate table) | `integrations.manage` (rev P3) |

### 2.19 M18 API keys, webhooks, custom tests, events

Shapes: **ApiKey** `STD, label, scopes[], status, prefix, expiresAt, lastUsedAt, uses, ownerId, ipAllowlist[]`; **Webhook** `STD, url (host shown), events[], status (PendingApproval, Active, Paused, Disabled), secretVersion, failures, lastDeliveryAt`; **WebhookDelivery** `id, webhookId, eventId, eventType, attempt, status, httpStatus, ms, nextAttemptAt, at`; **CustomTest** `STD, name, target, schedule, result, lastAt`; **ApiEvent** `id, type, resource, status, detail, at, source`. Storage (rev P3): CustomTest = `control_test` (kind `api`); ApiEvent = `test_run` (source `api`); McpGrant = `integration` (provider `mcp_server`) (2B B-W04, B-W05, B-W30).

| ID | Endpoint | Request | Response | Authorisation |
|---|---|---|---|---|
| C-M18-01 | `GET /api/keys`; `POST /api/keys`; `POST /api/keys/:id/reveal`; `POST /api/keys/:id/rotate`; `POST /api/keys/:id/revoke` | label, scopes[], days (30/90/365), ipAllowlist | ApiKey (+ secret once) | `api.manage` + STEP; any `write:*` or `read:evidence-files` scope → 4E:`api.key` (E-62) (rev P3); reveal: requester only, ≤60 min after approval (E-62) |
| C-M18-02 | `GET /api/webhooks`; `POST /api/webhooks`; `POST /api/webhooks/:id/secret` (reveal/rotate); `POST /api/webhooks/:id/test`; `POST /api/webhooks/:id/pause|resume`; `POST /api/webhooks/:id/delete` | url (https), events[] | Webhook | `api.manage` + STEP (create, URL change, secret reveal or rotate; E-16); create and URL change → 4E:`api.webhook`; max 20 (rev P3) |
| C-M18-03 | `GET /api/webhooks/:id/deliveries` [status]; `POST /api/webhooks/deliveries/:id/redeliver` | | WebhookDelivery[] | `api.manage` |
| C-M18-04 | `GET/POST /api/custom-tests`; `POST /api/custom-tests/:id/run`; `/delete` | name, target, schedule | CustomTest | `api.manage` |
| C-M18-05 | `GET /api/events`; `POST /api/events/test` | | ApiEvent[] | `api.manage` |
| C-M18-06 | `POST /api/v1/events` (API key) | type, resource, status, detail | ApiEvent | OBJ-KEY scope `events:push` |
| C-M18-07 | `GET /api/v1/<module>/...` read routes (controls, risks, issues, policies, vendors, evidence metadata, ai-systems, frameworks, audits) | | as browser | OBJ-KEY `read:<module>`; never personal data fields of members beyond ids; evidence files excluded unless `read:evidence-files` |

### 2.20 M19 Assistant and agents

Shapes: **AiTenantSettings** `enabled, providerKey, piiMode (block, mask), trackRecord (3, 2, 0)`; **Agent** `STD, name, trigger, runsAs (requester, service_account), autonomy (suggests, acts), status, certifiedUntil, creatorId`; **AgentRun** `STD, agentId, triggeredBy, status, draft, changes[]`; **AgentChange** `id, runId, target, before, after, applied, rejectedReason`; **McpGrant** `server, status, approvalId`.

| ID | Endpoint | Request | Response | Authorisation |
|---|---|---|---|---|
| C-M19-01 | `GET /assistant/settings`; `POST /assistant/settings/enable|disable`; `POST /assistant/settings/pii-mode`; `POST /assistant/settings/track-record` | | AiTenantSettings / approval | `assistant.manage`; enable and mask: + STEP (E-16); enable → 4E:`ai.enable`, mask → 4E:`ai.mask`; off/block immediate; provider must be platform-approved (D-80). Also `POST /assistant/settings/provider` (providerKey from the platform-approved list; `assistant.manage` + STEP; 4E:`ai.enable`) (rev P3) |
| C-M19-02 | `POST /assistant/ask`; `POST /assistant/prefill`; `POST /assistant/drafts/:id/reviewed` | question ≤2000, recordRefs ≤25 / document text | draft | `assistant.use`; records limited to those the caller can read; PII blocker; 30/h |
| C-M19-03 | `GET/POST /assistant/agents`; `POST /assistant/agents/:id/enable|pause|delete|run`; `POST /assistant/agents/pause-all`; `POST /assistant/agents/:id/autonomy/raise|lower`; `POST /assistant/agents/:id/recertify` | | Agent / approval | `assistant.manage`; 4E kinds `assistant.agent.enable`, `.autonomy`, `.recertify` (two approvals for service account) |
| C-M19-04 | `GET /assistant/runs`; `POST /assistant/runs/:id/decide`; `POST /assistant/runs/:id/reject-applied` | decision, reason ≥10 | AgentRun | `assistant.approve`; SOD ≠ triggerer |
| C-M19-05 | `GET /assistant/mcp`; `POST /assistant/mcp/:server/grant|revoke` | | McpGrant / approval | `assistant.manage`; 4E:`assistant.mcp.grant` |

### 2.21 M20 Notifications

| ID | Endpoint | Request | Response | Authorisation |
|---|---|---|---|---|
| C-M20-01 | `GET /notifications` [unread, category] | | [{id, category, title, recordRef, at, readAt, approvalId?}] | OBJ-SELF (keyed by person id, not role) |
| C-M20-02 | `POST /notifications/:id/read`; `POST /notifications/read-all`; `POST /notifications/:id/unread` | | 204 | OBJ-SELF |
| C-M20-03 | `GET /notifications/prefs`; `PUT /notifications/prefs` | [{category, bell, email}] | prefs | OBJ-SELF; approvals-waiting cell locked on |

### 2.22 M21 Approvals (one engine)

Shapes: **Approval** `id, ref, kind, module, subject {type, id, ref}, requesterId, namedApproverId?, needs, votes[{personId, decision, reason, at, onBehalfOf?}], status (Pending, Approved, Rejected, Withdrawn, Expired, Superseded), expiresAt, payloadSummary, eligible (computed for caller), blockedReason`; **Delegation** `STD, delegatorId, delegateId, startsAt, endsAt, reason, status`.

| ID | Endpoint | Request | Response | Authorisation |
|---|---|---|---|---|
| C-M21-01 | `GET /approvals` [status, kind, module, mine] (same as C-SH-05); `GET /approvals/:id` | | Approval | caller is requester, named approver or eligible voter, or holds the module's read permission **and is not auditor, vendor or viewer**; `payloadSummary` hidden unless the caller could read the subject (rev P3) |
| C-M21-02 | `POST /approvals/:id/approve` / `reject` | reason ≥10, version (subject version seen) | Approval (+ applied change on final vote) | engine eligibility (D-22): kind's approver permission, not requester, not in forbid set, one vote each, not expired, STEP where the kind says so |
| C-M21-03 | `POST /approvals/:id/withdraw` | reason | Approval | OBJ-SELF (requester) |
| C-M21-04 | `GET /delegations`; `POST /delegations`; `POST /delegations/:id/revoke` | delegateId, days 1..14, reason ≥10 | Delegation | create `approvals.delegate` (admin, owner); revoke: delegator or `members.manage` |

### 2.23 M22 Audit log

| ID | Endpoint | Request | Response | Authorisation |
|---|---|---|---|---|
| C-M22-01 | `GET /auditlog` [category, actorId, action, from, to, recordRef] | | [{n, at, actorId, actorKind (member, auditor, vendor, platform_staff, system, scim, api_key, agent), actorPrincipal, action, target {type, ref}, outcome, refusalCode, basis, activityId, requestId, hash, prevHash}] (rev P3) | `auditlog.read` |
| C-M22-02 | `POST /auditlog/verify` | from, to | {ok, brokenAt?, anchor {at, digest, external ref}} | `auditlog.read` |
| C-M22-03 | `POST /auditlog/exports` | format, range | job | `auditlog.export`; ≤10/h |
| C-M22-04 | `POST /auditlog/packages` | range, includeRopa | job (log + manifest + verification) | `auditlog.export` |
| C-M22-05 | `GET /records/:type/:id/history` | | record_history entries (encrypted fields shown only if the caller can read them) | read permission of the record's module; OBJ-AUD for auditors, with actors shown by display name only, never by id (DA-07) (rev P3) |

### 2.24 M23 Files

| ID | Endpoint | Request | Response | Authorisation |
|---|---|---|---|---|
| C-M23-01 | `POST /files/uploads` | parentType, parentId, name, size, mime, sha256 | {fileId, uploadUrl (quarantine), expiresAt} | the permission and object rule of the parent type in table C-M23-P below (deny by default: a parent type not in the table is 400 `invalid_field`); `parentId` must exist in the tenant and pass the object rule, else 404; size ≤ the parent type's limit ≤ tenant limit ≤ platform ceiling; type allow-list per parent type (rev P4, P4-A2-18) |
| C-M23-02 | `GET /files/:id` | | file_object metadata incl. scanState | read permission on parent; OBJ-AUD (parent evidence shared) for auditor; OBJ-VEN for vendor. Used by upload progress and file panels (§8) (rev P3) |
| C-M23-03 | `POST /files/:id/download-token` | purpose | download token for `files.<domain>/d/<token>` (5 min; single use for exports; 2F F-U-06) | read permission on parent; OBJ-AUD (parent evidence shared) for auditor; OBJ-VEN for vendor; scanState Clean; audited (F-EV-03). Module link routes (C-M04-07, C-M09-12, C-M16-03, …) call it (rev P3) |
| C-M23-04 | `POST /files/uploads/:id/complete` | sha256 | file_object (scanState Pending) | uploader only (OBJ-SELF); the worker finalises after the signed scanner verdict (2F F-10.1) (rev P3) |

C-M23-P Upload parent types (rev P4, closes P4-A2-18). J-AUTHZ generates one case per row and per role (allowed and refused), including OBJ-VEN and OBJ-OWN refusals.

| parentType | Parent record | Permission | Object rule | Extra rule | Per-file limit (proposed) |
|---|---|---|---|---|---|
| `evidence_version` | evidence (new version) | `evidence.write`; API key `write:evidence` | OBJ-T; OBJ-KEY | evidence not `deletionPending`, not on legal hold | tenant upload limit |
| `vendor_certificate` | vendor | `vendors.manage` | OBJ-T | vendor not Offboarded | tenant upload limit |
| `vendor_logo` | vendor | `vendors.manage` | OBJ-T | image types only | 2 MB |
| `vendor_answer` | vendor assessment question (member-vendor path, C-M09-13) | `vendors.respond` | OBJ-VEN | assessment in a state that accepts answers | tenant upload limit |
| `vendor_portal_answer` | vendor assessment question (visitor path, C-PU-09) | vendor visitor session | own assessment only | 60 uploads/h | tenant upload limit |
| `trust_document`, `trust_nda` | Trust Center document or NDA | `trust.manage` | OBJ-T | new file resets Public to OnRequest (C-M11-02) | tenant upload limit |
| `kb_document` | questionnaire knowledge base | `questionnaires.write` | OBJ-T | | tenant upload limit |
| `questionnaire_import` | new questionnaire | `questionnaires.write` | OBJ-T | parsed only when clean (D-70a) | 10 MB |
| `risk_import` | new risk import | `risk.write` | OBJ-T | parsed only when clean (D-70a) | 10 MB |
| `contract` | contract | `commitments.manage` | OBJ-T | parsed and analysed only when clean (D-70a) | tenant upload limit |
| `dsar_identity`, `dsar_response` | data subject request | `dsar.handle` | OBJ-T | identity evidence is never shared with auditors | tenant upload limit |
| `brand_logo` | tenant settings | `settings.manage` | OBJ-T | image types only | 2 MB |

Auditors, viewers and API keys without the listed scope never upload (404 or 403 `scope_missing`). A file uploaded for one parent can be linked only to that parent (the `file_object.owner_table`/`owner_id` allow-list trigger, 2B B-E23.1).

### 2.25 M24 Help (control plane, tenant caller) and M25 Billing (tenant view)

| ID | Endpoint | Request | Response | Authorisation |
|---|---|---|---|---|
| C-M24-01 | `GET /help/questions`; `POST /help/questions`; `POST /help/questions/:id/follow-up|close` | topic, subject 5..160, body ≤4000 | SupportQuestion {id, topic, subject, status, messages[]} | `help.ask`; OBJ-SELF; ≤10 open; data in `control.support_questions` |
| C-M24-02 | `GET /help/articles`; `GET /help/articles/:slug` | | static content | any session |
| C-M25-01 | `GET /billing/subscription` | | {plan, period, seats {used, limit}, entitlements[], usage[] (from `control.usage_meters`), billingEntity} | `billing.read` |
| C-M25-02 | `GET /billing/invoices`; `POST /billing/invoices/:id/link`; `POST /billing/invoices/:id/pay` | | Invoice[]; provider checkout URL | `billing.read` / `billing.manage` |
| C-M25-03 | `GET /billing/plans`; `POST /billing/plan-requests`; `POST /billing/plan-requests/:id/withdraw` | planId, effective (next period) | PlanRequest | `billing.manage`; one open request |
| C-M25-04 | `POST /billing/payment-method/session` | | provider hosted page URL | `billing.manage`; no card data touches Selvara (F1-07) |

### 2.26 M26 Automation

Shapes: **AutomationRule** `STD, name, trigger {type, filter}, actions[] (create_issue, notify_owner, request_evidence; never approve, delete, publish or change access), status (Draft, PendingApproval, Active, Paused), runCap`; **AutomationRun** `id, ruleId, at, dryRun, actions[{type, targetRef, result}]`.

| ID | Endpoint | Request | Response | Authorisation |
|---|---|---|---|---|
| C-M26-01 | `GET /automation/rules`; `GET /automation/runs` | | lists | `automation.read` |
| C-M26-02 | `POST /automation/rules`; `PATCH /automation/rules/:id`; `POST /automation/rules/:id/delete` (not Active) | | AutomationRule | `automation.manage`; ≤25 rules |
| C-M26-03 | `POST /automation/rules/:id/preview`; `POST /automation/rules/:id/run` | | AutomationRun (≤20 actions) | `automation.manage` |
| C-M26-04 | `POST /automation/rules/:id/enable` / `pause` | reason | approval / rule | `automation.manage`; enable → 4E:`team.rule` (creator forbidden); pause immediate |

### 2.27 Exports (cross-module)

| ID | Endpoint | Request | Response | Authorisation |
|---|---|---|---|---|
| C-EX-01 | `POST /exports` | kind (`controls.soa`, `controls.matrix`, `control.workpaper`, `framework.gap`, `risk.register`, `evidence.list`, `issues.list`, `members.list`, `ropa`, ...), filters, format | export job; `GET /exports/:id`; `POST /exports/:id/link` | module read permission + `data.export`; auditor: only shared items (OBJ-AUD), result watermarked with engagement ref. Rows are `report_run` with `kind = module_export` (2B B-E16.2) (rev P3) |

---

## 3. Account API (`/api/v1/account`)

| ID | Endpoint | Request | Response | Authorisation |
|---|---|---|---|---|
| C-AC-01 | `POST /account/challenge` | | {seed, digits} | public; rate limited |
| C-AC-02 | `POST /account/sign-in/discover` | email | {method: password, sso (redirect URL), both} (same shape for unknown emails) | public; never reveals existence (E-12) |
| C-AC-03 | `POST /account/sign-in` | email, password, challenge? | {step: mfa|enroll|passkey, ticket} | public; lockout, IP rules (SOD_MATRIX §12) |
| C-AC-04 | `POST /account/sign-in/verify` | ticket, code or recoveryCode | session cookie, {tenant, role} | ticket |
| C-AC-05 | `POST /account/sign-in/passkey/options`; `POST /account/sign-in/passkey` | ticket / assertion | session cookie | ticket; passkey-first sign-in allowed (E-13) |
| C-AC-06 | `GET /account/sso/start` ; `GET /account/sso/callback/saml` ; `GET /account/sso/callback/oidc` | connection hint / provider response | redirect with session cookie | public; state + PKCE + nonce bound to a pre-auth cookie |
| C-AC-07 | `POST /account/sign-out`; `POST /account/sessions/revoke-others`; `GET /account/sessions` | | | session |
| C-AC-08 | `POST /account/session/tenant` | tenantRef | new session cookie (rotated), {tenant, role, landing} | session; active membership; target tenant's auth policy satisfied (E-24) |
| C-AC-09 | `POST /account/reauth` | password or passkey assertion | {stepUpUntil} | session |
| C-AC-10 | `GET /account/security` | | factors, passkeys, recovery code count, sessions, sign-in history, alerts | session, OBJ-SELF |
| C-AC-11 | `POST /account/recovery-codes`; `POST /account/passkeys/options`; `POST /account/passkeys`; `POST /account/passkeys/:id/delete`; `POST /account/totp/enroll|verify|delete`; `POST /account/password` | | | session + STEP; last required factor cannot be removed |
| C-AC-12 | `POST /account/password/reset-request`; `GET /account/password/reset/:token`; `POST /account/password/reset` | email / — / code + new password | generic 202 / valid / 204 | public; second factor required; all sessions revoked |
| C-AC-13 | `POST /account/join-requests`; `POST /account/invitations/accept` | name, email, password, companyCode / token, one-time code, password | generic 202 / session | public; generic answers; invitation accept: the invitee proves the invited email by a one-time code sent to it before the account is created (rev P3) |
| C-AC-14 | `GET /account/tours`; `PUT /account/tours` | | prefs | session |
| C-AC-15 | `GET /account/profile`; `PATCH /account/profile` | displayName | profile | session; propagated to `member_profile` in each tenant by job D-79 |
| C-AC-16 | `POST /account/data-requests` | type | ticket (the DSR ref in Selvara's own tenant) | session; Selvara-as-controller DSAR (D-56, 2G G-D-07): the request is created as a DSR in Selvara's own tenant (M14) (rev P3) |

## 4. Control-plane API (`/api/v1/platform`)

All reads need a staff session and the named platform permission (E-80); all writes need ELEV plus the permission; 4E kinds use `control.platform_approvals`. `tenantRef` is `control.tenants.id`, never `tkey`. Served only by the `console` deployment (`cp_rw`, R2-03).

Exceptions to "all writes need ELEV" (rev P3): no ELEV, but each needs the named permission, a staff session with a passkey assertion, and is logged: C-PL-09 support session start and end (E-75a); C-PL-10 answer, close, reopen; C-PL-13 request by holders of `platform.mfa_reset.request` without `platform.elevate` (STEP by passkey ≤5 min, reason ≥15, ticket); C-PL-15 elevation start and end; C-PL-25 break-glass record (E-78).

| ID | Endpoint | Request | Response | Authorisation |
|---|---|---|---|---|
| C-PL-01 | `GET /platform/tenants` [status, plan, cell]; `GET /platform/tenants/:tenantRef` | | {ref, customerRef, name, status, plan, cell, createdAt, memberCount, adminCount, openInvitations} (no member names) | `platform.tenants.read` (rev P3) |
| C-PL-02 | `POST /platform/tenants` | customerRef, name, kind (trial, paid), region/cell, planId, billingEntityId, firstAdminEmail, modules[], reason ≥15 | approval or tenant | `platform.tenants.provision` + ELEV; 4E:`platform.tenant.create`, or no per-tenant approval when kind = trial and the request is inside the active trial policy (D-P14, OD-04) (rev P3) |
| C-PL-03 | `POST /platform/tenants/:ref/suspend` / `reactivate` | reason ≥10 | approval | `platform.tenants.lifecycle` + ELEV; 4E kinds |
| C-PL-04 | `POST /platform/tenants/:ref/deletion` ; `GET /platform/tenants/:ref/deletion` | reason, contract ref (rev P4: `exportDecision` removed; the export is always produced, D-12b) | approval; deletion status, final-export status (state, counts, manifest hash, receipt or window expiry, notices; never the passphrase, link or bundle) + certificate | `platform.tenants.delete` + ELEV; 4E:`platform.tenant.delete` (management_approver + ciso, D-58); the final vote is refused (422 `OFF-EXPORT-PENDING`) until D-12b-7 holds; staff can retry a failed export generation through C-PL-24 but cannot reveal, download or confirm it (rev P4) |
| C-PL-05 | `POST /platform/tenants/:ref/admin-invitation/resend` | firstAdminEmail? (change only through 4E), reason ≥15 | 202 (no link, no token) | `platform.tenants.provision` + ELEV; re-sends the first-admin invitation **by email to the invitee only**; never returns a link or token to staff (DA-09); allowed only while the tenant has no Active admin; changing the email → 4E:`platform.tenant.admin-reset` (D-P13, dual role) (rev P3) |
| C-PL-06 | `PATCH /platform/tenants/:ref/entitlements` | planId, modules[], limits{} (uploadMaxBytes ≤ platform ceiling) | approval or tenant | plan assignment within the plan's limits: `platform.plans.assign` + ELEV; ceiling or limit changes: `platform.plans.manage` + ELEV, 4E:`platform.limits` (D-P05); downgrade below usage refused (rev P3) |
| C-PL-07 | `GET /platform/tenants/:ref/usage` | period | meters | `platform.tenants.read` |
| C-PL-08 | `GET /platform/approvals` [kind, status]; `POST /platform/approvals/:id/approve|reject|withdraw` | reason ≥10 | PlatformApproval | read `platform.approvals.read`; vote ELEV + kind's approver role (D-26); never delegated |
| C-PL-09 | `GET /platform/support/grants`; `POST /platform/support/sessions`; `POST /platform/support/sessions/:id/end`; `GET /platform/support/sessions/:id/view/:part` | reason ≥15, ticket, minutes ≤60 | session / view (members, settings, auditlog, granted module scopes) | `platform.support.session`; live grant; no ELEV (the session is its own time-boxed privilege, E-75); each view audited in tenant and platform logs |
| C-PL-10 | `GET /platform/help`; `POST /platform/help/:id/answer|close|reopen` | text ≤4000 | SupportQuestion | `platform.help.answer` |
| C-PL-11 | `GET /platform/billing` (subscriptions, invoices, ledger, plan requests, price list) (rev P3); `POST /platform/billing/subscriptions`; `POST /platform/billing/issue`; `POST /platform/billing/invoices/:id/{credit,refund,mark-paid,write-off,void,payment-link,email}`; `POST /platform/billing/plan-requests/:id/accept|decline`; `POST /platform/billing/price-list` | as today (amounts minor units, reason ≥15, ticket) | records / approval | `platform.billing.read` / `platform.billing.operate` + ELEV; 4E `billing.*` above threshold, always `billing.writeoff`, `billing.pricing` |
| C-PL-12 | `GET /platform/rates`; `POST /platform/rates/refresh`; `POST /platform/rates/:code/release|reject|override` | | | `platform.rates.operate` + ELEV; 4E `rates.release`, `rates.override` |
| C-PL-13 | `GET /platform/mfa/admins`; `POST /platform/mfa/requests`; `POST /platform/mfa/requests/:id/withdraw` | identityChecks, reason, ticket, approverId | approval | `platform.mfa_reset.request`; ELEV, except holders without `platform.elevate` under the §4 exception (STEP by passkey, reason ≥15, ticket); 4E:`mfa-reset-admin` (named approver) (rev P3) |
| C-PL-14 | `GET /platform/audit` [action, tenantRef, from, to]; `POST /platform/audit/verify`; `POST /platform/audit/exports` | | entries incl. basis, categories, before/after digests | `platform.audit.read` / `platform.audit.export` |
| C-PL-15 | `GET /platform/elevation`; `POST /platform/elevation`; `POST /platform/elevation/end` | reason ≥15, ticket, minutes ≤60, passkey assertion | elevation | `platform.elevate` (E-70) |
| C-PL-16 | `GET /platform/security/blocks`; `POST /platform/security/blocks/:id/lift` | reason ≥15 | | `platform.security.read` / `platform.security.operate` + ELEV |
| C-PL-17 | `GET /platform/staff`; `POST /platform/staff`; `POST /platform/staff/:id/roles`; `POST /platform/staff/:id/suspend` | identity, roleIds | approval / staff | GET `platform.staff.read`; writes `platform.staff.manage` + ELEV; join and role change 4E:`platform.staff.change` (dual role); suspend and remove immediate by one super admin (E-77); SOD: never on self; the last super-admin-class holder cannot be removed or demoted (E-72h) (rev P3) |
| C-PL-18 | `GET /platform/roles`; `GET /platform/role-names`; `POST /platform/roles`; `PATCH /platform/roles/:id`; `POST /platform/roles/:id/retire` | predefinedName, permissions[] ⊆ ceiling | approval | GET `platform.roles.read`; writes `platform.roles.manage` + ELEV; 4E:`platform.role.change` (ADR-014) (rev P3) |
| C-PL-19 | `GET /platform/providers`; `POST /platform/providers`; `PATCH /platform/providers/:id`; `POST /platform/providers/:id/activate` | kind (payment, ai, email, scanner, kms), adapter, secretRef, review record | approval | `platform.providers.manage` + ELEV; 4E:`platform.provider.change`; AI provider needs a recorded review (ADR-007) |
| C-PL-20 | `GET /platform/plans`; `POST /platform/plans`; `PATCH /platform/plans/:id` | entitlements | approval | `platform.plans.manage` + ELEV; 4E:`platform.plan.change` |
| C-PL-21 | `GET /platform/migrations`; `POST /platform/migrations/:id/rollout` / `pause` / `resume` | wave plan | rollout | `platform.migrations.operate` + ELEV; production rollout → 4E:`platform.migration.rollout` |
| C-PL-22 | `GET /platform/keys/:tenantRef` (versions only); `POST /platform/keys/:tenantRef/rotate`; `POST /platform/keys/:tenantRef/destroy` | reason | approval | `platform.keys.operate` + ELEV; destroy → 4E:`platform.key.destroy` (management_approver + ciso) + certificate |
| C-PL-23 | `GET /platform/ropa`; `POST/PATCH /platform/ropa`; `POST /platform/data-requests` | intake fields | Selvara RoPA; DSR ref | `platform.privacy.manage` + ELEV for writes; data-request intake only: creates a DSR in Selvara's own tenant through its M14 API, as the staff member's own membership of that tenant; the case record lives only there (D-56, 2G G-D-07) (rev P3) |
| C-PL-24 | `GET /platform/jobs` [queue, tenantRef, status]; `POST /platform/jobs/dead-letters/:id/retry|discard` | reason | job state (no payload bodies) | `platform.ops.read` / `platform.ops.operate` + ELEV |
| C-PL-25 | `POST /platform/break-glass` ; `POST /platform/break-glass/:id/close` ; `POST /platform/break-glass/:id/review` | reason, incident ref | event | `platform.breakglass.custodian` (E-78); review by the other super admin (≠ opener), 403 `self_approval` otherwise (rev P3) |
| C-PL-26 | `GET /platform/notifications` | | staff notices (pending approvals, past-due, failed jobs) | staff session |
| C-PL-27 | `GET /platform/trial-policy`; `POST /platform/trial-policy` | limits, duration ≤30 d, region, daily cap | trial policy / approval | GET `platform.tenants.read`; POST `platform.tenants.provision` + ELEV, 4E:`platform.trial.policy` (D-P14, dual role); daily digest of trials to both approvers (D-80) (OD-04) (rev P3) |
| C-PL-28 | `POST /api/v1/hooks/<provider>`; `POST /api/v1/hooks/billing/<config_ref>` (C-09) | provider event | 200 | no session; provider signature over the raw body, timestamp ≤5 min, event-id idempotency (2F F-T-080) (rev P3) |
| C-PL-29 | `GET /platform/tax-rules`; `POST /platform/tax-rules`; `POST /platform/tax-rules/:id/approve` | jurisdiction, scheme, rate, adviser ref | tax rule / approval | GET `platform.billing.read`; writes `platform.billing.operate` + ELEV; 4E:`billing.tax_rule` (D-P16); invoicing is refused without an approved rule (2I R-52) (rev P3) |

## 5. SCIM 2.0 (`/scim/v2`)

Standards: RFC 7643 (schema) and RFC 7644 (protocol). Base URL per tenant is the same path; the token selects the tenant.

| ID | Endpoint | Notes | Authorisation |
|---|---|---|---|
| C-SC-01 | `GET /scim/v2/ServiceProviderConfig`, `/ResourceTypes`, `/Schemas` | patch: true, bulk: false (MVP), filter: true (max 200), changePassword: false, sort: false, etag: true | SCIM token |
| C-SC-02 | `GET /scim/v2/Users?filter=userName eq "..."&startIndex&count` | filters supported: `userName eq`, `externalId eq`, `emails.value eq`, `active eq`; count ≤200 | token; tenant's members whose `source` is scim or whose domain is a verified domain of the tenant |
| C-SC-03 | `POST /scim/v2/Users` | `userName` (email), `name.givenName`, `name.familyName`, `displayName`, `emails`, `active`, `externalId`, enterprise extension `department`, `manager` | creates/links `control.identities` + `control.memberships` (role from mapping, non-privileged roles only (E-33d, DA-08), default `employee`) (rev P3), `member_profile` and `person` in tenant via router |
| C-SC-04 | `GET/PUT/PATCH/DELETE /scim/v2/Users/:id` | PATCH `active=false` = suspend; DELETE = remove membership (E-55) | token; E-55 last-admins and bulk-pause rules; IP allow-list when set (E-57) (rev P3) |
| C-SC-05 | `GET/POST/PATCH/DELETE /scim/v2/Groups[/:id]` | group membership drives role mapping; groups mapped to privileged roles (E-33d) create a pending in-app `team.role` approval instead of applying (E-54a, DA-08) | token; E-55 last-admins and bulk-pause rules; IP allow-list when set (E-57) (rev P3) |
| C-SC-06 | Errors | SCIM error schema (`urn:ietf:params:scim:api:messages:2.0:Error`) with `scimType` | |

## 6. Public APIs

| ID | Endpoint | Request | Response | Authorisation and limits |
|---|---|---|---|---|
| C-PU-01 | `GET /api/v1/public/trust/:trustRef` | | company display name, brand, **only sections set public** (FAQ from verified answers, subprocessors, updates, control status by domain only if that section is public), document list **without names of NDA documents** (only count per section) | anonymous; page must be on; 404 otherwise; cached 60 s |
| C-PU-02 | `POST /public/trust/:trustRef/code`; `POST .../verify` | work email / code | visitor cookie (purpose trust, 60 min) | OTP 6 digits, 10 min, 5 tries; 5 codes/h/address; 30/h/IP |
| C-PU-03 | `GET /public/trust/:trustRef/me` | | masked email, own account status, own NDA state (per person, per version), documents granted (by id with titles, now visible), own requests | verified visitor |
| C-PU-04 | `POST /public/trust/:trustRef/requests` | documentIds?, organisation, reason | request | verified visitor; 3/h/address, 10 pending per domain |
| C-PU-05 | `POST /public/trust/:trustRef/nda` | ndaVersion, name, accept | acceptance (this person only) | verified visitor with an approved account |
| C-PU-06 | `POST /public/trust/:trustRef/documents/:id/link` | | signed link 60 s | Public doc: anyone (60/h/IP, 1,000/company); gated: verified viewer with access + own NDA; gated links audited (F-EV-03) (rev P3) |
| C-PU-07 | `POST /public/trust/:trustRef/subscribe` ; `POST .../unsubscribe` (token) ; `POST .../questions`; `POST .../sign-out` | | | as today's limits; `questions`: answers drawn only from public sections (anonymous) or the caller's granted documents (verified viewer); NDA document names never revealed (F-AB-07) (rev P3) |
| C-PU-08 | `POST /public/vendor-portal/open` ; `/verify-email`; `/verify-code` | link token / email / code | visitor cookie bound to one assessment | token hash match; 3 email mismatches end the link; OTP rules |
| C-PU-09 | `GET /public/vendor-portal/assessment`; `PUT .../draft`; `POST .../files/:questionId` (upload URL, quarantine); `POST .../submit`; `POST .../sign-out` | answers | assessment view (only own) | vendor visitor session; 60 uploads/h |

## 7. Webhooks and outbound events

### 7.1 Event catalogue

Payloads are **thin**: `{ id, type, occurredAt, apiVersion, resource: { type, id, ref }, changes: [field names], actorKind }`. No personal data and no free text; the consumer fetches detail with an API key (C-M18-07). Decision C-70: thin events limit what leaks to a misconfigured endpoint and keep consumers on the authorised API.

| ID | Event type | Raised when (from the transaction, not by parsing audit text) |
|---|---|---|
| C-71 | `control.status_changed` (incl. failed) | control status changes; `data.status` included as an enum |
| C-72 | `control.test.failed` | test run result Fail |
| C-73 | `evidence.created`, `evidence.updated`, `evidence.accepted`, `evidence.expiring`, `evidence.expired` | |
| C-74 | `policy.published`, `policy.review_due` | |
| C-75 | `risk.created`, `risk.updated`, `risk.accepted`, `risk.acceptance_expired`, `risk.closed` | |
| C-76 | `issue.created`, `issue.status_changed`, `issue.closed` | |
| C-77 | `audit.stage_changed`, `audit.completed`, `finding.accepted` | |
| C-78 | `vendor.created`, `vendor.assessment_submitted`, `vendor.assessment_completed`, `vendor.certificate_expiring` | |
| C-79 | `access.granted`, `access.revoked`, `access_review.completed` | |
| C-80 | `member.joined`, `member.removed` (ids only) | |
| C-81 | `approval.requested`, `approval.decided` (kind, subject ref, outcome) | |
| C-82 | `dsar.due_soon`, `incident.opened` | |
| C-83 | `webhook.test` | |

### 7.2 Delivery

| ID | Rule |
|---|---|
| C-85 | Transactional outbox: the change writes an `outbox` row in the tenant schema (`webhook_delivery` with status `Queued` per subscribed endpoint) in the same transaction; the `webhook-delivery` job (D-68) sends. A failing endpoint never fails the change. |
| C-86 | Signing: header `Selvara-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, t + "." + body)>`, plus `Selvara-Event-Id`, `Selvara-Delivery-Id`. Receivers reject `t` older than 5 min. During secret rotation both `v1` signatures (old, new) are sent for 24 h. |
| C-87 | Secrets: 32 random bytes, held in the secrets manager and referenced by `webhook.signing_secret_ref` (name and version only, 2B B-E18.2); never stored in the database; shown once to the requester; rotation through C-M18-02 (rev P3). |
| C-88 | Network: https only; resolved addresses must be public; connection pinned to the checked address; no redirects; 10 s timeout; response body ignored beyond 4 KB. |
| C-89 | Retries: on network error, timeout, 408, 429, 5xx: backoff 1 m, 5 m, 30 m, 2 h, 6 h, 12 h, 24 h (7 attempts, ~45 h), with jitter; 4xx other than 408/429: no retry. Ordering is not guaranteed; `occurredAt` and the resource `version` let consumers reorder. |
| C-90 | Auto-disable: after 3 days of consecutive failures the webhook becomes `Disabled` and tenant admins are notified; re-enabling needs `api.manage` (no new approval if the URL is unchanged). |
| C-91 | Delivery log: `webhook_delivery` keeps attempt, status, HTTP status, latency, error class; retention 30 days (retention class `ops_short`), then purged by D-71. Manual redelivery is audited. |
| C-92 | Volume limits: per tenant 50 deliveries/s; per endpoint concurrency 4. |

---

## 8. Front-end mapping matrix

Path prefix `/api/v1` omitted. "Gap" column: **NE** = screen with no endpoint by design (static or client-only), **NEW** = endpoint added in v2 where the screen had none, **DROP** = screen not carried forward: **Dropped by owner (OD-05)** (rev P3).

### 8.1 Group AS

| Screen | Endpoint IDs | Gap |
|---|---|---|
| S-AS-01 | C-SH-01, C-SH-02, C-SH-03, C-SH-06 | trend NEW (C-SH-02, daily snapshot) |
| S-AS-02 | C-SH-04, C-SH-05, C-M05-11, C-M05-12, C-M05-14, C-M05-15 | "My remarks" kept by owner (OD-05): NEW (C-M05-14, C-M05-15); demo task kinds Training/Reply: NE (rev P3) |
| S-AS-03 | C-M12-07 | |
| S-AS-04 | C-M09-14 | |
| S-AS-05 | C-M05-12, C-M05-11 | |
| S-AS-06 | C-AC-10 | NEW (was demo-only) |
| S-AS-07 | C-M21-04 | |
| S-AS-08 | C-M16-01, C-M16-02, C-M16-03, C-M16-04, C-M21-02 | trends and "issues closed" NEW (C-M16-01 metrics) |
| S-AS-09 | C-M16-04 | |
| S-AS-10 | C-M02-01, C-M02-03, C-EX-01 | export now audited |
| S-AS-11 | C-M02-07, C-M02-04 | |
| S-AS-12 | C-M02-02, C-M02-05, C-M02-06, C-EX-01, C-M08-01 (next audit from audit dates) | |
| S-AS-13 | C-M03-01, C-EX-01 | |
| S-AS-14 | C-M03-10, C-M03-12 | |
| S-AS-15 | C-M03-14, C-EX-01 | |
| S-AS-16 | C-M03-04, C-M01-01 | |
| S-AS-17 | C-M03-03 | |
| S-AS-18 | C-M03-02, C-M03-05..09, C-M03-13, C-M21-02, C-EX-01, C-M22-05 | ticket NEW (needs M17 ticketing) |
| S-AS-19 | C-M03-09 | |
| S-AS-20 | C-M03-11 | |
| S-AS-21 | C-M03-10, C-M03-11, C-M03-12 | |
| S-AS-22 | C-M04-01, C-EX-01 | |
| S-AS-23 | C-M04-03, C-M23-01, C-M23-02, C-M23-04 | upload completion NEW (rev P3) |
| S-AS-24 | C-M04-02, C-M04-04..09, C-M21-02, C-M23-01..04 | download token replaces signed URL (rev P3) |
| S-AS-25 | C-M04-03 | |
| S-AS-26 | C-M05-01 | |
| S-AS-27 | C-M05-03 | |
| S-AS-28 | C-M05-02..11, C-M05-13, C-M05-15, C-M05-16, C-M21-02 | retire and review-confirm NEW (rev P3) |
| S-AS-29 | C-M05-03 | |
| S-AS-30 | C-M08-01 | |
| S-AS-31 | C-M08-14, C-M08-01 | |
| S-AS-32 | C-M08-03 | |
| S-AS-33 | C-M08-02, C-M08-04..07, C-M08-12, C-M08-13 | shared-items panel NEW (C-M08-05); access extend NEW (rev P3) |
| S-AS-34 | C-M08-08 | evidence link NEW |
| S-AS-35 | C-M08-09 | |
| S-AS-36 | C-M08-10 | NEW (was no write route) |
| S-AS-37 | C-M08-11, C-M08-15 | finding verification NEW (rev P3) |
| S-AS-38 | C-M07-01, C-EX-01 | |
| S-AS-39 | C-M07-01, C-M07-04 | |
| S-AS-40 | C-M07-03 | |
| S-AS-41 | C-M07-02, C-M07-04..09, C-M21-02 | unlink NEW |
| S-AS-42 | C-M07-03 | |
| S-AS-43 | C-M02-01/02, C-M03-01/02/10/14, C-M04-01/02/07, C-M05-01/02, C-M08-13, C-M23-03, C-EX-01 — all under OBJ-AUD | auditor acknowledge removed (F1-01); no member list, no risk list (DA-07) (rev P3) |

### 8.2 Group RK

| Screen | Endpoint IDs | Gap |
|---|---|---|
| S-RK-01 | C-M06-01, C-M06-13 | sweeps moved to jobs (F1-05) |
| S-RK-02 | C-M06-01, C-EX-01 | |
| S-RK-03 | C-M06-02..11, C-M21-02 | actions by id |
| S-RK-04 | C-M06-03, C-M01-01 | |
| S-RK-05 | C-M06-11 | |
| S-RK-06 | C-M23-01, C-M23-02, C-M23-04, C-M06-18 | (rev P3) |
| S-RK-07 | C-M06-18, C-M21-02, C-M21-03 | |
| S-RK-08 | C-M06-13 | NEW (criteria were constants) |
| S-RK-09 | C-M06-15 | |
| S-RK-10 | C-M06-01, C-M06-16, C-M06-17 | enterprise risks / register owner: NEW field on settings (C-M06-14) |
| S-RK-11 | C-M12-01, C-SH-05, C-M21-02 | device posture: integration-fed (M17) |
| S-RK-12 | C-M12-06 | |
| S-RK-13 | C-M12-01, C-M12-03, C-M12-04 | |
| S-RK-14 | C-M12-02 | |
| S-RK-15 | C-M12-03, C-AC-09 | |
| S-RK-16 | C-M12-04 | |
| S-RK-17 | C-M12-06 | |
| S-RK-18 | C-M12-07, C-M12-08, C-M21-02 | |
| S-RK-19 | C-M12-09 | |
| S-RK-20 | C-M13-01, C-M13-08 | shadow AI source NEW (integration job D-69) |
| S-RK-21 | C-M13-02 | |
| S-RK-22 | C-M13-02 | |
| S-RK-23 | C-M13-03..09, C-M21-02 | "Risk-classify" fixed, not dropped (OD-05): proposal (C-M13-09) → confirmation (C-M13-04) → guardrail 4E; rules of 2I I-10 (rev P3) |
| S-RK-24 | C-M09-01, C-M09-15 | |
| S-RK-25 | C-M09-02 | |
| S-RK-26 | C-M09-01..09 | monitoring/applications: NE until an integration source exists |
| S-RK-27 | C-M09-16 | |
| S-RK-28 | C-M09-05, C-M23-01, C-M23-02, C-M23-04 | (rev P3) |
| S-RK-29 | C-M09-08, C-M09-09 | |
| S-RK-30 | C-M09-10, C-M09-11, C-M09-12, C-M09-17 | extend and portal-invite revoke NEW (rev P3) |
| S-RK-31 | C-PU-08, C-PU-09 | |
| S-RK-32 | none | Dropped by owner (OD-05): demo-only MFA step in portal (rev P3) |
| S-RK-33 | C-M10-01, C-M10-06, C-M10-07 | |
| S-RK-34 | C-M10-02, C-M23-01, C-M23-02, C-M23-04 | real question rows NEW (rev P3) |
| S-RK-35 | C-M10-06 | |
| S-RK-36 | C-M10-01, C-M10-03, C-M10-04, C-M10-05 | |
| S-RK-37 | C-M09-13 | |
| S-RK-38 | C-M11-01, C-M11-02 | |
| S-RK-39 | C-M11-03, C-M11-04, C-M11-05 | |
| S-RK-40 | C-M11-06 | |
| S-RK-41 | C-M11-01, C-M11-06 | |
| S-RK-42 | C-M11-08, C-M11-09 | |
| S-RK-43 | C-PU-01..07 | |
| S-RK-44 | C-M15-01, C-M15-02, C-M15-03, C-M15-05 | |
| S-RK-45 | C-M15-04 | |

### 8.3 Group ST

| Screen | Endpoint IDs | Gap |
|---|---|---|
| S-ST-01 | C-M01-01..07, C-M21-01/02, C-EX-01 | mock-only → server |
| S-ST-02 | C-M01-05 | |
| S-ST-03 | C-M01-11 | NEW (review cycles, SLAs, brand, trusted networks per tenant: F1-10) |
| S-ST-04 | C-M01-11 (approvers as person ids) | NEW |
| S-ST-05 | C-M01-08, C-M01-10, C-M01-09 | becomes custom-role editor (ADR-014) |
| S-ST-06 | C-M26-01..04 | NEW (server jobs D-75) |
| S-ST-07 | C-M14-11, C-M14-12, C-M14-13 | NEW |
| S-ST-08 | C-M01-01..04, C-M01-07, C-M01-19 | unlock NEW (rev P3) |
| S-ST-09 | C-M01-05, C-M01-06 | |
| S-ST-10 | C-M21-01..03 | |
| S-ST-11 | C-M01-11 | |
| S-ST-12 | C-M01-17, C-M01-18 | |
| S-ST-13 | C-M17-01..05 | mock paths replaced |
| S-ST-14 | C-M17-01..05 | |
| S-ST-15 | C-M17-01, C-M17-02, C-M17-04, C-M21-02 | `sync-due` removed (job D-69) |
| S-ST-16 | C-M17-01..06 | |
| S-ST-17 | C-M18-01, C-M21-02 | rotate NEW |
| S-ST-18 | C-M18-02, C-M18-03 | delivery log NEW |
| S-ST-19 | C-M18-04 | |
| S-ST-20 | C-M18-05, C-M18-06 | |
| S-ST-21 | C-M18-01, C-M18-02, C-M18-04 | |
| S-ST-22 | C-M19-02 | |
| S-ST-23 | C-M19-03 | |
| S-ST-24 | C-M19-04 | |
| S-ST-25 | C-M19-05 | |
| S-ST-26 | C-M19-01 | |
| S-ST-27 | C-M19-03 | |
| S-ST-28 | C-M25-01, C-M25-02 | |
| S-ST-29 | C-M25-03 | plan change becomes a request (not immediate) |
| S-ST-30 | C-M25-04 | Card form dropped by owner (OD-05, F1-07): hosted page only (rev P3) |
| S-ST-31 | C-M25-01..04 | |
| S-ST-32 | C-M22-01, C-M22-03 | RoPA tag from stored `activityId` (NEW) |
| S-ST-33 | C-M22-02 | |
| S-ST-34 | C-M14-01, C-EX-01 | NEW: editable per-tenant RoPA (OQ-08) |
| S-ST-35 | C-M22-04 | |
| S-ST-36 | none | NE (static spec content) |
| S-ST-37 | C-M24-02 | NE today (static); optional endpoint |
| S-ST-38 | C-M24-02 | as above |
| S-ST-39 | C-M24-01 | |
| S-ST-40 | C-M24-01 | |
| S-ST-41 | C-AC-07, C-AC-09, C-AC-10, C-AC-11, C-AC-14 | |
| S-ST-42 | none | Dropped by owner (OD-05): demo-only sign-in gallery (rev P3) |
| S-ST-43 | C-AC-01..07, C-AC-08 | SSO discovery NEW |
| S-ST-44 | C-AC-13 | |
| S-ST-45 | C-AC-12 | |

### 8.4 Group AD

| Screen | Endpoint IDs | Gap |
|---|---|---|
| S-AD-01 | C-PL-01, C-PL-07 | NEW usage (was demo) |
| S-AD-02 | C-PL-02 | richer provisioning NEW (region/cell, plan, modules) |
| S-AD-03 | C-PL-06, C-PL-07 | NEW (entitlements real) |
| S-AD-04 | none | Dropped by owner (OD-05): platform never writes tenant users (inventory AD gap 2). Read via support session only (C-PL-09) (rev P3) |
| S-AD-05 | C-PL-10 | |
| S-AD-06 | C-PL-01..05 | first-admin invitation resend by email only (DA-09) (rev P3) |
| S-AD-07 | C-PL-08 | |
| S-AD-08 | C-PL-09 | |
| S-AD-09 | C-PL-10 | |
| S-AD-10 | C-PL-11 | |
| S-AD-11 | C-PL-11 | |
| S-AD-12 | C-PL-11, C-PL-08 | |
| S-AD-13 | C-PL-11 | |
| S-AD-14 | C-PL-12 | |
| S-AD-15 | C-PL-12, C-PL-08 | |
| S-AD-16 | C-PL-13 | |
| S-AD-17 | C-PL-13, C-PL-08 | |
| S-AD-18 | C-PL-14, C-PL-23 | evidence packages, RoPA NEW |
| S-AD-19 | C-PL-14 | lawful basis, before/after now returned |
| S-AD-20 | C-PL-15, C-PL-09 | |
| S-AD-21 | C-PL-15 | passkey at elevation NEW |
| S-AD-22 | C-PL-16 | |
| S-AD-23 | C-SH-06, C-AC-07, C-AC-08 | |
| S-AD-24 | C-M20-01..03, C-M21-02, C-PL-26 | NEW server bell |
| S-AD-25 | C-SH-04 | |
| S-AD-26 | none | NE (client nav) |
| S-AD-27 | C-SH-06 | counts from C-SH-04 |
| S-AD-28 | none | NE (frame) |
| S-AD-29 | C-AC-09 | |
| S-AD-30 | C-AC-14 | |
| S-AD-31 | none | NE (static) |
| S-AD-32 | C-PL-15 | |
| S-AD-33 | host endpoints, C-M22-05 (RecordHistory), C-M19-02 (AskPanel, prefill), C-M01-01 (MemberSelect), C-M21-* | |

### 8.5 Endpoints with no Phase 1 screen

| Endpoint | Why it exists | Screen needed? |
|---|---|---|
| C-M01-12..16 (SSO, domains, SCIM tokens) | ADR-006 | **Yes**: new "Single sign-on" tab in Team (Phase 3 UI work) |
| C-M01-09 role editor | ADR-014 | Yes: S-ST-05 becomes editable |
| C-M06-12 assets, threats, vulnerabilities; C-M06-10 treatments; C-M06-16 reviews | OQ-05, ISO 27005 | **Yes**: risk tabs |
| C-M08-05 shared items | F1-01 | Yes: panel in S-AS-33 |
| C-M11-07 trust updates; C-M11-01 sections | OQ-07 | Yes: Trust admin tab |
| C-M12-05 systems | inventory RK gap 16 | Yes |
| C-M14-02 DPIA, C-M14-03..10 DSAR | Q-27 | **Yes**: new Privacy module screens |
| C-M15-05 incident links | | minor |
| C-M18-03 delivery log, C-M18-01 rotate | | Yes, small |
| C-M20-* notifications | | Yes (bell in API mode) |
| C-M10-08 templates | one questionnaire model | Yes |
| C-PL-17 staff, C-PL-18 roles, C-PL-19 providers, C-PL-20 plans, C-PL-21 migrations, C-PL-22 keys, C-PL-23 Selvara RoPA/DSAR, C-PL-24 jobs, C-PL-25 break-glass | control plane v2 | **Yes**: new Admin Console pages |
| C-AC-15 profile, C-AC-16 data requests | GDPR controller duties | Yes (account page) |
| C-SC-* SCIM, C-M18-06/07 API, C-09 / C-PL-28 provider hooks, C-10 worker | machine clients | No |
| C-M02-08, C-M02-09 reference-content upgrade | ADR-011 D11-6, DA-15 | **Yes**: upgrade preview and request in Frameworks (rev P3) |
| C-M01-20 offboarding, C-M01-23 to C-M01-26 final export (rev P4), C-M01-21 restore requests, C-M01-22 BYOK | D-12, 2H H-RS-01, 2F F-K-21 | **Yes**: new Settings pages (owner to confirm self-service, X2 open item 8) (rev P3) |
| C-M14-14 DSAR reject | D-10 | Yes: Privacy module screens (rev P3) |
| C-PL-27 trial policy, C-PL-29 tax rules | OD-04, 2I R-52 | **Yes**: new Admin Console pages (rev P3) |

---

## 9. Decisions (this workstream)

| ID | Decision | Rationale |
|---|---|---|
| C-D1 | One permission plus one object rule per endpoint; object-scope failures are 404 | Prevents existence probing; F1-01 |
| C-D2 | Opaque HMAC cursors bound to tenant and filter | No cross-tenant cursor replay |
| C-D3 | Idempotency records in the tenant schema | Response bodies are tenant data (SD-C2) |
| C-D4 | Thin webhook payloads, no personal data | Minimisation; consumers use the authorised API |
| C-D5 | Exports always asynchronous jobs and always audited | Statement timeouts; audit gap AS-9 |
| C-D6 | API keys routed by a control-plane index of key ids | Key must resolve to one tenant before any tenant schema is touched (SD-C1) |
| C-D7 | Public Trust Center returns only public sections, never NDA document names | F1-02 / OQ-07 |
| C-D8 | No platform route writes tenant business data; S-AD-04 dropped. Exception: Selvara's own tenant, written through its normal tenant API by staff who are members of it (C-PL-23) (rev P3) | Production rule 0007; OQ-10 |

## 10. Deliverables

- This document (`2C-api.md`): conventions C-01..C-63, endpoint catalogue (sections 2 to 6), webhooks C-70..C-92, mapping matrix (section 8). Phase 3 revision (rev P3): every endpoint, new ones included, keeps a permission and an object rule; C-M23-02 and C-M23-03 are now mapped to screens (no orphan endpoints).
- Phase 3 follow-up: generate an OpenAPI 3.1 file per module from this outline; contract tests per endpoint for the authorisation column.

## 11. Decisions required

| ID | Decision | ADR |
|---|---|---|
| C-DR1 | Accept SD-C1 (`control.api_key_routes`) and SD-C2 (`idempotency_record`) | ADR-010 (control plane), ADR-008 (tables) |
| C-DR2 | Thin webhook payloads (C-70) | none (record in decisions log) |
| C-DR3 | Resolved by OD-05: dropped by owner S-RK-32, S-ST-42, S-AD-04 and the S-ST-30 card form; kept and built S-AS-02 "My remarks" (C-M05-14, C-M05-15); fixed, not dropped, S-RK-23 "Risk-classify" (C-M13-09) (rev P3) | OD-05 (decided) |
| C-DR4 | Identity endpoints depend on ADR-006 | ADR-006 |

## 12. Open risks

| ID | Risk | L | I | Treatment |
|---|---|---|---|---|
| R-30 | Object-scope rules (OBJ-AUD, OBJ-VEN) are implemented per handler and one is missed, re-opening F1-01 | M | H | Scope enforced in the repository layer (a scoped query builder chosen by role), plus a generated contract test per endpoint × role from section 2 |
| R-31 | Thin webhooks push customers to poll the API, raising API-call usage against plan limits | M | L | Exclude API calls made within 10 min of a delivery for the same resource from metering *(decision for Phase 2I)* |

## 13. New assumptions

| ID | Assumption | Validate by |
|---|---|---|
| A-35 | Vercel route handlers can serve SCIM and webhooks with acceptable cold-start latency for IdP timeouts (typically 10 to 30 s) | Phase 2J spike |
| A-36 | Integrators accept HMAC signature format `t=,v1=` (Stripe-like) without a JWS alternative | Owner / first customers |

## 14. Spine deviations

| ID | Deviation | Reason |
|---|---|---|
| SD-C1 | Adds `control.api_key_routes (key_id, tenant_id, status)` and `control.portal_link_routes (link_id, tenant_id, expires_at)` to S2 | An API key or vendor-portal link must resolve to a tenant before routing; S2 has no such index. Holds no secret (hash stays in the tenant `api_key`). |
| SD-C2 | Adds tenant table `idempotency_record` and an `outbox` use of `webhook_delivery` to S4 (infrastructure, no module) | C-51, C-85 |
| SD-C3 | Adds column `control.tenants.trust_public_ref` (public Trust Center reference; 2B name) (rev P3) | Public routing without exposing `tkey` |
| SD-C4 | Billing and help tenant views use `/api/v1/billing` and `/api/v1/help` served from the control plane | S6 names only `platform` and `account` for control-plane APIs; these are tenant-caller views of control-plane data |

## Sources

- IETF RFC 7643 and RFC 7644 (SCIM 2.0 core schema and protocol).
- Phase 1 inventory files `inventory/01..04`.
