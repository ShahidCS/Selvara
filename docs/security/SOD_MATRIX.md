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
| Space access | `super`/`super2`: admin space only (no `ws`). `support`: admin space subset per ROLE_MODS. Workspace content only via a customer-approved support grant (read-only, expiring). In production (slice 3b, migration 0007): a company admin gives the grant in Team & Rules, Support access (reason, 8 hours at most, revocable at once); platform staff (super or support) open a read-only support session on it from Customers & Usage, Support access (reason of 15+ characters, ticket, 60 minutes at most and never beyond the grant, one live elevation of any kind at a time). The session is not a platform elevation and allows no change anywhere; the database enforces both. Its start, end and every view are written to the company's own audit log. |
| Elevation | Required for EVERY mutation in `/admin/*` (customers, billing, rates, MFA reset requests/approvals). Browsing stays read-only. `useElevation()`/`elevationActive()` in `src/lib/elevation.ts`. Buttons are disabled with the exact text "Elevate to make changes"; services refuse without an active elevation (`SodError("Elevation required")`). |
| Elevation request | super only; reason (>= 15 chars) + ticket reference (pattern `[A-Z]{2,6}-\d{1,6}`); max 60 minutes; ends on sign-out, timeout or "End elevation" (a different person never inherits it); audited start/end/expiry. |
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
| MFA | Reset MFA (admin of a customer) | support or super (elevated) | the named super (elevated), != requester, != subject; only the named approver decides | | 3 identity checks, ticket ref, named approver, effects text, request expires in 24 h; requester may **withdraw** (not "reject") |
| MFA | Reset MFA (member of a workspace) | company admin | a different company admin or owner | requester != approver != subject | same checks; two approvers if the member holds a privileged role |
| Team | Grant/change a role, invite with privileged role | admin | different admin (admin2) approves | no one changes their own role; last admin cannot be removed | invitation expires in 72 h |
| Vendor | Approve vendor request / onboard | analyst/owner/admin | approver != requester | | Critical tier needs second approver; tier change and waiver need approver |
| AI | Classification | drafter | confirmer != drafter | | impact assessment approver != submitter; guardrail change needs second approver |
| Trust | Publish a resource publicly; approve access; Verify answer | editor | approver != editor / verifier != author | blocklisted domains cannot be approved | |
| Questionnaire | Send externally | author | reviewer != author | | |
| Assistant | Run an agent action needing approval; enable a custom agent; raise an agent's autonomy (section 11) | requester | approver != requester (and != the agent's creator for enable and raise) | | |
| API | Create key with write scope; add webhook | admin | second admin approves write scope keys | | webhook URL https-only (existing); keys shown once |
| Integrations | Connect a read-only connector (GitHub, AWS, Okta, Entra ID, Google Workspace); disconnect; link a check to a control | admin | connect: a second admin approves after a passing test (`integration.connect`, 24 h); disconnect and linking: single admin, audited (safe direction / evidence mapping) | | read-only scopes only; companies enter identifiers, never secrets; account data erased on disconnect |
| Billing (admin) | Credit, refund, manual paid, write-off, void | super (elevated) | different super (super2), elevated, when amount > `SOD.FINANCE_DUAL_USD` (USD 1,000) or the currency has no applied rate; always for write-off | initiator != approver | reason + ticket; re-checked when applied (production: `admin8.ts`) |
| Billing (admin) | Price-list change | super (elevated) | different super, elevated, always | initiator != approver | reason + ticket; applies to invoices issued afterwards |
| Billing (admin) | Set up or change a billing account; issue invoices; payment link; accept or decline a company's plan change; lift a sign-in block | super (elevated) | none (single elevated super admin, audited; amounts come from the price list, rates and tax) | | reason (and ticket for accounts) |
| Billing (company) | Ask for another plan; pay an invoice on the provider's page | company admin | the platform accepts or declines the plan change | | nothing changes until accepted; a payment counts only when the provider confirms it |
| Rates | Manual rate/tax override; release a held rate | super (elevated) | different super (elevated) | initiator != approver | numeric bounds; the held value must be unchanged when applied |
| Rates | Reject a held rate; refresh from the feeds | super (elevated) | none (safe direction: the rate in force stays; held values need a person) | | reason + ticket for a rejection |
| Trust Center | Turn the anonymous public page on | admin/owner | a different admin or owner (`trust.public-page`, 24 h) | requester != approver | turning it off: one admin or owner (safe direction) |
| Trust Center | Show the live control status to visitors (public page and the Viewer/Vendor view) | admin/owner | a different admin or owner (`trust.section-controls`, 24 h) | requester != approver | hiding it, and showing or hiding any other section: one admin or owner, audited and in the page history |
| Vendor portal | Send the assessment by email; send a new link; ask for clarification on chosen questions | admin/owner | none (the vendor answers; the company reviews) | | the vendor contact proves the invited address with an emailed code |
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

Enforced in `src/lib/delegation.ts` (`actsAs`), `src/services/delegation.ts` (create and end), `src/lib/approvalFlow.ts` (generic named-approver kinds) and `src/features/policies/services/policies.ts` (approve, publish, return to draft). The real API must enforce all of it server-side; the card on the My Work Delegation tab is not a control. Delegation is draft governance for review by the customer's compliance owner before it is relied on.

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
| Track record | To be raised, an agent needs N suggestions approved by a person and no rejection among its last N decided changes. N is a company setting (Team & Rules, admin only, audited as `team.agent_track_record.changed`): 3 (default), 2, or Off for teams too small to build a record. Off removes only the record; the second person's approval of the raise always stays. |
| Raise | One rung at a time, with a reason (at least 10 characters), as a four-eyes approval (`assistant.agent.autonomy`) by an admin or owner who is neither the requester nor the agent's creator. An agent that runs as a service account needs two different approvers. The rung and the record are checked again when it is decided. |
| Lower | Immediate, by any admin or owner (safe direction). Climbing back needs the record again. |
| Pause all agents | Immediate, by any admin or owner (safe direction), with a reason of at least 10 characters, recorded as `assistant.agents.paused_all` (how many were paused, by whom, the reason). Enable requests already waiting are withdrawn, so a later approval cannot restart an agent. Each agent is resumed on its own through a new enable request (`assistant.agent.enable`), approved by an admin or owner other than the requester and the agent's creator. Decided 2026-11 (reference review R33), draft for compliance review. |
| Rejected applied change | Any admin or owner, including whoever ran it (safe direction), can reject a change an acting agent applied, with a reason. The agent drops to `Suggests only` at once and the rejection counts against its record. The change itself is reversed where it was made. |
| Audit | `assistant.agent.autonomy_requested` (with reason), `assistant.agent.autonomy_raised` (approvers and requester), `assistant.agent.autonomy_lowered` (by whom, or automatically after a rejection), `assistant.run.rejected_after_applying` (with reason), `team.agent_track_record.changed`. |
| Decided (2026-11) | Track record configurable as 3, 2 or Off; a rejected applied change lowers the agent automatically; service-account agents need two approvers to be raised. |
| Certification | Every acting agent holds a certification that expires after 90 days (granted by the raise approval). Renewal is a four-eyes recertification (`assistant.agent.recertify`) with an attestation of at least 10 characters, the same people rules as a raise (two approvers for a service account), and no rejection among its recent changes (checked even when the raise threshold is Off). An agent whose certification lapses drops to `Suggests only` automatically, checked before every run, so a lapsed agent never acts. Audited as `assistant.agent.recertify_requested`, `assistant.agent.recertified`, and `assistant.agent.autonomy_lowered` ("certification lapsed"). |
| Agents acting before the ladder | Decided (2026-11, standard practice for regulated customers: no silent grandfathering, no abrupt reset). They keep acting for a 30-day transition, shown as "Recertify by <date>", and must be recertified in that time or they drop to `Suggests only`. |
| Open for review | The periods (90-day certification, 30-day transition, due-soon 14 days) and whether they should be company settings. |

Enforced in `src/features/assistant/lib/autonomy.ts` (rungs and track record) and `src/features/assistant/services/assistant.ts` (`raiseBlockReason`, `requestRaise`, `lowerAutonomy`, the approval handler, and `createAgent`, which pins new agents to the lowest rung).

## 12. Sign-in, MFA and requests to join
Decision (2026-11). The role switcher is gone: people sign in. Demo accounts are synthetic, one per persona (README.md); this is not an authentication control and the real API must authenticate on the server.

| Rule | Detail |
|---|---|
| Two kinds of account | Real accounts (approved requests to join) and demo accounts (one per persona, demonstration build only). A production build has no demo accounts and the server runs every rule (`services/authApi.ts`). Demo accounts are limited: labelled, one-hour sessions, the second step shows its code, the shared password cannot be changed or reset, no recovery codes. |
| Passkeys (platform super admins) | The second step is a passkey (WebAuthn, user verification required), added at the first sign-in. The last one cannot be removed; adding or removing needs the password within 5 minutes. In the demonstration build a labelled on-screen code is a fallback for devices without passkeys; production has no fallback. |
| Two-step verification | Real accounts add an authenticator app (TOTP, RFC 6238) at the first sign-in and enter a code at every sign-in; nobody is signed in before the second step; a code is never accepted twice; 10 recovery codes, single use, kept only as salted hashes. A correct password followed by a wrong code counts as a failure and alerts the owner; 5 wrong codes end the attempt. A reset needs the authenticator or a recovery code. |
| Sign-in | Email and password. Errors are generic ("Email or password is incorrect."), so they never reveal whether an account exists. Five failures lock that email for five minutes. Audited as `auth.signed_in` and `auth.signed_out` in the log of the person's space. |
| Network blocking | 10 failed sign-ins from one address within 15 minutes, across any accounts (attempts on a locked account count too), block that address for every account. A repeat block within 30 days lasts longer: 5 minutes, 30 minutes, 2 hours, then 24 hours, and 24-hour blocks repeat while failures continue; no block is permanent (compliance decision 2026-11, following OWASP); after 30 days without a block it starts again at 5 minutes. Every block ends on its own. Only an elevated platform super admin can lift a block early (Admin Console, Platform security), with a reason of at least 15 characters; the level then resets. Platform support sees the list read-only. Audited as `auth.ip.blocked` (by "Sign-in protection") and `auth.ip.unblocked` (with reason and elevation ticket). In the demo the address is a synthetic documentation-range IP per browser. |
| Challenge step | After 3 recent failures from the address or on the account, and always from hosting, VPN or proxy addresses, the next sign-in first needs a proof-of-work answer (single use, 2 minutes; the browser spends a moment hashing). A missing or wrong answer is refused and is not counted as a failure. Never asked on a trusted office network. |
| Address reputation | Hosting, VPN and proxy ranges (synthetic in the demo; an IP intelligence feed in production) are blocked after 5 failures instead of 10 and always get the challenge step. Listed read-only in Platform security. |
| Trusted office networks | A company admin lists an address or one /24 network (Team, Review cycles & SLAs); a different company admin approves it (`team-network`, four-eyes); removing is immediate. A trusted address is never network-blocked and skips the challenge step; accounts still lock and MFA still applies. Audited as `team.network.requested`, `.trusted`, `.removed`. |
| Account lockout preset | Company setting (admin only, audited `team.lockout.changed` with before and after): Standard (5 failures, 5 minutes), Strict (5, 30 minutes), PCI DSS v4 (10, 30 minutes; PCI DSS v4.0.1 req 8.3.4) or Custom (3 to 10 failures, 15 to 60 minutes, whole numbers; compliance decision 2026-11: no regulator publishes its own numbers, so each company matches its regulator or policy inside these bounds). Platform accounts always use Strict. |
| Alerts to the owner | Shown in the bell (cannot be switched off) and on the account page: account locked, signed in after 3 or more failed attempts, attempts from a blocked address, password changed or reset, a reset requested, other sessions ended. |
| Last sign-in | After signing in, the time, address and device of the previous sign-in and the failed attempts since are shown, and kept on the account page. |
| Sessions | Every sign-in is a session (device, address, start). The account page lists them; "Sign out other sessions" ends the rest at once (audited `session.others.revoked`). A session ended elsewhere signs out on its next load. |
| Re-authentication | Changing the password needs the current one. New recovery codes need the password confirmed within the last 5 minutes (a fresh sign-in counts). A wrong password counts as a failed attempt. A password change ends every other session. |
| Password reset | Same answer whether or not the account exists. The link works once, for 15 minutes; a new link replaces the old one. The second factor is also required (5 wrong codes end the link). On success every session ends, the person is not signed in, and the owner is alerted (`auth.password.reset`). Limited to 3 requests per address and 3 per account per hour; requests never lock the account. In the demo the page shows what the email and the authenticator would show. |
| Decided (2026-11) | Network blocks capped at 24 hours (no permanent block); a bounded Custom lockout preset for regulator-specific policies. |
| Open for review | NIST SP 800-63B rev 4 wording (not verified from the source: nist.gov is outside this environment's network allow-list); the challenge difficulty. |
| Request to join | Name, work email and a password that meets the credential policy (`lib/credentials.ts`). The answer is the same whether or not the email is known; duplicates and demo-domain emails are ignored. Limited to 3 per address per hour; a blocked address cannot send one. Only a salted hash of the password is kept. |
| Approval | A company admin approves or rejects, with a reason of at least 10 characters (`team.join.approved`, `team.join.rejected`). Nobody decides their own request. A pending or rejected person cannot sign in. |
| Role | An approved person joins as Employee under their own name (audit entries and separation-of-duties checks use it). Any other role is a separate role change with its own approval. |
| Sign-out | Ends any active elevation. A stored session for someone who is no longer an active member is signed out on load. |

Enforced in `src/lib/session.ts`, `src/lib/ipGuard.ts`, `src/services/ipBlocks.ts`, `src/services/joinRequests.ts` and `src/components/shell/AppShell.tsx` (signed-out routes go to `/login`).

## 13. Automation rules (draft for compliance review)
Decision (2026-11, designed from the approval and audit model, draft for review). A rule is "when this happens, do one safe thing", set up by company admins in Team & Rules.

| Rule | Detail |
|---|---|
| What a rule can do | Only notify the owner or open an issue (once per record). Rules never approve, reject, delete, publish or change access. Triggers and actions come from a fixed list; anything else is refused. |
| Turning on | A rule starts as a draft. Turning it on (and back on after a pause) is four-eyes (`team-rule`): a different company admin, not its creator, approves, with the number of records it would act on shown. |
| Limits | At most 20 actions per run and 25 rules per workspace. A preview (dry run) shows what it would act on without acting. |
| Stopping | Pausing is immediate; a rule that is on cannot be deleted until paused. |
| Audit | `team.rule.created`, `.enable_requested`, `.enabled`, `.paused`, `.deleted`, `.run` (counts) and `.action` (each action). |
| Production | Rules run as a server job on a schedule; here they run by hand. |
| Open for review | The trigger and action list, the limits, and whether some rules should need two approvers. |

Enforced in `src/features/team/services/governance.ts`.

## 14. Data retention and legal hold (draft for compliance review)

| Rule | Detail |
|---|---|
| Schedule | Each kind of record has a period and a minimum (draft values: audit logs, evidence and closed risks 7 years, minimum 5; retired policy versions 10 years; closed issues and access reviews 3 years, minimum 1; sign-in history 1 year; rejected requests to join 3 months). The minimum reflects record-keeping duties such as FATF Recommendation 11 (at least five years) and must be confirmed per regulator. |
| Changes | Longer takes effect at once. Shorter is four-eyes (`team-retention`, a different company admin) and is refused below the minimum. Every change needs a reason and is audited (`team.retention.changed`, `.shorten_requested`). |
| Legal hold | Any company admin places a hold at once, with a reason; while it holds, nothing of that kind is deleted. Releasing it is four-eyes (`team-hold`): a different admin, not the one who placed it. Audited (`team.retention.hold_placed`, `.release_requested`, `.hold_released`). |
| Purge | The demonstration build only previews what is past its period; nothing is deleted. Production purges run as a server job that skips held records and writes what it removed to the audit log. |
| Open for review | Every period and minimum, per regulator and per customer contract. |

Enforced in `src/features/team/services/governance.ts`.

## 15. Presence (draft)
Record and form pages show who else has the record open ("Also here"), and warn when two people are editing the same record ("the last save wins"). Names only, never content; nothing is stored. Demonstration build: between tabs of one browser (BroadcastChannel). Production: a Supabase Realtime Presence channel per record, joinable only by people the database allows to read that record. Presence is information, not a lock. Open for review: whether editing should take a lock instead.

## 16. Platform roles, combined-role mode and the deputy approver (back-end v2, ADR-021)

Accepted by the owner on 2026-11-24. It applies to Selvara's platform operations now and is built into back-end v2 (2D D-26a, 2E E-71e and E-72j, 2F F-K-49, 2H H-KS-13). The names of the people holding each role are recorded in the Phase 5 sign-off table (`docs/architecture/backend-v2/phase5/00-readiness-gate.md`, section 3) and are not repeated here.

| Rule | Detail |
|---|---|
| Roles are assignments | One person may hold several platform roles: Management Approver (R-A), CISO (R-B), support and custom platform roles. Holding R-A and R-B together is **combined-role mode**. It is on now, because the same person holds both roles. |
| Two different people, always | Every four-eyes action needs two **different** people. The approval engine counts people, not roles: a person holding R-A and R-B counts once, never twice. No self-approval, and no second vote. |
| Deputy approver (R-DEP): delegation record | **Delegator:** the R-A and R-B holder. **Delegate:** the contracted deputy approver. **Scope:** acts for R-A **or** R-B (never both in one action) in platform four-eyes actions, dual-role kinds, deletion approvals (D-58), key-store restore, release of a keep-newest hold, and break-glass. **Not delegated:** tenant workspace access (only through a customer support grant), changing their own roles, approving their own requests. **Start:** 2026-11-24. **Review:** at every release gate, and when combined-role mode ends. **Ends:** on written revocation, or when a second person holds R-A or R-B. |
| Deputy mandatory in combined-role mode | With no active deputy, platform four-eyes actions wait. Nothing proceeds on one approval. |
| Key-store recovery | `ks` restore and hold release need the combined holder **and** the deputy (2F F-K-48, F-K-49; 2H H-KS-12, H-KS-13). |
| Compensating controls | Approvals in combined-role mode are flagged `combined_mode = true`. Every super-admin elevation alerts the deputy. Break-glass needs the deputy and is reviewed afterwards by the internal auditor (R-D). |
| Monthly independent review | The technical reviewer, or the outsourced internal auditor (R-D), reviews the platform audit log, elevations and approvals each month and records a signed review. A missed review alerts the owner. |
| Changing the mode or role holders | Four-eyes kind `platform.roles.change` (the combined holder and the deputy). |
| Technical reviewer | Contracted, independent of the code author and of the approvers (2K K-M06, OD-12). Signs the technical part of every release gate. **Not** an approver of platform four-eyes actions. |
| Exit | Combined-role mode ends when a second person holds R-A or R-B. It is reviewed at every release gate. Recommendation: end it before cutover (V2-R6). |
| Accepted risk | R-66 (concentration of authority in one person), accepted by the owner on 2026-11-24 with these controls. |

