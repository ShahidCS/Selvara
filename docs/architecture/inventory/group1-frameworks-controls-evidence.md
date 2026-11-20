# Functionality inventory, group 1: Frameworks, Controls, Evidence (demonstration build)

Source tree: `/home/user/Selvara/front-end/src` (paths below are relative to it unless they start with `docs/`, `e2e/` or `tests/`).
Read-only inventory; nothing in the repository was modified. Line numbers are as of this reading.

Conventions used below:
- "REF" = reference/catalogue data (same for every company; PRODUCTION_PROGRAMME says these become shared read-only tables: frameworks and their requirements, the control library, templates; `docs/architecture/PRODUCTION_PROGRAMME.md:12,37`).
- "CO" = per-company record (tenant data).
- "SIM" = simulated / demo-only behaviour.
- Audit = `wsLog(action, target, cat)` (`lib/audit.ts:35-40`): appends `{seq, prev, hash, at: nowStamp(), actor: getMe().name, action, target, cat}` to the hash-chained workspace log (FNV-1a demo chain, `lib/audit.ts:9-13`). Every entry in these three modules uses cat `"Control"` unless noted; the approvals engine writes cat `"Approval"`.
- Roles: base role = role id without trailing `2` (`lib/sod.ts:10-11`). Personas (`data/roles.json`): admin Jordan Avery, admin2 Casey Morgan, owner Owen Hart, owner2 Taylor Reed, analyst Sam Lee, auditor Morgan Blake, employee Priya Nair, vendor Grace Lin, viewer Lee Park, super/super2/support (admin space only).
- Name matching for SoD: `samePerson` (`lib/grcSod.ts:14-26`) = same `personKey` (first initial + surname, `lib/sod.ts:18-25`) OR same first initial and surname where one surname may be an initial. Seed owners are short forms ("O. Hart" matches Owen Hart, "J. Avery" matches Jordan Avery). Production must compare user ids (`PRODUCTION_PROGRAMME.md:39`).
- Error contract: services throw `SodError` (`lib/sod.ts:28`); UI shows `uiMessage(e)` = SodError text, otherwise generic "Something went wrong. Please try again." (`lib/grcSod.ts:6-9`).
- `viaApi(mock, real)` (`services/http.ts:19-21`): every service function below has a mock branch (in-memory) and a "real" branch already naming the intended REST path (listed per action as "API stub").

---

## 0. Cross-cutting: module access, routing, shared state

### 0.1 Who can open each module (`data/roles.json` ROLE_MODS; enforced in shell `components/shell/AppShell.tsx:67,87` via `modAllowed`, `lib/rbac.ts:34-38`)
| Module | admin / admin2 | owner / owner2 | analyst | auditor | employee | vendor | viewer | super/support |
|---|---|---|---|---|---|---|---|---|
| frameworks | yes (`"*"`) | yes | **no** | yes | no | no | no | no (no ws space) |
| controls | yes | yes | yes | yes | no | no | no | no |
| evidence | yes | yes | **no** | yes | no | no | no | no |

- In production (`API_ON`) a module is also hidden until listed in `SERVER_READY.ws` (`lib/rbac.ts:29-31`; currently only `team`). Group 1 must add `frameworks`, `controls`, `evidence` there (pre-approved, `PRODUCTION_PROGRAMME.md:11`).
- Note the analyst mismatch: evidence service `WRITERS = ["admin","owner","analyst"]` (`features/evidence/services/evidence.ts:16`) but analyst cannot open `/ws/evidence` at all. Effective evidence writers today = admin, owner.
- Nav: group "Assurance": Frameworks, "Controls & Tests", Evidence (`data/nav.json:29-45`); page titles/subtitles `data/nav.json:221-231` ("Readiness across every framework in scope", "Control status, owners and evidence", "Collected evidence and provenance").
- Nav count badge for controls = number of controls with status Fail or Needs evidence (`lib/counts.ts:8`).

### 0.2 Routing (`lib/route.ts:9-16`, `pages/ws/[[...slug]].tsx:5-8`, `features/registry.ts:16-18`)
`/ws/<mod>/<param>/<sub>`; `param`/`sub` URI-decoded (malformed escapes used as written). Breadcrumb sub-labels: `edit` -> "Edit", `exception` -> "Request exception", `new` -> "New"; `/ws/controls/test/...` shows "Tests" crumb (`components/shell/Topbar.tsx:17,90`).
Record pages show presence ("Also here") on any page with a back link (`components/ui/Blocks.tsx:61`, `components/ui/Presence.tsx:16`; BroadcastChannel demo).
Form pages use an unsaved-changes guard (`hooks/useUnsavedGuard`, "Discard unsaved changes?" dialog, `e2e/policies.spec.ts:60-75`).

### 0.3 Shared list kit (`components/ui/DataTable.tsx`)
All three registers use `DataTable`: search box ("Search <label>"), optional status tabs (with an "All" tab and counts), popover filters with "Clear filters", sortable columns (`value`/`sortBy`), page sizes 10/25/50 (`DataTable.tsx:83`), row click/Enter opens the record, row selection + "Export selected" CSV (`DataTable.tsx:120-125`; file `<exportName>.csv`, cells through `csvCell` formula guard `lib/format.ts:14-18`, `lib/dataTable.ts:91`). **"Export selected" writes no audit entry.** Table state persists per session under mod-state key `dt.<id>` (`DataTable.tsx:62,84`).

### 0.4 In-memory state model (what the server must replace)
- `DATA` = deep clone of `data/seed.json`, mutated in place, re-render via `bumpData()` (`lib/data.ts:15`, `lib/store.ts:69-74`).
- `FRAMEWORK_REQS` = clone of `data/frameworkReqs.json` (mutable: custom frameworks register into it) (`lib/data.ts:17`).
- `fwEdits` store (frameworks scope, snooze, N/A decisions, mapping edits, requirement-to-control map) (`lib/frameworks.ts:17-24`). Session-only, not per company.
- `approvals` store: four-eyes engine records (`lib/approvals.ts:19`).
- `EVIDENCE_TOMBSTONES` array (`features/evidence/services/evidence.ts:23`).
- Per-session UI state via `useModState` (`lib/store.ts:86-94`), e.g. `fw.reqf`, `fw.rq`, `fw.grp`, `fw.limit`, `fw.open`, `fw.pick`, `fw.nat`, `fw.err`, `fw.add`, `controls.view`.

### 0.5 Four-eyes engine used by Controls and Evidence (`lib/approvals.ts`, `lib/rules.ts`)
- Record: `{id "AP-<n>" (n from 101), kind, title, subject, requestedBy (name), requestedByRole, payload, needs, approverRoles[], forbid[], approvals[{by,at ISO,reason}], status Pending|Approved|Rejected|Withdrawn|Expired, createdAt, expiresAt, decidedReason?, ticket?, domain "ws"|"admin"}` (`lib/approvals.ts:10-20`).
- `requestApproval` (`:23-32`) audits `approval.<kind>.requested` target `"<title> (<id>)"`, cat "Approval" (`:33-34`).
- `approvalBlock` (`lib/rules.ts:29-37`): refuse if status not Pending ("Request is <status>."), expired, actor base role not in approverRoles ("Only <roles> can approve."), actor = requester, actor in forbid, actor already voted.
- `approve` (`lib/approvals.ts:46-54`): reason >= 10 chars (`REASON_MIN`, `lib/rules.ts:7,44`), stored max 300 chars; status Approved when votes >= needs; audits `approval.<kind>.approved` (or `.approval.recorded` if more votes needed).
- `reject` (`:55-60`): same block; reason stored max 300, **engine does not enforce reason length on reject** (modules do it themselves, see below); audits `approval.<kind>.rejected`.
- `withdraw` (`:62-67`, `lib/rules.ts:39-43`): only requester, only while Pending; audits `approval.<kind>.withdrawn`.
- `sweepExpired` (`:36-40`): Pending past `expiresAt` -> Expired, audits `approval.<kind>.expired`.
- These kinds (`control.exception`, `evidence.delete`) are NOT decidable from the notifications bell; they are decided on their record pages (`lib/inboxApprovals.ts:1-13`; asserted in `e2e/inbox-approvals.spec.ts:75`).

---

## 1. FRAMEWORKS

### 1.1 Data model

**A. Framework library entry** (`DATA.frameworks`, seed `data/seed.json` `frameworks`, 25 entries)
| Field | Type | Notes | REF/CO |
|---|---|---|---|
| `id` | string slug | e.g. `iso27001`, `soc2`, `dora`; custom adds `custom-<slug>` or template id (`features/frameworks/FwAdd.tsx:31`) | REF (catalogue key) |
| `name` | string | display name, max 120 on add (`FwAdd.tsx:29`) | REF |
| `kind` | enum `Standard` \| `Framework` \| `Regulation` | seed: 8/8/9 (`FrameworksModule.tsx:13`) | REF |
| `region` | string | seed values Global, US, EU, UAE, KSA, Pakistan; free text on add (default "Global") | REF |
| `pct` | number 0-100 | fallback readiness when no catalogue (`lib/frameworks.ts:75-77`); also the threshold used to seed synthetic mappings (`:34`) | demo value (CO) |
| `controls` | number | **display number only**, not the requirement count (`docs/architecture/FRAMEWORKS.md:24`); used as weight in overall compliance (`lib/metrics.ts:14`); 0 for 5 seed entries and for added frameworks | demo value |
| `gaps` | number | fallback gap count when no catalogue (`FrameworksModule.tsx:53`, `FwDetail.tsx:56`) | demo value |
| `audit` | string | free text "next audit" note e.g. "Surveillance, 12 Mar 2027"; shown in list and as KPI "Next audit" (`FwDetail.tsx:57`); added frameworks get "New, mapping draft" (`FwAdd.tsx:36`) | CO |
| `mapped` | number | **derived**: count of controls with `map[id]` (iso27002 uses iso27001) recomputed by `refreshFrameworkCounts` (`lib/data.ts:23-30`) | derived |
Not stored: `version` is collected in the add form (`FwAdd.tsx:10,62`) but **never saved** (`FwAdd.tsx:36`).

**B. Requirement catalogue** (`FRAMEWORK_REQS`, `data/frameworkReqs.json`) - REF
`{ [fwId]: { g: [groupId, groupTitle][], r: [reqId, title, groupId, guidance][] } }` (`lib/data.ts:16-17`). All 25 seed frameworks have a catalogue; sizes from 6 (iso22301) to 289 (dora) requirements (iso27001 123/11 groups, iso27002 93/4, uaeia 188/66, nistcsf 106/22...). Titles are paraphrased (banner `FrameworksModule.tsx:89`). Custom frameworks register `{ g: [["","General"]], r }` with ids `R1..Rn` (`lib/frameworks.ts:104`, `FwAdd.tsx:33-34`).

**C. Annex A catalogue** (`ANNEXA`, `data/annexA.json`) - REF: 93 rows `{id "A.5.1", title, theme Organizational|People|Physical|Technological}` (`lib/data.ts:18`).

**D. Short names** (`FW_SHORT`, `data/fwShort.json`) - REF: id -> short label (e.g. `pci` -> "PCI DSS"); `FW_ID` id -> full name built from DATA.frameworks (`lib/data.ts:19-20`).

**E. Add-framework templates and keyword matcher** - REF (`features/frameworks/lib/fwTemplates.ts`)
- `FW_TPL` (`:3-8`): 4 templates `{id, short, name, kind, region, version, text}`: `nis2` (already in seed, so disabled), `cisv8`, `hipaa`, `samacsf`. `text` = requirement lines.
- `FW_DOM` (`:9-26`): 16 `[domainName, regex]` keyword rules (Governance and policy, Risk management, Asset management, Identity and access, Cryptography, Secure configuration and development, Vulnerability management, Logging and monitoring, Incident response, Business continuity, Third-party risk, Awareness and training, Data protection and privacy, Threat intelligence, Physical security, Assurance and audit). First match wins.

**F. Per-company framework edits** (`fwEdits`, `lib/frameworks.ts:17-24`) - CO
| Key | Shape | Meaning |
|---|---|---|
| `SCOPE[fwId]` | boolean | `false` = out of scope; missing = in scope (`:87`) |
| `SNOOZE[fwId]` | boolean | true = snoozed (`:88`) |
| `NA[fwId][reqId]` | `{reason, by (name), date YYYY-MM-DD}` | requirement marked not applicable (`:124-126`) |
| `MOD[fwId][reqId]` | `{by, date}` | last mapping edit on that requirement (`:112`) |
| `REQ_CTRL[fwId][reqId]` | string[] control ids | requirement-to-control mapping used for scoring; lazily seeded (`:30-54`) |

**Important: two separate mapping stores.** (1) Control-side `control.map[fwId] = [requirement codes]` (seed + "Add mapping" on a control) drives `mapped` counts, `controlsForFw`, the Controls framework filter, the matrix, SoA, Annex A coverage and the board-pack coverage. (2) Requirement-side `fwEdits.REQ_CTRL` drives requirement status and readiness. REQ_CTRL is seeded once from (1) plus synthetic hashing; afterwards neither store updates the other (`toggleReqControl` `lib/frameworks.ts:107-114` does not touch `control.map`; `addMapping` `features/controls/services/controls.ts:117-124` does not touch REQ_CTRL, and does not call `refreshFrameworkCounts`, so `f.mapped` goes stale until another add).

### 1.2 Screens and routes
`FrameworksModule` (`features/frameworks/FrameworksModule.tsx:19-24`): `/ws/frameworks` list, `/ws/frameworks/new` add page, `/ws/frameworks/:id` detail page.

**Library list `/ws/frameworks`** (`FrameworksModule.tsx:41-100`)
- Page action: "Add framework" (shown to every role that can open the module; non-admins can only preview, see 1.3).
- KPI strip "Library summary" (`:83-88`): In the library (count, caption "<n> in scope"); Average readiness (in-scope); Open gaps ("Not met or not assessed", delta "To close"/"None"); Snoozed ("Paused, not scored as due").
- Draft banner: "Requirement titles are paraphrased; licensed standard text is not reproduced. All requirement-to-control mappings and applicability decisions are draft content requiring review by qualified compliance staff before reliance." (`:89`).
- Table "Frameworks" (`:56-79, 92-95`): columns Name (name + kind chip + "<n> requirements, <m> mapped controls, <audit>"), Region, Readiness (segmented bar + % in band colour + legend), Status (Active/Snoozed: toggle button for admins, chip otherwise), Scope (In scope/Out of scope: toggle for admins, text otherwise), Details button.
- Tabs by kind: Standards, Frameworks, Regulations (+All) (`:93`). Filter: Region (`:94`). Search over `name id region` (`:92`). Export selected `frameworks.csv`.
- Default row order: kind order via `KORD[kind] || 3` (Standard=0 is falsy so Standards sort last: Frameworks, Regulations, Standards), then name (`:15,49`; open question in `docs/guides/checklist/frameworks.md:23`).
- Opening a framework resets the requirement view state (`resetReqView`, `:27-29`).

**Add page `/ws/frameworks/new`** (`FrameworksModule.tsx:31-39`, `FwAdd.tsx`)
- Template buttons (disabled with "Already in the library" when id exists; "Selected"/"Load requirements").
- Fields: Short name, Full name, Version (placeholder 2024), Kind select (Standard/Framework/Regulation), Region (placeholder Global), "Requirements, one per line" textarea (`FwAdd.tsx:59-66`).
- Live preview once there is at least one line: "<n> of <m> requirements map to existing control domains", coverage chip (>=80 ok, >=50 warn, else bad), table Requirement / Mapped control domain ("No match — new control needed") (`:67-77`).
- Admin: "Add to library" button; non-admin: help text "You can preview a mapping. Only a company admin can add it to the library." (`:79-81`) (note: owner can also add, the copy says admin).

**Detail page `/ws/frameworks/:id`** (`FwDetail.tsx`)
- Unknown id: "Framework not found" / "No such framework" (`:27`; e2e `dashboards.spec.ts:79-80`).
- Header: title name, subtitle "<kind> · <region> · <audit>", Active/Snoozed chip, "Export gap assessment" (only if catalogue), "View in controls" (`:47-51`).
- KPI strip "Framework summary" (`:53-58`): Readiness (% + "<impl> of <total> applicable requirements met"), Mapped controls (count + "<passing> passing, <needs> need evidence"), Open gaps (Not met + Not assessed, caption split), Next audit (`f.audit`).
- Requirement status card: segmented bar + donut "Requirements by status" with centre "<p>% ready" (`:59-68`).
- Groups panel: "All groups (<n>)" + one button per group with "met/tot" (or "n/a") and a band-coloured bar (`:72-87`).
- Requirements pane (`ReqPane`, `:115-153`): status chips All / Met / Partially met / Not met / Not assessed / Not applicable with counts (within selected group); search over id, title, guidance; group chip with Clear; paging 50 at a time ("Show 50 more (<k> remaining)" / "Show less") (`REQ_PAGE=50`, `lib/frameworks.ts:14`); empty state "No requirements match"; non-admin note "Only a company admin or control owner can change requirement mappings or applicability."
- Requirement row (`ReqRow`, `:155-234`): collapsible; header id, title, meta "<group> · <n> controls · mapping edited", status pill (icon + label, `REQ_ST_PILL` `lib/frameworks.ts:11-13`). Body: guidance (or "No guidance recorded."), mapped control chips "<id> · <status>" opening the control page, Remove button per chip (admin), "None — this requirement is not assessed until a control is mapped.", "Mapping edited by <by> on <date>; draft until compliance review.", "Not applicable: <reason> (<by>, <date>)". Admin editor: control select (all controls "<id> — <title>") + "Map control"/"Unmap <id>" button; N/A justification input + "Mark not applicable", or "Make applicable again".
- Annex A card, only for `iso27001` and `iso27002` (`:92, 98-112`): theme counts, table Ref / Control / Coverage ("Applied" if any control's `map.iso27001` contains the ref, else "Not mapped").

### 1.3 User actions
Admin check for every framework mutation: `fwCanAdmin()` = base role in `super`, `admin`, `owner` (`lib/rbac.ts:55`, `lib/frameworks.ts:26`) (super has no ws space, so effectively admin/admin2/owner/owner2). Auditor: read only. Checks are in the UI handlers (they `return` silently); there is **no service layer, no SodError, no four-eyes** for framework actions.

| # | Action | Where | Who | Validation | SoD | Audit action / target |
|---|---|---|---|---|---|---|
| F1 | Toggle snooze (Active <-> Snoozed) | list Status column, `FrameworksModule.tsx:46` | fwCanAdmin | none | none, no reason | `framework.snoozed` / `framework.resumed`, target fwId |
| F2 | Toggle scope (In <-> Out) | list Scope column, `:47` | fwCanAdmin | none | none, no reason | `framework.scope.out` / `framework.scope.in`, target fwId |
| F3 | Load template | add page, `FwAdd.tsx:23-26` | anyone with module | template must not already exist | - | none |
| F4 | Add framework to library | `FwAdd.tsx:27-41` | fwCanAdmin | short name required ("Give the framework a short name."), trimmed max 40; full name defaults to short, max 120; id = template id or `custom-` + lower-case slug of short (`[^a-z0-9]+` -> `-`); duplicate id refused ("That framework is already in the library."); requirement lines trimmed, blanks dropped, max 300 lines, each max 200 chars (`:19,33`); region default "Global"; kind from select (not re-validated) | none | `framework.added`, target full name; toast "“<short>” added to the library"; navigates to the new framework page |
| F5 | Export gap assessment CSV | detail, `FwDetail.tsx:33-43` | anyone with module (auditor too) | only when catalogue exists | - | `framework.gap.exported`, target "<name>, <n> gaps"; file `gap-assessment-<id>.csv`, columns Framework, Requirement ID, Requirement title, Group, Status, Mapped controls ("<id> (<status>)" joined "; "), Not applicable reason; rows = every requirement whose status is not Met; CRLF; formula guard (e2e `injection.spec.ts:119-133`). If download blocked: toast "Download not available in this view", no audit |
| F6 | View in controls | detail, `FwDetail.tsx:44` | anyone | - | - | none. Sets mod-state `controls.fw/status/q/page` then goes to `/ws/controls`, **but the Controls DataTable does not read those keys** (it uses `dt.controls`), so no filter is applied (bug to decide) |
| F7 | Map control to requirement | `ReqRow.mapCtrl/doMap`, `FwDetail.tsx:170-178` | fwCanAdmin | a control must be chosen ("Choose a control first."); control id must exist | none | `framework.req.map`, target "<fwId> <reqId> ← <ctrlId>"; records `MOD[fw][req]={by: getMe().name, date: YYYY-MM-DD}` |
| F8 | Unmap control (same toggle, or Remove chip) | same | fwCanAdmin | - | none | `framework.req.unmap`, target "<fwId> <reqId> ✕ <ctrlId>"; also updates MOD |
| F9 | Mark requirement not applicable | `ReqRow.toggleNA`, `FwDetail.tsx:179-187` | fwCanAdmin | justification trimmed >= 15 chars ("Justify why it does not apply (at least 15 characters); auditors review this."); no max length in code (input has none) | none (no second person) | `framework.req.na`, target "<fwId> <reqId>"; stores `{reason, by, date}` |
| F10 | Make applicable again | same, `:181` | fwCanAdmin | - | none | `framework.req.applicable`, target "<fwId> <reqId>"; deletes the NA record |
| F11 | Open a mapped control | chip, `FwDetail.tsx:203` | anyone | - | - | none; goes to `/ws/controls/:id` |
| F12 | Filter/search/group/page requirements | `ReqPane` | anyone | - | - | none (session UI state) |

### 1.4 Computed values (exact formulas)
- Requirement status `reqStatus(fw, req)` (`lib/frameworks.ts:59-67`): if `NA[fw][req]` -> "Not applicable"; mapped controls = `REQ_CTRL[fw][req]` resolved against `DATA.controls` (unknown ids dropped, `:55-58`); none -> "Not assessed"; all status "Pass" -> "Met"; some Pass -> "Partially met"; else "Not met". Statuses enum `REQ_ST` (`:6`).
- Score `fwScore(fw)` (`:68-74`): counts per status over all catalogue requirements; `total = count - NotApplicable`; `impl = Met`; `pct = total ? round(Met/total*100) : 0`. Null if no catalogue.
- Readiness `fwReadiness(fw)` (`:75-77`) = `fwScore.pct`, else `DATA.frameworks[].pct`, else 0.
- Band colour `fwBand(p)` (`:78`): >=80 ok, >=65 warn, >=50 orange (`#D2690A`, a hex literal), else bad.
- Group stat `fwGroupStat` (`:82-86`): over requirements in the group excluding N/A: `tot`, `met`; bar % = `round(met/tot*100)` (`FwDetail.tsx:78`).
- Legend `fwLegend` (`:89-94`): "Met n · partly n · not met n · not assessed n · n/a n" (zero parts omitted) or "No requirements scored".
- Segmented bar widths (`FwSegsBar.tsx:5-11`): `cnt[status]/allRequirements*100` (includes N/A in the denominator, unlike pct); falls back to a single bar of `fwReadiness`.
- Library KPIs (`FrameworksModule.tsx:51-54`): inScope = frameworks with `SCOPE !== false`; average = `round(mean(fwReadiness))` over in-scope; open gaps = sum over in-scope of `NotMet + NotAssessed` (fallback `f.gaps`); snoozed = count with SNOOZE true. **Snooze affects nothing else** (no scoring, metrics or due logic reads it), despite the caption.
- Detail KPIs (`FwDetail.tsx:28-30,54-57`): `ctrls = controlsForFw(f.id)` (controls with `map[id]`; iso27002 -> iso27001, `lib/data.ts:23-26`); passing = status Pass; "need evidence" = status != Pass (includes Fail).
- Annex A coverage `annexCovered()` (`lib/data.ts:31-35`): set of all refs in any control's `map.iso27001`.
- Add preview coverage (`FwAdd.tsx:20-21`): `round(matchedLines/lines*100)`; stored `pct` for the new framework uses the same (`:35`), `gaps = lines - matched` (`:36`). Because the framework has a catalogue, displayed readiness is `fwScore`, which is 0 until controls are mapped (stored pct is ignored).
- Synthetic seeding of REQ_CTRL `seedReqCtrlFw` (`lib/frameworks.ts:27-49`) SIM: pool = controls with `map[base]` (iso27002 -> iso27001); for each requirement: if any pool control's `map[base]` lists the requirement id -> those controls (explicit); else `h = djb2(fwId+"::"+reqId) % 100`, `t = f.pct`: `h < t-14` -> up to two passing controls; `h < t` -> one passing + one non-passing; `h < min(100,t+16)` -> one non-passing; else unmapped. Deterministic (unit test `tests/unit/frameworks.test.ts:68-70`). Only 92 of 170 seed `map` refs match a catalogue requirement id; the rest are hash-mapped.
- Cross-module consumers: overall compliance `metrics().compliance = round(Σ fwReadiness(f)*f.controls / Σ f.controls)` over ALL frameworks, ignoring scope (`lib/metrics.ts:14`); Reports shows it as "Weighted compliance ... Across frameworks in scope" (`features/reports/ReportsModule.tsx:45`). Overview "Framework Readiness" = 6 lowest `fwReadiness`, tone >=80 ok, >=50 warn, else bad (`features/overview/OverviewModule.tsx:45,93-96`). Board pack: framework bars sorted by readiness, coverage heat map `covCell(fw, domains) = round(pass/inCat*100)` over controls in domain categories with `map[fw]` non-empty (`features/overview/lib/boardPack.ts:13-18,25`). AI module shows `fwReadiness("iso42001")` (`features/ai/AiModule.tsx:37`).

### 1.5 Cross-module links
- OUT: requirement -> controls (REQ_CTRL); requirement chips open control pages (`FwDetail.tsx:203`); "View in controls" (`:44`).
- IN: Controls page "Frameworks" button (`features/controls/ControlsModule.tsx:78`); control `map` keys are framework ids (Controls detail shows `FW_ID[k]`, `ControlDetail.tsx:95`); Overview "View all" (`OverviewModule.tsx:93`); AI "Open framework" buttons (`features/ai/AiModule.tsx:102`, `AiDetail.tsx:62`); metrics/Reports/board pack readiness (above). Audits store framework as a display string (`audits[].fw` e.g. "ISO 27001"), not an id: no hard link.
- The global "scope" selector in app state (`lib/store.ts:26,39`, values from `roles.json` SCOPES) is independent of framework SCOPE edits.

### 1.6 Simulated
- Requirement-to-control mappings are seeded by hash (above), not by real analysis.
- Keyword "mapping" of pasted requirements to control domains is regex only (`fwTemplates.ts:9-26`); it does not create REQ_CTRL mappings (new frameworks start with none unless a control has `map[newId]`).
- `pct`, `controls`, `gaps`, `audit` on seed frameworks are display numbers.
- All framework edits are session memory; reload loses them; not per company; no server API stubs exist for frameworks (no `viaApi`).

---

## 2. CONTROLS (and automated TESTS)

### 2.1 Data model
**A. Control** (`DATA.controls`, seed 30)
| Field | Type | Notes | REF/CO |
|---|---|---|---|
| `id` | string | seed `GOV-1`..`PECA-1`; custom: prefix = up to 3 capitals of the domain (`"C"` if none) + "-" + (count of ids starting with prefix + 1) (`features/controls/services/controls.ts:67-68`). Not guaranteed unique (prefix "G" counts GOV-*), id is never re-checked | REF (library) / CO for custom |
| `title` | string | max 200 (`ControlForms.tsx:34`) | REF |
| `domain` | string | seed uses 18 values (Governance, Identity and access, Cryptography, Operations, Vulnerability management, Change management, Endpoint, Network, Physical, People, Asset management, Third-party risk, Incident response, Resilience, Privacy, Financial crime, AI governance, Regulatory); create form offers a different 10-value enum `CONTROL_DOMAINS` (Governance, Identity & Access, Operations, Cryptography, Network, Logging, Business Continuity, Third Party, Privacy, AI) (`controls.ts:13`); unknown domain -> first value (`:69`) | REF |
| `owner` | string (name) | seed short names (J. Avery 6, O. Hart 5, N. Kim 8, P. Nair 4, D. Okafor 1, A. Rivera 6); max 80 on create, default signed-in name (`:69`) | CO |
| `status` | enum `Pass` \| `Needs evidence` \| `Fail` (`CONTROL_STATUSES`, `:20`) | seed 20/7/3; new control "Needs evidence" | CO |
| `map` | `{ [fwId]: string[] requirement codes }` | seed covers 25 framework ids; new control `{}` | REF (library mapping) + CO additions |
| `custom` | boolean | true for controls created in the UI; shows "Custom" tag (`ControlDetail.tsx:31`) | CO |
| `attestation` | `{by, at YYYY-MM-DD, note}` | absent in seed (`controls.ts:78`) | CO |
| `exceptions` | `ControlException[]` | `{id (= approval id), requestedBy, at, reason, compensating, expires YYYY-MM-DD, approvalId, expiryLogged?}` (`:21`) | CO |

**B. Test** (`DATA.tests`, seed 6) - CO (connector-derived)
`{id "TST-01".., name, source (Arbor Identity, Scanner, MDM, Manual, Northlight, Quartz; custom default "Custom"), controls: string[] control ids, logic (text), result Pass|Fail|"Needs data", cadence (Nightly, Daily, Quarterly; custom "On demand"), last (free text: "Today 02:10", "06 Oct 2026", "Awaiting feed", "Not yet run", or nowStamp after a run), items: {item, result}[]}` (`controls.ts:133`). Seed test->control links: TST-01 IAM-1, TST-02 CRY-1+NET-1, TST-03 OPS-1, TST-04 BC-1, TST-05 LOG-1+OPS-1, TST-06 VUL-1. `testsForControl(cid)` (`lib/data.ts:22`).
Result chip: Pass, Fail, anything else shown as "Needs evidence" (`controlDialogs.tsx:13`).

**C. Constants**: `MATRIX_FWS = [iso27001, soc2, nistcsf, gdpr, pci]` (`controls.ts:12`); test id counter `TESTSEQ` starts at 6 (`:14`), new tests `TST-07`, `TST-08`... (`:132`).

### 2.2 Screens and routes (`ControlsModule.tsx:34-42`)
`/ws/controls` register (views Controls / Tests / Matrix, persisted as `controls.view`), `/ws/controls/new` add custom control, `/ws/controls/:id` control page, `/ws/controls/:id/exception` request exception, `/ws/controls/test/new` build custom test, `/ws/controls/test/:id` test page.

**Register, Controls view** (`ControlsModule.tsx:152-166`): count tag "<n> controls"; actions "Frameworks", "Export SoA", "Add custom control" (disabled with reason unless admin/owner). Table "Controls": columns Control (id), Title, Domain, Mapped to (framework short-name tags, first 6 + "+n" with tooltip), Owner, Status chip. Tabs Pass / Needs evidence / Fail (+All) ("Controls status" tablist). Filter Framework (options = framework ids, labelled with names; matches `c.map[fw]` truthy, no iso27002 alias). Search `id title owner domain`. Export selected `controls.csv`. (e2e `registers.spec.ts:17-45`.)
**Register, Tests view** (`:108-121`): tag "<n> tests"; actions "Sync all" (needs run permission), "Build custom test" (needs manage). Table "Tests": Test (name + id), Source, Supports (control id tags), Cadence, Last run, Result chip. Filters Source, Result. Search `id name source controls`. Export `tests.csv`.
**Register, Matrix view** (`:123-150`): "Cross-framework matrix" table: Control, Domain, then one column per MATRIX_FWS with requirement code tags or "—". Action "Export matrix (CSV)".

**Control page** (`ControlDetail.tsx`): not found -> "Control not found"/"No such control". Header title, subtitle "<id>, <domain>, owner <owner>", status chip, Custom tag, actions "Create Tasklane ticket", "Export workpaper", "Request evidence".
- Status card: explanation by status (`:40`); if tests linked: "Status follows <n> automated test(s) and cannot be overridden manually..." else "Change status (owner)" button + reason text when disabled.
- Exceptions & waivers card: each exception id, state chip (Active->"Approved", Expired->"Overdue", Pending, Rejected), "until <expires>, requested by <name>", reason, "Compensating control: ...", Approve/Reject buttons when Pending (disabled with reason); "Request exception" button.
- Linked tests card: rows (name, "<id>, <cadence>", result chip) open the test page and set view to tests.
- Side: Details (Domain, Owner, Frameworks mapped count, Tests count); Owner attestation (current attestation "Attested by <by>", "<at>: \"<note>\"" or "No current attestation..."; "Record attestation" button + reason); Framework mappings (per framework full name, requirement code tags; "Add mapping" button).

**Test page** (`TestDetail.tsx`): not found -> "Test not found". Header name, "<id>, <source>", result chip, "Run now", "Deactivate". Cards: Test logic (monospace), Results by item table (Item / Result, or "No results yet. Run the test to collect them."), Details (Cadence, Last run, Source), "Controls this test supports" buttons to control pages.

**Forms** (`ControlForms.tsx`): Add custom control (sections Control: title*, domain; Ownership: owner); Build custom test (Test: name*, condition; Source and control: source, supports control); Request exception (note "The approver must be an admin or owner other than you and the control owner. The exception expires automatically."; Why*: reason; Mitigation and expiry: compensating control*, expires on* date). Role-denied form routes render "You cannot do this" with the reason instead of the form (`:16, 30-31, 72-73, 120-121`).
**Dialogs**: Record attestation, Add mapping (`controlDialogs.tsx`), Change status, Approve/Reject exception (`exceptionModals.tsx`).

### 2.3 User actions
Permission helpers (`features/controls/services/controls.ts`), each returns null (allowed) or the reason shown on the disabled button; services call `guard()` with the same function (deny by default):
- `whyCannotManage` = role admin|owner ("Not permitted: changing controls requires admin or owner.") (`:26`).
- `whyCannotRunTests` = admin|owner|analyst (`:27`).
- `whyCannotAttest(c)` = admin|owner AND `iAm(c.owner)` else "Only the control owner (<owner>) can attest." (`:28-30`).
- `whyCannotSetStatus(c)` = blocked if any linked test ("Status follows <n> automated test(s); it cannot be overridden manually. Request an exception with a compensating control instead."), else admin|owner AND control owner (`:32-36`).
- `whyCannotRequestException` = admin|owner (`:37`).
- `whyCannotDecideException(c,x)` = must be Pending ("This request is no longer pending."), role admin|owner, `selfReason` not requester and not control owner ("Segregation of duties: the requester and the control owner cannot approve the exception."), then engine `whyCannotApprove` (`:46-50`).
- Ticket: `roleReason("creating tickets","admin","owner","analyst")` (`:126`, `ControlDetail.tsx:21`).

| # | Action | Who | Validation | SoD / four-eyes | Audit | API stub |
|---|---|---|---|---|---|---|
| C1 | Create custom control (`ControlForms.tsx:19-58`, `controls.ts:64-72`) | admin, owner | title trimmed max 200, required ("Control title is required."); domain from 10-value enum (else first); owner trimmed max 80, default signed-in person (editable free text) | none | `control.created`, target "<id>, <title>" (written by UI `ControlForms.tsx:39`, not the service) | `POST /controls` |
| C2 | Record attestation (`controlDialogs.tsx:41-54`, `controls.ts:74-82`) | admin/owner who is the named control owner | statement required ("A statement is required."), `reasonText(min 1)` caps 500 | attester = signed-in person, name not typable; overwrites previous attestation (no history) | `control.attested`, target "<id> by <name>" | `POST /controls/:id/attestation {note}` |
| C3 | Manual status change (`exceptionModals.tsx:29-47`, `controls.ts:84-92`) | admin/owner who is control owner; only controls with **no** linked tests | status in Pass/Needs evidence/Fail ("Unknown status."); reason >= 10 chars (UI clamps 500) | none (owner alone) | `control.status.changed`, target "<id>: <from> → <to> by <name>: <reason>" | `POST /controls/:id/status {status, reason}` |
| C4 | Request exception/waiver (`ControlForms.tsx:106-148`, `controls.ts:94-107`) | admin, owner | reason >= 10 (max 500); compensating >= 20 (max 500); expiry `YYYY-MM-DD` valid ("Enter a valid expiry date."), > today ("The expiry must be in the future."), <= now + 366 days ("An exception can last at most 12 months."); form default today + 3 months, date input min today, max +12 months | creates approval `kind "control.exception"`, title "Exception for <id> <title>", subject id, payload `{controlId, expires}`, needs 1, approverRoles [admin, owner], forbid [control owner], **TTL 14 days** (336 h). Requester is blocked by the engine. No check for an existing pending exception (duplicates allowed). No withdraw button in the UI | `control.exception.requested`, target "<id> <AP-id> until <date> by <name>"; plus engine `approval.control.exception.requested` | `POST /controls/:id/exceptions` |
| C5 | Approve exception (`ControlDetail.tsx:56`, `controls.ts:108-116`) | admin/owner, not requester, not control owner, not already voted, request not expired | reason >= 10 (UI `exceptionModals.tsx:15`, engine `reasonBlock`), max 500 in UI, 300 stored | four-eyes as above | `control.exception.approved`, target "<id> <exId> by <name> (requester <name>), expires <date>"; plus `approval.control.exception.approved` | `POST /controls/:id/exceptions/:exId {decision, reason}` |
| C6 | Reject exception | same | reason >= 10 enforced in service (`reasonText`, `:112`) | same | `control.exception.rejected` + `approval.control.exception.rejected` | same |
| C7 | Exception expiry sweep (`controls.ts:52-56`) | automatic, run on control page render (`ControlDetail.tsx:19`) despite the comment "never from render" | when state Expired and approval Approved and not yet logged | - | `control.exception.expired`, target "<id> <exId> expired <date>" (once, `expiryLogged`) | none (needs server job) |
| C8 | Add framework mapping (`controlDialogs.tsx:57-83`, `controls.ts:117-124`) | admin, owner | framework select from DATA.frameworks; requirement code required ("Requirement code is required."), trimmed, **no length cap, no check it exists in the catalogue, no de-duplication** | none | `control.mapping.added`, target "<id> → <short> <ref>" (UI) | `POST /controls/:id/mappings {fw, ref}` |
| C9 | Remove a control-side mapping | not available in the UI (only requirement-side unmap in Frameworks) | | | | |
| C10 | Create Tasklane ticket (`controlDialogs.tsx:15-21`, `controls.ts:125-128`) | admin, owner, analyst | - | - | `control.jira.created`, target "<key> for <id>"; toast "Created Tasklane ticket <key> (demo)" | `POST /controls/:id/ticket` |
| C11 | Export workpaper (`controlDialogs.tsx:22-27`, `controls.ts:166-172`) | anyone with module (auditor too) | - | - | `control.workpaper.exported`, target id; file `<id>-workpaper.txt`: "LOCKED WORKPAPER — id title", Domain, Owner, Status, Mappings, Attestation "by on" or none, Tests "- id name [result]", footer "Draft workpaper for audit support. Requires reviewer sign-off." | `POST /controls/:id/export/workpaper` |
| C12 | Request evidence (`ControlDetail.tsx:34`) | anyone | - | - | **none**; toast "Evidence request sent" only (SIM) | none |
| C13 | Export SoA (`ControlsModule.tsx:58-62`, `controls.ts:156-160`) | anyone with module | - | - | `controls.soa.exported`, target "<n> controls"; file `statement-of-applicability.csv` columns Doc ("SoA"), Control, Title, Domain, Owner, Status, Frameworks (short names joined "|"); header unquoted, LF | `POST /controls/export/soa` |
| C14 | Export matrix (`ControlsModule.tsx:63-67`, `controls.ts:161-165`) | anyone | - | - | `controls.matrix.exported`, target "<n> controls"; file `cross-framework-matrix.csv` columns Control, Domain, one per MATRIX_FWS (codes joined "|") | `POST /controls/export/matrix` |
| C15 | Build custom test (`ControlForms.tsx:61-103`, `controls.ts:129-136`) | admin, owner | name required ("Test name is required."), max 200; logic max 500 (default "Custom condition"); source max 80 (default "Custom"); supports control from the **first 40 controls only** (`ControlForms.tsx:64`), single control | none | `test.created`, target name (UI) | `POST /tests` |
| C16 | Run test now (`TestDetail.tsx:21`, `controls.ts:137-143`) | admin, owner, analyst | - | - | `test.run`, target test name; plus `control.status.followed-tests` per changed control | `POST /tests/:id/run` |
| C17 | Sync all tests (`ControlsModule.tsx:68-74`, `controls.ts:147-153`) | admin, owner, analyst | - | - | `tests.synced`, target "<n> tests"; plus followed-tests entries | `POST /tests/sync` |
| C18 | Deactivate test (`TestDetail.tsx:22`, `controls.ts:144-146`) | admin, owner | none, no reason, no confirmation | none | `test.deactivated`, target id | `POST /tests/:id/deactivate` |
| C19 | Status follows tests `followTests` (`controls.ts:58-62`) | automatic on C16/C17 | any linked test Fail -> Fail; all Pass -> Pass; else Needs evidence | - | `control.status.followed-tests`, target "<id>: <from> → <to> (automated tests)" | server-derived |
SOD_MATRIX row: "Control | Attest / change status / accept exception | control owner | exception approver != requester | | exception has expiry + compensating-control note" (`docs/security/SOD_MATRIX.md:37`). Code is stricter: approver also != control owner, and roles admin/owner only.
Approving an exception does **not** change the control status (`docs/guides/checklist/controls.md:67`).
Deactivating a test hard-deletes it from DATA.tests and does not re-derive linked control statuses.

### 2.4 Computed values
- Exception state `exceptionState(x)` (`controls.ts:38-44`): approval missing / Rejected / Withdrawn -> "Rejected"; approval Pending -> Expired if `expires < today` else Pending; approval Expired -> Expired; approval Approved -> Expired if `expires < today` else Active. `today = isoDay()` local date (`lib/grcSod.ts:63`).
- Control status from tests: `followTests` (above). Seed disagreements that flip on first Run/Sync: CRY-1 Pass->Fail, NET-1 Pass->Fail, OPS-1 Pass->Needs evidence, LOG-1 Pass->Needs evidence, BC-1 Needs evidence->Pass (computed from seed).
- Counts: nav badge Fail+Needs evidence (`lib/counts.ts:8`); `metrics().overdueControls = count Fail`, `needsEvidence = count Needs evidence` (`lib/metrics.ts:17-18`); `controlsForFw`, `refreshFrameworkCounts` (`lib/data.ts:23-30`); detail "Frameworks mapped" = number of `map` keys; "Tests" = `testsForControl` length.
- There is no evidence freshness, attestation expiry, or test schedule/overdue computation anywhere; `cadence` and `last` are display text.

### 2.5 Cross-module links
- OUT: control -> frameworks (`map`); control -> tests (`tests[].controls`); control -> exceptions -> approvals engine. No stored link control -> evidence (evidence records have no control field).
- IN:
  - Frameworks requirement mappings (REQ_CTRL) and chips open controls (`FwDetail.tsx:203`, `useOpenControl` `features/controls/useOpenControl.ts:5-8`).
  - Issues: `issue.linkedControls: string[]` (`features/issues/services/issues.ts:24`); "Link control" dialog lists all control ids (`features/issues/IssueLayers.tsx:42-57`), service `linkIssue` adds without existence check, roles admin/owner/analyst (`issues.ts:31,140-147`); audit `issue.linked` "<issue> → <ctrl>"; chips open `/ws/controls/:id` (`features/issues/IssueDetail.tsx:97-101`). API stub `POST /issues/:id/links {kind:"control", value}`. No unlink. Seed issues have no links.
  - Risks: `risk.linked: string[]` control ids (seed: every risk has 1-3, e.g. RK-01 VUL-1, OPS-2, BC-1); map/unmap with existence and duplicate checks (`features/risk/services/risks.ts:63-81`), audit `risk.control.mapped` / `risk.control.unmapped` cat "Risk" (`features/risk/RiskDetail.tsx:154-155`); risk page warns when mapped controls are not Pass (`RiskDetail.tsx:138,242`), shows "external control" for unknown ids (`:256`); submitting a risk requires >= 1 mapped control (`risks.ts:110`); risk dashboard counts unmapped open risks (`features/risk/RiskDash.tsx:87`). API stubs `POST /risks/:id/controls`, `POST /risks/:id/controls/:cid/delete`.
  - Policies: `policy.mappedControls: string[]` (`features/policies/services/policies.ts:64`), `mapControl` admin/owner, unknown control refused, de-duplicated, audit `policy.control.mapped` "<P> v<ver> → <ctrl>" cat "Policy" (`:297-305`); shown as tags on the policy page (`features/policies/PolicyDetail.tsx:130-132`). API stub `POST /policies/:id/controls`. No unmap.
  - Audits: `audit.tests[]` rows `{id, ctrl (control id string), result Pass|Exception, note}` shown in "Control testing" tab (`features/audits/AuditDetail.tsx:151-158`) and in the draft audit report (`services/audits.ts:180`); not linked/clickable; seed T-05 references `APP-1`, which is not a control.
  - Notifications bell: one alert per Fail control ("<id> is failing", opens the control) and one aggregate "<n> controls need evidence" (opens `/ws/controls`) for roles with the controls module (`lib/notifications.ts:42-47`); categories "controls"/"evidence" switchable in notification settings (`lib/notifPrefs.ts:15-16`; e2e `notif-matrix.spec.ts:5-18`).
  - Team automation rules: triggers `control.failing` (status Fail) and `evidence.needed` (status Needs evidence) (`features/team/services/governance.ts:23-24`); action "create.issue" opens an issue titled after the control (no `linkedControls` set) (`:91-94`).
  - Assistant: counts failing controls in canned answers (`features/assistant/services/assistant.ts:96,106`).
  - Overview/Reports/board pack via metrics and covCell (section 1.4).

### 2.6 Simulated
- Tests never execute: Run now / Sync all only set `last = nowStamp()` and re-derive control status from the stored `result` (`controls.ts:139-140,149-150`); results and items never change; new tests stay "Needs data"/"Not yet run" forever. Toasts say "(demo)".
- Tasklane ticket key is `SEC-` + random 1000-9999 via `Math.random` (`controls.ts:126`); no integration.
- "Request evidence" is a toast only.
- Workpaper "LOCKED" text is not locked/signed.

---

## 3. EVIDENCE

### 3.1 Data model (`DATA.evidence`, seed 5: EV-204..EV-208) - all CO
| Field | Type | Notes |
|---|---|---|
| `id` | string `EV-<n>` | new: n = 209 + count, bumped until unique (`features/evidence/services/evidence.ts:72-74`) |
| `name` | string | max 160 (`EvidenceFormPage.tsx:33`) |
| `type` | enum `Screenshot` \| `PDF` \| `Report` \| `Record` \| `CSV` (`EVIDENCE_TYPES`, `:13`) | invalid -> first (create) / unchanged (edit) |
| `updated` | string date | seed "28 Oct 2026" format; new/versions ISO `YYYY-MM-DD` (mixed formats; list sorts with `Date.parse`, `EvidenceModule.tsx:33`); edit does not change it |
| `by` | string | collector = signed-in person at creation; never editable (`:76`, `EvidenceFormPage.tsx:29`) |
| `note` | string | max 2000 |
| `ver` | number | starts 1 (`evInit` `:27`) |
| `attachments` | `{name, size "<n> KB", by}[]` | seed records get one fabricated attachment on first `evInit`: slug of name + extension by type (Screenshot png, CSV csv, others pdf, `:15`), random size 80-979 KB, by = collector (`:28`); created records start with none |
| `history` | `{ver, at, by, note}[]` | seed: `{1, updated, by, "Initial version collected"}`; create: "Evidence created" (`:29,76`) |
| `review` | `{status: "Pending review" \| "Accepted" \| "Rejected", by?, at?, note?}` | default Pending review (`:30`); `REVIEW_STATES` (`:14`) |
| `deleteRequest` | `{approvalId, by, at, reason}` | set on deletion request (`:107`) |
Tombstone (`EVIDENCE_TOMBSTONES`, `:23`): `{id, name, at, requestedBy, approvedBy, reason}` on approved deletion; **not shown anywhere in the UI**.
Retention policy kind "evidence" (Control evidence, 84 months, floor 60) and legal hold live in Team governance (`features/team/services/governance.ts:109`), not enforced by evidence deletion in the demo.
There is **no link field** from evidence to controls, frameworks, audits or PBC items.

### 3.2 Screens and routes (`EvidenceModule.tsx:12-18`)
`/ws/evidence` register, `/ws/evidence/new` add, `/ws/evidence/:id` record page, `/ws/evidence/:id/edit` edit.
**Register** (`EvidenceModule.tsx:20-55`): `evInit` runs on every record at render. Action "Add evidence" (disabled with reason unless writer). KPI strip "Evidence summary": Evidence items ("On record"), Awaiting review (Pending review count; delta "Needs a reviewer"/"None"), Accepted ("Reviewed by a second person"), Rejected ("Needs fixing"). Table "Evidence": ID, Evidence (name), Type, Version ("v<n>"), Collected by, Updated, Review (chip Accepted->"Approved", Rejected, else "Pending"; plus tag "Deletion requested" when a pending deletion exists). Tabs Pending review / Accepted / Rejected (+All). Filters Type, Collected by. Search `id name type by`. Export selected `evidence.csv`. (e2e `records.spec.ts:230-279`.)
**Record page** (`EvidenceDetail.tsx`): not found -> "Evidence not found"/"No such evidence". Header name, "<id>, <type>, v<ver>", review chip, "Edit", "Request deletion". Pending-deletion banner (role alert): "Deletion requested by <name>", "Reason: <reason>. A second admin must approve; nothing is deleted yet.", buttons Approve deletion (danger), Reject, Withdraw (only shown to the requester). Review card: "<status> by <by> on <at>: <note>. A reviewer who did not collect, version or attach to this evidence accepts or rejects it.", Accept / Reject buttons. Attachments card (count, "Attach file", table File / Size / Remove, empty "No files attached"). Version history (newest first: Version, Date, By, Note; "New version"). Side: Details (Type, Current version, Updated, Collected by, ID), Notes.
**Form page** (`EvidenceFormPage.tsx`): Evidence section (Name*, Type), Collection and notes (Collected by read-only with help "Set automatically. A reviewer other than the collector must accept the evidence.", Notes). Denied roles see "You cannot do this".
**Dialogs** (`EvidenceForms.tsx`): Request deletion, Reason modal (accept/reject review; approve/reject deletion), Attach file, New version.

### 3.3 User actions
Helpers (`features/evidence/services/evidence.ts`):
- `whyCannotWrite` = role admin|owner|analyst ("Not permitted: changing evidence requires admin or owner or analyst.") (`:40`).
- `whyCannotReview(e)` = "Already accepted." if Accepted; else role admin|owner|analyst; else `selfReason` against `contributors(e)` = collector + every history author + every attachment adder ("Segregation of duties: the collector or a contributor cannot accept their own evidence.") (`:38-44`).
- `whyCannotRequestDelete(e)` = role admin; "A deletion request is already pending." (`:51-53`).
- `whyCannotDecideDelete(e)` = needs pending request ("No pending deletion request."); role admin; not the requesting admin ("Segregation of duties: the requesting admin cannot approve the deletion."); engine block (`:54-57`).
- `touch(e, what)` (`:60-65`): any content change on Accepted or Rejected evidence resets review to Pending review.

| # | Action | Who | Validation | SoD / four-eyes | Audit | API stub |
|---|---|---|---|---|---|---|
| E1 | Add evidence (`EvidenceFormPage.tsx:31-41`, `evidence.ts:67-81`) | writers (admin/owner; analyst blocked by module access) | name trimmed max 160, required ("Name is required."); type enum; notes max 2000 | collector forced to signed-in person | `evidence.created`, target "<id> v1 collected by <name>"; toast "Evidence added"; new record unshifted to top | `POST /evidence {name,type,note}` |
| E2 | Edit evidence (`EvidenceFormPage.tsx:38`, `evidence.ts:82-90`) | writers | same as add; collector not editable | resets review if Accepted/Rejected | `evidence.updated` "<id> v<ver>"; plus `evidence.review.reset` "<id> v<ver>: <old> → Pending review after edit" when applicable; toast "Changes saved" | `PATCH /evidence/:id` |
| E3 | Accept evidence (`EvidenceDetail.tsx:33-35`, `evidence.ts:92-100`) | admin/owner/analyst who is not the collector or any contributor; not already Accepted | note optional (min 0), max 500 | reviewer != collector/contributors | `evidence.accepted`, target "<id> v<ver> by <reviewer> (collector <name>)"; review `{Accepted, by, at, note}` | `POST /evidence/:id/review {decision, note}` |
| E4 | Reject evidence | same; UI also disables when already Rejected ("Already rejected.", UI only, `EvidenceDetail.tsx:64`) | note ("What needs fixing") >= 10 chars, max 500 | same | `evidence.rejected`, same target | same |
| E5 | Request deletion (`EvidenceForms.tsx:11-31`, `evidence.ts:102-111`) | admin only; none already pending | reason >= 15 chars (UI and service), max 500 | creates approval `kind "evidence.delete"`, title "Delete evidence <id> <name>", subject id, payload `{evidenceId, reason}`, needs 1, approverRoles [admin], no forbid list, **TTL 72 h** | `evidence.delete.requested`, target "<id> v<ver> (<AP-id>): <reason>"; plus `approval.evidence.delete.requested` | `POST /evidence/:id/delete-requests {reason}` |
| E6 | Approve deletion (`EvidenceDetail.tsx:30-32`, `evidence.ts:113-124`) | a different admin (not requester), before expiry | reason >= 10 (UI min 10, engine `reasonBlock`) | four-eyes | `evidence.deleted`, target "<id> v<ver>; requested by <name>, approved by <name> (<AP-id>)"; plus `approval.evidence.delete.approved`; record removed from DATA, tombstone kept; navigates to register; toast "Evidence deleted (second admin approved)" | `POST /evidence/:id/delete-requests/decision {decision, reason}` |
| E7 | Reject deletion | same | UI min 10; **service does not check length** (engine reject does not either) | same | `evidence.delete.rejected`, target "<id> (<AP-id>) by <name>"; plus `approval.evidence.delete.rejected` | same |
| E8 | Withdraw deletion request (`EvidenceDetail.tsx:52`, `evidence.ts:125-130`) | requester only (engine `withdrawBlock`); button shown only to requester; no role guard in the service | - | - | `evidence.delete.withdrawn`, target "<id> (<AP-id>)"; plus `approval.evidence.delete.withdrawn` | `DELETE /evidence/:id/delete-requests` |
| E9 | Attach file (`EvidenceForms.tsx:55-82`, `evidence.ts:131-139`) | writers | file name required ("File name is required."), input max 120, `safeFileName` (strips path separators, control chars, `<>:"|?*`, leading dots; max 120, `lib/security.ts:15-18`); if it contains a dot, extension must be in pdf, png, jpg, jpeg, txt, csv, docx, xlsx, json, md (`validateUpload` with size 1, `lib/security.ts:21-33`); names without extension accepted; size limit 10 MB defined but not exercised | adder becomes a contributor (cannot then accept); resets review | `evidence.attachment.added`, target "<id> v<ver>: <name>" | `POST /evidence/:id/attachments {name}` |
| E10 | Remove attachment (`EvidenceDetail.tsx:27-29`, `evidence.ts:140-149`) | writers | by array index | resets review; no reason, no four-eyes | `evidence.attachment.removed`, target "<id> v<ver>: <name>" | `DELETE /evidence/:id/attachments/:index` |
| E11 | New version (`EvidenceForms.tsx:85-107`, `evidence.ts:150-159`) | writers | "What changed" required ("A note is required."), max 300 | version author becomes contributor; resets review | `evidence.version.created`, target "<id> v<ver> by <name>"; ver+1, updated = today, history entry | `POST /evidence/:id/versions {note}` |
SOD_MATRIX row: "Evidence | Mark collected evidence as accepted | owner/analyst | reviewer != collector | | delete needs admin + reason + second admin approval" (`docs/security/SOD_MATRIX.md:36`). Code also lets admin review and widens the exclusion to all contributors.
Open question in checklist: should Accepted evidence be locked from deletion without an audit-freeze reference (not enforced) (`docs/guides/checklist/evidence.md`, last line).

### 3.4 Computed values
- KPI counts by `review.status` (`EvidenceModule.tsx:36-43`), status default "Pending review" (`:25`).
- `pendingDelete(e)` (`evidence.ts:46-50`): runs `sweepExpired()` then returns the approval if Pending (expired requests silently stop showing; `approval.evidence.delete.expired` is audited by the engine).
- `contributors(e)` (`:38-39`).
- No freshness/staleness, expiry, or overdue computation for evidence exists (the "need evidence" signals elsewhere come from control status, not from evidence records).

### 3.5 Cross-module links
- OUT: none stored. Deletion request -> approvals engine.
- IN (by navigation or wording only, no data relation): notifications "controls need evidence" points to `/ws/controls` (`lib/notifications.ts:46-47`); sidebar link (e2e `policies.spec.ts:72-75`); Audits PBC items are "evidence requests" by text (`services/audits.ts:111-116`, `features/audits/AuditDetail.tsx:109-123`) with statuses Requested -> Outstanding -> Received cycling (`services/audits.ts:12,103-109`) but no evidence id; "Freeze populations" (`services/audits.ts:84-85`) sets a flag that does not lock evidence. AI systems have their own `evidence` string field (`features/ai/services/*.ts:106-111`), unrelated to DATA.evidence. Audit-log "Evidence export package" (`features/auditlog/services/auditlog.ts:65-68`, action `evidence.package.generated` cat System) is about the audit log, not this module. Assistant agent "Evidence chaser" (trigger "Evidence overdue") is seed text only (`features/assistant/data/assistantSeed.json:5-6`).

### 3.6 Simulated
- No file is uploaded or read: Attach file records a typed name and a random size (`evidence.ts:134`); copy says "Synthetic attachment for the prototype. No file is uploaded." (`EvidenceForms.tsx:76`). Production target: Supabase Storage private bucket, per-company paths, type/size limits, malware-safe handling, short-lived signed links (`PRODUCTION_PROGRAMME.md:13`).
- Seed attachments are fabricated by `evInit` with `Math.random` sizes, regenerated per session.
- Versions do not hold content; a "version" is only a counter + note.
- Tombstones are kept in memory only.

---

## 4. Server checklist distilled (rules a server must reproduce)
1. Module visibility per ROLE_MODS (0.1) and SERVER_READY.
2. Framework admin = admin/owner (+super): scope, snooze, add framework, map/unmap requirement, N/A (>=15 char reason), make applicable; all audited with the action strings in 1.3; no four-eyes.
3. Control manage = admin/owner (create control, add mapping, create test, deactivate test); run/sync tests and tickets = admin/owner/analyst; attest and manual status = admin/owner AND named control owner (by user id); manual status only when no linked tests, reason >= 10; status otherwise derived from tests.
4. Control exception: admin/owner request; reason >= 10, compensating >= 20, expiry future and <= 12 months (366 days); approval kind `control.exception`, approver admin/owner, not requester, not control owner, reason >= 10, TTL 14 days; expiry job writes `control.exception.expired`.
5. Evidence write = admin/owner/analyst (analyst currently cannot reach the module); collector from session; review by admin/owner/analyst not in contributors, reject note >= 10; any content change resets review (`evidence.review.reset`); delete = admin request (reason >= 15, one pending at a time, TTL 72 h) + different admin approves (reason >= 10), tombstone; requester may withdraw.
6. Exports audited: SoA, matrix, workpaper, gap assessment (DataTable "Export selected" is not audited today).
7. Two mapping stores (control.map vs requirement REQ_CTRL) must be reconciled or kept deliberately separate; the demo never syncs them.
8. Audit action strings (complete list for these modules): framework.snoozed, framework.resumed, framework.scope.in, framework.scope.out, framework.added, framework.gap.exported, framework.req.map, framework.req.unmap, framework.req.na, framework.req.applicable; control.created, control.attested, control.status.changed, control.status.followed-tests, control.exception.requested, control.exception.approved, control.exception.rejected, control.exception.expired, control.mapping.added, control.jira.created, control.workpaper.exported, controls.soa.exported, controls.matrix.exported, test.created, test.run, tests.synced, test.deactivated; evidence.created, evidence.updated, evidence.accepted, evidence.rejected, evidence.review.reset, evidence.delete.requested, evidence.delete.rejected, evidence.delete.withdrawn, evidence.deleted, evidence.attachment.added, evidence.attachment.removed, evidence.version.created; engine: approval.control.exception.{requested,approved,rejected,withdrawn,expired}, approval.evidence.delete.{requested,approved,rejected,withdrawn,expired} (cat "Approval"). Linked modules: issue.linked, risk.control.mapped, risk.control.unmapped, policy.control.mapped.

## 5. Gaps and oddities found (decide before porting)
- `version` collected on Add framework but not stored (`FwAdd.tsx:36`).
- "View in controls" pre-filter does nothing (`FwDetail.tsx:44` vs `DataTable.tsx:84`).
- Snooze has no effect beyond the KPI; scope is ignored by `metrics().compliance` though Reports says "in scope".
- New frameworks show 0% readiness (no REQ_CTRL mappings) although a keyword coverage % is stored in `pct`.
- Custom control domain enum differs from seed domains; custom control ids can collide by prefix.
- `addMapping` has no length cap, catalogue check or de-dup and does not refresh `mapped` counts or REQ_CTRL.
- Custom test can only target the first 40 controls; deactivate is a hard delete with no reason.
- Exceptions: no duplicate-pending check, no withdraw UI; sweep runs during render.
- Evidence: analyst is a writer in code but has no module access; reject-deletion reason not enforced in the service; Rejected->Rejected only blocked in UI; edit does not bump `updated`; mixed date formats; tombstones invisible.
- Audits test row T-05 points at a non-existent control `APP-1`; audits reference frameworks by display string.
- Band colour `#D2690A` is a hex literal (design-token rule).
- e2e coverage: `e2e/dashboards.spec.ts:47-84` (frameworks), `e2e/records.spec.ts:73-136` (controls), `:230-279` (evidence), `e2e/registers.spec.ts:17-45` (controls register), `e2e/injection.spec.ts:24-43,63-66,119-133` (payload routes, forms, gap CSV formula guard), `e2e/notif-matrix.spec.ts:5-18`, `e2e/a11y.spec.ts:10` (form pages); unit `tests/unit/frameworks.test.ts` (scoring). No unit tests for controls or evidence services.
