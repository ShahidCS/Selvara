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

---
## Hardening update (docs/SOD_MATRIX.md section 3, Issue)
Files: `services/issues.ts`, `issues/IssueLayers.tsx`, `IssuesModule.tsx`, `src/lib/grcSod.ts`, approvals engine.

### What changed vs the prototype
* Severity list now includes Critical. Closing a High/Critical issue is refused by `setIssueStatus`; instead "Propose closure" (note >= 10 chars) creates an approvals-engine request (`issue.close`, 14 days). The verifier (admin/owner/analyst) must NOT be the assignee, the issue owner or the proposer, and records a verification note (>= 10 chars); only then does the issue close, with the verification (who/when/note/proposer) shown on the issue. Reject and Withdraw exist. Medium/Low close directly (closer = creator is logged, not blocked).
* After creation, editing owner / due / severity needs admin or owner (analysts can edit the title, tasks, root cause; inputs are disabled with the reason). Changes are blocked while a closure is pending.
* Reopening a closed issue needs admin/owner. Delete needs admin/owner, is refused for open High/Critical issues and for issues referenced by an audit finding (fixes prototype open question 3).
* Default owner of a new issue is the signed-in person; `createdBy` is recorded. Issues are limited to admin/owner/analyst for writes (read-only otherwise).
* wsLog events carry ids and actors: `issue.created|updated|status.changed|closure.proposed|closure.rejected|closure.withdrawn|closed.verified|deleted`.

### Conflicts resolved by owner decision
Prototype had no gate and one-click close; replaced by the matrix. The model has a single `owner` field, so assignee and owner are the same person (an optional `assignee` is honoured if present).

### Security notes
Verifier independence, severity-change rights and delete rules must be enforced by the API with user ids; the approval record must be immutable. Severity downgrade to dodge verification is limited to admin/owner and logged with before/after values.

### Open questions
1. Should verification also be required when a Medium issue is edited up to High and closed in the same session? Not needed today because a severity edit is admin/owner-only and logged.
2. Add a separate `assignee` field to issues?
