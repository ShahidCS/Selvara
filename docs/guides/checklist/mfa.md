# Admin MFA Resets (Phase 4)

| Source feature | Source lines | React file | Status | Notes |
|---|---|---|---|---|
| Pending approval card (count chip, table, Approve/Reject) | 4136-4140 | `MfaModule.tsx` | Done | Approve disabled for the requester (`title` "A second approver is required") AND refused by `services/mfa.ts` |
| Customer admins table (MFA chips, Reset MFA disabled while "Reset pending") | 4141 | `MfaModule.tsx` | Done | Unknown customer id falls back to the id (source) |
| Reset history (newest first, empty state "No resets yet") | 4142 | `MfaModule.tsx` | Done | |
| "Audit log" page action -> `/admin/adminlog` | 4144 | `MfaModule.tsx` | Done | via `useGo` |
| `mfaRequest` modal (copy, reason/method selects, confirm checkbox, "Confirm the out-of-band identity check first.") | 4146-4153 | `mfa/ResetRequestForm.tsx` | Done | Unknown admin id -> "Admin not found." |
| `mfaRequestSubmit` (MR-id, status Pending approval, adminLog `mfa.reset.requested`, toast) | 4155-4161 | `services/mfa.ts` `requestReset` | Done | Enum-checked reason/method; refused if admin already "Reset pending" or a pending request exists; id made collision-free |
| `mfaApprove` (decidedBy/At, admin.mfa update, adminLog approved/rejected, toasts) | 4162-4167 | `services/mfa.ts` `decideReset` | Done | State guard: only "Pending approval" can be decided |

## Open questions
1. Four-eyes is name-based (`r.by === ME.name`, compared case-insensitively here). Two staff with the same display name, or one person with two personas, defeat it; a real system needs stable user ids.
2. The source lets the requester Reject their own request (only Approve is disabled). Ported as-is (acts as withdrawal). Should it be restricted, or logged differently?
3. Rejecting a request sets `mfa` to "Enrolled" regardless of the admin's previous state (e.g. was "Not enrolled"); ported as-is.
4. Approval sets the admin to "Not enrolled" immediately (no re-enrol step modelled).
5. Source had no role gate beyond module access (Platform Super Admin and Platform Support both can request and approve). Service now enforces that same rule (deny by default); policy on who may approve (e.g. only super admins) is not invented.
6. Request ids are `MR-(109+count)` (demo ids); decidedAt is date only.
7. No expiry for pending requests, no cancel action.

## Security notes
MFA reset is an account-takeover vector. UI enforcement is not enough; a real API MUST: authenticate the actor from the session; require step-up authentication (fresh MFA) for requester and approver; enforce dual control server-side (different user ids, same-tenant/permission checks, atomic state transition so a request cannot be approved twice or concurrently); perform the out-of-band identity verification against contact data on file (not data typed into the request), and store the verification evidence; notify the affected admin and the customer's other admins; expire pending requests; rate-limit requests per admin and per customer and alert on bursts; force re-enrolment at next sign-in and revoke sessions on approval. Client-side controls here: role gate, requester != approver, state guards, enum validation, confirmation checkbox, every decision written to the admin hash chain (`mfa.reset.requested/approved/rejected`, with tenant, before/after). The audit chain is a demo (FNV-1a), see adminlog.md. Log text is rendered as React text only.

---
## Hardening vs prototype (SOD_MATRIX sections 3 and 4) - supersedes the Open questions above where they conflict
**What changed vs the prototype**
| Prototype | Now | Where |
|---|---|---|
| Any support/super could request and approve; requester could Reject own request | Requester must be `support` or `super` AND elevated (`assertElevated`); requester sees **Withdraw** only (never Reject); approver sees Approve/Reject with a reason of at least 10 characters | `services/mfa.ts`, `lib/approvalFlow.ts`, `mfa/PendingApprovals.tsx` |
| One "I confirm" checkbox, free "Identity verified by" select | Three explicit checks (call-back to a number on file, manager/sponsor confirmation, ID or video check), all required | `mfa/ResetRequestForm.tsx`, `validateResetFields` |
| No ticket, free reason | Ticket `[A-Z]{2,6}-\d{1,6}`, reason enum + text (>= 10 chars) | same |
| Any other staff could approve | NAMED second approver chosen from eligible people (super, not requester, not subject); only that person can decide | `eligibleAdminApprovers`, `whyCannotDecide` |
| Approval flipped state in the request step ("Reset pending" only), no expiry | Approvals engine (`approverRoles ["super"]`, domain `admin`); effects (MFA factors removed, sessions revoked, re-enrol forced, recovery codes invalidated, notify) applied **only on final approval**; request expires after 24 h with an audited `approval.mfa-reset-admin.expired` entry; reject/withdraw/expire restore the previous MFA state | `registerKind(KIND_ADMIN)` |
| Effects not shown | Effects text listed in the request form | `MFA_EFFECTS` |
| Elevation not required | Request, approve, reject, withdraw all call `assertElevated()`; buttons disabled with "Elevate to make changes" | `MfaModule.tsx`, `PendingApprovals` |
| Member MFA reset (People drawer/table, and Team via the person drawer) was one click, no audit | Same form and rules at workspace level: requester `admin`, approvers `admin`/`owner` (not requester, not subject), 2 approvers when the member is privileged, self-service reset refused | `services/people.ts` `requestMemberMfaReset`, `MemberResetForm` |
History table now shows Withdrawn / Expired and the ticket reference.

**Security notes (additions)**
- Everything above is enforced in the service layer and again by the UI (disabled + reason text). The API must repeat it with actor, elevation record, identity-check evidence and expiry held server-side; the three check boxes are an attestation by the requester, the real system should capture the call-back/ID evidence reference.
- Named approver, 24 h expiry and "requester only withdraws" live in the in-memory approvals store; a real store must make state transitions atomic.
- Audit entries (admin log): requested, approved/rejected/withdrawn/expired, effects applied, each with ticket and named approver; no secrets logged.

**Conflicts resolved by owner decision (SOD_MATRIX supersedes the prototype)**
- Open question 2 (requester may Reject own request): replaced by Withdraw-only.
- Open question 5 (any support or super can approve): approval is super only, named, not the requester.
- Open question 7 (no expiry, no cancel): 24 h expiry and Withdraw added.

**Open questions (new)**
1. `elevation.ts` only lets the `super` role elevate, so `support` can never satisfy `assertElevated`: in practice only super can raise or decide admin MFA resets. Matrix says requester "support or super (elevated)". Should support get a limited elevation?
2. The one seeded pending request (MR-108) gets a real approval record on first load with a fresh 24 h expiry, ticket `SUP-1042`, named approver Jordan Avery (demo only).
3. With two platform super admins only, the named approver list has one entry for a super requester.
