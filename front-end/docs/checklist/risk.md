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

## Changed vs prototype (owner decision 2026-11, contract `docs/SOD_MATRIX.md`)
| Area | Prototype | Now | Where |
|---|---|---|---|
| Acceptance threshold | any authority could be chosen, incl. Board / CEO | `SOD.RISK_BOARD_THRESHOLD = 15`. Residual <= 15: ladder (`ACCEPT_AUTH/RANK`), Board / CEO rung not selectable, effective at once. Residual > 15: Board approval evidence form (decision ref `BRD-YYYY-NN`, date not future and <= 90 days old, approving body, minutes reference or file name, expiry <= 12 months, reason >= 20 chars); cannot be saved without all fields | `lib/riskBoard.ts`, `services/risks.ts acceptRisk`, `RiskDetail.tsx AcceptForm` |
| Evidence verification | none | Recorder (admin) creates approval `risk.board-evidence` (`approverRoles` admin/owner, forbid risk owner, last editor, submitter; recorder is the requester). Acceptance is effective only when Approved; until then "Awaiting evidence verification". Verify / Reject / Withdraw in the risk panel | `decideBoardEvidence`, `withdrawBoardEvidence`, `syncBoardEvidence`, `VerifyBox` |
| Acceptor | anyone with edit | acceptor != owner, != last editor, != submitter (`assertNotSelf` in service + disabled form with the reason text) | `acceptRisk` |
| Approve review (Submitted -> Approved) | submitter could approve | approver != last editor/submitter (service + disabled button) | `approveRisk` |
| Close | any editor, any time | blocked while a treatment action is open ("Close or cancel the open actions first."); closer != last editor; closer != owner when actions exist. Actions can now be cancelled with a reason | `closeRisk`, `closeBlock`, `cancelAction` |
| Score edits after acceptance | acceptance kept | acceptance invalidated (status Open, reason in history and audit) when residual rises above the accepted band, or above 15 without Board evidence; a pending acceptance is cancelled when the residual changes | `lib/risk.ts riskRevalidateAcceptance/riskCancelPending`, `setScore` |
| Display | - | "Board approved - ref - date" chip, evidence block, ref in Governance list | `RiskDetail`, `RiskGov` |
| Export | - | CSV columns Board decision ref, Board decision date, Acceptance state | `RISK_CSV_COLS`, `exportRegisterCsv` |
| Import | updates applied directly | see `risk-import.md` (staged approval, Pending imports panel in Register tab) | `PendingImports.tsx` |
| Errors | generic toast | `SodError` text is shown (`risk/util.ts attemptR`); any other exception stays generic | |
| Last editor | not tracked | `lastEditedBy` / `submittedBy` on the risk (create, scores, controls, actions, submit, reopen, import) | `services/risks.ts touch` |

Audit (`wsLog`, reference ids only, no file content): `risk.accepted` (ref, approval id, recorder), `risk.board-evidence.recorded/verified/rejected/withdrawn/expired`, `risk.acceptance.invalidated/pending_cancelled`, `risk.action.cancelled`, `risk.closed`; approval engine adds `approval.risk.board-evidence.*`.

## Conflicts resolved by owner decision
1. **Risk acceptance criteria: "15 without board approval; above that backed by board approval evidence."** Replaces the prototype's free choice of authority (Board / CEO could be picked for anything). Boundary: 15 accepts without Board, 16 needs evidence (possible 5x5 products: 15, 16, 20, 25). Checked with a throwaway script, not in the repo.
2. **Appetite (11) vs acceptance threshold (15) are distinct.** `RISK_APPETITE` stays 11 (heat-map edge, dashboard text "Medium or below"). **Open question for the owner: should appetite also move to 15?** If yes the heat-map edge and the Scoring Criteria appetite text change too.
3. **"Risk owner" rung vs acceptor != owner.** The ladder still names "Risk owner" as the lowest authority for Low risks, but the person recording must not be the owner, last editor or submitter. The rung is the authority level, not the actor; the SoD rule wins.
4. **Prototype "Approve" by the submitter** is no longer possible (contract section 1: no self-approval).

## Open questions (ported as-is)
1. "Only mine" matches owner by a hard-coded demo surname, independent of the role switcher. Ported as `/Avery/` (same convention as WorkModule) so it matches the synthetic persona; it ignores `getMe()`.
2. The dashboard breakdown links strip `'` from the group name (to survive inline JS); a React port does not need that, so a category containing an apostrophe now filters correctly (the source would have matched nothing). Missing values group as "—" and filtering by it matches nothing, as in the source.
3. Changing any score does not reset `review` (an Approved risk keeps "Approved" after its scores are edited). Acceptance is now invalidated by score edits (see above); the review state is still not reset. Approval/acceptance now check who edited/submitted.
4. `riskSave` ids use `RK-<count+1>`; the source could collide after imports. A collision loop was added (the id is still demo-only).
5. "Accepted & valid" counts every risk with an `acceptance`, expired or not. "Accepted by" authority is a free choice from a list (no link to the actor's role).
6. `riskNorm` on an unparsable `reviewed` date (accepted risk without acceptance) threw RangeError in the source; falls back to today here.
7. Accepting a risk sets `treat = "Accept"`; reopening forces `treat = "Mitigate"` regardless of the previous decision.
8. Accept form fields reset whenever the required authority changes (source re-rendered the whole panel on every action); the form is keyed by risk id + required authority.
9. The export button is available to every role (source has no gate) and logs `risk.register.exported`.
10. Inherent/current/residual "Add risk" form always sets owner default to a fixed persona ("J. Avery"); source used a fixed real persona name. [real name]", not the signed-in user.
11. Added (not in source): read-only hint lines where the source rendered nothing for non-editors (acceptance, submit, parties, snapshots), "Enter a valid date." for a malformed acceptance date, aria-labels on heat cells/unmap/link selects.

## Security notes
* **Four-eyes is enforced in `services/risks.ts` (`assertNotSelf`, `assertRole`, approvals engine) and mirrored by disabled controls with the reason text. Names are compared with `isSamePerson`; the real API must compare authenticated user ids, derive the recorder/verifier from the session (never from a form field) and use a trusted clock for the 90-day / 12-month checks.**
* **Board evidence:** only reference, date, body and file NAME are stored (`validateUpload` allow-list pdf/docx/png/jpg, 10 MB, `safeFileName`); the file content is never read or uploaded by this front-end, so nothing proves the minutes exist. A real API must store the attachment (malware scan, object-level authorization) and ideally link the decision to a board-records system. Evidence is not editable: a change means a new request.
* **Approvals engine is an in-memory demo** (`lib/approvals.ts`); persistence, expiry (72 h here) and authorisation belong to the API. The risk store reconciles pending acceptances with their approvals on module load / data change (`syncBoardEvidence`).
* **Import cannot bypass controls:** an import update never changes an Accepted risk's status, never closes a risk with open actions, and re-checks acceptance against the new scores; imported rows never record an acceptance.
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
