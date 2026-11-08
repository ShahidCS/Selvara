# Controls module checklist

Source: `Assurance-GRC-Portal.html` lines 1599-1702. React: `src/components/modules/ControlsModule.tsx`, `controls/{useControlDrawer,useTestDrawer,createModals,modalForm}.tsx`, `src/services/controls.ts`.

| source feature | source lines | React file/component | status | notes |
|---|---|---|---|---|
| Module state CTRL (q, status, fw, page, per=10, view) | 1600 | ControlsModule `useModState("controls.*")` | done | persists across navigation; page clamped to last page |
| Seg tabs Controls / Tests / Matrix | 1602 | ControlsModule `seg` | done | role=tablist/tab, aria-selected |
| Per-view page actions | 1603-1605 | ControlsModule `acts` | done | |
| Frameworks button -> `/ws/frameworks` | 1603 | `useGo` | done | |
| Controls view: search (resets page) | 1611 | ControlsModule | done | added `aria-label` |
| Framework select (All frameworks / FW_ID) | 1612 | ControlsModule | done | |
| Status filter chips (All/Pass/Needs evidence/Fail, icons) | 1657-1658 | ControlsModule | done | aria-pressed |
| Count tag (`n control(s)` + ` mapped to <fw>`) | 1667 | ControlsModule | done | |
| Filtering (status, fw map, text over id/title/owner/domain) | 1659 | ControlsModule | done | |
| Empty state + Clear filters (q, status, fw) | 1668 | `Empty` | done | page not reset, clamp handles it as in source |
| Controls table, clickable rows | 1669-1670 | ControlsModule | done | rows keyboard accessible (Enter/Space) |
| fwChips (6 + "+N" tag with title) | 1661-1664 | `FwChips` | done | |
| Pager (Showing x to y of n, Prev/Next, disabled) | 1671 | ControlsModule | done | |
| Tests view: table, count tag `n tests` | 1630-1631 | ControlsModule | done | |
| Result chip mapping (Pass/Fail/else Needs evidence) | 1631 | `testChip` | done | |
| Sync all tests | 1641 | `svc.syncAllTests` | done | wsLog tests.synced + toast |
| Build custom test modal + validation "Test name is required." | 1642-1648 | `createModals.openCreateTest`, `svc.createTest` | done | first 40 controls as options; TESTSEQ starts at 6 (module counter in service); defaults "Custom"/"Custom condition"/"Needs data"/"On demand"/"Not yet run" |
| Matrix view table (5 frameworks, "—" for none) | 1651-1652 | ControlsModule | done | |
| Export matrix CSV | 1653-1656 | `svc.exportMatrix` | done | filename kept; cells via `csvCell` |
| Export SoA CSV | 1618-1620 | `svc.exportSoa` | done | filename kept; cells via `csvCell` |
| Add custom control modal + validation "Control title is required." | 1621-1629 | `createModals.openCreateControl`, `svc.createControl` | done | id prefix from capital letters of domain (max 3) + count+1; status "Needs evidence", custom:true; owner fallback "Unassigned" |
| Control drawer (status, Custom tag, meta, attestation, mappings, linked tests, rationale) | 1673-1685 | `useControlDrawer.openControlDrawer` | done | exposed as `useControlDrawer()` |
| Linked test row -> closes drawer, sets view to tests, opens test drawer | 1682 | same | done | view set via `setModState("controls.view","tests")` |
| Record attestation modal + "A statement is required." | 1686-1693 | `AttestBody`, `svc.attestControl` | done | reopens control drawer afterwards |
| Add mapping modal + "Requirement code is required." | 1694-1698 | `MappingBody`, `svc.addMapping` | done | |
| Create Tasklane ticket (random SEC-xxxx, demo toast) | 1699 | `ctrlJira`, `svc.createTicket` | done | |
| Export workpaper txt | 1700-1702 | `ctrlWorkpaper`, `svc.exportWorkpaper` | done | |
| Request evidence button (toast, close) | 1684 | drawer footer | done | |
| Test drawer (logic, items, supported controls, meta) | 1632-1638 | `openTestDrawer`, `useTestDrawer()` | done | |
| Test: Run now | 1639 | drawer footer, `svc.runTest` | done | |
| Test: Deactivate | 1640 | drawer footer, `svc.deactivateTest` | done | |
| Audit log entries (control.*, test.*, tests.synced, controls.*.exported) | various | `wsLog` calls | done | |

## Open questions

1. Default owner in "Add custom control" is the synthetic `J. Avery` (the source default was a real person's name).
2. Source CSV exports quoted only cells containing `",\n` and had no formula guard; the port uses `csvCell` (guide rule 7), so every data cell is quoted and `=+-@` prefixes get an apostrophe. Header row is unquoted as in source.
3. The linked-test row in the control drawer sets `CTRL.view='tests'` without re-rendering in source; in React the Controls module switches to the Tests view whenever it is next shown (same persisted-state semantics). If opened from Frameworks, the next visit to Controls lands on Tests.
4. The test drawer for a test with no `items` renders an empty table (no empty-state copy in source).
5. Tests created with result "Needs data" display as "Needs evidence" (source mapping), kept as is.
6. Control/test drawers are snapshots taken at open (as in source); they do not live-update while open.
