# UI design review (November 2026)

Every module and public page of the shipped portal (v0.2.0) was reviewed against the design critique framework (first impression, usability, visual hierarchy, consistency, accessibility) and `DESIGN_SYSTEM.md`.

## How it was reviewed
- In the running production build (demo data), at 1280x900 in light and dark and at 390x844, plus 1024 for the shell.
- As the roles that use each module: company admin, owner, employee, auditor, vendor, viewer, platform super admin and support.
- Every tab was opened, every record and modal, and every primary and secondary action. Forms were submitted empty and invalid, and empty states were checked.
- The code was read to confirm each finding and to locate it by file and line.

Each finding has a severity:
- 🔴 Critical: blocks a task, breaks the layout, is unreadable or is inaccessible.
- 🟡 Moderate: confusing, inconsistent or noticeable.
- 🟢 Minor: polish.

## Findings and status

| Group | Scope | Findings | Critical | Log |
|---|---|---|---|---|
| A | App shell, shared kit, sign-in, vendor portal, public Trust Center, My Workspace | 36 | 3 | [A](ui-review/A.md) |
| B | Overview, My Work, Reports, Frameworks, Controls & Tests, Evidence | 44 | 3 | [B](ui-review/B.md) |
| C | Policies, Audits, Issues, People, Access, Risk | 52 | 2 | [C](ui-review/C.md) |
| D | AI governance, Vendors, Trust Center, Questionnaires, Commitments, AppSec | 48 | 4 | [D](ui-review/D.md) |
| E | Integrations, API, Assistant, Team & Settings, Billing, Audit log | 40 | 3 | [E](ui-review/E.md) |
| F | Admin Console (Customers, Billing, Rates, MFA resets, Admin log, Elevation, Platform security) | 42 | 6 | [F](ui-review/F.md) |
| G | Layout and alignment at every width, sidebar open or collapsed; tour, popover and flyout anchoring (November 2026, v0.2.2) | 17 | 5 | [G](ui-review/G.md) |
| **Total** | | **279** | **26** | |

By severity: 21 critical, 141 moderate and 100 minor.
By status: 251 fixed, 4 partly fixed and 7 open (all listed below). The Status column of each log gives the outcome per finding.

## The root causes behind most findings
Most findings came from a few shared causes, so each was fixed once in shared code:
- **Cards shrank instead of the page scrolling.** Overview, My Workspace, AppSec, Rates and others squeezed or hid their content: a heatmap showed one row, policies could not be acknowledged, and sections collapsed to 2px. The layout rule in `DESIGN_SYSTEM.md` is now enforced in CSS.
- **Help text never got its style.** `className="field help"` on one element (more than 300 uses) rendered as body text in a flex column. It is now muted, small, plain text.
- **No style for invalid fields.** Errors appeared only at the foot of each form. Invalid fields now have a red edge, and forms mark the right field and put the error next to it.
- **Toasts guessed their tone from the text.** Some errors showed a success tick and some successes ("Request rejected") showed an error. Toasts now take an explicit tone, and errors carry an icon.
- **KPI strips wrapped badly.** Tiles left orphans and misaligned rows, a dot icon looked like a speck, and an "up" arrow appeared on static values. Columns now follow the tile count and the strip's own width, and icons follow the meaning of the value.
- **Dark mode.** The selected tab was invisible, checkboxes rendered as white boxes, and inverse surfaces disappeared. Each now has a theme value.
- **Keyboard and focus.** Popovers and the account menu now take focus and support the arrow keys, Home and End. The mobile drawer traps focus and has a close button. Disabled buttons show why they are blocked on hover.
- **Mobile.** Fixed grids now collapse: Commitments, framework requirements, Automation rules, Kanban and the Stepper. Tab strips scroll instead of overflowing.
- **Destructive actions with no confirmation.** Disconnect, delete, void, remove and take out of scope now confirm first, or offer Undo where an undo is honest.
- **Lavender used outside AI content.** Audit-chain banners, the auditor banner and approval steps no longer use it.

## Behaviour that changed (worth knowing)
- **Invitations:** "Invite member" defaults to Employee instead of Company Admin.
- **Payment form:** it validates the card's last 4 digits and the MM / YY expiry.
- **Team settings:** "Save settings" is now "Record settings in audit log", which is what it always did. Each setting applies when changed, as before.
- **Opening a module your role cannot use:** you see "Your role does not open <module>." before the redirect.
- **Popovers:** they open upwards when there is no room below.
- **Demo links:** vendor and questionnaire links still work after a reload.

## Open items (need a decision or their own change)

| ID | What | Why not in this change |
|---|---|---|
| C-41 | The risk register is a hand-built table: no sort, pagination or export | Moving it to `DataTable` changes the filter state the risk dashboard's click-throughs set. Needs a decision on the dashboard filters. |
| C-45 | Risk details open inline below the register, with no address of their own | Needs a `/ws/risk/:id` route and breadcrumb. |
| C-51 | Add risk and Create access review are dialogs, while other modules use form pages | Needs new routes. |
| C-34 | The People "Access grants" tab duplicates the Access module | An end-to-end test depends on the tab. Remove both together if wanted. |
| F-6 | Two pending-approval components (MFA and the other admin pages) look slightly different | Merging them touches the four-eyes UI that workspace features use; it needs its own change and test pass. |
| F-32 | Row actions in plain tables sit off-screen on phones | A stacked or sticky action column changes every plain table: a layout decision. |
| F-37 | "Reset demo data" sits in the Admin log | Moving it to the profile menu needs the reset to move into shared code (feature boundary). |
| B-42 | A status tab with no rows says "Nothing matches these filters." | That text is tested; the duplicate "Clear filters" and the empty pager are fixed. |
| F-25 | "AED 0" against "$0.00" | `money()` is shared with the server, which writes audit entries with it. Changing it would change recorded text, so the UI needs its own formatter. |
| A-27, A-32 | /auth has no highlighted sidebar item; the vendor portal demo dates are in the past | Highlighting a different page would mislead screen readers. The dates need a seed change or rendering after mount (the page is prerendered). |

## Reference comparison (for decision)
[ui-review/REFERENCE-fleetflow.md](ui-review/REFERENCE-fleetflow.md) compares Selvara with the FleetFlow AI demo, which shares the same design base: 41 differences, each marked recommended, consider or not applicable, with the effort involved. The owner decides each one before anything is built.
