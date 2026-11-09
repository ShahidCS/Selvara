import { Chip, Icon } from "@/components/ui";
import { useApp, useData } from "@/lib/store";
import { useLayer, type LayerApi } from "@/hooks/useLayer";
import { wsLog } from "@/lib/audit";
import { adminLog } from "@/lib/adminAudit";
import { roleOf } from "@/lib/rbac";
import { appStore } from "@/lib/store";
import { attempt } from "../sodKit";
import * as svc from "@/services/integrations";

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

/** Connector drawer body. Re-renders on DATA changes, so "Sync now" refreshes it (the source re-opened the drawer). */
function ConnectorBody({ name, close }: { name: string; close: () => void }) {
  useData();
  const act = useIntegrationActions();
  const manage = svc.intCanManage(useApp((s) => s.role));
  const r = svc.intFind(name);
  if (!r) return <p className="field help">Connector not found.</p>;
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{r.name}</div>
        <div style={{ marginLeft: "auto" }}>{r.status === "Connected" ? <HealthChip h={r.health} /> : <Chip cls="neutral" icon="dot">Not connected</Chip>}</div>
      </div>
      <dl className="meta-grid"><dt>Category</dt><dd>{r.cat}</dd><dt>Type</dt><dd>{r.type}</dd><dt>Access scope</dt><dd>{r.scope}</dd><dt>Last sync</dt><dd>{r.lastSync}</dd><dt>Records pulled</dt><dd>{r.records}</dd></dl>
      <div className="hr" /><div className="sectitle">Data use</div>
      <p className="field help">Data is pulled read-only to evaluate controls and tests. Selvara does not write back except to approved remediation ticketing connectors. Synthetic sample for the prototype.</p>
      {manage ? (
        <>
          <div className="hr" />
          <div className="btngrp">
            {r.status === "Connected" ? (
              <>
                <button className="btn btn-secondary sm" onClick={() => act.sync(r.name)}><Icon name="refresh" />Sync now</button>
                <button className="btn btn-ghost sm" onClick={() => { act.toggle(r.name); close(); }}><Icon name="x" />Disconnect</button>
              </>
            ) : <button className="btn btn-primary sm" onClick={() => { act.toggle(r.name); close(); }}><Icon name="plus" />Connect read-only</button>}
          </div>
        </>
      ) : null}
    </>
  );
}
/** Prototype: intDrawer. */
export function openConnectorDrawer(L: LayerApi, name: string) {
  if (!svc.intFind(name)) return;
  L.openDrawer("Connector", "", (close) => <ConnectorBody name={name} close={close} />);
}
