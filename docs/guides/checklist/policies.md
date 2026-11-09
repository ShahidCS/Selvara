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

---
## Hardening update (docs/SOD_MATRIX.md sections 3 and 5)
Files: `services/policies.ts` (rules + audit), `policies/PolicyLayers.tsx`, `PoliciesModule.tsx`, shared `src/lib/grcSod.ts` (new, add-only helpers), approvals engine `src/lib/approvals.ts`.

### What changed vs the prototype
| Prototype | Now |
|---|---|
| Statuses Draft / In review / Active; any user could submit, approve or edit | Draft -> In review (NAMED approver) -> Approved (immutable, effective date) -> Published (`status` "Active") -> Review due (derived from next-review date, never stored) |
| "Approvers & reviewers" list, never enforced; "Add approval step" | Removed. One named approver per version, chosen from workspace people with role admin/owner who are not the author or any editor |
| Anyone could edit | Only the policy owner (creator) edits content; admin may reassign ownership to an admin/owner successor with a reason (logged); admin cannot reassign to self |
| Approve & publish in one click by anyone (incl. the submitter) | Approve and Publish are two audited steps by the named approver; `assertNotSelf`-style check against author and all editors (`whyCannotApprove`/`whyCannotPublish`); UI buttons disabled with the reason |
| `parseFloat` version arithmetic ("NaN draft") | Explicit minor bump (4.2 -> 4.3, new policy 0.1, first approval 1.0). Old versions become Superseded and stay in the version history |
| Editing a published policy changed it in place | Editing an Active policy creates a NEW draft version (with a mandatory change reason); the published version stays untouched and visible until the new one is approved and published |
| Employees saw the same buttons | Employees/auditors read-only; employees can acknowledge the published version; policy form has no owner field |
| none | Change log (date, version, who, what, why) and version history (author/last editor, approver, effective date, why) |
| none | Emergency change (admin only, justification >= 20 chars): publishes immediately, creates exception `PX-n` + an approvals-engine request (`policy.emergency`) that a different admin/owner (not the publisher, not an author) must approve within 5 business days; banner in the drawer and chip in the register ("approval pending" / "OVERDUE"); approve or reject, audited, late decisions flagged |
Every transition calls `wsLog` with policy id and version: `policy.created|draft.created|draft.saved|submitted|approver.named|returned|approved|published|emergency.published|exception.approved|rejected|owner.reassigned|control.mapped|acceptance.reminded|acknowledged`. Services throw `SodError`; the UI shows its message as a toast (any other error shows the generic message).

### Conflicts resolved by owner decision (SOD_MATRIX replaces prototype)
* Prototype: submitter may approve own policy. Decision: never. Prototype "Edit" for all: creator only. Prototype "N.0 on publish": minor bump. Board spec says owner = approver is not forbidden; the matrix forbids author/last editor as approver, so owner = approver is refused.
* Board statuses (Awaiting approval, Annual review) are not adopted; "Review due" is a derived chip within 30 days of the next review date.

### Security notes
Enforced in the service layer (mock) and mirrored in the UI; the real API must enforce again:
* Role gates (`admin`/`owner` write, employee/auditor read), creator-only edit, named-approver-only approve/publish/request-changes, author/last-editor exclusion, effective-date gate on publish, admin-only emergency publish and reassignment, retrospective approval by a different person.
* Approved/published versions are never mutated: edits go to a new draft version. In the demo this is a service rule; the API must store versions append-only and hash them.
* Approver/successor eligibility is derived from the persona role table; the API must use real user ids and role membership, not display names. Name matching uses `samePerson` (lib/grcSod.ts), stricter than `isSamePerson` because seed names ("J. Avery") and personas ("Jordan A.") differ.
* Policy text is plain text rendered as React text (clamped to 8000 chars). No HTML. Acknowledgement is bound to the exact version (`lib/me.ackOf`).
* The 5 business day deadline is calculated client-side (weekends only, no holiday calendar); the server must own the clock and the reminders/escalation.
* Approval of a normal version is stored on the version record (named approver + reason + date), not in the approvals queue; only the emergency exception uses the engine (decided to avoid creating engine records during render of migrated seed data).

### Open questions
1. Seed "In review" policies have no named approver (owner is a non-manager persona, e.g. P. Nair); an admin must reassign ownership to progress them. Acceptable?
2. Persona "Jordan A." (admin) is the seed's "J. Avery"; matched by `samePerson`. Fix the persona name in `roles.json` or keep the alias rule?
3. Acceptance counts remain random demo values (the Policies drawer ring); the Me workspace holds real per-user acknowledgements.
4. Remarks/collaborators/policy library from `docs/SPEC_BOARDS.md` section 2 are not part of this change.
