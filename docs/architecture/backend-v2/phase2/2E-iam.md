# Phase 2E: Identity and access management

| | |
|---|---|
| Status | Draft (Phase 2 design). Documents only; no implementation code. |
| Owner | Workstream E |
| Binding inputs | `00-spine.md` (S2 control plane, S3 request path, S5 roles), `docs/security/SOD_MATRIX.md`, Phase 1 inventory (ST, AD groups), existing server (`front-end/src/server/core.ts`, `support.ts`, `ws/apikeys.ts`), `2C-api.md`, `2D-workflows.md` |
| ADRs | ADR-006 (identity), ADR-014 (custom roles), both in `adr/` |
| Compliance note | Standards references (NIST SP 800-63B, OWASP ASVS) follow `SOD_MATRIX.md` §6; anything regulatory is a **DRAFT** pending qualified review. |

---

## 1. Authentication

### 1.1 Architecture

| ID | Decision |
|---|---|
| E-10 | **Supabase Auth is the credential verifier; Selvara owns the application session.** Supabase Auth holds password hashes, TOTP factors and SAML identities. The Selvara server calls it during sign-in only, then signs the Supabase session out (as v0.2.5 does in `core.ts finish`) and issues its own opaque session (`__Host-sv`, HttpOnly, Secure, SameSite=Strict, 256-bit random, only its SHA-256 stored in `control.sessions`). Reason: Supabase access tokens stay valid until expiry after revocation *(verify current behaviour)*, and tenant binding must live in a server record (S3). No Supabase token ever reaches the browser. |
| E-10a | Selvara stores what Supabase Auth does not provide *(verify each against current Supabase docs, A-40)*: WebAuthn passkeys (`control.passkeys`), MFA recovery codes (`control.recovery_codes`, salted hashes), per-account and per-address sign-in throttling and blocks (`control.auth_throttle`; request-rate token buckets stay in `ops.rate_buckets`, 2C C-60), and the OIDC relying-party state for per-tenant OIDC (E-52) (rev P3). |

### 1.2 Factors

| ID | Factor | Who | Rules |
|---|---|---|---|
| E-11a | Password | all human accounts except SSO-enforced identities | `SOD_MATRIX.md` §6 credential policy unchanged (length 12..128, breach check server-side, no composition rules). |
| E-11b | TOTP (RFC 6238) via Supabase MFA | default second factor for members | Enrolled at first sign-in; a code is never accepted twice; 5 wrong codes end the attempt. |
| E-11c | Passkey (WebAuthn, user verification required) | **mandatory** for platform staff; optional for members; a tenant may require it for privileged roles (`requirePasskeyFor`) | Last required passkey cannot be removed; add/remove needs step-up. |
| E-11d | Recovery codes | every account with TOTP or passkey | 10 single-use codes, shown once, salted hashes; regeneration needs step-up and invalidates the old set. |
| E-11e | SMS / voice | none | Not offered (SOD_MATRIX §6). |
| E-11f | SSO (SAML/OIDC) | members of tenants with an active connection | MFA per E-53b. |

### 1.3 Sign-in flow

| ID | Rule |
|---|---|
| E-12 | Discovery (`C-AC-02`): the email is looked up for SSO routing only by domain; the answer shape is the same for unknown and known emails (no enumeration). If the domain is SSO-enforced for **every** tenant the identity belongs to, the password form is not offered. |
| E-13 | Passkey-first sign-in is allowed for members who enrolled one (a user-verified passkey is a multi-factor cryptographic authenticator *(verify NIST SP 800-63B rev 4 wording)*). Platform staff keep two steps: password then passkey. |
| E-14 | No session exists before the second factor; the intermediate sign-in ticket is sealed server-side (5 min, 5 tries). |

### 1.4 Session and token lifetimes

| ID | Item | Lifetime | Notes |
|---|---|---|---|
| E-15a | Member session, idle | 30 min (15 min when the active role is privileged, E-33d) | Sliding: `last_seen` updated at most once per 60 s. Tenant may shorten, never lengthen beyond 30 min without 4E (`team.setting.loosen`). |
| E-15b | Member session, absolute | 12 h | Re-authentication needed after. |
| E-15c | Platform staff session | idle 15 min, absolute 8 h | Staff sessions carry no tenant. |
| E-15d | Step-up window | 5 min | Password or passkey re-entered (`C-AC-09`). |
| E-15e | Elevation | ≤ 60 min, ends at sign-out | E-70 |
| E-15f | Support session | ≤ 60 min and ≤ grant end | E-75 |
| E-15g | Supabase access token | shortest configurable (target 5 min) | Server-side only during sign-in; never refreshed; refresh token discarded at sign-out of the Supabase session. |
| E-15h | Sign-in ticket, OTP, reset link, invitation | 5 min / 10 min / 15 min / 72 h | As today. |
| E-15i | Visitor sessions (Trust Center, vendor portal) | 60 min, bound to purpose and to one tenant (and one assessment for the portal) | `__Host-vv` |

- E-16 Step-up is required for: account factor changes, password change, API key and webhook creation, SSO/SCIM changes, role changes to privileged roles, MFA reset requests and their approval, offboarding, integration connect, DSAR erasure and disclosure approval, AI enablement. The approval engine reads `stepUp` from the kind registry (D-21).
- E-17 Revocation is immediate because the session row is read on every request. Triggers: sign-out; "sign out other sessions"; password change or reset (all sessions); MFA reset (all sessions); membership suspended/removed (sessions whose active tenant is that tenant); SCIM `active=false` (same, plus sessions authenticated through that tenant's SSO in any tenant); tenant suspended (all sessions active in it); staff suspension; role change to a lower role (session permissions reloaded, not revoked); identity disabled (all).
- E-18 Account recovery:

| Situation | Path |
|---|---|
| Forgot password | Reset link (15 min, single use) + second factor (TOTP or recovery code or passkey). All sessions end; owner alerted. |
| Lost authenticator, has recovery code | Sign in with recovery code; forced re-enrolment. |
| Lost all factors, identity owned by one tenant (E-56) | Member MFA reset by the tenant: 4E `mfa-reset-member` with 3 identity checks (SOD_MATRIX §4). |
| Lost all factors, multi-tenant identity or tenant admin | Platform 4E `mfa-reset-admin`; every tenant where the person has a privileged membership is notified (E-56). |
| SSO user | Recovery at the customer IdP; Selvara factors not involved. |
| Platform staff | Platform 4E `mfa-reset-admin` with named approver = the other super admin; break-glass only if both are locked out (E-78). |

- E-19 Session identifiers rotate on sign-in, tenant switch (E-24) and elevation start; the old id is revoked.

---

## 2. Binding the tenant into the session (spine S3)

### 2.1 Session record

`control.sessions` (spine deviation SD-E1): `id_hash`, `identity_id`, `kind (member, staff)`, `tenant_id` (null for staff), `membership_id`, `role_id`, `perm_version`, `auth_method (password_totp, passkey, saml, oidc, recovery)`, `sso_connection_id`, `aal`, `created_at`, `last_seen_at`, `idle_limit_s`, `expires_at`, `step_up_at`, `elevation_id`, `support_session_id`, `ip_enc` (E1 under the platform KEK, DA-05), `ip_hmac`, `ip_prefix`, `device`, `revoked_at`, `revoked_reason` (rev P3).

R2-01 (rev P3): sessions, memberships and tenant status are never cached; they are read on every request. Revoking a membership or suspending a tenant revokes the affected sessions in the same transaction, so it takes effect on the next request. Only static routing fields (cell, schema name, schema version) are cached per instance, for at most 30 s. The `app` deployment reads them through `cp_router_ro` (view `control.v_routing`) and resolves sessions through `cp_tenant_api` functions; it holds no `cp_rw` grant (R2-03, DA-06).

### 2.2 Verification before routing

```mermaid
sequenceDiagram
    participant B as Browser
    participant A as API handler
    participant R as router
    participant CP as control plane (cp_router_ro + cp_tenant_api.session_resolve; rev P3)
    participant DB as cell (selvara_router)
    B->>A: request + __Host-sv
    A->>R: resolve(cookie)
    R->>CP: session by hash (not revoked, idle and absolute limits)
    R->>CP: identity Active; membership(identity, session.tenant_id) Active and = session.membership_id; role id = session.role_id or reload perms
    R->>CP: tenant status Active; routing (cell, schema t_tkey, schema version); tenant auth policy satisfied by session.auth_method (SSO enforced? passkey required?)
    alt any check fails
        R-->>A: 401 / 403 / 404 / 503 (fail closed)
    else all pass
        R->>DB: BEGIN; SET LOCAL ROLE t_tkey_rw; SET LOCAL search_path; set_config(app.tenant_id, app.user_id, app.request_id, app.scope = member/auditor/vendor/support/trust_public; auditors also app.engagement_id) (rev P3)
        R->>DB: load permissions of role (tenant_role_permission) in this transaction, keyed by perm_version, not cached (R2-01; rev P3)
        A->>DB: handler queries (repository applies object rule)
        DB-->>A: rows
        A-->>B: response (Cache-Control: no-store)
    end
```

| ID | Rule |
|---|---|
| E-20 | The tenant comes only from `control.sessions.tenant_id`. Request headers, paths, bodies and cookies other than `__Host-sv` are never consulted for tenant selection (C-11). |
| E-21 | The control-plane checks are one call (`cp_tenant_api.session_resolve`, a join of `sessions`, `identities`, `memberships`, `tenants`, `tenant_cells`, `tenant_schema_versions`). No cache for sessions, memberships or tenant status (R2-01): a removed member loses access on the next request. Only static routing fields (cell, schema, version) may be cached, ≤30 s. The role's permission set is read inside the tenant transaction, keyed by `perm_version`, which any role change increments (rev P3). |
| E-22 | Failure mapping: no or revoked session 401; membership not Active or tenant Suspended 403 `forbidden` (reason `membership` / `tenant_suspended`); tenant Deleting/Deleted 404; auth policy unmet (for example SSO enforced but session is password) 403 reason `sso_required`; schema version mismatch 503. |
| E-23 | The router asserts after `SET LOCAL ROLE` that `current_setting('app.tenant_id')` equals the routing record's tenant id and that `current_user` is `t_<tkey>_rw`; any mismatch aborts the transaction and raises a `security` alert (isolation tests, ADR-001). |

### 2.3 Multi-tenant users and tenant switching

| ID | Rule |
|---|---|
| E-24 | Switch (`C-AC-08`): the target membership must be Active, the target tenant Active, and the target tenant's auth policy satisfied by how the person authenticated **in this session**. If the target enforces SSO for this identity, the switch returns `sso_required` with the SSO start URL; if it requires a passkey for the target role and the session used TOTP, step-up with a passkey is required. On success the old session id is revoked and a new one issued (E-19); step-up time, elevation and support session do not carry over. |
| E-25 | One identity, many memberships, each with its own role. A consultant can be `admin` in tenant A and `auditor` in tenant B; permissions are evaluated only for the active tenant's membership. |
| E-26 | Leakage controls: every API response is `Cache-Control: no-store`; the front end clears its query cache and in-memory stores on switch (full reload to the landing page, as today); notifications, approvals, My Work, search and exports are per active tenant only; `GET /session` lists the person's other memberships as tenant ref + name + role only (no counts, no records); audit entries are written to the active tenant's log only; lockout uses the strictest preset across the person's tenants (today's rule). |
| E-27 | Display data: `control.identities` holds the global display name and email (email E1 under the platform KEK, with an HMAC blind index for lookup, DA-05; rev P3); each tenant holds `member_profile` (display name, job title as known to that tenant). A tenant never sees the person's other memberships. |
| E-28 | Idle limit uses the active role (a privileged role in the active tenant gives 15 min). |

---

## 3. Authorisation model

### 3.1 Permission catalogue (tenant)

Each permission is `<area>.<action>`. "Sensitive" (S) permissions make a role privileged (E-33d).

| ID | Permission | Module | S | Grants |
|---|---|---|---|---|
| E-30.01 | `overview.read` | shell | | Overview with per-module filtering |
| E-30.02 | `work.read` | shell | | My Work, own approvals |
| E-30.03 | `data.export` | shared | | Exports of data the caller can read |
| E-30.04 | `help.ask` | M24 | | Ask Selvara support |
| E-30.05 | `settings.read` / `settings.manage` | M01 | S (manage) | Tenant settings |
| E-30.06 | `members.read` / `members.manage` | M01 | S (manage) | Directory with emails; invite, role, suspend (admin-reserved, E-33b) |
| E-30.07 | `roles.manage` | M01 | S | Custom roles (admin-reserved) |
| E-30.08 | `sso.manage` | M01 | S | SSO, domains, SCIM tokens (admin-reserved) |
| E-30.09 | `support_grant.manage` | M01 | S | Give/revoke support grants (admin-reserved) |
| E-30.10 | `frameworks.read` / `frameworks.manage` / `frameworks.upgrade` | M02 | S (upgrade) | `frameworks.upgrade`: request a reference-content upgrade (C-M02-09, 4E `content.upgrade`, D-K36/D-K37; DA-15) (rev P3) |
| E-30.11 | `controls.read` / `controls.manage` / `controls.test` / `controls.attest` | M03 | | attest also needs OBJ-OWN |
| E-30.12 | `controls.exception.request` / `controls.exception.approve` | M03 | S (approve) | |
| E-30.13 | `evidence.read` / `evidence.write` / `evidence.review` / `evidence.delete` | M04 | S (delete) | |
| E-30.14 | `policies.read` / `policies.read_all` / `policies.write` / `policies.approve` / `policies.emergency` / `policies.acknowledge` | M05 | S (approve, emergency) | |
| E-30.15 | `risk.read` / `risk.write` / `risk.approve` / `risk.accept` / `risk.configure` / `risk.snapshot` | M06 | S (approve, accept, configure) | `risk.accept` carries a rank 1..2 |
| E-30.16 | `issues.read` / `issues.write` / `issues.manage` / `issues.verify` | M07 | | |
| E-30.17 | `audits.read` / `audits.manage` / `audits.engage` | M08 | S (manage) | `audits.engage` is auditor-only |
| E-30.18 | `vendors.read` / `vendors.manage` / `vendors.approve` / `vendors.request` / `vendors.respond` | M09 | S (approve) | `vendors.respond` is vendor-only |
| E-30.19 | `questionnaires.read` / `questionnaires.write` / `questionnaires.approve` / `answers.verify` | M10 | | |
| E-30.20 | `trust.view` / `trust.manage` / `trust.approve` | M11 | S (approve) | |
| E-30.21 | `people.read` / `people.manage` / `people.mfa_reset` | M12 | S (manage, mfa_reset) | |
| E-30.22 | `access.request` / `access.read` / `access.manage` / `access.approve` / `access.review` | M12 | S (approve) | |
| E-30.23 | `ai.read` / `ai.manage` / `ai.approve` | M13 | S (approve) | |
| E-30.24 | `privacy.read` / `privacy.manage` / `dpia.approve` / `dsar.handle` / `dsar.approve` | M14 | S (all but read) | `dsar.handle` reveals data-subject contact data |
| E-30.25 | `commitments.read` / `commitments.manage` | M15 | | |
| E-30.26 | `reports.read` / `reports.manage` / `reports.approve` | M16 | S (approve) | |
| E-30.27 | `integrations.read` / `integrations.manage` / `integrations.approve` | M17 | S (manage, approve) | |
| E-30.28 | `api.manage` / `api.approve` | M18 | S | |
| E-30.29 | `assistant.use` / `assistant.manage` / `assistant.approve` | M19 | S (manage, approve) | |
| E-30.30 | `approvals.delegate` | M21 | | Delegate a named-approver slot |
| E-30.31 | `auditlog.read` / `auditlog.export` | M22 | S | |
| E-30.32 | `billing.read` / `billing.manage` | M25 | S (manage) | |
| E-30.33 | `automation.read` / `automation.manage` / `automation.approve` | M26 | S (approve) | |
| — | (implicit) own notifications, own account, own attestations | M20, account | | Every member, OBJ-SELF |

### 3.2 RBAC matrix, E-31 (base tenant roles)

Legend: ● granted; ◐ granted with an object rule (OBJ-OWN or OBJ-SELF); **S** auditor scope (read only, items shared with a live engagement, OBJ-AUD); **V** vendor scope (own assessments, OBJ-VEN); — none. Changes from v0.2.5 are marked † and listed in E-32.

| Module | Permission | admin | owner | analyst | employee | viewer | auditor | vendor |
|---|---|---|---|---|---|---|---|---|
| shell | overview.read | ● | ● | ● | ● | — | S | — |
| shell | work.read | ● | ● | ● | ◐ | — | — | — |
| shared | data.export | ● | ● | ● | ◐ board pack only | — | S | — |
| M24 | help.ask | ● | ● | ● | ● | — | — | — |
| M01 | settings.read | ● | ● † | — | — | — | — | — |
| M01 | settings.manage, members.manage, roles.manage, sso.manage, support_grant.manage | ● | — | — | — | — | — | — |
| M01 | members.read | ● | ● † | — | — | — | — | — |
| M02 | frameworks.read | ● | ● | ● † | — | — | S | — |
| M02 | frameworks.manage | ● | ● | — | — | — | — | — |
| M02 | frameworks.upgrade (rev P3) | ● | — | — | — | — | — | — |
| M03 | controls.read | ● | ● | ● | — | — | S | — |
| M03 | controls.manage | ● | ● | — | — | — | — | — |
| M03 | controls.test | ● | ● | ● | — | — | — | — |
| M03 | controls.attest | ◐ | ◐ | — | — | — | — | — |
| M03 | controls.exception.request / .approve | ● | ● | — | — | — | — | — |
| M04 | evidence.read | ● | ● | ● † | — | — | S | — |
| M04 | evidence.write, evidence.review | ● | ● | ● † | — | — | — | — |
| M04 | evidence.delete | ● | — | — | — | — | — | — |
| M05 | policies.read (published) | ● | ● | ● | ● | — | S | — |
| M05 | policies.read_all, policies.write, policies.approve | ● | ● | — | — | — | — | — |
| M05 | policies.emergency | ● | — | — | — | — | — | — |
| M05 | policies.acknowledge | ● | ● | ● | ● | — | — † | — |
| M06 | risk.read | ● | ● | ● | — | — | S = risk snapshots shared with the auditor's live engagement only; no risk list (DA-07; C-M08-13) (rev P3) | — |
| M06 | risk.write | ● | ● | ● | — | — | — | — |
| M06 | risk.approve, risk.configure, risk.snapshot | ● | — | — | — | — | — | — |
| M06 | risk.accept (rank) | ● (2) | ● (2) | ● (1) | — | — | — | — |
| M07 | issues.read, issues.write, issues.verify | ● | ● | ● | — | — | — | — |
| M07 | issues.manage | ● | ● | — | — | — | — | — |
| M08 | audits.read, audits.manage | ● | ● | — | — | — | — | — |
| M08 | audits.engage | — | — | — | — | — | S | — |
| M09 | vendors.read, vendors.manage, vendors.approve | ● | ● | — | — | — | — | — |
| M09 | vendors.request | ● | ● | ● | ● | — | — | — |
| M09 | vendors.respond | — | — | — | — | — | — | V |
| M10 | questionnaires.read, questionnaires.write | ● | ● | ● † | ● | — | — | — |
| M10 | questionnaires.approve, answers.verify | ● | ● | — | — | — | — | — |
| M11 | trust.view | ● | ● | — | — | ● | — | ● |
| M11 | trust.manage, trust.approve | ● | ● | — | — | — | — | — |
| M12 | people.read, people.manage | ● | ● | — | — | — | — | — |
| M12 | people.mfa_reset | ● | — | — | — | — | — | — |
| M12 | access.request | ● | ● | ● | ◐ self | — | — | — |
| M12 | access.read | ● | ● | ◐ own | ◐ own | — | — | — |
| M12 | access.manage, access.approve, access.review | ● | ● | — | — | — | — | — |
| M13 | ai.read, ai.manage, ai.approve | ● | ● | — | — | — | — | — |
| M14 | privacy.read, dpia.approve, dsar.approve | ● | ● † | — | — | — | — | — |
| M14 | privacy.manage, dsar.handle | ● | — | — | — | — | — | — |
| M15 | commitments.read, commitments.manage | ● | ● | — | — | — | — | — |
| M16 | reports.read, reports.manage | ● | ● | — | — | — | — | — |
| M16 | reports.approve | ● | — | — | — | — | — | — |
| M17 | integrations.* | ● | — | — | — | — | — | — |
| M18 | api.manage, api.approve | ● | — | — | — | — | — | — |
| M19 | assistant.use, assistant.manage, assistant.approve | ● | ● † | — | — | — | — | — |
| M21 | approvals.delegate | ● | ● | — | — | — | — | — |
| M22 | auditlog.read, auditlog.export | ● | — | — | — | — | — | — |
| M25 | billing.read, billing.manage | ● | — | — | — | — | — | — |
| M26 | automation.* | ● | — | — | — | — | — | — |

### 3.3 Base role definitions and changes

| ID | Role | Definition |
|---|---|---|
| E-32a | `admin` | Tenant administrator; every tenant permission except `audits.engage` and `vendors.respond`. Defines the ceiling for custom roles. At least one active admin at all times (last-admin rule). |
| E-32b | `owner` | Control owner / management: all GRC modules, no tenant administration (team, SSO, API, integrations, billing, audit log, automation). |
| E-32c | `analyst` | Contributor: writes risks, issues, evidence and test results; reads controls and frameworks; cannot approve except issue verification and risk acceptance at rank 1. |
| E-32d | `employee` | Workforce member: published policies and acknowledgement, own access requests and grants, vendor requests, questionnaires (as today). |
| E-32e | `viewer` | Read-only member of the Trust Center (spine S5). A tenant needing an internal read-only role uses the custom role template "Read-only reviewer" (E-36). |
| E-32f | `auditor` | External, time-boxed (membership `expires_at` = latest engagement end), engagement-scoped, read-only on shared items only (E-42). |
| E-32g | `vendor` | External vendor contact; own assessments (OBJ-VEN) and the Trust Center member view only. |

Changes from v0.2.5 (†), each to be confirmed under OQ-09 "no downgrade": analyst gains evidence read/write/review (fixes AS gap 10) and frameworks read; analyst gains questionnaires (employee already had it); owner gains `settings.read` and `members.read` (needed for owner pickers and role names); owner gains assistant (resolves F1-04 in favour of the service rules); owner gains privacy read and DPIA/DSAR approval (second person for privacy four-eyes); **auditor loses `policies.acknowledge`** and all non-shared reads (F1-01).

### 3.4 Tenant custom roles (ADR-014)

| ID | Rule |
|---|---|
| E-33a | A custom role is a named set of permissions from E-30, stored in `tenant_role` + `tenant_role_permission` (tenant schema) with its id and name mirrored in `control.tenant_roles`. Base roles are immutable; a custom role can be cloned from a base role. |
| E-33b | Ceiling: permissions ⊆ admin's set. **Admin-reserved** permissions can never be in a custom role: `members.manage`, `roles.manage`, `sso.manage`, `support_grant.manage`. External-only permissions (`audits.engage`, `vendors.respond`) are never in a custom role; external roles stay base roles in this release. |
| E-33c | `risk.accept` in a custom role carries `riskAcceptRank` 1 or 2. |
| E-33d | **Privileged role** (one definition, DA-08): `admin`, `owner`, and any custom role holding any admin-only permission (a permission that E-31 grants to `admin` and to no other base role, for example `evidence.delete`, `policies.emergency`, `risk.approve`, `people.mfa_reset`, `privacy.manage`, `dsar.handle`, `auditlog.read`, `api.manage`, `frameworks.upgrade`). `analyst` is **not** privileged. Assigning a privileged role is in-app 4E `team.role` (with STEP); SCIM and JIT may assign only non-privileged roles (E-54a, E-55); privileged roles get the 15-min idle limit and the tenant's passkey requirement. The sensitive (S) column of E-30 is used only for E-34 (two approvals when a custom role gains an S permission). (rev P3) |
| E-33e | Separation of duties is per person, not per role (approval engine D-22), so combining request and approve permissions in one role is allowed: the engine still refuses the same person. |
| E-34 | Creating, changing or retiring a custom role is 4E `tenant.role.change` (2 approvals when the change adds a sensitive permission). Retiring needs zero holders. Every change increments `perm_version`; sessions reload permissions on the next request. Mismatch between `control.tenant_roles` and the tenant's `tenant_role` fails closed (403). |
| E-35 | Evaluation: `allowed = perm ∈ permissions(role) AND objectRule(record, actor)`; deny by default; unknown permission names refused at role save. Object rules are applied in the repository layer (scoped query builder per role class), not in handlers (R-30). |
| E-36 | Templates offered (not base roles): "Read-only reviewer" (all `*.read` except `members.read`, `auditlog.read`, `billing.read`), "Privacy officer" (`privacy.*`, `dpia.approve`, `dsar.*`, `people.read`), "Risk manager" (`risk.*`, `issues.*`), "Compliance manager" (frameworks, controls, evidence, policies, audits). Templates are instantiated as custom roles and are subject to E-33/E-34. |

### 3.5 Role-specific rules

| ID | Rule |
|---|---|
| E-40 | SoD library (shared by engine and modules): `notRequester`, `notSubject`, `notOwner`, `notAuthorOrEditor`, `notLastEditor`, `notSubmitter`, `notCollectorOrUploader`, `notBeneficiary`, `notFirstApprover`, `notDrafter`. Person identity is the identity id, never a display name (fixes RK gap 6). |
| E-41 | Risk acceptance authority: `risk_criteria.acceptanceLadder` maps residual bands to a required rank; the actor's rank comes from `risk.accept` on their role. |
| E-42 | Auditor read rule (F1-01 fix): an auditor sees a record only if (1) an `audit_shared_item` row lists it (or its parent for files and versions) for an `audit` where (2) the auditor has `auditor_access` with status Live and `now` within its window. Shared item kinds (DA-07): `control`, `evidence` (its versions and files included by default; no separate files flag), `policy`, `risk_snapshot`. Auditors have no risk list. List endpoints filter by a join on `audit_shared_item`; single-record misses return 404 (rev P3). |
| E-43 | Auditor actions: raise and close information requests, draft findings, record audit tests on shared controls, export shared items (watermarked). Never: acknowledge policies, edit records, see the member list or any member id (display names on shared records stay, DA-07), see other engagements, see the audit log (rev P3). Every read by an auditor is audited (`auditor.viewed`, record ref, engagement) per OQ-06. |
| E-44 | Auditor time-box: membership `expires_at` follows the latest engagement end; job D-79 suspends the membership when no engagement is Live or Scheduled; sessions revoked (E-17). Re-engagement reactivates the same membership. |
| E-45 | Vendor (member variant): sees only assessments where `vendor_contact.person_id` = self; members list returns only people referenced on those assessments (ids and names). The anonymous portal remains the preferred channel (RK gap 12); member-vendors are kept for parity. |
| E-46 | Viewer: Trust Center member view only; NDA accepted per person. |

---

## 4. Customer SSO and SCIM

### 4.1 Domains

| ID | Rule |
|---|---|
| E-50 | Domain verification: tenant adds a domain; Selvara issues `_selvara-challenge.<domain>` TXT value (random 32 bytes, base32); verified when DNS shows it (checked on demand and weekly by D-80; 3 failed weekly checks unverify and notify). A domain is verified for at most one tenant; a second claim needs platform review (support question) *(decision: first verified wins; disputes handled by platform with evidence)*. Free-mail and disposable domains are refused. |

### 4.2 Protocols

| ID | Rule |
|---|---|
| E-51 | SAML 2.0 via Supabase Auth SSO providers: one provider per tenant connection, registered by Selvara through the Supabase management interface *(verify that providers can be added programmatically per project and the limits, A-41)*. SP-initiated only (IdP-initiated disabled). Signed assertions required; audience and recipient checked; assertion IDs single use. Attributes mapped: email (NameID or attribute), given/family name, groups. |
| E-52 | OIDC: Selvara acts as the relying party itself (authorisation code + PKCE + nonce + state), because Supabase custom OIDC providers are limited per project *(reported as 3 per project, verify)* and are project-wide, not per tenant. Client secret stored as a Vault secret reference in `control.sso_connections`. ID token checks: signature via JWKS (cached ≤ 1 h), `iss`, `aud`, `exp`, `iat` skew ≤ 5 min, `nonce`, `email` present and either `email_verified=true` or the email domain is a verified domain of the tenant. After validation Selvara links or creates the Supabase user (admin API, no password) so every identity has one Supabase user id. |
| E-53 | Email binding: a connection may authenticate only emails in the tenant's **verified domains**. An assertion for any other email is refused (prevents a tenant IdP from asserting a consultant's or another company's address). |
| E-53b | MFA with SSO: tenant setting `ssoMfa` = `idp` (trust the IdP; requires an MFA indication in SAML AuthnContext or OIDC `amr`/`acr` when the IdP provides it) or `selvara` (Selvara second factor after SSO). Default `selvara` unless the connection test shows the IdP sends an MFA indication. |
| E-54 | Enforcement `enforce` = `off`, `domain` (identities with a verified-domain email must use SSO to enter this tenant), or `all` (every member, external domains included, must come through this IdP; only for tenants that federate guests). Up to 2 named tenant admins may be exempted as break-glass (password + passkey mandatory; each use alerts all admins). Switching enforcement off is 4E `sso.policy`. |
| E-54a | JIT provisioning: off by default. When on, a first SSO sign-in by a verified-domain email with no membership creates one with the connection's `defaultRoleId` (must be non-privileged, E-33d) or the role mapped from a group; a mapping to a privileged role creates a pending in-app `team.role` approval and the member starts as `employee` (DA-08) (rev P3). |

### 4.3 SCIM 2.0

| ID | Rule |
|---|---|
| E-55 | Endpoints in `2C-api.md` C-SC-01..06 (RFC 7643/7644). Semantics: **create** links or creates the identity (email must be in a verified domain), creates the membership (`source=scim`) and `member_profile`/`person`; **`active=false`** suspends the membership, revokes sessions in this tenant and sessions authenticated through this tenant's SSO, withdraws the person's pending requests, ends delegations to and from them, blocks votes, creates reassignment tasks for owned records, flags API keys they own (7-day reassignment, then suspended); **`active=true`** restores the membership with its previous role if non-privileged, otherwise as `employee` plus a pending `team.role` approval; **DELETE** removes the membership (records keep the person id; `member_profile` retained per retention rule), and if the identity has no other membership and is not staff, the identity and its Supabase user are deleted and `control.identities` pseudonymised. Group changes follow E-54a mapping rules. SCIM never assigns `auditor` or `vendor`, and assigns only non-privileged roles (E-33d); a privileged assignment needs in-app four-eyes `team.role` (DA-08). SCIM cannot suspend or remove the last two Active admins (409 `last_admins`); a deactivation of an admin, or more than 20 deactivations or role changes in 10 min, is held as `pending_review` and notifies tenant admins (2F F-M-12) (rev P3). |
| E-56 | Identity ownership: `control.identities.home_tenant_id` is set when the identity was created by that tenant's SCIM/JIT and its email is in that tenant's verified domain. Actions affecting the global identity (MFA reset, forced password reset, identity deletion) are allowed to a tenant only for identities it owns **and** that hold no privileged membership elsewhere; otherwise they go to the platform `mfa-reset-admin` path and every tenant where the person is a member is notified. Membership-level actions (suspend, remove, role change) are always the tenant's. |
| E-57 | SCIM tokens: `scim_<id>_<secret>` (secret 32 random bytes), only an HMAC-SHA256 (Vault-held pepper, versioned) stored in `control.scim_tokens` with tenant id, label, created by, approval id, expiry (≤ 365 days), last used time and IP hash; optional source IP allow-list per token (rev P3); at most 2 active per tenant (rotation overlap); creation is 4E `scim.token`; secret shown once to the requester within 60 min of approval; revocation immediate; tokens never logged (log redaction rule on `Authorization`). |
| E-58 | Conflicts: SCIM and manual edits of the same membership are last-writer-wins on role only if the role is non-privileged; privileged changes always go through approval; the SCIM response reports the current effective role. |

---

## 5. API keys for integrations

| ID | Rule |
|---|---|
| E-60 | Format `slv_<kid>_<secret>`: `kid` 16-char random base32, secret 32 random bytes base64url. No tenant name or code in the key (today's key embeds the company code). The fixed prefix allows secret-scanning patterns. |
| E-61 | Storage: tenant `api_key` row (kid, HMAC-SHA256 of the full key with a Vault pepper and pepper version, scopes, owner person id, label, expires_at, ip_allowlist, status, last_used_at, uses); `control.api_key_routes` maps kid → tenant (SD-C1). Verification: route by kid, then constant-time compare of the HMAC inside the tenant transaction. |
| E-62 | Scopes: `read:<module>` for frameworks, controls, evidence (metadata), policies, risks, issues, audits, vendors, ai-systems; `read:evidence-files`; `write:issues`, `write:evidence` (create/version with upload), `write:control-tests` (results for integration tests), `events:push`. Read-only keys issue at once; any `write:*` or `read:evidence-files` is 4E `api.key`. The secret is generated only when the requester reveals it within 60 min of approval (as today). |
| E-63 | Lifetime and rotation: expiry 30, 90 or 365 days; rotate creates a successor with the same scopes (no new approval if scopes are unchanged and the owner is the same) and keeps the old key valid for a grace period chosen up to 7 days; expiry warnings at 14 and 3 days. |
| E-64 | Limits: per-key rate limit and plan metering (C-57); optional IP allow-list; keys can never call account, settings, members, roles, SSO, SCIM, API key, webhook, approval-vote or export-of-personal-data endpoints. |
| E-65 | Principal: audit entries show `api_key:<kid>` and the owner; a key acts as a tenant service principal, never as its owner, and cannot vote (D-29). |
| E-66 | Owner offboarded: key flagged, admins notified, 7 days to reassign, then suspended. Suspected leak: revoke at once (single admin, safe direction). |

---

## 6. Platform roles and privileged access

### 6.1 Elevation

| ID | Rule |
|---|---|
| E-70 | Every platform mutation needs a live elevation: reason ≥ 15, ticket `[A-Z]{2,6}-\d{1,6}`, 15/30/60 min, **a fresh passkey assertion with user verification at start** (closes AD gap 12), one live elevation or support session per person, ends at sign-out or expiry; start, end and every action are in `control.platform_audit_log`. |

### 6.2 Platform roles

| ID | Role | Definition |
|---|---|---|
| E-71a | `management_approver` | Super admin: holds every platform permission (E-80). |
| E-71b | `ciso` | Super admin class: every platform permission; the security and privacy approver. With `management_approver` forms the dual-role pair for D-P03, D-P04, D-P06 (AI, KMS), D-P07, D-P08. |
| E-71c | `support` | Support staff: read tenant directory (minimal), answer help questions, open support sessions on customer grants, request admin MFA resets, read platform audit log and security list. Cannot elevate. |
| E-71d | Custom platform roles | Created from predefined names (E-73) with a permission set inside the name's ceiling (E-74). |

E-72 **What "all access" for Management Approver does not include** (recorded against the owner's wording "Management is super admin with all access"):

| ID | Exclusion | Enforced by |
|---|---|---|
| E-72a | Approving own requests or requests where they are the subject; voting twice | Engine D-22, DB trigger on votes |
| E-72b | Acting without elevation (all writes), or extending elevation beyond 60 min, or elevation without a passkey | E-70, DB checks |
| E-72c | Reading tenant business data without a live customer support grant; writing tenant data at all | Router refuses staff sessions on tenant routes (C-12); support sessions use `t_<tkey>_ro` and only granted parts (E-75) |
| E-72d | Seeing secrets or key material (provider secrets, KMS keys, API key hashes) | Secret references only (S2); Vault access restricted to runtime |
| E-72e | Editing or deleting audit logs, deletion certificates or approvals | Append-only tables, hash chains, external anchor |
| E-72f | Delegating platform approvals | D-26 |
| E-72g | Bypassing dual-role kinds alone | D-26 |
| E-72h | Removing the last other super-admin-class holder or changing own roles | D-P07 subject forbidden; last-holder rule |
| E-72i | Receiving a tenant invitation link or token (first-admin or any other): links go by email to the invitee only (DA-09) (rev P3) | 2C C-PL-05 returns no link; D-P13 for an email change |

### 6.3 Predefined platform role names

| ID | Predefined name | Default permissions | Ceiling (maximum a super admin may grant) |
|---|---|---|---|
| E-73a | Billing Officer | tenants.read, billing.read, billing.operate, rates.operate, elevate | + billing.approve, rates.approve, plans.assign, approvals.decide (D-P10, D-P11, D-P16 only) (rev P3) |
| E-73b | Privacy Officer | tenants.read, privacy.manage, audit.read, help.answer, elevate | + audit.export |
| E-73c | Security Analyst | security.read, audit.read, ops.read | + security.operate, ops.operate, audit.export, elevate |
| E-73d | Support Agent | tenants.read, help.answer, support.session, mfa_reset.request, approvals.read | + billing.read, security.read |
| E-73e | Compliance Reviewer | audit.read, approvals.read, tenants.read | + audit.export (never elevate) |
| E-73f | Internal Auditor (ISMS) | audit.read, approvals.read, staff.read, roles.read | same (read-only; assignment time-boxed ≤ 90 days) |
| E-73g | Platform Operations Engineer | ops.read, tenants.read, migrations.operate, elevate | + ops.operate, tenants.provision (request side only) |
| E-73h | Release Manager | migrations.operate, ops.read, elevate | + audit.read |
| E-73i | Customer Success Manager | tenants.read, help.answer, billing.read | + plans.assign, elevate |

E-74 Custom platform role rules: the name must come from the list above (extending the list is a code change through the release gate); permissions ⊆ the name's ceiling; **never grantable** to a custom role: `platform.staff.manage`, `platform.roles.manage`, `platform.keys.operate`, `platform.tenants.delete`, `platform.providers.manage`, `platform.breakglass.custodian`, voting on dual-role kinds; creating or changing a custom role and assigning it to a person are 4E (`platform.role.change`, `platform.staff.change`, dual role); every holder must use a passkey; assignments are reviewed quarterly (job D-80 reminder, review recorded in platform log).

### 6.4 Platform permission catalogue and matrix

| ID | Permission | mgmt_approver | ciso | support | Custom (via E-73) |
|---|---|---|---|---|---|
| E-80.01 | platform.tenants.read (minimal contact data, OQ-10; each view logged) | ● | ● | ● | ● |
| E-80.02 | platform.tenants.provision / platform.tenants.lifecycle | ● | ● | — | Ops (provision request) |
| E-80.03 | platform.tenants.delete | ● | ● | — | never |
| E-80.04 | platform.plans.assign / platform.plans.manage | ● | ● | — | Billing, CSM (assign) |
| E-80.05 | platform.approvals.read / platform.approvals.decide | ● | ● | read | read; decide: Billing Officer only, for D-P10, D-P11 and D-P16 (never dual-role kinds) (rev P3) |
| E-80.06 | platform.support.session | ● | ● | ● | Support Agent |
| E-80.07 | platform.help.answer | ● | ● | ● | Support, Privacy, CSM |
| E-80.08 | platform.billing.read / .operate / .approve | ● | ● | read | Billing |
| E-80.09 | platform.rates.operate / .approve | ● | ● | — | Billing |
| E-80.10 | platform.mfa_reset.request / .approve | ● | ● | request | Support (request) |
| E-80.11 | platform.audit.read / .export | ● | ● | read | several |
| E-80.12 | platform.elevate | ● | ● | — | where listed |
| E-80.13 | platform.security.read / .operate | ● | ● | read | Security Analyst |
| E-80.14 | platform.staff.manage, platform.staff.read | ● | ● | — | Internal Auditor (read) |
| E-80.15 | platform.roles.manage, platform.roles.read | ● | ● | — | Internal Auditor (read) |
| E-80.16 | platform.providers.manage | ● | ● | — | never |
| E-80.17 | platform.migrations.operate | ● | ● | — | Ops, Release |
| E-80.18 | platform.keys.operate | ● | ● | — | never |
| E-80.19 | platform.privacy.manage | ● | ● | — | Privacy Officer |
| E-80.20 | platform.ops.read / .operate | ● | ● | read | Ops, Security |
| E-80.21 | platform.breakglass.custodian | ● | ● | — | never |

### 6.5 Support access (customer-granted, model kept)

| ID | Rule |
|---|---|
| E-75 | A tenant admin (`support_grant.manage`) gives a grant: reason 10..300, ≤ 8 h, revocable at once, scope parts: `members` (names, emails, roles, status), `settings` (sign-in and governance settings), `auditlog` (tenant audit log), optionally named module read scopes the customer selects (for example `controls`), never files, never DSAR data. Stored in `control.support_grants` and the tenant audit log. |
| E-75a | Staff with `platform.support.session` open a session on a live grant: reason ≥ 15, ticket, ≤ 60 min and ≤ grant end, one at a time, tenant Active. The session is its own time-boxed privilege (no elevation; it allows no write anywhere). |
| E-75b | Data path: `/api/v1/platform/support/sessions/:id/view/:part` → router with `SET LOCAL ROLE t_<tkey>_ro`, `app.support_session` set; views return only the granted parts. Every view writes `support.viewed` (part, staff role, ticket) to the tenant audit log and the platform log. Customer admins see live sessions and can end them by revoking the grant. |
| E-76 | Without a grant, staff see only `control` data needed for operations: tenant name, status, plan, counts, admin contact for the account, admin MFA status for reset requests (OQ-10); each such view is logged (F1-06). Support questions remain visible to staff (Selvara is the controller for support communication), with the asker warned not to include personal data. |
| E-77 | Staff lifecycle: joining and role changes are 4E `platform.staff.change`; leaving revokes sessions, elevations, passkeys and support sessions at once (single super admin, safe direction); quarterly access review of staff and custom roles recorded in the platform log. |

### 6.6 Break-glass

| ID | Rule |
|---|---|
| E-78 | Scope: used only when (a) both super admins are locked out of Selvara, or (b) a production incident needs direct infrastructure access (Supabase organisation owner, database `migrator`, KMS administrator) that the application cannot provide. |
| E-78a | Custodian (R-C): sealed credentials for the Supabase organisation owner account and KMS administrator, each protected by a hardware security key kept separately from its password; the other super admin holds the second half (split knowledge). |
| E-78b | Procedure: (1) open a break-glass record (`POST /platform/break-glass` if the app works, else a pre-printed form; the record is a `control.platform_audit_log` entry, no separate table; rev P3) with incident reference and reason; (2) automatic alert to both super admins and the security mailbox on use of the sealed accounts (provider sign-in alerts); (3) actions limited to the incident; tenant business data is not read unless the incident requires it, and any tenant data access is recorded with the tenant refs touched; (4) close the record with an action log within 24 h; (5) post-use review by the other super admin within 72 h (`/platform/break-glass/:id/review`); (6) rotate every credential used; (7) if tenant personal data was accessed, the affected tenants are informed per the DPA *(legal to confirm wording)*. |
| E-78c | Drills twice a year using a non-production project; result recorded. |

---

## 7. Deliverables

- This document (`2E-iam.md`): authentication (E-10..E-19), tenant binding (E-20..E-28), permission catalogue and RBAC matrix (E-30..E-36), role rules (E-40..E-46), SSO and SCIM (E-50..E-58), API keys (E-60..E-66), platform roles, elevation, support access and break-glass (E-70..E-80).
- `adr/ADR-006-identity.md`, `adr/ADR-014-custom-roles.md`.

## 8. Decisions required

| ID | Decision | ADR |
|---|---|---|
| E-DR1 | Supabase Auth as credential verifier with a Selvara server session; SAML via Supabase, OIDC as Selvara RP, SCIM in Selvara | ADR-006 |
| E-DR2 | Tenant custom roles from the permission catalogue under an admin ceiling; platform custom roles from predefined names under per-name ceilings; all changes four-eyes | ADR-014 |
| E-DR3 | RBAC changes from v0.2.5 marked † in E-31 (including auditor losing acknowledgement) | OQ-09 sign-off |
| E-DR4 | Passkey at elevation start for platform staff | ADR-006 |

## 9. Open risks

| ID | Risk | L | I | Treatment |
|---|---|---|---|---|
| R-35 | Supabase Auth limits (SAML provider count or plan, OIDC custom provider count, no recovery codes, WebAuthn status) differ from assumptions | M | H | A-40, A-41 checks; Selvara-side RP and factors already designed; fallback in ADR-006 option C |
| R-36 | A tenant admin or tenant IdP affects a person's access in another tenant (MFA reset, SSO assertion of foreign emails, SCIM delete) | M | H | E-53 email binding to verified domains, E-56 identity ownership, platform path for shared identities |
| R-37 | Custom roles create unreviewed privilege (role sprawl) | M | M | E-33 ceiling, admin-reserved permissions, 4E on every change, quarterly review report of privileged roles |
| R-38 | Two super admins hold all platform power; collusion or one compromised account plus social engineering of the other | L | Critical | Passkeys, elevation, dual-role kinds, external audit-log anchor, independent internal auditor (R-D) reviews platform log quarterly |
| R-39 | Break-glass credentials used without trace if provider alerts fail | L | H | Provider sign-in alerts to two channels; monthly check that sealed accounts show no sign-ins; drills (E-78c) |

## 10. New assumptions

| ID | Assumption | Validate by |
|---|---|---|
| A-40 | Supabase Auth MFA offers TOTP (and phone) but no recovery codes; WebAuthn MFA is not generally available, so Selvara keeps its own passkeys and recovery codes | Supabase MFA documentation *(verify)* |
| A-41 | Supabase SAML SSO is available on the chosen plan and providers can be added per tenant programmatically in sufficient number | Supabase SAML documentation and pricing *(verify; sources disagree on plan tier)* |
| A-42 | Customer IdPs can send an MFA indication (AuthnContext / `amr`) often enough that `ssoMfa=idp` is usable | First customers |
| A-43 | Two named super admins plus custom-role staff are enough to meet platform approval TTLs | Owner (A-08) |
| A-44 | Customers accept that external roles (auditor, vendor) cannot be customised in this release | Owner |

## 11. Spine deviations

| ID | Deviation | Reason |
|---|---|---|
| SD-E1 | Adds `control.sessions`, `control.passkeys`, `control.recovery_codes`, `control.invitations`, `control.join_requests`, `control.sso_domains` (or domains as rows under `sso_connections`) to S2 | S3 requires a server-side session record; Supabase lacks recovery codes (and WebAuthn is unconfirmed); invitations and join requests exist today |
| SD-E2 | S3 step 1 reads "the Supabase Auth session (HttpOnly cookie) is verified". This design verifies a **Selvara** session cookie bound to the Supabase user id; Supabase tokens are used only during sign-in | E-10 (revocation, tenant binding) |
| SD-E3 | Adds column `control.identities.home_tenant_id` | E-56 |
| SD-E4 | `viewer` stays the Trust Center read-only role per S5; a general internal read-only role is a custom-role template, not a base role | Keeps S5 and today's behaviour; the brief's "viewer (read-only)" is met by E-36 |
| SD-E5 | Cross-workstream alignment note: 2A (SD-A1) names the session table `control.sessions` and allows a 30 s routing/session cache; 2B (SD-B01) names it `control.sessions`. This design uses `control.sessions` (matching 2B) and allows **no** cache for session revocation, membership or tenant status (E-21). Resolved by R2-01: `control.sessions`, no cache for sessions, memberships or tenant status; only static routing fields cached 30 s (rev P3). | Immediate revocation (E-17) |

## Sources

- Supabase documentation pages "Single Sign-On with SAML 2.0 for Projects", "Enable SSO for Your Organization", "Multi-Factor Authentication", "User sessions", and the Supabase blog post "Custom OIDC Providers for Supabase Auth": consulted through search summaries only (direct access was blocked in this environment), so every Supabase fact here is marked *(verify)*.
- IETF RFC 7643 / RFC 7644 (SCIM 2.0); RFC 6238 (TOTP).
- `docs/security/SOD_MATRIX.md` §§2, 3, 4, 6, 9, 12.
