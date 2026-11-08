# Policies module checklist

Source: `Assurance-GRC-Portal.html` lines 2252-2284. React: `src/components/modules/PoliciesModule.tsx`, `policies/PolicyLayers.tsx` (drawer + modals), `src/services/policies.ts`.
No seed data extraction was needed (`DATA.policies` already exists).

| source feature | source lines | React file/component | status | notes |
|---|---|---|---|---|
| polInit defaults (history, reviewers, mappedControls, acceptance) | 2253 | `services/policies.polInit`, on render and drawer open | done | random acceptance count is demo-only |
| Register table (ID, Policy, Version, Owner, Next review, Status, chevron), clickable rows | 2256 | `PoliciesModule` | done | rows keyboard-operable |
| "New policy" page action | 2257 | `PoliciesModule` | done | |
| Drawer "Policy <id>" header, name, status chip, meta grid | 2259-2262 | `openPolicyDrawer`, `DrawerBody` | done | |
| Workflow buttons by status (Draft: Submit for review; In review: Approve & publish + Return to draft; else New revision) + Edit | 2260, 2263 | `DrawerBody` | done | no role gate in source |
| Approvers & reviewers table + "Add approval step" | 2264 | `DrawerBody` | done | |
| Acceptance ring, `done / required accepted`, "Remind outstanding", or "Acceptance tracking begins once the policy is published." | 2265 | `DrawerBody` | done | |
| Mapped controls tags / "None mapped" + "Map control" | 2266 | `DrawerBody` | done | |
| Version history (newest first) | 2267 | `DrawerBody` | done | |
| Add approval step modal, "Reviewer name is required.", default role "Reviewer", log `policy.reviewer.added`, reopens drawer | 2268-2269 | `AddReviewerForm` | done | |
| Remind outstanding: log `policy.acceptance.reminded`, toast `Reminder sent to N people` | 2270 | `DrawerBody.remind` | done | drawer stays open |
| Map control modal (all `DATA.controls` ids), dedupe, log `policy.control.mapped`, reopens drawer | 2271-2272 | `MapControlForm` | done | |
| Transition: Active bumps to next whole version "N.0"; others log from → to; log `policy.status.changed`; toast `<name> published|<status lowercased>`; closes drawer | 2273-2276 | `svc.transitionPolicy`, `DrawerBody.transition` | done | |
| New revision: Draft, ver +0.1 + " draft", log `policy.revision.started`, toast "New revision started" | 2277 | `svc.startRevision` | done | |
| New/edit policy form (name*, owner, next review) | 2278-2284 | `PolicyForm` | done | default owner "J. Avery" (anonymised) |
| Create: id `P-(20+n)` padded, status Draft, ver "0.1 draft", log `policy.created`, toast "Policy created" | 2282 | `svc.createPolicy` | done | |
| Edit: log `policy.updated`, toast "Changes saved" | 2284 | `svc.updatePolicy` | done | |
| Validation "Policy name is required." | 2282, 2284 | `PolicyForm` | done | |

## Open questions
1. Approve & publish, Return to draft, New revision, Edit, Map control, Add step: none are role-gated in the source (anyone can approve). Ported as-is.
2. The approver who submits can also approve their own policy; "approval steps" are only a list and are never enforced or recorded as approvals.
3. `New revision` on a version string that does not parse (e.g. "Not started") yields `NaN draft`; the version arithmetic (`parseFloat`) also turns "2.0 draft" into "3.0" on publish. Ported as-is.
4. Edit does not default blank owner/review (create defaults to "Unassigned"/"Not started").
5. Policy id `P-(20+count)` can collide after future deletes (no delete exists today); service bumps until unique.
6. Mapping a control when `DATA.controls` is empty would have pushed `undefined` in the source; now it closes the modal without mapping.
7. After a status transition or new revision the source closes the drawer (does not reopen it). Ported as-is; add-step and map-control reopen it.
8. "Remind outstanding" sends nothing (toast only) and the acceptance numbers are random demo values.

## Security notes
Enforced by the UI (must also be enforced by the API):
* Policy names, owners, reviewers, history and mapped control ids render as React text only; the source built HTML strings with ids interpolated in inline handlers (all removed).
* `clampText` + `maxLength` on name (160), owner (80), next review (40), reviewer (80), role (60). Mapped control must be one of the ids in `DATA.controls` (enum check). Missing policy ids render "Policy not found.".
* Every `wsLog` from the source is kept (`policy.created|updated|status.changed|revision.started|reviewer.added|control.mapped|acceptance.reminded`), actor from `getMe()`, history "by" from `getMe().name`.
* Service errors show a generic toast.

Must be enforced by the real API:
* Separation of duties and RBAC for submit / approve & publish / return to draft / edit / map. The prototype has no gate and lets the author approve their own policy; the API must restrict approval to named approvers and record immutable approval evidence.
* Server-owned version numbering, timestamps and acceptance counts; "Remind" must be rate-limited server-side and send to real recipients only.
* Version history must be append-only and tamper-evident; published versions should be immutable (a revision creates a new draft).
* Policy text/titles must continue to be rendered as text; if rich-text policy bodies are added, sanitise server-side and render through a vetted sanitiser.
