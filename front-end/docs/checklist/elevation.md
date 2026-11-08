# Elevated Access (`/admin/elevation`, key `elevation`)

Source: board `super-admin-console` (header "Elevated session", banner copy, audit rows) and `docs/SPEC_BOARDS.md` section 8 (8.G1, 8.G2). New screen; the prototype has no elevation.

| Source feature | Board ref | React file | Status | Notes |
|---|---|---|---|---|
| Header "Elevated session: Hardware key - allow-listed network - just-in-time role expires in N min" with countdown | template header block | `admin/ElevationBanner.tsx`, `lib/elevation.ts` `useElevation` | Done | N from the stored expiry timestamp; mm:ss shown (hidden from screen readers, the per-minute text is the live region) |
| Banner "Sample data. ... they cannot read customer policy content without a time-boxed support grant approved by the customer." | template banner | `admin/ElevationBanner.tsx` | Done | Copy preserved |
| Request flow: reason required, 60 min max | 8.G1 | `admin/RequestElevation.tsx`, `lib/elevation.ts` `startElevation` | Done | Reason via `clampText` + `maxLength` 300; duration 15/30/60, re-validated 1..60 in the service |
| Simulated hardware-key prompt | 8.G1 | `admin/RequestElevation.tsx` | Done | Banner says it is a simulation; "Simulate key touch" waits 900 ms (timer cleared on unmount). No key material, challenge or credential exists |
| End early | 8.G1 | `ElevationBanner.tsx`, `elevation.ts` `endElevation("ended")` | Done | Logs `admin.elevation.ended` |
| Auto-expiry, drop to non-privileged | 8.G1 | `elevation.ts` `expireIfDue`, `useElevation` timers | Done | `until` is an absolute timestamp; checked by a 1 s tick and a timeout, both cleared on unmount; re-checked on every mount and `startElevation`. Logs `admin.elevation.expired` once (idempotent) |
| Audit entries `admin.elevated` / `admin.elevation.ended` / `admin.elevation.expired` | 8.G1, board log "Elevated to super admin (JIT, 60 min) with hardware key" | `lib/elevation.ts` via `adminLog` | Done | Categories Authentication + Account, basis Legitimate interest; before/after record the window, reason and "hardware key: simulated (demo)" |
| Customer-approved support grants list with expiry | 8.G2, board log row "Support access grant approved by customer (4 h, read-only)" | `admin/SupportGrants.tsx`, `elevation.ts` `getSupportGrants` | Done | Read-only list; three synthetic grants created relative to session start; status computed from expiry |
| Hook for other modules | 8.4 | `lib/elevation.ts` `useElevation()` | Done | Returns `active`, `until`, `remainingMs`, `canElevate`, `request`, `end`. Not adopted by any module yet |
| Mutation buttons disabled "Elevate to make changes" in `/admin/*` | 8.4 | not built | Deferred | Breaking change awaiting owner sign-off (see Conflicts) |
| 5-step onboarding wizard (8.G3/8.G4) | board Onboard tab | not built | Deferred | Not on the elevation/security screens; belongs to Customers (`customers/Onboard.tsx` replacement) |

## Open questions
1. Should elevation survive a page reload? It is in-memory only by design (safe default); a server session would normally decide.
2. Duration options 15/30/60 are an assumption; board says only "60 minutes maximum".
3. Support grants: board shows one log row only. Fields (approver email, scope, window) are inferred; no create/revoke UI because the customer approves. Should platform staff be able to see a "request grant" action?
4. Role switched away from Super while elevated: the session is ended and logged (assumption).
5. Board time format ("26 Oct 2026 03:58") differs from the portal admin log (`YYYY-MM-DD HH:MM` UTC); portal format kept.

## Conflicts to decide
| Topic | Board | Portal now | Decision needed |
|---|---|---|---|
| Standing access vs elevation | No standing privileged access; JIT elevation, 60 min | `ROLE_MODS.super = { ws: "*", admin: "*" }`, every mutation always available | Remove `ws: "*"` from super (or limit to a grant list) and gate `/admin/*` mutations on `useElevation().active`. Breaking change to the role demo; NOT done |
| Support grants | Only route into customer content | Super opens every workspace module with no grant | Tie workspace access to an active grant (server-side) |
| MFA reset strictness | 3 identity checks (call-back to the phone on file, request from the registered security contact on a verified domain, government-ID/video check), ticket reference, named second approver chosen in the dialog, effect text "existing factors removed, all sessions revoked, re-enrolment forced at next sign-in, and the customer's security contact notified by email" | One confirm checkbox + method; requester may reject own request; name-based four-eyes | Extend `mfa/ResetRequestForm.tsx` + `services/mfa.ts` (owner decision pending; not done here) |

## Security notes
* The elevation state is NOT a security control. Hardware-key verification, the allow-listed network check, the just-in-time role grant, the 60-minute cap and reason capture are server-side; the server must hold its own elevation record and reject privileged calls when it is missing or expired, regardless of this UI.
* Deny by default: `canElevate` is true for `super` only; `startElevation` re-checks the role, so non-super roles cannot start a session even by calling the function. Non-super users see a read-only explanation.
* No secrets: no hardware-key, challenge or token value is generated or displayed; the prompt is labelled as a simulation.
* Reason is `clampText`-ed (300) and rendered as React text; audit actor/role are captured at start so expiry entries cannot be attributed to a different persona. In production the server sets actor, role, IP and time.
* Expiry uses absolute timestamps, so a throttled tab cannot extend a session; the timers only trigger the check.
* Nothing is written to localStorage.
