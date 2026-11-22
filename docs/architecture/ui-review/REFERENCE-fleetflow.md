# UI reference comparison: FleetFlow AI demo vs Selvara (for review)

Reference: the public FleetFlow AI demo (https://fleetflow.beconfidency.agency/), an AI logistics dashboard. It was compared with Selvara v0.2.4 (demo build) on 22 November 2026.

How it was compared:
- **Sizes:** both apps at 1440 x 900 and 390 x 844, light theme.
- **Reference pages:** Overview, Shipments (list), a shipment record, Exceptions, Dispatch, AI agents, Analytics, New shipment (form), Settings and the phone layout.
- **Selvara pages:** the matching Overview, Issues (list and record), AI Assistant, Reports and Team & Rules.
- **Excluded:** nothing from the reference was copied into the repository (no screenshots, assets or text). This log names patterns only.

**What is already shared.** Both use the same design base:
- the same tokens: warm canvas `#f1f1ef`, violet brand `#6c3bff`, lime accent, the Geist font, a 72px rail;
- the same KPI strip with change pills;
- the same pill buttons, status chips and dark mode approach.

So the differences below are about layout and components, not about restyling.

**How to read the table:**
- **Fit:**
  - ✅ recommended for Selvara;
  - 🟡 worth considering, or needs a product decision;
  - ⛔ logistics-specific, so not applicable.
- **Effort:** S (a day or less), M (a few days), L (a week or more, or new server data).
- **Decide:** the owner marks each row "Yes", "Later" or "No". The rows marked Yes then go into one implementation PR.
- **Constraints:** any AI pattern adopted must keep Selvara's rule that AI output is a draft for human review.

## A. App shell and navigation

| ID | What the reference does | Selvara today | Suggestion for Selvara | Fit | Effort | Decide |
|---|---|---|---|---|---|---|
| R-1 | Content sits in one large rounded white panel, inset from the grey canvas and the rail. | Pages sit directly on the grey canvas under a full-width top bar. | An inset rounded content panel for a calmer, "app window" look. | 🟡 | M | |
| R-2 | No global top bar. Each page header holds the breadcrumb as a small uppercase eyebrow, a large light title (40px, weight 300), then search, a status pill, the primary action, the bell and Help, all on one row. | A global top bar with the breadcrumb, icon buttons and account menu, plus a 20px semibold page title with a subtitle. | Large light display titles with an eyebrow breadcrumb. Optionally fold the top bar into the page header (a bigger change, with knock-on effects on tours and tests). | 🟡 | M (titles S) | |
| R-3 | Search is a visible field with a ⌘K hint in every page header. | Search is an icon that widens on hover. | A visible search field with the ⌘K hint on wide screens; keep the icon below about 1100px. | ✅ | S | |
| R-4 | A Help (?) button sits next to the bell. | Help is the tour play button only. | A Help menu: this page's tour, keyboard shortcuts, documentation, contact support. | ✅ | S | |
| R-5 | Phones get a bottom tab bar (Overview, Dispatch, Tracking, Exceptions, More) with count badges, and the drawer is under "More". | Phones get a hamburger drawer only. | A bottom tab bar on phones, for example Overview, My Work, Issues, Approvals and More, with badges. | ✅ | M | |
| R-6 | The Overview opens with "Good morning, Sarah" and a date and time eyebrow. | "Security posture · November 2026". | A personal greeting with the date eyebrow, keeping the posture sentence as the subtitle. | 🟡 | S | |
| R-7 | A language switcher sits in the rail. | Not present (English only). | Only if localisation is planned. | ⛔ for now | L | |

## B. Overview and dashboards

| ID | What the reference does | Selvara today | Suggestion for Selvara | Fit | Effort | Decide |
|---|---|---|---|---|---|---|
| R-8 | A hero "focus" card shows the single most urgent item: a rich visual, a progress line with a "now" marker, and window, ETA and impact figures. | Three equal panels: risk posture, framework readiness, needs attention. | A focus card for the most urgent item, such as the nearest audit, the oldest overdue critical issue, or a control failing a framework due soon. It would show a stage line (planned, fieldwork, report) and days left. | ✅ | M | |
| R-9 | An AI **Operations brief** panel gives one summary sentence, then the agent count and confidence, contributing causes as ranked bars, and proposed actions needing approval with a "Review recommendations" button. | AI lives only on the Assistant page. | An **AI posture brief** on the Overview: one sentence, top contributing causes such as "3 controls failing in Access", and suggested next steps that open the record. Labelled "AI-assisted · draft, review required", with nothing applied automatically. | ✅ | M (uses the existing Assistant) | |
| R-10 | A header status pill reads "Monitoring 1,284 · 3 approvals", always showing what is waiting for you. | Approvals are in the notifications bell and My Work. | A pill such as "3 approvals waiting" linking to My Work approvals, in the header of every page. | ✅ | S | |
| R-11 | A **timeline (Gantt) with a "now" line**, where AI suggestions are drawn with dashed outlines. | Not present. | A compliance calendar: audits, review cycles, policy reviews, vendor reassessments and evidence expiries on a timeline with a today line. | 🟡 | L | |
| R-12 | A live map with zoom and layer controls. | Not applicable. | None. | ⛔ | | |

## C. Lists and tables

| ID | What the reference does | Selvara today | Suggestion for Selvara | Fit | Effort | Decide |
|---|---|---|---|---|---|---|
| R-13 | **Two-line cells:** the main value, then a muted detail line ("14 pallets · 8,420 lb"; "I-80 E · 81 mi"). | One line per cell. | Allow a secondary line in `DataTable` columns, for example the issue title over its linked control, or the owner over their role. | ✅ | S | |
| R-14 | **People shown with avatars**, and customers with a coloured logo tile. | Owners as text ("O. Hart"). | Initials avatars (generated, no photos) next to people in tables, cards and timelines. A logo tile for vendors. | ✅ | S | |
| R-15 | Filters read "Label Value ▾", with **+ Add filter** and a visible "Sorted by …" label with a sort button. | "Severity: All ▾" filter chips; sorting only from column headers. | Add "+ Add filter" for less-used fields, and show the active sort as a label in the filter row. | 🟡 | M | |
| R-16 | Status tabs with count pills sit under the page title, outside the table card. | Status tabs inside the card above the filters. | Keep as is; this is a styling choice. | ⛔ | | |
| R-17 | Risk is shown as **signal bars** plus a coloured label. | Severity chips with an icon. | Optional: signal bars for likelihood and impact in the risk register. | 🟡 | S | |
| R-18 | **An AI recommendation column**: the agent's name as a chip, then a one-line suggestion. | Not present. | A "Suggested next step" column in Issues and Risks, as a draft that opens the record. Needs the Assistant on the server. | 🟡 | M | |
| R-19 | The view switcher (List, Board, Map) sits in the page header. | Table and Kanban inside the card. | Move the switcher into the page header for consistency with the reference. | 🟡 | S | |

## D. Record pages

| ID | What the reference does | Selvara today | Suggestion for Selvara | Fit | Effort | Decide |
|---|---|---|---|---|---|---|
| R-20 | A round **back button** next to a large title, with a breadcrumb eyebrow above it. | A "← Issues" text link above the title. | The round back button, matching R-2's titles. | ✅ | S | |
| R-21 | **Decisive actions use the dark (inverse) button** ("Approve reroute"). Violet is kept for create and save. | Violet primary for every action. | Use the inverse button for approvals and sign-offs, so approving looks different from creating. | 🟡 | S | |
| R-22 | **A right-hand AI card:** What happened, Why, Recommendation, an impact row (time saved, extra distance, window kept), then an approval bar ("Needs your approval · high-impact action") with Approve, View and Dismiss. | Not present on records. | On issue and risk records: an AI-assisted "What happened, why, suggested next step" card, labelled as a draft. Approval stays with the existing four-eyes flows. | 🟡 | M | |
| R-23 | **A vertical activity timeline** with coloured icon nodes, times, actor avatars and agent chips. | History is in the audit log; record pages show no timeline. | A history timeline on record pages, built from the audit entries for that record. | ✅ | M | |
| R-24 | **Documents as small cards** (title, status, signed time). | Evidence files as list rows. | Evidence and document mini-cards on record pages. | 🟡 | S | |
| R-25 | **A visual "load plan" grid** of slot tiles with a legend. | Not applicable. | None. | ⛔ | | |

## E. Forms

| ID | What the reference does | Selvara today | Suggestion for Selvara | Fit | Effort | Decide |
|---|---|---|---|---|---|---|
| R-26 | **Numbered section cards** (01, 02, 03), each with a title and a one-line description. | Plain form pages with section titles. | Numbered sections on long forms: new risk, new vendor, new audit, invite member. | ✅ | S | |
| R-27 | **An AI pre-fill banner:** "Filled from <file> · 14 fields filled · 1 needs a check", with Replace file. AI-filled fields are tinted violet. | Risk import exists; forms are not pre-filled. | Pre-fill a vendor or risk form from an uploaded document, with tinted fields to review. Needs a server change. | 🟡 | L | |
| R-28 | **A sticky summary on the right** previewing the record being created, plus inline amber warnings under fields ("Receiving closes at 2:30 PM…"). | No preview; errors at the field. | A summary side card on create pages, and inline advisory (non-blocking) warnings, for example "This owner already has 5 overdue issues". | 🟡 | M | |
| R-29 | **Save draft** and Create sit together in the page header. | Save at the foot of the form. | Header actions on long forms, keeping the sticky foot bar. | 🟡 | S | |

## F. AI agents page

| ID | What the reference does | Selvara today | Suggestion for Selvara | Fit | Effort | Decide |
|---|---|---|---|---|---|---|
| R-30 | **A dark summary band:** "1,912 actions today. 94% needed no human, 3 decisions are waiting for you", with time saved, accuracy, override rate and awaiting count. | The Custom agents tab is a list. | A summary band for custom agents: runs today, drafts approved or rejected, waiting for review. | ✅ | M | |
| R-31 | **"Runs on its own" and "Asks you first" lists** show each agent's permission boundary. | Agent permissions sit in the agent's settings. | Show both lists on the agents page. This supports AI governance (human oversight, ISO 42001). | ✅ | S | |
| R-32 | **Agent cards** carry two figures, the latest pending action, a status dot (Needs you, Active, Idle) and an **autonomy level meter**. | Agent rows. | Agent cards with status and the latest run. In Selvara every agent is draft-only, so the meter would show only "Draft only". | 🟡 | M | |
| R-33 | **"Pause all agents"** as a header action. | Agents are paused one at a time. | A pause-all switch, with a reason, written to the audit log. | ✅ | S | |

## G. Analytics and reports

| ID | What the reference does | Selvara today | Suggestion for Selvara | Fit | Effort | Decide |
|---|---|---|---|---|---|---|
| R-34 | **A period control** (7 days, 30 days, Quarter) in the header changes every figure on the page. | Fixed periods. | A period control on Reports and the Overview trends. | ✅ | M | |
| R-35 | **Richer charts:** a dark multi-series tooltip card, a dashed target line, a bar chart with "today" picked out, a donut with a counted legend, ranked horizontal bars with logos. | Line charts with simple tooltips; horizontal bars. | Add target lines (for example 95% readiness), a donut for issue mix, ranked bars, and multi-series tooltips to the kit charts. | ✅ | M | |
| R-36 | **An "Ask anything" analyst panel** next to the charts: a question bubble, the answer, contributors with percentages, recommended actions (Enable rule, Draft request) and "Create report". | The Assistant is a separate page. | An inline "Ask about this report" panel on Reports, using the existing Assistant, with answers labelled as drafts. | 🟡 | M | |

## H. Settings

| ID | What the reference does | Selvara today | Suggestion for Selvara | Fit | Effort | Decide |
|---|---|---|---|---|---|---|
| R-37 | **A vertical settings menu on the left** (Organization, Team & roles, Notifications, Integrations, AI & automation, Billing, Security, Audit logs). | Settings are spread over sidebar modules plus tabs inside Team & Rules. | A single Settings page with a left menu, collecting the company's settings pages. A navigation change, so it needs a decision. | 🟡 | L | |
| R-38 | **Key–value cards** with an Edit link in the card header, plus badges ("Verified carrier", "Workspace · westbay"). | Forms and switches. | Read-first key–value cards for company details, with Edit opening the form. | 🟡 | M | |

## I. Visual details

| ID | What the reference does | Selvara today | Suggestion for Selvara | Fit | Effort | Decide |
|---|---|---|---|---|---|---|
| R-39 | Cards use larger radii (about 20–24px), no border, a white surface on the canvas, and more padding. | 12px radius, 1px border, tighter padding. | Raise the card radius and soften borders across the board (a token change in `portal.css`). Check the density setting still works. | 🟡 | S | |
| R-40 | AI elements share one **AI orb** mark and a soft violet panel (`--ff-ai-50`). | AI uses a sparkle icon and an "AI-assisted" chip on a lavender panel. | One AI mark used everywhere AI appears (Assistant, brief, suggestions). Lavender stays for AI content only, as today. | ✅ | S | |
| R-41 | Large numbers and titles use the light weight (300) consistently. | KPI figures light; titles semibold. | Covered by R-2. | | | |

## Not adopted (logistics-specific)
Maps, the vehicle illustration, the load-plan grid, ETA and window maths, reefer telemetry, and driver photos (Selvara uses generated initials, R-14).

## Suggested first batch (if approved)
These are small, low-risk and fit GRC: R-3, R-4, R-10, R-13, R-14, R-20, R-26, R-31, R-33 and R-40. The bigger product items R-8, R-9, R-23 and R-35 follow as a second batch.
