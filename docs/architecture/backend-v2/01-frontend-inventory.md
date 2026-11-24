# Back-end v2, Phase 1: Front-End Inventory

| | |
|---|---|
| Source | This repository's front end at v0.2.5 (`front-end/src`), with the existing server (`front-end/src/server`) and migrations (`supabase/migrations`) |
| Method | Four groups inventoried in parallel, then spot-checked by the design authority (see "Verification" below) |
| Data | Field names and types only; no values copied from the demonstration seed data |

## 1. Detailed inventory

| Group | File | Screens | Entities | Rule-bearing actions |
|---|---|---|---|---|
| AS: Assurance and work (overview, My Work, reports, frameworks, controls, evidence, policies, audits, issues) | [inventory/01-assurance.md](inventory/01-assurance.md) | 43 | 37 | 32 |
| RK: Risk, people and third parties (risk, people, access, AI governance, vendors, vendor portal, questionnaires, Trust Center, public Trust Center, commitments) | [inventory/02-risk-third-parties.md](inventory/02-risk-third-parties.md) | 45 | 48 | 49 |
| ST: Company settings, audit log, privacy and AI (team, integrations, API keys and webhooks, assistant, company billing, audit log and RoPA, AppSec, Help centre, account, sign-in) | [inventory/03-settings-privacy-ai.md](inventory/03-settings-privacy-ai.md) | 45 | 53 | 23 |
| AD: Admin Console and app shell (customers, platform billing, rates, MFA resets, platform audit log, elevation, platform security, shell) | [inventory/04-admin-console-shell.md](inventory/04-admin-console-shell.md) | 33 | 44 | 21 |
| **Total** | | **166** | **182** entity rows (some overlap between groups) | **125** |

Each file has screens (route, roles, entities, actions, current endpoints), entities (fields marked [PD] personal data, [FT] free text, [FILE] file, plus current storage and states), actions needing approval or special rules, and gaps. Group AD also covers which data platform staff can see, and lists the 25 current platform tables.

## 2. Coverage of the brief's required entities

| # | Entity | Today | Where | Notes for Phase 2B |
|---|---|---|---|---|
| 1 | Tenant | Covered | AD E-AD-01 | Governance settings exist only in the demo (ST gap 4) |
| 2 | User | Covered | ST | Profiles, sessions, MFA, passkeys, recovery codes |
| 3 | Membership | Covered | ST | Invitations and join requests included |
| 4 | Role | Covered | ST, `roles.json` | Fixed roles |
| 5 | Permission | **Partial** | `roles.json`, `lib/rulesWs.ts` | Fixed module permissions plus per-action role lists; no stored permissions |
| 6 | Framework | Covered | AS | Library, custom frameworks and per-tenant state |
| 7 | Requirement | Covered | AS | Reference rows shipped with the code |
| 8 | Control | Covered | AS | |
| 9 | ControlMapping | **Partial** | AS gap 3 | Two maps embedded in records (framework side and control side), no table, no unmap route on the control side |
| 10 | Evidence (versions, expiry) | **Partial** | AS gap 4 | No links to controls, requirements, audits or findings; no expiry; "version" is a counter |
| 11 | Policy (versions, approvals, attestations) | **Partial** | AS gap 5 | Versions and approvals exist; acknowledgements keep only the latest one, so history is only in the audit log |
| 12 | Asset | **Missing** | RK gap 1 | No ISO 27005 asset model |
| 13 | Threat | **Missing** | RK gap 1 | |
| 14 | Vulnerability | **Missing** | RK gap 1 | |
| 15 | Risk | Covered | RK E-RK-01 | Free-text scenario; scoring criteria are code constants, not per-tenant |
| 16 | RiskTreatment | **Partial** | RK gap 2 | Embedded in the risk record; actions addressed by their position in a list |
| 17 | Vendor | Covered | RK E-RK-24 | |
| 18 | Questionnaire | **Partial** | RK gaps 3–4 | Two outbound models; inbound questionnaires have no question or answer rows |
| 19 | Assessment | **Partial** | AS, RK | Audit engagement, vendor reassessment and AI impact assessment; no general assessment |
| 20 | Audit | Covered | AS | |
| 21 | Finding | **Partial** | AS | `Closed` exists but nothing sets it; vendor findings are separate |
| 22 | CorrectiveAction | Covered (as Issue) | AS | |
| 23 | TrustCenterPage | **Partial** | RK gap 15 | Assembled from other modules; no stored page content |
| 24 | AccessRequest | Covered | RK, ST | Workforce access, Trust Center, join requests, support grants |
| 25 | ProcessingActivity (RoPA) | **Partial** | ST gap | A fixed list of 17 activities, the same for every company and read-only; no table |
| 26 | DPIA | **Partial** | RK (AI) | Only the per-AI-system impact assessment; no GDPR DPIA |
| 27 | DataSubjectRequest | **Missing** | ST gap 4 | No screen, service, route or table |
| 28 | Plan | **Partial** | AD | Server price list only; plans, entitlements and usage limits exist only in the demo |
| 29 | Subscription | **Partial** | AD, ST | A billing account plus plan requests |
| 30 | Invoice | Covered | AD, ST | Ledger included |
| 31 | AuditLogEntry | Covered | all groups | The platform screen drops lawful basis, data categories and before/after values in production |
| 32 | Notification | **Partial** | AD gap 3 | Production bell hidden; read state kept in the browser and keyed by role, not person |

Summary of the 32 entities: **14 covered, 14 partial, 4 missing** (Asset, Threat, Vulnerability, DataSubjectRequest).

## 3. Cross-cutting findings for Phase 2

These are not design decisions. They are facts the design must handle, and the Phase 3 and 4 findings registers will refer to them.

| ID | Finding | Source | Workstream |
|---|---|---|---|
| F1-01 | **External auditors can read the whole tenant.** Controls, evidence (including file downloads), policies and frameworks are open to the auditor role. Only the audits module checks the engagement assignment and expiry. An auditor can also acknowledge policies. | AS gap 1 | E, F |
| F1-02 | **The anonymous Trust Center exposes a lot.** It shows control status by domain and the names of NDA-gated documents. One verified address accepts the NDA for the whole company domain. Access refers to documents by name and viewers by email, so a rename silently changes access. | RK gap 5 | F, G |
| F1-03 | Demo and server behave differently in several places, so "no downgrade" (owner) depends on whether demo-only features count as scope. Demo-only: plans, entitlements and usage metering; automation rules; retention and legal holds; most Team settings; 11 fallback endpoints. | AD gaps 1, 5; ST gaps 3–4 | A, C, K |
| F1-04 | Rules disagree between the browser and the server: Assistant agent management for `owner`; price-list changes, rejecting held rates and voiding invoices. There are also two approval engines. | ST gap 5, AD gap 5 | E |
| F1-05 | Data-loading routes write to the database (recording expiries and expiring approvals while reading). | RK | C, D |
| F1-06 | Platform staff can see company admins' names, emails and MFA status, and every support question, without a grant from the company. | AD section "Control plane versus tenant data" | E, G |
| F1-07 | The demo payment form collects card details. The production build has no such form. v2 must keep card data out of Selvara entirely (hosted payment pages). | ST | F, I |
| F1-08 | Identity-provider sync stores employee personal data, up to 5,000 records per connection. | ST | G |
| F1-09 | Names are stored next to user ids in many JSON records, so personal data is scattered. Report recipients are stored as email addresses. | AS gap 5 | B, G |
| F1-10 | Settings shared across companies: the trusted-network list is read from one setting for all tenants, and nothing writes it. | ST gap 4 | A, F |

## 4. Verification by the design authority

Spot checks against the code:
- **RoPA:** 17 fixed activities (PA-01 to PA-17) in `front-end/src/data/platform.json`. Confirmed.
- **Data subject requests:** absent from both `front-end/src` and `supabase/`. Confirmed.
- **Risk server:** no asset model in `server/ws/risk.ts`. Confirmed.
- **Group AS note:** it says no migrations folder exists. **That is incorrect:** the migrations are in `supabase/migrations` at the repository root, and group AD lists their tables.
- **Sensitive content:** a scan of all four files found no email addresses, URLs or credential patterns.
