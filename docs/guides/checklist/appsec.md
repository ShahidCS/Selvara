# Application Security Controls (route `/ws/appsec`, module `appsec`)

Read-only reference specification ported from the `appsec-controls-spec` board (SPEC_BOARDS section 9, build plan 9.4). Portal visual design kept. No logic, no persistence, no network. Draft content: needs review by qualified security staff before reliance.

| Board feature | React component / file | Status | Notes |
|---|---|---|---|
| Intro, "Core rule: the browser is untrusted" | `AppSecModule.tsx`, `data/appsecSpec.json` | Done | Copy verbatim |
| "What a response may contain": 8 never-send items | `appsec/ResponseCompare.tsx` | Done | Copy verbatim |
| Bad vs good login response, side by side | `appsec/ResponseCompare.tsx` | Done | Two `<pre>` blocks, text only. Board's sample identity (name/email, ids, tenant) replaced by bracketed placeholders; good response unchanged (`Cache-Control: no-store`, `__Host-mfa_pending`) |
| 9 control groups: threat, controls, "Maps to" (ASVS / API Top 10), "Test" | `appsec/ControlGroup.tsx` | Done | Collapsible (`aria-expanded`, `aria-controls`), Expand/Collapse all; all copy and mappings verbatim |
| Rate-limit table (7 endpoints) | `appsec/RateLimitTable.tsx` | Done | Values verbatim |
| Server-side permission matrix (13 actions x 5 roles) | `appsec/PermissionMatrix.tsx` | Done | `Table` + `Chip`; icon + text in every chip (colour not the only signal) |
| Release gate (8 items) | `appsec/ReleaseGate.tsx` | Done | DISPLAY-ONLY; one-sentence notice on the page; ticks are `useState`, never persisted, logged or exported |
| Section anchors | `AppSecModule.tsx` | Added | Buttons in a `nav` scroll to and focus the section (keyboard operable) |
| Search over groups (threat, controls, mappings, test) | `AppSecModule.tsx` | Added | Local `useState`, 80-char cap, results announced via `aria-live`; matching groups are shown expanded |
| Board "Sign-in demo / Super admin / Company view" tabs (9.G5) | none | Skipped | Prototype navigation only |
| Role gate | `AppSecModule.tsx`, `lib/rbac.ts` | Done | `modAllowed(role,"ws","appsec")`: admin and super via `*`, owner and auditor explicit; others get an "Access restricted" empty state (deny by default). AppShell also redirects |

## Conflicts to decide
The board is stricter than the portal in the places below. Portal behaviour was NOT changed. Almost all rows are backend requirements (the portal has no server).

| # | Topic | Board value | Portal value | Source |
|---|---|---|---|---|
| 1 | Password policy / breach check | Breached-password check at sign-up and change (group 3) | Resolved: min 12, up to 128, no composition rules, Unicode allowed, blocklist plus `checkBreached` service (mock local; real k-anonymity via backend) | `checklist/auth.md` |
| 2 | Sign-in lockout | 5 failures per 15 min then 15-min pause; bot check from the 3rd; IP 20/min, >50 distinct emails/hour blocks IP | No lockout, no counter, no bot check (demo gallery) | `checklist/auth.md` |
| 3 | MFA verification | Single use, 30-second window, 5 attempts per pending sign-in, 30/min per IP; pending sign-in cancelled | Not enforced; OTP field is a demo | `checklist/auth.md` |
| 4 | MFA reset approval | Identity check plus second approver, audited | Four-eyes in the admin console, name-based comparison; requester may Reject own request; Team console has no second approver for company admins (board-internal inconsistency too) | `checklist/mfa.md`, `checklist/team.md` |
| 5 | Password reset | Token 256-bit, hashed, single use, 15-minute expiry, older tokens invalidated, sessions revoked | Generic acknowledgement, demo link stands in for the token; MFA before new password; real token handling is server-side | `checklist/auth.md` (OQ 2) |
| 6 | Session timeouts | "Idle and absolute timeouts" (no numbers); `__Host-` cookie, Secure, HttpOnly, SameSite=Strict; CSRF token plus Origin/Referer checks | No session, no timeout, no CSRF protection (`apiFetch` uses `credentials: "include"` for later). Team baseline lists "Screen lock within 5 minutes" (a device rule, not a session timeout). Other boards state 15/30/60 min idle | `SECURITY.md`, `teamSeed.json` |
| 7 | Invite link lifetime | Single use, 72 h fixed, 10/hour per IP | Team console copy offers 24 h / 72 h / 7 d (per SPEC_BOARDS 11.2); no token is generated | `checklist/team.md` |
| 8 | Authenticated API / exports limits | 600/min per session, 1,200/min per IP, exports 10/hour | No rate limiting; API keys have no per-key limit | `checklist/api.md` |
| 9 | Referrer-Policy | `strict-origin` | `strict-origin-when-cross-origin` in `next.config.js` | SPEC_BOARDS 9.3 |
| 10 | CSP | CSP against XSS | `script-src 'unsafe-inline'` (nonce CSP planned) | `SECURITY.md` limitation 3 |
| 11 | Auditor and company audit log | Auditor may view company audit log | `auditor` role has no `auditlog` module | `ROLE_MODS`, SPEC_BOARDS 9.3 |
| 12 | Super admin reach | No policy view, no other-tenant data without customer-approved grant | `ws: "*"` wildcard | SPEC_BOARDS 9.3 |
| 13 | Policy edit / approve | Creator-only edit; only a named approver approves | Open to the module's roles | SPEC_BOARDS 9.3 |
| 14 | Member remarks / policy view | Member views policies, remarks if invited | Employee has Overview, Work, Policies, Access, Questionnaires; remarks not modelled | SPEC_BOARDS 9.3 |

## Open questions
1. Route/space: ships as `/ws/appsec` (nav and `ROLE_MODS` already wired, label "Security Controls"). The board plan suggested `/ws/security-spec` or `/admin/security-spec`; confirm.
2. Release gate: kept display-only. Persisting ticks as evidence needs an owner decision (who signs, audit trail, immutability).
3. Role names: matrix columns use the board's names (Super admin, Company admin, Policy owner, Member, Auditor), not portal role ids; a mapping table is planned in `checklist/shell.md`.
4. `/auth` should get a "See Application Security Controls" link. Out of scope here (another module owns `/auth`); also suggested for the `/admin/customers` security panel.
5. Absolute session timeout and invite expiry have no agreed figures (see conflicts 6 and 7).
6. The board's bad-response sample used a real-looking identity and numeric ids; replaced with placeholders. Confirm no more specific example is wanted.
7. Rate-limit numbers are labelled "starting values" by the board; confirm who owns tuning after launch.

## Security notes
* Static content from `src/data/appsecSpec.json`; rendered as React text only (no `dangerouslySetInnerHTML`, no links from data, no `fetch`, no storage). Example responses are `<pre>` text with placeholders; they contain no secrets, tokens or identities.
* The page is informational. Nothing here is a control: the role gate is UI-only and must be mirrored by the API (ASVS 4.1.1). Role gate denies by default.
* Release-gate ticks are in-memory component state, not persisted, not logged to `wsLog`, not exported, and the page says they are not evidence.
* Search input is capped (80 chars) and only used for case-insensitive substring matching on static strings.
* Every stricter-than-portal requirement is a backend build item; tracking them as front-end gaps would be misleading (see SPEC_BOARDS 9.3).
