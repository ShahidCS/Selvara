# Selvara

**A governance, risk and compliance (GRC) platform for regulated organisations.** One control set, mapped to every framework you answer to, with the evidence, approvals and audit trail that auditors and regulators expect.

[![Security](https://github.com/ShahidCS/Selvara/actions/workflows/security.yml/badge.svg?branch=main)](https://github.com/ShahidCS/Selvara/actions/workflows/security.yml)
[![Deploy staging](https://github.com/ShahidCS/Selvara/actions/workflows/deploy-staging.yml/badge.svg?branch=main)](https://github.com/ShahidCS/Selvara/actions/workflows/deploy-staging.yml)
![Licence: proprietary](https://img.shields.io/badge/licence-proprietary%20(all%20rights%20reserved)-lightgrey)
![Node 20.9+](https://img.shields.io/badge/node-%E2%89%A520.9-339933)
![Status: front-end complete, backend pending](https://img.shields.io/badge/status-front--end%20complete%2C%20backend%20pending-orange)

> **Status: front-end complete, backend not yet built.** The web application is fully built in React / Next.js and runs on synthetic in-memory data. There is no server, database or real authentication yet. See [Project status](#project-status).

![Selvara overview dashboard](docs/screenshots/01-overview.png)

---

## Table of contents

- [Overview](#overview)
- [Who it is for](#who-it-is-for)
- [Screenshots](#screenshots)
- [Key features](#key-features)
- [Standards, regulations and frameworks covered](#standards-regulations-and-frameworks-covered)
- [Security and segregation of duties](#security-and-segregation-of-duties)
- [Roles and access model](#roles-and-access-model)
- [Screens at a glance](#screens-at-a-glance)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Testing and CI](#testing-and-ci)
- [CI/CD pipeline](#cicd-pipeline)
- [Repository layout](#repository-layout)
- [Documentation](#documentation)
- [Project status](#project-status)
- [Roadmap](#roadmap)
- [Maintainers](#maintainers)
- [Contributing](#contributing)
- [Security reporting](#security-reporting)
- [Licence](#licence)

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

## Screenshots

All screenshots use synthetic data.

| | |
|---|---|
| ![Frameworks](docs/screenshots/02-frameworks.png) **Frameworks:** requirement-level readiness for ISO/IEC 27001, with groups, status filters and gap export | ![Risk register](docs/screenshots/03-risk-register.png) **Risk register:** inherent, current and residual scoring with treatment and acceptance workflow |
| ![Audit engagement](docs/screenshots/04-audit-engagement.png) **Audits:** engagement pipeline, requests, findings and auditor access controls | ![Trust Center](docs/screenshots/05-trust-center.png) **Trust Center:** public and on-request resources, access requests and activity |
| ![Policies](docs/screenshots/06-policies.png) **Policies:** lifecycle, versions and named approvers | ![MFA resets](docs/screenshots/07-admin-mfa-four-eyes.png) **Four-eyes MFA resets:** approval is disabled until the approver has an elevated session |
| ![Dark theme](docs/screenshots/08-overview-dark.png) **Dark theme** (light, dark and auto are supported) | ![Vendor portal](docs/screenshots/09-vendor-portal.png) **External vendor assessment portal:** standalone, verified entry |

## Key features

### Assurance
- **Frameworks library**: 25 catalogue entries (see the [coverage table](#standards-regulations-and-frameworks-covered)). Requirement-level scoring, N/A justification, gap-assessment export, and an "add a framework" flow with keyword-based control matching.
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

## Standards, regulations and frameworks covered

Selvara ships a catalogue of **25 standards, regulations and frameworks** with roughly **1,200 modelled requirements** and a shared control library mapped across them. "Covered" means: a catalogue entry, requirement-level scoring from the status of mapped controls, control mapping, N/A justification and a gap export. It does **not** mean certification, a regulator's acceptance, legal advice, or a substitute for the text of the standard or law.

Status below was researched on **2026-11-08**. Several items changed recently, so check the official text before relying on a date.

### International standards

| Catalogue entry | Issuer | Edition tracked or current | Requirements modelled |
|---|---|---|---|
| ISO/IEC 27001:2022 (ISMS) | ISO/IEC | 2022, Amendment 1:2024 (climate action) | 123 |
| ISO/IEC 27002:2022 (security controls) | ISO/IEC | 2022 | 93 |
| ISO/IEC 27701 (privacy information management) | ISO/IEC | 2025 edition is current: standalone, replaces 2019 | 8 |
| ISO 22301 (business continuity) | ISO | 2019, Amendment 1:2024 | 6 |
| ISO/IEC 27005 (information security risk) | ISO/IEC | 2022 | 6 |
| ISO/IEC 42001 (AI management system) | ISO/IEC | 2023 | 70 |
| ISO/IEC 29100 (privacy framework) | ISO/IEC | 2024 edition is current | 24 |
| ISO/IEC 30107-1 (biometric presentation attack detection) | ISO/IEC | 2023 | 12 |
| PCI DSS v4.0.1 | PCI Security Standards Council | v4.0.1 is the only active version; future-dated requirements mandatory since 31 Mar 2025 | 10 |

### European Union

| Catalogue entry | Instrument | Notes | Requirements modelled |
|---|---|---|---|
| GDPR | Regulation (EU) 2016/679 | Proposed "Digital Omnibus" changes are not adopted | 12 |
| EU AI Act | Regulation (EU) 2024/1689, amended by (EU) 2026/1744 | High-risk obligations moved to 2 Dec 2027 (Annex III) and 2 Aug 2028 (Annex I) | 10 |
| DORA | Regulation (EU) 2022/2554 | Applies since 17 Jan 2025 | 289 |
| NIS2 | Directive (EU) 2022/2555 | National transposition varies | 52 |

### Middle East and South Asia

| Catalogue entry | Issuer | Notes | Requirements modelled |
|---|---|---|---|
| UAE PDPL | UAE federal (Federal Decree-Law 45 of 2021) | Executive regulations status unclear in sources | 8 |
| DIFC Data Protection Law | DIFC (Law No. 5 of 2020) | Applies in the DIFC, not UAE mainland | 7 |
| UAE Information Assurance Standards | UAE federal authorities | Issuer and current version need confirmation | 188 |
| SAMA Cyber Security Framework | SAMA (Saudi Central Bank) | Version 1.0 (2017); catalogue is a subset | 8 |
| SBP Enterprise Technology Governance and Risk Management Framework | State Bank of Pakistan | BPRD Circular 05/2017 | 60 |
| SBP AML/CFT/CPF Regulations | State Bank of Pakistan | BPRD Circular 05/2020 as amended | 7 |
| PECA 2016 | Government of Pakistan | Cybercrime statute, amended 2025 | 46 |

### United States frameworks

| Catalogue entry | Issuer | Edition tracked or current | Requirements modelled |
|---|---|---|---|
| SOC 2 | AICPA | 2017 Trust Services Criteria (revised points of focus 2022) | 11 |
| NIST CSF 2.0 | NIST | February 2024 | 106 |
| NIST SP 800-207 Zero Trust Architecture | NIST | August 2020 | 35 |
| NIST SP 800-37 Risk Management Framework | NIST | Revision 2 | 47 |

### Financial crime

| Catalogue entry | Notes | Requirements modelled |
|---|---|---|
| AML/CFT and sanctions | Composite of screening and monitoring requirements; the closest official reference is the FATF Recommendations | 7 |

**Add your own.** The "Add a regulation, standard or guideline" flow loads templates (NIS2, CIS Controls v8.1, HIPAA Security Rule, SAMA CSF) or pasted requirements and matches each line to control domains by keyword. These are starting points, not full catalogues.

**Be aware of uneven depth.** The requirement count shows how much of a framework is modelled, not how much of it exists. DORA (289), UAE IA (188) and ISO/IEC 27001 (123) are modelled in depth, while ISO 22301 (6), ISO/IEC 27701 (8) and SOC 2 (11) are summaries. Requirement titles are paraphrased (licensed standard text is not reproduced) and control mappings are draft content that needs review by qualified compliance staff.

Per-framework detail, official issuers, status notes, sources, naming accuracy and frameworks not yet covered are in [`docs/architecture/FRAMEWORKS.md`](docs/architecture/FRAMEWORKS.md). Most sources there are secondary (law-firm and certification-body pages), so it marks what is not verified.

## Security and segregation of duties

Selvara is built on the assumption that the people who operate a control must not be the people who approve it. The full contract is in [`docs/security/SOD_MATRIX.md`](docs/security/SOD_MATRIX.md). Highlights:

- **Four-eyes approvals** for risk acceptance above threshold, policy publication, access grants (two approvers for privileged access), MFA resets, role changes, vendor onboarding, AI classification, public Trust Center publishing, API keys with write scope, finance adjustments and rate overrides.
- **No standing privileged access.** Platform super admins have no workspace access, and every admin-console change needs an audited, time-boxed elevated session with a reason and ticket reference.
- **MFA reset to standard practice**: three identity checks, ticket, named second approver, 24-hour expiry; the requester can only withdraw.
- **Policy workflow**: owner-only edits, new version for every change, approver is never the author, approved versions are immutable, emergency changes need retrospective approval.
- **Credential policy aligned to OWASP ASVS 2.1 and NIST SP 800-63B**: 12 to 128 characters, no composition rules, Unicode and passphrases accepted, breached and common-password rejection, no forced rotation or history rules, no SMS or voice MFA.
- **Secure by construction**: no HTML built from strings, safe-link and upload helpers, CSV formula-injection guard, strict webhook URL validation (SSRF hygiene), strict response headers including a Content-Security-Policy, hash-chained audit logs.

> **Important:** rules are enforced in the front-end service layer and mirrored in the UI so they can be demonstrated and tested, but a browser is never a trust boundary. A production deployment must enforce every rule again on the server. The remaining backend requirements and the test log are in [`docs/security/SECURITY.md`](docs/security/SECURITY.md).

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

### Signing in (demo accounts)

The app opens on a sign-in page. There is no role switcher: sign out from the account menu (top right) and sign in as another persona.

**Two kinds of account, kept apart.**
- **Real accounts** are created through **Request to join** and approved by a company admin. They have their own password and an authenticator app (TOTP), added at the first sign-in and required every time, plus 10 single-use recovery codes.
- **Demo accounts** (below) exist only in the demonstration build, where there is no backend and the browser runs the checks (`front-end/src/lib/session.ts`). They are limited: labelled as demo, sessions end after one hour, the second step shows its code on screen, and the shared password cannot be changed or reset.

A production build (`NEXT_PUBLIC_API_MODE=http`) has no demo accounts: sign-in, MFA, reset and sessions go to the server (contract in [docs/security/CONTROLS.md](docs/security/CONTROLS.md)), which must enforce every rule. Nothing in the demonstration build is an authentication control.

Every demo account uses the password `selvara-demo`.

| Persona | Role | Email |
|---|---|---|
| Dana Whitfield | Platform Super Admin | `dana.whitfield@demo.selvara.test` |
| Riley Quinn | Platform Super Admin | `riley.quinn@demo.selvara.test` |
| Sam Hayes | Platform Support | `sam.hayes@demo.selvara.test` |
| Jordan Avery | Company Admin | `jordan.avery@demo.selvara.test` |
| Casey Morgan | Company Admin | `casey.morgan@demo.selvara.test` |
| Owen Hart | Control, Policy and Risk Owner | `owen.hart@demo.selvara.test` |
| Taylor Reed | Control, Policy and Risk Owner | `taylor.reed@demo.selvara.test` |
| Priya Nair | Employee | `priya.nair@demo.selvara.test` |
| Morgan Blake | External Auditor | `morgan.blake@demo.selvara.test` |
| Sam Lee | Risk Analyst | `sam.lee@demo.selvara.test` |
| Grace Lin | Vendor Contact | `grace.lin@demo.selvara.test` |
| Lee Park | Trust Center Visitor | `lee.park@demo.selvara.test` |

**Request to join.** Anyone can ask to join from the sign-in page with a name, work email and a password that meets the policy. The request waits until a company admin approves it (Team, Members, "Requests to join", with a reason, audited); the person then signs in as an Employee under their own name. Requests are kept in this browser only. The answer to a request never says whether an email is already known, sign-in errors are generic, and five failures lock that email for five minutes. Ten failures from one network address within 15 minutes block that address for every account, for longer each time (5 minutes, 30 minutes, 2 hours, 24 hours, then permanently); only an elevated platform super admin can lift a block (Admin Console, Platform security). In this demo the address is a synthetic one per browser; if you block your own browser, sign in from another browser or clear this site's data.

After 3 failures a short "Quick check" (a proof-of-work calculation in the browser) comes before the next try. **Forgot password?** (real accounts) shows, in a box marked demo, the link the email would carry; the reset also needs the authenticator or a recovery code. **Sign-in & security** (account menu) opens **Your account**: last sign-in, active sessions with Sign out other sessions, change password, new recovery codes (password confirmed first) and security activity. Company admins set the account lockout (Standard, Strict, PCI DSS v4) and trusted office networks in Team, Review cycles & SLAs.

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

- **Exact versions of everything:** [docs/architecture/STACK.md](docs/architecture/STACK.md), generated from `package.json`, the lockfile and the CI config
- **Framework:** Next.js 16 (Pages Router) and React 19, TypeScript
- **Styling:** the original design tokens and component CSS (kept verbatim), with Tailwind CSS 4 for utilities only (no reset; the legacy CSS sits in a lower cascade layer so a utility beats a legacy class)
- **State:** small external stores (React `useSyncExternalStore`); no state-management dependency
- **Data:** synthetic seed data in memory; service layer with API stubs ready for a real backend
- **Testing:** Vitest (unit) and Playwright (end to end)
- **Dependencies:** intentionally minimal (no UI kit, no spreadsheet or charting libraries); production dependencies are checked with `npm audit` in CI
- **Browsers:** last two versions of Chrome, Edge, Firefox, Safari and iOS Safari

## Getting started

Requirements: **Node.js 20.9 or newer** (developed on Node 22) and npm.

```bash
git clone https://github.com/ShahidCS/Selvara.git
cd Selvara/front-end
npm install
npm run dev
```

Open <http://localhost:3000> and sign in with a demo account (see [Signing in](#signing-in-demo-accounts)). `jordan.avery@demo.selvara.test` (Company Admin) is a good start for the workspace; `dana.whitfield@demo.selvara.test` opens the admin console.

Other commands:

```bash
npm run typecheck   # tsc --noEmit
npm run build       # production build
npm start           # serve the production build
npm test            # unit tests (Vitest)
npm run test:e2e    # end-to-end tests (Playwright)
npm run ci          # typecheck, unit tests, build (lint runs separately: npm run lint)
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

## Testing and CI

- **Unit tests (Vitest)** cover the security helpers, the credential policy, segregation-of-duties and approvals engine, the risk Board-evidence rules (including the 15 / 16 boundary), framework scoring and output encoding.
- **End-to-end tests (Playwright)** cover every route, the full persona-by-route access matrix, privileged-access gating, read-only roles, the password policy, injection resistance and the vendor portal.
- **CI** (GitHub Actions) runs type-check, lint, unit tests, build, `npm audit` on production dependencies, and the end-to-end suite on every push and pull request. Dependabot proposes weekly grouped updates.

Details, including what is not covered (backend, visual regression, load), are in [`docs/guides/TESTING.md`](docs/guides/TESTING.md).

## CI/CD pipeline

Every change reaches production only through GitHub Actions, and every release leaves verifiable evidence.

- **Pull requests** run type-check, lint, unit and end-to-end tests, a dependency audit, CodeQL static analysis, secret scanning, a runtime dependency audit, licence policy, a Trivy scan and a ZAP baseline scan. High and Critical findings block the merge.
- **Merges to `main`** re-run every gate, then deploy to **staging** (Vercel, deployed only from Actions; Vercel's own Git deploys are disabled).
- **Production releases** come from a **signed version tag** on `main`. The tag is verified, the gates run again, and the deployment waits for approval in a protected environment before it ships.
- **Evidence:** every build produces a CycloneDX SBOM and a SHA-256 checksum, and the deployed bytes are extracted from that exact checksum-verified archive. Build-provenance attestations are supported and switch on automatically where the GitHub plan allows them (currently off for this private repository); an optional keyless Sigstore signature is off by default.
- **The pipeline protects itself:** every action is pinned to a full commit SHA, workflow permissions are least-privilege, install scripts never run in CI, and a policy check fails the build if a workflow breaks these rules.

Setup, release steps, how to verify an artefact, accepted risks and what is not yet proven are in [`docs/security/PIPELINE.md`](docs/security/PIPELINE.md).

## Repository layout

```
Selvara/
├── README.md                 this file
├── LICENSE                   proprietary, all rights reserved
├── SECURITY.md               vulnerability reporting policy
├── .github/                  workflows, pipeline scripts, rulesets, CODEOWNERS, Dependabot configuration
├── docs/                     architecture/, guides/, security/ documentation and README screenshots (see docs/ORGANIZATION.md)
└── front-end/                Next.js application
    ├── src/
    │   ├── pages/            routes: /ws, /admin, /auth, /vendor-portal
    │   ├── components/       shell (layout, dialogs), ui primitives, one module per screen
    │   ├── lib/              stores, RBAC, segregation-of-duties and approvals engine, scoring, audit chains
    │   ├── services/         API stubs and business rules (deny by default)
    │   ├── data/             synthetic seed data
    │   ├── hooks/ styles/ assets/
    ├── tests/ e2e/           unit and end-to-end tests
    └── scripts/              developer tools for preparing seed data
```

## Documentation

| Document | Contents |
|---|---|
| [`front-end/README.md`](front-end/README.md) | Front-end setup and structure in detail |
| [`docs/architecture/FRAMEWORKS.md`](docs/architecture/FRAMEWORKS.md) | Researched reference for every framework, regulation and standard covered |
| [`docs/security/SOD_MATRIX.md`](docs/security/SOD_MATRIX.md) | Segregation-of-duties, privileged-access and credential-policy contract |
| [`docs/security/SECURITY.md`](docs/security/SECURITY.md) | Controls in place, known limitations, backend requirements, test log |
| [`docs/security/PIPELINE.md`](docs/security/PIPELINE.md) | CI/CD pipeline: gates, deployment, release, supply-chain controls, accepted risks |
| [`docs/guides/TESTING.md`](docs/guides/TESTING.md) | Test strategy, how to run it, CI, gaps |
| [`docs/architecture/DECISIONS.md`](docs/architecture/DECISIONS.md) | Decisions taken and decisions still open |
| [`docs/guides/CHECKLIST.md`](docs/guides/CHECKLIST.md) | Feature-to-component map with a per-module checklist in `docs/guides/checklist/` |
| [`docs/architecture/SPEC_BOARDS.md`](docs/architecture/SPEC_BOARDS.md) | Comparison of the design boards with the implemented product |
| [`docs/architecture/PORTING_GUIDE.md`](docs/architecture/PORTING_GUIDE.md) | Conventions used to build and secure each module |

## Project status

| Area | State |
|---|---|
| Front-end (all screens, roles, workflows) | Complete |
| Segregation of duties, privileged-access gating, credential policy | Implemented in the front-end service layer |
| Automated tests and CI/CD | Unit and end-to-end suites; security gates; Vercel deployment pipeline (needs your Vercel secrets and repository settings before first use) |
| Backend (API, database, authentication, sessions) | **Not built** |
| Production readiness | **Not production-ready** |

What a production deployment still needs (details in `docs/security/SECURITY.md`):

- Authentication, sessions, CSRF protection and server-side authorization with tenant isolation
- Stable user identifiers for segregation-of-duties checks (the demo compares display names)
- Server-side persistence of approvals, elevation records and audit logs (append-only, signed)
- Real MFA enrolment and recovery codes, rate limiting, upload scanning, signed expiring links
- A nonce-based Content-Security-Policy (the Pages Router currently needs `'unsafe-inline'` for scripts)

> **Compliance notice:** framework mappings, requirement titles, scoring and generated reports are **draft content**. Requirement titles are paraphrased; licensed standard text is not reproduced. Outputs must be reviewed by qualified compliance, legal and risk personnel before reliance, filing or distribution. All generated code, configuration and security controls need technical, security and management review before deployment.

All data in this repository is **synthetic**. Names, customers, vendors, addresses and figures are fictional.

## Roadmap

Planned work, in rough priority order. This is a direction, not a commitment, and carries no dates.

1. **Backend foundation:** API, database, authentication (sessions, MFA and passkeys), server-side authorization and tenant isolation.
2. **Server-side enforcement of the rules the front-end already models:** segregation of duties by stable user id, persisted approvals and elevation records, append-only signed audit storage.
3. **Production hardening:** nonce-based CSP, rate limiting, upload scanning, signed expiring links, server-generated recovery codes.
4. **Product depth:** deepen the shallow framework catalogues (for example ISO 22301, ISO/IEC 27701, SOC 2, SAMA CSF), resolve the open items in [`docs/architecture/DECISIONS.md`](docs/architecture/DECISIONS.md), and port the remaining policy-library and third-party-risk improvements described in [`docs/architecture/SPEC_BOARDS.md`](docs/architecture/SPEC_BOARDS.md).
5. **Engineering quality:** TypeScript strict mode, lint configuration, automated accessibility checks, visual regression tests.

## Maintainers

- Owner and maintainer: [@ShahidCS](https://github.com/ShahidCS)

## Contributing

Selvara is proprietary software (see [Licence](#licence)). Contributions are accepted from contributors authorised by the owner, under the terms agreed with them. If you have been invited to contribute:

1. Read [`docs/architecture/PORTING_GUIDE.md`](docs/architecture/PORTING_GUIDE.md) and [`docs/security/SOD_MATRIX.md`](docs/security/SOD_MATRIX.md) first. New mutations must call the service layer (deny by default), write an audit entry and follow the secure-coding rules.
2. Run `npm run ci` and `npm run test:e2e` in `front-end/` before opening a pull request.
3. Never commit secrets, real personal data or customer information. Use synthetic data only.

## Security reporting

Please do **not** open public issues for suspected vulnerabilities. Email **[security@selvara.com](mailto:security@selvara.com)**. The full policy is in [`SECURITY.md`](SECURITY.md).

## Licence

Copyright (c) 2026 Selvara. **All rights reserved.** This is proprietary software: it is not open source or free software, and no right to use, copy, modify, distribute or host it is granted except under a separate written agreement. See [`LICENSE`](LICENSE).
