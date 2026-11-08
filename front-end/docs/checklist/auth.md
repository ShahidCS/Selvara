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
| Live requirement checklist, strength meter (met/5), "not allowed" warning | 2121-2140 | `auth/AuthPanels.tsx` (`SetPassword`), `authLogic.ts` (`pwChecks`, `REQS`) | Done | Copy verbatim. Added visually-hidden "Met:/Not met:" text so state is not colour-only |
| Sign in (email regex, "Enter your password.", toast "Password verified — one more step", focus OTP) | 2142-2145, 2164-2172 | `AuthPanels.tsx` (`SignIn`) | Done | Nothing is verified; passkey button toast |
| Two-factor challenge (`^\d{6}$`, error copy, toast "Signed in successfully", backup code toast, back link) | 2146, 2173-2179 | `AuthPanels.tsx` (`Challenge`) | Done | `autoComplete=one-time-code`, `inputMode=numeric` |
| Create account (name, read-only invited email, Continue -> Set password) | 2180-2185 | `AuthPanels.tsx` (`Create`) | Done | Name is discarded, as in source |
| Set password (-> MFA) / Set new password (-> Sign in); validation order and messages | 2147-2153, 2186-2196 | `AuthPanels.tsx` (`SetPassword`), `authLogic.ts` (`pwSubmitError`) | Done | Toasts "Password set" / "Password updated" |
| MFA enrollment: method picker (`aria-pressed`), TOTP (QR placeholder, 6-digit verify), passkey, SMS (>= 7 digits) | 2141, 2154-2155, 2197-2206 | `AuthPanels.tsx` (`Mfa`, `Totp`, `Sms`) | Done | QR is the source's static CSS pattern (no secret). Focus moves to first form input / primary button after picking |
| Reset password (email regex, toast "Reset link sent (demo)", go to Set new password) | 2156-2158, 2207-2212 | `AuthPanels.tsx` (`Reset`) | Done | |
| Card footer "Preview of the hosted sign-in experience…" and brand block | 2161-2162 | `AuthPanels.tsx` (`AuthCard`) | Done | |

## Open questions
1. View state (`AUTHV`) was a module-level global in the source (survives navigation, even on "challenge"). Here it is component state and resets to "Sign in" on return. Intentional: avoids restoring a "password verified" screen.
2. "Reset password" jumps straight to "Set a new password" without any link/token step (source behaviour). A real flow is token-gated.
3. Create-account name field is never carried to later steps; email is a fixed placeholder.
4. Copy on "Set your password" says "We also check it against breach lists" but nothing is checked (no backend). Needs a real breached-password check (k-anonymity range API server-side).
5. `authEmailCheck` regex `^[^@\s]+@[^@\s]+\.[^@\s]+$` is permissive (accepts `a@b.c`); kept.
6. Success paths only toast ("Signed in successfully", "MFA enrolled — account ready"); no navigation.

## Security notes
**Handling:** no password/OTP/phone/email value leaves component state (no network, no `localStorage`, no `console`, no URL, no `wsLog`). Passwords use `type=password` (toggle to `text` is per-field state, reset on unmount), `autoComplete` `current-password` / `new-password`, `one-time-code` for OTP, paste allowed, `spellCheck=false`, `autoCapitalize/autoCorrect=off`. Panels are keyed per view, so credentials are discarded on tab switch and unmount. MFA QR is a static decorative pattern, no secret is generated or displayed.

**Source policy deviations from OWASP ASVS 2.1 (ported as-is, NOT changed):**
- Composition rules are enforced (upper + lower + number + special): ASVS 2.1.9 says do not require composition.
- Allowed-character allow-list `[A-Za-z0-9 + ASCII symbols]` rejects non-ASCII / Unicode: ASVS 2.1.11 requires Unicode (and all printable characters) to be accepted.
- Minimum 12 characters: compliant (2.1.1 requires >= 12). The source set no maximum; a `maxLength` of 128 was ADDED purely as an input-size cap (2.1.2 requires >= 64 accepted). This is the only policy-adjacent change.
- Paste allowed (2.1.11) and show-password toggle (2.1.12) are compliant.
- Breach-list check (2.1.7) is only claimed in copy, not implemented.

**UI-only vs API requirements:** everything here is presentation. A real implementation must: verify credentials, hash with Argon2id/bcrypt server-side, rate-limit / lock out (ASVS 2.2.1), return identical responses for existing and unknown accounts (no enumeration), issue single-use, expiring, hashed reset tokens delivered by email, enrol and verify TOTP/passkeys server-side (TOTP secret generated and stored server-side, never client-side), store recovery codes hashed, require MFA enrolment server-side before granting a session, set session cookies `HttpOnly; Secure; SameSite`, protect against CSRF, and write auth events to the audit log.
