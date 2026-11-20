# Functionality inventory, group 3: Risk, Issues, Work, Overview, Reports (demonstration build)

Source tree: `/home/user/Selvara/front-end/src` (paths below are relative to it unless they start with `docs/`, `e2e/` or `tests/`).
Read-only inventory; nothing in the repository was modified. Line numbers are as of this reading.

Conventions used below (same as groups 1 and 2):
- "REF" = reference/catalogue data (same for every company). "CO" = per-company record (tenant data). "SIM" = simulated / demo-only behaviour.
- Audit = `wsLog(action, target, cat)` (`lib/audit.ts:39-45`): appends `{seq, prev, hash, at: nowStamp() (local "YYYY-MM-DD HH:MM"), actor: getMe().name, action, target, cat}` to the hash-chained workspace log (FNV-1a demo chain, `lib/audit.ts:9-13`). In API mode `wsLog` builds the entry but does not store it (`:43`): the server must write it. Categories used in this group: Risk `"Risk"`; Issues `"Control"` (not "Issue"); Reports `"System"`; board pack `"Policy"`; vendor request from My Work `"Vendor"`; access request from My Work `"Access"`; approvals engine `"Approval"`. Audit Log filter categories are `All, RoPA, Control, Access, Policy, Vendor, Risk, System` (`features/auditlog/services/auditlog.ts:16`); RoPA mapping sends `risk*`/cat Risk to PA-06, cat Control to PA-04, `vendor*` to PA-07, anything with `export`/`snapshot` in the action to PA-15 only when no earlier rule matched (`lib/ropa.ts:17-25`).
- **Where the audit call lives matters for the server.** In Risk and Issues many `wsLog` calls are made by the **UI component after the service returns** (not inside the service). They are marked "(UI)" below. The server must write all of them itself.
- Roles: base role = role id without trailing `2` (`lib/sod.ts:10-11`). Personas (`data/roles.json`): admin Jordan Avery, admin2 Casey Morgan, owner Owen Hart, owner2 Taylor Reed, analyst Sam Lee, auditor Morgan Blake, employee Priya Nair, vendor Grace Lin, viewer Lee Park; super/super2/support have no workspace space.
- Name matching: Risk uses `isSamePerson` (`lib/sod.ts:26`, via `assertNotSelf`/`sodReason`/`isMe`, same `personKey` = first initial + surname); Issues uses `samePerson` (`lib/grcSod.ts:18-30`, looser: also matches when one surname is an initial); the approvals engine compares `personKey`s (`lib/approvals.ts:42-45`). Seed owners are short forms ("J. Avery", "O. Hart", "N. Kim", "A. Rivera", "P. Nair"); "N. Kim" and "A. Rivera" match no persona. Production must compare user ids (`docs/architecture/PRODUCTION_PROGRAMME.md:39`).
- Error contract: Risk services return `{ok:false, msg}` for validation/permission failures (`features/risk/services/risks.ts:20-22`, `DENIED = "You do not have permission to do this"`, `NOT_FOUND = "Risk not found"`) **and** throw `SodError` for segregation-of-duties failures; UI shows `msg`, or SodError text via `attemptR` (`features/risk/util.ts:5-7`), else "Something went wrong. Please try again.". Some risk tabs use the issues `attempt` (`features/issues/util.ts:4-6`) which shows **only** the generic text for any thrown error (Interested parties, Governance, Add risk, Add action). Issues services throw `SodError` (`guard`, `lib/grcSod.ts:43-46`); UI shows `uiMessage(e)` (`lib/grcSod.ts:11`). Reports use `attempt` from `components/kit/sodKit.tsx:13-18`.
- `viaApi(mock, real)` (`services/http.ts:19-21`): mock branch mutates memory, real branch calls the REST path listed per action as "API stub". **Overview, Work (vendor request), the risk import withdraw, and the board pack have no `viaApi` at all** (marked "none").
- Approval ids: `"AP-" + n`, n from 101, one counter per session (`lib/approvals.ts:20`).

---

## 0. Cross-cutting: module access, routing, shared state, engines

### 0.1 Who can open each module (`data/roles.json` ROLE_MODS; `modAllowed`, `lib/rbac.ts:34-38`)
| Module | admin / admin2 | owner / owner2 | analyst | auditor | employee | vendor | viewer | super/support |
|---|---|---|---|---|---|---|---|---|
| risk | yes (`"*"`) | yes | yes | **no** | **no** | no | no | no (no ws space) |
| issues | yes | yes | yes | **no** | no | no | no | no |
| work (My Work) | yes | yes | yes | **no** | **yes** | no | no | no |
| overview | yes | yes | yes | **yes** | **yes** | no | no | no |
| reports | yes | yes | **no** | no | no | no | no | no |

- In production (`API_ON`) a module is also hidden until listed in `SERVER_READY.ws` (`lib/rbac.ts:30`; today `team, frameworks, controls, evidence, policies, people, access, me`). Group 3 must add `risk`, `issues`, `work`, `overview`, `reports`. Unit test asserts risk is not server-ready yet (`tests/unit/rbac.test.ts:17`); it must be updated.
- e2e: employee is redirected from `/ws/risk` to `/ws/overview` or `/ws/me` (`e2e/readonly.spec.ts:22-27`); auditor cannot reach `/ws/risk` (`:44-50`) or `/ws/issues` (`e2e/datatable.spec.ts:117-123`).
- Nav (`data/nav.json`): group "Overview" holds Overview, My Workspace, My Work, Reports (`:4-27`); group "Assurance" holds Issues (`:58-60`); group "Internal Risk" holds "Risk Register" (`:78-80`). Page titles/subtitles (`data/nav.json` TITLE, `:209-256`): Overview "Security posture at a glance" (the page overrides the title, see 4.2), My Work "Items assigned to you across the programme", Reports "Generate and export assurance reports", Issues "Remediation actions and findings", Risk Register "Enterprise risk, scored and treated".
- Risk is an accordion parent in the sidebar: sub-items Dashboard, Register, Scoring Criteria, Interested Parties, Governance share mod-state key `risk.tab` with the in-page tab bar (`lib/subnav.ts:5`).
- In-module write gates differ from module access:
  - Risk edit = `riskCanEdit` = base `super|admin|owner|analyst` (`lib/risk.ts:91`); effective: admin, owner, analyst (= every role with the module). Risk approve / request changes / snapshots = `riskCanApprove` = base `super|admin` (`:92`); effective: **admin only**. Board-evidence acceptance recording = admin (`assertRole`); Board-evidence verification = admin or owner; import decision = admin.
  - Issues writers = admin/owner/analyst (`features/issues/services/issues.ts:15`) = every role with the module; owner/due/severity changes, reopen and delete = admin/owner; closure verification = admin/owner/analyst.
  - Reports schedule/remove/generate = admin/owner (= every role with the module); approving external distribution = **admin only**.
  - Overview and Work have no write gates (every viewer may export the board pack; every Work viewer may raise an access or vendor request).

### 0.2 Routing (`lib/route.ts`, `pages/ws/[[...slug]].tsx`, `features/registry.ts:13-24`)
- `/ws/risk` only. Tabs and the selected risk are **module state, not routes**: `risk.tab` (`dash|reg|crit|ip|gov`, default `dash`), `risk.sel` (selected risk id, detail panel under the register), `risk.heat` (`inh|cur|res`, default `cur`), `risk.rf` (register filter) (`features/risk/nav.ts:5-11`). There is **no deep link to a risk**. Leaving the Register tab clears the selection (`RiskModule.tsx:43-44`). `useRiskDrawer()` (`RiskModule.tsx:25-30`) navigates to `/ws/risk` with a risk open but is **not used by any module**.
- `/ws/issues` (register), `/ws/issues/new`, `/ws/issues/:id`, `/ws/issues/:id/edit` (`features/issues/IssuesModule.tsx:20-27`). Any other `sub` renders the record page. Unknown id: "Issue not found" / "No such issue" (`IssueDetail.tsx:23`; e2e `records.spec.ts:65-68`). Form pages use the unsaved-changes guard (`IssueFormPage.tsx:22`; e2e `records.spec.ts:53-63`).
- `/ws/work`, `/ws/overview`, `/ws/reports`: single pages, no sub-routes.
- Overview is the landing page for most roles (e2e `login.spec.ts:47`, `account-security.spec.ts:31`).

### 0.3 Shared list kit
- Issues register uses `DataTable` (id `issues`, export `issues.csv`, tabs Open / In progress / Closed + All, filters Severity and Owner, row actions "Open issue" / "Copy ID") (`IssuesModule.tsx:61-65`). "Export selected" is **not audited** (as in groups 1-2). e2e `datatable.spec.ts:7-115`.
- Risk register, risk dashboard tables, Work tables and Reports tables use the plain `Table`, **not `DataTable`** (no paging, no export-selected, no column menu): `RiskRegister.tsx:69`, `RiskDash.tsx:24,135`, `WorkModule.tsx:36`, `ReportsModule.tsx:55,69`. Risk register filters are hand-built selects (`RiskRegister.tsx:11-18,52-61`). This departs from the AGENTS.md kit convention.
- Charts from the kit: `KpiStrip`/`KpiTile`, `DonutChart` (Risk), `LineChart`, `HBarList` (Overview, Reports). Work uses the older `Kpi` tiles (`WorkModule.tsx:26-31`). The risk heat map and Overview coverage grid are hand-built CSS grids.

### 0.4 In-memory state the server must replace
| Store | Source | Contents |
|---|---|---|
| `DATA.risks` | `data/seed.json:1520` (12 rows RK-01..RK-12), clone `lib/data.ts:18` | risk register, normalised lazily by `riskNorm` |
| `RISK_PARTIES` | `data/riskRef.json` RISK_PARTIES (5), mutable clone `lib/risk.ts:57` | interested parties with linked risk ids (one global list) |
| `RISK_ENT` | `data/riskRef.json` RISK_ENT (5), `lib/risk.ts:54` | enterprise risks ENT-1..5 with child risk ids (static) |
| `RISK_SNAPSHOTS` | `lib/risk.ts:59` (empty) | register snapshots (id, at, count, scope, hash, by, shared) |
| `RISK_JUR`, `CAT_TEAM`, `ACCEPT_AUTH`, `ACCEPT_RANK` | `data/riskRef.json` | REF tables (jurisdiction per seed id is really CO) |
| `DATA.issues` | `data/seed.json:1470` (6 rows) | issues |
| `DATA.reports` | `data/seed.json:2076` (5 rows) | stored report types (REF-like catalogue) |
| `SCHED_PACKS`, `REPORT_FREQ` | `data/trustSeed.json` via `lib/trustData.ts:37-39` | report schedules (3 seed) and frequency enum |
| `requestIds` map | `features/reports/services/reports.ts:38` | pack name -> pending external-distribution approval id (session only) |
| `VENDOR_REQS` | `data/vendorReqSeed.json` via `lib/requests.ts:10` | vendor requests raised from My Work (consumed by Vendors, group 4) |
| `ACCESS_REQUESTS` | `lib/requests.ts:7` | access requests raised from My Work (group 2) |
| `DATA.kpis` | `data/seed.json:2` | **unused** by any code (dead seed) |
| `approvals` store | `lib/approvals.ts:19` | kinds `risk.board-evidence`, `risk.import`, `issue.close`, `report.distribution` |
| approvalKit `handlers` | `lib/approvalKit.ts:16` | `report.distribution` handler, registered when the Reports service module is first loaded (lazy) |
| mod-state | `lib/store.ts:82-94` | `risk.tab`, `risk.sel`, `risk.heat`, `risk.rf`, `issues.view` (`table|kanban`), `dt.issues`, `access.view` (set by My Work), `shell.notifRead` |

In API mode `DATA` starts empty for every collection and is filled by `services/ws.ts` `LOADERS` per server-ready module (`services/ws.ts:24-62`); there is no loader yet for risks, issues, reports, schedules, parties, snapshots, or the group-3 approval kinds (`setApprovals`, `:63-65`).

### 0.5 Approvals engine use in this group (`lib/approvals.ts`, `lib/rules.ts`)
Engine record and rules are as in groups 1-2 (`lib/approvals.ts:11-18,23-69`; `approvalBlock`, `withdrawBlock`, `reasonBlock` `lib/rules.ts:29-44`): approve needs reason >= 10 (`REASON_MIN`), reject has **no** length check in the engine, requester can never decide, `forbid` people can never decide, repeat voters refused, expiry swept by `sweepExpired` (audits `approval.<kind>.expired`), default TTL 24 h (`lib/approvals.ts:28`).

| Kind | Raised by | needs | approverRoles | forbid | TTL | Decided where | Effect applied by |
|---|---|---|---|---|---|---|---|
| `risk.board-evidence` | `acceptRisk` residual > 15 (`risks.ts:154-158`) | 1 | admin, owner | risk owner, lastEditedBy, submittedBy (requester = recorder is excluded by the engine) | 72 h | Risk detail VerifyBox | `finalizeBoardAcceptance` in the risk service (`:177-187`) or `syncBoardEvidence` (`:226-238`) |
| `risk.import` | `commitRiskImport` when any row updates an existing id (`riskImport.ts:23-27`) | 1 | admin | importer | 72 h | Register tab "Pending imports" panel | `decideRiskImport` -> `applyImport` (`riskImport.ts:39-59`) |
| `issue.close` | `proposeClosure` (`issues.ts:106`) | 1 | admin, owner, analyst | issue owner, assignee (requester = proposer excluded by the engine) | 14 days | Issue page banner | `decideClosure` (`:112-122`) |
| `report.distribution` | `saveSchedule` with an external recipient (`reports.ts:58`) | 1 | admin | none (only the requester) | 24 h (default) | Reports `ApprovalsPanel` **and the bell** | approvalKit handler `apply` (`reports.ts:41-49`) via `decideApproval` (`lib/approvalKit.ts:26-50`) |

### 0.6 Notifications, bell, nav badges
- `notificationsFor` (`lib/notifications.ts:31-73`) produces, for this group, **only overdue issues**: for roles that can open `issues`, one alert per issue with `status !== "Closed"` and `/Overdue/.test(due)`: `{id "iss:<id>", tone bad, icon issues, title <issue title>, detail "<id>, <owner>, <due lowercased>", path "/ws/issues/<id>", cat "issues"}` (`:49-53`). Category `issues` = "Overdue issues", switchable per persona (`lib/notifPrefs.ts:17`). Seed: R-014, R-036, R-052.
- **No notifications** for: risks of any kind (no failing-mapped-control alert although the risk detail says "The owner is alerted when a mapped control fails", `RiskDetail.tsx:252`), acceptances expiring within 60 days, pending Board evidence, pending risk imports, pending issue closures, issues due soon, report schedules.
- Inline bell decisions (`lib/inboxApprovals.ts:12`): kinds starting `report.` are decidable from the bell (home module `reports`), subject to `modAllowed(role,"ws","reports")`, `hasRole(role, ...approverRoles)` (admin only), `whyCannotApprove === null`, not expired, and `hasApprovalHandler(kind)` (`:17-24`). Because the handler is registered at module load of `features/reports/services/reports.ts` (lazy), a pending `report.distribution` request is only listed in a session that has loaded Reports. `risk.board-evidence`, `risk.import` and `issue.close` are **not** inline kinds; they are decided on their records (asserted by `e2e/inbox-approvals.spec.ts:67-77`, which forbids "Risk" in any bell Approve/Reject label). Decisions from the bell use `decide` -> `decideApproval` (reason >= 10 for approve and reject) exactly like the Reports panel (SOD_MATRIX line 77).
- Nav badges (`lib/counts.ts:5-11`): `issues` = number of issues with `status !== "Closed"` (seed 6); `work` = number of issues whose owner contains "Avery", **or 5 when that is 0** (SIM; seed has no Avery-owned issue, so the badge always shows 5); none for risk, overview, reports.

### 0.7 Data this group reads from other groups (server dependencies)
| Consumer | Reads | Owning group |
|---|---|---|
| Risk detail: map control picker, mapped-control status, "failing" banner, open control | `DATA.controls` (id, title, status) | 1 |
| Risk governance snapshot "Shared with auditor" | `DATA.audits[].stage` in Fieldwork/Planned | 5 |
| Issues: link control picker, control chip opens `/ws/controls/:id` | `DATA.controls` | 1 |
| Issues delete guard | `DATA.audits[].findings[].issue` | 5 |
| Issues created elsewhere | `promoteFinding` (`services/audits.ts:118-130`), AI signal "Raise issue" (`features/ai/services/ai.ts:258-266`), Team automation rule `create.issue` (`features/team/services/governance.ts:84-98`) | 5, 6, Team |
| Risks created elsewhere | AI signal "Raise risk" (`features/ai/services/ai.ts:246-256`) | 6 |
| Overview KPIs and cards | `metrics()` over frameworks/controls (`fwReadiness`, status), risks, issues, audits, vendors; `covCell` over controls `domain`/`map`/`status` | 1, 3, 5, 4 |
| Board pack | same as Overview plus audits `fw`, `progress` | 1, 3, 4, 5 |
| Reports KPI and trend | `metrics().compliance` | 1 |
| Work "Request access" | `services/access.ts createRequest` | 2 |
| Work "Request a new vendor" | `VENDOR_REQS`, decided in Vendors | 4 |
| Assistant drafts | `DATA.risks` count and "high" count `rl*ri >= 12 || l*i >= 16` (`features/assistant/services/assistant.ts:97`) | 6 |

Until groups 4 and 5 are on the server, `DATA.vendors` and `DATA.audits` are empty in API mode, so Overview "Upcoming audits", "Vendor reviews due", the overdue-vendor feed, "Audits in motion", the board pack audit table, the snapshot "shared" flag and the issues audit-finding delete guard all silently read empty data. `metrics().compliance` divides by `Σ f.controls`; with no frameworks it is `NaN` (`lib/metrics.ts:14`).

---

## 1. RISK (register, dashboard, risk detail, criteria, parties, governance, import)

### 1.1 Data model

**A. Risk** (`DATA.risks`, seed 12) - CO
| Field | Type | Notes |
|---|---|---|
| `id` | string `RK-NN` | new: `"RK-" + pad2(count+1)`, bumped until unique (`features/risk/services/risks.ts:40-41`); import may keep a file id matching `^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$` (`import/convert.ts:12,81-86`); AI raise uses the same `RK-` scheme (`features/ai/services/ai.ts:250-251`) |
| `title` | string | required, max 200 (create), 500 (import) |
| `desc` | string | max 1000 (create); import appends "Existing controls: <text>" (max 2000) |
| `cat` | enum `RISK_CATS` Technology, People, Third party, AI, Operational, Compliance, AML (`lib/risk.ts:48`) | invalid -> first entry (create) or "Operational" with a warning (import) |
| `team` | string | default `CAT_TEAM[cat]` or "Operations" (`lib/risk.ts:70`); never editable in the UI |
| `jur` | string | default `RISK_JUR[id]` or "Global" (`:71`); seed map RK-03 UAE, RK-07 EU, RK-10 UAE, RK-12 Pakistan, RK-08 Global; never editable |
| `register` | string | default "Information Security" (`:72`); never editable |
| `owner` | string (name) | free text, max 100; default "Unassigned" (create) |
| `l`, `i` | int 1..5 | inherent likelihood/impact |
| `cl`, `ci` | int 1..5 | current likelihood/impact; default `max(rl, l-1)`, `max(ri, i-1)` at create, normalise and on every import update (`:68-69`, `risks.ts:45`, `convert.ts:112`) |
| `rl`, `ri` | int 1..5 | residual (target) likelihood/impact |
| `status` | enum `Open` \| `In review` \| `Accepted` \| `Closed` (`lib/risk.ts:50`) | |
| `treat` | enum `Mitigate` \| `Transfer` \| `Accept` \| `Avoid` (`:49`) | set to Accept on acceptance, Mitigate on reopen/invalidation |
| `review` | enum `Draft` \| `Submitted` \| `Approved` \| `Changes requested` | approval workflow state, separate from `status`; normalise default: `status === "In review"` -> Submitted, else Approved (`:73`) |
| `linked` | string[] control ids | mapped platform controls; seed ids all exist in `DATA.controls` |
| `identified`, `reviewed` | date string | seed "DD Mon YYYY"; code writes ISO `YYYY-MM-DD` (mixed formats) |
| `parent` | `{id, title}` | from `RISK_ENT` kids lists (`:74-75`); only seed ids ever get one |
| `history` | `{ts ISO date, by name, a text}[]` | per-risk log (`riskLog`, `:94-97`); normalise seeds two synthetic entries (`:76`) |
| `actions` | `{text ≤300, owner ≤100, due ISO or "", done bool, cancelled?, cancelReason? ≤300, at?}[]` | treatment actions; `at` stamped on every action lacking it when all are done/cancelled (`risks.ts:88-91`) |
| `planned` | ISO date | set only by import "Due date" (`convert.ts:119,128`) |
| `acceptance` | object | effective acceptance (B) |
| `pendingAcceptance` | object | Board acceptance awaiting verification (C) |
| `invalidatedAcceptance` | object | last acceptance withdrawn by a score change: acceptance fields + `invalidatedAt`, `invalidatedReason` (`lib/risk.ts:117`) |
| `lastEditedBy` | name | set by `touch` (`risks.ts:29`): create, setScore, map, unmap, toggleAction, addAction, submit, reopen, cancelAction; import sets it to the importer (`convert.ts:118,129`). **Not** set by approve, request changes, accept, close, link party |
| `submittedBy` | name | set on submit (`risks.ts:111`) |
| `imported` | bool | new rows from import; shows "Imported" tag (`RiskRegister.tsx:73`) |
| `_n` | bool | normalisation marker (`lib/risk.ts:85`); must not be persisted as data |

**B. Acceptance** (`r.acceptance`) - CO
Ladder (residual <= 15): `{by authority, at ISO, until ISO, note rationale ≤1000, comp ≤500, recordedBy name, score residual}` (`risks.ts:170`). Board (residual > 15, after verification): pending fields + `board: {ref, date, body, minutes, verifiedBy, verifiedAt, approvalId}` (`:183`). Legacy (seed, created by `riskNorm` for `status Accepted` without acceptance): `{by ACCEPT_AUTH[band of residual], at reviewed, until reviewed + 300 days, note "Residual within appetite; accepted by management pending next annual review.", comp "Monitored under continuity and third-party controls."}`, no `recordedBy`, no `score` (`lib/risk.ts:77-84`). Seed RK-11 (residual 6, Medium) gets `by "Department head"`.

**C. Pending Board acceptance** (`r.pendingAcceptance`, `risks.ts:159`) - CO
`{by "Board / CEO", at, until, note, comp, recordedBy, score, board: {ref BRD-YYYY-NN, date ISO, body, minutes}, approvalId}`.

**D. Interested party** (`RISK_PARTIES`) - CO (seeded as REF): `{party ≤200, req ≤500 (default "—"), loc ≤100 (default "Global"), links risk ids[]}`. Addressed **by array index** (`risks.ts:282-298`). Seed: 5 parties.

**E. Enterprise risk** (`RISK_ENT`) - static: `{id ENT-n, title, owner, kids risk ids}`; ENT-1..5 cover the 12 seed risks. No UI to edit; new risks never join one.

**F. Snapshot** (`RISK_SNAPSHOTS`) - CO: `{id "RS-" + pad3(count+1), at nowStamp, count, scope "Approved risks"|"All risks", hash 12 hex, by name, shared bool}` (`risks.ts:317`). **The snapshot stores no risk content, only the hash.**

**G. Reference constants** - REF
- Scales `Lb` Rare, Unlikely, Possible, Likely, Almost certain; `Ib` Insignificant, Minor, Moderate, Major, Severe (`lib/risk.ts:18-19`); definitions text `RiskCrit.tsx:6-7`.
- Bands `RBANDS`: Low 1-5, Medium 6-10, High 11-19, Extreme 20-25 (`lib/risk.ts:24-29`); band colours are **hex literals** `#217A4A #846200 #A34708 #B4231E` (also duplicated in `import/riskLocal.ts:10-13`).
- `RISK_APPETITE = 11` (`:32`): heat-map outline and "above appetite" on the dashboard and board pack (current score).
- `SOD.RISK_BOARD_THRESHOLD = 15`, `SOD.RISK_MAX_ACCEPT_MONTHS = 12` (`lib/sod.ts:46-47`).
- `ACCEPT_AUTH` Low "Risk owner", Medium "Department head", High "CISO", Extreme "Board / CEO"; `ACCEPT_RANK` 0..3 (`data/riskRef.json`).
- Board evidence: bodies "Board of Directors", "Board Risk Committee"; ref `/^BRD-\d{4}-\d{2}$/`; max age 90 days; minutes extensions pdf, docx, png, jpg; 10 MB (`lib/riskBoard.ts:7-12`). `BOARD_REASON_MIN = 20` is declared but the service uses the literal 20 (`risks.ts:151`).

### 1.2 Screens and routes (`/ws/risk`, `RiskModule.tsx`)
Page actions (`RiskModule.tsx:62-68`): Import (editors), Export (**every role with the module**), Add risk (editors). Tab bar Dashboard / Register / Scoring Criteria / Interested Parties / Governance (`:32,71-73`). On every render `riskNormAll()` runs (`:37`) and on every data change `syncBoardEvidence()` runs (`:47`).

**Dashboard** (`RiskDash.tsx`)
- KPI strip "Risk summary" (`:98-104`): Open risks (open count; caption "<n> on the register"); Above appetite (High+) (open with current >= 11; delta "Needs treatment"/"None"; caption "Current rating"); Awaiting approval (`review === "Submitted"`, all risks; delta "Needs a decision"); Accepted and valid (risks with `acceptance`, **expired or not**; caption "Within their expiry"); No control mapped (open with empty `linked`; delta "Data gap"/"None").
- Current exposure and Residual exposure tables (`DistBlock`, `:16-35`): per band count of open risks by current/residual score, "% of open" = `round(count / max(open,1) * 100)`, CRIT label (Routine/Standard/Priority/Critical) and action text; total row "Accepted & closed excluded". Row click -> Register filtered by rating.
- Heat map (`:68-80,110-124`) with Inherent/Current/Residual toggle (`risk.heat`): 5x5, cell number = open risks at (likelihood, impact) for the view; colour = band of `l*i`; outline when score >= 11; cell click -> Register with `cell` filter.
- Risk status cards Open / In review / Accepted / Closed (counts over all risks; click filters by status) and donut "Current rating of open risks" (tones Low ok, Medium warn, High bad, Extreme ink) (`:81-88,125-128`).
- Breakdowns By category / By team / By jurisdiction (open risks, groups sorted by size, bar = current-band mix; click filters) (`:37-58,130`).
- Treatment plan (`:90-94,131-145`): see 1.4.

**Register** (`RiskRegister.tsx`)
- "Pending imports" panel at the top when any `risk.import` approval is Pending and the viewer can edit or is admin (`PendingImports.tsx:18-19`).
- Filters (`:52-66`): Search (max 100; matches id, title, cat, team, desc), Rating, Status, Category, Team, Jurisdiction (option lists from data), "Only mine" (owner matches `/Avery/`, independent of the signed-in persona, `:34`), heat-cell chip, "Clear filters"; "<n> of <total> risks".
- Table (`:69-79`): ID, Risk (title, category, parent id, Imported tag), Team, Jurisdiction, Inherent, Current, Residual (score chips), Priority, Treatment, Status. Sorted by current score descending. Empty state "No risks match this view". Row click toggles the detail panel below (`riskOpenDetail`, `nav.ts:20-29`).

**Risk detail panel** (`RiskDetail.tsx`), shown below the register
- Not found: "Risk not found." with Close (`:130-133`).
- Header: "<id> · <cat> · <register> · <parent>", title, chips: review state, status, "Board approved · ref · date" (effective Board acceptance), "Awaiting evidence verification", Inherent/Current/Residual band pills, "Priority Pn"; "Accountable <owner> (<team>, <jur>)" (`:221-233`).
- Approval progress stepper Draft / Submitted / Approved (`Changes requested` shows step 0) (`:136,234-240`).
- Banners: failing mapped controls (role alert, `:242`); "Data quality:" checks (`:142-145,243`).
- Workflow block (`:206-217`): Draft/Changes requested -> "Submit for approval" (editors; else read-only text); Submitted -> admins see a note field (max 500), Approve (disabled with SoD reason) and Request changes; others "Submitted for approval. Awaiting a company admin."; Approved -> nothing.
- Three score cards Inherent / Current / Residual with likelihood/impact selects (editors) (`:110-120,245-249`).
- Mapped platform controls (open control via `useOpenControl`, status chip, Unmap; picker of unmapped controls + "Map control"; "No platform control mapped. Map at least one before approval.") (`:251-269`).
- Treatment actions (checkbox toggle, Cancel per open action, "Add action", "All actions complete — exposure at residual.") (`:270-281`).
- Risk acceptance block (`:172-204,284-292`): effective acceptance card (+ "Reopen risk" for editors); or VerifyBox for a pending Board acceptance; or the AcceptForm (editors, open risk) with required authority/Board text and any invalidated-acceptance note; or "Read-only: your role cannot record risk acceptance."; plus "Reason for closing" (max 300) + "Close risk" (disabled with `closeBlock` reason) for editors on open risks.
- Interested parties linked to the risk and History (newest first) (`:293-301`).

**AcceptForm** (`:31-72`): residual <= 15: "Accepting authority" select of Risk owner / Department head / CISO (Board / CEO not offered, `:28`), default = required authority; residual > 15: Board decision reference (max 20), Decision date, Approving body, "Minutes reference or file name" (max 120) or file input (`.pdf,.docx,.png,.jpg`; only the name and size are used, "Only the file name is kept."). Both: "Valid until (max 12 months)" default today+180, Rationale/Reason (max 1000; label "Reason (at least 20 characters)" for Board), Compensating controls (max 500). Inputs disabled with the SoD/role reason. Button "Record acceptance" / "Record Board evidence". Form keyed by id + required authority + Board flag (fields reset when the band changes).

**VerifyBox** (`:74-108`): evidence summary, "Recorded by … · valid until … · request AP-n"; for the recorder or any admin/owner: Reason (max 300), "Verify evidence", "Reject evidence" (disabled with reason), and "Withdraw" for the recorder.

**Scoring Criteria** (`RiskCrit.tsx`): static method text, likelihood and impact scale tables, 5x5 matrix with scores, acceptance criteria per band with lowest authority, threshold text (15 / Board evidence), appetite text "residual exposure at Medium or below".

**Interested Parties** (`RiskParties.tsx`): table party / requirement / location / linked risk tags (click opens the risk); editors get "×" unlink per tag, "+ Link risk" select, and an add form (party, requirement, location, "Add party"); others "Read-only: your role cannot edit interested parties."

**Governance** (`RiskGov.tsx`): Register details (static: name, method ISO/IEC 27005:2022, scale, Owner "J. Avery, CISO", counts, "Last reviewed" = **today**, appetite text); Enterprise risks cards with "Top" = max current score of children and child buttons; Register snapshots (admins: "Snapshot approved", "Snapshot all"; list with hash, by, "Shared with auditor"/"Not in audit window"); Risk acceptances list (every risk with `acceptance`, chip "Expires <60d" or "Valid", Board ref, residual, until).

**Add risk modal** (`RiskForms.tsx:17-56`): Risk title* (max 200), Description (1000), Category, Owner (default "J. Avery", max 100), inherent L/I (default 3/3), residual L/I (default 2/2), Treatment (default Mitigate); "Add as draft". On success switches to Register with the new risk selected.

**Import wizard**: see 1.5.

### 1.3 User actions
Gates: E = `riskCanEdit` (admin/owner/analyst); A = `riskCanApprove` (admin). "(UI)" = audit written by the component, not the service.

| # | Action | Who | Validation | SoD / four-eyes | Audit | API stub |
|---|---|---|---|---|---|---|
| R1 | Add risk (`RiskForms.tsx:22-28`, `risks.ts:35-50`) | E | title `clampText` 200 required ("Risk title is required."); desc 1000; owner 100 or "Unassigned"; cat/treat allow-lists; scores `trunc` clamped 1..5 (`:31`); cl/ci derived | creator becomes `lastEditedBy` (so cannot later approve/accept/close as last editor) | (UI) `risk.created`, target title (200); toast "Risk <id> added as draft"; status Open, review Draft, identified/reviewed today | `POST /risks` |
| R2 | Change a score (`RiskDetail.tsx:153`, `risks.ts:51-62`) | E | field in `l,i,cl,ci,rl,ri`, value clamped 1..5; any status (even Closed/Accepted) | sets lastEditedBy; re-validates acceptance (`riskRevalidateAcceptance`, R16); cancels a pending acceptance whose residual no longer matches (R17) | history "Score updated (<f>=<v>)"; (UI) `risk.scored` "<id> <field>=<v>"; toast "Acceptance withdrawn: <why>. The risk is Open again." when invalidated; `reviewed` = today; **review state not reset** | `POST /risks/:id/score {field, value}` |
| R3 | Map control (`:154`, `risks.ts:63-73`) | E | control must exist ("Control not found"); not already mapped ("Control already mapped") | lastEditedBy | history "Mapped control <cid>"; (UI) `risk.control.mapped` "<id> ← <cid>"; toast "<cid> mapped" | `POST /risks/:id/controls {controlId}` |
| R4 | Unmap control (`:155`, `risks.ts:74-81`) | E | none (no existence check) | lastEditedBy | history "Unmapped control <cid>"; (UI) `risk.control.unmapped` "<id> ✕ <cid>" | `POST /risks/:id/controls/:cid/delete` |
| R5 | Add treatment action (`RiskForms.tsx:58-80`, `risks.ts:95-105`) | E | text 300 required ("Action is required."); owner 100 (free text); due `isIsoDate` else "" | lastEditedBy | history "Action added: <t>"; (UI) `risk.action.added` "<id>: <t>" | `POST /risks/:id/actions {text, owner, due}` |
| R6 | Toggle action done / reopen (`RiskDetail.tsx:156`, `risks.ts:82-94`) | E | index must exist; refused if cancelled ("This action was cancelled.") | lastEditedBy | when all done/cancelled: history "All treatment actions complete; exposure at residual" and `at` stamps; (UI) `risk.action.done` / `risk.action.reopened` "<id>: <text>". **Scores do not change** when all actions complete (text only) | `POST /risks/:id/actions/:index/toggle` |
| R7 | Cancel action (`RiskForms.tsx:83-101`, `risks.ts:248-257`) | E | not done/cancelled ("This action is already done or cancelled."); reason >= 10, max 300 | lastEditedBy | history "Action cancelled: <text> (<why>)"; (UI) `risk.action.cancelled` "<id>: <text>" | `POST /risks/:id/actions/:index/cancel {reason}` |
| R8 | Submit for approval (`RiskDetail.tsx:157`, `risks.ts:106-114`) | E | at least one mapped control ("Map at least one control before submitting"); **no state check** in the service (UI offers it only from Draft / Changes requested) | sets `submittedBy` and lastEditedBy | review Submitted; status Open -> In review; history "Submitted for approval"; (UI) `risk.submitted` "<id>"; toast | `POST /risks/:id/submit` |
| R9 | Approve (`:158`, `risks.ts:116-124`) | A (admin) | **no state check** in the service (UI only when Submitted) | approver != lastEditedBy, != submittedBy (`assertNotSelf`, SodError "Segregation of duties: you edited or submitted this risk, so a different person must approve it."); button disabled with the same text (`:160`) | review Approved; status In review -> Open; history "Approved"; (UI) `risk.approved` "<id>"; toast "Risk approved" | `POST /risks/:id/approve` |
| R10 | Request changes (`:164`, `risks.ts:125-133`) | A | note required, `clampText` 500 ("A note is required to request changes"); no state check | **no SoD check** (the submitter, if admin, can request changes on their own submission) | review "Changes requested"; **status stays "In review"**; history "Changes requested: <note>"; (UI) `risk.changes_requested` "<id>" (note not in the log) | `POST /risks/:id/request-changes {note}` |
| R11 | Record acceptance, residual <= 15 (`AcceptForm`, `risks.ts:138-175`) | E (admin/owner/analyst) | risk open ("This risk is already accepted or closed."); no pending acceptance; rationale required (1000); comp 500; authority in `ACCEPT_RANK` ("Choose an accepting authority."), not "Board / CEO" ("Board / CEO acceptance applies only above 15 and needs Board approval evidence."), rank >= required for residual band ("Residual rating needs at least <auth> to accept."); `until` optional: if given `validateAcceptExpiry` (real date, > today, <= today+365: "Enter a valid date." / "The acceptance expiry must be in the future." / "Acceptance cannot exceed 12 months (<max>)."); if empty -> today+365 | recorder != owner, != lastEditedBy, != submittedBy (SodError "Segregation of duties: you own, edited or submitted this risk, so a different person must record its acceptance."); **authority is a free choice, not tied to the actor's role** | status Accepted, treat Accept, acceptance B; history "Risk accepted by <auth>"; `risk.accepted` "<id> — <auth> (residual <s>, recorded by <me>)"; toast "Risk <id> accepted" | `POST /risks/:id/accept {by, why, until, comp}` |
| R12 | Record Board evidence, residual > 15 (`risks.ts:148-163`) | **admin only** (`assertRole`; UI reason "Only a company admin can record Board-approved acceptance.") | evidence via `validateBoardEvidence` (`lib/riskBoard.ts:26-51`): ref upper-cased max 20 matching `BRD-YYYY-NN`; date ISO, not future, not older than 90 days; body in list; minutes: attached file passes `validateUpload` (pdf/docx/png/jpg, 10 MB) and is stored as `safeFileName`, else reference text >= 3 chars (max 120), and if it looks like a file name the extension is checked; reason >= 20; `until` **required** and valid (same rule) | same SoD as R11; creates approval `risk.board-evidence` (0.5) | history "Board evidence <ref> recorded for acceptance; awaiting verification (<AP>)"; `risk.board-evidence.recorded` "<id> — Board ref <ref> (<date>, <body>), approval <AP>"; engine `approval.risk.board-evidence.requested`; toast "Board evidence recorded. Awaiting evidence verification by a second person (<AP>)." | same endpoint with `board {ref, date, body, minutes, file}` |
| R13 | Verify Board evidence (`VerifyBox`, `risks.ts:195-213`) | admin/owner | pending exists; reason >= 10, max 300; engine approve (not expired, not requester/forbidden/repeat) | verifier != recordedBy, owner, lastEditedBy, submittedBy (service); UI block omits `submittedBy` (`RiskDetail.tsx:78`) | `risk.board-evidence.verified` "<id> — Board ref <ref>, approval <AP>"; engine `approval.risk.board-evidence.approved`; then finalize: residual unchanged -> status Accepted, treat Accept, acceptance with `board.verifiedBy/At/approvalId`, history "Board evidence <ref> verified by <name>; risk accepted", `risk.accepted` "<id> — Board / CEO (Board ref <ref>, approval <AP>, recorded by <name>)"; residual changed -> `riskCancelPending` (R17) although the approval stays Approved | `POST /risks/:id/board-evidence/decision {decision, reason}` |
| R14 | Reject Board evidence | same | reason >= 10 (service; engine does not check) | same | engine `approval.risk.board-evidence.rejected`; pending removed; history "Board evidence <ref> rejected: <reason>"; `risk.board-evidence.rejected` "<id> — Board ref <ref>, approval <AP>"; toast "Evidence rejected. The acceptance did not take effect." | same |
| R15 | Withdraw Board evidence (`risks.ts:215-224`) | the recorder (engine `withdrawBlock`); button only for the recorder; **no role check** | pending exists | - | engine `approval.risk.board-evidence.withdrawn`; history "Board evidence <ref> withdrawn by recorder"; `risk.board-evidence.withdrawn` | `POST /risks/:id/board-evidence/withdraw` |
| R16 | Acceptance invalidation (automatic, `lib/risk.ts:111-122`) | runs inside R2 and import updates | if residual band index > accepted band index (`acc.score` band, or for legacy records the highest band the authority may accept), or residual > 15 without `board` | - | `invalidatedAcceptance` kept, acceptance deleted, status Open, treat Mitigate; history "Acceptance invalidated: <why>"; `risk.acceptance.invalidated` "<id>: <why> (Board ref …)" | part of R2 / import |
| R17 | Pending acceptance cancellation (automatic, `lib/risk.ts:124-131`) | inside R2 (residual differs from `pending.score`), R13 finalize, close (R19), import update | - | marks the approval Withdrawn **directly** (no engine audit) with `decidedReason` | history "Pending acceptance cancelled: <why>"; `risk.acceptance.pending_cancelled` "<id>: <why> (<ref>, <AP>)" | part of the caller |
| R18 | Reopen (`RiskDetail.tsx:165`, `risks.ts:239-246`) | E; button only on an effective acceptance | **no state or SoD check**; no reason | lastEditedBy | status Open, treat Mitigate, acceptance deleted (not kept as history field); history "Risk reopened"; (UI) `risk.reopened` "<id>" | `POST /risks/:id/reopen` |
| R19 | Close risk (`:166`, `risks.ts:259-279`) | E; UI only on open risks | no open actions ("Close or cancel the open actions first.", SodError); reason optional, max 300 | closer != lastEditedBy; closer != owner when the risk has any actions (SodError texts `:262-263,271-272`) | cancels a pending acceptance ("risk closed"); status Closed; history "Risk closed[: why]"; `risk.closed` "<id>[ — why(80)]"; toast. **Closed is terminal in the UI** (no reopen for Closed) | `POST /risks/:id/close {reason}` |
| R20 | Export register CSV (`RiskModule.tsx:53-59`, `risks.ts:323-334`) | **any role with the module** (no gate) | 25 columns `RISK_CSV_COLS`/`RISK_CSV_HEADERS` (`lib/risk.ts:137-139`), every cell `csvCell`, CRLF, file `risk-register.csv` | - | (UI) `risk.register.exported` "<n> risks"; toast "Risk register exported (CSV)" | `GET /risks/export` |
| R21 | Link party to risk (`RiskParties.tsx:17-21`, `risks.ts:282-290`) | E | party index exists; risk exists; idempotent | - | (UI) `risk.party.linked` "<party> ← <rid>" (also written when already linked) | `POST /risk-parties/:index/links {riskId}` |
| R22 | Unlink party (`:22-25`, `:291-298`) | E | party index exists; no risk check | - | (UI) `risk.party.unlinked` "<party> ✕ <rid>" | `POST /risk-parties/:index/links/:rid/delete` |
| R23 | Add party (`:26-30`, `:299-306`) | E | party 200 required ("Party name required"); req 500 default "—"; loc 100 default "Global"; no de-duplication | - | (UI) `risk.party.added` "<party>"; toast "Party added" | `POST /risk-parties` |
| R24 | Take snapshot (`RiskGov.tsx:18-21`, `risks.ts:309-320`) | A (admin) | scope `approved` (review Approved) or `all` | - | (UI) `risk.register.snapshot` "<n> risks (<scope>), hash <hash>"; toast "Snapshot taken (<n> risks)" | `POST /risks/snapshots {scope}` |
| R25 | Import risks: see 1.5 (I1-I5) | | | | | |

Not available anywhere: edit title/description/category/owner/treatment of an existing risk (the source's edit form was never wired, `docs/guides/checklist/risk.md:24`), delete a risk, change team/jurisdiction/register/parent, edit or delete an action, edit/delete a party, edit enterprise risks, download or compare a snapshot, renew an acceptance (only reopen + accept again).

SOD_MATRIX rows (`docs/security/SOD_MATRIX.md:30-33`) vs code:
- "Accept <= 15: owner, analyst, admin; authority from ACCEPT_AUTH ladder (role rank >= required band)": code compares the **chosen** authority's rank, not the actor's role (checklist security notes, `docs/guides/checklist/risk.md:73`).
- "Accept > 15: admin records, verifier (admin2/owner)": code allows any admin or owner who is not the recorder/owner/editor/submitter.
- "Close: owner/admin": code allows analyst too (edit gate).
- "Import that updates existing ids: analyst/admin initiate, admin approves, approver != importer": matches.
- No SOD row for submit/approve of the risk review; code enforces approver != last editor/submitter.

### 1.4 Computed values
- Scores (`lib/metrics.ts:6-9`): inherent `sInh = l*i`; current `sCur = (cl || l) * (ci || i)`; residual `sRes = rl*ri`; open `riskOpen = status not Accepted and not Closed`.
- Band `rband(score)` (`lib/risk.ts:30`); out-of-range scores fall back to Low. Priority `riskPriority` = P1 Extreme, P2 High, P3 Medium, P4 Low **of the current score** (`:41`). Rating filter uses the current band (`riskRatingOf`, `:42`).
- Required authority = `ACCEPT_AUTH[band of residual]`; Board needed when residual > 15 (`lib/riskBoard.ts:15`). Seed residuals max 8, so no seed risk needs Board evidence.
- Accepted band cap (`acceptedCapIdx`, `lib/risk.ts:103-108`).
- `expiresSoon(until)` = until < today+60 days (`lib/risk.ts:99`); highlighted on the acceptance card and Governance list; no expiry action exists.
- `riskAcceptState` "Effective" / "Awaiting evidence verification" / "" (`:133`); `riskOpenActions` = not done and not cancelled (`:135`).
- `closeBlock` (`risks.ts:259-265`): open actions; I am lastEditedBy; risk has actions and I am owner.
- Dashboard (see 1.2): above appetite = open and current >= 11; awaiting = review Submitted; accepted = has acceptance; unmapped = open with no linked control; distribution and % of open; heat cell counts by view; breakdown groups (missing value grouped as "—", filtering by it matches nothing).
- Treatment plan (`RiskDash.tsx:90-94`): open risks with `treat !== "Accept"`; due = earliest `due` among actions that are not done and have a due date (**cancelled actions are not excluded**), else `r.planned`, else none; overdue = due < today (ISO compare); "(from actions)" shown when the risk has actions and no `planned`; sorted by due ascending, none last; status chip "Overdue" or "In progress". Seed risks have no actions or planned dates, so every plan row shows "—".
- Detail data-quality checks (`RiskDetail.tsx:142-145`): no control mapped; current < residual ("current exposure is below residual — re-check scores"); Mitigate with no actions. Failing banner = mapped controls that exist and have status != Pass.
- Enterprise "Top" = max current score of existing children (`RiskGov.tsx:31-32`).
- Snapshot hash (`risks.ts:314-315`): payload = per risk `[id, inh, cur, res, treat, status, review, reviewed].join("|")` joined by newlines; hash = `(fnv(payload) + fnv(reverse(payload))).slice(0,12)`; `shared` = any audit in stage Fieldwork or Planned.
- Seed values: open 11 (RK-11 accepted); current >= 11: RK-01 (12) only; Submitted 2 (RK-03, RK-08); accepted 1; unmapped 0.
- Other modules' risk formulas (all different, see gaps): `metrics().openRisks` = not Accepted/Closed (same as `riskOpen`); `metrics().aboveAppetite` = **all risks** with `rl*ri >= 8` (residual, any status; seed 2) (`lib/metrics.ts:15-16`); board pack "Risks above appetite" = open with current >= 11, top 8; assistant "high or critical" = `rl*ri >= 12 || l*i >= 16`.

### 1.5 Import wizard (`features/risk/import/*`, `features/risk/services/riskImport.ts`)
Open: "Import" (editors; handler re-checks, toast "You do not have permission to import risks") -> wide modal "Import risks from Excel" (`openImportWizard.tsx:7-10`).
- Step 1 Upload (`ImportWizard.tsx:129-145`): file `.csv`, `.xlsx` (and `.xls`, then refused "Old .xls files are not supported…"); `validateUpload` 5 MB; "Try with a sample register" loads `SAMPLE_CSV` (5 rows, one updating RK-01, `:16-21`). The file is read **in the browser**: CSV parser and a bounded ZIP/XLSX reader (`parse.ts`), limits `LIMITS` (`parse.ts:5-15`): 5 MB, 5,000 data rows, 50,000 scanned rows, 100 columns, 2,000 chars per cell, header 200, 2,000 zip entries, 24 MB per part, 40 MB total, zip64/encrypted/other methods refused, NUL in a CSV refused. Error texts `importMessage` (`parse.ts:22-34`).
- Step 2 Match columns: auto-map by synonyms (`IMP_FIELDS`, `parse.ts:219-232`; `autoMap` `:236-245`): Risk ID, Risk title*, Category, Owner, Likelihood, Impact, Residual likelihood, Residual impact, Treatment, Status, Due date, Controls; "Check rows" disabled until title is mapped.
- Step 3 Check and import: stat tiles (rows, new, update, warnings, skipped), conflict radio "Update the existing risk" (default) / "Add as a new risk with a new ID", preview of the first 150 rows, notice when updates exist.
- Conversion (`convert.ts`): text words to 1..5 (`TEXT_SCORES`, `:15`); numeric scale detection per column (max <= 3: `round(1 + (n-1)*2)`; <= 5: round; <= 10: `ceil(n/2)`; else `ceil(n/max*5)`; clamped 1..5) (`:21-34`); missing L/I -> 3 with warning; missing residual -> `max(1, l-1)` / `max(1, i-1)`; warning "residual above inherent"; treatment by regex (accept|toler -> Accept; transfer|insur|share -> Transfer; avoid|elimin|stop|terminat -> Avoid; else Mitigate); status by regex (clos|done|complete|resolv -> Closed; accept -> Accepted; review|pending|submit|await -> In review; else Open); dates Excel serial / ISO / parseable text, kept only if 1900-2200; every string through `neutral()` (leading `= + - @ tab CR` gets an apostrophe) and `clampText` 500; category matched case-insensitively else "Operational" with warning; invalid id format -> new id with warning; generated ids `RK-<n>` never reuse an existing id.

| # | Action | Who | Validation | SoD / four-eyes | Audit | API stub |
|---|---|---|---|---|---|---|
| I1 | Import only new ids (`riskImport.ts:15-22`) | E (`SodError "Not permitted: importing risks requires an editing role."`) | rows from the preview; a new row whose id now exists is skipped | none | `risk.register.imported` "<n> new, <m> updated (<file≤120>)"; per risk history "Imported from <file>"; toast "Imported <n> new risk(s)" | `POST /risks/import {fileName, rows}` |
| I2 | Import with updates (stage) (`:23-29`) | E | as I1 | approval `risk.import` (0.5); the whole file (new + updates) is staged in the approval payload | `risk.import.staged` "<AP>: <n> new, <m> updates (<file>) awaiting approval"; engine `approval.risk.import.requested`; toast "Import <AP> is waiting for approval by a second admin. No risk has been changed yet." | same |
| I3 | Approve staged import (`PendingImports.tsx:20-25`, `riskImport.ts:39-59`) | admin (`assertRole`), not the importer (engine forbid) | reason >= 10, max 300 ("Give a reason of at least 10 characters."); request found and kind `risk.import`; applies once (`payload.applied`) | four-eyes | engine `approval.risk.import.approved`; apply (`applyImport` with editor = importer) -> `risk.register.imported`; `risk.import.approved` "<AP>: applied <n> new, <m> updated (<file>)"; toast "Import approved: …" | `POST /risks/import/:id/decision {decision, reason}` |
| I4 | Reject staged import | same | reason >= 10 | same | engine `approval.risk.import.rejected`; `risk.import.rejected` "<AP>: <file> not applied"; toast "Import rejected. No risk was changed." | same |
| I5 | Withdraw staged import (`PendingImports.tsx:26`) | importer (engine) | - | - | engine `approval.risk.import.withdrawn` only (**no `risk.*` entry**, no service function, no `viaApi`) | **none** |

`applyImport` rules (`convert.ts:103-134`):
- Update: overwrite title, cat, owner, l, i, rl, ri; **recompute cl/ci** (discarding manually set current scores); status: Accepted kept; "Closed" ignored while actions are open (history note); otherwise status and treat taken from the file; treat taken unless Accepted; lastEditedBy = importer; `planned` = due; desc += "Existing controls: …"; reviewed = today; history "Updated by import (<file>)"; re-validate acceptance; cancel pending acceptance if residual changed. Review state untouched.
- New: status Accepted -> Open; review Draft; `imported: true`; `linked: []` (the "Controls" column only becomes description text); lastEditedBy = importer; history "Imported from <file>".
- Updates for ids that disappeared are silently skipped.

Pending imports panel (`PendingImports.tsx`): list for editors or admins; per request title, "Awaiting approval", "<AP> · imported by <name> · <m> updates, <n> new · first 8 ids"; Reason input + Approve / Reject disabled with `whyCannotApprove`; Withdraw for the requester.

### 1.6 Cross-module links
- OUT: `linked` -> controls (open control page; status drives the failing banner); approvals engine (`risk.board-evidence`, `risk.import`); snapshots read audits; export.
- IN: Issues "Link risk" stores a risk id on the issue (`linkedRisks`), shown as a non-clickable tag; the risk does not show its issues. AI signal "Raise risk" creates a Draft risk (cat AI, owner = AI system owner, scores 3/3/3/3/2/2) with **no `risk.created` entry** (AI logs `ai.signal.risk_raised`, `features/ai/AiDetail.tsx:171`). Overview "Risk register" button, Open risks KPI, trend; board pack table; Reports "Risk register export" stored report (placeholder text, unrelated to R20); Assistant drafts. Controls do not show linked risks.

### 1.7 Simulated
- Snapshots keep only a hash (FNV-1a, not cryptographic) and no content; "Shared with auditor" is a flag, nothing is shared.
- Board minutes file is never read or stored; only its name.
- "The owner is alerted when a mapped control fails" is text only.
- Governance "Last reviewed" is always today; register owner "J. Avery, CISO" is static; enterprise roll-up is static.
- "Only mine" and the Add-risk owner default use the fixed demo name, not the signed-in person.
- `riskNorm` fabricates history entries and legacy acceptances for seed data.
- Import parsing happens entirely in the browser (the API stub receives already-converted rows).

---

## 2. ISSUES

### 2.1 Data model
**Issue** (`DATA.issues`, seed 6: R-014, R-036, R-041, R-048, R-052, R-055) - CO
| Field | Type | Notes |
|---|---|---|
| `id` | string | new: `nextId("R-", 60, issues)` = `"R-" + (60 + count)` bumped until unique (`services/audits.ts:32-36`), e.g. R-66 (seed ids are zero-padded "R-014"); audit promotion and AI raise use the same scheme; Team automation rules create `"I-" + 4 hex` (`features/team/services/governance.ts:91`) |
| `title` | string | required, max 200 (UI only) |
| `sev` | enum `Critical` \| `High` \| `Medium` \| `Low` (`issues.ts:13`) | invalid on create -> "High"; seed uses High/Medium/Low only |
| `status` | enum `Open` \| `In progress` \| `Closed` (`:12`) | |
| `owner` | string (name) | free text max 80 (UI); create default = signed-in person; edit may leave it empty |
| `due` | **free text** max 40 | "Due 14d", "Overdue 7d", "In 14 days"; "overdue" means the text contains `Overdue`; nothing ever turns "Due" into "Overdue" |
| `createdBy` | name | set by create and audit promotion; not by AI or rules |
| `assignee` | name | honoured by the SoD checks but **never set by any UI** |
| `tasks` | `{text ≤300, done}[]` | |
| `rootCause`, `corrective` | string ≤2000 | |
| `linkedControls`, `linkedRisks` | string[] | ids picked from existing records |
| `closure` | `{approvalId, by, at YYYY-MM-DD, note ≤500}` | last closure proposal (kept after reject/withdraw) |
| `verification` | `{by, at, note, approvalId, proposedBy}` | set when a High/Critical closure is verified |
| `source` | rule id | Team rule-created issues only |
`issInit` (`issues.ts:20-27`) fills tasks/rootCause/corrective/linked arrays lazily.

### 2.2 Screens and routes
**Register `/ws/issues`** (`IssuesModule.tsx:29-90`)
- Page action "New issue" (disabled with reason for non-writers; every module role is a writer).
- KPI strip "Issue summary": Open issues (status != Closed; caption "<n> in total"), Overdue (open with /Overdue/; delta "Needs action"/"None"), High or critical (open), In progress.
- Card "Remediation" with Table / Kanban toggle (`issues.view`). Table = `DataTable` (0.3): ID, Issue, Severity (sorted by severity rank), Owner, Due (red when overdue; sorted overdue first by days, then by `Date.parse`, else last), Status. Kanban: three columns by status with counts, cards open the record, "Nothing here.".
**Record `/ws/issues/:id`** (`IssueDetail.tsx`)
- Header: title, sub "<id>, owner <owner>", severity and status chips, Edit (disabled for non-writers), Delete (disabled with `whyCannotDelete`).
- Closure banner (role alert) when a closure is pending: "Closure awaiting verification", "Proposed by <name>: <note>", Verify and close / Reject (disabled with `whyCannotVerify`), Withdraw for the proposer.
- Progress card: stepper Open / In progress / Closed (overdue styling), status buttons (for High/Critical the "Closed" button reads "Propose closure"), help text about verification, write reason.
- Root cause & corrective action (two textareas, "Save root cause").
- Tasks ("<done> of <n> done", checkboxes, "Add task").
- Details (severity, owner, due, status, "Verified closure <by> on <at>: <note> (proposed by <name>)").
- Linked controls & risks (control chips open `/ws/controls/:id`; risk ids are plain tags), "Link control", "Link risk".
**Form pages** `/ws/issues/new`, `/ws/issues/:id/edit` (`IssueFormPage.tsx`): sections "Issue" (Title*) and "Ownership and timing" (Severity, Owner, Due; disabled with the reason for non-admin/owner when editing); "Create issue" / "Save changes"; denied roles see "You cannot do this".
**Dialogs** (`IssueLayers.tsx`): Add task, Link control/risk (select of all control or risk ids), Delete issue ("This cannot be undone in the demo."), Propose closure / Verify and close / Reject closure (note >= 10, max 500).

### 2.3 User actions
Helpers (`issues.ts`): `whyCannotWrite` = role admin|owner|analyst ("Not permitted: changing issues requires admin or owner or analyst.") (`:31`); `whyCannotEditCore` = admin|owner (`:33`); `pendingClosure` sweeps expiry and returns the Pending approval (`:34-38`); `whyCannotProposeClose` (`:39-43`); `whyCannotVerify` (`:45-48`); `whyCannotDelete` (`:49-53`).

| # | Action | Who | Validation | SoD / four-eyes | Audit | API stub |
|---|---|---|---|---|---|---|
| S1 | Create issue (`IssueFormPage.tsx:33-44`, `issues.ts:55-64`) | writers | title `clampText` 200 required ("Title is required.", UI only); sev allow-list else High; owner 80 (default me); due 40 (default "Due 14d") | `createdBy` = me | `issue.created` "<id> (<sev as typed>) by <me>" cat Control; toast "Issue created"; unshifted to top; navigates to the record | `POST /issues {title, sev, owner, due}` |
| S2 | Edit issue (`:41`, `issues.ts:65-79`) | writers; owner/due/sev change needs admin/owner | if any core field changed: role admin/owner, no pending closure ("Withdraw the pending closure before changing owner, due date or severity."), sev in list ("Unknown severity."); title not re-validated in the service; owner/due may be empty | - | `issue.updated` "<id> core fields <sev>/<owner>/<due> → <new> by <me>" or "<id> title" (written even when nothing changed); toast "Changes saved" | `POST /issues/:id {title, sev, owner, due}` |
| S3 | Move status (`IssueDetail.tsx:33`, `issues.ts:88-99`) | writers | status in list; to Closed refused for High/Critical ("High/Critical issues are closed only after a different person verifies the fix."); from Closed needs admin/owner; refused while a closure is pending | Medium/Low: closer = creator is only logged | `issue.status.changed` "<id>: <from> → <to> by <me>[ (closer is the creator)]"; toast "<id> moved to <s>" | `POST /issues/:id/status {status}` |
| S4 | Propose closure, High/Critical (`IssueLayers.tsx:90-91`, `issues.ts:101-111`) | writers; not Closed; none pending | only High/Critical ("Only High/Critical issues need verification; move the status directly."); note >= 10 (`reasonText`, max 500) | approval `issue.close` (0.5); the owner may propose | `issue.closure.proposed` "<id> (<sev>) <AP> by <me>"; engine `approval.issue.close.requested`; `closure` stored; toast "Closure sent for verification" | `POST /issues/:id/closure {note}` |
| S5 | Verify and close (`:92-93`, `issues.ts:112-122`) | admin/owner/analyst | pending exists; note >= 10 (service and engine) | verifier != owner, assignee, proposer (`selfReason` with `samePerson`) and engine rules ("Segregation of duties: the verifier cannot be the assignee, the owner or the person who proposed the closure.") | engine `approval.issue.close.approved`; status Closed; `verification` stored; `issue.closed.verified` "<id> (<sev>): <from> → Closed; proposed by <name>, verified by <me> (<AP>)"; toast "Verified: issue closed" | `POST /issues/:id/closure/decision {decision, note}` |
| S6 | Reject closure | same | note >= 10 (service) | same | engine `approval.issue.close.rejected`; `issue.closure.rejected` "<id> <AP> by <me>: <note>"; toast "Closure rejected" | same |
| S7 | Withdraw closure (`IssueDetail.tsx:52`, `issues.ts:123-128`) | proposer (engine; button only for the proposer; **no role check**) | pending exists | - | engine `approval.issue.close.withdrawn`; `issue.closure.withdrawn` "<id> <AP>"; toast "Closure withdrawn" | `POST /issues/:id/closure/withdraw` |
| S8 | Save root cause (`IssueDetail.tsx:34`, `issues.ts:129-132`) | writers | `clampText` 2000 each (UI only) | - | (UI) `issue.rca.saved` "<id>"; toast "Root cause saved" | `POST /issues/:id/rca {rootCause, corrective}` |
| S9 | Add task (`IssueLayers.tsx:20-39`, `issues.ts:133-135`) | writers | text required, `clampText` 300 (UI only) | - | (UI) `issue.task.added` "<id>: <text>"; toast "Task added" | `POST /issues/:id/tasks {text}` |
| S10 | Toggle task (`IssueDetail.tsx:35`, `issues.ts:136-139`) | writers | index exists | - | **none** | `POST /issues/:id/tasks/:index/toggle` |
| S11 | Link control or risk (`IssueLayers.tsx:42-57`, `issues.ts:140-147`) | writers | value must be one of the offered ids (UI only; the service accepts any string); idempotent | - | (UI) `issue.linked` "<id> → <value>" (also when already linked); toast "Linked <value>" | `POST /issues/:id/links {kind, value}` |
| S12 | Delete issue (`IssueLayers.tsx:60-69`, `issues.ts:80-86`) | admin/owner | refused for open High/Critical ("High/Critical issues cannot be deleted; close them through verification.") and when an audit finding references it ("An audit finding references this issue.") (checked before the role) | - | `issue.deleted` "<id> (<sev>) by <me>"; hard delete; toast "Issue deleted"; back to register | `POST /issues/:id/delete` |
| S13 | Copy ID (row action) | anyone with the module | - | - | none | none |
| S14 | Export selected (DataTable) | anyone with the module | `csvCell` | - | **none** | none |
SOD_MATRIX row (`docs/security/SOD_MATRIX.md:38`): "Close High/Critical: assignee/owner proposes; verifier != assignee, != owner, with verification note; Medium/Low: closer != creator recommended, not enforced" (code matches; it also excludes the proposer and lets any writer propose).

### 2.4 Computed values
- KPIs (2.2); `isHighSev` = High or Critical (`issues.ts:14`); overdue = `/Overdue/.test(due)` everywhere (register, KPI, stepper, bell, Overview, Work, Team rule trigger).
- Severity sort rank Critical 0, High 1, Medium 2, Low 3, unknown 99; due sort (`IssuesModule.tsx:14-16`).
- Seed: 6 open, 3 overdue (R-014 7d, R-036 27d, R-052 3d), 3 High, 3 In progress.

### 2.5 Cross-module links
- OUT: `linkedControls` (clickable), `linkedRisks` (tags only); approvals engine `issue.close`.
- IN: Audits "Create issue" from a finding (`promoteFinding`, `services/audits.ts:118-130`, audit `audit.finding.promoted`) and the delete guard on `finding.issue`; AI signal "Raise issue" (no `issue.created` entry; AI logs `ai.signal.issue_raised`); Team automation rule action "Open an issue (once per record)" (`team.rule.action`); bell notifications; nav badge; Overview (counts, severity bars, Needs Attention, board pack); My Work list. Controls do not show linked issues.

### 2.6 Simulated
- Due dates are text; "Overdue <n>d" never advances.
- Rule-created issues use a different id scheme and due text.

---

## 3. WORK (My Work, `/ws/work`, `features/work/WorkModule.tsx`)

### 3.1 Data
No own records. Reads `DATA.issues`; static `REVIEWS` list of 3 items (`:8-12`: "Approve P-006 Acceptable Use & Awareness" Medium, "Sign off access recertification Q4" Low, "Review AI impact assessment (6.1.4)" High). Writes `ACCESS_REQUESTS` (group 2) and `VENDOR_REQS` (group 4).

### 3.2 Screen
- Actions: "Request access" (modal), "Request a new vendor" (modal), "Overview" (navigates to `/ws/overview`).
- KPIs (`:26-31`, all SIM): Assigned to you = `mine.length + 3`; Overdue = (all issues with /Overdue/, **including closed**) + 1; Due this week = 4 (static); Approvals waiting = 2 (static).
- "Issues assigned to you" (`:17,33-45`): issues whose owner matches `/Avery/` **plus the first 3 other issues** (seed: no Avery issue, so it lists R-014, R-036, R-041); columns ID, Issue, Severity, Due (red when overdue); row click goes to the register `/ws/issues`, not the record.
- "Reviews & approvals": the 3 static items with severity dot; "Open" only toasts "Opened (demo)".

### 3.3 User actions
| # | Action | Who | Validation | SoD | Audit | API stub |
|---|---|---|---|---|---|---|
| W1 | Request access (`RequestModals.tsx:18-47` -> `services/access.ts:34-48`) | any role with Work (admin, owner, analyst, employee) | System required ("System is required."; service `clampText` 100), Level from `LEVELS`, User default me (read-only for employees; service: employees only for themselves), Reason (300; Admin level >= 10) | approvals handled in Access (group 2) | `access.requested` "<system> (<level>) for <user>" cat Access; toast "Access request submitted"; sets `access.view = "requests"` and navigates to `/ws/access` (analyst is then redirected away: no Access module) | `POST /access/requests` |
| W2 | Request a new vendor (`:50-75`) | any role with Work; **no role check** | name and purpose required ("Vendor name and purpose are required."); category default "General"; criticality Critical/Medium/Low (default Medium); "processes personal data" checkbox; **no length limits** (inputs have no `maxLength`, no `clampText`) | decided in Vendors (group 4) | `vendor.requested` "<name> (<crit> tier)" cat Vendor; record `{id "VR-" + pad2(len+4), name, cat, reason, requester me, data, crit, at today}` unshifted to `VENDOR_REQS`; toast "Vendor request submitted to procurement" | **none** (no `viaApi`) |
| W3 | Open a review item | anyone | - | - | none; toast "Opened (demo)" | none |
| W4 | Open an issue row | anyone | - | - | none; navigates to `/ws/issues` (an employee has no Issues module and is redirected) | none |

### 3.4 Simulated
Everything except W1/W2 and the issue list is static; "assigned to you" ignores the signed-in person; nav badge falls back to 5.

---

## 4. OVERVIEW (`/ws/overview`, `features/overview/OverviewModule.tsx`) and the board pack

### 4.1 Data
No own records. Everything is computed from other modules (0.7). Static trend/delta texts.

### 4.2 Screen
- Title "Security posture · <Month YYYY>" (en-GB, local clock); subtitle "<failing controls> controls failing and <open issues> open issues need your attention." (`:70`).
- Actions: "Export board pack", "Reports" (`/ws/reports`; analyst/employee/auditor have no Reports module), "Open my work" (`/ws/work`; auditor has no Work module).
- KPI strip "Posture summary" (`:75-82`): Weighted compliance `M.compliance%` (static delta "+3 pts this month", caption "Across frameworks in scope"); Open risks `M.openRisks` (static "2 fewer this month", caption "<aboveAppetite> above appetite"); Controls failing `M.overdueControls` (static "1 more this week"); Open issues `M.openIssues` (static "No change"); Upcoming audits `M.upcomingAudits` (static "Next in 136 days"); Vendor reviews due `M.vendorDue` (static "2 overdue").
- Risk Posture card: line chart "Open risks over the last 7 months" = `[20,19,18,17,16,15, openRisks]` with labels Apr..Oct (static, `:14,48`); "Open issues by severity" bars High/Medium/Low over **all issues including closed** (Critical not counted) (`:46-47,89`); button "Risk register".
- Framework Readiness: 6 lowest `fwReadiness`, tone >= 80 ok, >= 50 warn, else bad; "View all" -> `/ws/frameworks` (`:45,95`).
- Needs Attention: "Overdue" feed = issues with /Overdue/ (**no status filter, so closed overdue issues appear**) followed by vendors with /Overdue/ in `due` (title "<cat> vendor review overdue", sev High when tier Critical else Medium, owner "Vendor"); every item opens `/ws/issues` (also the vendor items); "Audits in motion" = audits with stage != Complete (name, auditor, period) -> `/ws/audits` (`:49-51,99-121`).
- Control coverage heat map (`CoverageHeatmap`, `:17-38,123-135`): rows `COV_FW` (ISO 27001, SOC 2, NIST CSF, PCI DSS, ISO 42001, GDPR), columns `COV_CATS` (Governance, Access, Data & crypto, Operations, Infrastructure, People & 3P, each a list of control domains) (`lib/boardPack.ts:10-11`); cell = `covCell`, "—" when no mapped control.
- Every role that can open Overview sees all of it, including roles without the underlying modules (employee and auditor see risk counts, issue titles and owners in the board pack, vendor names, audits).

### 4.3 User actions
| # | Action | Who | Validation | SoD | Audit | API stub |
|---|---|---|---|---|---|---|
| O1 | Export board pack (`:54-67`, `lib/boardPack.ts:20-113`) | **every role with Overview** (admin, owner, analyst, auditor, employee) | - | no review/sign-off step | `overview.boardpack.exported` "Board & executive pack" cat **Policy**; opens a blob URL in a new tab (opener cleared, URL revoked after 60 s) and toasts "Board pack ready — use Print / Save as PDF"; else downloads `Selvara-Board-Pack.html` ("Board pack downloaded — open it, then Print / Save as PDF") or "Download not available in this view" | **none** |
| O2 | Navigate (Reports, Open my work, Risk register, View all, All issues, feed items) | anyone | - | - | none | none |

### 4.4 Board pack content (`lib/boardPack.ts`)
Standalone HTML (inline CSS with hex colours, print rules, "Print / Save as PDF" button running `window.print()`); every interpolated value through `esc()`.
- Cover: "Board & Executive Security Pack", "Security, risk & compliance posture — <Month YYYY>", chips "Draft for review", "Confidential", "Prepared by <getMe().name>", date (en-GB long).
- 1 Executive summary: sentence with failing controls, open issues, above-appetite risks (`metrics().aboveAppetite`, residual >= 8, all statuses), weighted compliance; six KPI boxes (same as Overview).
- 2 Framework readiness: every framework, sorted by `fwReadiness` descending, bars.
- 3 Control coverage: same `covCell` grid, cell shade from `_covShade(pct)` (hex interpolation).
- 4 Risks above appetite: open risks with **current** score >= 11, sorted desc, top 8 (ID, Risk, Owner, Treatment, Current) or "No risks currently above appetite." (note: section 1 and section 4 use different definitions).
- 5 Open issues: first 8 issues with status != Closed in register order (ID, Issue, Severity, Owner, Due) or "No open issues.".
- 6 Audits in motion: audits with stage != Complete (Audit, Framework, Auditor, Stage, Progress %) or "No audits in progress.".
- Footer: "Draft only. … require review and approval by qualified compliance, legal or risk personnel before use or distribution. Generated <date> · Information Security — Confidential."

### 4.5 Computed values
- `metrics()` (`lib/metrics.ts:12-23`): `compliance = round(Σ fwReadiness(f) * f.controls / Σ f.controls)` over **all** frameworks (scope ignored, group 1); `openRisks` = risks not Accepted/Closed; `aboveAppetite` = risks with `rl*ri >= 8`; `overdueControls` = controls with status Fail (named "overdue", shown as "failing"); `needsEvidence` (not shown here); `openIssues` = issues != Closed; `upcomingAudits` = audits stage != Complete; `vendorDue` = vendors with /Overdue/ in `due` or status "In review".
- `covCell(fw, domains)` (`lib/boardPack.ts:13-18`): controls whose `domain` is in the column list and `map[fw]` is non-empty; `pct = round(pass / n * 100)` where pass = status "Pass"; null when none. Overview tint `color-mix(accent 8 + pct*0.27 %)`.
- Seed (demo): openRisks 11, aboveAppetite 2, openIssues 6.

### 4.6 Simulated
- Trend history, all KPI deltas and "Next in 136 days" are static.
- No stored snapshot of what was exported; "Prepared by" is the signed-in name; "Draft for review" has no workflow behind it.

---

## 5. REPORTS (`/ws/reports`, `features/reports/*`)

### 5.1 Data model
- **Stored report** (`DATA.reports`, seed 5) - REF-like catalogue: `{name, cat, updated}`: Executive security posture (Executive, Monthly), ISO 27001 Statement of Applicability (Audit, On demand), Risk register export (Risk, On demand), Access recertification pack (Audit, Quarterly), Vendor risk summary (Third party, Monthly). No UI adds or edits them.
- **Schedule** (`SCHED_PACKS`, `lib/trustData.ts:38-39`) - CO: `{name, freq, detail ≤120, recip ≤300 (default "—"), next ("Scheduled" or "—"; seed dates), external?, approvedBy?, approvalId?}`. Seed: "Board security pack" Monthly "1st of month" to "Board, Exec team" next 01 Dec 2026; "Risk committee pack" Quarterly to "Risk Committee"; "Audit evidence pack" On demand to "External auditor" (an **external** recipient by the current rule, but seeded without `external` and without approval). **Seed schedule names do not match `DATA.reports` names**, so they cannot be edited through the form (checklist OQ 2). Schedules are addressed by **array index** for removal and by **name** for upsert.
- `REPORT_FREQ` (REF) = Weekly, Monthly, Quarterly, Bi-annually, Yearly, Custom, + "On demand" appended (`lib/trustData.ts:37`).
- `INTERNAL_GROUPS` (REF, `reports.ts:26`): board, exec team, executive team, exec, leadership, management, risk committee, audit committee, security team, compliance team, all staff, employees, ciso, cfo, ceo.

### 5.2 Screen (`ReportsModule.tsx`)
- Page action "New schedule" (disabled with "Only admin or owner can schedule or generate reports." for others; every Reports role is admin/owner).
- KPI strip "Reporting summary": Weighted compliance; Scheduled packs (count; caption "<n> sent outside the organisation" = schedules with `external`); Stored reports (count; "Generate now, on demand").
- `ApprovalsPanel` (prefix `report.`, title "External distribution awaiting a different admin") listing pending requests and the 3 most recent decided ones, with Approve/Reject (disabled with `whyCannotApprove`) and Withdraw for the requester (`components/kit/sodKit.tsx:51-89`).
- Readiness trend line chart = `[62,66,69,71,74,76, compliance]` Apr..Oct, tag "<compliance>% now" (static history).
- Scheduled packs table (Pack, Frequency + detail, Recipients + "External · approved by <names>", Next, remove "×").
- Stored reports table (Report, Category, Updated, "Generate now"; "Schedule" button).
- Schedule modal (`ReportLayers.tsx:14-45`): Report pack (select of stored reports), Frequency (default Monthly), "Send on" (hidden for On demand, max 120), "Custom schedule" (only for Custom, max 120), Recipients (max 300), help "Packs are generated as draft and require review before distribution.", live notice when external recipients are detected.

### 5.3 User actions
| # | Action | Who | Validation | SoD / four-eyes | Audit | API stub |
|---|---|---|---|---|---|---|
| P1 | Generate now (`ReportsModule.tsx:27-34`, `reports.ts:22-25`) | admin/owner (`assertRole`) | name from the list | none; output is a plain-text placeholder "REPORT (DRAFT) — <name> / Generated <stamp> / Synthetic demo content. Requires review before distribution." | (UI) `report.generated` "<name>" cat System (written even if the download is blocked); file `<slug>.txt` via `safeFileName`; toast "Generated <name> (demo)" or "Download not available in this view" | `POST /reports/generate {name}` |
| P2 | Save internal-only schedule (`ReportLayers.tsx:19-28`, `reports.ts:52-56`) | admin/owner | UI: pack must be a stored report and freq in `REPORT_FREQ` (otherwise the submit **silently does nothing**); detail = custom text (Custom), "" (On demand), else "Send on" text; recip default "—"; next "—" for On demand else "Scheduled"; the service does not re-validate name/freq/lengths | none; upsert by name (replaces an existing schedule of that name, including an approved external one) | (UI) `report.scheduled` "<name> · <freq>[ (<detail>)]" cat System; toast "Report schedule saved" | `PUT /reports/schedules` |
| P3 | Request external distribution (`reports.ts:57-59`) | admin/owner | any recipient that is not an internal group and not an address on one of the tenant users' email domains (`externalRecipients`, `:28-35`; split on `, ; newline`, "—" ignored); one pending request per pack name ("A schedule for this pack is already awaiting approval.") | approval `report.distribution` (0.5): title `Schedule external distribution of "<name≤80>" (<freq>) to <list≤120>`, subject name, payload `{name, rec}`; nothing saved until approved; the previous schedule of that name stays active | (UI) `report.schedule_requested` "<name> · <freq> (external: <list>)"; engine `approval.report.distribution.requested`; toast "External distribution needs approval from a different admin" | same |
| P4 | Approve external distribution (`ApprovalsPanel` or bell -> `services/sodApprovals.ts:9-14` -> `lib/approvalKit.ts:26-50`) | **admin** (not owner), not the requester | reason >= 10 (UI and `decideApproval`), max 300; refused before recording if no handler is registered | four-eyes | engine `approval.report.distribution.approved`; handler upserts `{...rec, external: true, approvedBy, approvalId}`; `report.scheduled` "<name> · <freq>[ (<detail>)] (external distribution approved by <names>; requested by <name>)" cat System; `report.distribution.applied` "<title> (<AP>)" cat Approval; toast "Decision recorded" | `POST /approvals/:id/approve {reason}` |
| P5 | Reject external distribution | same | reason >= 10 (approvalKit) | same | engine `approval.report.distribution.rejected`; handler `closed` clears the pending marker; toast "Request rejected" | `POST /approvals/:id/reject {reason}` |
| P6 | Withdraw request | requester | - | - | engine `approval.report.distribution.withdrawn`; toast "Request withdrawn" | `POST /approvals/:id/withdraw` |
| P7 | Expiry (24 h) | automatic sweep | - | - | engine `approval.report.distribution.expired` (handler `closed` is not called on expiry; `pendingFor` still treats it as not pending) | server job |
| P8 | Remove schedule (`ReportsModule.tsx:35-39`, `reports.ts:62-64`) | admin/owner | by index | **no four-eyes**, no reason, also for approved external schedules; pending requests for that pack are untouched | (UI) `report.unscheduled` "<name>"; toast "Schedule removed" | `DELETE /reports/schedules/:index` |
SOD_MATRIX row (`docs/security/SOD_MATRIX.md:54`): "Reports: Schedule external distribution: owner/admin initiate, different admin approves" (code matches). There is **no report sign-off** of generated content and no board-pack approval anywhere; both are labelled "draft, requires review".

### 5.4 Computed values
- Weighted compliance and trend (4.5); scheduled count and external count; stored count.
- `externalRecipients` heuristic (P3). Tenant domain set = email domains of `usersFor(roleOf(role).tenant)` (`lib/tenantUsers.ts`); in API mode the tenant users list may differ.

### 5.5 Simulated
- Nothing is generated (placeholder text) or sent; "Next" is never a real date; no scheduler runs; the "Weekly … Custom" frequency and "Send on" text are not parsed.

---

## 6. Server checklist distilled (rules a server must reproduce)
1. Module visibility per ROLE_MODS (0.1) and add `risk`, `issues`, `work`, `overview`, `reports` to `SERVER_READY.ws`; update `tests/unit/rbac.test.ts:17`. Add `services/ws.ts` loaders for risks (with parties, enterprise roll-up, snapshots), issues, reports catalogue and schedules, and the approval kinds `risk.board-evidence`, `risk.import`, `issue.close`, `report.distribution`.
2. Identity by user id: risk owner, lastEditedBy, submittedBy, recordedBy, verifier, importer, action owner; issue owner, assignee, createdBy, proposer, verifier; schedule requester/approver. Never by display name or `/Avery/`-style matching ("Only mine", Work "assigned to you", work badge).
3. Risk record shape (1.1) with server-owned ids, timestamps (`identified`, `reviewed`, history `ts`), `lastEditedBy` on every content change, `submittedBy` on submit; one date format.
4. Risk roles: edit = admin/owner/analyst; approve review, request changes, snapshot = admin; Board evidence record = admin; verify/reject = admin/owner; import decision = admin. Export authorised per role (today any module role).
5. Risk review workflow: submit requires >= 1 mapped existing control; approve only from Submitted (decide: enforce state, today not enforced), approver != last editor and != submitter; request changes needs a note (decide: same SoD and state rule, and what status becomes).
6. Scores: integers 1..5 for l,i,cl,ci,rl,ri; any change re-validates acceptance (band cap, > 15 without Board evidence -> back to Open/Mitigate with `invalidatedAcceptance` and audit) and cancels a pending Board acceptance whose residual changed (withdraw its approval, audit).
7. Ladder acceptance (residual <= 15): risk open, none pending, recorder != owner/lastEditor/submitter, rationale required (<= 1000), comp <= 500, authority rank >= required band (decide: derive the authority from the person, not a form field), Board / CEO refused, expiry real, future, <= 365 days (default 365), trusted clock.
8. Board acceptance (residual > 15): admin records; evidence ref `BRD-YYYY-NN`, date not future and <= 90 days old, body in list, minutes reference or real stored file (pdf/docx/png/jpg, 10 MB, scanned), reason >= 20, expiry required <= 12 months; approval `risk.board-evidence` needs 1, admin/owner, forbid owner/lastEditor/submitter and the recorder, TTL 72 h; verify/reject reason >= 10; acceptance becomes effective only on approval and only if residual unchanged; recorder may withdraw; expiry handled by a job attributed to the system.
9. Treatment actions: add (text <= 300 required, owner, ISO due), toggle (not cancelled), cancel (reason >= 10); all complete -> history; no edit/delete.
10. Close risk: no open actions; closer != last editor; closer != owner when actions exist; reason <= 300; cancels a pending acceptance; decide: who may reopen a Closed risk (no path today) and whether Accepted risks may be closed directly.
11. Reopen accepted risk: editor; decide whether it needs a reason and whether the old acceptance is kept as history.
12. Interested parties: per company, by id (not array index); link only existing risks; add with lengths; decide de-dup, edit, delete.
13. Snapshots: admin; store the frozen content (not only a hash) with a real integrity seal (HMAC or signature); "shared with auditor" tied to a real audit window and auditor access (group 5).
14. Import: re-parse or re-validate rows server-side with the same limits and conversions (1.5), file size 5 MB, rows 5,000, columns 100, strings 500, id format, new ids never reuse existing ids; only-new imports apply at once; any update stages the whole file as `risk.import` (admin approver, not importer, TTL 72 h, reason >= 10, apply once, re-check ids at apply time); importer may withdraw (write a `risk.*` audit entry too); decide: import must not close risks or set "In review" bypassing the workflow; malware scan.
15. Issues: writers admin/owner/analyst; title required <= 200, owner <= 80, due (decide: real date) <= 40, sev enum; core fields (owner, due, sev) only admin/owner and never while a closure is pending; reopen admin/owner; Medium/Low close directly (log closer = creator); High/Critical close only via `issue.close` (proposer writer, note >= 10, approver admin/owner/analyst, not owner/assignee/proposer, note >= 10, TTL 14 days, reject reason >= 10, proposer withdraws); delete admin/owner, not open High/Critical, not referenced by an audit finding; audit every action including task toggle, RCA save, link (today partly UI-written or missing).
16. Overview: server-side aggregates per company and role (decide: should employees/auditors see risk and issue detail they cannot open; board pack export permission); one definition of "above appetite" across Overview KPI, board pack, risk dashboard and assistant; replace static trend and deltas with stored history or remove them; audit the board pack export with a proper category.
17. Reports: admin/owner generate/schedule/remove; validate pack name (catalogue) and frequency server-side; recipients validated against the tenant directory, external ones need `report.distribution` (admin approver != requester, reason >= 10, TTL 24 h, one pending per pack), apply once; decide four-eyes for removing/replacing an approved external schedule; real generation with the caller's permissions and a draft/sign-off step if required by policy; scheduler and email delivery off until configured (PRODUCTION_PROGRAMME email decision).
18. My Work: real "assigned to you" (issues, risk actions, approvals waiting, reviews) for the signed-in user; vendor request server command with length limits and role check (group 4 consumes it); access request as in group 2.
19. Notifications: keep overdue issues (from a real due date); decide additions (pending closure verification, Board evidence, imports, expiring acceptances, failing mapped controls as promised in the UI). Keep `risk.*` and `issue.close` out of the bell unless their rules are moved to the shared path; `report.distribution` stays inline-decidable and must not depend on a lazily registered handler.
20. Jobs: approval expiry for `risk.board-evidence` (72 h), `risk.import` (72 h), `issue.close` (14 d), `report.distribution` (24 h); decide an acceptance-expiry job (today acceptances past `until` stay Accepted and count as "Accepted and valid").
21. Audit action strings (complete list for these modules):
    - Risk (cat Risk): risk.created, risk.scored, risk.control.mapped, risk.control.unmapped, risk.action.added, risk.action.done, risk.action.reopened, risk.action.cancelled, risk.submitted, risk.approved, risk.changes_requested, risk.accepted, risk.reopened, risk.closed, risk.board-evidence.recorded, risk.board-evidence.verified, risk.board-evidence.rejected, risk.board-evidence.withdrawn, risk.board-evidence.expired (from `syncBoardEvidence`, `risk.board-evidence.<status>`), risk.acceptance.invalidated, risk.acceptance.pending_cancelled, risk.party.linked, risk.party.unlinked, risk.party.added, risk.register.snapshot, risk.register.exported, risk.register.imported, risk.import.staged, risk.import.approved, risk.import.rejected.
    - Issues (cat Control): issue.created, issue.updated, issue.status.changed, issue.closure.proposed, issue.closure.rejected, issue.closure.withdrawn, issue.closed.verified, issue.deleted, issue.rca.saved, issue.task.added, issue.linked.
    - Reports (cat System): report.generated, report.scheduled, report.schedule_requested, report.unscheduled; approvalKit (cat Approval): report.distribution.applied.
    - Overview: overview.boardpack.exported (cat Policy).
    - My Work: access.requested (cat Access, group 2 service), vendor.requested (cat Vendor).
    - Engine (cat Approval): approval.risk.board-evidence.{requested,approved,rejected,withdrawn,expired}, approval.risk.import.{requested,approved,rejected,withdrawn,expired}, approval.issue.close.{requested,approved,rejected,withdrawn,expired}, approval.report.distribution.{requested,approved,rejected,withdrawn,expired}.
    - Written by other modules about these records: audit.finding.promoted (issue from finding, cat Audit), ai.signal.risk_raised, ai.signal.issue_raised, team.rule.action (issue opened by a rule).

## 7. Gaps and oddities found (decide before porting)
- **Many audit entries are written by the UI, not the service** (risk.created, scored, control.mapped/unmapped, action.*, submitted, approved, changes_requested, reopened, party.*, register.snapshot/exported; issue.rca.saved, task.added, linked; report.*; board pack). A server port that only moves the services would lose them. Issue task toggle has **no** audit at all; import withdraw has only the engine entry.
- **"Above appetite" has four definitions**: risk dashboard and board-pack table = open and current >= 11; Overview KPI caption and board-pack summary = any status with residual >= 8; assistant = residual >= 12 or inherent >= 16; criteria text = residual above Medium. Seed: dashboard 1, Overview 2. Owner open question: should appetite move to 15 (`docs/guides/checklist/risk.md:49`).
- Risk approve and request-changes have no state check in the service; request changes has no SoD check and leaves status "In review". Submit can be called on an Approved risk. Score edits never reset `review` (an Approved risk stays Approved after re-scoring; checklist OQ 3).
- Acceptance authority is a free choice compared by rank only; the "Risk owner" rung can never be the owner (SoD), so it means "someone of that rank". Acceptances never expire automatically; "Accepted and valid" counts expired ones. Legacy seed acceptance has no `score`/`recordedBy`.
- Board verification UI block omits `submittedBy` (service checks it). If the residual changes between recording and verification, the approval ends Approved but the acceptance is cancelled. `BOARD_REASON_MIN` is unused (literal 20). VerifyBox shows to the recorder and any admin/owner; analysts see the evidence without actions.
- Board-evidence expiry, and any `syncBoardEvidence` effect, runs on render of the Risk module and is attributed to whoever is viewing (as in group 2).
- Closed is a terminal state in the UI (no reopen); Accepted risks cannot be closed without reopening first; reopen deletes the acceptance with no reason and no record other than history.
- No edit of risk title/description/category/owner/treatment after creation, no risk delete, no action edit/delete, team/jurisdiction derived and not editable (jurisdiction seeded per id).
- Treatment plan counts cancelled actions' due dates; "All actions complete" does not move any score.
- Interested parties and import decisions are addressed by array index / approval id; parties are one global list (must become per company), no de-dup, no delete. Enterprise roll-up is static; new risks never join it.
- Snapshots store no content, only a 12-hex FNV hash; Governance "Last reviewed" is always today; register owner static.
- Import: updates recompute current scores (discarding manual cl/ci), can close a risk (when no open actions) or set "In review" without the SoD close or submit rules, new rows can be created Closed or In review; the "Controls" column becomes description text, not mappings; the approver sees ids and counts, not a field diff; import withdraw bypasses the service. Local duplicate helpers (`import/riskLocal.ts`) must stay in sync with `lib/risk.ts`.
- No deep link to a risk (`/ws/risk` + module state); `useRiskDrawer` is unused; issues show linked risks as plain tags; neither risks nor controls show linked issues.
- "Only mine", Add-risk owner default, Work "assigned to you" and the Work badge all use the fixed demo name "Avery"; the badge falls back to 5; Work KPIs "+1", "4", "2" are static.
- Risk export available to every role with the module and contains the whole register; issues "Export selected" not audited.
- Issues: due is free text (no real overdue computation); `assignee` honoured but never settable; service does not validate title or link targets; `issue.updated` written even when nothing changed; severity in `issue.created` logged as typed; delete guard checks severity before role (analyst sees the severity reason); Critical exists but the Overview severity bars and board pack CSS ignore it; Team rule issues use "I-xxxx" ids and "In 14 days".
- Issues audit category is "Control" (checklist OQ 7); board pack export is logged under "Policy".
- Overview: Needs Attention includes closed overdue issues; vendor items link to Issues; Overview and board pack expose risk/issue/vendor/audit detail to employees and auditors who cannot open those modules; board pack export has no role gate, no sign-off and no API; trend and deltas are static; `compliance` ignores scope and is `NaN` with no frameworks.
- Reports: seed schedule names do not match stored report names; seed "Audit evidence pack" to "External auditor" is external without approval and is not counted as external; saving an internal schedule replaces an approved external one with no approval; removal needs no approval; invalid form input submits silently; `report.distribution` is decidable in the bell only after the Reports module has been loaded in the session; approver role admin only although owners may initiate (matches the matrix); `report.generated` logged even when the download fails; generated content is a placeholder.
- My Work vendor request has no length limits, no role check and no `viaApi`; "Request access" from an analyst lands on a page they cannot open.
- Hex colour literals in `lib/risk.ts:25-28`, `import/riskLocal.ts:10-13` and the board pack CSS (design-token rule; the board pack is a standalone document).
- Plain `Table` instead of `DataTable` for the risk register, risk dashboard, Work and Reports lists (kit convention).
- Tests: e2e `dashboards.spec.ts:7-46` (Overview, Reports, risk dashboard strips/charts), `datatable.spec.ts:7-123` (issues register), `records.spec.ts:5-68` (issue create/task/status/edit/delete, guard, not found), `readonly.spec.ts:22-27,44-50` (employee/auditor cannot open Risk), `inbox-approvals.spec.ts:67-77` (no Risk kinds in the bell), `injection.spec.ts:22-23,41-42,60-62` (issue/overview payload routes, Work and Issue forms), `a11y.spec.ts:10,53` (`issues/new`, overview), `display.spec.ts` (issues density/print), `styling.spec.ts:20-21`, `brand.spec.ts:55`. Unit: `tests/unit/riskBoard.test.ts` (threshold 15/16, Board evidence validation, expiry, `acceptRisk` boundary and admin-only recording), `notifications.test.ts:10` (overdue issues for admin), `rbac.test.ts:17`. **No tests** for the risk review workflow, scores/invalidation, close/cancel rules, parties, snapshots, the import parser/converter/staging, the issues service (closure verification, delete guards, core-field rules), Work, the board pack, or the reports service (external detection, approval apply).
