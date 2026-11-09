# Platform Security (`/admin/security`, key `security`)

Source: board `super-admin-console`, Platform security tab; `docs/architecture/SPEC_BOARDS.md` 8.G7.

| Source feature | Board ref | React file | Status | Notes |
|---|---|---|---|---|
| "Password baseline (all tenants)" list (7 rules, ASVS 2.1 / NIST 800-63B: no composition, history or expiry; SMS/voice not offered; 15-minute reset token; idle 15/30 min) | `pwdRules` | `admin/PlatformSecurity.tsx` `PWD_RULES` | Done | Copy verbatim |
| "Authentication & sessions" list (7 rules) | `authRules` | `PlatformSecurity.tsx` `AUTH_RULES` | Done | Copy verbatim |
| "Privileged access (this console)" list (6 rules) | `privRules` | `PlatformSecurity.tsx` `PRIV_RULES` | Done | Copy verbatim |
| Link "Try the live password check" | board `Auth.dc.html` | `PlatformSecurity.tsx` | Done | -> `/auth` |
| Link "Full application security controls spec" | board `Security.dc.html` | `PlatformSecurity.tsx` | Done | -> `/ws/appsec`; shown as plain text when the role cannot open that module (support) |
| Session banner on the page | 8.4 | `admin/ElevationBanner.tsx` | Done | Same banner as the elevation page |
| Role gate | 8.4 | `PlatformSecurityModule.tsx` | Done | `modAllowed(role,"admin","security")`; super via `*`, support has the module |

## Open questions
1. Rules are static copy; confirm they match the real policy (for example password baseline versus `auth.md` rules and the AppSec spec).
2. Check marks mean "policy states this", not "verified live"; no compliance status is computed.

## Conflicts to decide
See `docs/guides/checklist/elevation.md` (standing access vs elevation, support grants, MFA-reset strictness). The "Privileged access" list states rules the portal does not yet enforce: hardware key, allow-listed networks, SIEM streaming, MFA reset checks, no standing access to customer content.

## Security notes
* Read-only page: no setting can be changed from the UI; nothing is stored.
* The lists describe server-enforced policy; the portal front end enforces none of them. Do not read this page as evidence of control.
* All text is static React text; no HTML from strings, internal links only via `useGo`.

## Changes vs prototype (owner decision, docs/security/SOD_MATRIX.md sections 2 and 3)
* "Privileged access (this console)" list now states the enforced model: elevation for every change (reason 15+ characters, ticket, 60 minutes), super admins admin-space only, support never elevates or approves, dual control for finance above USD 1,000, all write-offs and rate overrides, and customer-approved support grants as the only route to customer content.
* The page remains read-only and informational; the elevation banner above it is the same component as on Elevated Access.

## Open questions (added)
3. "Password baseline" and "Authentication & sessions" copy still describes composition rules, last-5 reuse and 30-minute reset links, which conflicts with SOD_MATRIX section 6 (no composition rules, no password history, reset token <= 15 min). Left unchanged (credential policy is outside this scope); needs the owner/auth module.

## Security notes (added)
* Landing: `landingPath` in `lib/rbac.ts` sends `super`/`super2` to `/admin/overview` (admin `*` makes `overview` allowed there) instead of `/admin/customers`; reported to the lead, not edited.
