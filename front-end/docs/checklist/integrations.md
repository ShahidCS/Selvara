# Integrations (Phase 3)

| Source feature | Source lines | React file | Status | Notes |
|---|---|---|---|---|
| Seed (7 connectors) | 3528-3536 | `src/data/integrationsSeed.json`, `services/integrations.ts` | Done | Extracted with `scripts/extract-source.js` |
| `intCanManage` role gate (super, admin, owner, analyst) | 3537 | `services/integrations.ts` | Done | Exact list; non-managers get no buttons, a chevron instead (read-only) |
| KPIs (Connected n / N, Sync health, Last sync, Access Read-only) | 3541, 3543 | `IntegrationsModule.tsx` | Done | "Last sync 4m ago" is a static literal in the source |
| "Recommended connection order" card | 3544 | `IntegrationsModule.tsx` | Done | |
| Connectors table (sorted by `order`, health chip / "Not connected", Sync, Disconnect, Connect read-only, chevron) | 3545, 3538 | `IntegrationsModule.tsx`, `integrations/IntegrationUI.tsx` | Done | Row opens drawer (keyboard via `activate`); action cell stops propagation; added `aria-label`s |
| "Sync all" | 3545, 3556 | `IntegrationUI.tsx` (`useIntegrationActions`) | Done | wsLog `integrations.synced` |
| Connector drawer (meta grid, Data use, Sync now, Disconnect / Connect read-only) | 3548-3553 | `IntegrationUI.tsx` (`ConnectorBody`, `openConnectorDrawer`) | Done | Body re-renders on DATA change, so "Sync now" refreshes it (source re-opened it). Unknown name: "Connector not found." |
| `intToggle` (state resets, "syncing…", wsLog connected/disconnected, toasts) | 3554 | `services/integrations.ts`, `IntegrationUI.tsx` | Done | |
| `intSync` | 3555 | same | Done | wsLog `integration.synced`, toast "Synced X (demo)" |

## Open questions
1. Disconnect has no confirmation and takes effect immediately (source).
2. `intSync` works on a disconnected connector (marks it Healthy but status stays "Not connected"; source). The UI only offers Sync for connected ones.
3. "Records pulled" shows "syncing…" forever after Connect (no completion simulation in source).
4. "[company] does not write back…" copy in the drawer was anonymised to "Assurance" (real company name).
5. `ConnectorBody` drawer is not closed when the role loses the gate; it simply drops the buttons.

## Security notes
UI gate only: `intCanManage` hides actions. The real API must authorize connect/disconnect/sync per tenant, keep OAuth tokens/credentials server-side (never in the browser), request read-only least-privilege scopes, and write the audit entry itself. Connector names come from a fixed list; all text is rendered as React text. No secrets or hostnames in the seed.

## Hardening (docs/SOD_MATRIX.md, owner decision 2026-11)
**What changed vs the prototype:** `intCanManage` listed super, admin, owner, analyst; it is now admin only (none of the others can open the module). Connect, disconnect and sync call `assertRole("admin")` in the service (`SodError` toast). Disconnecting is audited in the workspace log (`integration.disconnected`, as before) and now also in the admin log (`adminLog`, category Integration). Non-admins see the read-only table with no action buttons.

**Open question added:** connect/disconnect has no second approver or confirmation (matrix asks for admin only). Disconnecting an identity source weakens monitoring; consider a confirmation step.

**Security notes (additions):** the real API must hold OAuth tokens server-side and enforce the admin role per tenant; the audit entry must be written server-side.
