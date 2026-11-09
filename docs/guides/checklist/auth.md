# Sign-in & Security gallery (Phase 3) — `/auth`

DEMO gallery: no backend, no session. Nothing typed here is sent, stored, logged or placed in a URL.

| Source feature | Source lines | React file | Status | Notes |
|---|---|---|---|---|
| Page shell, "Preview" tag, tabbed card (Sign in / Create account / Set password / MFA enrollment / Reset password) | 2093-2104 | `AuthModule.tsx` | Done | `role=tablist/tab/tabpanel`, `aria-controls`, roving `tabindex` (first tab when on challenge/resetpw), `aria-labelledby` or `aria-label` on the panel exactly as source |
| Tab keyboard (Arrow keys wrap, Home, End) | 2106 | `AuthModule.tsx` (`tabKey`) | Done | Focus follows to the tab like `authGo` |
| `authGo` (reset MFA pick when leaving MFA, focus tab) | 2105 | `AuthModule.tsx` (`go`) | Done | Each panel is keyed by view: state is dropped on every view change |
| Show/hide password toggle (`aria-label` Show/Hide password, `.on`) | 2107-2108 | `auth/AuthFields.tsx` (`PwField`) | Done | Added `aria-pressed` |
| Email field with live indicator (ok/bad icon, `aria-invalid`, messages "Enter your work email address." / "Enter a valid email address (e.g. name@company.example).") | 2109, 2112-2120 | `auth/AuthFields.tsx` (`EmailField`), `auth/authLogic.ts` (`emailState`) | Done | `force` after failed submit, cleared on next input (matches source) |
| Error paragraph helper (`authErr`, `authErrP`) | 2110-2111 | `auth/AuthFields.tsx` (`ErrP`) | Done | `role=alert`, toggled by `display` |
| Live rule list (length, not breached/common, no name/email/company), advisory strength meter | 2121-2140 (replaced) | `auth/AuthPanels.tsx` (`SetPassword`), `authLogic.ts` (`pwState`), `lib/credentials.ts` | Done | Replaces the composition checklist. Visually-hidden "Met:/Not met:" text; one polite `role=status` announcement ("Still needed: ...") that changes only when the unmet set changes. Meter is labelled "Strength (advice only)" |
| Sign in (email regex, "Enter your password.", toast "Password verified — one more step", focus OTP) | 2142-2145, 2164-2172 | `AuthPanels.tsx` (`SignIn`) | Done | Nothing is verified; passkey button toast |
| Two-factor challenge (`^\d{6}$`, error copy, toast "Signed in successfully", backup code toast, back link) | 2146, 2173-2179 | `AuthPanels.tsx` (`Challenge`) | Done | `autoComplete=one-time-code`, `inputMode=numeric` |
| Create account (name, read-only invited email, Continue -> Set password) | 2180-2185 | `AuthPanels.tsx` (`Create`) | Done | Name is discarded, as in source |
| Set password (-> MFA) / Set new password (-> Sign in); validation order and messages | 2147-2153, 2186-2196 | `AuthPanels.tsx` (`SetPassword`), `authLogic.ts` (`pwSubmitError`) | Done | Toasts "Password set" / "Password updated" |
| MFA enrollment: method picker (`aria-pressed`), passkey (recommended), TOTP (QR placeholder, 6-digit verify), 10 single-use recovery codes shown once. SMS and voice removed | 2141, 2154-2155, 2197-2206 | `AuthPanels.tsx` (`Mfa`, `Totp`, `RecoveryCodes`) | Done | QR is the source's static CSS pattern (no secret). Focus moves to first form input / primary button after picking |
| Reset password (generic "If that account exists, we have sent instructions", 15-minute single-use link copy, demo link -> new password -> MFA code -> sign in) | 2156-2158, 2207-2212 | `AuthPanels.tsx` (`Reset`, `SetPassword` stage "mfa") | Done | Same response for any email. MFA is required before the new password is accepted; toast states all sessions were revoked and the user notified |
| Card footer "Preview of the hosted sign-in experience…" and brand block | 2161-2162 | `AuthPanels.tsx` (`AuthCard`) | Done | |

## Open questions
1. View state (`AUTHV`) was a module-level global in the source (survives navigation, even on "challenge"). Here it is component state and resets to "Sign in" on return. Intentional: avoids restoring a "password verified" screen.
2. The demo "Open the reset link" button stands in for the emailed single-use token link. The reset-password panel has no email context, so the "contains your email" rule is not applied there (the server knows the account and must apply it).
7. Demo sign-in verifies nothing, so the 5-failed-attempts lockout is only simulated on the MFA code step (generic throttled message). Static sign-in copy states the rule.
8. Team Settings had no password-policy section; one was added (`team/CredentialPolicy.tsx`, mounted in `SettingsTab.tsx`). Min length is held in memory (mock) only.
3. Create-account name field is never carried to later steps; email is a fixed placeholder.
4. Breach check: mock mode uses the local blocklist (`src/data/commonPasswords.json`, synthetic-safe public weak passwords). Real mode must serve `GET /auth/password/breach-range/{5-hex-prefix}` (see below).
5. `authEmailCheck` regex `^[^@\s]+@[^@\s]+\.[^@\s]+$` is permissive (accepts `a@b.c`); kept.
6. Success paths only toast ("Signed in successfully", "MFA enrolled — account ready"); no navigation.

## Security notes
**Handling:** no password/OTP/phone/email value leaves component state (no network, no `localStorage`, no `console`, no URL, no `wsLog`). Passwords use `type=password` (toggle to `text` is per-field state, reset on unmount), `autoComplete` `current-password` / `new-password`, `one-time-code` for OTP, paste allowed, `spellCheck=false`, `autoCapitalize/autoCorrect=off`. Panels are keyed per view, so credentials are discarded on tab switch and unmount. MFA QR is a static decorative pattern, no secret is generated or displayed.

**Credential policy (OWASP ASVS v4 2.1, NIST SP 800-63B; contract `docs/security/SOD_MATRIX.md` section 6). Old vs new:**

| Topic | Old (ported from source) | New |
|---|---|---|
| Length | min 12, UI cap 128 by `maxLength` (silent truncation of pastes) | min 12 (hard error), max 128 accepted, no truncation: over-long values get an error. Copy: "at least 12, up to 128 characters" (V2.1.1, 2.1.2) |
| Composition | upper + lower + number + special required (V2.1.9 deviation) | none |
| Characters | ASCII-only allow-list (V2.1.11 deviation) | all Unicode, spaces and passphrases; NFKC-normalised before checks |
| Breached / common | only claimed in copy | blocklist in mock (`checkPassword`), `checkBreached` service (k-anonymity via backend in real mode) (V2.1.7) |
| Context words | none | rejects email local part, name parts, company (>= 4 chars, look-alike spellings folded) |
| Repeats / sequences | none | rejects repeated character, short repeating patterns, runs such as `abcdefgh1234`, `123456789012`, keyboard rows |
| Strength meter | met/5 of the composition checklist | advisory estimate (Weak / Fair / Good / Strong) from length, variety, blocklist hits; never a checklist |
| History / expiry | platform page listed "last 5 passwords cannot be reused" | none; change only on evidence of compromise (V2.1.10) |
| Paste / managers / toggle | compliant | unchanged; `autoComplete` new-password / current-password; no hints or security questions |
| MFA methods | passkey, TOTP, SMS | passkey / security key (recommended), TOTP. SMS and voice removed |
| Recovery codes | none shown | 10 single-use codes, shown once, cleared from state when dismissed |
| Reset | jumps to new password; 30-minute token copy | generic acknowledgement, single-use token <= 15 min, MFA before new password, sessions revoked, user notified |
| Lockout | none | 5 failed attempts -> generic throttled message (no enumeration) |
| Session copy | per tenant | idle 15 min privileged / 30 min otherwise, absolute 12 h, step-up for sensitive actions |

**Remaining deviations from ASVS 2.1 / NIST 800-63B in the UI: none expected.** The advisory estimator is intentionally simple (not zxcvbn); the server remains authoritative.

**What the real server must enforce (the UI checks are advisory UX, never the control):**
- Re-run every rule on the received password: NFKC normalise, 12-128 length, no composition rules, blocklist, context rule using the account's real email/name/company, sequence/repeat rule.
- Breach check server-side with a k-anonymity range API (hash prefix only to the third party, never the password or full hash). The client calls `GET /auth/password/breach-range/{5-hex-prefix}` on OUR backend only, which proxies and returns `{ suffixes: string[] }` (padded responses recommended).
- Hash with Argon2id (or bcrypt / scrypt) with per-user salt, pepper in an HSM/KMS; rehash on cost upgrades. Never store, log or echo the password, its length or the previous passwords; no history table.
- Rate limits and throttling: per account, IP and device; lockout/slow after 5 failures with identical status, body and timing for existing and unknown accounts (dummy hash for unknown emails).
- Reset tokens: 256-bit random, stored hashed, single use, <= 15 minutes, bound to one account, older tokens voided on new request; generic "If that account exists..." response; MFA before accepting the new password; revoke all sessions after reset; notify the user (email) of the change.
- MFA: enforce enrolment before a session is granted; no SMS/voice; TOTP secret generated and stored server-side; recovery codes generated server-side (10, hashed, single use, shown once).
- Sessions: idle 15 min for privileged roles / 30 min otherwise, 12 h absolute, step-up for sensitive actions, cookies `__Host-` `HttpOnly; Secure; SameSite`.
- Tenant setting `PUT /settings/credential-policy` accepts only `minLength` (integer 12-128); breach check and MFA are not configurable.

**UI-only vs API requirements:** everything here is presentation. A real implementation must: verify credentials, hash with Argon2id/bcrypt server-side, rate-limit / lock out (ASVS 2.2.1), return identical responses for existing and unknown accounts (no enumeration), issue single-use, expiring, hashed reset tokens delivered by email, enrol and verify TOTP/passkeys server-side (TOTP secret generated and stored server-side, never client-side), store recovery codes hashed, require MFA enrolment server-side before granting a session, set session cookies `HttpOnly; Secure; SameSite`, protect against CSRF, and write auth events to the audit log.
