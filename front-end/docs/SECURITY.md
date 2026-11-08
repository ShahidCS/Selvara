# Security notes (front-end)

Status: living document. Generated code needs technical, security and management review before any deployment.

## Controls in place (ASVS v4 mapping)
| Area | Control | Where |
|---|---|---|
| V5.3 output encoding / XSS | React text rendering only; no `dangerouslySetInnerHTML`/`eval`; generated documents escape values with `esc()` | all modules, `lib/boardPack.ts` |
| V5.1.5 / 5.3.6 | `safeHref` allows only http(s)/mailto/in-app paths | `lib/security.ts` |
| V12 files | `validateUpload` (ext allow-list, size), `safeFileName` | `lib/security.ts` |
| CSV injection | `csvCell` prefixes `= + - @ tab CR` | `lib/format.ts` |
| V14 headers | CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, COOP, HSTS | `next.config.js` |
| V8.2 client storage | Only role/theme/collapsed UI preferences in localStorage | `lib/store.ts` |
| V7 logging | Hash-chained workspace log (tamper-evidence demo) | `lib/audit.ts` |
| Dialog a11y / focus | Focus trap, Escape, focus restore | `LayerProvider.tsx` |

## Known limitations (need server-side or follow-up work)
1. **RBAC is UI-only.** Role switching and module access are a demo. A real API must enforce authorization (ASVS 4.1.1); the UI must never be the only control.
2. **No authentication/session.** `apiFetch` uses `credentials: "include"` for a future cookie session. CSRF protection (SameSite cookies + anti-CSRF token) must be added server-side when sessions exist (ASVS 4.2.2, 3.4).
3. **CSP uses `script-src 'unsafe-inline'`** because the Pages Router injects inline bootstrap scripts. Move to a nonce-based CSP via middleware before production.
4. **Audit log hash is FNV-1a**, a demo of chaining, not a cryptographic control. Use server-side HMAC/append-only storage in production.
5. **`Math.random` ids** appear in demo flows (ported from the prototype); they are not security tokens.

Per-module "Security notes" live in `docs/checklist/<module>.md`.

## Test log
### Phase 2 review (local build, owner-authorized)
* **Dependencies:** `npm audit --omit=dev` reported 1 critical + 1 high on Next 14.2.35 (last 14.x). Upgraded to Next 16.4.5 / React 19: **0 vulnerabilities**. Build, type-check and UI smoke tests pass.
* **Static review:** no `dangerouslySetInnerHTML`, `innerHTML`, `document.write`, `eval`, `new Function`; no `href`/`src` from data without `safeHref`; no `target=_blank` without `noopener`; client storage limited to role/theme/collapsed; no `console.*` of record data.
* **Active testing (pentest methodology, `http://localhost`, mock data):** 112 logged payload attempts (HTML/SVG/`javascript:`/template/CSV-formula payloads) in URL params, hash, query and every create/edit form in Work, Issues, Frameworks, Evidence, Policies, People and Controls, then re-visited all pages: no script execution, no injected elements, no dialogs. CSV gap export: no unguarded formula cells. Unknown ids (`/ws/audits/<payload>`) render "Page not found".
* **Config:** dotfiles, `package.json`, `src/*`, `next.config.js` and source maps return 404/absent; TRACE/PUT/DELETE/OPTIONS return 405; CSP, nosniff, frame-ancestors none, HSTS, Permissions-Policy present on pages and static assets; no server banner.
* **Fixed during review:** board-pack export opened a tab *and* downloaded (a `noopener` feature makes `window.open` return null); MFA reset had no audit entry (source gap), now logs `person.mfa.reset`; real staff names removed from docs and from `scripts/anonymize.js` (map now supplied locally via `ANON_MAP`).
* **Not covered (needs a real backend):** authentication, session, CSRF, server-side authorization/IDOR, rate limiting, upload scanning. See "Known limitations".
* **History note:** commits before this one contain real staff names in `docs/INVENTORY.md`. Rewriting git history is a user decision (not done).

### Phase 3 review (local build, owner-authorized)
* **Static:** no HTML/script sinks, no unsafe links, no client storage beyond UI preferences, no `console.*`; secure random (`crypto.getRandomValues`) for demo keys/secrets; remaining `Math.random` uses are demo ids/sizes only.
* **Import wizard (untrusted files):** hostile CSV (formula cells, `<img onerror>`, out-of-range scores) parsed as text, no execution; 6,000-row file, forged `.xlsx`, and `.html` upload rejected with generic messages. Limits: 5 MB, 5,000 rows, 100 columns, zip entry/size caps enforced on inflated bytes.
* **Webhooks (SSRF hygiene):** http, 127.0.0.1, localhost, 169.254.169.254, 10/8, `javascript:`, credentials-in-URL, IPv6 literal and decimal-IP URLs rejected; a public https URL accepted. UI-side only: the server must resolve, pin and re-check the destination at delivery time and refuse redirects.
* **Assistant / Trust chatbot:** injected prompts render as text; replies are draft-only and never act. If replaced by an LLM it must answer only from the published verified corpus and treat input as untrusted.
* **Auth gallery:** demo only; no password/OTP stored, logged or sent; correct `autocomplete`; documented deviations from ASVS 2.1 (composition rules, ASCII-only, breach-check copy without a check) in `checklist/auth.md`.
* **Open decisions:** re-import overwriting an existing risk id (source behaviour); `.xls` selectable then rejected; no separation of duties on risk acceptance / vendor approval / AI confirmation in the source (UI-only gates, API must enforce).
* **Data policy:** repo-wide scan for the replaced real names and the company name returns 0 matches in the working tree (git history of the first commits still has two names).

### Phase 4 review (local build, owner-authorized)
* **Routes:** `/ws/auditlog` and `/admin/{customers,billing,billing/<id>,rates,mfa,adminlog}` render; unknown billing id shows the not-found state; Platform Support is redirected from `/ws/risk` to `/admin/customers` (module RBAC enforced).
* **Injection:** 3 payload classes (HTML/SVG/CSV-formula) through the customer search and every admin modal field, then re-visited all admin pages: no execution, no injected elements, no dialogs (166 logged attempts in total for the engagement).
* **Audit integrity:** admin chain is append-only in the UI (no edit/delete), chain-verify view states it is a demo (FNV-1a). AI decisions, audit-report export and incident start now write to the admin chain as in the source.
* **MFA reset (account-takeover vector):** four-eyes enforced in UI and service (requester cannot approve; only Pending can be decided). Known limits: name-based comparison; requester may Reject own request (source behaviour). Real API must add step-up auth, out-of-band verification, server-side dual control with user ids.
* **Data policy:** repo scan for replaced names/company name: 0 matches after fixing a seed file (`tenantUsers.json`) and its derived email.
