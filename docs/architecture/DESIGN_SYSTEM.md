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

Contrast of every legacy text and surface pair was computed for both themes: all text pairs are at least 4.5:1, the primary button is white on `#6c3bff` at 5.66:1.

## Typography

Geist and Geist Mono, SIL Open Font License 1.1, self-hosted from `front-end/public/fonts/` (the licence text is `OFL-Geist.txt` beside them). The CSP allows `font-src 'self'`, so no header change and no dependency. Arabic falls back to the system Arabic face (the blueprint names Noto Sans Arabic; it is not bundled).

## Status of the upgrade

| Phase | Scope | State |
|---|---|---|
| 1 | Tokens, fonts, radii, elevation, dark theme, contrast, focus | this change |
| 2 | Shell: 72px rail, notifications slide-over, toast with Undo, shortcuts, profile menu links, search landmark | this change (see below) |
| 3 | Shared kit: data table, KPI strip and card, AI panel, stepper, timeline, charts, switch, segmented control, skeleton | this change (see below) |
| 4 | Module migration in waves; modal create and edit flows become pages | in progress: wave A done (registers) |
| 5 | Governance features (delegation, autonomy, rules, retention, notification matrix) | needs approval to touch `rbac.ts`, `approvals.ts`, `sod.ts` |
| 6 | RTL, density, print, tenant theming, automated accessibility tests | in progress: density and print done |

Decisions taken: all 33 modules stay in the rail with the existing fold and unfold behaviour; the Admin Console and vendor portal take tokens and templates only; create and edit modals become full pages; the reference colour codes are kept as specified.

## Shell (phase 2)

- **Rail**: the existing premium sidebar is kept as it is (module groups that fold and unfold, sub-navigation, collapsed flyouts, Workspace and Admin switch). Collapsed width is 72px and nav tiles use the 16px radius.
- **Notifications**: the bell opens a slide-over dialog (`role="dialog"`, focus trap, Escape) with All, Approvals and Alerts tabs, grouped items, and Mark all read. Items are derived from the same data the modules show (failing controls, controls needing evidence, overdue issues, vendor reviews, MFA reset requests, past-due invoices) and only for modules the role can open. An item opens the record to review. **Nothing is approved from the panel**: decisions in this product need a reason and a second person (`docs/security/SOD_MATRIX.md`), so inline Approve is deferred to phase 5, where it is built on the approval services.
- **Toast**: `toast(msg, ok, { action: { label, run } })` adds an action such as Undo. It stays 7 seconds, holds while hovered or focused, and is a `role="status"` live region. Use Undo only for reversible in-app state.
- **Shortcuts**: Ctrl or ⌘ plus K (jump to a module), J (AI Assistant), B (collapse sidebar), / (shortcut list). The profile menu keeps the role switcher and gains My workspace and Keyboard shortcuts. The Ask AI button and Ctrl+J are shown only to roles that can open the assistant.
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

**Layout rule found in wave A.** Cards in a page column shrink when the page is full, which squashed a table card to its header. A card that must keep its height sets `flex: 0 0 auto`; only the main register card keeps `flex: 1 1 auto`.

## Record and form pages (wave B)

A record is a page with its own address, so it can be linked, bookmarked and reached with the browser Back button. Pilot: Policies. Then Issues and Controls.

| Address | Page |
|---|---|
| `/ws/policies` | the register |
| `/ws/policies/:id` | the record: back link, title and status, then a two-column layout (progress stepper, details, workflow actions, version history; acceptance, mapped controls, change log timeline) |
| `/ws/policies/new` | create form page |
| `/ws/policies/:id/edit` | edit form page, prefilled |

- **Routing:** `parseRoute` returns `sub` (the third segment) beside `param`. A module reads the route with `useRoute()` and renders the register, a record or a form. The breadcrumb shows the record (`Workspace > Policies > P-001 > Edit`), and an unknown record says so with a link back.
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
