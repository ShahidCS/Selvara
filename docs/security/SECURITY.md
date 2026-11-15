# Security notes (front-end)

Status: living document. Generated code needs technical, security and management review before any deployment.

> **The full control register, with standards, audit events and test evidence, is [CONTROLS.md](CONTROLS.md).** This page keeps the front-end notes and the review log.

## Controls in place (ASVS v4 mapping)
| Area | Control | Where |
|---|---|---|
| V5.3 output encoding / XSS | React text rendering only; no `dangerouslySetInnerHTML`/`eval`; generated documents escape values with `esc()` | all modules, `features/overview/lib/boardPack.ts` |
| V5.1.5 / 5.3.6 | `safeHref` allows only http(s)/mailto/in-app paths | `lib/security.ts` |
| V12 files | `validateUpload` (ext allow-list, size), `safeFileName` | `lib/security.ts` |
| CSV injection | `csvCell` prefixes `= + - @ tab CR` | `lib/format.ts` |
| V14 headers | CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, COOP, HSTS | `next.config.js` |
| V8.2 client storage | Only role/theme/collapsed UI preferences in localStorage | `lib/store.ts` |
| V7 logging | Hash-chained workspace log (tamper-evidence demo) | `lib/audit.ts` |
| Dialog a11y / focus | Focus trap, Escape, focus restore | `LayerProvider.tsx` |

## Known limitations (need server-side or follow-up work)
1. **RBAC is UI-only.** In the demonstration build, sign-in and MFA (`src/lib/session.ts`, `src/lib/totp.ts`: synthetic demo accounts, real accounts with TOTP, all kept in browser storage) and module access are a demo. Production (`NEXT_PUBLIC_API_MODE=http`) has no demo accounts and calls the server (`src/services/authApi.ts`, contract in CONTROLS.md). A real API must authenticate (server-side sessions, a slow password hash such as Argon2id, rate limits, MFA) and enforce authorization (ASVS 4.1.1); the UI must never be the only control.
2. **No authentication/session.** `apiFetch` uses `credentials: "include"` for a future cookie session. CSRF protection (SameSite cookies + anti-CSRF token) must be added server-side when sessions exist (ASVS 4.2.2, 3.4).
3. **CSP uses `script-src 'unsafe-inline'`** because the Pages Router injects inline bootstrap scripts. Move to a nonce-based CSP via middleware before production.
4. **Audit log hash is FNV-1a**, a demo of chaining, not a cryptographic control. Use server-side HMAC/append-only storage in production.
5. **`Math.random` ids** appear in demo flows (ported from the prototype); they are not security tokens.

Per-module "Security notes" live in `docs/guides/checklist/<module>.md`.

## Test log
### Phase 2 review (local build, owner-authorized)
* **Dependencies:** `npm audit --omit=dev` reported 1 critical + 1 high on Next 14.2.35 (last 14.x). Upgraded to Next 16.4.5 / React 19: **0 vulnerabilities**. Build, type-check and UI smoke tests pass.
* **Static review:** no `dangerouslySetInnerHTML`, `innerHTML`, `document.write`, `eval`, `new Function`; no `href`/`src` from data without `safeHref`; no `target=_blank` without `noopener`; client storage limited to role/theme/collapsed; no `console.*` of record data.
* **Active testing (pentest methodology, `http://localhost`, mock data):** 112 logged payload attempts (HTML/SVG/`javascript:`/template/CSV-formula payloads) in URL params, hash, query and every create/edit form in Work, Issues, Frameworks, Evidence, Policies, People and Controls, then re-visited all pages: no script execution, no injected elements, no dialogs. CSV gap export: no unguarded formula cells. Unknown ids (`/ws/audits/<payload>`) render "Page not found".
* **Config:** dotfiles, `package.json`, `src/*`, `next.config.js` and source maps return 404/absent; TRACE/PUT/DELETE/OPTIONS return 405; CSP, nosniff, frame-ancestors none, HSTS, Permissions-Policy present on pages and static assets; no server banner.
* **Fixed during review:** board-pack export opened a tab *and* downloaded (a `noopener` feature makes `window.open` return null); MFA reset had no audit entry (source gap), now logs `person.mfa.reset`; real staff names removed from docs and from `scripts/anonymize.js` (map now supplied locally via `ANON_MAP`).
* **Not covered (needs a real backend):** authentication, session, CSRF, server-side authorization/IDOR, rate limiting, upload scanning. See "Known limitations".
* **History note:** commits before this one contain real staff names in `docs/architecture/INVENTORY.md`. Rewriting git history is a user decision (not done).

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

### Phase 5 review (local build, owner-authorized)
* **Vendor portal (external, standalone):** no app chrome, `noindex`; unknown/invalid emails get fixed wording; attempt limits lock the form; OTP input `one-time-code`/numeric; email/code never in URL, storage, network or logs (masked address only); evidence upload rejects `.exe` and >25 MiB, prefill rejects non-xlsx/csv; hostile text renders inert. Demo OTP/MFA/scan are stubs; the real server must enforce token entropy/expiry, rate limits, enumeration-safe timing, MFA, no-store, malware scan, object-level authorization.
* **Elevation:** in-memory simulation, super-only, audited (`admin.elevated/ended/expired`); not a control.
* **RBAC checks:** employee redirected away from `/ws/appsec`, allowed `/ws/me`; support cannot request elevation, can read Platform Security.
* **Final regression:** 35 routes render with no console errors or dialogs; `npm audit --omit=dev`: 0 vulnerabilities; name scan: 0 matches.

## Credential policy
Follows OWASP ASVS v4 section 2.1 and NIST SP 800-63B (contract: `docs/security/SOD_MATRIX.md` section 6; code: `src/lib/credentials.ts`, `src/services/auth.ts`, `src/data/commonPasswords.json`; sign-in gallery `/auth`; read-only policy in Team settings).
- Length 12 to 128 characters (no truncation). No composition rules; all Unicode, spaces and passphrases allowed; NFKC normalisation. Paste and password managers allowed, show/hide toggle, no hints or security questions.
- Rejected: common/breached passwords (`checkBreached`: mock = local blocklist, real = k-anonymity range lookup through our backend; the browser never sends the password or its full hash to a third party), values containing the email local part, name or company (>= 4 chars), repeated characters and simple sequences.
- No periodic expiry and no history rule; change only on evidence of compromise. Strength feedback is advisory.
- MFA mandatory (passkey/security key recommended, TOTP allowed; no SMS or voice); 10 single-use recovery codes shown once.
- 5 failed sign-ins trigger throttling with a generic message. Reset: generic response, single-use token <= 15 minutes, MFA before the new password, all sessions revoked, user notified. Sessions: idle 15 min (privileged) / 30 min, absolute 12 h, step-up for sensitive actions.
- Passwords are held only in component state, cleared on completion and unmount, never logged (nor their length), stored or put in URLs.

Server requirements (the UI is not the control): re-enforce every rule server-side; hash with Argon2id/bcrypt/scrypt (salt, pepper); server-side breach API; rate limits with identical responses for known and unknown accounts; hashed single-use reset tokens; server-side MFA enrolment and recovery-code generation; session revocation on reset. Details: `docs/guides/checklist/auth.md`.

### Hardening review (segregation of duties, privileged access, credentials)
* **Contract:** `docs/security/SOD_MATRIX.md`. Shared helpers `lib/sod.ts`, `lib/approvals.ts`, services throw `SodError` (deny by default) and the UI shows the reason on disabled controls.
* **Access matrix test:** 12 personas x 32 routes (384 checks): 0 mismatches against `roles.json`.
* **Privileged access test:** super admin lands on `/admin/customers`, is redirected from every `/ws/*` route; admin mutation controls are locked until an elevated session (short reason / missing or malformed ticket rejected; valid reason + ticket starts the session); controls unlock after elevation; the second super admin is not elevated by the first; support cannot approve MFA resets; the seeded request can be approved by an elevated super admin who is not the requester.
* **Workspace checks:** employee has no enabled approve/publish/decide controls on Policies and Access; auditor is read-only on Audits and Policies; employee cannot open Risk.
* **Credential policy test (live UI):** 11 characters, "Password123!" and repeated characters rejected; 12-character passphrase with spaces and a Cyrillic passphrase accepted.
* **Service-level checks (by the implementing agents, scripted):** risk boundary 15 accepts / 16 needs evidence (19 checks), about 45 allow/deny cases for governance modules, self-approval and blocklist/rate-limit cases for third-party modules.
* **Regression:** 35 routes render with no console errors; injection payloads as Company Admin: no execution; `npm audit --omit=dev`: 0 vulnerabilities.
* **Limits:** SoD compares display names in the demo; the API must compare stable user ids, persist approvals/elevation/audit server-side, and use a trusted clock.
* **History:** git history rewritten to replace real names with synthetic ones (old commit ids may remain cached on the hosting service until it garbage-collects; request a purge from the host if required).

## Supply chain and pipeline (see PIPELINE.md)
* All GitHub Actions are pinned to full commit SHAs and checked against upstream tags; dependency install scripts never run in CI; the deploy token is environment-scoped and visible only to the steps that use it.
* Gates on every pull request: CodeQL, Gitleaks, dependency review, licence policy, Trivy, ZAP baseline, `npm audit`; High and Critical block. Releases require a signed tag, produce an SBOM, build-provenance attestation and signature, and deploy the attested archive.
* Accepted risks (Vercel CLI transitive advisories, CSP `unsafe-inline`, LGPL optional binaries, public Sigstore log) are recorded with owners and review triggers in `docs/security/PIPELINE.md`.
