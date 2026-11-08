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
