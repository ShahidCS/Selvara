# Risk Register (ISO/IEC 27005) port checklist

Source: `Assurance-GRC-Portal.html` lines 2411-2811. The import wizard (2813-2981) is ported separately (`risk/import/openImportWizard.tsx`); this module only calls it.

| Source feature | Source lines | React file | Status | Notes |
|---|---|---|---|---|
| Scales `Lb/Ib`, `RBANDS`, `rband`, `RISK_APPETITE`, tint/heat colour helpers, `riskPriority`, `ACCEPT_AUTH/RANK`, `CAT_TEAM`, `RISK_JUR`, `RISK_ENT`, `RISK_PARTIES` | 2412-2446 | `src/lib/risk.ts`, data in `src/data/riskRef.json` | Done | Reference data extracted with `scripts/extract-source.js`; two real staff names replaced by synthetic ones (to synthetic names). |
| Score/rating/band chips | 2424-2426 | `risk/RiskBits.tsx` | Done | Number/band name always in the chip text. |
| `riskNorm`, `riskNormAll`, `riskFindR`, `riskCtrl`, `riskLog`, `riskCanEdit`, `riskCanApprove` | 2451-2469, 2690 | `src/lib/risk.ts` | Done | Exported for the import wizard and other modules. `riskNormAll()` runs on every module render (idempotent via `_n`). |
| Page, tab bar (`risk.tab` shared with sidebar), Import/Export/Add acts | 2471-2499 | `RiskModule.tsx`, `risk/nav.ts` | Done | Selection clears when leaving Register (as `riskTab`). Import button only for `riskCanEdit`; handler re-checks ("You do not have permission to import risks"). |
| Dashboard: current/residual distribution, heat map (inherent/current/residual), status stats, review stats, breakdowns, treatment plan | 2502-2555 | `risk/RiskDash.tsx` | Done | Heat cells got an `aria-label`. Rows are keyboard-operable. |
| Register: search, 5 selects, Only mine, cell chip, clear filters, table, empty state | 2558-2603 | `risk/RiskRegister.tsx` | Done | Filters persist in `risk.rf`. Search capped at 100 chars. |
| Risk detail: header chips, approval flow, data-quality + failing-control banners, workflow buttons | 2606-2688 | `risk/RiskDetail.tsx` | Done | Unknown id renders "Risk not found". |
| Scoring editor (inherent / current / residual) | 2628-2633, 2691 | `RiskDetail.tsx` `ScoreCard`, `services/risks.ts setScore` | Done | Field allow-list, value 1-5 int clamp. Disabled for non-editors. |
| Map / unmap controls, open control drawer | 2616-2623, 2692-2693 | `RiskDetail.tsx`, `controls/useControlDrawer` | Done | Mapped id must be an existing, not-yet-mapped control. External control ids stay non-clickable. |
| Treatment actions: toggle, add modal | 2625-2626, 2694, 2708-2709 | `RiskDetail.tsx`, `risk/RiskForms.tsx` | Done | Date through `isIsoDate`. |
| Submit / Approve / Request changes | 2659-2660, 2695-2697 | `RiskDetail.tsx` | Done | Approve + request changes gated by `riskCanApprove`; others see "Awaiting a company admin." |
| Risk acceptance (form, validation, display, 60-day warning), Reopen, Close | 2635-2653, 2698-2707 | `RiskDetail.tsx` `AcceptForm` | Done | Same messages; see Security notes. |
| Interested parties (parties list on detail + tab: link, unlink, add) | 2655-2656, 2729-2737 | `risk/RiskParties.tsx`, `RiskDetail.tsx` | Done | Edit gate `riskCanEdit`. |
| Scoring criteria (scales, matrix, acceptance criteria) | 2712-2726 | `risk/RiskCrit.tsx` | Done | Static content. |
| Governance (register details, enterprise roll-up, snapshots, acceptances) | 2740-2768 | `risk/RiskGov.tsx` | Done | Snapshot buttons only for `riskCanApprove`. Snapshots live in module memory (`RISK_SNAPSHOTS`) as in the source. |
| Add risk modal + save (id, defaults, draft) | 2771-2783 | `risk/RiskForms.tsx`, `services/risks.ts createRisk` | Done | Edit mode of `riskFormBody(r)` was never called in the source and is not ported. |
| CSV export | 2784-2791 | `services/risks.ts exportRegisterCsv`, `RiskModule.tsx` | Done | Same columns/headers/file name; cells via `csvCell` (always quoted). |
| Import entry point | 2808-2811 | `RiskModule.tsx` -> `openImportWizard(L,{onDone})` | Done | `onDone` switches to Register, clears selection, `bumpData()`. |
| API stubs | - | `src/services/risks.ts` | Done | `viaApi` per mutation; mock mode mutates `DATA`. |
| Helper for other modules | - | `RiskModule.tsx` exports `useRiskDrawer`, `riskOpenDetail`, `riskGoReg`; `src/lib/risk.ts` | Done | |

## Open questions (ported as-is)
1. "Only mine" matches owner by a hard-coded demo surname, independent of the role switcher. Ported as `/Avery/` (same convention as WorkModule) so it matches the synthetic persona; it ignores `getMe()`.
2. The dashboard breakdown links strip `'` from the group name (to survive inline JS); a React port does not need that, so a category containing an apostrophe now filters correctly (the source would have matched nothing). Missing values group as "—" and filtering by it matches nothing, as in the source.
3. Changing any score does not reset `review` (an Approved risk keeps "Approved" after its scores are edited), and approval/acceptance do not check who submitted. Port as-is.
4. `riskSave` ids use `RK-<count+1>`; the source could collide after imports. A collision loop was added (the id is still demo-only).
5. "Accepted & valid" counts every risk with an `acceptance`, expired or not. "Accepted by" authority is a free choice from a list (no link to the actor's role).
6. `riskNorm` on an unparsable `reviewed` date (accepted risk without acceptance) threw RangeError in the source; falls back to today here.
7. Accepting a risk sets `treat = "Accept"`; reopening forces `treat = "Mitigate"` regardless of the previous decision.
8. Accept form fields reset whenever the required authority changes (source re-rendered the whole panel on every action); the form is keyed by risk id + required authority.
9. The export button is available to every role (source has no gate) and logs `risk.register.exported`.
10. Inherent/current/residual "Add risk" form always sets owner default to a fixed persona ("J. Avery"); source used a fixed real persona name. [real name]", not the signed-in user.
11. Added (not in source): read-only hint lines where the source rendered nothing for non-editors (acceptance, submit, parties, snapshots), "Enter a valid date." for a malformed acceptance date, aria-labels on heat cells/unmap/link selects.

## Security notes
* **All role gates are UI-only.** `riskCanEdit` (super, admin, owner, analyst) and `riskCanApprove` (super, admin) hide/disable controls and are re-checked in `services/risks.ts` (mock), but a real API must enforce them per endpoint (ASVS 4.1.1) and check object ownership/tenant (IDOR).
* **Segregation of duties (acceptance and approval) is not enforced by the prototype and must be by the API:**
  * Anyone with `riskCanEdit` (including owner/analyst) can record an acceptance and *pick any accepting authority*, including "Board / CEO". Only the rank of the *selected* authority is compared with the residual rating's required authority; the actor's real authority is never checked. The API must derive the accepting authority from the authenticated principal, not from a form field.
  * The submitter can also approve their own risk if they are an admin (no submitter != approver rule). The API should reject self-approval and the risk owner accepting their own risk above their authority.
  * Acceptance <= 12 months is checked client-side only (`until <= today+365`); re-validate server-side with a trusted clock. Acceptance rationale is required; keep it immutable in the audit trail.
  * Editing scores after approval/acceptance does not reset review state (see Open question 3): consider invalidating approval/acceptance server-side.
* **Validation:** free text through `clampText` + `maxLength` (title 200, description 1000, owner/location 100, action 300, rationale 1000, compensating 500, notes 500, close reason 300, party 200, requirement 500, search 100); scores forced to integers 1-5; category/treatment/authority/snapshot scope/score field checked against allow-lists; control and risk ids looked up in `DATA` before use; dates through `isIsoDate`. The API must repeat all of these.
* **Output:** every value is rendered as React text (no `dangerouslySetInnerHTML`). Colours come from a fixed band table, not from data.
* **Export:** each cell through `csvCell` (formula-injection guard), file name through `safeFileName`. Export logs `risk.register.exported`; the export contains the whole register for any role, so the API must authorise it.
* **Audit log:** every source `wsLog` kept (`risk.scored`, `risk.control.mapped/unmapped`, `risk.action.added/done/reopened`, `risk.submitted/approved/changes_requested/accepted/reopened/closed`, `risk.party.linked/unlinked/added`, `risk.register.snapshot/exported`, `risk.created`), actor from `getMe()`. Free text (rationale, notes) is stored in the risk history, not in the workspace log. In production the log must be server-side and append-only.
* **Snapshots:** the content hash is the demo FNV-1a (`lib/audit.ts`), not a cryptographic integrity control; real snapshots need server-side HMAC/immutable storage. Snapshots, interested parties and the `RISK_ENT` roll-up are in-memory only.
* **Import:** only `openImportWizard` is called here, gated by `riskCanEdit` in the button and handler; upload validation belongs to the wizard.
* **IDs from state/URL:** the selected risk id lives in module state; an unknown id shows "Risk not found".
