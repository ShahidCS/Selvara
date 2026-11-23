# ADR-014: Custom roles: tenant custom roles and platform custom roles from predefined names

| | |
|---|---|
| Status | **Proposed** |
| Date | 2026-11-23 |
| Workstream | 2E (detail in `2E-iam.md` E-30..E-36, E-71..E-80) |
| Related | ADR-006 (identity), ADR-010 (control plane); spine S2 (`control.tenant_roles`, `control.platform_roles`, `control.platform_role_permissions`), S4 M01 (`tenant_role`, `tenant_role_permission`), S5; OQ-01 |

## Context

- Today roles are fixed (`data/roles.json`), with module access (`ROLE_MODS`) and per-action role lists in code; browser and server disagree in places (F1-04); permissions are not stored (inventory entity 5 "Partial").
- Spine S5: tenants may define custom roles from base permissions, never exceeding admin. OQ-01 (owner): platform roles are Management Approver (super admin, all access, still four-eyes and no self-approval) and CISO; a super admin can create custom platform roles in the Admin Console **from predefined role names**, each with a configurable permission set.
- Regulated customers need least privilege (for example a privacy officer or a read-only reviewer) without granting admin.

## Options considered

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | Fixed roles only (tenant and platform) | Simple; easy to test and audit | Cannot meet least-privilege needs; contradicts S5 and OQ-01 |
| B | Free-form custom roles (any name, any permission) on both planes | Maximum flexibility | Privilege sprawl; platform roles with arbitrary names obscure accountability; easy to create an admin-equivalent role and bypass four-eyes on role changes |
| C (recommended) | **Tenant:** custom roles composed from a stored permission catalogue under the admin ceiling, with admin-reserved permissions, four-eyes on every change. **Platform:** custom roles only from a code-defined list of predefined names, each with a default set and a ceiling, plus never-grantable permissions; four-eyes (dual role) on create, change and assignment | Least privilege with bounded risk; names stay meaningful for audits; matches S5 and OQ-01; one evaluation model for both planes | Catalogue must be maintained as modules grow; adding a predefined platform name is a release |
| D | Attribute-based access control (policies over attributes) | Very expressive | Hard to review for customers and auditors; heavy for a two-person company; over-engineered for the need |

## Decision

Option **C**.

Tenant plane:
1. Permission catalogue `E-30` (`<area>.<action>`), with sensitive permissions marked.
2. A custom role = name + permission set (+ `riskAcceptRank` if it includes `risk.accept`), stored in `tenant_role` / `tenant_role_permission`, mirrored by id and name in `control.tenant_roles`.
3. Ceiling: ⊆ admin's set. Admin-reserved (never in a custom role): `members.manage`, `roles.manage`, `sso.manage`, `support_grant.manage`. External-only (`audits.engage`, `vendors.respond`) never in a custom role.
4. A role with any sensitive permission is privileged: assignment needs four-eyes (`team.role`), stricter session limits and the tenant's passkey rule.
5. Create, change and retire: four-eyes `tenant.role.change` (two approvals when adding a sensitive permission). Changes bump `perm_version`; sessions reload on the next request.
6. Separation of duties stays per person in the approval engine, so a role may hold both request and approve permissions.
7. Templates (Read-only reviewer, Privacy officer, Risk manager, Compliance manager) are offered as starting points.

Platform plane:
1. Fixed roles `management_approver`, `ciso`, `support`.
2. Predefined names (code list): Billing Officer, Privacy Officer, Security Analyst, Support Agent, Compliance Reviewer, Internal Auditor (ISMS), Platform Operations Engineer, Release Manager, Customer Success Manager; each with a default permission set and a ceiling (E-73).
3. Never grantable to a custom platform role: `platform.staff.manage`, `platform.roles.manage`, `platform.keys.operate`, `platform.tenants.delete`, `platform.providers.manage`, `platform.breakglass.custodian`, votes on dual-role kinds.
4. Creating or changing a custom platform role and assigning it: four-eyes with dual role (`management_approver` + `ciso`).
5. "All access" for Management Approver excludes self-approval, acting without elevation, reading tenant data without a customer grant, seeing secrets, editing logs, and delegating approvals (E-72).

## Consequences

- S-ST-05 (Permissions tab) becomes a role editor; new Admin Console pages for platform roles and staff (C-PL-17, C-PL-18).
- Every endpoint names one permission (2C), so the catalogue is the single source for browser and server (closes F1-04); the front end receives the effective permission list in `GET /session`.
- Contract tests generated per endpoint × base role from the 2C authorisation column; custom-role tests sample random permission subsets.
- Adding a module adds permissions to the catalogue through a migration; existing custom roles do not gain them automatically (deny by default).

## Security and privacy implications

- Prevents privilege escalation through role editing (admin-reserved permissions, four-eyes, ceilings).
- Platform roles keep auditable names; ceilings stop a custom role from approaching super-admin power.
- Risk R-37 (role sprawl) is treated by a quarterly report of privileged roles and their holders, per tenant (to tenant admins) and for staff (to super admins).
- No personal data in role definitions; role assignment history is in the audit logs.

## Verification (Phase 4)

| ID | Check |
|---|---|
| V-014-1 | Saving a tenant custom role containing an admin-reserved or external-only permission is refused (422). |
| V-014-2 | A custom role change applies only after a second, different approver; adding a sensitive permission needs two approvers. |
| V-014-3 | After a role change, the next request of an affected session uses the new permission set (perm_version test). |
| V-014-4 | Creating a platform custom role with a name outside the list, or a permission outside the name's ceiling, is refused; never-grantable permissions are refused even within an approved request. |
| V-014-5 | A Management Approver cannot vote on their own request, cannot act without elevation, and cannot open tenant routes without a support session. |
| V-014-6 | Mismatch between `control.tenant_roles` and the tenant's `tenant_role` returns 403 (fail closed). |
