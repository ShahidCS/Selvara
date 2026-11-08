# Admin Audit Log (Phase 4)

| Source feature | Source lines | React file | Status | Notes |
|---|---|---|---|---|
| Tabs log / chain / ropa / exp (`ALOG.view`) | 4116-4118 | `AdminLogModule.tsx` | Done | `useModState("adminlog.view")` |
| Filters: search (actor/action/object/IP/role), tenant (All / Platform / each customer), lawful basis | 4119-4122, 4132-4139 | `AdminLogModule.tsx`, `services/adminlog.ts` `alogRows` | Done | State `adminlog.q/tenant/basis`; search capped at 100 chars; stale tenant/basis values fall back to All |
| Chain status in header | 4143 | `AdminLogModule.tsx` | Done | |
| Log table (11 columns, categories as tag chips, synthetic IPs, hash), newest first | 4149-4163 | `AdminLogModule.tsx` | Done | No edit/delete/row actions |
| Empty state "No matching events" | 4148 | `AdminLogModule.tsx` | Done | |
| Chain integrity view, Verify (adminLog `adminlog.chain.verified`) | 4166-4179 | `adminlog/AdminViews.tsx`, `services/adminlog.ts` `verify` | Done | Per-link chip also checks predecessor link; FNV-1a demo disclaimer added |
| RoPA register view + JSON/CSV export (adminLog `ropa.exported`) | 4181-4189 | `auditlog/RopaRegister.tsx` (shared), `lib/ropa.ts`, `services/adminlog.ts` `exportRopa` | Done | |
| Evidence export view, register, empty state | 4191-4198 | `adminlog/AdminViews.tsx` | Done | "SHA-256" copy replaced by "hash (demo)" |
| `evidencePackage` (EXP-nnn, manifest, adminLog `evidence.package.generated`) | 4199-4204 | `services/adminlog.ts` `generatePackage` | Done | Manifest `sha256` key -> `hash` + `algorithm` |
| `alogExport` JSON/CSV of the filtered rows (oldest first), adminLog `adminlog.exported` | 4205-4211 | `services/adminlog.ts` `exportLog` | Done | `csvCell` on every cell; includes `hash`, `prev`, `before`, `after`; logs total entry count `cn` (source) |
| "Reset demo data" button -> confirm modal | 4125 | `AdminLogModule.tsx` + `team/ResetDemo.tsx` `openConfirmReset` | Done | Only in log/chain views, as in the source |
| `ropaFor`, `ropaById`, `tenantName`, `blobDownload` | 1089-1105, 4140, 4212 | `lib/ropa.ts`, `services/adminlog.ts`, `lib/format.ts` | Done | |

## Open questions
1. Export uses the current filters but logs `ADMIN_AUDIT.length` (all entries) as the exported count (source).
2. `adminLog` fills `ip` with a random documentation-range address (198.51.100.x) for every entry, and the actor/role from the client persona; both would come from the request on a server.
3. Verify chain writes a log entry each time (source), so verification changes the head it reports.
4. Filtered exports are possible; for audit use a full unfiltered export may be preferable.
5. Source label "SHA-256" for the FNV-1a digest was corrected in copy; confirm wording.
6. Table is not paginated (source).

## Security notes
* Append-only viewer: no UI or service path edits or deletes rows. Entries are created only by `adminLog` from decisions/exports.
* The chain is a tamper-evidence demonstration (32-bit FNV-1a); anyone who can write memory/storage can recompute it. The integrity tab says so. Production: server-side append-only storage, HMAC/signature per entry (key held outside the app), anchored heads, WORM retention (PA-15: 7 years), and verification by a separate service.
* UI-only enforcement: the role gate (`canAdminLog`, Platform Super Admin and Support) is re-checked in the service layer but must be enforced by the API; the server must set actor, role, IP and timestamp itself, authorise and rate-limit exports, and keep an audit entry for every export/verify.
* Log fields (actor, object, before/after) are attacker-influenced strings: rendered only as React text (ASVS 7.3.1, no log injection); exports use `csvCell` + `safeFileName`.
* IPs shown are synthetic documentation-range values; real IPs/device data are personal data (RoPA PA-01/PA-15): retention and access to the real log need DPO sign-off. The RoPA register is a synthetic sample.
