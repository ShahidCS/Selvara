# Questionnaires module checklist

> **Wave D update.** In flight and the answer library are data tables; a questionnaire is a page (`/ws/questionnaires/:id`); import (`/ws/questionnaires/import`) and add answer (`/ws/questionnaires/answer`) are form pages. Wherever this checklist says "drawer", read "the questionnaire page". Submit for review, the reviewer separation and verify-before-publish are unchanged; the vendor portal is unchanged.

Source: lines 3443-3478 (`REND.questionnaires`, `qRender`, `vendorPortal`, `qDrawer`). React: `QuestionnairesModule.tsx`, `questionnaires/QuestionnaireLayers.tsx`, `questionnaires/VendorPortal.tsx`, `src/features/questionnaires/services/questionnaires.ts`. State (answer library, KB docs, vendor questions): `src/lib/trustData.ts` from `src/data/trustSeed.json`. `DATA.questionnaires` already existed.

| source feature | source lines | React file | status | notes |
|---|---|---|---|---|
| Vendor role gets vendor portal | 3449 | `QuestionnairesModule` | done | |
| Tabs In flight / Answer library / Knowledge base; per-tab primary action | 3450-3452 | `QuestionnairesModule` | done | `questionnaires.view` module state |
| In-flight table (progress bar + `prog`, due, status chip, chevron), clickable rows | 3456 | `QuestionnairesModule` | done | keyboard-operable rows; Complete shown as "Completed" |
| Answer library table (verified chip, uses, Verify) | 3457 | `QuestionnairesModule` | done | |
| Knowledge base table (Open toast) and "Upload document (demo)" toast | 3458, 3451 | `QuestionnairesModule` | done | source has no real upload |
| Vendor portal: header, progress bar, numbered questions, required `*`/"(optional)" | 3460-3465 | `VendorPortal` | done | count/bar update live as you type (source only on re-render) |
| Save draft toast "Draft saved" | 3466 | `VendorPortal` | done | |
| Submit: "N required question(s) still need answers", else log `vendor.questionnaire.submitted` + toast | 3467 | `VendorPortal` | done | |
| Verify answer: log `answer.verified`, toast "Answer verified" | 3468 | `svc.verifyAnswer` | done | |
| Add answer modal, "Question and answer are required.", log `answer.added`, switches to library | 3469-3470 | `AddAnswerForm` | done | |
| Drawer: ring, completion %, status, answered/remaining/due, actions | 3471-3474 | `openQuestionnaireDrawer` | done | |
| Answer next 10 (log `questionnaire.updated`, reopens drawer while incomplete) | 3475 | `svc.advanceQuestionnaire` | done | log text uses the progress before the update (source same: logs after mutate; see OQ 3) |
| Mark complete (`b / b`, due "Submitted", log `questionnaire.completed`) | 3476 | `svc.completeQuestionnaire` | done | |
| Export responses (complete only) toast | 3474 | drawer | done | demo toast |
| Import questionnaire modal (name*, total default 120 min 1, due default "30 Nov 2026" -> "TBD"), log `questionnaire.imported` | 3477-3478 | `ImportForm` | done | total capped at 100000 |

## Open questions
1. Verified answers feed the public Trust Center chatbot, yet "Verify" has no role gate or reviewer separation (any role that reaches the module, including employee). Ported as-is.
2. Import has no file upload; it only creates a row. "Upload document" is a toast.
3. In `qAdvance` the source calls `wsLog(... q.name+" "+q.prog)` after mutating, so the log shows the new progress. Ported the same.
4. Vendor portal title is hard-coded "ACME Ltd"; answers are global (`VENDOR_Q`), not per vendor/tenant. Required-answer check counts whitespace-only as empty.
5. Library "uses" never increments when the chatbot uses an answer.
6. Due dates are free text (no date validation in source); `prog` is a string "a / b".

## Security notes
* Role gating (vendor portal) and "who may verify" are UI-only. API: vendor sees only their own questionnaire (tenant/object-level authorization, IDOR); verify restricted to a reviewer role.
* Verified library answers are published to external visitors via the chatbot: require approval workflow server-side, content review, and never include internal-only text.
* All questionnaire names, answers, due text render as React text; inputs clamped (`clampText`, `maxLength`), numbers range-checked. No uploads exist in the source (none added).
* Vendor answers are held in memory only (no client storage). A real API must validate, size-limit and persist submissions and prevent edits after submit.

## Hardening (docs/security/SOD_MATRIX.md, owner decision 2026-11)
Services throw `SodError`; `wsLog` calls kept; sending uses `lib/approvals.ts` (`ApprovalsPanel` above the "In flight" table).

**What changed vs the prototype**
| Area | Prototype | Now |
|---|---|---|
| Send externally ("Mark complete" sets 100%, due "Submitted") | immediate | "Submit for review" by the author; a reviewer (admin/owner) who is not the author (importer) and has not edited it approves, then the send is applied (`questionnaire.completed` logged with author and reviewer). Edits are blocked while it awaits review |
| Verify answer (feeds the PUBLIC Trust Center chatbot) | any viewer of the library, immediate | admin/owner only; verifier != the answer's author/editor (`author` set on Add answer); `verifiedBy` recorded; audited (`answer.verified` with author); the button is disabled with the reason, verified rows show who verified |
| Import / answer / add answer | ungated | admin, owner, employee (the roles that open the module); vendors only use the portal view |

**Open questions added**
1. "Submit for review" still lets the author mark a questionnaire complete at any progress (source behaviour: sets answered = total). The reviewer sees the progress in the approval title; decide whether to require 100% first.
2. Questionnaires are addressed by index in the UI; a stable `qid` is added lazily for the approval payload.
3. The vendor portal view (vendor role answering our questionnaire) is outside the matrix and unchanged.

**Security notes (additions)**
* Author/editor tracking (`author`, `editors`, `ANSWER_LIB.author/editedBy`) is mock-state; the real API must record user ids and enforce reviewer != author and verifier != author itself.
* Chatbot corpus = verified answers only, so Verify is the publication control for external answers.
