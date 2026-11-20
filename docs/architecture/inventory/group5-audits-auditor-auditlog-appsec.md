# Functionality inventory, group 5: Audits, auditor access, Audit logs, AppSec (demonstration build)

Source tree: `/home/user/Selvara/front-end/src` (paths below are relative to it unless they start with `docs/`, `supabase/`, `e2e/` or `tests/`).
Read-only inventory; nothing else in the repository was modified. Line numbers are as of this reading (`git log` head `f74cd26`, after the group 4 cross-check commit).

Conventions used below (same as groups 1 to 4):
- "REF" = reference/catalogue data (same for every company). "CO" = per-company record (tenant data). "SIM" = simulated / demo-only behaviour.
- Audit = `wsLog(action, target, cat)` (`lib/audit.ts:39-45`): appends `{seq, prev, hash, at: nowStamp() (local "YYYY-MM-DD HH:MM", lib/format.ts:5-8), actor: getMe().name, action, target, cat}` to the hash-chained workspace log `WS_AUDIT`. In API mode `wsLog` builds the entry but does not store it (`lib/audit.ts:43`): the server must write it. Category used by Audits: **`"Audit"`** (every call); Audit log module: `"System"`. `adminLog(action, object, opts)` (`lib/adminAudit.ts:39-47`) writes the **platform** Admin Console chain and has no API-mode guard. Audits writes to it once (report export), Audit logs once (RoPA export).
- **Where the audit call lives matters for the server.** "(svc)" = written inside the service function; "(UI)" = written by the component after the service returns. Unlike group 4, half of the Audits entries are already written in the service (all auditor-workflow actions); the older management actions are still "(UI)".
- Roles: base role = role id without trailing `2` (`lib/sod.ts:10-11`). Personas (`data/roles.json`): admin Jordan Avery, admin2 Casey Morgan, owner Owen Hart, owner2 Taylor Reed, analyst Sam Lee, **auditor Morgan Blake ("External Auditor", tenant cust-101, `data/roles.json:84-92`)**, employee Priya Nair. Role label on the server side: `ROLE_LABEL.auditor = "External Auditor"` (`lib/rules.ts:19`); `auditor` is an assignable company role (`lib/rules.ts:13,17`).
- Name matching: Audits uses `samePerson` (`lib/grcSod.ts:18-30`: same first initial and surname, or a surname that is an initial of the other) to match the persona with the engagement lead text (`services/audits.ts:46`). Production must compare user ids (`docs/architecture/PRODUCTION_PROGRAMME.md:39`).
- Error contract: Audits services throw `SodError` (via `guard`, `lib/grcSod.ts:43-46`, or `reasonText`, `:48-52`) or return `null` for "not found" (silent no-op). The UI shows a refusal with `attempt` (`features/audits/util.ts:5-7`): SodError text, else `FAIL_MSG` "Something went wrong. Please try again." (`lib/grcSod.ts:8,11`). Audit-log services throw `ApiError(403, "Forbidden")` (`features/auditlog/services/auditlog.ts:20`) and the UI turns **every** error into "Could not complete that action" (`features/auditlog/AuditLogModule.tsx:13,23-25`).
- `viaApi(mock, real)` (`services/http.ts:19-21`): mock branch mutates memory; real branch calls the REST path listed per action as "API stub". **All group 5 stubs use `apiFetch` paths without the `/ws` prefix** (`/audits/...`, `/audit/...`), unlike the group 1-4 server routes (`ws/...`, `server/ws/routes.ts:42-44`). No group 5 route exists on the server today.

---

## 0. Cross-cutting: module access, routing, shared state, engines

### 0.1 Who can open each module (`data/roles.json` ROLE_MODS `:124-235`; `modAllowed`, `lib/rbac.ts:34-38`)
| Module | admin / admin2 | owner / owner2 | analyst | auditor | employee | vendor | viewer | super/support |
|---|---|---|---|---|---|---|---|---|
| audits | yes (`"*"`, `:139,210`) | yes (`:151,222`) | no | **yes** (`:177`) | no | no | no | no (no ws space) |
| auditlog | **yes, only these** (`"*"`) | **no** (not listed, `:142-162`) | no | **no** (`:175-183`) | no | no | no | no |
| appsec | yes | yes (`:161,232`) | no | **yes** (`:182`) | no | no | no | no |

- The auditor's full list is `overview, audits, controls, evidence, policies, frameworks, appsec` (`data/roles.json:174-183`). The auditor therefore reads controls, evidence, policies and frameworks **at all times**, independent of any engagement or "auditor access" flag (0.5). The same table drives the server (`server/ws/common.ts:12-15`, `wsRoute` `:23-27`), so in production the auditor already reads the group 1-2 server data (controls, tests, evidence including signed download links audited as `evidence.attachment.downloaded`, `server/ws/evidence.ts:162-170`, policies, frameworks) with no time box.
- In production (`API_ON`) a module is also hidden until listed in `SERVER_READY.ws` (`lib/rbac.ts:30`; today `overview, team, frameworks, controls, evidence, policies, people, access, me, risk, issues, work, reports, vendors, questionnaires, trust, commitments`). Group 5 must add `audits`, `auditlog`, `appsec`. `tests/unit/rbac.test.ts:20` asserts `audits` is not server-ready and must be updated.
- AppShell redirects a role that cannot open the module to its landing page (`components/shell/AppShell.tsx:72,92`). AppSec checks again and shows "Access restricted" / "Your role does not have access to this reference page." (`features/appsec/AppSecModule.tsx:22-24`, unreachable through normal routing).
- In-module write gates (effective = after module access):
  - Audits management (`whyCannotManage`, `services/audits.ts:41`: "Not permitted: managing an audit requires admin or owner.", text built by `roleReason`, `lib/grcSod.ts:39-41`): every organisation-record mutation. UI mirror `auditCanManage = hasRole(role, "admin", "owner")` (`features/audits/AuditDetail.tsx:20`). Effective: admin, admin2, owner, owner2.
  - Audits auditor actions (`whyCannotAuditorAct`, `services/audits.ts:44-48`): role auditor ("Not permitted: this auditor action requires auditor."), the engagement lead matches `/External/` **and** `samePerson(me, lead without the "External, " prefix)` ("You are not the assigned auditor for this engagement."), and `auditorAccess === "granted"` ("Auditor access for this engagement has ended." / "Auditor access has not been granted for this engagement yet."). Seed: Morgan Blake matches "External, M. Blake" on AUD-01 and AUD-04 only.
  - Audit report export: **no role check** (`services/audits.ts:177-182`); every role with the module, including the auditor.
  - Audit log: `canAuditLog = modAllowed(role, "ws", "auditlog")` re-checked in every service call (`features/auditlog/services/auditlog.ts:19-20`); effective: admin/admin2.
  - AppSec: read-only page; no write exists.
- Landing page for the auditor: `/ws/overview` (`lib/rbac.ts:50`).

### 0.2 Routing (`lib/route.ts:5-17`, `pages/ws/[[...slug]].tsx`, `features/registry.ts:20,35,45`)
- Audits: `/ws/audits` (register), `/ws/audits/new` (form page), `/ws/audits/:id` (record; any third segment is ignored) (`features/audits/AuditsModule.tsx:19-20`). Unknown id, **or an auditor opening a non-external engagement**: page "Audit not found", empty state "No such audit" / "There is no audit with that ID, or it is not assigned to you. It may have been removed, or the link may be wrong." (`AuditDetail.tsx:23-25,33`; e2e `records.spec.ts:224-225`). An audit can never have the id `new`.
  - The record's tab (`over`, `pbc`, `ir`, `tests`, `findings`) is module state `audits.tab` (`AuditDetail.tsx:16,31`), **global across audits**, not a route. The auditor header button "Information requests" sets it to `ir` before navigating (`AuditsModule.tsx:36`).
  - Ids are stable (seed `AUD-01`..`AUD-05`; new ones `AUD-` + (10 + count), bumped past used ids, `services/audits.ts:32-36,62`), so deep links work on a fresh load (no lazy id as in Vendors).
- Audit logs: `/ws/auditlog` only. Views `log`, `chain`, `ropa`, `exp` are module state `auditlog.view` (`AuditLogModule.tsx:20-21`), shared with the sidebar accordion (`lib/subnav.ts:6`: "Audit log", "Chain integrity", "RoPA register", "Evidence export"). An unknown value falls back to `log`.
- AppSec: `/ws/appsec` only; section buttons scroll to anchors `appsec-<id>` (`AppSecModule.tsx:26-31,43-45`), not routes.
- Nav (`data/nav.json`): group "Assurance" (`:30`) holds "Audits" (`:52-56`); group "Workspace" (`:120`) holds "Audit Logs" (icon `log`, `:147-151`) and "Security Controls" (icon `shieldcheck`, `:152-156`). Titles (`data/nav.json` TITLE): Audits "Upcoming, in-progress and completed audits" (`:237-240`), Audit Logs "Immutable record of every action" (`:301-304`), "Application Security Controls" "Build specification and release gate" (`:337-340`).

### 0.3 Shared list kit
- `DataTable` is used for: the audits register (id `audits`, label "Audits", tabs All + one per `DATA.auditStages`, search name/fw/auditor, `exportName "audits"`, row opens the record; `AuditsModule.tsx:45-47`) and the audit log (id `audit-log`, label "Audit log", tabs All + 7 categories, search actor/action/target/cat, `exportName "audit-log"`; `AuditLogModule.tsx:62-63`). State key `dt.<id>` (`components/ui/DataTable.tsx:84`). "Export selected" downloads `<exportName>.csv` of the visible columns with a `value` (`DataTable.tsx:120-125`) and is **not audited**, so selected audit-log rows can leave the workspace without the `auditlog.exported` entry the page buttons write.
- Plain `Table` (no paging, export or column menu): PBC, information requests, control tests, findings (`AuditDetail.tsx:117,135,153,170`); chain links (`features/auditlog/ChainView.tsx:35`); exports register (`features/auditlog/EvidenceView.tsx:17`); AppSec rate limits and permission matrix (`features/appsec/RateLimitTable.tsx:5`, `PermissionMatrix.tsx:15`).
- KPIs: the audit record uses the older `Kpi` tiles (`AuditDetail.tsx:79-84`), not `KpiStrip`.
- No `ApprovalsPanel` anywhere in this group.

### 0.4 In-memory state the server must replace
| Store | Source | Contents |
|---|---|---|
| `DATA.audits` | `data/seed.json:1256-1463` (5 rows, ids at `:1258,1292,1320,1376,1426`), clone `lib/data.ts:18` | engagements with embedded `pbc`, `tests`, `findings`; `irs`, `auditorAccess`, `populationsFrozen` added lazily by `auditInit` (`services/audits.ts:25-30`) |
| `DATA.auditStages` | `data/seed.json:1464` | REF `["Planned","Fieldwork","Reporting","Complete"]`; **emptied in API mode like every seed key** (`lib/data.ts:17-18`), so the register would have no stage tabs and `advanceStage` no stages |
| `WS_AUDIT` | `data/wsAuditSeed.json` (13 entries: RoPA 7, Control 2, Risk, Policy, Vendor, Access 1 each), chained at load (`lib/audit.ts:17-25`) | the workspace audit log. **Not guarded for production**: the 13 synthetic entries load in API mode too and `clearAll` (`services/ws.ts:122-132`) never clears them |
| `EXPORTS` | `features/auditlog/services/auditlog.ts:24` | evidence-package register (module memory; lost on reload while its log entry stays) |
| `ROPA` | `data/platform.json:450` (17 activities PA-01..PA-17) via `lib/platform.ts:12` | **the platform's** RoPA, shown as if it were the company's |
| `RETENTION` (`id "audit"`) | `features/team/services/governance.ts:108` | audit-log retention 84 months, floor 60 (Team module) |
| mod-state | `lib/store.ts` | `audits.tab`, `auditlog.view`, `dt.audits`, `dt.audit-log`; AppSec search/expand and release-gate ticks are component state only (`AppSecModule.tsx:19-20`, `ReleaseGate.tsx:5`) |
| AppSec spec | `features/appsec/data/appsecSpec.json` | REF, static text (section 4) |

There is **no loader** in `services/ws.ts` `LOADERS` (`:40-100`) for audits or the audit log, so in API mode `DATA.audits` stays empty.

### 0.5 Auditor access: what exists and what does not
- **Engagement flag only.** `auditorAccess` is `"none" | "granted" | "ended"` per audit (`services/audits.ts:26`), set by "Send to auditor" (granted) and "Complete & end auditor access" (ended). It gates only the auditor's two write actions (raise information request, draft finding) and closing information requests (`whyCannotAuditorAct`). It does **not** gate what the auditor can read: the auditor sees every external-led audit in the register and record regardless of the flag (`AuditsModule.tsx:23`, `AuditDetail.tsx:33`), and the controls, evidence, policies and frameworks modules permanently (0.1).
- **Not person-scoped.** The register filter is `/External/.test(a.lead)`, not "assigned to me": Morgan Blake (BSI) also sees AUD-02 (Prescient Assurance, "External, J. Wong") and AUD-05 (Cure53, "External, F. Vega") with their PBC lists, findings and tests (`AuditsModule.tsx:23`). Only the write actions check the person (0.1). The "Information requests" header button opens `pool[0]`, the first external audit, whoever it belongs to (`AuditsModule.tsx:36`).
- **Granted to a firm string, not a person.** "Send to auditor" toasts "Auditor access granted for <auditor>" (the firm, `AuditDetail.tsx:44`); nothing links the firm to a user account, invites anyone, sends anything or sets an expiry.
- **Not time-boxed.** No start/end date, no TTL, no expiry job. Ending is manual and only offered while the stage is not Complete (`AuditDetail.tsx:99`). "Send to auditor" is offered whenever `auditorAccess === "none"`, **including on a Complete audit** (AUD-04), after which no button can end it (`AuditDetail.tsx:97,99`): standing access.
- **No evidence sharing with auditors.** PBC items are text with an owner name and a status (`services/audits.ts:111-117`); there is no link to evidence records (group 1 inventory notes the same, `docs/architecture/inventory/group1-frameworks-controls-evidence.md:294`), no file, no per-auditor share list. "Freeze populations" sets a flag that nothing reads (`populationsFrozen` appears only in `services/audits.ts` and `AuditDetail.tsx`).
- **Risk snapshot "Shared with auditor" (group 3).** Demonstration: `takeSnapshot` sets `shared: inAudit` where `inAudit` = any audit in Planned or Fieldwork (`features/risk/services/risks.ts:324-325`); seed always has one, so every snapshot says "Shared with auditor" (chip, `features/risk/RiskGov.tsx:61`; copy "Snapshots taken inside an audit window are shared with the auditor automatically.", `:56`). Nothing is shared: the auditor cannot open the Risk module (0.1). Server: `shared: false` always (`server/ws/risk.ts:411`), and the production copy drops the sentence (`RiskGov.tsx:56`); `docs/architecture/PRODUCTION_PROGRAMME.md:68` defers sharing to group 5.
- **Workspace audit log**: the auditor has no `auditlog` module; the AppSec permission matrix says the auditor may "View company audit log: Yes" (`features/appsec/data/appsecSpec.json:177`), recorded as conflict 11 in `docs/guides/checklist/appsec.md:34`.

### 0.6 Approvals engine use in this group
**None.** No group 5 action calls `requestApproval` / `requestFor` or registers an approvalKit handler; no `needs`, `approverRoles`, `forbid` or TTL applies. Every decision is single-person: accepting or declining an auditor's draft finding, granting and ending auditor access, completing an engagement with open findings (reason only), freezing populations, generating the evidence package. Audit-log entries written by the engine for other modules carry cat `"Approval"` (`lib/approvals.ts:34`, `lib/approvalKit.ts:47`), which has no category tab (3.3).

### 0.7 Notifications, bell, nav badges
- `lib/notifications.ts`, `lib/inboxApprovals.ts` and `lib/notifPrefs.ts` contain **nothing** for audits, the audit log or AppSec (grep "audit"/"appsec": no match). Nobody is told when: an engagement is shared with them, a PBC item is assigned to them (owner is free text), an information request is raised (management) or answered (auditor), a finding is drafted and awaits a decision, a finding is declined (auditor), an issue is created from a finding (the issue owner; the server's `createIssueIn` does notify, `server/ws/issues.ts:48`), auditor access ends, or the chain verification fails.
- Nav badges (`lib/counts.ts:7-14`): none for audits, auditlog or appsec. In-page counts: findings tab tag = all findings including drafts and rejected (`AuditDetail.tsx:202`); exports register tag (`EvidenceView.tsx:14`); chain links tag (`ChainView.tsx:33`).
- My Work (group 3) lists nothing from audits (no PBC owner tasks, no IRs).

### 0.8 Data this group reads from, and gives to, other groups
| Consumer | Reads | Owning group / server state |
|---|---|---|
| Audits "Control testing" tab, draft report | `audit.tests[] {id, ctrl, result, note}` embedded in the audit; `ctrl` is a control id **string** (T-05 points at `APP-1`, which does not exist in `DATA.controls`), not linked to `DATA.tests` or server kind `"test"` | 1 (server kinds `control`, `test`) |
| Audits framework | `fw` text from `AUDIT_FWS` (`services/audits.ts:11`) incl. "-", not a framework id; frameworks carry their own free-text `audit` field ("Surveillance, 12 Mar 2027"; server `FwState.audit`, `server/ws/assurance.ts:20`; loader default "Not scheduled", `services/ws.ts:47`) that no audit updates | 1 |
| PBC items | nothing (text only; no link to evidence kind `"evidence"`) | 1 |
| Finding -> issue (`promoteFinding`) | writes `DATA.issues` (group 3); server kind `"issue"` needs `dueDate` ISO, `ownerId`, `createdById`, `tasks`, `linkedControls`, `linkedRisks`, optional `source` (`server/ws/issues.ts:17-23,39-50`) | 5 -> 3 |
| Issues delete guard (demo) | `DATA.audits[].findings[].issue === id` -> "An audit finding references this issue." (`features/issues/services/issues.ts:53`) | 3 reads 5 |
| Issues delete guard (server) | `t.list("audit")` records with `data.findings[].issue` (`server/ws/issues.ts:174`), rule `issueDeleteBlock` (`lib/rulesWs.ts:265-269`). **Fixes the storage contract: kind `"audit"`, findings embedded with an `issue` field.** Today no `"audit"` record exists, so the guard never fires in production | 3 reads 5 |
| Overview KPI "Upcoming audits" | `metrics().upcomingAudits` = audits with stage != Complete (`lib/metrics.ts:22`; seed 4) with a static delta "Next in 136 days" (`features/overview/OverviewModule.tsx:87`) | 3 reads 5 |
| Overview "Audits in motion" | audits != Complete: name, auditor, period; every item opens `/ws/audits` (`OverviewModule.tsx:56,120-128`); shown to **every role with Overview** (analyst, employee, auditor see internal audit names) | 3 reads 5 |
| Board pack section 6 | same list with fw, stage, progress (`features/overview/lib/boardPack.ts:44-45,119-120`) | 3 reads 5 |
| **Server Overview** | `overview()` (`server/ws/insight.ts:65-77`) returns figures for risks, issues, frameworks, vendors and controls only: **it does not read audits**. The browser computes the audit KPI and list from `DATA.audits`, which is empty in API mode, so production shows 0 and "No audits in progress." until group 5 adds a loader or the server returns audit figures for roles without the module | 3 / 5 |
| Risk snapshot `shared` | audits in Planned or Fieldwork (0.5) | 3 reads 5 |
| Team retention / legal hold | `RETENTION` "audit" (84 months, floor 60) and `retentionPreview("audit")` counting `WS_AUDIT` entries past the period (`features/team/services/governance.ts:108,162-167`) | Team reads 5 |
| Audit log (every module) | every `wsLog` call in the app; server: every `t.audit(...)` in a company transaction (`server/ws/store.ts:47-48,93`) and core/support/directory writers (section 3.7) | all |
| Admin Console log | `audit.report.generated`, `ropa.exported` written from the workspace with `adminLog` | 8 |
| AppSec | nothing (static JSON) | - |

---

## 1. AUDITS (`/ws/audits`, `features/audits/*`, `services/audits.ts`)

### 1.1 Data model

**A. Audit (engagement)** (`DATA.audits`, seed 5) - CO
| Field | Type | Notes |
|---|---|---|
| `id` | `AUD-nn` | new: `nextId("AUD-", 10, DATA.audits)` = `AUD-` + (10 + count), bumped until unique (`services/audits.ts:32-36,62`), e.g. AUD-15; seed ids zero-padded |
| `name` | string | UI: required, `clampText` 120 (`AuditFormPage.tsx:27-28`); **service does not validate** (`services/audits.ts:59-69`) |
| `fw` | one of `AUDIT_FWS` "ISO 27001", "SOC 2", "GDPR", "PCI DSS", "NIST CSF", "-" (`services/audits.ts:11`) | UI enforces the list, else first (`AuditFormPage.tsx:31`); service does not |
| `auditor` | free text (firm), max 120 (UI) | default "Internal Audit" (`services/audits.ts:64`) |
| `lead` | `"Internal, <name>"` \| `"External, <name>"` | new audits: `"Internal, " + actor` (`:64`); **no way to create an external engagement or change the lead**; the auditor link is this text |
| `stage` | `DATA.auditStages` Planned, Fieldwork, Reporting, Complete | new: Planned |
| `scope` | text max 500 (UI) | default "To be defined" |
| `period` | free text ("12 Mar 2027", "Window to 30 Apr 2027", "Fieldwork to 30 Nov 2026") | new: "Planning"; never editable; shown as "Timeline" |
| `progress` | 0..100 | `STAGE_PROGRESS` [0,40,85,100] by stage (`:14,97`); clamped for display (`AuditsModule.tsx:24`) |
| `opened` | date text | seed "02 Oct 2026"; new: ISO `nowStamp().slice(0,10)` (mixed formats) |
| `pbc` | PBC[] (B) | |
| `tests` | Test[] (C) | read-only; no action adds a test |
| `findings` | Finding[] (D) | |
| `irs` | IR[] (E) | absent in seed; `auditInit` adds `[]` |
| `auditorAccess` | `none` \| `granted` \| `ended` | absent in seed -> `none` (`services/audits.ts:26`) |
| `populationsFrozen` | bool | absent -> false (`:27`) |

Seed (`data/seed.json:1256-1463`): AUD-01 "ISO 27001 surveillance" BSI, External M. Blake, Planned, 3 PBC Requested; AUD-02 "SOC 2 Type II" Prescient Assurance, External J. Wong, Planned, 2 PBC; AUD-03 "Internal GDPR review" Internal Audit, Internal A. Rivera, Fieldwork 40%, PBC 2 Received + 1 Outstanding, tests T-01 PRIV-1 Pass, T-02 TPR-1 Exception, finding F-01 Low Open -> R-055; AUD-04 "ISO 27001 recertification" BSI, External M. Blake, **Complete** 100%, finding F-02 Low Closed; AUD-05 "Penetration test 2026" Cure53, External F. Vega, Reporting 85%, test T-05 APP-1 Exception, finding F-03 High Open -> R-052.

**B. PBC item** (prepared-by-client request) - CO, embedded: `{id "PBC-nn", item ≤300 (UI), owner ≤80 (UI) free-text name, default actor, "Unassigned" when blank (svc), status Requested | Outstanding | Received}`. New id `"PBC-" + (50 + pbc.length)` (`services/audits.ts:113`): unique within one audit (seed ids are below 50) but **repeats across audits** (PBC-53 can exist in AUD-01 and AUD-03).

**C. Control test** - CO (seed only): `{id "T-nn", ctrl, result "Pass" | "Exception", note}`.

**D. Finding** - CO, embedded: `{id "F-nn", title, sev Critical|High|Medium|Low (`FINDING_SEVS`, `:19`), status Draft | Open | Rejected | Closed, rec, issue ("" or issue id), draftedBy, acceptedBy, acceptedAt (ISO), rejectedReason, rejectedBy}`. New id `"F-" + pad2(findings.length + 1)` (`:145`): repeats across audits (F-02 in AUD-03 and AUD-04). "Open" for counting = not Closed, Draft or Rejected (`isOpenFinding`, `:21`). No action sets Closed (seed F-02 only) and nothing syncs a finding with its issue's status.

**E. Information request (IR)** - CO, embedded: `{id "IR-nn", item, by (auditor name), at ISO day, status Open | Answered | Closed, response, answeredBy}` (`:154-155,164`).

### 1.2 Screens
**Register `/ws/audits`** (`AuditsModule.tsx:13-51`)
- Management/others: page action "New audit" (disabled with the `whyCannotManage` text as title for non-managers, `:37`).
- Auditor: page action "Information requests" (disabled when the pool is empty, `:36`) and an intro card "Audits assigned to you": "As external auditor you have read-only access to the organisation's records. You can raise information requests and draft findings; management accepts a finding into an issue. You cannot advance stages, freeze populations, end access, create issues or change management requests." (`:39-44`).
- DataTable (0.3): Audit (locked), Framework, Auditor, Progress (bar + "n%", accent token), Open findings (end-aligned, `--bad-ink` when > 0) (`:26-32`). Rows: all audits, or for the auditor all `/External/` audits (`:23`).

**Form page `/ws/audits/new`** (`AuditFormPage.tsx:14-51`): non-managers see "You cannot do this" with the reason (`:23-24`). Section 1 "Audit": Audit name* (max 120, placeholder "e.g. PCI DSS readiness"), Framework select (`AUDIT_FWS`); section 2 "Auditor and scope": Auditor (max 120, "e.g. Internal Audit"), Scope textarea (max 500). Error "Audit name is required." (`:28`). Buttons Cancel / Create audit (disabled while busy). Unsaved-changes guard on leaving with typed work (`:19-20`).

**Record `/ws/audits/:id`** (`AuditDetail.tsx:27-211`)
- Header: title name, sub "<fw> · <auditor> · <lead>", back "Audits"; actions StageChip (Planned info/clock, Fieldwork and Reporting warn/clock, Complete ok/check, `:17-18`), "Generate report" (everyone), "Advance stage" (hidden when Complete; disabled with `whyCannotManage`) (`:190-196`).
- Tabs Overview / Requests (PBC) / Information requests / Control testing / Findings (+ count tag) (`:16,197-205`).
- **Overview** (`:76-108`): KPIs Stage, Progress "<n>%", Requests "<received>/<total> in", Open findings (bad/good tone); meta Scope, Framework, Auditor, Lead, Timeline, Opened. Panel "Auditor access & populations": chips "Auditor access granted" (ok) / "Auditor access ended" (neutral) / "Not yet shared with auditor" (warn), "Populations frozen" / "Populations live". Managers: "Send to auditor" (only when access none), "Freeze populations now" (only when live), "Complete & end auditor access" (only when granted and stage != Complete; disabled with `whyCannotComplete`), text "Engagement closed and locked." (ended and frozen), "Cannot complete yet: <reason>", help "Freezing populations locks the sampled records so evidence can't change mid-audit. Ending access completes the engagement and revokes the external auditor's read access." Others: "Read-only for your role. Management (admin/owner) manages auditor access, populations, stages and requests. Auditors may raise information requests and draft findings."
- **Requests (PBC)** (`:109-125`): "Prepared-by-client requests", "Add request" (disabled for non-managers); table ID, Request, Owner, Status chip (Received -> Done, Outstanding -> Overdue, else Pending, `:21`), "Advance" per row (disabled for non-managers). Empty "No requests yet" / "Add the evidence requests the auditor needs from the team."
- **Information requests** (`:126-147`): "Raise request" (disabled with `whyCannotAuditorAct`; the reason is printed for the auditor); table ID, Request, Raised by (+ date), Status chip (Closed -> Done, Answered -> Approved, else Pending) + status text, Response ("—"), "Respond" (Open only, managers), "Close" (not Closed, auditor rules). Empty "No information requests" / "Auditors raise requests here; management responds."
- **Control testing** (`:148-160`): "Control tests", table Test, Control, Result (Pass -> Pass, Exception -> Fail chip), Note. Empty "No tests recorded" / "Control testing begins once fieldwork is underway." No actions.
- **Findings** (`:161-187`): "Draft finding" (auditor rules); table ID, Finding (+ recommendation), Severity, Status (+ "by <draftedBy>" for drafts, rejected reason for declined), Linked issue (link to `/ws/issues`, the list, not the issue), actions "Accept into issue" (Draft) or "Create issue" (Open) and "Decline" (Draft), hidden when linked, Closed or Rejected; disabled for non-managers. Empty "No findings" / "No findings have been raised for this audit."
- **Dialogs** (`AuditModals.tsx`): "Add request, <name>" (Request* max 300, placeholder "e.g. Access review export"; Owner max 80, default my name; error "Request description is required."; `:16-36`); "Audit report, <name>" summary (Framework, Auditor, Stage, Scope, Requests received "x of y", Tests run "n (p pass, e exception)", Open findings; note "Draft only. Compliance outputs require review by qualified compliance, legal or risk personnel before use."; buttons Close / Export; snapshot taken when opened; `:39-55`, `AuditDetail.tsx:64-73`). Shared `TextForm` (`:58-80`): textarea max 500 (`clampText` 500), optional severity select (default `sevs[1]` = High), optional Recommendation input max 500, error "<label> must be at least <min> characters.":
  - "Raise information request, <name>": label "What do you need?", min 5, help "Management responds to information requests. You cannot change the organisation's own records.", confirm "Raise request" (`:81-82`).
  - "Respond, <IR id>": label "Response", min 5, confirm "Send response" (`:83-84`).
  - "Draft finding, <name>": label "Finding", min 10, severity, "Recommendation", help "A draft is not an issue. Management accepts it into an issue or declines it with a reason.", confirm "Save draft" (`:85-86`).
  - "Decline finding, <F id>": label "Reason", min 10, confirm "Decline finding" (`:87-88`).
  - "Complete & end auditor access": label "Reason for closing with open findings or outstanding requests" (min 10) or "Closing note (optional)" (min 0), help "Completes the engagement, locks it and revokes the external auditor's read access. Recorded in the audit log.", confirm "Complete engagement" (`:89-90`). Whether a reason is needed is computed when the dialog opens (`AuditDetail.tsx:46`).

### 1.3 User actions
M = management (admin/owner, `whyCannotManage`). A = assigned auditor with access granted (`whyCannotAuditorAct`). All audit entries cat `"Audit"`.

| # | Action | Who | Validation | SoD / four-eyes | Audit | API stub |
|---|---|---|---|---|---|---|
| A1 | Create audit (`AuditFormPage.tsx:25-34`, `services/audits.ts:59-69`) | M | UI only: name required ("Audit name is required."), ≤120; fw in list else first; auditor ≤120; scope ≤500. Service: none (defaults "Internal Audit", "To be defined") | none; lead = creator | (UI) `audit.created` "<name>"; toast "Audit created"; navigates to the record | `POST /audits {name, fw, auditor, scope}` |
| A2 | Send to auditor = grant access (`AuditDetail.tsx:42-45`, `services/audits.ts:70-72`) | M | audit exists ("Audit not found."); **no state or stage check** in the service (UI shows the button only when access is none, also on Complete audits) | none; single person; no named auditor, expiry or notification | (UI) `audit.auditor.access.granted` "<name> → <auditor>"; toast "Auditor access granted for <auditor>" | `POST /audits/:id/auditor-access` |
| A3 | Complete & end auditor access (`AuditModals.tsx:89-90`, `services/audits.ts:74-83`) | M | `whyCannotComplete`: "<n> auditor-drafted finding(s) await a management decision." / "<n> information request(s) are still open." (any IR not Closed, **Answered included**, `:49,52-56`); reason ≥10 when open findings or any PBC not Received ("A reason for closing with open findings or outstanding requests of at least 10 characters is required."), else optional, stored ≤500; UI min 10 / 0; **no check that access is granted** | none (single manager) | (svc) `audit.auditor.access.ended` "<id> by <me>[: <reason>]"; access ended, stage Complete, progress 100; toast "Auditor access ended; audit completed" | `POST /audits/:id/auditor-access/end {reason}` |
| A4 | Freeze populations (`AuditDetail.tsx:47-50`, `services/audits.ts:84-86`) | M | exists; no state check (UI hides when frozen) | none; **no unfreeze**; nothing enforces the freeze | (UI) `audit.populations.frozen` "<name>"; toast "Populations frozen for <name>" | `POST /audits/:id/populations/freeze` |
| A5 | Advance stage (`AuditDetail.tsx:51-54`, `services/audits.ts:87-101`) | M | next stage in `DATA.auditStages`; to Complete: `whyCannotComplete`, and refused while access is granted ("Use "Complete & end auditor access" so the external auditor is revoked and the reason is recorded."); already Complete -> `null`, no toast; a stage not in the list restarts at Planned | none | (UI) `audit.stage.advanced` "<id> <name> → <stage>"; toast "<name> moved to <stage>"; progress from `STAGE_PROGRESS`. **Advancing to Complete when access was never granted needs no reason even with open findings or outstanding PBC** (the A3 reason rule is skipped) | `POST /audits/:id/advance` |
| A6 | Add PBC request (`AuditModals.tsx:16-36`, `services/audits.ts:111-117`) | M | UI: item required ("Request description is required."), ≤300; owner ≤80. Service: none on item; owner blank -> "Unassigned" | none | (UI) `audit.pbc.added` "<name>: <item>"; toast "Request added"; switches to the PBC tab | `POST /audits/:id/pbc {item, owner}` |
| A7 | Advance PBC status (`AuditDetail.tsx:55-58`, `services/audits.ts:103-110`) | M | unknown pid -> `null` (silent); cycles Requested -> Outstanding -> Received -> **Requested** (wraps); any stage, even Complete/frozen | none; no evidence, no reason | (UI) `audit.pbc.updated` "<name>: <pid> <status>"; no toast | `POST /audits/:id/pbc/:pid/advance` |
| A8 | Create issue from an Open finding / Accept a Draft into an issue (`AuditDetail.tsx:59-62`, `services/audits.ts:119-130`) | M | `null` (silent) when the finding is missing, already linked, Closed or Rejected | none (single manager; the auditor drafted it, so drafter != acceptor by role) | (svc) `audit.finding.promoted` "<aid> <fid> → <iid>[ (accepted draft by <drafter>)] by <me>"; toast "Issue <iid> created from finding". Creates issue `{id nextId("R-",60) e.g. R-66, title, sev (may be Critical), status Open, owner = lead name for internal audits else me, due "Due 14d" (static text), createdBy}`; **no `issue.created` entry**, no owner notification; draft -> Open with `acceptedBy`, `acceptedAt` | `POST /audits/:id/findings/:fid/issue` |
| A9 | Decline a drafted finding (`AuditModals.tsx:87-88`, `services/audits.ts:131-139`) | M | status Draft only ("Only a drafted finding can be declined."); reason ≥10 ("A reason of at least 10 characters is required."), ≤500; UI "Reason must be at least 10 characters." | none | (svc) `audit.finding.rejected` "<aid> <fid> by <me>: <reason>"; toast "Draft finding declined" | `POST /audits/:id/findings/:fid/reject {reason}` |
| A10 | Respond to an IR (`AuditModals.tsx:83-84`, `services/audits.ts:160-168`) | M | IR Open ("The request is not open."); response ≥5 ("A response of at least 5 characters is required."), ≤500 | none | (svc) `audit.ir.answered` "<aid> <rid> by <me>"; toast "Response sent"; no attachment | `POST /audits/:id/information-requests/:rid/respond {response}` |
| A11 | Generate report (`AuditDetail.tsx:64-73`, `services/audits.ts:177-182`) | **anyone with the module** (no check) | `findAudit(id)!` (no not-found guard) | none | (UI) `adminLog("audit.report.generated", <name>, {categories ["Audit"], basis "Legal obligation"})` into the **platform** log (also in API mode) **and** `wsLog("audit.report.generated", <name>, "Audit")`; downloads `<id>-report.txt` (`safeFileName`); toast "Report exported (demo)". Text: name, framework, auditor, stage, scope, PBC list, tests, non-Draft findings (Rejected included) with issue, "Draft only. Requires human review before use." | `POST /audits/:id/export/report` |
| A12 | Raise information request (`AuditModals.tsx:81-82`, `services/audits.ts:151-159`) | A | UI: ≥5, ≤500; service: none on text | auditor rules only | (svc) `audit.ir.raised` "<aid> <rid> by <me>"; toast "Information request raised" | `POST /audits/:id/information-requests {item}` |
| A13 | Draft finding (`AuditModals.tsx:85-86`, `services/audits.ts:141-150`) | A | sev in list ("Unknown severity."); UI title ≥10, ≤500, rec ≤500; service: none on title | auditor rules only | (svc) `audit.finding.drafted` "<aid> <fid> (<sev>) by <me>"; toast "Finding drafted for management" | `POST /audits/:id/findings {title, sev, rec}` |
| A14 | Close an IR (`AuditDetail.tsx:141`, `services/audits.ts:169-175`) | A | not already Closed ("The request is already closed."); **an unanswered Open IR can be closed too** | auditor rules only; **management cannot close** | (svc) `audit.ir.closed` "<aid> <rid> by <me>"; toast "Request closed" | `POST /audits/:id/information-requests/:rid/close` |
| A15 | Open record, tabs, search, stage tabs, export selected (`audits.csv`), auditor "Information requests" shortcut | module | - | - | none (export not audited) | none |

### 1.4 Computed values
- Progress bar: `clamp(0..100, Number(progress))` (`AuditsModule.tsx:24`); stored progress only changes with the stage (`services/audits.ts:97`).
- Open findings: `isOpenFinding` (`:21`) per audit (register column, Overview KPI, report modal).
- Requests KPI: count Received / total (`AuditDetail.tsx:82`).
- Close-reason need: any open finding or any PBC not Received (`needsCloseReason`, `services/audits.ts:57`).
- Completion block: drafts or IRs not Closed (`whyCannotComplete`, `:52-56`).
- Overview `upcomingAudits` and "Audits in motion", risk snapshot `inAudit` (0.8).

### 1.5 Cross-module links
- OUT: issue creation into Issues (A8; link opens `/ws/issues`, not the issue); issues delete guard; Overview KPI and list; board pack; risk snapshot flag.
- IN: none. Tests are not linked to controls, PBC items not to evidence, `fw` not to framework ids.

### 1.6 Simulated
- Report export is a demo text file; nothing is signed or stored ("Report exported (demo)").
- "Send to auditor" and "end access" change a flag: no account, invitation, session revocation or read scoping happens (the UI copy says "revokes the external auditor's read access").
- "Freeze populations" and "Engagement closed and locked." lock nothing: PBC advance, add request, create issue, freeze and the report stay available after completion (`AuditDetail.tsx:114,120,179`).
- Control tests are seed-only; there is no fieldwork testing workflow, no sampling, no workpapers.
- PBC "evidence requests to auditees" are status labels: no assignee account, no due date, no upload, no reminder.

---

## 2. AUDITOR ACCESS (role `auditor`, cross-module)

### 2.1 What the auditor can open and do (Morgan Blake, `data/roles.json:84-92,174-183`)
| Module | Read | Write |
|---|---|---|
| Overview | everything any Overview role sees, including internal audit names (0.8) and board-pack export (server allows auditor, `server/ws/insight.ts:101`) | board pack export |
| Audits | all `/External/` engagements (not only assigned ones), every tab | A12, A13, A14 on engagements where lead = me and access granted; A11 report on any visible engagement |
| Controls, Evidence, Policies, Frameworks | read (group 1-2 inventories); evidence file download on the server, audited | none (each module's write gates exclude auditor; e2e `readonly.spec.ts:29-41` (auditor buttons and policies)) |
| AppSec | read | none |
| Audit logs | **no** | - |
| Risk | **no** (so a "Shared with auditor" snapshot is not visible to any auditor) | - |

### 2.2 Gaps the port must decide
- Per-engagement scoping by **user id** (assignment record: engagement, auditor user, firm, period from/to), not by lead text; the server must return only assigned engagements and 404 others (`AuditDetail.tsx:33` comment).
- Time-boxed access: start, end, automatic expiry (principle 7, `docs/security/SOD_MATRIX.md:17`), and whether the auditor's read access to controls, evidence, policies and frameworks should depend on a live engagement (today it is standing, 0.1).
- Invitation of an external auditor (Team invite with role `auditor` exists, `lib/rules.ts:17`); whether a grant names a person or a firm.
- What "shared with auditor" means for risk snapshots, evidence packages and PBC deliverables, and how the auditor reads them.
- Whether the auditor may read the company audit log (AppSec matrix says yes, ROLE_MODS says no).

---

## 3. AUDIT LOGS (`/ws/auditlog`, `features/auditlog/*`, `lib/audit.ts`, `lib/ropa.ts`)

### 3.1 Data model
**A. Workspace entry `WsEntry`** (`lib/audit.ts:7`): `{seq (1..n, position in the chain), prev (8-hex), hash (8-hex), at "YYYY-MM-DD HH:MM" local, actor (display name), action, target, cat}`.
- Seal: FNV-1a 32-bit (`hashStr`, `lib/audit.ts:9-13`) over `seq␟at␟actor␟action␟target␟cat␟prev` (U+241F separator, `:14-15`); genesis `00000000` (`:8`). `verifyWsChain` walks from genesis (`:27-31`); `linkOk` also checks each entry's `prev` equals its predecessor's hash (`features/auditlog/services/auditlog.ts:28-31`).
- Categories filter `AUDIT_CATS` = All, RoPA, Control, Access, Policy, Vendor, Risk, System (`auditlog.ts:16`).
- No update or delete function exists (header comment `auditlog.ts:1-5`).

**B. Export register `WsExport`** (`auditlog.ts:23-25`): `{id "WEXP-nnn", at, by, entries, sha}`.

**C. RoPA activity** (REF, `data/platform.json:450`, 17 rows): `id, scope, name, purpose, basis, subjects, data, recipients, transfers, retention, tom` (`lib/ropa.ts:27`). Each log entry is tagged by the heuristic `ropaFor` (`lib/ropa.ts:8-25`): Access -> PA-02, Policy -> PA-05, Risk -> PA-06, Vendor -> PA-07, RoPA -> PA-13, `control|test|evidence` actions or Control -> PA-04, everything else (Audit, Approval, System) -> PA-15; `incident.*` -> PA-12.

**D. Server company log** (exists today, read side missing): table `audit_log` (`supabase/migrations/0001_selvara_auth.sql:29-32`: `seq bigserial` global, `at_ms`, `actor`, `action`, `target`, `cat`, `space ws|admin`, `ip`) plus `tenant_id`, `actor_id`, `request_id`, `basis`, `chain_n`, `prev_hash`, `hash` (`0003_tenancy_foundation.sql:136-142`); append-only trigger refuses update and delete (`0001:35-38`); per-tenant SHA-256 chain computed by trigger over `scope␟chain_n␟prev_hash␟at_ms␟actor_id␟actor␟action␟target␟cat␟space␟ip␟request_id␟basis` (chr(31)), genesis 64 zeros, head in `audit_chain` (`0003:145-161`); `audit_verify(scope)` returns the first bad `chain_n` (`0003:165-176`) but is revoked from every role (`0004_company_sessions.sql:77`); only `platform_audit_verify()` is granted to the app (`0006_platform_console.sql:93-107`). RLS `app_audit`: own tenant, or platform rows for platform staff (`0003:209-212`). Writers: `auditSql` / `auditArgs` (`server/directory.ts:93-94`), company-module entries via the ws store `entry` (cat default "Control", system entries actor "System" and ip "system", target sliced to 1000; `server/ws/store.ts:47-48,93`), core entries (cat default "Access", `server/core.ts:60-62`).

### 3.2 Screens (`AuditLogModule.tsx:17-69`)
- Header: segmented tabs Audit log / Chain integrity / RoPA register / Evidence export (`:52`); status "Chain intact, <n> entries" (check icon, `--ok-ink`) or "Chain broken" (alert icon, `--bad-ink`), recomputed every render (`:22,53-55`). Page actions: JSON / CSV export on the log and RoPA views (disabled without access), none on the others (`:30-33`).
- **Audit log** view: DataTable newest first (`:34`), columns # (seq), Timestamp, Category (chip; RoPA = info), Actor (locked), Action, Target, RoPA activity (tag "PA-nn" or "—", activating opens the RoPA view), Hash (`:35-47`). Tabs All + RoPA, Control, Access, Policy, Vendor, Risk, System (`:63`); search over actor, action, target, cat (`:62`). Entries with cat Audit, Approval (demo) or Evidence, Issue, Incident, Security (server) appear **only under All**.
- **Chain integrity** (`ChainView.tsx:6-48`): banner "Chain intact" / "Chain broken — tampering detected", "<n> entries sealed. Anchored head: <hash>", "Verify chain" (disabled without access); `DEMO_HASH_NOTE` ("Demo seal: 32-bit FNV-1a chaining, which shows tamper evidence but is NOT a cryptographic guarantee. A real system needs server-side append-only storage with HMAC or signatures.", `auditlog.ts:17`); explainer "How the chain of evidence works" (3 bullets); "Chain summary" Status (Intact/Broken chip), Entries sealed, Genesis hash, Anchored head, Algorithm "FNV-1a 32-bit (demo, not cryptographic)"; "Chain links" table newest first: #, Time, Actor, Action, Target, Prev hash, Entry hash, Link ("Sealed" / "Broken" chip from `linkOk`).
- **RoPA register** (`RopaRegister.tsx:5-30`): intro "Record of Processing Activities under GDPR Article 30. Each event is tagged to one of these activities. Synthetic sample — confirm with the DPO before relying on it." (`AuditLogModule.tsx:59`); one card per activity: id, name, scope tag, "<n> event(s)" from `ropaFor`, Purpose, Lawful basis, Data subjects, Data categories, Recipients, Transfers, Retention, Security measures (Art. 32). The same component renders the Admin Console RoPA (`features/adminlog/AdminLogModule.tsx:13`).
- **Evidence export** (`EvidenceView.tsx:6-26`): "Evidence export package", help "Generate a sealed package of the workspace audit log and RoPA register with a hash manifest for auditors. Append-only; each package is recorded below. Demo digest (FNV-1a), not SHA-256 or a signature: a real package must be signed server-side.", button "Generate and download package"; "Exports register" table Package, Generated, By, Entries, Package hash (demo); empty "No packages yet" / "Generate a package to seal the current log and RoPA register for an auditor."

### 3.3 User actions
Gate L = `canAuditLog` (admin/admin2). All service errors show "Could not complete that action".

| # | Action | Who | Validation | SoD / four-eyes | Audit | API stub |
|---|---|---|---|---|---|---|
| L1 | Export log JSON / CSV (`AuditLogModule.tsx:27`, `auditlog.ts:37-48`) | L | format json/csv (`ApiError(400,"Bad format")`) | none; no rate limit | (svc) `auditlog.exported` "<n> entries, JSON\|CSV" cat System (n counted before this entry); file `workspace-audit-log.json` (all fields) or `.csv` (`seq,at,actor,action,target,cat,hash,prev` through `csvCell`); toast "Audit log exported (<FMT>)" even when the browser blocked the download | `POST /audit/exports {format}` |
| L2 | Verify chain (`AuditLogModule.tsx:26`, `auditlog.ts:33-35`) | L | - | none | (svc) `auditlog.chain.verified` "intact, <n> entries" or "BROKEN" cat System (verifying moves the head); toast "Chain verified: intact" or "Chain verification FAILED" | `POST /audit/verify` |
| L3 | Export RoPA JSON / CSV (`AuditLogModule.tsx:28`, `auditlog.ts:50-58`, `lib/ropa.ts:30-33`) | L | format | none | (svc) `adminLog("ropa.exported", "<17> activities, <FMT>", {categories ["Audit"], basis "Legal obligation"})` into the **platform** log only; files `RoPA-register.json` / `.csv`; toast "RoPA register exported (<FMT>)" | `POST /audit/ropa/exports {format}` |
| L4 | Generate evidence package (`AuditLogModule.tsx:29`, `auditlog.ts:59-71`) | L | - | none; no reviewer sign-off despite the manifest note | (svc) `evidence.package.generated` "<WEXP-nnn>, <n> entries" cat System (tagged PA-04 by `ropaFor` because the action starts with `evidence`); register row; download `<id>-manifest.json` = `{package, generated, generatedBy, entries, ropaActivities, anchoredHead, hash (3 FNV-1a digests, 24 hex), algorithm "FNV-1a (demo, not cryptographic)", note "Sample evidence package for illustration. Requires reviewer sign-off."}`. **Only the manifest is downloaded, not the entries or the RoPA it describes**; toast "Evidence package <id> generated" | `POST /audit/packages` |
| L5 | Filter by category tab, search, open RoPA from a row, switch view, export selected (`audit-log.csv`) | module | search box only (DataTable) | - | none: **"Export selected" is not audited** | none |

### 3.4 Computed values
- Chain status and per-link status on every render (`AuditLogModule.tsx:22`, `ChainView.tsx:41`); anchored head = last hash (`lib/audit.ts:26`).
- RoPA event counts per activity (`RopaRegister.tsx:11`).
- Retention preview counts entries older than the period (`features/team/services/governance.ts:162-167`; tests `tests/unit/governance.test.ts:86-87`).

### 3.5 How the module would read the server's company log
- **No workspace read route exists.** `server/core.ts` ROUTES (`:553-561`) and the workspace routes (`server/ws/routes.ts:42-44`) have no `GET ws/audit`. Existing reads of `audit_log`:
  - `GET admin/audit` (platform staff): platform rows only (`tenant_id is null`), newest 300 (max 500), `{seq, at, actor, action, target, ip, chainN, hash}`, plus `verified` / `firstBad` from `platform_audit_verify()` (`server/admin.ts:108-117`, `server/platform.ts:131-141`).
  - `GET admin/support/view/audit` (support staff inside a live customer grant): newest 200 company rows, `{at, actor, action, target}` only, no category, hash or chain fields (`server/support.ts:51,131-132,264`).
  - `GET team/support` (company admin): only `support.%` rows, newest 100 (`server/support.ts:83-86,222-224`).
- The port needs: a company-admin read route (paging by `chain_n`, filters cat/actor/action/date, search, deny other roles), a tenant-scoped verify function (wrap `audit_verify(app_tenant()::text)` like `platform_audit_verify`), server-built exports that write `auditlog.exported` in the same transaction (the existing `POST ws/exports` only accepts five browser-built export kinds, `server/ws/routes.ts:20-41`), and a signed evidence package stored server-side.
- Display mapping: `seq` (global across tenants) vs `chain_n` (per tenant; the chain view's "#"), `at_ms` -> local time, 64-hex SHA-256 `hash`/`prev_hash`, genesis 64 zeros, extra fields `actor_id`, `ip`, `request_id`, `basis`, `space`. `linkOk` cannot be recomputed in the browser without exposing `actor_id`, `ip` and `request_id`; verification should be the server's answer.
- Categories the server writes (`server/ws/*.ts`): Access, Approval, Control, Evidence, Incident, Issue, Policy, Risk, System, Vendor, plus Audit once group 5 moves; core uses Access, Security (`server/core.ts:60,81`). `AUDIT_CATS` lacks Audit, Approval, Evidence, Issue, Incident and Security.

### 3.6 Simulated
- FNV-1a seal and package digest (stated on the page); the chain lives in browser memory and resets on reload; the 13 seed entries are synthetic and also load in production (0.4).
- RoPA is the platform's synthetic register, not the company's; `ropaFor` is a heuristic (`lib/ropa.ts:1-2`).
- Exports register is module memory.

---

## 4. APPSEC (`/ws/appsec`, "Security Controls", `features/appsec/*`)

### 4.1 What it is
A **read-only reference specification** ("Application Security Controls: read-only reference specification (no persistence, no actions)", `AppSecModule.tsx:16`), banner "Specification text only. It describes what the server must enforce; nothing on this page changes behaviour or records evidence. Draft content that needs review by qualified security staff." (`:42`). **There are no application security findings, SAST/DAST results, scans, scan schedules or security exceptions anywhere in this module or in the codebase.** The nearest data: audit AUD-05 "Penetration test 2026" (Cure53) with finding F-03 -> issue R-052 (`data/seed.json:1426`), control exceptions (`control.exception`, group 1), and a "Quartz" "Vulnerability scanner" integration tile "Not connected" (`features/integrations/data/integrationsSeed.json:48-56`, group 7).

### 4.2 Data model (REF, `features/appsec/data/appsecSpec.json`)
| Key | Line | Content |
|---|---|---|
| `intro` | `:2` | purpose, "Mapped to OWASP ASVS 4.0.3 …" |
| `coreRule` | `:3-6` | "Core rule: the browser is untrusted" |
| `neverSend` | `:7-16` | 8 response fields that must never be sent |
| `badResponse` / `goodResponse` | `:17-18` | example HTTP login responses (placeholders) |
| `groups` | `:19-153` | 9 groups `{id, title, threat, controls[], refs, test}`: identity-authorisation (6 controls), account-discovery (6), brute-force (7), password-reset (7), sessions-csrf (6), data-minimisation (5), input-handling (5), errors-headers-transport (5), logging-monitoring (5) |
| `rateLimitsIntro`, `rateLimits` | `:154-163` | 7 rows `{ep, id, ip, then}`: POST /auth/login, /auth/mfa/verify, /auth/password/forgot, /auth/password/reset, /auth/signup, invite acceptance link, authenticated API |
| `matrixIntro`, `matrixRoles`, `matrix` | `:164-180` | roles Super admin, Company admin, Policy owner, Member, Auditor; 13 actions (e.g. "View company audit log": Platform log only / Yes / No / No / Yes, `:177`) |
| `releaseGate` | `:181-190` | 8 go-live evidence items (pen test, ASVS L2 sign-off, IDOR suite, enumeration timing, rate limits, response schema review, headers/TLS/cookies, secrets in a vault) |

### 4.3 Screen and interactions (`AppSecModule.tsx:17-87`)
| # | Interaction | Who | Limits | Audit | API |
|---|---|---|---|---|---|
| S1 | Section buttons Core rule / Responses / Control groups / Rate limits / Permissions / Release gate scroll to and focus the section (`:12,26-31,43-45`) | appsec roles | - | none | none |
| S2 | Search controls (`:61`): matches title, threat, refs, test and controls, case-insensitive; matching groups shown expanded; "<n> of 9 shown" (aria-live); empty "No matching controls" / "Try a different search term." | same | max 80 chars | none | none |
| S3 | Expand all / Collapse all / toggle a group (`:62-63`, `ControlGroup.tsx:7-28`: `aria-expanded`, "Threat:", controls list, "Maps to:", "Test:") | same | - | none | none |
| S4 | Release gate ticks (`ReleaseGate.tsx:4-22`): "These ticks are for reading along only: they are not saved, not logged and are not evidence that any gate has passed."; "<n> of 8 ticked on this screen" | same | component state | none | none |
| S5 | Read rate-limit table and permission matrix (chips Yes ok/check, No neutral/x, Own… info/user, other warn/clock; `PermissionMatrix.tsx:6-11`) | same | - | none | none |

### 4.4 Cross-module
- Platform Security (admin space) shows a button "Full application security controls spec" only when `modAllowed(role, "ws", "appsec")` (`features/platformsecurity/PlatformSecurity.tsx:47,53`); super and support have no `ws` space (`data/roles.json` ROLES), so **every admin-space user sees "(not available to your role)"**. `docs/guides/checklist/appsec.md:17` wrongly says super has access via `*`.
- `docs/guides/checklist/appsec.md:19-37` lists 14 conflicts between the spec and the portal (several now resolved on the server, for example sign-in lockout and network blocking, `docs/security/SOD_MATRIX.md:137-142`; the checklist still says "No lockout").

### 4.5 Port
Nothing to store. Porting = adding `appsec` to `SERVER_READY.ws` (static page). If the programme intends real AppSec findings, scans and exceptions, that is a **new module** with no demonstration behaviour to preserve; decide its scope separately.

---

## 5. Server checklist distilled (rules a server must reproduce)
1. Module visibility per ROLE_MODS (0.1); add `audits`, `auditlog`, `appsec` to `SERVER_READY.ws`; update `tests/unit/rbac.test.ts:20`; add a `services/ws.ts` loader for audits (and `auditStages` as REF, since `DATA.auditStages` is empty in API mode) and a reader for the company audit log; stop loading `wsAuditSeed.json` in production.
2. Storage: kind **`"audit"`** with `findings[].issue` embedded (the server issue delete guard already reads exactly this, `server/ws/issues.ts:174`), or change the guard in the same commit. Stable server ids for audits, PBC items, IRs and findings (unique per company, not per audit; not derived from array length).
3. Identity by user id: `lead`/assigned auditor, PBC owner (member id + name), IR `by`/`answeredBy`, finding `draftedBy`/`acceptedBy`/`rejectedBy`, issue owner on promotion (`createIssueIn` needs `owner {id, name}`, `server/ws/issues.ts:39`; an internal lead such as "A. Rivera" must be a member whose role can open Issues).
4. Management (admin/owner) for create, grant/end access, freeze, advance stage, PBC add/advance, respond to IR, accept/decline finding; validate on the server what only the UI validates today (name 1..120, fw enum, auditor ≤120, scope ≤500, PBC item 1..300, owner ≤80, IR text 5..500, finding title 10..500, rec ≤500, sev enum).
5. Auditor: role auditor **and** assigned to the engagement by user id **and** access live (granted, not ended, not expired); raise IR, draft finding, close IR. Decide whether management may close an IR (today a never-closed Answered IR blocks completion forever, A3/A14) and whether closing an unanswered IR is allowed.
6. Completion: refuse while drafts or non-closed IRs exist; require a reason ≥10 when open findings or outstanding PBC remain **on every path to Complete**, including "Advance stage" when access was never granted (A5 bypass); completion ends access, sets Complete/100, writes `audit.auditor.access.ended` with the reason.
7. Auditor access lifecycle: grant names a person and a period, expires automatically (job + audit), cannot be granted on a Complete engagement (or must be endable), revokes the auditor's reads of the engagement on end; decide whether the auditor's standing read of controls/evidence/policies/frameworks becomes engagement-bound.
8. Frozen populations: decide what is frozen (evidence versions, control tests, risk snapshot) and enforce it in those modules; decide unfreeze.
9. Finding -> issue: create through `createIssueIn` (real `dueDate`, default 14 days, `source` = audit/finding, `issue.created` + `audit.finding.promoted` in one transaction, owner notified); decide whether accepting a draft needs a second person; decide syncing finding status when the issue closes, and how a finding is closed.
10. Report export: decide the role (today anyone with the module, auditor included), write the entry to the company log only (not the platform log), mark it draft.
11. Company audit log: admin-only read with paging and category filters (add Audit, Approval, Evidence, Issue, Incident, Security to the tabs), tenant-scoped verify, server-built JSON/CSV export audited and rate limited (AppSec spec: exports 10 per hour, `appsecSpec.json:162`), "Export selected" either removed or audited, evidence package built and signed server-side containing the entries, RoPA export written to the company log (and decide whether a company has its own RoPA). Retention purge stays a separate reviewed job (`0001:34` comment; `docs/security/SOD_MATRIX.md:179`).
12. Risk snapshot `shared`: decide the rule (audit window by dates, not "any Planned or Fieldwork audit") and how the auditor reads a shared snapshot.
13. Overview: return audit figures (count not Complete, names only for roles that may open Audits) so the KPI and "Audits in motion" work in production; stop showing internal engagement names to employee/analyst/auditor if that is the decision.
14. Notifications (none today): IR raised -> management; IR answered -> auditor; draft awaiting decision -> management; finding declined -> auditor; PBC assigned/overdue -> owner; access granted/ending -> auditor; chain verification failure -> admins.
15. Audit action strings (complete list for these modules):
    - Audits (cat Audit): audit.created (UI), audit.auditor.access.granted (UI), audit.auditor.access.ended (svc), audit.populations.frozen (UI), audit.stage.advanced (UI), audit.pbc.added (UI), audit.pbc.updated (UI), audit.finding.promoted (svc), audit.finding.rejected (svc), audit.finding.drafted (svc), audit.ir.raised (svc), audit.ir.answered (svc), audit.ir.closed (svc), audit.report.generated (UI, workspace log **and** platform log via adminLog with categories ["Audit"], basis "Legal obligation").
    - Audit logs (cat System): auditlog.exported (svc), auditlog.chain.verified (svc), evidence.package.generated (svc); ropa.exported (svc, platform log via adminLog, categories ["Audit"], basis "Legal obligation").
    - Written by other modules about these records: issue.created is **not** written on promotion in the demo (the server's `createIssueIn` writes it, cat Control); risk.register.snapshot (group 3, cat Risk) carries the "shared" decision.
    - AppSec: none.
    - Approvals engine / approvalKit: none for this group.

---

## 6. SOD_MATRIX rows and where the code differs (`docs/security/SOD_MATRIX.md`)
| Matrix row | Matrix says | Code does | Difference |
|---|---|---|---|
| Audit, `:39` | auditor read-only on organisation records, may raise information requests and draft findings; management (admin/owner) accepts a finding into an issue; auditor cannot advance stage, freeze, end access, create issues, edit PBC status | as stated (`services/audits.ts:41,44-48`; e2e `readonly.spec.ts:29-35`) | auditor scoping is by lead text and shows every external engagement; report export has no role check; management may also close nothing (IR close is auditor-only); accepting a finding, granting/ending access and closing with open items are single-person (matrix silent); no expiry of auditor access (principle 7, `:17`) |
| Principle 8 (`:8`): every decision writes an audit entry | - | yes, but 7 of 14 Audits entries are written by the UI (A1, A2, A4, A5, A6, A7, A11) and `audit.report.generated` also goes to the platform log | a port that moves only the services loses them |
| Admin-log, `:25` | platform log read-only; export audited | workspace module writes `audit.report.generated` and `ropa.exported` into the platform log with the workspace persona as actor | matrix has **no row for the workspace audit log** (who reads, who exports, verify, evidence package) |
| Retention, `:176-179` | audit logs 7 years, minimum 5; shorter is four-eyes; legal hold | as stated in Team (`governance.ts:108-160`); preview counts `WS_AUDIT` | production purge job not built; `audit_log` refuses delete (`0001:35-38`) |
| AppSec permission matrix (`appsecSpec.json:177`) | "View company audit log": company admin Yes, auditor Yes, policy owner No | ROLE_MODS: admin only; auditor and owner no | conflict, `docs/guides/checklist/appsec.md:34` |
| Personas line `:6` | "`admin` (CISO) Casey Morgan is `admin2`", `super` Jordan Avery | admin Jordan Avery, admin2 Casey Morgan, auditor Morgan Blake (`data/roles.json`) | stale persona names (also noted in group 4) |

---

## 7. Gaps and oddities found (decide before porting)
- **AppSec has none of the expected functionality**: no findings, SAST/DAST, scans or exceptions; it is a static spec page. Porting it is trivial; a real AppSec module would be new scope.
- **Auditor scoping is text-based and too wide**: every `/External/` engagement is visible to every auditor (other firms' PBC lists and findings); the Overview and board pack show all audit names to every Overview role.
- **Auditor access is neither time-boxed nor tied to reads**: granted to a firm string, can be granted on a Complete audit with no way to end it, and the auditor's reads of controls, evidence, policies and frameworks are standing.
- **Completion deadlocks and bypasses**: an Answered IR that the auditor never closes blocks completion forever (management cannot close IRs); "Advance stage" to Complete skips the close-reason rule when access was never granted; "Complete & end" does not check access is granted.
- **"Closed and locked" and "Freeze populations" lock nothing**; PBC can be cycled back to Requested after completion; add request and create issue stay available.
- **Finding -> issue**: no `issue.created` entry, static "Due 14d" text that never goes overdue, owner by name (an internal lead may not be a member), link opens the issue list, finding status never follows the issue; no management path to raise or close a finding directly.
- **Report export**: no role check, no not-found guard, logged to the platform log as well, plain text marked draft.
- **Server contract already fixed by group 3**: the issue delete guard reads kind `"audit"` with `findings[].issue`; until group 5 stores audits it never fires in production. The server Overview does **not** read audits (contrary to what the programme brief assumed); the browser reads an empty `DATA.audits`.
- **Audit log**: category tabs miss Audit and Approval (demo) and Evidence, Issue, Incident, Security (server); "Export selected" bypasses the audited export; the evidence package downloads only a manifest; RoPA export and report export write to the platform log; the RoPA shown is the platform's; the 13 seed entries load in production; a failed browser download still toasts success and logs the export; verify appends an entry each time.
- **No company audit-log read route or tenant verify** on the server (3.5), although the chain, trigger and RLS exist.
- Ids: PBC and finding ids repeat across audits; AUD ids jump to AUD-15; `opened` mixes "02 Oct 2026" and ISO; `period` is free text and never editable; T-05 references a non-existent control `APP-1`.
- Checklist drift: `docs/guides/checklist/audits.md` (table) still says the New audit is a modal with lead "J. Avery", manage gate includes analyst, "Information requests" only toasts, and the unknown-id copy is "Page not found"; its hardening section supersedes parts of it. `docs/guides/checklist/auditlog.md:9` still describes category chips with `auditlog.filter` (now DataTable tabs, `dt.audit-log`). `docs/guides/checklist/appsec.md:17` claims super can open AppSec.
- Kit/design: audit record uses `Kpi` tiles and plain `Table`s instead of `KpiStrip`/`DataTable`; AppSec `ResponseCompare` uses raw `chip` spans without icons (`ResponseCompare.tsx:13,17`). No hex literals in these features.

## 8. Existing tests that cover this group
- e2e: `registers.spec.ts:126-140` (audits stage tabs, search, row opens the record), `records.spec.ts:209-228` (New audit page, "Audit name is required.", landing on the record, back link, unknown audit "Audit not found"), `readonly.spec.ts:29-35` (auditor: no enabled management buttons on AUD-01), `routes.spec.ts:5` (`/ws/audits/AUD-01` deep link for admin), `injection.spec.ts:18,31,68` (payloads in the audit id; "New audit" form), `a11y.spec.ts:10-11` (`audits/new`, `audits/AUD-01`), `settings-pages.spec.ts:108-122` (audit log table, category tabs, search, "Chain intact" status), `brand.spec.ts:24-26` (a Team change appears in the audit log), `layout.spec.ts:7-20` (AppSec control-group padding).
- Unit: `rbac.test.ts:20` (audits not server-ready), `governance.test.ts:65,86-87` (audit-log retention floor and preview); many unit tests read `WS_AUDIT` to assert other modules' entries (`session`, `autonomy`, `accountSecurity`, `governance`, `delegation`, `notifPrefs`); server log reads `server.test.ts:605` (support views), `tests/db/isolation.test.ts:391` (platform audit log).
- **No tests** for: any Audits service rule (management/auditor gates, assigned-auditor match, access states, completion blocks and close reason, advance-to-Complete refusal, PBC cycle, promote/decline, IR lifecycle), the report export, the audit-log services (verify, export, RoPA export, package), `linkOk`, `ropaFor`, the server issue delete guard with an `"audit"` record, or AppSec search.
