import { Chip, DataTable, Icon, KpiStrip, KpiTile, Page, type DTColumn } from "@/components/ui";
import { useApp, useData } from "@/lib/store";
import { useGo, useRoute } from "@/lib/route";
import { INTEGRATIONS, intCanManage, type Integration } from "@/features/integrations/services/integrations";
import { HealthChip, useIntegrationActions } from "./IntegrationUI";
import { ConnectorDetail } from "./ConnectorDetail";
import { ProdIntegrations } from "./ProdIntegrations";
import { API_ON } from "@/lib/rbac";

/** `/ws/integrations` is the connector register; `/ws/integrations/:name` is a connector page. */
export default function IntegrationsModule() {
  const { param } = useRoute();
  if (API_ON) return <ProdIntegrations id={param} />; // production: the real read-only connectors (server/ws/integrations.ts)
  if (param) return <ConnectorDetail name={param} />;
  return <IntegrationsList />;
}

function IntegrationsList() {
  useData();
  const go = useGo(); const act = useIntegrationActions();
  const manage = intCanManage(useApp((s) => s.role));
  const conn = INTEGRATIONS.filter((x) => x.status === "Connected"), deg = conn.filter((x) => x.health === "Degraded").length;
  const rows = INTEGRATIONS.slice().sort((a, b) => a.order - b.order);
  const cats = Array.from(new Set(INTEGRATIONS.map((x) => x.cat))).sort();
  const cols: DTColumn<Integration>[] = [
    { key: "order", header: "#", value: (r) => r.order, render: (r) => <span className="num" style={{ color: "var(--muted)" }}>{r.order}</span> },
    { key: "name", header: "Integration", value: (r) => r.name, locked: true, render: (r) => <span className="strong" style={{ whiteSpace: "nowrap" }}>{r.name}</span> },
    { key: "cat", header: "Category", value: (r) => r.cat, render: (r) => r.cat },
    { key: "scope", header: "Scope", value: (r) => r.scope, render: (r) => <span title={r.scope} style={{ color: "var(--ink-2)", fontSize: 12.5, display: "block", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.scope}</span> },
    { key: "last", header: "Last sync", value: (r) => r.lastSync, render: (r) => <span style={{ color: "var(--muted)" }}>{r.lastSync}</span> },
    { key: "records", header: "Records", defaultHidden: true, value: (r) => r.records, render: (r) => <span className="num" style={{ color: "var(--muted)" }}>{r.records}</span> },
    { key: "status", header: "Status", value: (r) => r.status, render: (r) => (r.status === "Connected" ? <HealthChip h={r.health} /> : <Chip cls="neutral" icon="x">Not connected</Chip>) },
    { key: "act", header: "Actions", hideHeader: true, align: "end", locked: true, render: (r) => (manage ? (r.status === "Connected" ? (
      <div className="btngrp" style={{ justifyContent: "flex-end", flexWrap: "nowrap", whiteSpace: "nowrap" }}>
        <button className="btn btn-ghost sm" aria-label={`Sync ${r.name}`} onClick={() => act.sync(r.name)}><Icon name="refresh" />Sync</button>
        <button className="btn btn-ghost sm" aria-label={`Disconnect ${r.name}`} title="Disconnect" onClick={() => act.disconnect(r.name)}><Icon name="x" /></button>
      </div>
    ) : <button className="btn btn-ghost sm" aria-label={`Connect read-only: ${r.name}`} onClick={() => act.toggle(r.name)}><Icon name="plus" />Connect read-only</button>) : <Icon name="chevron" />) },
  ];
  return (
    <Page mod="integrations" acts={manage ? <button className="btn btn-secondary" data-tour="integrations-sync" onClick={act.syncAll}><Icon name="refresh" />Sync all</button> : undefined}>
      <KpiStrip label="Integration summary">
        <KpiTile label="Connected" value={conn.length + " / " + INTEGRATIONS.length} caption="Connectors" />
        <KpiTile label="Sync health" value={deg ? deg : "Healthy"} delta={deg ? { tone: "bad", text: "Degraded" } : undefined} caption={deg ? "Connectors need attention" : "Connected connectors"} />
        <KpiTile label="Last sync" value={conn.length ? "4m ago" : "None"} caption="Identity source" />
        <KpiTile label="Access" value={"Read\u2011only"} caption="Least privilege, scoped per connector" />
      </KpiStrip>
      <div className="card" style={{ background: "var(--surface-2)", borderColor: "transparent", flex: "0 0 auto" }}>
        <div className="c-body" style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
          <div className="sectitle" style={{ marginTop: 0 }}>Recommended connection order</div>
          Connect identity first (Arbor Identity), then cloud logs and monitoring, then source control, scanners and training. Connectors are <b>read-only</b> and scoped to the least privilege needed.
        </div>
      </div>
      <div className="card" data-tour="integrations-table" style={{ flex: "1 1 auto" }}>
        <div className="c-body flush scroll" style={{ padding: 0 }}>
          <DataTable<Integration> id="integrations" label="Connectors" rows={rows} rowKey={(r) => r.name} columns={cols} searchText={(r) => `${r.name} ${r.cat} ${r.scope}`}
            tabs={["Connected", "Not connected"].map((st) => ({ key: st, label: st, match: (r: Integration) => r.status === st }))}
            filters={[{ key: "cat", label: "Category", options: cats, get: (r: Integration) => r.cat }]}
            onOpen={(r) => go(`/ws/integrations/${encodeURIComponent(r.name)}`)} exportName="integrations" />
        </div>
      </div>
    </Page>
  );
}
