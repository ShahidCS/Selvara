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
