# Segregation of duties, privileged access and credential policy (contract)

Owner decisions (2026-11): this product is for highly regulated customers (banks, critical industries). These rules replace the prototype's behaviour where they differ.
Rules are enforced in the **service layer** (deny by default, throw `SodError` from `src/lib/sod.ts`) AND reflected in the UI (button disabled with the reason text, read-only states). The real API must enforce them again: UI is never the control.

Helpers: `getActor`, `hasRole`, `baseRole`, `isSamePerson`, `isMe`, `assertNotSelf`, `sodReason`, `assertRole`, `SOD` constants in `src/lib/sod.ts`. Personas: `super` Jordan Avery, `super2` Riley Quinn (second platform admin), `support`, `admin` (CISO) Casey Morgan is `admin2`, `owner`, `employee`, `auditor`, `vendor`, `viewer`, `analyst`.
Base roles: use `hasRole(roleId, "admin")` (matches admin and admin2; super matches super2). Seed data names are short ("O. Hart"): compare with `isSamePerson`.
Every decision below writes an audit entry (`wsLog`, and `adminLog` for platform actions) containing actor, subject, outcome and reference; never secrets.

## 1. Cross-cutting principles
1. **No self-approval.** The person who requests, drafts, edits, submits, owns the record or is the subject of an action can never approve/confirm/close it.
2. **Four-eyes** for high-impact actions (listed below): a second, different, authorised person approves; approval is a separate audited step with a reason.
3. **Least privilege, deny by default.** New roles get nothing until granted. Unknown role/state => refuse.
4. **No standing privileged access.** Platform super admins have no workspace access and mutate the admin console only inside an audited, time-boxed elevated session (section 2).
5. **Immutable approvals.** An approved/published artefact is never edited in place: changes create a new version that goes through approval again.
6. **Evidence for exceptions.** Risk acceptance above threshold, policy exceptions and waivers need a reference to an approval record, an expiry and a named approver.
7. **Pending requests expire** (default 24 h for MFA reset, 72 h for invitations) and expiry is audited.

## 2. Privileged access (platform) - gate model
| Rule | Detail |
|---|---|
| Space access | `super`/`super2`: admin space only (no `ws`). `support`: admin space subset per ROLE_MODS. Workspace content only via a customer-approved support grant (read-only, expiring), shown in Elevated Access. |
| Elevation | Required for EVERY mutation in `/admin/*` (customers, billing, rates, MFA reset requests/approvals). Browsing stays read-only. `useElevation()`/`elevationActive()` in `src/lib/elevation.ts`. Buttons are disabled with the exact text "Elevate to make changes"; services refuse without an active elevation (`SodError("Elevation required")`). |
| Elevation request | super only; reason (>= 15 chars) + ticket reference (pattern `[A-Z]{2,6}-\d{1,6}`); max 60 minutes; ends on role switch, timeout or "End elevation"; audited start/end/expiry. |
| Admin-log | Read-only for everyone; never editable. Export needs elevation not required (read) but is audited. |

## 3. Four-eyes actions
| Domain | Action | Who may initiate | Who may approve | Forbidden same-person | Extra controls |
|---|---|---|---|---|---|
| Risk | Accept a risk, residual score <= 15 | owner, analyst, admin (record) | Authority from `ACCEPT_AUTH` ladder (role rank >= required band) | acceptor != risk owner, != last editor/submitter | max 12 months, reason, review date |
| Risk | Accept a risk, residual score > 15 | admin records | **Board approval evidence is mandatory**: board decision reference (`BRD-YYYY-NN`), decision date (not future, <= 90 days old), approving body, minutes reference/attachment name (validated via `validateUpload`/`safeFileName`), expiry <= 12 months | recorder != risk owner, != submitter; two different people: recorder (admin) and a verifier (admin2/owner) confirm evidence | cannot be saved without all evidence fields; shows "Board approved" chip with reference |
| Risk | Close a risk | owner/admin | different person than the editor | closer != owner when treatment actions exist | blocked while any treatment action is open |
| Risk | Import that updates existing ids | analyst/admin | approver != importer (admin) before changes apply (changes are staged as a pending import) | | new ids may import without approval |
| Policy | Edit content | policy owner (creator) only; admin may reassign owner to a role successor with reason | - | | editing an Active policy creates a new draft version |
| Policy | Approve and publish | named approver (admin or owner role) | approver != author, != last editor | | approved version immutable; employees read + acknowledge only; approval and publication logged with version |
| Evidence | Mark collected evidence as accepted | owner/analyst | reviewer != collector | | delete needs admin + reason + second admin approval |
| Control | Attest / change status / accept exception | control owner | exception approver != requester | | exception has expiry + compensating-control note |
| Issue | Close High/Critical | assignee/owner proposes | verifier != assignee, != owner, with verification note | | Medium/Low: closer != creator recommended, not enforced |
| Audit | Auditor actions | auditor: read-only on organisation records, may raise information requests and draft findings | management (admin/owner) accepts a finding into an issue | auditor cannot advance stage, freeze, end access, create issues, edit PBC status of management items | |
| Access | Approve access request | admin, owner | approver != requester, != beneficiary | | Admin-level or privileged systems need two approvers (admin + owner/admin2) |
| Access | Access review decisions | reviewer (owner/admin) | reviewer != the account holder under review; completing the review requires a reviewer other than the creator for privileged accounts | | revocations create follow-up tasks |
| People | Offboard | admin/owner request | second approver != requester for accounts with privileged access | | MFA reset for a member: requester != approver != subject; identity checks (below) |
| MFA | Reset MFA (admin of a customer) | support or super (elevated) | super (elevated), != requester, != subject | | 3 identity checks, ticket ref, named approver, effects text, request expires in 24 h; requester may **withdraw** (not "reject") |
| MFA | Reset MFA (member of a workspace) | company admin | a different company admin or owner | requester != approver != subject | same checks; two approvers if the member holds a privileged role |
| Team | Grant/change a role, invite with privileged role | admin | different admin (admin2) approves | no one changes their own role; last admin cannot be removed | invitation expires in 72 h |
| Vendor | Approve vendor request / onboard | analyst/owner/admin | approver != requester | | Critical tier needs second approver; tier change and waiver need approver |
| AI | Classification | drafter | confirmer != drafter | | impact assessment approver != submitter; guardrail change needs second approver |
| Trust | Publish a resource publicly; approve access; Verify answer | editor | approver != editor / verifier != author | blocklisted domains cannot be approved | |
| Questionnaire | Send externally | author | reviewer != author | | |
| Assistant | Run an agent action needing approval; enable a custom agent; raise an agent's autonomy (section 11) | requester | approver != requester (and != the agent's creator for enable and raise) | | |
| API | Create key with write scope; add webhook | admin | second admin approves write scope keys | | webhook URL https-only (existing); keys shown once |
| Billing (admin) | Credit, refund, write-off | super (elevated) | different super (super2), elevated, when amount > `SOD.FINANCE_DUAL_USD`; always for write-off | initiator != approver | reason + ticket |
| Rates | Manual rate/tax override | super (elevated) | different super (elevated) | initiator != approver | numeric bounds as today |
| Reports | Schedule external distribution | owner/admin | different admin | | |

## 4. Identity verification for MFA reset (admin and member)
Required before a request can be submitted: (1) out-of-band call-back to a number on file, (2) manager/sponsor confirmation, (3) verification of a government/employee ID or video check. All three confirmed explicitly; ticket reference; reason (enum + text); named second approver chosen from eligible people (not requester, not subject). Effects text shown: sessions revoked, factors removed, user notified at all contact points, forced re-enrolment at next sign-in, recovery codes invalidated. Request expires after 24 h. Only the approver sees Approve/Reject; requester sees Withdraw.

## 5. Policy edit/approve workflow (standard practice)
Draft -> In review (named approver assigned, must differ from author) -> Approved (immutable version, effective date) -> Published (Active) -> Review due. Edit rights: creator/owner only; admin reassigns ownership with reason (logged). Employees: read + acknowledge only. Emergency change: permitted for admin but creates an exception record requiring retrospective approval within 5 business days by a different person. Version history and change log retained; all transitions audited.

## 6. Credential policy (OWASP ASVS 2.1 / NIST SP 800-63B rev 3-4)
* Minimum length 12 (hard), maximum accepted >= 64 (accept up to 128). No composition rules (no required upper/lower/digit/symbol). Allow all printable Unicode and spaces; normalise with NFKC before comparison/storage by the server.
* Paste and password managers allowed; show/hide toggle; no hints, no security questions.
* Reject: passwords found in a breached/common-password list (check is `checkBreached` in the service layer; mock mode uses a local blocklist, real mode must use a k-anonymity breach API server-side), values containing the account email/username/company name, trivially repeated or sequential strings.
* No periodic rotation and no password-history rule; require change only on evidence of compromise.
* Strength feedback is advisory (estimator), never a composition checklist.
* MFA mandatory; phishing-resistant (passkey/security key) recommended; SMS/voice are not offered as MFA methods; recovery codes single-use, 8-10 codes, shown once.
* Throttling: lock/slow after repeated failures with generic error text (no account enumeration).
* Reset: single-use, short-lived token (<= 15 min), generic response whether or not the account exists, MFA required before the new password is accepted, all sessions revoked after reset, user notified.
* Session: idle timeout 15 min for privileged roles / 30 min otherwise, absolute 12 h, re-authentication (step-up) for sensitive actions.

## 7. Where this is enforced
Service layer in `src/services/*.ts` (each mutation calls `assertRole` / `assertNotSelf` / threshold checks and writes the audit entry), UI via disabled buttons with `sodReason`, and documented per module under "Security notes" in `docs/guides/checklist/*.md`. Anything the front-end cannot enforce is listed in `docs/security/SECURITY.md` as a backend requirement.

## 8. Decisions from the notifications panel
Approve and Reject can be pressed in the bell for approvals decided through the shared four-eyes path (`ai.`, `vendor.`, `api.`, `assistant.`, `report.`, `trust.`, `q.` kinds). The panel calls the same decision function as the module's own approvals panel, so sections 1 and 3 apply unchanged: no self-approval, role check, subject exclusion, reason of at least 10 characters, expiry, audit entry, and the change is applied only on the final approval. An item the person cannot decide is not listed. All other kinds stay on their records because their modules add rules (second approver differs from the first, board evidence, elevation, named approver). The real API must enforce every rule again; the panel is not a control.

## 9. Delegation of a named approver slot
Decision (2026-11, conservative policy). Where a request names a specific approver (a policy under review, a member MFA reset), that person can hand the slot to another person for a limited time. Delegation never grants authority: every rule in sections 1 and 3 still applies to the delegate.

| Rule | Detail |
|---|---|
| Who | Delegator and delegate must both be a company admin or an owner (base roles `admin`, `owner`). Nobody delegates to themselves. A delegate who is not an admin or owner is refused, and a delegate who stops holding one stops being able to use it. |
| Length | 1 to 14 whole days, then it ends by itself (the expiry is audited). One live delegation per person. No loops (A to B while B has delegated to A). |
| Reason | At least 10 characters, stored and shown to the delegate. |
| No new privilege | The delegate is still refused anything they raised, wrote, last edited or are the subject of, needs the reason of at least 10 characters, and a second different person is still needed where two approvers are required (the delegate counts as the named approver, never as the second one). |
| Delegator's own limits | It does not cover a request that the delegator raised or is the subject of: if the delegator could not decide it, nobody decides it for them. |
| No chains | A delegation covers only the delegator's OWN slot. A delegate cannot pass it on, and a third person gains nothing from it. |
| Not for the platform | Admin Console approvals (elevated, super admin) are never delegated. |
| Audit | Start (`delegation.created`: who, to whom, until, reason), end (`delegation.revoked`, by whom; `delegation.expired`), and every decision made on behalf (`approval.<kind>.on_behalf`; policies also name it in the version history and the change log). |
| Ending | The delegator at any time. A company admin may end anyone's delegation (safety valve). |

Enforced in `src/lib/delegation.ts` (`actsAs`), `src/services/delegation.ts` (create and end), `src/lib/approvalFlow.ts` (generic named-approver kinds) and `src/features/policies/services/policies.ts` (approve, publish, return to draft). The real API must enforce all of it server-side; the card in My workspace is not a control. Delegation is draft governance for review by the customer's compliance owner before it is relied on.

## 10. Notification matrix (draft for compliance review)
Decision (2026-11, designed from the existing bell, draft for review). A person chooses, for each kind of notice, whether it reaches the bell and an email digest. The choice only ever reduces noise: it never changes who may decide something.

| Rule | Detail |
|---|---|
| Never hidden | Approvals waiting for your decision always appear in the bell; that cell is locked on and refused by the service. A pending four-eyes decision cannot be silenced. |
| Scope | Only kinds the role can open (the module must be allowed). A refusal otherwise. Admin Console notices are not configurable. |
| Own settings | A person changes only their own; the real API must key them to the authenticated user. |
| Email digest | Saved as a preference only. This build has no mail service and sends nothing; the real digest must not include record detail beyond a title and link. |
| Audit | `notifications.pref.changed` (who, which kind, which channel, on or off). |
| Open for review | Whether other kinds (for example critical control failures) should be locked on, and the digest content, are for the compliance owner to decide. |

Enforced in `src/lib/notifPrefs.ts` (rules and defaults), `src/services/notifPrefs.ts` (change, audit) and `src/lib/notifications.ts` (bell filter).

## 11. Autonomy ladder for custom agents (draft for compliance review)
Decision (2026-11, designed from the existing agent behaviour, draft for review). An agent's autonomy is earned one rung at a time and given up at once.

| Rule | Detail |
|---|---|
| Rungs | `Suggests only` (a person approves each proposed change, as before) then `Acts (logged)` (applies within its scope at once, each run recorded). A paused agent is off whatever its rung. |
| Start | Every new agent starts at `Suggests only`, whatever the request asks for. Before this change the creator could pick `Acts (logged)` at creation. |
| Track record | To be raised, an agent needs N suggestions approved by a person and no rejection among its last N decided changes. N is a company setting (Team & Settings, admin only, audited as `team.agent_track_record.changed`): 3 (default), 2, or Off for teams too small to build a record. Off removes only the record; the second person's approval of the raise always stays. |
| Raise | One rung at a time, with a reason (at least 10 characters), as a four-eyes approval (`assistant.agent.autonomy`) by an admin or owner who is neither the requester nor the agent's creator. An agent that runs as a service account needs two different approvers. The rung and the record are checked again when it is decided. |
| Lower | Immediate, by any admin or owner (safe direction). Climbing back needs the record again. |
| Rejected applied change | Any admin or owner, including whoever ran it (safe direction), can reject a change an acting agent applied, with a reason. The agent drops to `Suggests only` at once and the rejection counts against its record. The change itself is reversed where it was made. |
| Audit | `assistant.agent.autonomy_requested` (with reason), `assistant.agent.autonomy_raised` (approvers and requester), `assistant.agent.autonomy_lowered` (by whom, or automatically after a rejection), `assistant.run.rejected_after_applying` (with reason), `team.agent_track_record.changed`. |
| Decided (2026-11) | Track record configurable as 3, 2 or Off; a rejected applied change lowers the agent automatically; service-account agents need two approvers to be raised. |
| Open for review | Whether agents that were already at `Acts (logged)` before the ladder existed must re-earn it. |

Enforced in `src/features/assistant/lib/autonomy.ts` (rungs and track record) and `src/features/assistant/services/assistant.ts` (`raiseBlockReason`, `requestRaise`, `lowerAutonomy`, the approval handler, and `createAgent`, which pins new agents to the lowest rung).

