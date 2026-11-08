# API, Webhooks & Custom Tests (Phase 3)

| Source feature | Source lines | React file | Status | Notes |
|---|---|---|---|---|
| Seeds (keys, webhooks, tests, events, `WH_EVENTS`) | 3559-3563 | `src/data/apiSeed.json`, `services/api.ts` | Done | |
| `apiCanManage` (super, admin, owner) | 3558 | `services/api.ts` | Done | Exact; read-only otherwise (no action buttons) |
| Tabs Keys / Hooks / Tests / Stream, header action per tab | 3565-3568 | `ApiModule.tsx` | Done | `useModState("api.tab")`, unknown value -> Keys |
| API keys table (prefix, scope, status chip, Revoke) | 3571 | `ApiModule.tsx` | Done | |
| New API key modal, "Label is required.", scope select | 3576-3577 | `api/ApiModals.tsx` (`NewKeyForm`) | Done | Label `clampText` 80, scope checked against allow-list |
| Key-created modal, "Copy this key now…", Copy key, Done | 3578-3579 | `ApiModals.tsx` (`KeyCreated`) | Done | `navigator.clipboard` awaited in try/catch (source swallowed async rejection and always toasted success); fallback selects the field + "Select and copy the key" |
| Revoke confirm modal + revoke | 3580-3581 | `ApiModals.tsx` (`RevokeKeyForm`) | Done | wsLog `api.key.revoked` |
| Webhooks table (events tags, HMAC-SHA256, last delivery, Pause/Resume, Test, Delete), empty state "No webhooks" | 3572 | `ApiModule.tsx` | Done | |
| Add webhook modal (events checkboxes, first two ticked, "A valid https URL is required.") | 3582-3583 | `ApiModals.tsx` (`WebhookForm`) | Done | Validation stricter than source, see Security notes |
| Test / toggle / delete webhook | 3584-3586 | `ApiModule.tsx`, `services/api.ts` | Done | Toasts and wsLog kept |
| Custom tests table, New custom test modal, Run now (75% pass), Delete | 3573, 3587-3590 | `ApiModule.tsx`, `ApiModals.tsx` (`TestForm`) | Done | wsLog categories "Control" kept |
| Event stream tab, "Push test event" | 3574, 3591 | `ApiModule.tsx`, `services/api.ts` | Done | |

## Open questions
1. The source has **no "reveal" / time-limited display** of keys: the full key is shown once, in the creation modal. Ported as that (no timer was invented). Clipboard is not auto-cleared.
2. Demo key prefix changed from the source's `ak_live_` to `ak_demo_` so a generated value can never look like a production key; the modal adds "Demo key only…" line. Seed prefixes (`ak_live_8f3c…`) are the source's truncated samples, unchanged.
3. Webhook "Test" / "Run now" / "Push" results are simulated (latency 60-149 ms, 75% pass) with `crypto.getRandomValues`.
4. Source logs the full webhook URL; here the log target is origin + path (query/fragment stripped, they may hold tokens). Table still shows the URL as entered.
5. Revoke / webhook delete / test delete: webhook and test deletion have no confirmation (source).
6. Event list is capped at 200 rows (DoS hygiene); source was unbounded.
7. Webhook secrets (HMAC) are never displayed in the source ("generated automatically"); none is shown here.
8. Custom test "logic" does not exist in the source form (name, target, schedule only). Nothing is evaluated client-side.

## Security notes
**UI-only (must be enforced by the API):** `apiCanManage`; key issuance and storage (generate server-side, show plaintext once, store only hash + prefix, scopes enforced per request, rotation/expiry); webhook signing secrets (server-side, per-endpoint, rotate); RBAC on every mutation; audit entries written server-side.
**Webhook URL (SSRF):** `isSafeWebhookUrl` (`lib/security.ts`) accepts only `https:` URLs without credentials, rejects IPv6 literals, `localhost`, `*.local/.internal/.intranet/.lan/.home/.corp`, single-label hosts, non-dotted numeric hosts (decimal/hex/octal forms are normalised by `URL` and then range-checked) and IPv4 in 0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.168/16, 198.18/15, multicast and reserved. This is a client-side convenience only: the server must resolve DNS at delivery time, pin and re-check the address (DNS rebinding), refuse redirects, and cap response size/time.
**Secrets in the UI:** the demo key comes from `crypto.getRandomValues` (`secureHex`), lives only in the modal's props and is dropped on close; it is never logged (`wsLog` has label + scope only), stored, or put in a URL. All user text renders as React text; no `eval`/`new Function`; ids are demo ids (`Date.now`).
