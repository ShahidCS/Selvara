# Decisions needed from the owner

Nothing below was changed in code. Details and board-vs-portal tables: `SPEC_BOARDS.md` and each `checklist/*.md` ("Conflicts to decide", "Open questions").

## Security-relevant (recommend deciding first)
| # | Topic | Portal today | Spec board / standard | Where |
|---|---|---|---|---|
| 1 | Risk acceptance authority | CISO can accept residual risk up to 19; appetite 11 | Committee/board from 15 | checklist/risk.md, SPEC_BOARDS 7 |
| 2 | Super admin standing access | `ws:"*"` for super; elevation screen exists but nothing is gated | No standing access to customer content; elevation required | checklist/elevation.md |
| 3 | MFA reset | One confirm checkbox; requester can reject own request | 3 identity checks, named second approver, ticket | checklist/mfa.md |
| 4 | Policy edit/approve | Any role with module access | Creator-only edit, named approver | checklist/policies.md |
| 5 | Separation of duties | None in source for risk acceptance, vendor approval, AI classification, agent runs, Trust "Verify" | Dual control | each module checklist |
| 6 | Password rules | Composition rules, ASCII-only, history 5, breach-check copy without a check | ASVS 2.1 / NIST 800-63B: length, Unicode, no composition, real breach check | checklist/auth.md |
| 7 | Risk re-import | Overwrites an existing risk id (source) | Could need approval | checklist/risk-import.md |
| 8 | Invite/link expiry | Mixed values across boards (24h / 72h / 7d / 14d) | Pick one | SPEC_BOARDS 11 |

## Product
* Risk appetite 15 (board) vs 11 (portal) and rating bands; vendor tiers/cadence (4 tiers vs 3); compliance status bands (85/75/65/50 vs 80/65/50); policy statuses; role names (Member vs Employee).
* Employee landing page (`/ws/me`?) and whether `employee` keeps its current five modules.
* `.xls` selectable in the import picker then rejected.
* Vendor question set size (12 / 41 / 6) and the real CAIQ/SIG mapping for prefill.

## Repository
* Git history of the first commits contains two real staff names (`docs/INVENTORY.md`). Rewriting history is not done.

## Backend (cannot be solved in the front-end)
Authentication/session/CSRF, server-side RBAC and tenant isolation, rate limiting, upload scanning, real MFA/recovery codes, signed expiring links, server-side audit (HMAC/append-only), money arithmetic. See `SECURITY.md`.
