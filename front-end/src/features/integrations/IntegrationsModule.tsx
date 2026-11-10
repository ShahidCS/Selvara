import { Chip, Icon, Kpi, Page, Table, activate } from "@/components/ui";
import { useApp, useData } from "@/lib/store";
import { useLayer } from "@/hooks/useLayer";
import { INTEGRATIONS, intCanManage } from "@/features/integrations/services/integrations";
import { HealthChip, openConnectorDrawer, useIntegrationActions } from "./IntegrationUI";

export default function IntegrationsModule() {
  useData();
  const L = useLayer(); const act = useIntegrationActions();
  const manage = intCanManage(useApp((s) => s.role));
  const conn = INTEGRATIONS.filter((x) => x.status === "Connected"), deg = conn.filter((x) => x.health === "Degraded").length;
  const stop = { onClick: (e: React.MouseEvent) => e.stopPropagation(), onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation() };
  return (
    <Page mod="integrations">
      <div className="scroll" style={{ flex: "1 1 auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingRight: 2 }}>
          <div className="kpis">
            <Kpi icon="access" label="Connected" value={conn.length + " / " + INTEGRATIONS.length} tone="accent" />
            <Kpi icon="check" label="Sync health" value={deg ? deg + " degraded" : "All healthy"} tone={deg ? "bad" : "good"} />
            <Kpi icon="refresh" label="Last sync" value={conn.length ? "4m ago" : "—"} tone="info" sub="Identity source" />
            <Kpi icon="shieldcheck" label="Access" value="Read-only" tone="good" sub="Least privilege" />
          </div>
          <div className="card" style={{ background: "var(--surface-2)", borderColor: "transparent" }}>
            <div className="c-body" style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
              <div className="sectitle" style={{ marginTop: 0 }}>Recommended connection order</div>
              Connect identity first (Arbor Identity), then cloud logs and monitoring, then source control, scanners and training. Connectors are <b>read-only</b> and scoped to the least privilege needed.
            </div>
          </div>
          <div className="card">
            <div className="c-head"><h3>Connectors</h3>{manage ? <button className="btn btn-ghost sm" style={{ marginLeft: "auto" }} onClick={act.syncAll}><Icon name="refresh" />Sync all</button> : null}</div>
            <div className="c-body flush scroll" style={{ padding: 0 }}>
              <Table cols={[{ t: "#" }, { t: "Integration" }, { t: "Category" }, { t: "Scope" }, { t: "Last sync" }, { t: "Records" }, { t: "Status" }, { t: "" }]}>
                {INTEGRATIONS.slice().sort((a, b) => a.order - b.order).map((r) => (
                  <tr key={r.name} className="clickable" {...activate(() => openConnectorDrawer(L, r.name))}>
                    <td className="num" style={{ color: "var(--muted)" }}>{r.order}</td>
                    <td className="strong">{r.name}</td><td>{r.cat}</td>
                    <td style={{ color: "var(--ink-2)", fontSize: 12.5 }}>{r.scope}</td>
                    <td style={{ color: "var(--muted)" }}>{r.lastSync}</td>
                    <td className="num" style={{ color: "var(--muted)" }}>{r.records}</td>
                    <td>{r.status === "Connected" ? <HealthChip h={r.health} /> : <Chip cls="neutral" icon="dot">Not connected</Chip>}</td>
                    <td className="r" {...stop}>
                      {manage ? (r.status === "Connected" ? (
                        <div className="btngrp" style={{ justifyContent: "flex-end" }}>
                          <button className="btn btn-ghost sm" aria-label={`Sync ${r.name}`} onClick={() => act.sync(r.name)}><Icon name="refresh" />Sync</button>
                          <button className="btn btn-ghost sm" aria-label={`Disconnect ${r.name}`} onClick={() => act.toggle(r.name)}><Icon name="x" />Disconnect</button>
                        </div>
                      ) : <button className="btn btn-ghost sm" aria-label={`Connect ${r.name} read-only`} onClick={() => act.toggle(r.name)}><Icon name="plus" />Connect read-only</button>) : <Icon name="chevron" />}
                    </td>
                  </tr>
                ))}
              </Table>
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
