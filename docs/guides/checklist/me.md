# My Workspace (`/ws/me`, module key `me`) — board `member-workspace`

> **Merged into My Work.** The page is now part of My Work (`/ws/work`): the greeting and counts sit at the top, My tasks and My remarks are on the Tasks tab, published policies on the Policies tab, account security and delegation on their own tabs. The components moved to `src/features/work/` (`WorkModule.tsx` replaces `MeModule.tsx`). `/ws/me` still works and opens the Policies tab. The `me` permission still gates the personal tabs.

Source: board `member-workspace` (template.html, script1.js) and `docs/architecture/SPEC_BOARDS.md` section 4. All data is synthetic.

| Board feature | Gap | React file | Status | Notes |
|---|---|---|---|---|
| Greeting "Good morning, {first name}" + "N open tasks · M policies to acknowledge" | 4.1 | `MeModule.tsx` | Done | First name of the current persona (`getMe()`); counts are live |
| "Member access." banner (verbatim copy) | 4.1 | `MeModule.tsx` | Done | `.banner.info` |
| My tasks (Review / Acknowledge / Training / Reply, due, overdue red, action button, "Completed"/"Done") | 4.G1 | `me/MyTasks.tsx`, `lib/me.ts`, `data/meSeed.json` | Done | Acknowledge tasks complete when the policy is acknowledged; others are marked done in `useModState`. Training is a toast stub (4.G5) |
| My remarks (policy, section, text, "Owner to review by", Open/Overdue) | 4.G2 | `me/MyRemarks.tsx` | Done (read-only) | No way to add a remark here, as in the board |
| Published policies (read only, version, owner, approved date, "Acknowledged <date>" / "Not acknowledged", "Read & acknowledge" -> "Done") | 4.G3 | `me/PublishedPolicies.tsx`, `services/me.ts` | Done | Derived from `DATA.policies` with status Active; approval dates in `meSeed.json` |
| Toast "Acknowledged X — recorded with timestamp in the audit log" + `wsLog("policy.acknowledged")` | 4.G3 | `PublishedPolicies.tsx`, `MyTasks.tsx` | Done | Log text `Name vX`, category Policy |
| Account security: password row, MFA row, "Change password" / "Add a passkey" | 4.G4 | `me/AccountSecurity.tsx` | Done | Links go to `/auth` gallery (board linked its Auth page) |
| Recovery codes row "8 of 10 unused", "Regenerating invalidates old codes" | 4.G4 | `AccountSecurity.tsx`, `lib/me.ts` | Done + added "Regenerate codes" | Board had text only; regeneration (modal, codes shown once, "I have stored my recovery codes" gate) added per the build plan `regenerateCodes` |
| Active sessions (Current / Active / Signed out) + "Sign out other sessions", toast "Other sessions signed out" | 4.G4 | `AccountSecurity.tsx` | Done | Demo list in `meSeed.json`, no IP addresses; logs `session.others.revoked` |
| Role-scoped nav (3 sections) | 4.G6 | not done | Out of scope | See Conflicts to decide |
| Role gate | n/a | `MeModule.tsx` | Added | `modAllowed(role,"ws","me")`, else a "Not available for your role" state |

Per-user acknowledgements: `lib/me.ts` (`ACKS`, in memory, keyed by persona name then policy id, with the acknowledged version). An acknowledgement only counts for the version acknowledged. No seed files owned by others were edited.

## Open questions
1. Board dates are fixed strings ("Due 30 Oct 2026", "Overdue"). Kept verbatim in seed; with today's date most are in the past. Should due/overdue be computed (approval date + 14-day window)?
2. Board policy names/owners (e.g. "Cryptography & Key Management Standard v1.2") differ from the portal register; acknowledge tasks and the list use portal names/versions. Board approval dates were mapped onto portal policy ids in `meSeed.json` (a guess).
3. Tasks and remarks are seeded for `employee` only; `owner` and `analyst` see empty states. What should those roles see?
4. Closing the recovery-code modal (Escape) after codes were generated, without "Done", leaves the demo count at 8; in a real API the old codes are already invalidated at generation time.
5. "Change password" and "Add a passkey" go to the `/auth` gallery, which is a demo, not a real flow.
6. Training has no content or completion model (4.G5); it is a toast stub.
7. "Review" and "Reply" task buttons do not open the policy; they only toast and mark done (board behaviour).

## Security notes
**In the UI only (not a trust boundary):** deny-by-default module gate (employee, owner, analyst per `ROLE_MODS`) with a denied state; acknowledge only works on Active (published) policies; all text rendered as React text, no HTML from strings; no secrets or PII in storage (acks are in memory only, task completion in module state); audit entries never contain codes.

**Recovery codes:** generated with `crypto.getRandomValues` (`randInt`, rejection sampling), 10 x `XXXX-XXXX` from a 32-char unambiguous alphabet, held only in the modal's component state (discarded on close), never persisted, logged or sent, with a visible "demo only, synthetic" notice.

**The real API must enforce:**
- Acknowledgement integrity and non-repudiation: bind to the authenticated user id, policy id and exact approved version, server timestamp, append-only storage, ideally signed/HMAC-chained; reject acknowledgement of unpublished or superseded versions; the client must not supply the user or timestamp.
- Recovery codes: generate server-side, store only salted hashes (Argon2id or bcrypt), return plaintext once over TLS with `Cache-Control: no-store`, single use, constant-time compare, invalidate old set atomically, step-up re-authentication before regeneration, rate-limit use.
- Session revocation: real server-side revocation of other sessions (session/refresh tokens), step-up auth, CSRF protection, notify the user; the session list (device, place) is demo data and a real one must not expose raw IPs to other users.
- Authorization: `/me/*` endpoints scoped to the caller only (no IDOR on user id); remarks visible only on policies the member is invited to.

## Conflicts to decide
1. **Employee landing page.** `landingPath` still returns `/ws/overview` (not changed). The spec recommends `/ws/me` for `employee`.
2. **Over-exposure of the employee role.** `ROLE_MODS.employee` still includes `overview`, `work`, `policies`, `access`, `questionnaires`, so a member sees company-level data and the editable policy register. `/ws/policies` behaviour was not altered (New policy / Edit / Approve are ungated; depends on 2.G1). The board wants members limited to My workspace, Published policies and My account security.
3. **Remarks visibility.** Board: remarks only on invited policies. Portal has no invitation model; here remarks are just seeded per role.
4. **`me` exposed to `owner` and `analyst`** (wired in `ROLE_MODS`), which the board did not define; they see a mostly empty page.
5. **Role-filtered nav** (3 sections) not implemented; the shell nav is unchanged.
6. **Role name** "Member" (board) vs "Employee" (portal).
7. **Policies approved/published** is inferred from status Active; the portal has no per-version approval record for member-facing views.
