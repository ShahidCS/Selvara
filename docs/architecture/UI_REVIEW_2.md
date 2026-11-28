# Second UI design review (v0.4.2, 28 November 2026)

This is an end-to-end review of every module, screen and process in the shipped portal (v0.4.2). It covers steps and wizards, tables, input forms, dropdowns, buttons, KPI cards, progress trackers and the controls mapping. Four lenses were applied:

- **Design critique:** first impression, usability, visual hierarchy, consistency and accessibility.
- **The 10 UI states:** empty, loading, error, no internet, slow network, no search results, permission denied, session expired, form validation and success.
- **UI/UX priorities:** accessibility, touch targets, layout, type and colour, forms, navigation and charts.
- **Visual identity:** where the interface reads as a template rather than a deliberate choice.

It builds on the first review ([UI_REVIEW.md](UI_REVIEW.md), v0.2, 279 findings). Items fixed there were not re-reported. Earlier items that are still open are cited by their old ID, and earlier fixes that have regressed are named as regressions.

## How it was reviewed
- **Build and roles.** The running demonstration build (synthetic data), as every persona that uses each screen: company admin, owner, analyst, employee, auditor, vendor, Trust Center visitor, platform super admin (two, for four-eyes) and platform support.
- **Sizes and themes.** 1280x900 in light and dark, and 390x844. Each screen was also checked at the browser's 200% text size, on a throttled network, offline, and with the session expiring mid-form.
- **Interactions.** Every tab, menu, dropdown, dialog, wizard step and form was opened. Forms were submitted empty and invalid. The main flows were driven by keyboard.
- **Code check.** Each finding was confirmed in the code and located by file and line.
- **Measurements.** axe (WCAG 2.2 AA and best-practice rules) ran on 48 screens and form pages in both themes. Target sizes and text sizes were measured on all of them, 144 page views in all.
- **Production-only screens.** Screens that exist only in the production build (for example Account erasure, Retention purge and Create a company) were reviewed from the code. Those findings say "(production, code only)".
- **Screenshots.** About 800 were taken during the review. The Evidence column in the logs names them. They are not committed (140 MB) and can be taken again from the scripts on request.

Each finding has a severity:
- 🔴 Critical: blocks a task, breaks the layout, is unreadable or is inaccessible.
- 🟡 Moderate: confusing, inconsistent or noticeable.
- 🟢 Minor: polish.

## Overall impression
Selvara reads as a calm, number-led compliance product. Several things are already handled carefully:
- Segregation of duties is explained in words at the moment it blocks you.
- Status never rests on colour alone.
- Contrast passes everywhere in both themes, at 5.9:1 or better.
- Keyboard models for menus, listboxes and dialogs follow the patterns.
- No screen scrolls sideways at 320px or 390px.
- With the browser's text size at 200%, labels wrap instead of being cut.

The biggest opportunity is not visual. It is the space between the happy path and real use:
- what a person sees while a page loads, when the network drops, or when a session ends;
- whether every count agrees;
- whether consequential actions show what they will do before they do it;
- whether tables at the most common laptop width show their status columns whole.

Most of the 20 critical findings come from five shared components, so fixing them once fixes many screens.

## Findings and status

| Group | Scope | Findings | 🔴 | 🟡 | 🟢 | Log |
|---|---|---|---|---|---|---|
| A | App shell, shared kit, sign-in, Your account, Help centre, guided tour, vendor portal, public Trust Center | 44 | 2 | 21 | 21 | [A](ui-review/v0.4/A.md) |
| B | Overview, My Work, Reports, Frameworks, Controls & Tests (incl. the cross-framework matrix and mapping), Evidence, Policies | 61 | 5 | 32 | 24 | [B](ui-review/v0.4/B.md) |
| C | Audits (incl. the stage tracker), Issues, People & Devices, Access, Risk Register (incl. the Import wizard), AI Governance, Assistant | 56 | 2 | 26 | 28 | [C](ui-review/v0.4/C.md) |
| D | Third parties, Trust Center, Questionnaires, Commitments, Integrations, API, Team & Rules, Billing, Audit logs, AppSec | 53 | 3 | 26 | 24 | [D](ui-review/v0.4/D.md) |
| E | Admin Console: Customers, Support questions, Billing, Exchange rates & tax, MFA resets, Audit logs, Elevated access, Platform security | 52 | 8 | 25 | 19 | [E](ui-review/v0.4/E.md) |
| **Total** | | **266** | **20** | **130** | **116** | |

By area:

| Area | Findings |
|---|---|
| Usability | 41 |
| Writing | 29 |
| Consistency | 28 |
| Accessibility | 26 |
| Responsive | 26 |
| Hierarchy | 23 |
| States | 21 |
| Data | 20 |
| Forms | 13 |
| Navigation, layout and visual identity | 12 |

**Still open from the first review and still visible:** A-27, A-32, C-34, C-41, C-45, C-51, F-6, F-25, F-32 (on 7 screens) and F-37.

**Earlier fixes that have regressed (9):**
- **B-1:** content capped on Overview.
- **B-11:** sidebar badge and greeting counts.
- **B-30:** "Not applicable" donut swatch.
- **C-40:** Add risk scores (now critical, C2-34).
- **D-6:** AI Governance discovered-AI names squeezed one word per line.
- **E-30:** empty band above the Team search.
- **E-38:** chain hashes off-screen.
- **F-18:** Customers Payment column clipped.
- **A-26:** sign-in previews.

These had no automated check, so they came back unnoticed. One recommendation below covers this.

## Critical findings (20)

| ID | Screen | What happens |
|---|---|---|
| A2-1, B2-57, D2-4, E2-8 | Every module | A module that has not loaded yet shows an empty page. With no network it stays blank for good, with no message or retry (`features/registry.ts`: `loading: () => null`, no error branch). Someone with the app open during a deploy sees the same. |
| A2-2 | Every form | When the session expires, the shell jumps to sign-in. Typed work is lost, the sign-in page does not say why, and after signing in the person lands on Overview, not where they were. |
| B2-2, C2-1, E2-3 | KPI strips | A tile's status badge never shrinks, so the label does: "C…", "CL…", "L". On a phone the label can disappear entirely. |
| B2-13 | My Work | "Open review", "Start" and "Acknowledge" mark the task completed instead of opening it, so a review is lost in one click. |
| B2-27, B2-35, E2-27, E2-31, D2-1 | Frameworks, Controls, Customers, Rates, every Settings register | At 1280 wide, tables cut status chips mid-word ("Needs eviden" on 118 of 141 controls, "Acti", "Held for r"). They also cut the control statement after about 20 characters and push the Actions column off-screen. |
| B2-40 | Record pages | At 200% text the Details card breaks words letter by letter, because the 340px side column keeps two columns. |
| C2-34 | Risk › Add risk | The four Likelihood and Impact dropdowns are empty, with a single "—". Every new risk saves with hidden default scores. Cause: `SelectList` does not expand option components. This is a regression of C-40. |
| D2-35 | API › Webhooks | Row actions overflow their column and cover the Status chip. |
| D2-39 | Team & Rules | Change role is off-screen at 1280, and its focus ring stays clipped when reached by keyboard. |
| E2-1 | Admin Console | Once elevated, nothing outside Elevated Access shows it. There is no chip, no countdown and no End button, and no warning before it expires. |
| E2-5 | Admin Console | A second approver is not told about four-eyes requests they can decide, and the bell lists one they cannot. |
| E2-28 | Admin › Billing › Pricing | A blank or negative price is saved as $0 with "Pricing updated". There is no field validation, reason or second approver. |
| E2-47 | Platform security › Account erasure | (production, code only) "Erase now" erases on one click, with no confirmation, for an irreversible erasure. |

## The root causes: fix once, apply everywhere

| # | Cause | Findings it explains | Recommended fix | Where |
|---|---|---|---|---|
| R1 | **Pages have no loading or failure state.** Modules load with an empty placeholder and no error branch. There is no offline handling, and the shared `Skeleton` is used once. | A2-1, B2-57, D2-4, E2-8. Loading ❌ on 42 screens, no internet ❌ on 37, slow network ❌ on 32 | Show a page skeleton (header and rows) while a module loads. Wrap modules in an error boundary: "This page didn't load. Check your connection and try again." with Retry. Add an offline banner that keeps what is on screen and says what still works. | `features/registry.ts`, `components/shell/AppShell.tsx`, `components/ui/Controls.tsx` |
| R2 | **The KPI label gives way to its badge.** | B2-2, C2-1, E2-3, A2-21 | Let the KPI header wrap at every size: the label keeps its width and the badge moves under it. The large-text rule already does this, so it would be applied at every size. Only tiles that are cut today change. | `styles/portal.css` `.kpi-head` |
| R3 | **Tables squeeze columns and cut chips mid-word.** Fixed column widths with a 70% floor, an ellipsis on chips, wide fixed Actions columns, a 232px Settings menu, and hand-built tables. | B2-27, B2-35, C2-2, D2-1, D2-35, D2-39, E2-27, E2-31, F-32, C-41 | Status chips never truncate: their column is at least one chip wide. The title or statement column takes the spare width. Two or more row actions fold into a "More actions" menu. The Settings menu becomes a top tab row below 1440px. Customers, Rates and the risk register move to `DataTable`. | `components/ui/DataTable.tsx`, `styles/portal.css` (`.tbl` chips, `.settings-*`), `features/customers`, `features/rates`, `features/risk` |
| R4 | **Session expiry discards work.** | A2-2; session expired ⚠️/❌ on 51 screens | Before signing out, keep open drafts in session storage. Explain on the sign-in page ("Your session ended after 60 minutes of inactivity. Sign in to continue."). Return to the same page after sign-in and restore the draft. | `components/shell/AppShell.tsx`, `features/auth/LoginPage.tsx`, `hooks/useUnsavedGuard.ts` |
| R5 | **One figure, several sources.** Hard-coded counts, a `|| 5` fallback, and risks normalised only when the Risk module renders. | A2-3, B2-1, B2-11, B2-15, C2-36 | Compute every count in one place: waiting approvals, tasks, above appetite, next audit, overdue. Normalise risks in the data layer. Remove hard-coded figures. | `lib/counts.ts`, `lib/approvalsWaiting.ts`, `lib/metrics.ts`, `features/overview` |
| R6 | **Defects in the form kit spread to every form.** The error icon sits on its own line above the message (41 forms). Some forms mark the wrong field invalid. `SelectList` ignores option components. Several forms accept empty or invalid input. | A2-22, B2-38, D2-2, D2-3, C2-34, E2-28, B2-23, B2-28, A2-24, A2-34 | Put the icon inline with the message in the shared error style. `SelectList` expands option components, with a unit test. Validate every required field next to the field, with the waiver form as the model. Ignore an empty second-step code rather than counting it as a failed attempt. | `components/ui/Controls.tsx`, `styles/portal.css` (form error), the forms named in the logs |
| R7 | **Consequential actions act at once, or without showing what is approved.** | B2-13, C2-35, C2-11, E2-47, D2-47, D2-22, D2-27, D2-28, B2-14, E (paid module, suspending the only admin) | One rule. An irreversible or compliance-relevant action confirms and says what happens. A reversible one offers Undo. An approval shows what is being approved: the questionnaire answers, the policy text before acknowledging. A task button opens the task. | `features/work/MyTasks.tsx`, `features/risk/RiskDetail.tsx`, `features/audits`, `features/platformsecurity/ApiErasures.tsx`, `features/billing`, `features/questionnaires`, `features/trust` |
| R8 | **Privilege and four-eyes are hard to see.** | E2-1, E2-2, E2-5 | Show an elevation chip in the top bar, with ticket, countdown and End, and warn 5 minutes before it expires. Notifications list only requests the viewer can decide. Support staff see no "Elevate" prompts they cannot use. | `components/kit/admin/ElevateGate.tsx`, `lib/notifications.ts` |
| R9 | **Colour meanings drift.** AI lavender appears on things that aren't AI: info banners, the approvals pill, read-only banners. Violet shows "closed". The board pack uses its own teal brand. | A2-4, A2-20, B2-12, B2-25, E (read-only banners) | Give info banners a neutral info colour. Give the approvals pill its own icon. Show closed in success green. Build the board pack from the same tokens. | `styles/portal.css` (`--info-*`, `.banner.info`), `components/shell/Topbar.tsx`, `features/overview/lib/boardPack.ts` |
| R10 | **The record side column is fixed at 340px.** | B2-40 | With large text or a narrow column, stack each label above its value. | `styles/portal.css` `.rec-grid`, `.meta-grid` |
| R11 | **Template signals pile up.** Uppercase tracked labels sit on almost every tier (breadcrumbs, page eyebrows, KPI labels, card kickers, list sections, sidebar groups), mostly at 11–11.5px. Structured facts are joined with middle dots. | A2-19, B2-60, B2-61. 26 kinds of text below 12px | Keep uppercase for one tier, KPI labels, and use sentence case elsewhere, with breadcrumbs in sentence case. Raise label text to at least 12px. Show structured facts (owner, version, approved) as labelled key–value pairs instead of "A · B · C". | `styles/portal.css` (`.eyebrow`, `.crumbs`, `.grp-title`), `components/shell` |
| R12 | **Fixes regress without tests, and accessibility checks stop at the first tab.** | 9 regressions; C2-37 (critical axe failure on the risk register rows, missed by the CI scan) | Add a geometry test for each fix, like `e2e/ui-regressions.spec.ts`: chips not cut, labels not squeezed, columns visible at 1280. Extend the CI accessibility scan to open every tab and the main dialogs. | `e2e/` |

## Measured checks (all screens)
- **axe, WCAG 2.2 AA and best practice.** No critical or serious violations on any screen's default view in either theme; CI already enforces this. Three issues remain on the default views:
  - **Moderate: heading levels skip** on 32 screens. Card titles are h3 directly under the page's h1.
  - **Moderate: two scroll regions on AppSec share one name**, "Table, scrollable".
  - **Minor: empty Actions column headers** on 10 screens.

  Opening the Register tab exposes a critical failure the CI scan does not reach: `<tr role="button" aria-selected>` on the risk register rows (C2-37).
- **Targets below WCAG 2.5.8's 24px:**
  - the table "Select all rows" checkbox (16px);
  - sort buttons (17px tall);
  - column resize handles (8px wide; they have a keyboard alternative);
  - the table search input (21px tall);
  - calendar markers (16px);
  - chart points.

  The breadcrumb company link is 17px tall and probably passes on the spacing exception.
- **Phones.** Most controls are 32–36px tall: top-bar buttons, buttons, selects, tabs and pagination. 44px is the recommended touch size; a phone density could raise them.
- **Text below 12px.** There are 26 kinds, in 10.5–11.5px uppercase: breadcrumbs, sidebar group titles, counts, keyboard hints, KPI labels, tags, settings section heads, phone tab labels and coverage headings.
- **Contrast.** Every text pair measured is at least 5.9:1 in both themes.
- **Maintainability.** There are 2,344 inline style objects in 206 component files. Colours go through tokens (2 hex literals), but spacing and layout are set inline. That is how several of the regressions above came back.

## UI states coverage (66 screens across the five groups)

| State | Designed | Partial | Missing | Not applicable | What is missing |
|---|---|---|---|---|---|
| Empty | 33 | 17 | 0 | 17 | Some say "Nothing in this view." without a reason or a next step |
| Loading | 3 | 10 | 42 | 12 | No skeletons; "Loading…" text in 18 places; a blank page before a module loads (R1) |
| Error | 22 | 38 | 0 | 7 | Mostly a toast, rarely next to the place it happened or with a retry |
| No internet | 0 | 17 | 37 | 13 | Not handled: no banner, no cached view, a blank page for modules not loaded yet (R1) |
| Slow network | 0 | 20 | 32 | 15 | No progress or lighter path; a blank page while a module loads (R1) |
| No search results | 3 | 25 | 1 | 38 | The query is echoed, but there are no suggestions or "Clear search"; the wording differs per table |
| Permission denied | 43 | 19 | 0 | 5 | Mostly explained; support staff are offered actions they cannot take (E) |
| Session expired | 3 | 42 | 9 | 13 | Work is lost and no reason is given (R4) |
| Form validation | 17 | 21 | 7 | 22 | The icon sits on its own line, the wrong field is marked, and some forms accept empty input (R6) |
| Success | 40 | 16 | 0 | 11 | Mostly clear; toasts disappear in 2.2 s where the design system says 7 s (A2-7) |

## What works well
- **Segregation of duties is explained where it blocks you.** For example "Only the control owner (O. Hart) can change the status", "you cannot approve your own request" and "Write-offs always need a second elevated super admin".
- **Status never rests on colour alone.** Tiers, scores, NDA states and chain status all pair an icon with a word.
- **Keyboard models are right.** Menus, listboxes (Change role, filter chips), dialogs and the drawer move focus, support the arrow keys and Home and End, close on Escape and return focus. `DataTable` announces sorting and the current page.
- **Charts say their numbers in text.** Donut legends carry counts, bar lists state the 80% target, and the line and bar charts have hidden data tables. Heat-map cells have full accessible names.
- **The controls mapping is navigable both ways.** A matrix cell opens a drawer of requirement IDs, and each requirement opens its framework page. The "Earlier edition" banner is exemplary regulatory copy.
- **Careful flows to copy.**
  - The Import wizard: auto-matched columns, a check step, held updates.
  - The waiver form: a refusal under each field, with focus moved to it.
  - Elevation request validation.
  - Incident mode.
  - The audit trail that records its own exports.
- **Large text and themes hold up.** Dark mode keeps its contrast everywhere. At 200% text, labels wrap and the phone tab bar keeps room. Nothing scrolls sideways at 320px or 390px.

## Recommended order of work
1. **Shared fixes for the critical findings (one change each):**
   - R1, the page loading and failure state;
   - R2, the KPI header;
   - R3, table chips, column priority and row-action menus;
   - R6, `SelectList` options and the form error style.

   Then the action-safety fixes from R7: B2-13, E2-47, E2-28, C2-35. Then R8, elevation and four-eyes visibility, and R4, session expiry. Each fix gets its geometry or behaviour test (R12).
2. **Consistency:**
   - R5, one source per count;
   - R9, colour meanings;
   - R10, the record side column;
   - targets below 24px;
   - extending the accessibility scan to tabs and dialogs.
3. **Polish:**
   - R11, label tiers and text below 12px;
   - no-results suggestions and per-screen skeletons;
   - the writing findings, 29 across the logs.

Everything in this review needs product, technical and security review before it is changed. The decisions it raises are left to the owner: the Settings menu layout, the KPI header layout at the default size, and fewer uppercase labels.
