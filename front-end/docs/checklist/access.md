# Access (Phase 2)

| Source feature | Source lines | React file | Status | Notes |
|---|---|---|---|---|
| Segmented tabs Account inventory / Access requests / Access reviews (`ACCV`) | 2990, 2993-2994 | `components/modules/AccessModule.tsx` | Done | `useModState("access.view", "inventory")`; unknown stored values fall back to inventory |
| Header count tag (`n grants` / `n pending` / `n open`) | 3000-3002 | `AccessModule.tsx` | Done | |
| Account inventory table (status chip mapping Active / Review / Needs evidence + raw status) | 3000 | `access/GrantsTable.tsx` | Done | Shared with People > Access grants |
| Requests table (id, user, system, level, reason, status pill Approved / Rejected / Pending) | 3001 | `access/AccessRequests.tsx` | Done | |
| Empty state "No requests" / "No access requests are open." | 3001 | `AccessRequests.tsx` | Done | |
| Approve / Deny (pending only) -> wsLog `access.request.approved|denied`, toast `Request approved|denied` | 3001, 3006 | `AccessRequests.tsx`, `services/access.ts` | Done | Acts by request id (source used array index); only Pending can be decided |
| "Request access" button + modal (validation "System is required.", pushes to queue, switches to Requests) | 2995, 3004-3005 | reused `work/RequestModals.tsx` `AccessRequestForm`, `lib/requests.ts` | Done (reused) | No duplicate |
| Reviews view (cards, name/scope, In progress / Completed chip, `x/y reviewed` tag, per-account Keep / Revoke or decision chip) | 3002, 3009 | `access/AccessReviews.tsx` | Done | wsLog `access.review.decision`, no toast (as source) |
| Complete review (shown when all decided and Open) -> wsLog `access.review.completed`, toast "Review completed" | 3002, 3010 | `AccessReviews.tsx`, `services/access.ts` | Done | Log text `name, n revocations` |
| "Create access review" button + modal (validation "Review name is required.", scope default "All privileged accounts", help text, "Start review & freeze scope") | 2995, 3007-3008 | `access/ReviewForm.tsx`, `services/access.ts` | Done | Freezes `DATA.access` snapshot; wsLog `access.review.created`; toast "Access review started"; switches to Reviews; empty scope -> "All accounts" |
| Seed requests / reviews | 2991-2992 | `lib/requests.ts` (existing, via `data/accessSeed.json`) | Done | Names already anonymised |

## Open questions
1. Role gates: the source has **none** per action. Employee has module access (`ROLE_MODS`) and can therefore approve/deny requests (including their own), create reviews, decide reviews. Ported as-is; `canActOnAccess(role)` (= module access) is the single switch for a stricter policy (e.g. admin/owner only, not the requester).
2. "Revoke" and approved requests have no effect on `DATA.access` (inventory unchanged), as in the source. Revocations are only counted in the completion log line.
3. Review ids are `REV-` + random 3 digits (demo id); now regenerated if it collides. Request ids come from the shared form (`AR-` + length + 3), unchanged.
4. No confirmation for Deny, Revoke or Complete review (irreversible once completed); the source had none. Not added.
5. Reviewers can decide on their own account (e.g. the signed-in persona appears in the seeded review). Ported as-is.
6. The "Complete review" and decision flows show no toast for individual decisions (source: none).
7. Source toast for Deny is "Request denied"; the toast helper styles it as negative because of the word "denied" (shared behaviour of `toast`).

## Security notes
**UI-enforced (not a trust boundary):** module access via `ROLE_MODS` (access: super, admin, owner, employee), plus `canActOnAccess` (deny by default, read-only "Read-only" text instead of buttons, hidden "Create access review"). State transitions are guarded: only Pending requests, only Open reviews, only undecided accounts, and completion only when every account is decided; decisions are checked against the enum (`Approved|Denied`, `Keep|Revoke`). Free text through `clampText` (review name 120, scope 160) with `maxLength`; React text rendering only; the shared request form is reused untouched.

**Must be enforced by the real API:**
- Authorization per action (approve/deny, create/decide/complete review) from the authenticated session, not from the client role.
- Segregation of duties: the requester must not approve their own request; a reviewer must not certify their own access; high-privilege (Admin) requests need a second approver.
- Approving a request must provision access server-side and revoking in a review must actually remove it (the demo does neither); the frozen review scope must be stored server-side and be immutable.
- Review completion must be idempotent and irreversible server-side; every decision attributed to the authenticated actor with timestamp, in a tamper-evident audit store (client `wsLog` is a demo).
- Server-side validation of lengths/enums and rate limits; request/review ids generated server-side (`Math.random` ids here are demo-only).

**Insecure source behaviour and handling:** (1) No role/SoD gates: ported as-is and flagged, with a policy hook. (2) Source addressed requests/reviews by array index, which could hit the wrong row after list mutation; now addressed by id (reviews also by account index within the id) with status guards, without visible change. (3) Decisions on non-pending/closed items were possible via re-entrancy; now rejected with a generic message. (4) Raw exception text is never shown.
