# Questionnaires module checklist

Source: lines 3443-3478 (`REND.questionnaires`, `qRender`, `vendorPortal`, `qDrawer`). React: `QuestionnairesModule.tsx`, `questionnaires/QuestionnaireLayers.tsx`, `questionnaires/VendorPortal.tsx`, `src/services/questionnaires.ts`. State (answer library, KB docs, vendor questions): `src/lib/trustData.ts` from `src/data/trustSeed.json`. `DATA.questionnaires` already existed.

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
