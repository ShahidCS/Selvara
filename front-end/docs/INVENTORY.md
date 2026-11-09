# Front-end migration inventory (pre-coding)

Status: DRAFT for review. No React code has been written yet.
Sources: `Assurance-GRC-Portal.html` (A) and `GRC_Unified_Compliance_Dashboard.html` (B).

## 1. What the sources are

**A. Assurance GRC Portal** is a single-file vanilla-JS SPA: 4,308 lines, about 837 KB. It has hash routing, a role-based shell, in-memory seed data and no network calls. `localStorage` stores only `role`, `space`, `collapsed` and `theme`.

**B. GRC Unified Compliance Dashboard** is a design-board bundle. It is not an app. It holds 38 gzipped static HTML screens inside iframes on one canvas:
- 1 interactive "Assurance app, sign in as any role" (1.5 MB), titled "Assurance GRC App".
- 26 "Screen: ..." boards: Overview, My work, Reports, Frameworks, Controls and tests, Evidence, Policies, Audits, Issues, People and devices, Access, Risk register, AI governance, Third parties, Trust Center admin, Questionnaires, Commitments, Integrations, API/webhooks/custom tests, AI assistant, Team and settings, Billing and invoices, Audit logs, Auditor portal, Vendor portal, Public Trust Center, Provider console.
- 10 spec boards: Company admin GRC overview, Policy library and review workflow, Company admin team/settings/audit log, Member workspace (no admin rights), Third-party risk management, Risk register, Super admin SaaS provider console, Sign-in/password policy/MFA, Application security controls (build spec), Vendor assessment portal (external).

## 2. Routes (A, hash-based: `#/ws/<module>[/<param>]`, `#/admin/<module>`)

Workspace: overview, work, reports, frameworks, controls, evidence, policies, audits, issues, people, access, risk, ai, vendors, trust, questionnaires, commitments, integrations, api, assistant, team, billingws.

Admin: customers, billing, rates, mfa, adminlog. Auth/auditlog renderers also exist (`REND.auth`, `REND.auditlog`).

## 3. Shell and cross-cutting behaviour

- Sidebar with grouped accordions, a collapsed "rail" mode with portal-positioned tooltips and flyouts, and sub-navigation for modules that have tabs.
- Mobile off-canvas sidebar with a scrim.
- Space switcher (Workspace/Admin), shown only for roles with more than one space.
- Topbar: search, bell, theme (auto/light/dark), role switcher popover, and a scope selector (default "ISO 27001").
- 9 roles, each with its own module allow-list (`ROLE_MODS`) and landing hash.
- Theme tokens: light, dark, and auto via `prefers-color-scheme`. "Liquid glass" surfaces, with a `prefers-reduced-transparency` fallback.
- Responsive breakpoints: 420, 720, 760, 820 (x2), 860 and 920 px, plus `pointer:coarse`, `prefers-reduced-motion` (x2) and `print` (x3).
- 228 `toast()` call sites, 76 `openModal()`, 11 `openDrawer()`.
- Interaction details: icon set of about 60 coolicons (MIT), count badges on nav items, and focus/ARIA handling (`aria-current`, `aria-expanded`, roving `tabindex` in sub-nav).

## 4. Drawers and modals (A)

Drawers: ctrlDrawer, testDrawer, polDrawer, issDrawer, vendorDrawer, qDrawer, intDrawer, aiDrawer, pplDrawer.

Modals: 76 call sites, to be itemised one by one during the build.

Other flows:
- Risk detail lifecycle view.
- Scoring criteria.
- Interested parties.
- Governance.
- Add / Import / Export.
- **Import wizard**: Excel/CSV, then column mapping, then scale conversion, then row preview (about 1,000 lines, 2792-3773).
- **Admin console**: customers, billing, exchange rates and tax, MFA resets with four-eyes approval, and an immutable admin audit log (3774-4291).

## 5. Data (A, in-memory `DATA`)

Collections: frameworks, controls, tests (6 automated), evidence, policies, audits, auditStages, issues, findings, pbc, people, access, risks, ai, vendors, trust, questionnaires, commitments, reports, kpis, invoices.

Also: `FRAMEWORK_REQS` (a very large per-framework requirement catalogue), the ISO 27001:2022 Annex A catalogue (93 controls), and cross-framework control mappings.

## 6. Gaps and decisions needed (please answer)

1. **Scope.** Is A the product to migrate, with B's boards serving as the visual spec? B's interactive app (b63a782c) looks like an earlier or parallel build of A. B's other 37 boards are static. The 10 spec boards (provider console, vendor assessment portal, sign-in/MFA, app-sec build spec) contain screens that may not exist in A.
2. **Size and phasing.** A faithful port of about 25 modules, the import wizard and the admin console is a multi-day build. It is not one commit. Can I deliver in phases, each pushed and checked against the checklist?
   - Phase 1: shell, tokens, theme, roles and routing, then Overview and Frameworks.
   - Phase 2: Assurance modules.
   - Phase 3: Risk, Vendors and Trust.
   - Phase 4: Admin console and import wizard.
3. **Constraints** were left as a template placeholder. My proposed defaults:
   - **API:** `NEXT_PUBLIC_API_BASE_URL` is read from env, with typed service stubs returning mock data. Nothing is fetched today.
   - **Auth:** no real auth. The role switcher is kept as a demo-only stub behind a clear interface.
   - **Browsers:** last 2 versions of evergreen Chrome, Edge, Firefox and Safari.
   - **Accessibility:** WCAG 2.2 AA.
   - **Secrets:** none in the repo, with a committed `.env.example` only.
   - OK, or different?
4. **Styling.** You asked for Tailwind plus CSS. I plan to keep the original design tokens as CSS variables in `src/styles`, and use Tailwind for layout and utilities mapped to those tokens. This keeps pixel fidelity.
5. **Routing.** You listed `src/pages`. Do you want the Pages Router (matches your layout) or the App Router (current Next default)? Hash routes become real paths, for example `/ws/risk`.
6. **Seed data and org policy.** The seed data contains what look like real names (personal names of staff) and tenant and vendor names. Under your org's data-handling rule I will replace them with synthetic placeholders (John Doe style) unless you confirm the data is already synthetic.
7. **Branch.** You asked for a "front-end" branch or folder. This session is pinned to `claude/ecstatic-knuth-xymoyc`, so I will put everything in a `front-end/` folder on that branch. Is that fine, or should I push a separate `front-end` branch?
8. **Fonts.** The source uses SF Pro (system fallback) and Inter (Google Fonts). B bundles Geist. Which should ship? Self-hosting Inter via `next/font` is my default.
9. **Checklist.** Each phase will extend `front-end/docs/CHECKLIST.md`, mapping each source feature to its React component.
