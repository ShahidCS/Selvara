# Source feature -> React component checklist

Per-module tables live in `docs/checklist/<module>.md` (feature, source lines in `Assurance-GRC-Portal.html`, React file, status, open questions).
Status below is the migration state of each route. "Pending" screens render an explicit "Not migrated yet" notice (`components/ui/NotMigrated.tsx`).

| Route | Module | React component | Phase | Status | Detail |
|---|---|---|---|---|---|
| (all) | Shell, layers, RBAC, theme, routing | `components/shell/*`, `lib/*` | 1 | Done | [shell](checklist/shell.md) |
| `/ws/overview` | Overview | `OverviewModule` | 1 | Done | [overview](checklist/overview.md) |
| `/ws/work` | My Work | `WorkModule` | 1 | Done | [work](checklist/work.md) |
| `/ws/frameworks` | Frameworks | `FrameworksModule` | 1 | Done | [frameworks](checklist/frameworks.md) |
| `/ws/controls` | Controls & Tests | `ControlsModule` | 1 | Done | [controls](checklist/controls.md) |
| `/ws/evidence` | Evidence | `EvidenceModule` | 2 | Pending | |
| `/ws/policies` | Policies | `PoliciesModule` | 2 | Pending | |
| `/ws/audits` | Audits | `AuditsModule` | 2 | Pending | |
| `/ws/issues` | Issues | `IssuesModule` | 2 | Pending | |
| `/ws/people` | People & Devices | `PeopleModule` | 2 | Pending | |
| `/ws/access` | Access | `AccessModule` | 2 | Pending | |
| `/ws/risk` | Risk Register (+ import wizard) | `RiskModule` | 3 | Pending | |
| `/ws/ai` | AI Governance | `AiModule` | 3 | Pending | |
| `/ws/vendors` | Third Parties | `VendorsModule` | 3 | Pending | |
| `/ws/trust` | Trust Center | `TrustModule` | 3 | Pending | |
| `/ws/questionnaires` | Questionnaires | `QuestionnairesModule` | 3 | Pending | |
| `/ws/commitments` | Commitments | `CommitmentsModule` | 3 | Pending | |
| `/ws/reports` | Reports | `ReportsModule` | 3 | Pending | |
| `/ws/integrations` | Integrations | `IntegrationsModule` | 3 | Pending | |
| `/ws/api` | API, Webhooks & Custom Tests | `ApiModule` | 3 | Pending | |
| `/ws/assistant` | AI Assistant | `AssistantModule` | 3 | Pending | |
| `/ws/team` | Team & Settings | `TeamModule` | 3 | Pending | |
| `/ws/billingws` | Billing & Invoices | `BillingWsModule` | 3 | Pending | |
| `/auth` | Sign-in & security | `AuthModule` | 3 | Pending | |
| `/ws/auditlog` | Audit logs | `AuditLogModule` | 4 | Pending | |
| `/admin/customers` | Customers & Usage | `CustomersModule` | 4 | Pending | |
| `/admin/billing[/id]` | Billing | `BillingModule` | 4 | Pending | |
| `/admin/rates` | Exchange Rates & Tax | `RatesModule` | 4 | Pending | |
| `/admin/mfa` | MFA Resets | `MfaModule` | 4 | Pending | |
| `/admin/adminlog` | Admin Audit Log | `AdminLogModule` | 4 | Pending | |
| design board | 10 spec screens in the dashboard bundle (provider console, vendor assessment portal, auditor/vendor/public Trust Center, ...) | n/a | 4+ | Awaiting scope answer (see INVENTORY.md Q1) | |
