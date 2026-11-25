# Design system

The visual language of the portal. It follows the Flow-System-Design blueprint (calm, number-led, one brand colour, AI on its own surface) as measured tokens and patterns. Names, imagery and map tiles from the reference site are not used. Values live in `front-end/src/styles/portal.css`; this file explains the rules.

## Layers of tokens

1. **Raw ramps and blueprint names** (`--c-brand-500`, `--bg-canvas`, `--text-secondary`, ...). The blueprint values, unchanged.
2. **Legacy names** (`--bg`, `--surface`, `--ink`, `--muted`, `--accent`, `--bad-ink`, ...). Aliases of layer 1. Existing components and inline styles reference these, so a restyle by token needs no module edit. Only 25 distinct legacy names are used in feature code.
3. **Brand channel**: `--c-brand-*` only. A tenant re-skin overrides those six variables. Nothing else hard-codes violet.

Tailwind 4 utilities for the same tokens are declared in `front-end/src/styles/globals.css` (`@theme`): `bg-brand-500`, `text-danger-700`, `bg-subtle`, `rounded-xl`, `shadow-card`, `font-mono`.

## Rules

- **Colour is meaning, not direction.** Lime is the best state, success green is verified or closed, amber is due soon or review needed, red is overdue, failed or critical, violet is AI-assisted or in review, grey is neutral. A rising overdue count is red even though it goes up.
- **Status never rests on colour alone.** Every status carries an icon and a text label.
- **Lavender is AI.** Anything machine-authored sits on `--c-brand-50` with a `--c-brand-100` hairline.
- **Flat sections, floating overlays.** Cards have a hairline and no shadow. Shadows are for menus, drawers, modals and toasts. The `--glass-*` tokens remain so older rules resolve, but they are opaque.
- **Pills for controls, large radii for containers.** Controls and labels use `--radius-full`; fields `--radius-md` (10px); cards `--radius-lg` (16px); popovers and the command palette `--radius-panel` (20px); modals `--radius-xl` (24px).
- **Numbers lead.** Overline (11px, uppercase, +0.6px) above a light tabular figure. Use `.eyebrow` (not `.overline`: Tailwind owns that name and draws a line over the text), `.tabular`, and `.mono` for timestamps, hashes and audit entries.
- **Weights 300 to 600 only.**

## Deviations from the blueprint (deliberate)

| Item | Blueprint | Here | Why |
|---|---|---|---|
| Dark theme | none | derived from the inverse tokens (`#111113` canvas, `#1e1e22` surface, `#9b7bff` accent text) | the portal ships light, dark and auto |
| `--faint` (legacy "tertiary") | `#909097` | `#686970` | `#909097` is 2.8:1 on the canvas and carries real text in this product. The raw value stays as `--text-tertiary`, decorative only |
| `--muted` | tertiary-ish | `--text-secondary` `#55565c` | essential metadata must pass AA |
| Warning text | `#a86200` on `#fff6e5` (4.43:1) | `--c-warning-800` `#8a5000` (6.06:1) | blueprint section 9 asks for the darker shade at small sizes |
| Focus ring | `0 0 0 3px #2e5cff3d` | solid 2px `#2e5cff` outline (dark: `#8aa4ff`), halo available via `.focus-ring` | the 24% halo alone fails the 3:1 non-text contrast rule |
| Duration | 150 to 260ms | `--dur` 150ms | matches the blueprint |
| QR code (`components/kit/QrCode.tsx`) | tokens | fixed `#000000` modules on a `#ffffff` quiet zone in both themes | authenticator apps need dark modules on a light background to scan; an inverted QR code fails in many apps |

Contrast of every legacy text and surface pair was computed for both themes: all text pairs are at least 4.5:1, the primary button is white on `#6c3bff` at 5.66:1.

## Naming

No word names two things. Before, "Workspace" was the company area (breadcrumb root and space switch), a sidebar group and a page ("My Workspace" beside "My Work").

- **The company area is named after the company.** The breadcrumb root shows the signed-in company's name (production: the session's company; demo: the persona's seeded company, otherwise "Your company"). The space switch reads **Company | Admin Console**, and the sidebar nav is labelled the same way.
- **The sidebar group is "Settings"** (Integrations, API, AI Assistant, Team & Rules, Billing & Invoices, Audit Logs, Security Controls).
- **"Team & Rules"**, not "Team & Settings": the module holds members, roles and the company's rules (review cycles, approvers, automation, retention), and "Settings" is now the group.
- **One personal page, "My Work".** "My Workspace" was merged into it: the greeting and counts at the top, then the tabs Tasks (default), Policies, Account security and Delegation. The tab is remembered in module state (`work.tab`) and `?tab=policies` selects one; the old `/ws/me` address opens the Policies tab.

## Typography

Geist and Geist Mono, SIL Open Font License 1.1, self-hosted from `front-end/public/fonts/` (the licence text is `OFL-Geist.txt` beside them). The CSP allows `font-src 'self'`, so no header change and no dependency. Arabic falls back to the system Arabic face (the blueprint names Noto Sans Arabic; it is not bundled).

## Status of the upgrade

| Phase | Scope | State |
|---|---|---|
| 1 | Tokens, fonts, radii, elevation, dark theme, contrast, focus | this change |
| 2 | Shell: 72px rail, notifications slide-over, toast with Undo, shortcuts, profile menu links, search landmark | this change (see below) |
| 3 | Shared kit: data table, KPI strip and card, AI panel, stepper, timeline, charts, switch, segmented control, skeleton | this change (see below) |
| 4 | Module migration in waves; modal create and edit flows become pages | in progress: wave A done (registers) |
| 5 | Governance features (inline decisions, delegation, notification matrix, autonomy, rules, retention, presence) | built (drafts for compliance review: SOD_MATRIX §8–§15) |
| 6 | RTL, density, print, tenant theming, automated accessibility tests | density, print, tenant theming and axe tests done; RTL and Arabic excluded for now |

Decisions taken: all 33 modules stay in the rail with the existing fold and unfold behaviour; the Admin Console and vendor portal take tokens and templates only; create and edit modals become full pages; the reference colour codes are kept as specified.

## Shell (phase 2)

- **Rail**: the existing premium sidebar is kept as it is (module groups that fold and unfold, sub-navigation, collapsed flyouts, Company and Admin Console switch). Collapsed width is 72px and nav tiles use the 16px radius.
- **Notifications**: the bell opens a slide-over dialog (`role="dialog"`, focus trap, Escape) with All, Approvals and Alerts tabs, grouped items, and Mark all read. Items are derived from the same data the modules show (failing controls, controls needing evidence, overdue issues, vendor reviews, MFA reset requests, past-due invoices) and only for modules the role can open. An item opens the record to review. **Decisions from the panel (phase 5)**: only approvals decided through the shared four-eyes path carry Approve and Reject (see "Governance (phase 5)" below); everything else opens its record.
- **Toast**: `toast(msg, ok, { action: { label, run } })` adds an action such as Undo. It stays 7 seconds, holds while hovered or focused, and is a `role="status"` live region. Use Undo only for reversible in-app state.
- **Shortcuts**: Ctrl or ⌘ plus K (jump to a module), J (AI Assistant), B (collapse sidebar), / (shortcut list). The profile menu shows who is signed in and offers My work, Keyboard shortcuts and Sign out (the role switcher was replaced by sign-in, see `docs/security/SOD_MATRIX.md` section 12). Sign-in & security opens on **Your account** (sign-in history, sessions, change password, recovery codes, security activity); the other tabs remain the sign-in preview gallery. The Ask AI button and Ctrl+J are shown only to roles that can open the assistant.
- **Deferred**: the context-aware AI slide-over (the assistant lives in a feature, which shared shell code may not import; it is built with the assistant module in phase 4), presence and approval delegation (phase 5), language and RTL (phase 6).

## Shared kit (phase 3)

All of it is exported from `@/components/ui`. Pure logic is in `src/lib/dataTable.ts` and `src/lib/charts.ts` and is unit tested; markup contracts are tested by rendering to a string (`tests/unit/kit.test.tsx`).

| Component | Use it for | Accessibility contract |
|---|---|---|
| `DataTable` | Every register: status tabs with counts, filter chips, sortable headers, row select with a bulk bar, Export selected (CSV with the formula-injection guard), pagination, columns menu, row menu | `table` with a name; `th scope="col"` and `aria-sort`; tabs are a `tablist`; filter chips are `aria-haspopup="listbox"` and open a `listbox`; row and select-all checkboxes are labelled; the bulk bar is a `role="toolbar"`; pagination is a labelled `nav` with `aria-current="page"`; rows open on click and on Enter |
| `KpiStrip`, `KpiTile`, `KpiCard`, `DeltaPill` | Metric tiles and drill-down cards. The pill colour follows desirability, not direction | group with a name; the pill carries icon and words |
| `AIPanel` | Anything a model wrote | says "AI-assisted" and "Review before you rely on this" in text |
| `Stepper`, `Timeline` | Remediation stages, audit trail | ordered lists; `aria-current="step"`; Done, Current, Overdue and Projected in words; `time` elements in the mono face |
| `Switch`, `Segmented` | A setting that is on or off; choosing one value | `role="switch"` with the state written; `radiogroup` with roving tabindex and arrow keys (use `tablist` when the control switches panels) |
| `Skeleton` | Loading placeholders | `aria-busy` live region with a name |
| `LineChart`, `BarChart`, `HBarList`, `DonutChart` | Charts | each is a `figure` with a caption, an `img` summary, a visually hidden data table, focusable marks with a tooltip, and legends that carry label, count and share |

Table state (tab, filters, sort, page, columns, selection) is kept per table id while the app is open, like the module tabs.

**Proven on a real module:** the Issues register uses `DataTable` and `KpiStrip`. The charts, AIPanel, Stepper, Timeline, Switch and Segmented are built and tested here and move into modules in the phase 4 waves.

**Names to avoid:** Tailwind ships utilities called `ring` and `overline`, which collided with our classes before. The label class is `.eyebrow` and the donut class is `.donut`. A guard test checks each.

## Module migration (phase 4)

| Wave | Modules | State |
|---|---|---|
| A | Registers: controls (list and tests), policies, vendors, people, access (grants and requests), audits, commitments | done |
| B | Detail views and create pages (modals become pages); evidence (list plus preview becomes table plus detail) | done: Policies, Issues, Controls, Vendors, People, Audits, Evidence |
| C | Dashboards and charts: overview, reports, risk dashboard, frameworks | done |
| D | Assistant, AI governance, questionnaires | done |
| E | Settings group: team, integrations, api, billing, audit log, security | done (Security Controls is a read-only specification page and stays as it is) |
| F | Admin Console and vendor portal (tokens and templates only) | not started |

**Wave A conventions.** A register is a `DataTable` with `searchText`, status `tabs` where the module has a lifecycle, and `filters` for the fields people narrow by; the row opens the record (`onOpen`). Action buttons that already exist (Approve, Deny, Reset MFA) stay inside the row as a column with `hideHeader`, keep their segregation-of-duties reasons, and never open the row. A filter on a field with several values per row uses `test` (frameworks a control maps to) and `labels` for display text. A card that toggles a filter is a `KpiCard` with `pressed`. Tables that are not registers (the cross-framework matrix, the vendor request queue, the standard terms list, review checklists) keep the plain `Table`.

**Layout rule found in wave A.** Cards in a page column shrink when the page is full, which squashed a table card to its header. The rule is now enforced in `portal.css`: every direct child of `.page` and of a `.scroll` column keeps its height (`flex-shrink: 0`) and `.page` scrolls (`overflow-y: auto`) when its content is taller than the window. Regions built to fill the rest of the page still shrink and scroll inside: a `.scroll` region, `.rec-scroll`, `.empty`, and `.panels` or `.split` grids (with a 320px floor). The main register card keeps `flex: 1 1 auto` inline; nothing else needs `flex: 0 0 auto` any more.

## Record and form pages (wave B)

A record is a page with its own address, so it can be linked, bookmarked and reached with the browser Back button. Pilot: Policies. Then Issues and Controls.

| Address | Page |
|---|---|
| `/ws/policies` | the register |
| `/ws/policies/:id` | the record: back link, title and status, then a two-column layout (progress stepper, details, workflow actions, version history; acceptance, mapped controls, change log timeline) |
| `/ws/policies/new` | create form page |
| `/ws/policies/:id/edit` | edit form page, prefilled |

- **Routing:** `parseRoute` returns `sub` (the third segment) beside `param`. A module reads the route with `useRoute()` and renders the register, a record or a form. The breadcrumb shows the record (`<company name> > Policies > P-001 > Edit`), and an unknown record says so with a link back.
- **Form pages:** `FormSection` (numbered, labelled), `FormActions` (Cancel and the primary action, pinned under the form) and `FormMessage` (errors are announced). Same fields, validation and service calls as the dialog they replace. The page explains why when the role cannot create or edit, and the service still decides.
- **Unsaved work:** `useUnsavedGuard(dirty, L)` asks before leaving a dirty form by the back link, the sidebar or the browser Back button ("Stay on this page" or "Discard changes"), and the browser asks before the tab closes. Call `allowLeave()` just before navigating after a successful save. It intercepts navigation without throwing, so nothing reaches the console.
- **What stays a dialog:** short decisions that need a reason or a choice and nothing else (approve, reject, request changes, withdraw, emergency publish, submit for review with a named approver, reassign owner, map a control). They close and confirm; the page behind them re-renders from the data store.
- **Page header:** `Page` takes `back={{ href, label }}`, a link above the title.

**Issues and Controls** follow the same pattern:

| Address | Page |
|---|---|
| `/ws/issues/:id`, `/ws/issues/new`, `/ws/issues/:id/edit` | issue record, create, edit |
| `/ws/controls/:id`, `/ws/controls/new` | control record, add custom control |
| `/ws/controls/:id/exception` | request an exception or waiver (form page) |
| `/ws/controls/test/:id`, `/ws/controls/test/new` | test record, build custom test |

A module with two kinds of record uses the second segment as the kind (`test`), then the id as `sub`; the breadcrumb labels it "Tests". Other features open a control with `useOpenControl()` from `@/features/controls`, which navigates to its page. Notifications deep-link to the record (`/ws/controls/:id`, `/ws/issues/:id`).

**Vendors, People and Audits**:

| Address | Page |
|---|---|
| `/ws/vendors/:id`, `/ws/vendors/new` | vendor record, add vendor |
| `/ws/vendors/:id/reassess`, `/ws/vendors/:id/waiver` | record a reassessment, request a certificate waiver (form pages) |
| `/ws/people/:id`, `/ws/people/new` | person record, add contractor |
| `/ws/audits/:id`, `/ws/audits/new` | audit record (tabs: overview, requests, information requests, control testing, findings), new audit |

A record that was a tabbed drawer (vendor) becomes sections in the two-column layout; an audit, which already was a page with six table-heavy tabs, keeps its tabs under the standard page header. Other features open a person with `useOpenPerson()` from `@/features/people`.

**Evidence** (the list-plus-preview split screen becomes a register and a page):

| Address | Page |
|---|---|
| `/ws/evidence` | register: KPI strip, review tabs, type and collector filters |
| `/ws/evidence/:id`, `/ws/evidence/new`, `/ws/evidence/:id/edit` | record, add, edit |

Held back, still plain tables by design: the cross-framework matrix, review checklists, the vendor request queue and the standard terms list (not registers).

## Dashboards (wave C)

A dashboard page is a `KpiStrip` of the headline figures (the delta pill follows desirability, not direction), then charts from the shared kit: `LineChart` for a trend, `HBarList` for a ranked comparison, `DonutChart` for a mix. Every chart says its numbers in text (caption, summary, hidden data table, legend with counts) and colour is by tone, so no meaning rests on colour alone. Do not add a target line, a threshold or a delta unless the product defines one: the overview's demo deltas are the only invented figures, and they are unchanged.

Frameworks follows the register and record pattern: `/ws/frameworks` (table), `/ws/frameworks/:id` (page), `/ws/frameworks/new` (page). The risk heat map, the distribution tables and the breakdown bars are interactive filters into the register, so they stay as they are.

## AI surfaces (wave D)

Anything a model wrote is an `AIPanel`: the assistant's answers and its introduction. The panel says "AI-assisted" and "Review before you rely on this" in text, and its actions (Copy, Mark reviewed) are for a person to take afterwards. A person's own message is not an AI surface.

| Address | Page |
|---|---|
| `/ws/assistant`, `/ws/assistant/new` | views chosen in the sidebar (Ask, Custom agents, Run log, MCP access); create agent |
| `/ws/ai`, `/ws/ai/:id`, `/ws/ai/:id/edit`, `/ws/ai/new[/:shadowId]` | inventory, system (tabs kept), edit, register |
| `/ws/questionnaires`, `/ws/questionnaires/:id`, `/ws/questionnaires/import`, `/ws/questionnaires/answer` | in flight and answer library, questionnaire, import, add answer |

A questionnaire is addressed by its `Q-` id (assigned when first listed, stable for the session), not by its position in the list. The context-aware AI slide-over from the shell phase is still not built (it needs the assistant to be reachable from shared shell code, which the feature boundary forbids).

## Settings group (wave E)

| Address | Page |
|---|---|
| `/ws/integrations`, `/ws/integrations/:name` | connector register, connector |
| `/ws/api`, `/ws/api/new-key`, `/ws/api/new-webhook`, `/ws/api/new-test` | tabs of tables, three form pages |
| `/ws/team`, `/ws/team/invite` | members and settings tabs, invite |
| `/ws/billingws`, `/ws/billingws/plan`, `/ws/billingws/payment` | overview with invoices, plan, payment method |
| `/ws/auditlog` | table with category tabs, chain, RoPA and evidence views |

A secret is never kept on a page. A new API key is shown once in a dialog that opens after the form page has navigated back to the list (the shell closes dialogs on a route change), and a payment page keeps display values only.

## Admin Console and vendor portal (wave F)

Tokens and templates only. The Admin Console and the vendor portal take the same tokens as the workspace and no hex literal remains in either. Registers use `DataTable` (rates, admin log); summary strips use `KpiStrip` (rates, admin log, commitments). The vendor portal is a standalone, unbranded page: its security panel uses `--bg-inverse` and `--text-inverse`, its logo tile uses `--accent` with `--text-inverse`, and a `Stepper` shows the five stages. Not changed on purpose: elevation gates and second-admin approvals, the hash chain, what the portal stores or logs, and the vendor-facing wording.

## Display preferences and print (phase 6, step 1)

- **Density**: `appStore.density` is `comfortable` (default) or `compact`, saved with the theme and set on `<html data-density>`. Compact only changes the three spacing variables above; text size, control height and focus rings do not change. New dense components should read `--cell-y`, `--head-y` or `--tile-y` rather than a fixed padding.
- **Print**: the stylesheet is in `portal.css` (`@media print`). `AppShell` forces the light theme on `beforeprint`, so a dark-theme user does not print white on black. Anything that should not print takes the `no-print` class. DataTable prints its current page (the page size is the user's).

## Workspace colour and accessibility tests (phase 6, step 2)

- **Workspace colour**: a workspace chooses one preset (`src/lib/brand.ts`: violet default, blue, teal, green, slate). The values live in `portal.css` as `[data-brand="<id>"]` rules that override only the six `--c-brand-*` variables, plus the dark-theme accent set (the dark theme defines its own accent). `<html data-brand>` is set by the shell for workspace routes only. A tenant cannot enter a free colour: the choice is a closed list so a poor contrast pair cannot be chosen. To add a preset, add its three CSS rules and its id; `tests/unit/brand.test.ts` then fails until every text pair is at least 4.5:1 in both themes. Status colours (ok, warn, bad) never change with the brand.
- **Using the brand**: take colour from `--accent`, `--accent-weak`, `--accent-ink`, `--btn-primary*`. Never put a text colour that assumes the violet on an accent tint (the heat map once did); use `--ink` on tints.
- **Accessibility tests**: `e2e/a11y.spec.ts` (axe, WCAG 2.2 AA) runs in the end-to-end job. A new route is covered automatically if it is in the navigation; add record and form pages to its `EXTRA` list. Wait for an open animation to finish before scanning a dialog, or axe measures a half-faded colour. Automated rules catch a part of the problems: keyboard walk-through and screen-reader checks stay manual.
- **Excluded for now**: right-to-left and Arabic (needs a routing decision, which touches a protected file, and reviewed translations).

## Governance (phase 5)

- **Decisions from the bell (step 1)**: a pending workspace approval that the signed-in person may decide shows Approve and Reject in the notifications panel; a reason (at least 10 characters) is required and the decision is the module's own function, `decide` (`services/sodApprovals`), with the engine's `whyCannotApprove` deciding whether the item is offered at all. Nobody sees their own request, a request about themselves, an expired one, or one for a role they do not hold. Offered kinds: `ai.`, `vendor.`, `api.`, `assistant.`, `report.`, `trust.`, `q.` (`src/lib/inboxApprovals.ts`). Not offered, because their modules add rules the generic path does not know (for example the access second approver must differ from the first, risk needs board evidence, MFA and platform approvals need elevation and a named approver): they open their record. To offer a new kind inline, its module must decide it only through `decide`, with no extra pre-checks; add its prefix to `HOMES` and a test.
- **Refusal before recording**: `approvalKit.decideApproval` now refuses an approval whose change has no registered handler before it records anything, so an approval can never be stored as approved without being applied.
- **Delegation (step 2)**: My Work has a Delegation tab with a "Delegate your approvals" card for admins and owners (delegate, 1 to 14 days, reason; end at any time; what has been delegated to you). It changes who counts as the named approver for policies and member MFA resets, within the rules in `docs/security/SOD_MATRIX.md` section 9. To make another named-approver check delegation-aware, replace the "is the signed-in person this name" test with `actsAs(name, approval?)` from `@/lib/delegation`, record `onBehalfOf(...)` in the audit entry, and add a test.
- **Notification matrix (step 3)**: the bell has a Settings view with one group per kind of notice and a switch each for the bell and the email digest (`Switch` inside a `fieldset`). Approvals waiting for you are locked on in the bell. Rules and the draft status: `docs/security/SOD_MATRIX.md` section 10.
- **Autonomy ladder (step 4)**: the Assistant agents table shows each agent's rung with Raise autonomy (a dialog with the track record, the blocking reason when there is one, and a reason field) or Lower to suggests only (immediate). The create form shows the starting rung read-only. The Run log offers Reject applied change on changes an acting agent applied. Team & Rules has an "AI agent track record" segmented control (3, 2, Off). Acting agents show their certification (a warning chip with an icon for "Recertify by" and "Recertification due", muted text for "Certified until") and a Recertify action that opens an attestation dialog. Rules and the draft status: `docs/security/SOD_MATRIX.md` section 11.

## Kit additions from the design review (November 2026)

Tokens (`portal.css`, both themes unless noted):

| Token | Use |
|---|---|
| `--bg-inverse`, `--bg-inverse-2`, `--text-inverse`, `--text-inverse-muted`, `--border-inverse` | Inverse surfaces (bulk bar, chart tooltip, toast, vendor portal security panel). The dark theme now flips them to a light surface, so they no longer vanish into the dark canvas. |
| `--ring-inverse`, `--ok-ink-inverse`, `--bad-ink-inverse` | Focus ring, success tick and error icon on an inverse surface. |
| `--high-ink` | The High risk band in charts (between warning and danger), so a chart can match the heat map. Chart `Tone` has `high`. |
| `--brand-mark` | The second square of the Selvara mark (`BrandMark`). Platform identity, not a status colour; a tenant preset does not change it. |

Native controls take `color-scheme` from the theme and `accent-color: var(--accent)`.

Components and props:

- **Toast:** `toast(msg, tone?, opts)` with `tone` `"ok"` (default, success tick), `"bad"` (alert icon, a hidden "Error:", stays 6 seconds) or `"info"` (no icon). `true` and `false` still work. The tone is never guessed from the text: pass `false` on every failure.
- **KPI strip:** columns follow the tile count (one row when the tiles fit, then balanced rows, by the strip's own width), so no row ends with an orphan tile. `DeltaPill` and `KpiTile.delta` take an optional `icon`; by default a trend arrow appears only for a signed change ("+3 pts", "-2"), otherwise the tone's state icon (good is a check). A fact that is not a change (a date, a count) goes in `caption`, not in a pill. `KpiCard` shows the filter icon when it toggles a filter (`pressed`) and an alert or clock icon before a bad or watch sub-text.
- **Stepper:** `futureLabel` (default "Projected"; a wizard passes "Next"); pass `current={steps.length}` when everything is done. On a narrow container it becomes a vertical list.
- **DataTable:** `DTColumn.nowrap` keeps IDs and short statuses on one line (set it on every ID column); `rowLabel` names rows in "Select …" and "Actions for …" when the key is not human (a user id); "Clear filters" appears only for a search or filter chip; the pager hides when there are no rows; the count says "1 row".
- **Popovers:** focus moves to the first item and back to the trigger; arrow keys, Home and End move between items; Tab closes; a popover near the bottom of the window opens upwards.
- **Page:** `status` renders a status chip beside the title (record pages). `Ring` takes a `label` (for example "74/100"). `FormMessage` errors carry an alert icon.
- **Icons:** `dot` is a solid circle, `alert` the circled exclamation, `excl` the bare mark for a dot that is already a circle, `blank` an empty slot for an unchecked menu option, plus `copy`, `print` and `unlock`.
- **Tables:** the right-edge scroll shadow on `.tbl-wrap` and `.tabs` shows only while there is more to scroll. `.tbl td.num` cells never wrap.
- **Shell:** the route guard says "Your role does not open <module>." before it moves a person to their start page; the mobile drawer traps focus and has a close button; the vendor portal security panel is folded into "How this portal protects you".


## App frame, lists and AI mark (reference review, November 2026)

Decided by the owner from the FleetFlow reference comparison ([ui-review/REFERENCE-fleetflow.md](ui-review/REFERENCE-fleetflow.md)).
- **Frame:** the sidebar sits on the canvas (`--bg`), and `#topbar` with `main#content` form one rounded panel (`--radius-xl`), inset 8px. Phones keep the full-bleed layout.
- **Header row:**
  - the breadcrumb is an uppercase eyebrow;
  - page titles use the light display weight;
  - `Page` takes an optional `eyebrow` (the Overview's date line);
  - global actions are search, Ask AI, the bell, the approvals pill (`lib/approvalsWaiting.ts`: the server's My Work figure in production, the demo review list otherwise), Help and the account menu.
  - The theme switch is in the account menu.
- **Cards:** keep the white surface with a soft border, `--radius-panel` and no shadow. `.panel-soft` is the grey summary panel for focus, AI and calendar content.
- **People and vendors (`components/ui/People.tsx`):**
  - `Avatar` and `Person` show generated initials and never photos. The initials are drawn by CSS from `data-i`, so a cell's text stays the name.
  - `VendorTile` shows an uploaded logo or a letter tile.
  - The six tones are token colours with white text.
- **Severity:** `SeverityBars` shows the word plus 1 to 4 bars. It is used in lists (issues, findings, the risk register's scores); records and cards keep chips.
- **Tables:**
  - `DTColumn.sub` adds a muted second line;
  - `DTFilter.more` puts a filter under "+ Add filter" until it is added or set ("Clear filters" puts it away again);
  - the "Sorted by" button opens a sort menu. The column-header sort still works.
- **AI mark:** `AiMark` (`.ai-mark`, a dark dot with an `--c-ai-400` ring) is the one sign of AI content or an AI action.

### Records, forms and the Overview (part 2)
- **Back:** a record or form page shows a round back button (`.back-round`) beside the title, labelled "Back to <list>". The breadcrumb still links the list.
- **Decide button:** an approve or decide action uses `.btn-decide` (the inverse button), so the decision stands apart from secondary actions.
- **History:** `components/kit/RecordHistory.tsx` lists audit-log entries for one record id, newest first, on issue and control pages. In production it shows only to roles that can read the audit log.
- **Documents:** `DocGrid` and `DocCard` (`components/ui/Docs.tsx`) show attachments as cards with a type badge taken from the file extension, used on the evidence record.
- **Forms:**
  - sections sit on `--surface-2` with numbered headings;
  - `FormActions` renders its buttons in the page header through `PageActsSlot` (one copy; the header button submits the form);
  - `.form-with-summary` adds a summary aside that follows the fields, with an advisory note (`.advisory`) that informs but never blocks saving. The issue form uses it.
- **Overview:**
  - `FocusCard` shows the single most urgent item: an audit within 60 days, else the oldest overdue High or Critical issue, else the next audit. It includes its stage track and one decide button.
  - `ComplianceCalendar` shows the next six months of audits, policy reviews and vendor reassessments. Overdue markers sit at today in red with "overdue" in their name. Only modules the role can open are shown.

### AI features and agents (part 3)
- **Facts first:**
  - `lib/insights.ts` computes the posture brief, the suggested next steps and record summaries by fixed rules. The UI says "Computed from …".
  - AI is only asked for wording: `components/kit/AiWording.tsx` ("Write with AI") and `AskPanel.tsx` ("Ask about this report") post to the Assistant (`/ws/assistant/ask`) and show the answer in `AIPanel` as a draft.
  - The demonstration words the facts with a template and says so in the panel's meta line.
  - Both components render nothing for roles that cannot open the AI Assistant.
- **Record summary:** `components/kit/ExplainCard.tsx` ("What happened / Why it matters / Suggested next step") is on issue and risk records.
- **Prefill:**
  - `components/kit/PrefillBanner.tsx` with `usePrefilled()`. Filled fields get `.field.prefilled` (accent-weak fill and accent border) and a "From document" tag in the label until edited, so the state is never shown by tint alone.
  - `lib/docText.ts` reads PDF, .docx and text in the browser, within its size limits; `lib/prefill.ts` holds the field rules shared with the server.
- **Agents:**
  - `features/assistant/AgentsOverview.tsx` provides the summary band (`KpiStrip`), the "Runs on its own" and "Asks you first" lists, and agent cards with an `AutonomyMeter` (bars plus the rung's name).
  - Cards and table share the same actions; the view choice is a `Segmented` control.
- **Kit:** `HBarList` takes `wrap` to put long labels above their bars.

### Settings, Help centre and logos (part 4)
- **Settings (R37):**
  - `components/shell/SettingsMenu.tsx` wraps every module of the nav's Settings group in `.settings-layout`: a menu (`nav aria-label="Settings"`) on the left and the page on the right.
  - The modules keep their own routes. The sidebar shows the group as one "Settings" entry that opens the first page the role can open.
  - Below 900px of content width the menu becomes a scrolling row.
- **Key–value cards (R38):** `KvCard` (`components/ui/KvCard.tsx`) shows label and value rows with an Edit button in the header. The caller swaps the card for the fields.
- **Help centre (R4):**
  - `/help` is outside the role-gated spaces, like `/auth`: the route space is `auth` and the module is `help`.
  - Guides live in `data/helpArticles.ts`. `searchArticles` needs every word for the search box and accepts any strong match for suggestions.
  - Questions are in `services/help.ts`. A thread uses `.help-thread`, and support replies are tinted accent-weak with "Selvara support" in the byline.
- **Vendor logos (R14):** `VendorTile` shows `logo` when set. `lib/logoImage.ts` redraws uploads to a 128px PNG and checks the data URL, the same way in the browser and on the server.

### Reports, charts and the phone tab bar (part 5)
- **Period (R34):** `lib/period.ts` holds one choice (7 days, 30 days or the quarter to date) shared by Reports and the Overview's trend, remembered in this browser only. Use `Segmented` labelled "Period" in the page header; put the range in the eyebrow ("Reports · 25 Oct to 23 Nov").
  - History is never invented in production: a chart that needs stored history shows today's figure and says the trend appears once daily figures are recorded. The demonstration's history comes from `demoSeries` and `demoIssueFlow`, which are fixed and end at today's real figure.
- **Charts (R35):**
  - `LineChart` takes a `target` (dashed line and label).
  - `HBarList` takes a `target`: a marker on every track, a key under the chart, and a summary saying how many rows reach it. Show at most eight rows and say how many more there are.
  - `PairBarChart` draws two series per period (for example closed and opened). The last group is "now" at full strength; earlier groups are lighter. Counts use whole-number ticks.
  - The visually hidden data table sits inside a hidden `div`, because a table ignores a 1px width and would widen the page on a phone.
- **Phone tab bar (R5):** `components/shell/TabBar.tsx`, shown only below 760px as a third grid row under the content. Up to four places the role can open, then More, which opens the sidebar drawer. Counts sit on the icon and the link's name says what they count ("Issues, 6 open"). Toasts move up above the bar.

## Layout follows the space it has

The sidebar takes about 280px when open, so the content of a 1024px window is narrower than a 768px phone layout expects. Page layout therefore responds to the **content's own width**, not only to the window:
- `main#content` and `#topbar` are size containers (`container: content` and `container: topbar`). Under 760px of content, `.panels`, `.split`, `.grid2`, `.rgrid2/3` and `.fwsplit` stack to one column and the page scrolls (the phone rules); under 900px, `.rgrid3` goes to two columns. The top bar folds the search to its icon under 640px and drops the name in the account button and the company crumb under 560px.
- Grid children get `min-width:0`, so a wide table scrolls inside its card instead of widening the page.
- Card heads (`.c-head`), segmented controls (`.seg`) and KPI figures wrap rather than overflow. A long KPI figure (more than 6 characters, such as `$16,750.00`) shrinks with its tile; short ones keep the full size.
- Anything drawn at a fixed position next to an element (tour, popover, rail flyout) follows the element with `useAnchorWatch`, never a one-off measurement.

### Owner layout review (November 2026)
Rules that changed after the owner's screen-by-screen review (before/after evidence in the PR):
- **Cards keep the height of their content.** `.panels` no longer stretches to the bottom of the window, and module cards no longer carry `flex: 1 1 auto`; a long register grows and the page scrolls. Cards side by side in one row share the tallest card's height. Only the chat assistant keeps a full-height panel.
- ~~Running text is justified, with hyphenation~~ (reversed on 2026-11-26, see "Fix once, apply everywhere" below: all text is left-aligned and never hyphenated). Form text runs the full card width; the class `.fields-cap` keeps only inputs, selects and button rows at a readable width (640px).
- **One helper text size**, `--fs-help` (13px), for help text and banners.
- **Plain forms space their fields** (12px between a field and what follows) unless the form lays itself out (`.rec-form`, or a `gap` of its own).
- **One empty state.** `Empty` has a `compact` form (icon, title, one line) for empty lists inside a card; no plain "No …" sentences.
- **Tables** drop a column that is empty in every row (`emptyWhen`), and a name cell does not repeat a value that has its own column.
- **Tab bars** stay on one line and scroll sideways on a phone; arrow keys, Home and End move between tabs on every tab bar (`lib/tabKeys.ts`, installed by the shell).
- **Guided tours** place the bubble beside a large area, never over the fields it describes.

## Guided tours

Each module has a short walkthrough (`src/data/tours/*`, engine `src/components/kit/Tour.tsx`): a bubble that points at one part of the page at a time with **Back**, **Next** (**Done** on the last step) and **Skip tour**. It replaces the old banner tips.
- **Writing a tour:** 3 to 7 steps, plain second-person sentences of at most about 220 characters, in reading order: what the page is for, the summary, the main list, the main action, tabs, who approves what. Keep compliance wording exact. Point at elements with `data-tour="<module>-<part>"` hooks in the module's own markup, on an element with size (not `display: contents`). A step whose element is not on the page is left out, so steps for actions a role cannot take simply do not show. Raise `version` when people should see the tour again.
- **When it starts:** on the module's main page, by the person's preference, which is saved on their account (`GET/PUT /api/me/tours`; this browser in the demo): **First visit only** (default), **Again after updates** (also when the tour's version goes up) or **Off**. The setting is in Sign-in & security, Guided tours, with **Show all tours again**. Finishing or skipping counts as seen. A tour never starts over a dialog, and not under browser automation unless a test opts in (`localStorage["selvara.tours.e2e"] = "1"`).
- **Replay:** Help (the question mark in the header) › "Take the tour of this page".
- **Following the page:** the ring and bubble re-measure their element every frame while a tour is open (`src/hooks/useAnchorWatch.ts`), so they stay on it when the page scrolls, the sidebar collapses or expands, or content loads. If a layout change (cards stacking or unstacking) takes the element out of view, the page scrolls it back; the bubble is always kept on screen. Popovers and the collapsed-rail flyouts use the same hook.
- **Accessibility:** the bubble is a labelled non-modal dialog that takes focus on each step and returns it at the end. Escape skips, and the left and right arrow keys move between steps. The page stays usable; a ring marks the element. Below 600px wide the bubble is a bottom sheet.

## Fix once, apply everywhere (owner design rules, November 2026)

Recurring layout defects are fixed in the shared components and tokens, never screen by screen. A screen that needs something different adds a documented variant to the component; it does not add an inline value.

**Tokens** (`portal.css`, `:root`): spacing scale `--space-1` to `--space-6`; `--section-gap` (between page blocks: KPI strip, card rows, tables); `--grid-gap` (between cards, rows and columns alike); `--card-pad`; `--card-head-h` (52px, every card header, with or without a badge, link or segmented control); `--card-min` (narrowest card before a grid wraps); `--panel-max` (a capped dashboard panel body); `--text-max`; rhythm tokens `--rhythm-heading`, `--rhythm-para`, `--rhythm-help`.

**Text (A1 to A5).** All text is left-aligned (`text-align: start`) and never hyphenated by the browser (`hyphens: manual`). Identifiers, code, keys, endpoints and variable names go in `<code>` (monospace, never hyphenated, wraps anywhere rather than leaving its card). An empty paragraph takes no space. The time-of-day greeting comes from `lib/greeting.ts`: "Hello" from midnight to 04:59, then "Good Morning", "Good Afternoon" and "Good Evening" (title case), from the person's own clock.

**KPI strip and tiles (B1 to B8).** `KpiStrip` lays tiles out on one grid with one gap; columns follow the tile count so no row is left part-empty (5 or 6 tiles: 3 per row until the strip is 1200px wide). `KpiTile` has three fixed rows: label (top-left) with the status badge in the fixed top-right slot, then the value, then the supporting text. The value is one size for every tile of a strip, stays on one line with its % sign or unit, and uses tabular figures. A long label ends in an ellipsis with the full label on hover. A page-level `.scroll` is a stack with `--section-gap`, so the strip never touches the cards below.

**Card grid (C1 to C4).** `CardGrid` (`cols` 2, 3 or 4) is the one grid for side-by-side cards. Cards in a row are one width and stretch to one height; a short last row grows to fill the width (no orphan card beside an empty gap). `capped` (dashboard panels) stops each card body at `--panel-max` and scrolls inside, so one long list cannot stretch the row and leave its neighbours mostly blank. A control row that does not fit a card header (a period switch) goes in `.c-toolbar` at the top of the body, so headers keep one height.

**Focus and tabs (E1, E2).** Focus rings appear for the keyboard only (`:focus-visible`); a mouse click leaves no outline. A filter that switches what a list shows is a `.tabs` tablist with the white-pill selected style, the same everywhere.

**Not assessed (E5).** A readiness or compliance figure with nothing assessed shows "Not assessed" (or "—" in a narrow cell) in neutral colour. Red is for assessed and failing. `fwAssessed` and `readinessRows` in `lib/frameworks.ts` decide it; assessed frameworks sort first, furthest from target first.

**Components (PR 2 of the design brief).**
- **Modal (G2):** the title has a close icon. There is one footer, with the primary action on the right and Cancel on its left. Esc, Cancel and the close icon dismiss it. There is no separate "Close" button, and a modal with no actions has no footer.
- **Listbox (G1, `Listbox` in `components/ui/Controls.tsx`):** the single-choice control in dialogs. It opens in the flow under its field, never over the dialog. Arrow keys, Home, End, Enter and Space work, and Esc closes the list before it closes the dialog. An option that can't be chosen is shown disabled with its reason (G3: Change role lists every role a member can hold).
- **Empty states (H1 to H3):** `Empty` is the one component. A full empty state inside a card keeps a minimum height. `DataTable` says "Nothing matches these filters" only while a search or filter is on, with a Clear filters link. Otherwise it shows the table's own `emptyText`, for example "No events yet", or "Nothing here yet".
- **Forms (F1 to F4):** a field is label, then input, then helper text, and helper text keeps `--rhythm-help` before the next label or section. `.form-row` puts one row of inputs on an equal-column grid; `.form-stack` spaces a form's blocks; `.form-acts` holds the buttons. Section labels (`.sectitle`) have one spacing above and below. Placeholders are lighter and italic, so they never read as values.
- **Settings rows (F5, D4):** `SettingsRow` puts the title and description on the left and a 260px control column on the right, level with the title, with the status first and the action under it. A settings list fills its container; descriptions keep `--text-max`.
- **Cards (C5 to C7):** a card's action sits in its `.c-foot`. When a card can't act, every card of that type shows the same button disabled, with the reason under it. Cards never sit inside cards; a group of cards gets a `.sec-h` section heading instead. Checklists (`.checklist`) align the icon, text and status columns.
- **Badges and buttons (E3, E4):** a count in a card header is always a `.tag`. Disabled buttons of every kind share one greyed look and say why. The destructive secondary button (`.btn-danger`) has a red border and red text, so an enabled one never looks disabled.
- **Your account (C6, D2, D3):** "Your account" is the page title, breadcrumb and Settings-menu entry. The page sits inside the Settings menu, and its cards sit directly on the page.
- **Integrations (J2):** a connector the platform hasn't configured says "This connector isn't available yet. Contact your platform administrator." The platform's variable names appear only in docs/guides/SUPABASE.md, for platform staff.
