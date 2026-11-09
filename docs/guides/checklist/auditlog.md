# Workspace Audit logs (Phase 4)

| Source feature | Source lines | React file | Status | Notes |
|---|---|---|---|---|
| Tabs log / chain / ropa / exp (shared with sidebar sub-nav) | 3733-3739 | `AuditLogModule.tsx` | Done | `useModState("auditlog.view")`; unknown value -> log |
| Chain status line in header | 3739 | `AuditLogModule.tsx` | Done | `role="status"` |
| Category filter chips with counts (`AUDF`) | 3744 | `AuditLogModule.tsx` | Done | `useModState("auditlog.filter")`, validated against the category list |
| Log table (#, time, category chip, actor, action, target, RoPA tag -> RoPA tab, hash), newest first | 3745-3746 | `AuditLogModule.tsx` | Done | RoPA tag is `role=button` + keyboard; all values React text. No empty state in the source for a filter with 0 rows (ported as-is) |
| JSON/CSV export (`wsLogExport`), wsLog `auditlog.exported`, toast | 3760-3763 | `services/auditlog.ts` `exportLog` | Done | CSV through `csvCell` (source had a looser escape, no formula guard); includes hash and prev |
| Chain integrity view (banner, explainer, summary, link table, Verify) | 3748-3758 | `auditlog/ChainView.tsx` | Done | Link chip also checks the predecessor link (source checked own hash only). Demo disclaimer added; "Algorithm" row now says FNV-1a (source said "SHA-256 (demo)") |
| `wsVerify` (wsLog `auditlog.chain.verified`, toast, "FAILED" copy) | 3759 | `services/auditlog.ts` `verifyChain` | Done | Verification itself appends a log entry (source behaviour) |
| RoPA register view + JSON/CSV export | 3727-3731, 4186-4189 | `auditlog/RopaRegister.tsx`, `lib/ropa.ts`, `services/auditlog.ts` `exportRopa` | Done | `ropaFor`/`ropaById` ported to `src/lib/ropa.ts` |
| Evidence export view, exports register, empty state "No packages yet" | 3765-3768 | `auditlog/EvidenceView.tsx` | Done | Copy now says "hash manifest"/"Package hash (demo)" instead of SHA-256 (value is FNV-1a) |
| `wsEvidencePackage` (WEXP-nnn, manifest download, wsLog `evidence.package.generated`) | 3769-3774 | `services/auditlog.ts` `generatePackage` | Done | Manifest key `sha256` renamed `hash` + `algorithm` field |
| Helpers `wsChainBody`, `wsHashStr`, `verifyWsChain` | 1049-1050 | `lib/audit.ts` (existing; ADD: `wsChainBody` export) | Done | |

## Open questions
1. `ropaExport` (RoPA tab buttons) logs through `adminLog` (the platform chain) even when raised from the workspace module (source). Ported as-is; a workspace action therefore writes into the platform log with the persona as actor. Should it be `wsLog("ropa.exported", ..., "RoPA")`?
2. Source label "SHA-256" for a 32-bit FNV-1a digest was corrected in copy (deliberate deviation for honesty); confirm wording with the owner.
3. Exports register (`WS_EXPORTS`) is in-memory only; lost on reload while the log entry remains (source).
4. Log table has no pagination/virtualisation (source); large logs will be slow.
5. Verify chain and every export append an entry, so merely viewing the integrity tab and clicking Verify changes the head (source).
6. Chain link check strengthened (predecessor hash must match). Source only recomputed the entry's own hash.

## Security notes
* UI-only enforcement: module access is the only gate (workspace admins). The service layer re-checks `canAuditLog` (deny by default) on every mutation, but a real API MUST authorise server-side.
* Append-only: there is no edit/delete code path in UI or service. A real system needs server-side append-only storage with HMAC/signed seals; the FNV-1a chain is a demo (said plainly in the integrity tab) and cannot resist an attacker who can recompute hashes.
* Actor comes from `getMe()` (client persona): the server must derive actor and time from the session.
* Log text is React text only (ASVS 7.3.1); exports go through `csvCell` and `safeFileName`; CSV/JSON include `hash` and `prev`.
* Evidence package digest is not a signature; auditors need a server-signed manifest. Rate-limit exports. RoPA/retention ownership (GDPR Art. 30): the DPO owns the register; the sample is synthetic and the event-to-activity mapping (`ropaFor`) is a heuristic.
