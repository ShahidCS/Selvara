# Production programme: every module on the server

Status: **decisions recorded on 2026-11-20 by the owner** (answers to the questions asked before the work started). Draft for security and compliance review. This file is the plan of record for moving the remaining modules from the demonstration build (data in the browser) to the server (Supabase Postgres behind the API, row level security per company), after the backend foundation and Admin Console slices 1 to 3b ([BACKEND_FOUNDATION.md](BACKEND_FOUNDATION.md)).

## 1. Owner decisions

| Topic | Decision |
|---|---|
| Delivery | One pull request per module group, each with its own migration, merged when its checks are green; the next group starts at once. |
| Releases | **Once at the end**: the owner runs the new migrations in order and pushes one signed tag when every group is merged. |
| Protected files | Pre-approved for this programme: adding modules to `SERVER_READY` in `src/lib/rbac.ts`, and refactoring `src/lib/sod.ts`, `src/lib/approvals.ts` and `src/lib/elevation.ts` so the server and the browser share the same rules (as slice 2c did). Each change is listed in its PR. Still **not** approved without asking again: `src/data/roles.json`, `.github/`, `next.config.js`, `vercel.json` (security headers, CSP), `.gitleaks.toml`, `.zap/`, dependency versions outside a reviewed need. |
| Starting data | A new company starts with **no records**, but with the **reference catalogues** loaded (frameworks and their requirements, the control library, policy and questionnaire templates), plus **in-product tips** on empty screens and first visits that guide people through each module. No synthetic people, vendors or risks in production. |
| Evidence files | **Real storage**: Supabase Storage, private bucket, per-company paths, type and size limits, malware-safe handling (no inline rendering of active content), short-lived signed links. |
| AI assistant and agents | **Real** (Claude API, key added to Vercel by the owner). **Off per company until a company admin turns it on (four-eyes)**. Only the records the user is looking at are sent. A **PII blocker** checks every request: by default it **blocks and explains** (what kind of data, where), audited; a company admin may choose "mask then send" instead. Nothing is used for training. Agents still only suggest until a person approves, as in the demonstration. |
| Integrations | **Real, read-only**: GitHub (GitHub App), AWS (cross-account IAM role with external ID), Okta and Microsoft Entra ID, Google Workspace. Credentials are added by the owner (Vercel variables or per-company secrets stored encrypted); never handled by the agent. Other connectors stay labelled as simulated. |
| Billing | **Internal ledger** (plans, usage, invoices, credits, refunds, write-offs with elevation and four-eyes, as in the demonstration) **plus a pluggable payment provider** interface, Stripe first, enabled only when its keys are configured. |
| Email | **Built, off until configured**: sending through an SMTP or email API provider the owner configures later. Until then email options say "not configured" and in-app notices are used; invitation and reset links are shown to the admin as today. |
| Verification | Each module's demonstration functionality is inventoried first (every screen, action, rule, four-eyes path, audit action), and the server build is **cross-checked against that inventory twice** (once while building, once independently after) before its PR is opened. |

## 2. Order of work

| Group | Modules |
|---|---|
| 1 | Frameworks, Controls, Evidence (with real file storage) |
| 2 | Policies, People, Access |
| 3 | Risk, Issues, Work and Overview, Reports |
| 4 | Vendors, Vendor portal, Questionnaires, Trust Center, Commitments |
| 5 | Audits, auditor access, Audit logs, AppSec |
| 6 | AI governance, Assistant and agents (Claude API, opt-in, PII blocker), API keys and webhooks |
| 7 | Integrations: GitHub, AWS, Okta and Entra ID, Google Workspace |
| 8 | Admin Console: Billing (ledger and payment provider), Rates and tax, MFA reset requests, Platform security; email delivery |

## 3. Architecture (decision D7, technical)

The demonstration's screens are rich and already route every change through a service function (`viaApi(mock, real)`), whose real branch calls `/api/...`. The screens read the in-memory dataset (`DATA`, `src/lib/data.ts`). To keep every screen and its behaviour exactly as in the demonstration:

- **Storage.** Per-company records live in `ws_records` (`tenant_id`, `kind`, `id`, `data jsonb`, `version`, `updated_ms`, `updated_by`), one row per record, under row level security on `app_tenant()` like every company table. Reference catalogues (frameworks, requirements, control library, templates) live in shared read-only tables. Records keep the demonstration's shapes, so one validation layer serves both builds.
- **Reads.** In API mode a module loads its collections from the server (`GET /api/ws/records?kinds=…`, scoped to the session's company and filtered by role) into the same in-memory shape, so the screens render unchanged.
- **Writes.** The real branch of each service function calls a server command. The server loads the record, applies the rule (the same reason functions the browser uses to disable buttons, shared through `src/lib`), checks the person by **user id** (never by display name), writes the change with an optimistic version check, records the audit entry in the company's hash-chained log and, where four-eyes applies, uses the server's approvals engine, all in one transaction. The browser then reloads the affected collections.
- **Identity.** In API mode the acting person is the session's person and company role; the demonstration's personas are never used. Owners and assignees are stored as member ids with a display name.

## 4. Rules every group follows

- Data lives in Postgres tables with `tenant_id` and row level security on `app_tenant()`; reference catalogues are shared, read-only tables. The server enforces every rule (roles from memberships, four-eyes through the approvals engine, reasons, expiry, audit entries in the company's hash-chained log); the browser only explains.
- Rules shared between the server and the demonstration live in `src/lib/rules.ts` or the shared rule modules, so the two cannot drift.
- Each group adds its modules to `SERVER_READY`; the demonstration build keeps working unchanged.
- Each group ships unit tests (in-memory), database tests (real Postgres: isolation, four-eyes guards, read-only paths) and, where a screen changes, an API-mode visual check.
- Synthetic data only, everywhere: no real customer, employee or organisational data, no secrets in the repository.

## 5. Progress

| Group | State | Migration | PR |
|---|---|---|---|
| 1 | Merged | `0008` | ShahidCS/Selvara#74 |
| 2 | Built, in review | none (uses `0008`) | group 2 PR |
