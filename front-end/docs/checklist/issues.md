# Issues module checklist

Source: `Assurance-GRC-Portal.html` lines 2370-2432 (`REND.issues`, `issDrawer` and helpers). React: `src/components/modules/IssuesModule.tsx`,
`issues/{IssueLayers,util}.tsx`, `src/services/issues.ts`.

| source feature | source lines | React file | status | notes |
|---|---|---|---|---|
| Table / Kanban seg toggle (`ISS`), persisted | 2371-2372 | IssuesModule `useModState("issues.view")` | done | |
| Table: ID, Issue, Severity, Owner, Due (red when /Overdue/), Status, chevron; clickable rows | 2374 | IssuesModule, `DueText` | done | rows keyboard operable |
| Kanban: Open / In progress / Closed columns, counts, cards, "Nothing here." | 2375 | IssuesModule | done | issues with another status appear in no column (source) |
| New issue action + modal + "Title is required." | 2373, 2421-2423 | IssueLayers `IssueForm` | done | defaults owner `J. Avery` (anonymised), due `Due 14d`; severity High/Medium/Low; `R-(60+n)`, unshift; wsLog `issue.created` |
| Issue drawer (title, meta grid, status buttons, RCA, tasks, linked tags, link buttons, foot Edit/Delete) | 2379-2392 | IssueLayers `openIssueDrawer`, `IssueDrawerBody` | done | exported hook `useIssueDrawer()` for other modules |
| Move status (closes layer, toast `<id> moved to <s>`, wsLog) | 2406 | `setStatus`, `svc.setIssueStatus` | done | |
| Save root cause / corrective action (toast "Root cause saved", wsLog `issue.rca.saved`) | 2393 | `saveRca`, `svc.saveRca` | done | clamped 2000 chars |
| Task toggle (checkbox, strike-through, counter `done/total`) | 2400 | `toggle`, `svc.toggleTask` | done | drawer re-renders in place rather than reopening (see Open questions) |
| Add task modal + "Task is required." -> reopens drawer | 2394-2399 | `AddTaskForm`, `svc.addTask` | done | wsLog `issue.task.added` |
| Link control / risk modal -> reopens drawer, no duplicates | 2401-2405 | `LinkForm`, `svc.linkIssue` | done | wsLog `issue.linked`; value must be among offered ids |
| Edit issue modal ("Save changes") | 2424-2426 | `IssueForm` | done | owner/due saved as typed (may be empty), as in source; wsLog `issue.updated` |
| Delete confirm modal ("Delete issue?", btn-danger) | 2427-2429 | `openDelete`, `svc.deleteIssue` | done | wsLog `issue.deleted`, toast "Issue deleted" |

## Open questions
1. **No role gate at all.** Any role that reaches Issues can create, edit, status-change and delete any issue. Ported as-is; decide intended RBAC.
2. Edit allows an empty owner or due (create falls back to `Unassigned` / `Due 14d`). Ported as-is.
3. Deleting an issue leaves audit findings that reference it (`finding.issue`) pointing at a missing id and hides their "Create issue" button; linked controls/risks are not checked.
4. Source reopened the drawer after a task toggle (losing unsaved root-cause text and scroll); React re-renders in place so unsaved text and scroll are kept. Visible copy/flow is otherwise the same.
5. `due` is free text and "overdue" is detected by the regex `/Overdue/` (kept); there is no real due date.
6. Status/severity chips for values outside the known list render as neutral (shared `StatusChip`).
7. wsLog category is `Control` for all issue actions (source), not `Issue`.

## Security notes
**UI-enforced only (the real API must enforce):** all authorization (there is none in the source); delete/edit/status changes; referential integrity on delete; enum validation of severity/status; length limits (the UI uses `maxLength` + `clampText`).
**Handled without changing visible behaviour:**
- Source built `onclick="issDrawer('${id}')"` strings and inserted titles into `innerHTML` via `esc`; React renders all fields as text and uses closures, so ids/titles with quotes cannot inject.
- Free text clamped (`clampText`: title 200, owner 80, due 40, task 300, RCA/corrective 2000); severity checked against the allow-list; link target checked against the offered control/risk ids.
- New issue ids bump past existing ones (source `R-(60+len)` could collide after a delete, making `issFind` return the wrong record). Ids are demo values only.
- All mutations go through `src/services/issues.ts` (`viaApi`), wrapped in try/catch with a generic toast. Every source `wsLog` call is kept; actor from `getMe()`.
- No uploads, links or exports in this module (so no `validateUpload`/`safeHref`/`csvCell` needed).
