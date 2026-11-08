# Selvara

**A governance, risk and compliance (GRC) platform for regulated organisations.** One control set, mapped to every framework you answer to, with the evidence, approvals and audit trail that auditors and regulators expect.

> **Status: front-end complete, backend not yet built.** The web application is fully built in React / Next.js and runs on synthetic in-memory data. There is no server, database or real authentication yet. See [Project status](#project-status).

---

## Table of contents

- [Overview](#overview)
- [Who it is for](#who-it-is-for)
- [Key features](#key-features)
- [Security and segregation of duties](#security-and-segregation-of-duties)
- [Roles and access model](#roles-and-access-model)
- [Screens at a glance](#screens-at-a-glance)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Repository layout](#repository-layout)
- [Documentation](#documentation)
- [Project status](#project-status)
- [Contributing](#contributing)
- [Security reporting](#security-reporting)
- [License](#license)

## Overview

Compliance work usually lives in spreadsheets, shared drives and email. Controls are tracked in one place, evidence in another, risks in a third, and the approval history is whatever people remember. Selvara brings that into a single workspace:

- **One control library, many frameworks.** Each control is mapped to the requirements of the standards and regulations in scope, so a single piece of evidence supports several frameworks at once.
- **Readiness you can defend.** Framework readiness is computed requirement by requirement from the status of the mapped controls, not typed in by hand.
- **Decisions with accountability.** Risk acceptance, policy approval, access grants, MFA resets and similar actions follow four-eyes rules: the person who asks can never be the person who approves, and every step is logged.
- **Built for external parties too.** Auditors get a read-only engagement view, vendors answer assessments in an isolated portal, and customers see a managed Trust Center.

The product ships as a web front-end. Backend requirements (authentication, authorization, persistence, audit storage) are documented so they can be built against a known contract.

## Who it is for

| Audience | What they do in Selvara |
|---|---|
| **CISOs and security leaders** | Track posture and framework readiness, take risk decisions, export board packs |
| **Compliance, GRC and risk teams** | Maintain the control library, framework mappings, risk register and policy lifecycle |
| **Control, policy and risk owners** | Attest controls, upload evidence, own policies and risks, work their task list |
| **Internal audit and external auditors** | Run engagements, request and review evidence, raise findings (read-only on the organisation's records) |
| **Procurement and third-party risk** | Assess vendors, track certificates and review cycles, run questionnaires |
| **Employees** | Read published policies and acknowledge them, manage account security |
| **Platform operators (SaaS provider)** | Onboard customers, manage billing and rates, reset MFA under dual control |
| **Vendors and customers (external)** | Complete a security assessment; browse a Trust Center |

It is designed with **regulated sectors in mind** (banks and financial institutions, critical-infrastructure operators and similar), where segregation of duties and defensible audit trails are mandatory rather than nice to have.

## Key features

### Assurance
- **Frameworks library**: 25 standards, regulations and frameworks, including ISO/IEC 27001, 27002, 27005, 27701, 22301, 42001, 29100 and 30107-1; SOC 2; NIST CSF 2.0, SP 800-37 and SP 800-207; PCI DSS 4.0.1; GDPR; EU AI Act; DORA; NIS2; UAE PDPL and IA Standards; DIFC; SAMA CSF; SBP rules; PECA 2016; AML/CFT. Requirement-level scoring, N/A justification, gap-assessment export, and an "add a framework" flow with keyword-based control matching.
- **Controls and tests**: control library with owners, cross-framework mappings, attestation, exceptions with expiry and compensating controls, automated test results, Statement-of-Applicability export, and a framework-by-control matrix.
- **Evidence**: collection, review and acceptance with versioning, attachment validation and a request-deletion workflow.
- **Policies**: full lifecycle (draft, review, approved, published), version history, change log, named approvers, acknowledgement tracking.
- **Audits**: engagement pipeline, information requests (PBC), control testing, findings, auditor access windows and frozen populations.
- **Issues**: table and kanban views, severity, tasks, root cause, and verified closure for high-severity items.

### Risk
- **Risk register** (ISO/IEC 27005 style): inherent, current and residual scoring, heat maps, treatment actions, interested parties, governance views and snapshots.
- **Risk acceptance**: authority ladder by rating; residual score above 15 requires Board approval evidence (decision reference, date, body, minutes) verified by a second person.
- **Import wizard**: CSV or Excel, column mapping, scale conversion and a row-by-row preview. Hand-written parsers with size and zip-bomb limits.
- **People and devices, Access**: workforce and device posture, access inventory, access requests and recertification reviews.
- **AI governance**: model inventory, discovery, lifecycle, EU AI Act classification, impact assessments and guardrails.
- **Third parties**: vendor register, tiering, onboarding gate, certificates and waivers, findings, reassessment.

### Customer trust
- **Trust Center**: publish documents publicly or on request, manage access requests (with domain blocklist), activity history and a retrieval chatbot over verified answers.
- **Questionnaires and commitments**: answer library with verification, submit-for-review before sending, contractual commitments and incident clock.
- **External vendor assessment portal**: a standalone, token-style page with email verification, one-time code, second factor, evidence upload and clarification round.

### Reporting
- **Overview dashboard** with KPIs, trend, readiness ranking and a control-coverage heat map.
- **Board and executive pack**: printable HTML report generated client-side with escaped output.
- **Reports**: stored and scheduled packs, with external distribution subject to approval.

### Workspace and platform administration
- **Team and settings**: members, roles, invitations with expiry, review cycles, SLAs, approvers, credential policy.
- **Integrations, API and webhooks, custom tests, AI assistant** (draft-only answers, approval-gated agent actions, MCP access).
- **Audit logs**: tamper-evident workspace log, chain-integrity view, RoPA register, evidence export.
- **Platform admin console**: customers and usage, billing and invoices, exchange rates and tax, MFA resets, admin audit log, elevated access.

### Experience
- Light, dark and auto themes; collapsible sidebar with rail flyouts; command palette (`Ctrl/Cmd + K`); responsive down to phone width; keyboard-operable with focus-trapped dialogs and a skip link. WCAG 2.2 AA is the target.

## Security and segregation of duties

Selvara is built on the assumption that the people who operate a control must not be the people who approve it. The full contract is in [`front-end/docs/SOD_MATRIX.md`](front-end/docs/SOD_MATRIX.md). Highlights:

- **Four-eyes approvals** for risk acceptance above threshold, policy publication, access grants (two approvers for privileged access), MFA resets, role changes, vendor onboarding, AI classification, public Trust Center publishing, API keys with write scope, finance adjustments and rate overrides.
- **No standing privileged access.** Platform super admins have no workspace access, and every admin-console change needs an audited, time-boxed elevated session with a reason and ticket reference.
- **MFA reset to standard practice**: three identity checks, ticket, named second approver, 24-hour expiry; the requester can only withdraw.
- **Policy workflow**: owner-only edits, new version for every change, approver is never the author, approved versions are immutable, emergency changes need retrospective approval.
- **Credential policy aligned to OWASP ASVS 2.1 and NIST SP 800-63B**: 12 to 128 characters, no composition rules, Unicode and passphrases accepted, breached and common-password rejection, no forced rotation or history rules, no SMS or voice MFA.
- **Secure by construction**: no HTML built from strings, safe-link and upload helpers, CSV formula-injection guard, strict webhook URL validation (SSRF hygiene), strict response headers including a Content-Security-Policy, hash-chained audit logs.

> **Important:** rules are enforced in the front-end service layer and mirrored in the UI so they can be demonstrated and tested, but a browser is never a trust boundary. A production deployment must enforce every rule again on the server. The remaining backend requirements and the test log are in [`front-end/docs/SECURITY.md`](front-end/docs/SECURITY.md).

## Roles and access model

Twelve demo personas cover nine roles. Second personas exist so that dual control can be demonstrated end to end.

| Role | Space | Typical access |
|---|---|---|
| Platform Super Admin (x2) | Admin console | Customers, billing, rates, MFA resets, admin log, elevated access (no workspace content) |
| Platform Support | Admin console | Customers, billing, rates, MFA reset requests, admin log (read-focused) |
| Company Admin (x2) | Workspace | All workspace modules |
| Control, Policy and Risk Owner (x2) | Workspace | Assurance, risk, vendors, trust, questionnaires, commitments |
| Risk Analyst | Workspace | Risk, issues, controls, work |
| Employee | Workspace | Overview, my workspace, policies (read and acknowledge), access, questionnaires |
| External Auditor | Workspace | Audits, controls, evidence, policies, frameworks (read-only) |
| Vendor Contact, Trust Center Visitor | Workspace (restricted) | Questionnaires and Trust Center only |

Use the account menu (top right) to switch persona. Role switching is a demonstration stand-in for real authentication.

## Screens at a glance

| Area | Routes |
|---|---|
| Overview | `/ws/overview`, `/ws/me`, `/ws/work`, `/ws/reports` |
| Assurance | `/ws/frameworks`, `/ws/controls`, `/ws/evidence`, `/ws/policies`, `/ws/audits`, `/ws/issues` |
| Internal risk | `/ws/people`, `/ws/access`, `/ws/risk`, `/ws/ai` |
| External risk | `/ws/vendors` |
| Customer trust | `/ws/trust`, `/ws/questionnaires`, `/ws/commitments` |
| Workspace | `/ws/integrations`, `/ws/api`, `/ws/assistant`, `/ws/team`, `/ws/billingws`, `/ws/auditlog`, `/ws/appsec` |
| Platform admin | `/admin/customers`, `/admin/billing`, `/admin/rates`, `/admin/mfa`, `/admin/adminlog`, `/admin/elevation`, `/admin/security` |
| Standalone | `/auth` (sign-in and security gallery), `/vendor-portal` (external vendor assessment) |

## Tech stack

- **Framework:** Next.js 16 (Pages Router) and React 19, TypeScript
- **Styling:** the original design tokens and component CSS, with Tailwind CSS for layout utilities
- **State:** small external stores (React `useSyncExternalStore`); no state-management dependency
- **Data:** synthetic seed data in memory; service layer with API stubs ready for a real backend
- **Dependencies:** intentionally minimal (no UI kit, no spreadsheet or charting libraries); `npm audit` reports no vulnerabilities in production dependencies at the time of writing
- **Browsers:** last two versions of Chrome, Edge, Firefox, Safari and iOS Safari

## Getting started

Requirements: **Node.js 20.9 or newer** (developed on Node 22) and npm.

```bash
git clone https://github.com/ShahidCS/Selvara.git
cd Selvara/front-end
npm install
npm run dev
```

Open <http://localhost:3000>. You land on the persona's home screen (the default persona is a platform super admin, so you start in the admin console; switch to **Company Admin** to explore the workspace).

Other commands:

```bash
npm run typecheck   # tsc --noEmit
npm run build       # production build
npm start           # serve the production build
```

### Try the dual-control flows

1. Switch to **Platform Super Admin**, open **Admin > Elevated Access**, request elevation (reason of at least 15 characters and a ticket such as `OPS-1234`).
2. Open **Admin > MFA Resets** and approve the seeded request. Then switch to **Platform Support** and note that Approve is disabled for them.
3. As **Company Admin**, open **Risk**, record an acceptance with residual score above 15, and note the Board-evidence requirement and the second-person verification.

## Configuration

Copy `front-end/.env.example` to `front-end/.env.local`. There are no secrets in this repository and none are needed to run it.

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_MODE` | `mock` | `mock` serves seeded synthetic data; `http` calls a real API |
| `NEXT_PUBLIC_API_BASE_URL` | empty | Base URL of the GRC API (used only in `http` mode; also added to the CSP `connect-src`) |

## Repository layout

```
Selvara/
├── README.md                 this file
└── front-end/                Next.js application
    ├── src/
    │   ├── pages/            routes: /ws, /admin, /auth, /vendor-portal
    │   ├── components/       shell (layout, dialogs), ui primitives, one module per screen
    │   ├── lib/              stores, RBAC, segregation-of-duties and approvals engine, scoring, audit chains
    │   ├── services/         API stubs and business rules (deny by default)
    │   ├── data/             synthetic seed data
    │   ├── hooks/ styles/ assets/
    ├── docs/                 inventory, checklists, security contract, decisions
    └── scripts/              developer tools for preparing seed data
```

## Documentation

| Document | Contents |
|---|---|
| [`front-end/README.md`](front-end/README.md) | Front-end setup and structure in detail |
| [`front-end/docs/SOD_MATRIX.md`](front-end/docs/SOD_MATRIX.md) | Segregation-of-duties, privileged-access and credential-policy contract |
| [`front-end/docs/SECURITY.md`](front-end/docs/SECURITY.md) | Controls in place, known limitations, backend requirements, test log |
| [`front-end/docs/DECISIONS.md`](front-end/docs/DECISIONS.md) | Decisions taken and decisions still open |
| [`front-end/docs/CHECKLIST.md`](front-end/docs/CHECKLIST.md) | Feature-to-component map with a per-module checklist in `docs/checklist/` |
| [`front-end/docs/SPEC_BOARDS.md`](front-end/docs/SPEC_BOARDS.md) | Comparison of the design boards with the implemented product |
| [`front-end/docs/PORTING_GUIDE.md`](front-end/docs/PORTING_GUIDE.md) | Conventions used to build and secure each module |

## Project status

| Area | State |
|---|---|
| Front-end (all screens, roles, workflows) | Complete |
| Segregation of duties, privileged-access gating, credential policy | Implemented in the front-end service layer |
| Backend (API, database, authentication, sessions) | **Not built** |
| Automated test suite and CI | **Not yet added** (manual and scripted browser checks are recorded in `docs/SECURITY.md`) |
| Production readiness | **Not production-ready** |

What a production deployment still needs (details in `docs/SECURITY.md`):

- Authentication, sessions, CSRF protection and server-side authorization with tenant isolation
- Stable user identifiers for segregation-of-duties checks (the demo compares display names)
- Server-side persistence of approvals, elevation records and audit logs (append-only, signed)
- Real MFA enrolment and recovery codes, rate limiting, upload scanning, signed expiring links
- A nonce-based Content-Security-Policy (the Pages Router currently needs `'unsafe-inline'` for scripts)

> **Compliance notice:** framework mappings, requirement titles, scoring and generated reports are **draft content**. Requirement titles are paraphrased; licensed standard text is not reproduced. Outputs must be reviewed by qualified compliance, legal and risk personnel before reliance, filing or distribution. All generated code, configuration and security controls need technical, security and management review before deployment.

All data in this repository is **synthetic**. Names, customers, vendors, addresses and figures are fictional.

## Contributing

Contributions are welcome once the project's governance is settled. Until then:

1. Read [`front-end/docs/PORTING_GUIDE.md`](front-end/docs/PORTING_GUIDE.md) and [`front-end/docs/SOD_MATRIX.md`](front-end/docs/SOD_MATRIX.md) first. New mutations must call the service layer (deny by default), write an audit entry and follow the secure-coding rules.
2. Run `npm run typecheck` and `npm run build` before opening a pull request.
3. Never commit secrets, real personal data or customer information. Use synthetic data only.

## Security reporting

Please do not open public issues for suspected vulnerabilities. A dedicated reporting channel has not been set up yet; until it is, contact the repository owner privately.

## License

No license has been selected yet. Until one is added, all rights are reserved by the repository owner and the code may not be reused.
