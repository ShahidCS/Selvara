# Customers & Usage (platform admin, Phase 4)

| Source feature | Source lines | React file | Status | Notes |
|---|---|---|---|---|
| Plan catalogue, module list, module/usage pricing seeds | 3779-3788 | `services/billing` (`PLANS`), `data/plans.json`, `data/billingAdminSeed.json`, `services/customers.ts` | Done | `PLANS` is shared with the workspace Billing view, as in the source |
| `custInit` lazy defaults (modules, limits, seatLimit) | 3789-3793 | `services/customers.ts` | Done | |
| Search-first lookup, suggestions (name / id / email), keyboard (Up/Down/Enter/Esc), outside click, "No customer matches" | 3828-3860 | `customers/CustomerSearch.tsx` | Done | Combobox ARIA added; suggestions are React text. Enter only picks while the list is open (source also picked from the hidden list) |
| Recently viewed chips (max 4), Clear, Onboard customer header actions | 3823-3827, 3860-3861 | `CustomersModule.tsx` | Done | State via `useModState("customers.*")` |
| Profile header, KPI tiles, tabs (Overview, Plan & modules, Users (n), Usage breakdown) | 3862-3877 | `customers/CustomerProfile.tsx` | Done | Tab persists across customers (source `CUSTV.tab`) |
| Plan tab: meters (over-plan, 85% warn), module entitlements toggle, adminLog `customer.module.enabled/disabled` | 3794-3813, 3822 | `customers/PlanTab.tsx`, `services/customers.ts` (`toggleModule`) | Done | |
| Change plan modal, adminLog `customer.plan.changed` | 3814-3821 | `customers/PlanTab.tsx` (`ChangePlanForm`), `changePlan` | Done | |
| Users tab: directory table, select / select all, bulk bar (Reset MFA, Suspend, Export, Clear), empty state | 3878-3907 | `customers/UsersTab.tsx`, `lib/tenantUsers.ts`, `data/tenantUsers.json` | Done | Seed extracted with `extract-source.js` |
| Row menu: edit, change role, reset MFA/password, resend invite/verification, force sign-out, activity, suspend/reactivate, remove | 3910-3947 | `UsersTab.tsx`, `customers/UserForms.tsx`, `services/customers.ts` | Done | All `adminLog` calls kept with the source text |
| Add / edit user form and validation ("Full name is required.", "Enter a valid email address.") | 3951-3971 | `customers/UserForms.tsx` | Done | Email through `isEmail`; role/country checked against allow-lists in the service |
| Change role, remove user modals, user activity modal (last 8 admin-log rows naming the user) | 3943-3975, 3948-3950 | `UserForms.tsx` | Done | Regex test replaced by `includes` (same result) |
| Onboard customer modal, plan-driven module defaults, validation, tenant admin creation, adminLog `customer.onboarded`, select new customer | 4089-4123 | `customers/Onboard.tsx`, `services/customers.ts` (`onboard`) | Done | Reached from Billing via `customers.onboardPending` flag (source: `go` + `setTimeout`) |

## Open questions
1. Bulk "Export" only logs `users.exported` and toasts "(demo)"; no file is produced (so no `csvCell` path exists). A real export must be server-side, audited and PII-minimised.
2. `uCreate` does not set `city`; the Location column shows country only. Source behaviour.
3. Downgrading below `seatsUsed` is allowed (seat meter shows "over plan"). `mrr` becomes the USD list price even for non-USD customers (source).
4. `customer.plan.changed` / `customer.module.*` / `user.*` log entries carry no `tenant` (source), only the Billing and onboarding entries do.
5. New user with an e-mail that already exists in the same or another tenant is accepted (source has no duplicate check).
6. A removed user's id stays in the selection map in the source; here it is deleted on removal.
7. Role names in `USER_ROLES` come from `data/userRoles.json` (shared with Team).
8. Profile `mrr` sum on Billing mixes currencies as plain USD list prices (source).

## Security notes
* Role gate: `ROLE_MODS` gives both Platform Support and Platform Super Admin the whole module (`customers`); the source has no in-function gate. UI + service check (`customersCanManage`, deny by default) are demo only: the API must enforce platform-admin roles and log who did what.
* Tenant isolation: every user operation looks the user up by `custId` + `id` (cross-tenant id rejected). The real API must scope by tenant on the server (IDOR). Customer ids are always looked up as own properties of `CUSTOMERS`.
* Audit: every mutation keeps its `adminLog` (hash chain is a demo). The audit entry should be written in the same transaction server-side. Reset MFA / password / force sign-out are privileged account-takeover vectors: require four-eyes or reason capture server-side (the MFA module has the four-eyes flow; this one does not, source behaviour).
* PII: customer contacts and user e-mails render as React text only; nothing is stored in browser storage beyond UI state in memory. GDPR: audit entries contain names and e-mails (`invoice.resent`), see RoPA.
* Inputs: names clamped (100), e-mails validated (`isEmail`), plans/modules/regions/currencies/cycles/roles/countries checked against allow-lists in the service. Onboarding is not idempotent (needs a client request id on the API).
* No HTML sinks; no card data handled.

## Changes vs prototype (owner decision, docs/security/SOD_MATRIX.md sections 2 and 3)
| Prototype | Now | Where |
|---|---|---|
| Any Support/Super could change plans, modules, onboard and manage tenant users at any time | Every mutation needs an active elevated session (`assertElevated`, `SodError("Elevation required")`) plus `assertRole(super, support)`. Support can browse but can never elevate, so it cannot change anything | `services/customers.ts` `guard()` |
| Buttons always enabled | Disabled with title "Elevate to make changes"; page banner links to `/admin/elevation`; read-only browsing unchanged | `admin/ElevateGate.tsx`, `CustomersModule`, `PlanTab`, `Onboard`, `UsersTab`, `UserForms` |
| Downgrade below seats in use allowed | BLOCKED in service and form: "Cannot move to X: N seats are in use and X includes M. Remove users first." | `changePlan` |
| No reason | Onboarding and plan change require a reason of at least 15 characters; recorded with the elevation ticket in the admin log | `reasonOf`, forms |
| Audit written by the UI after the call | Services write `adminLog` (action, subject, tenant, before/after, reason, elevation ticket); UI no longer logs (no duplicates) | `audit()` in the service |
| Reset MFA (single and bulk) changed state directly | Removed. It bypassed the MFA four-eyes flow; the menu item and bulk button now lead to MFA Resets (`/admin/mfa`); `userAction("resetmfa")` and bulk "mfa" throw `SodError` | `MFA_RESET_VIA_MODULE` |
| Bulk user export audited in UI only | Audited by `auditUserExport` (read, no elevation) | service |
| Raw "could not ..." toasts | Toast shows the `SodError` message only (`sodMessage`), generic text otherwise | all forms |

## Open questions (added)
9. Changing a tenant user's role (for example to Company Admin) is done here by ONE elevated super admin. SOD_MATRIX "Team: grant/change a role" asks a different admin to approve inside a customer workspace; for platform staff acting on a tenant, should this need the approvals engine too? Not built (not listed in section 3 for this module).
10. Seat changes: there is no separate seat editor; seats follow the plan. The downgrade block compares plan seats with `usage.seatsUsed`.
11. Module toggles need elevation and audit but no reason (no form in the source).
12. Remove user / suspend (single and bulk) are elevation + audit only, no second approver.

## Security notes (added)
* Elevation is UI state in this demo; the API must hold its own elevation record and reject every mutation without it. The same applies to the downgrade block, reason requirement and the MFA-reset redirect.
* Support: module read access only; never an elevated session.
* Conflicts resolved by owner decision: standing super-admin access to everything is replaced by elevation-gated mutation; MFA reset must use the request/approval flow.
