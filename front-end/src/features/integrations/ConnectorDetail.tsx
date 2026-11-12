import { Chip, Empty, Icon, Page } from "@/components/ui";
import { useApp, useData } from "@/lib/store";
import { useGo } from "@/lib/route";
import * as svc from "@/features/integrations/services/integrations";
import { HealthChip, useIntegrationActions } from "./IntegrationUI";

/** A connector as a page (`/ws/integrations/:name`). Same actions as the old drawer; disconnecting is audited by the caller. */
export function ConnectorDetail({ name }: { name: string }) {
  useData();
  const go = useGo(); const act = useIntegrationActions();
  const manage = svc.intCanManage(useApp((s) => s.role));
  const back = { href: "/ws/integrations", label: "Integrations" };
  const r = svc.intFind(name);
  if (!r) return <Page title="Connector not found" back={back}><Empty icon="access" title="No such connector">There is no connector called &ldquo;{name}&rdquo;.</Empty></Page>;
  return (
    <Page title={r.name} sub={`${r.cat}, ${r.type}`} back={back} acts={<>
      {r.status === "Connected" ? <HealthChip h={r.health} /> : <Chip cls="neutral" icon="dot">Not connected</Chip>}
      {manage ? (r.status === "Connected" ? (<>
        <button className="btn btn-secondary" onClick={() => act.sync(r.name)}><Icon name="refresh" />Sync now</button>
        <button className="btn btn-ghost" onClick={() => { act.toggle(r.name); go(back.href); }}><Icon name="x" />Disconnect</button>
      </>) : <button className="btn btn-primary" onClick={() => act.toggle(r.name)}><Icon name="plus" />Connect read-only</button>) : null}
    </>}>
      <div className="scroll rec-scroll">
        <div className="rec-grid">
          <div className="rec-main">
            <div className="card"><div className="c-head"><h3>Data use</h3></div><div className="c-body">
              <p className="field help" style={{ margin: 0 }}>Data is pulled read-only to evaluate controls and tests. Selvara does not write back except to approved remediation ticketing connectors. Synthetic sample for the prototype.</p>
            </div></div>
          </div>
          <aside className="rec-side">
            <div className="card"><div className="c-head"><h3>Details</h3></div><div className="c-body">
              <dl className="meta-grid"><dt>Category</dt><dd>{r.cat}</dd><dt>Type</dt><dd>{r.type}</dd><dt>Access scope</dt><dd>{r.scope}</dd><dt>Last sync</dt><dd>{r.lastSync}</dd><dt>Records pulled</dt><dd>{r.records}</dd></dl>
            </div></div>
          </aside>
        </div>
      </div>
    </Page>
  );
}
