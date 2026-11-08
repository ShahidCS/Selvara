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
| `/ws/evidence` | Evidence | `EvidenceModule` | 2 | Done | [evidence](checklist/evidence.md) |
| `/ws/policies` | Policies | `PoliciesModule` | 2 | Done | [policies](checklist/policies.md) |
| `/ws/audits` | Audits | `AuditsModule` | 2 | Done | [audits](checklist/audits.md) |
| `/ws/issues` | Issues | `IssuesModule` | 2 | Done | [issues](checklist/issues.md) |
| `/ws/people` | People & Devices | `PeopleModule` | 2 | Done | [people](checklist/people.md) |
| `/ws/access` | Access | `AccessModule` | 2 | Done | [access](checklist/access.md) |
| `/ws/risk` | Risk Register (+ import wizard, see [risk-import](checklist/risk-import.md)) | `RiskModule` | 3 | Done | [risk](checklist/risk.md) |
| `/ws/ai` | AI Governance | `AiModule` | 3 | Done | [ai](checklist/ai.md) |
| `/ws/vendors` | Third Parties | `VendorsModule` | 3 | Done | [vendors](checklist/vendors.md) |
| `/ws/trust` | Trust Center | `TrustModule` | 3 | Done | [trust](checklist/trust.md) |
| `/ws/questionnaires` | Questionnaires | `QuestionnairesModule` | 3 | Done | [questionnaires](checklist/questionnaires.md) |
| `/ws/commitments` | Commitments | `CommitmentsModule` | 3 | Done | [commitments](checklist/commitments.md) |
| `/ws/reports` | Reports | `ReportsModule` | 3 | Done | [reports](checklist/reports.md) |
| `/ws/integrations` | Integrations | `IntegrationsModule` | 3 | Done | [integrations](checklist/integrations.md) |
| `/ws/api` | API, Webhooks & Custom Tests | `ApiModule` | 3 | Done | [api](checklist/api.md) |
| `/ws/assistant` | AI Assistant | `AssistantModule` | 3 | Done | [assistant](checklist/assistant.md) |
| `/ws/team` | Team & Settings | `TeamModule` | 3 | Done | [team](checklist/team.md) |
| `/ws/billingws` | Billing & Invoices | `BillingWsModule` | 3 | Done | [billingws](checklist/billingws.md) |
| `/auth` | Sign-in & security | `AuthModule` | 3 | Done | [auth](checklist/auth.md) |
| `/ws/auditlog` | Audit logs | `AuditLogModule` | 4 | Done | [auditlog](checklist/auditlog.md) |
| `/admin/customers` | Customers & Usage | `CustomersModule` | 4 | Done | [customers](checklist/customers.md) |
| `/admin/billing[/id]` | Billing | `BillingModule` | 4 | Done | [billing](checklist/billing.md) |
| `/admin/rates` | Exchange Rates & Tax | `RatesModule` | 4 | Done | [rates](checklist/rates.md) |
| `/admin/mfa` | MFA Resets | `MfaModule` | 4 | Done | [mfa](checklist/mfa.md) |
| `/admin/adminlog` | Admin Audit Log | `AdminLogModule` | 4 | Done | [adminlog](checklist/adminlog.md) |
| spec boards | Decision: keep the portal design; port only what the portal lacks (Phase 5): external Vendor assessment portal, Member workspace view, Super admin elevated-session console, Application security controls (read-only page) | n/a | 5 | In progress | see docs/SPEC_BOARDS.md |
