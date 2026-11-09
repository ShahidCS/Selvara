# AI Governance module checklist

Source: `Assurance-GRC-Portal.html` lines 3012-3245 (`REND.ai`, `ai*` helpers). React: `src/components/modules/AiModule.tsx`,
`ai/{AiChips,AiDrawer,AiModals}.tsx`, `src/lib/ai.ts`, `src/services/ai.ts`, seed `src/data/aiSeed.json` (extracted with `scripts/extract-source.js`; `DATA.ai` is in `seed.json`).
Exported hook for other modules: `useAiDrawer()` (from `AiModule`), opens the drawer by id (`"AI-01"`); an unknown id opens a "not found" drawer.

| source feature | source lines | React file | status | notes |
|---|---|---|---|---|
| KPIs (Registered systems, EU AI Act high-risk, Classifications to confirm, Shadow AI found), tones | 3013-3019, 3033 | AiModule | done | |
| Info banner (draft content, two-person rule, owner-or-admin) | 3033 | AiModule | done | copy verbatim |
| Discovery sources card | 3020 | AiModule, `AI_DISCOVERY` in lib/ai | done | |
| Discovered AI awaiting registration (count tag, Register / Dismiss, empty "Nothing unregistered") | 3021, 3028-3030 | AiModule, `svc.dismissShadow`, `openRegister` | done | wsLog `ai.shadow.dismissed`; `AI_SHADOW` is a mutable array (splice) |
| ISO/IEC 42001 readiness (ring via `fwReadiness('iso42001')`, 3 counters, Open framework) | 3022-3023 | AiModule | done | |
| AI inventory table (9 cols, archived rows dimmed and not clickable, draft tag, Open button) | 3034-3035 | AiModule | done | rows keyboard operable; the Open button still opens archived systems (source) |
| Register system modal ("Give the system a name", interim tier, starts Controlled / Not classified, shadow prefill, removes shadow entry) | 3226-3245 | AiModals `RegisterForm`, `svc.registerSystem` | done | wsLog category AI governance; toast `<name> registered — classify it next` |
| Drawer shell (title name, sub `id · purpose`, 5 tabs, Close) | 3093-3099 | AiDrawer | done | tab persisted (`useModState("ai.tab")`); re-renders in place instead of rebuilding the drawer |
| Overview tab (chips, meta grid, tools row, guardrail card, obligations, framework link, Manage buttons / read-only note) | 3101-3112 | AiDrawer | done | |
| Change guardrail tier modal with live rule text | 3176-3181 | AiModals `GuardForm`, `svc.setGuardrail` | done | |
| Edit / Assign owner / Attach evidence / Start or Complete review / Archive | 3214-3225 | AiModals, AiDrawer, services | done | review toggles In review <-> Approved, sets lastReview |
| Risk-classify (tier) modal | 3217-3219 | AiModals `ClassifyForm`, `svc.setTier` | done | defined in the source but no control calls it; ported, unreachable |
| EU AI Act tab (state chip, rationale, drafter/confirmer, draft banner, categories) | 3113-3123 | AiDrawer | done | |
| EU classification questionnaire modal + draft save (Prohibited / High-risk / Limited / Minimal, tier + guardrail derived) | 3152-3170 | AiModals `EuForm`, `svc.saveEuDraft` | done | |
| Confirm classification (confirmer != drafter, super/admin or surname Rivera) | 3171-3175 | AiDrawer, `svc.confirmEu`, `aiIsLegalOrAdmin` | done | toasts verbatim |
| Impact assessment tab (status chips, review chip, dates, D-07 note, submitted banner, Edit/Submit/Approve/Return, reserved notes) | 3124-3133 | AiDrawer | done | |
| Record impact assessment / Submit / Approve (sets evidence D-07) / Return | 3182-3191 | AiModals `FriaForm`, services | done | submitter != approver enforced in service |
| Bias tab + Log test modal + oversight list + Edit oversight measures | 3134-3141, 3192-3202 | AiDrawer, AiModals | done | one measure per line; empty lines dropped |
| Signals tab (severity chip, status chip, Recommended, Raise risk / Raise issue / Dismiss, `-> ref`) | 3142-3151 | AiDrawer | done | |
| Signal -> risk (draft risk, category AI) / issue / dismiss | 3203-3212 | `svc.signalRaiseRisk` (uses `riskNorm` from lib/risk), `signalRaiseIssue`, `signalDismiss` | done | ids bump past existing; issue via `nextId("R-", 60, ...)` |
| `aiInit` lazy defaults, `AI_DETAIL`, `aiCanManage`, chips, `aiEuRationale` | 3054-3092 | lib/ai.ts, AiChips | done | |
| `aiLog` (admin audit chain) | 3213 | lib/ai.ts `aiLog` | changed | see Open questions 1 |

## Open questions
1. **`adminLog` does not exist in the React app yet.** The source wrote every system decision (`ai.registered`, `ai.guardrail.set`, `ai.euact.confirmed`, `ai.impact_assessment.approved`, ...) only to the admin chain (`adminLog`, tagged tenant and category "AI governance") and only the shadow dismissal also to `wsLog`. I log all of them to the workspace chain via `aiLog` (`wsLog(action, name, "AI governance")`) so the trail is not lost; re-point `aiLog` to the admin chain when it is ported. The `tenant` field is not carried.
2. **EU AI Act confirmer rule depends on a surname.** `aiIsLegalOrAdmin` = role super/admin, or the signed-in name matches `/Rivera/i`. No demo persona is named Rivera (seed owners are), so only super/admin can confirm. Ported as-is.
3. **`aiCanManage` is surname based** (`owner.split(' ').pop() === me.split(' ').pop()`), so two people sharing a surname both manage the system; seed owners are written as initials ("A. Rivera"). As-is.
4. **Source-ungated mutations.** `aiEdit`, `aiAssign`, `aiEvidence`, `aiReview`, `aiArchive`, `aiClassify`, `aiRegister` and the save steps of the other modals did not re-check `aiCanManage`; only the buttons were hidden. The services now check it (deny by default, same toast copy), which cannot be reached through the UI. Registering a system has no gate at all (any role that reaches the module).
5. Source reopens the drawer after saves (resetting scroll); React keeps it in place. Edit / Assign / Review / Archive close the layer without reopening, as in the source.
6. Registration ids `AI-(n+1)` could collide after a delete in the source; they now skip used ids.
7. Edit keeps the old name if the new name is empty (source would store an empty name). Purpose/basis may still be saved empty.
8. `a.discovered` for archived rows is shown unchanged; archived systems cannot be un-archived (no control).
9. `euClass`/`tier`/`guardrail` are updated together only by the classification flow; "Change guardrail tier" can set Blocked while the EU class stays High-risk (source).
10. Lifecycle (`a.lifecycle`) is set once by `aiInit` and never updated by review/archive actions (source).
11. Evidence attach only stamps a generated file name (`Impact assessment <date>.pdf`); there is no upload.
12. The `Kpi` for "Registered systems" excludes Archived systems but the inventory lists them (source).

## Security notes
**UI-enforced only (the real API must enforce):** owner-or-admin management (`aiCanManage`); two-person rules (EU classification confirmer != drafter and Legal & Privacy/admin; impact-assessment approver != submitter); guardrail changes (including Blocked / Restricted); archive; owner reassignment; registering systems; raising risks/issues from signals. The API must write the audit entry itself and take the actor from the session, not from the request.
**Handled without changing visible behaviour:**
- All text (names, purposes, summaries, notes, signal text, oversight lines) renders as React text; the source used `esc()` + `innerHTML` with `onclick="aiDrawer(${i})"` index strings. Systems are addressed by id (not array index, which shifted after changes); unknown ids render "AI system not found".
- Free text clamped with `clampText` (name 120, purpose/basis/data 200, summary/notes 2000, measure 300 x 30, users 40) plus `maxLength`; tier, autonomy, FRIA/bias status, guardrail, Annex III area, role and owner are checked against allow-lists in the service.
- Classification and assessment text keeps the "draft content, human review required" wording; no output is presented as a compliance determination.
- Every mutation goes through `src/services/ai.ts` (`viaApi`) inside try/catch with a generic toast. Refusals use the source toasts.
- Third-party / vendor data handling: AI inventory fields ("Data it can reach") are descriptive text only; no customer data is stored. Seed data is synthetic.
- No uploads, external links or exports in this module (no `validateUpload`, `safeHref`, `csvCell` needed). Navigation uses `useGo`.

## Hardening (docs/SOD_MATRIX.md, owner decision 2026-11)
Services throw `SodError`; `aiLog` / `wsLog` calls kept; four-eyes steps use `lib/approvals.ts` through `lib/approvalKit.ts` and the `ApprovalsPanel` ("AI governance approvals").

**What changed vs the prototype**
| Area | Prototype | Now |
|---|---|---|
| `aiCanManage` | admin/owner/super role OR surname of the system owner equals mine | admin or owner role, or `isSamePerson(system owner, me)` (no surname matching) |
| EU class confirmation | `draftBy !== me` and (super/admin or name contains "Rivera") | role admin/owner (`aiCanDecide`), confirmer is not the drafter and not the system owner (`assertNotSelf`); the Legal & Privacy name hack is gone (`aiIsLegalOrAdmin` kept as an alias) |
| EU draft | overwrote tier and guardrail immediately | a draft only proposes (`euDraft`); tier and guardrail are applied when a second person confirms |
| Impact assessment approval | submitter != approver, any manager | role admin/owner and approver is not the submitter, the author (`fria.by`) or the system owner; Return needs the same role and not the submitter |
| Impact assessment edit | edit/approved states loose | refused while Submitted; editing an Approved one keeps it as a version (`friaVersions`) and starts a new draft that needs approval again (button "Start new version") |
| Guardrail change | immediate | approval by a second admin/owner (not the requester, not the system owner); applied on approval; button shows "Change awaiting approval" |
| Archive | immediate | same four-eyes approval |
| Register system | ungated | admin/owner/analyst (`assertRole`); registering never approves: "Complete review" (In review -> Approved) needs admin/owner who did not register and does not own the system |
| Discovered AI dismiss | ungated | admin/owner/analyst |
| `setTier` (unreachable in the UI) | set the tier | refused: the tier only changes through the confirmed classification |

**Resolved open questions (owner decision):** OQ 2 and 3 (surname hacks replaced by role gates and `isSamePerson`), OQ 4 (services re-check, registration gated). Still open: OQ 1, 5-12.

**Security notes (additions)**
* Role gates, "confirmer != drafter", "approver != submitter" and the second approver for guardrail/archive are enforced in `src/services/ai.ts`; the real API must enforce them from user ids (names are compared with `isSamePerson`, seed owners are initials like "A. Rivera").
* Two analysts can still register; `analyst` cannot open the module under ROLE_MODS, so the analyst rule is only reachable through the API.
* Every decision is audited: approval engine entries (`approval.<kind>.requested/approved`), `ai.guardrail.approved`, `ai.archive.approved` with approvers and requester, plus the existing `aiLog` calls.
