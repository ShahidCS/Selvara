# Decisions

## Resolved by the owner (implemented; contract in `SOD_MATRIX.md`)
| # | Decision | Implementation |
|---|---|---|
| 1 | Risk acceptance: up to 15 without Board approval; above 15 needs Board approval evidence | `SOD.RISK_BOARD_THRESHOLD = 15`; evidence form (decision ref `BRD-YYYY-NN`, date, body, minutes ref, expiry <= 12 months), verified by a second person; acceptor != owner/editor/submitter; no close with open actions; updating imports need approval. See `checklist/risk.md` |
| 2 | Standard gates for privileged access | Platform super admins have no standing workspace access; every `/admin` mutation needs an elevated session (reason + ticket, 60 min max, audited). See `checklist/elevation.md` |
| 3 | MFA reset and policy edit/approve to standard practice | MFA reset: 3 identity checks, ticket, named second approver, requester can only withdraw, 24 h expiry. Policy: owner-only edit, new version per change, named approver != author, immutable approved versions, emergency changes need retrospective approval. See `checklist/mfa.md`, `checklist/policies.md` |
| 4 | Segregation of duties for banks / critical industries | Four-eyes engine (`lib/approvals.ts`) and per-module rules for risk, policy, evidence, controls, issues, audits, access, people, team, vendors, AI, Trust, questionnaires, assistant, API, reports, billing, rates. See `SOD_MATRIX.md` section 3 |
| 5 | Passwords per OWASP ASVS 2.1 and NIST 800-63B | 12-128 characters, no composition rules, Unicode and spaces allowed, breached/common/contextual password rejection, no rotation or history rules, no SMS/voice MFA. See `checklist/auth.md` |
| 6 | Rewrite git history to remove real names | Done (see SECURITY.md) |

## Still open (need an owner answer)
* **Risk appetite** stays 11 (display/watch threshold) while the acceptance threshold is 15. Should appetite move to 15?
* **Critical vendor onboarding** takes three people (initiator + two approvers) because the engine forbids the requester approving. Should the initiator count as the first approver?
* **Ladder semantics:** the lowest "Risk owner" authority for Low risks is read as an authority level, not the actor (the owner cannot accept their own risk).
* **Board evidence verifier:** admin or owner (not the risk owner). Admin only?
* **Staged risk imports:** approver sees file name and ids, not a field-level diff. Add a diff?
* **Finance:** is Void dual-control like a write-off? Tenant user role changes by one elevated super admin: second approver needed?
* **Policy approvals** are stored on the version record, not in the approvals queue (emergency exceptions use the queue). Route normal approvals through the queue too?
* **External auditors:** only the engagement lead can act (seed). Allow any auditor of the firm?
* **Trust request-access:** the board's exact rate-limit wording was not found; own wording used. Provide the text.
* **Questionnaires** can be sent at any progress (source). Require 100% first?
* **zxcvbn:** strength estimator is a simple heuristic; adding zxcvbn needs a new dependency.
* Product items from the spec boards: vendor tiers/cadence (4 vs 3), compliance status bands (85/75/65/50 vs 80/65/50), policy status names, role names (Member vs Employee), employee landing page, vendor question-set size and CAIQ/SIG mapping, `.xls` in the import picker.

## Backend (cannot be solved in the front-end)
Design for the server foundation (tenants, isolation, server-side rules, approvals, audit), with the decisions it needs: [BACKEND_FOUNDATION.md](BACKEND_FOUNDATION.md) (design accepted by the owner on 2026-11-18, all six decisions as recommended; security and compliance review pending).

Authentication/session/CSRF, server-side RBAC and tenant isolation, user-id based SoD (the demo compares names), server-persisted approvals and elevation records, rate limiting, upload scanning, real MFA and recovery codes, signed expiring links, server-side audit (HMAC/append-only), money arithmetic, trusted clock. See `SECURITY.md`.
