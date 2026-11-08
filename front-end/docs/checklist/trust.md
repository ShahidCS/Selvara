# Trust Center module checklist

Source: `Assurance-GRC-Portal.html` lines 3326-3442. React: `src/components/modules/TrustModule.tsx`, `trust/TrustAdmin.tsx`, `trust/TrustPublic.tsx`, `trust/TrustModals.tsx`, `src/services/trust.ts`.
State: `src/lib/trustData.ts` (mutable, seeded from `src/data/trustSeed.json`, extracted with `scripts/extract-source.js`; two staff names replaced by synthetic ones). `DATA.trust` already existed.

| source feature | source lines | React file | status | notes |
|---|---|---|---|---|
| `trustCanManage` (module allowed + role in super/admin/owner) | 3327 | `TrustModule` | done | only controls the "Back to admin" button, as in source |
| View switch: viewer/vendor always public; others admin unless preview | 3332-3336 | `TrustModule` | done | `trust.view` module state (survives navigation) |
| Admin tabs Resources / Access & requests (count tag) / Activity & history / Chatbot | 3369-3371 | `TrustAdmin` | done | `trust.adm` module state |
| Page actions: Preview public page; Publish resource (resources tab only) | 3373 | `TrustAdmin` | done | |
| Resources cards (name, status chip, access icon, View toast, Make private/public) | 3376 | `TrustAdmin` | done | |
| Pending requests table + blocked-domain chip, empty state "No requests waiting" | 3378 | `TrustAdmin`, `svc.isBlockedWho` | done | |
| Approve (decision, add viewer / new account, log, toast) | 3400 | `svc.approveRequest` | done | log `trust.access.approved` |
| Deny modal + note, log `trust.access.denied`, toast | 3401-3402 | `DenyForm` | done | note clamped 300 |
| Accounts table (NDA chip, viewers or "None yet", Revoke when Active) | 3379, 3403 | `TrustAdmin` | done | log `trust.account.revoked` |
| Decision history / "No decisions recorded yet." | 3380 | `TrustAdmin` | done | |
| Blocked domains chips + unblock (x) + "No blocked domains." | 3381, 3406 | `TrustAdmin` | done | log `trust.domain.unblocked` |
| Block a domain modal, "Enter a domain.", lower-case, strip leading @, log | 3404-3405 | `BlockDomainForm` | done | `trust.domain.blocked` |
| Activity table + public-page change history | 3389-3394 | `TrustAdmin` | done | |
| Chatbot card on/off toggle, conversation log / "No conversations yet." | 3395-3397, 3407 | `TrustAdmin` | done | log `trust.chatbot.enabled/disabled` |
| `trustBotAnswer` (verified answers + FAQ, keyword overlap >= 1) | 3408-3410 | `svc.botAnswer` | done | text matching only |
| Public page: header, Your access, Live control status, Documents, Sub-processors, Updates, FAQ, Ask a question | 3411-3426 | `TrustPublic` | done | FAQ uses `<details>` as source |
| Accept NDA (toast only) | 3415 | `TrustPublic` | done | demo |
| Subscribe modal, "Enter a valid email address.", log `trust.subscribed` | 3427-3428 | `SubscribeForm` | done | `isEmail` (stricter than source regex) |
| Ask: "Enter a question first", log `trust.question.asked` (q.slice(0,60)), chats log, answer box (Assistant answer / Forwarded...) | 3429-3437 | `TrustPublic.ask`, `svc.askQuestion` | done | answer rendered as React text; textarea cleared |
| Visibility toggle (Public <-> On request, NDA), log `trust.visibility.changed`, toast | 3438 | `svc.toggleVisibility` | done | |
| Request access modal (email, reason), "Enter a valid email address.", log `trust.access.requested` | 3439-3440 | `RequestAccessForm` | done | `isEmail`, reason clamped |
| Publish resource modal, "Resource name is required.", log `trust.resource.published` | 3441-3442 | `PublishForm` | done | visibility enum-checked |

## Open questions
1. The copy for blocked domains says requests "cannot be approved", but `trustApprove` does not check the blocklist: the Approve button works on a flagged request. Ported as-is. Server must reject.
2. "Request access" (public) logs and toasts but never creates an entry in the admin "Pending access requests" queue, and the Reason field is discarded. Ported as-is.
3. "Accept NDA" only toasts; NDA state is not recorded anywhere and no NDA gate exists before private docs. "View"/"Open" buttons are toasts (no document is served).
4. Revoke clears viewers and sets "Revoked" but leaves the `access` text; an account cannot be re-activated except via a new approval (approve sets status "Active" for a matching domain).
5. Approve matches an account by `endsWith("@"+domain)`; a requester with a sub-domain is created as a new account. Blocked check uses `endsWith("."+d)` too, so `x@a.freemail.example` is flagged.
6. Chat `who` falls back to "anonymous": the personas have no `email` (source `ME.email` unset). `at` is date-only.
7. Public page company name ("Northwind Payments") and live control statuses are hard-coded in the source, not derived from DATA.
8. Make public/private is not role-gated beyond reaching the admin view; `manage` only drives the Back button.
9. Public-page change history (`TRUST_MODEHIST`) is static; publishing/toggling does not append to it.

## Security notes
Enforced by the UI only (the API must enforce all of these):
* **Public vs authenticated visibility:** which resources are public, which need NDA, and who may flip them is a UI toggle. The API must authorise `visibility` changes (admin/owner), and must serve private documents only to authenticated, NDA-accepted, approved viewers; never trust a client "Public" flag.
* **Tenant isolation:** accounts, viewers, requests and chat logs are per tenant; the public endpoints must resolve the tenant from the host, not from the client.
* **NDA enforcement and link expiry:** the prototype has neither. Real document links must be short-lived, signed, per-viewer and logged; NDA acceptance must be recorded server-side before issuing links.
* **Blocked-domain rule** must be enforced server-side on submit and on approve (see Open question 1).
* **Approve/deny/revoke** are audited (`wsLog`) with actor from `getMe()`; a real API must restrict them and write its own append-only audit entry.
* **Public form abuse:** subscribe / request-access / ask-a-question are anonymous: add rate limiting, bot protection and server-side validation (email, lengths).
* **Chatbot:** this port is keyword matching over verified answers + FAQ, not an LLM. If replaced by an LLM: answer only from the published corpus (verified entries), never from internal/unverified/tenant-private data; treat the visitor question as untrusted (prompt injection: no tool access, no system-prompt disclosure, no instructions from retrieved text), filter output, rate limit, log and review. Verifying an answer (Questionnaires) publishes it to the external chatbot: gate that action.
* Free text (reason, note, question, emails, domains) is clamped (`clampText` + `maxLength`), emails use `isEmail`, and every value (including chatbot answers and chat logs written by external visitors) renders as React text only. No HTML/markdown rendering, no `dangerouslySetInnerHTML`. Source inline `onclick` handlers with interpolated ids/domains were removed.
