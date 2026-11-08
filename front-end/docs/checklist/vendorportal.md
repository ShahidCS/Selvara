# Vendor assessment portal (external)

Board: `vendor-assessment-portal` (template.html + script1.js), SPEC_BOARDS section 10. Route `/vendor-portal` (standalone, no AppShell chrome, `noindex`). DRAFT, needs security and product review before any real use.

Files: `src/components/modules/vendorportal/*` (VendorPortalPage, VerifyEmail, OtpStep, MfaStep, Questionnaire, QuestionCard, EvidenceUpload, Clarification, EndStates, parts, useAnswers), `src/lib/vendorSubmission.ts`, `src/services/vendorPortal.ts`, `src/data/vendorQuestions.json`, `src/data/vendorInviteSeed.json`. The in-shell `questionnaires/VendorPortal.tsx` is untouched.

## Feature table

| Source feature | Source lines | React component / file | Status | Notes |
|---|---|---|---|---|
| Step machine verify/otp/mfa/portal/clarify/done/dead | script1 5, 77-117 | VendorPortalPage.tsx | Done | State in memory only |
| Header: product name, "requested by <customer>", masked email, "session ends after 15 min idle", Sign out | tpl 136-153 | VendorPortalPage.tsx | Done | Customer parameterised ("Example Co"); "Back to TPRM (prototype)" link dropped (internal navigation must not reach an external user) |
| Entry gate copy, expiry date | tpl 168-179 | VerifyEmail.tsx | Done | |
| Email validation, personal/temporary rejection, mismatch message, 3 strikes void | 13-20, 84-91 | VerifyEmail.tsx, services/vendorPortal.ts, vendorSubmission.ts | Done | Mismatch/unknown share one message; counters client demo only |
| Email code step (6 digits, 10 min copy, 5 strikes void, `000000` demo wrong code) | 92-97, tpl 182-191 | OtpStep.tsx | Done | `autoComplete="one-time-code"`, numeric pattern, paste allowed |
| MFA enrolment (passkey recommended / authenticator) | 98, tpl 194-207 | MfaStep.tsx | Done (stub) | Both options just continue |
| Dead-link state + Restart demo | tpl 210-216 | EndStates.tsx | Done | |
| 12 questions, domain label, id, EVIDENCE REQUIRED tag | 21-34 | Questionnaire, QuestionCard, vendorQuestions.json | Done | Domain label per card as on the board (no extra group headings) |
| Choice Yes/Partially/No/Not applicable, comment 2,000 chars | 40-41 | QuestionCard.tsx | Done | Plain text |
| Evidence upload 25 MB, pdf/docx/xlsx/png/jpg, scanning 1.2 s -> clean, blocked reasons | 42-50 | EvidenceUpload.tsx, useAnswers.ts | Done (simulated scan) | validateUpload + safeFileName; content never read |
| Progress "N of M answered, saved automatically" | 53, 100-101 | Questionnaire.tsx | Done | Debounced `saveDraft` stub |
| CAIQ/SIG prefill, "Prefilled from your upload, please check", blocks submit | 102-108 | Questionnaire.tsx, useAnswers.applyPrefill | Done (DEMO STUB) | Derived from file-name length like the board; 5 MB, .xlsx/.csv only; file never parsed |
| Submit rules and the three notes, reference VQ-2026-NNNNNN v1 | 53-57, 111 | vendorSubmission.readiness, services submit | Done | Not-ready click shows the note as toast, as on the board |
| Clarification round (reviewer notes, new text different from previous, new file name for "Yes", version N+1) | 73-76, 116-117 | Clarification.tsx, clarReadiness | Done | Reopened ids are demo data (G1, I3) |
| Confirmation + "Simulate clarification (demo)" + Restart demo | tpl 311-318 | EndStates.tsx | Done | |
| "What you can see" panel, 11 portal controls | tpl 321-331 | VendorPortalPage.tsx, CONTROLS | Done | |
| Idle timeout 15 min, Sign out toast "Signed out. Your answers were saved." | 99 | VendorPortalPage.tsx | Done | Timer cleared on unmount |
| Audit of views/answers/uploads | controls list | services `recordView` | Stub | In-memory event names only; no `wsLog` |

## Open questions

1. Prefill mapping: the board fills answers from the file-name length. The real CAIQ/SIG-to-question-id mapping is not defined anywhere. Demo stub only; the file is never read.
2. Idle sign-out copy: the board shows no message for an idle timeout. Used "Session ended after 15 minutes idle. Your answers were saved."
3. Header/Sign out and the idle timer apply to portal, clarify and done. The board shows them only on the portal step; leaving an authenticated screen without Sign out seemed unintended.
4. Restart demo: the board does not reset the version number; here it resets to 1.
5. Board shows the invited address (`contact@vendor.example` here) as a demo hint. It is shown only in mock mode; a real build must never ship the invited address to the client.
6. Clarification deadline (05 Nov) is before the link expiry (09 Nov); which governs a reopened round?
7. Is MFA enrolment per invite or per vendor contact (the board says "each time you return")? Is there a recovery path if the factor is lost?
8. Does Sign out void the session server-side and is the link still usable after submission (board: link "expires after submission")?
9. Question grouping: should same-domain questions get a group heading (SPEC 10.G5 "domain grouping") rather than only the per-card domain label?

## Conflicts to decide (board vs portal's vendor questionnaire; portal behaviour unchanged)

| Topic | This board | Portal / other board | Decision needed |
|---|---|---|---|
| Question set | 12 questions (G1..X1) | 6 free-text (`VENDOR_Q`, in-shell `VendorPortal.tsx`); TPRM board has 41 | Which catalogue is authoritative; shared ids between internal and external sides |
| Answer model | Choice + comment + evidence | Free text only | Adopt structured model in the in-shell version or retire it |
| Link lifetime | Copy "expires 09 Nov 2026"; controls list "14 days" | Appsec board "72-hour invite" | Single expiry window |
| Upload rule | 25 MB; pdf/docx/xlsx/png/jpg | `UPLOAD_DEFAULT` 10 MB, wider list | Confirm vendor-specific rule |
| Customer name | "ACME [CUSTOMER] Ltd" | Hard-coded "ACME Ltd" in-shell | Parameterised here ("Example Co"); in-shell still hard-coded |
| Submission lock / versions | Read-only, versioned, clarification creates N+1 | Editable until reload, no versions | Server-side immutability |
| Identity | Link + email + OTP + MFA | Role switcher "Vendor Contact", no identity | Retire the `vendor` role's in-shell module once the portal is live |

## Security notes (what the real server must enforce; the UI is not a trust boundary)

Client behaviour: email and code live only in component state, are sent in the request body, and are never logged, stored, put in a URL or passed to `wsLog` (this page imports no audit or RBAC module). Only a masked address moves between steps. Unknown/mismatched/expired give one message. Vendor text, file names and reviewer notes render as React text. Uploads pass `validateUpload` and `safeFileName`; content is never read. Idle timer and autosave timers are cleared on unmount. No tokens in the query string, nothing in localStorage/sessionStorage.

Server must enforce:
- Invite token: >=128-bit random, single-use, expiry (decide window, see conflicts), void after submission; sent in path/cookie, never logged, `Referrer-Policy: no-referrer`.
- Rate limits and attempt counters per token AND per IP/device (3 email, 5 code), persisted server-side; the client counters are demo only. Lockout must not be bypassable by reload.
- Enumeration safety: identical wording and timing for unknown token, wrong address, expired and voided link; same response shape. The invited address must never be sent to the client.
- Email OTP: 6 digits, 10 min expiry, single use, hashed at rest, new code invalidates the old one.
- MFA enrolment: WebAuthn (preferred) or TOTP enrolled before any questionnaire data is returned; step-up on return; recovery handled out of band.
- Session: HttpOnly, Secure, SameSite=Strict cookie, 15 min idle and absolute timeout, server-side invalidation on Sign out, CSRF protection on every POST.
- Caching: `Cache-Control: no-store` on the page and all API responses; CSP, `X-Frame-Options`/frame-ancestors none, `noindex`.
- Object-level authorization on every request: vendor can read/write only their own questionnaire and version; reopened question ids come from the server, not the client; locked answers rejected server-side.
- Uploads: re-check extension, size and magic bytes/content type, malware scan before "clean" (the UI scan is simulated), store encrypted outside the web root, serve with `Content-Disposition: attachment`, hash on ingest.
- Submit rules (all answered, evidence for critical "Yes", no unverified prefill, clarification must differ from previous) re-evaluated server-side; immutable versions.
- Audit every view, answer, upload, submission and failed attempt with reference ids only (no email, code or comment text).
- Include the portal in penetration-test scope; WAF/bot protection on the entry endpoints.
