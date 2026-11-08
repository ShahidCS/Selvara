# Audits module checklist

Source: `Assurance-GRC-Portal.html` lines 2286-2368 (`REND.audits`, `auditDetail` and helpers). React: `src/components/modules/AuditsModule.tsx`,
`audits/{AuditDetail,AuditModals,util}.tsx`, `src/services/audits.ts`. Route: `/ws/audits` and `/ws/audits/<id>` (`param`).

| source feature | source lines | React file | status | notes |
|---|---|---|---|---|
| List grouped by `DATA.auditStages` (grouprow + count tag), empty stages skipped | 2293-2303 | AuditsModule | done | row = `activate()` (keyboard); progress bar clamped 0-100 |
| Auditor view: pool filtered to `/External/` lead, intro card, "Information requests" toast action | 2291-2306 | AuditsModule | done | role from `useApp` |
| Non-auditor action "New audit" | 2306 | AuditsModule | done | |
| New audit modal + "Audit name is required." | 2354-2359 | AuditModals `NewAuditForm` | done | framework options incl. "-"; enum-checked; lead `Internal, J. Avery` (anonymised); defaults `Internal Audit` / `To be defined` / `Planning`; navigates to `/ws/audits/<id>`; wsLog `audit.created` |
| Detail header (Back, name, sub, stage chip) | 2316 | AuditDetail | done | |
| Unknown id -> not found | 2312 | `AuditNotFound` | done | same copy as source `renderNotFound` ("Page not found") |
| Tabs Overview / Requests (PBC) / Control testing / Findings (+count tag); tab persisted (`AUDT`) | 2317-2319 | AuditDetail, `useModState("audits.tab")` | done | |
| Page actions: Generate report; Advance stage (hidden when Complete) | 2321 | AuditDetail | done | |
| Overview KPIs, meta grid | 2324-2331 | AuditDetail | done | |
| Auditor access & populations panel + chips | 2332-2337 | AuditDetail | done | |
| Manage buttons gated by `auditCanManage` (not auditor AND super/admin/owner/analyst); read-only note otherwise | 2290, 2335-2337 | `auditCanManage`, AuditDetail | done | handlers re-check the gate (extra defence, same visible behaviour) |
| Send to auditor / Freeze populations / Complete & end auditor access | 2288-2290 | AuditDetail, `svc.grantAuditorAccess/freezePopulations/endAuditorAccess` | done | wsLog + toasts verbatim |
| PBC tab: table, status mapping (Received->Done, Outstanding->Overdue, else Pending), empty state | 2339-2341 | AuditDetail | done | |
| Cycle PBC status Requested->Outstanding->Received | 2349 | `svc.cyclePbc` | done | wsLog `audit.pbc.updated` |
| Add request modal + "Request description is required." | 2350-2352 | AuditModals `AddPbcForm` | done | owner default `J. Avery` (anonymised); id `PBC-(50+n)`; switches to PBC tab |
| Control testing tab (Exception shown as Fail), empty state | 2342-2343 | AuditDetail | done | |
| Findings tab: table, linked-issue link, "Create issue" (hidden if linked or Closed), empty state | 2344-2345 | AuditDetail | done | link goes to `/ws/issues` (source does not deep-link) |
| Finding -> issue | 2353 | `svc.promoteFinding` | done | `R-(60+n)`, owner = lead minus "Internal/External, " prefix, due `Due 14d`; wsLog `audit.finding.promoted` |
| Advance stage (progress 0/40/85/100) | 2347 | `svc.advanceStage` | done | |
| Audit report summary modal + Export (`<id>-report.txt`) | 2360-2367 | AuditModals `AuditReportBody`, AuditDetail | done | text/plain via `downloadText`; name via `safeFileName`; see Open questions (adminLog) |

## Open questions
1. **`adminLog('audit.report.generated', name, {categories:['Audit'], basis:'Legal obligation'})`**: the source writes the report export to the *admin* hash chain (`ADMIN_AUDIT`). That chain is not yet in React (AdminLog is Phase 4; no `adminLog` lib exists). I log `wsLog("audit.report.generated", ...)` to the workspace chain instead. Wire the admin-chain call (with the same categories/basis) when the lib lands (marked by a comment in `AuditDetail.tsx`).
2. **No role gate on most mutations.** In the source only the auditor-access/freeze/end buttons are gated. "Advance stage", "Add request", PBC "Advance", "Create issue" and "New audit" are available to every role that can reach the module, including `auditor`, although the auditor intro text says they "cannot change the organisation's own records". Ported as-is (no invented policy); decide the intended rule.
3. "Information requests" (auditor) only shows a toast; no real screen exists.
4. Linked-issue link opens the Issues list, not the issue.
5. The audits tab (`AUDT`) is global, not per audit (kept).
6. `period`, `lead`, `opened` mix formats ("12 Mar 2027" vs "2026-11-08" from `nowStamp`); kept.
7. Audits in a stage that is not in `DATA.auditStages` are invisible in the list (source behaviour).
8. "Complete & end auditor access" sets stage `Complete` and progress 100 without checking open findings/PBC items.

## Security notes
**UI-enforced only (the real API must enforce):**
- All role gates (`auditCanManage`, auditor pool filter `/External/`). The auditor pool filter is a visibility rule on the client; the API must scope audits to the auditor's engagements (IDOR: any id typed in `/ws/audits/<id>` is looked up in `DATA`, so the API must authorize per audit).
- "Ending auditor access" and "freeze populations" must be enforced server-side (revoking the external auditor's session/read grants, making sampled records immutable); the UI flag is cosmetic.
- Ungated actions listed in Open question 2 are destructive/state-changing; the API must apply policy.
**Source behaviour handled without changing what users see:**
- Source built `onclick` strings with ids/names (`onclick="...adminLog('...','${esc(a.name)}'...)"`), an injection vector for names containing quotes. React handlers use closures; nothing is string-built.
- URL param is looked up in `DATA.audits`; unknown -> "Page not found". The route id is URL-encoded when navigating.
- `PBC-`/`AUD-`/`R-` ids are demo counters (`Math.random` is not used); new ids bump past existing ones to avoid duplicate ids after deletions. Not security tokens.
- Free text is clamped with `clampText` (name 120, auditor 120, scope 500, request 300, owner 80) and rendered only as React text. No HTML, no `eval`.
- Report export is plain text (`text/plain`), file name through `safeFileName`; report modal values are React text. No CSV export in this module.
- All service calls are wrapped in try/catch with a generic toast (no raw error text). Every `wsLog` call from the source is kept; actor comes from `getMe()`.
- No file/evidence upload exists in this source module (PBC items are text requests only), so `validateUpload` is not used; if evidence attach is added it must use `validateUpload` + `safeFileName`.
