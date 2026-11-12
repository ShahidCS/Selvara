import { Chip } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { wsLog } from "@/lib/audit";
import { adminLog } from "@/lib/adminAudit";
import { roleOf } from "@/lib/rbac";
import { appStore } from "@/lib/store";
import { attempt } from "@/components/kit/sodKit";
import * as svc from "@/features/integrations/services/integrations";

export const HealthChip = ({ h }: { h: string }) =>
  h === "Healthy" ? <Chip cls="ok" icon="check">Healthy</Chip> : h === "Degraded" ? <Chip cls="warn" icon="alert">Degraded</Chip> : <span style={{ color: "var(--faint)" }}>—</span>;

/** Actions shared by the table and the drawer (prototype: intToggle / intSync / intSyncAll). */
export function useIntegrationActions() {
  const L = useLayer();
  const toggle = (name: string) => attempt(L, async () => {
    const r = await svc.toggleIntegration(name); if (!r) { L.toast("Connector not found", false); return; }
    wsLog("integration." + (r.connected ? "connected" : "disconnected"), name, "System");
    if (!r.connected) adminLog("integration.disconnected", name, { tenant: roleOf(appStore.get().role).tenant || "", categories: ["Integration"], basis: "Legitimate interest" });
    L.toast(name + " " + (r.connected ? "connected (read-only)" : "disconnected"));
  });
  const sync = (name: string) => attempt(L, async () => { if (await svc.syncIntegration(name)) { wsLog("integration.synced", name, "System"); L.toast("Synced " + name + " (demo)"); } });
  const syncAll = () => attempt(L, async () => { await svc.syncAllIntegrations(); wsLog("integrations.synced", "all connectors", "System"); L.toast("Syncing all connectors (demo)"); });
  return { toggle, sync, syncAll };
}
