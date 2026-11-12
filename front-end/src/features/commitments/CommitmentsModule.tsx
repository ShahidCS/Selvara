import { DataTable, Icon, Page, StatusChip, Table, type DTColumn } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { DATA } from "@/lib/data";
import { wsLog } from "@/lib/audit";
import { adminLog } from "@/lib/adminAudit";
import { hasRole } from "@/lib/sod";
import { bumpData, useApp, useData } from "@/lib/store";
import { INCIDENT, STANDARD_TERMS } from "@/lib/trustData";
import * as svc from "@/features/commitments/services/commitments";
import { attempt } from "@/components/kit/sodKit";
import { ImportContractForm, StartIncidentForm, openAnalysis } from "./CommitmentLayers";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Commitment = any;
/** Commitments, standard terms and incident mode (source REND.commitments, lines 3479-3495). */
export default function CommitmentsModule() {
  useData();
  const L = useLayer();
  const can = hasRole(useApp((s) => s.role), "admin", "owner");
  const why = can ? undefined : "Only admin or owner can start or close an incident.";
  const cols: DTColumn<Commitment>[] = [
    { key: "name", header: "Commitment", value: (c) => c.name, locked: true, render: (c) => <span className="strong">{c.name}</span> },
    { key: "detail", header: "Detail", value: (c) => c.detail, render: (c) => c.detail },
    { key: "status", header: "Status", value: (c) => c.status, render: (c) => <StatusChip s={c.status} /> },
  ];
  const closeIncident = () => attempt(L, async () => {
    await svc.closeIncident();
    wsLog("incident.closed", "incident resolved", "Policy");
    adminLog("incident.closed", "incident resolved", { categories: ["Incident"], basis: "Legal obligation" });
    L.toast("Incident closed"); bumpData();
  });
  const banner = INCIDENT.active ? (
    <div className="card" style={{ background: "var(--bad-bg,var(--warn-bg))", borderColor: "transparent", marginBottom: 12 }}>
      <div className="c-body" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 10, color: "var(--bad-ink)" }} role="alert">
        <Icon name="alert" />
        <div style={{ flex: "1 1 auto" }}><div style={{ fontWeight: 600 }}>Incident mode active</div><div style={{ fontSize: 12.5 }}>Breach clock started {INCIDENT.started}{INCIDENT.startedBy ? " by " + INCIDENT.startedBy : ""}. Customer notice obligations are in effect (48h).</div></div>
        <button className="btn btn-secondary sm" disabled={!can} title={why} onClick={closeIncident}><Icon name="check" />Close incident</button>
      </div>
    </div>
  ) : null;
  return (
    <Page mod="commitments" acts={INCIDENT.active ? undefined : (
      <>
        <button className="btn btn-secondary" disabled={!can} title={why} onClick={() => L.openModal("Import contract", <ImportContractForm L={L} />)}><Icon name="plus" />Import contract</button>
        <button className="btn btn-primary" disabled={!can} title={why} onClick={() => L.openModal("Start incident clock", <StartIncidentForm L={L} />)}><Icon name="alert" />Start incident</button>
      </>
    )}>
      {banner}
      <div className="scroll" style={{ flex: "1 1 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 14, alignItems: "start", paddingRight: 2 }}>
          <div className="card">
            <div className="c-head"><h3>Commitments</h3><button className="btn btn-ghost sm" style={{ marginLeft: "auto" }} onClick={() => openAnalysis(L)}><Icon name="ext" />Run contract analysis</button></div>
            <div className="c-body flush" style={{ padding: 0 }}>
              <DataTable<Commitment> id="commitments" label="Commitments" rows={DATA.commitments} rowKey={(c) => c.name} columns={cols} searchText={(c) => `${c.name} ${c.detail}`}
                filters={[{ key: "status", label: "Status", options: Array.from(new Set<string>(DATA.commitments.map((c: Commitment) => String(c.status)))), get: (c: Commitment) => c.status }]} exportName="commitments" />
            </div>
          </div>
          <div className="card">
            <div className="c-head"><h3>Standard terms</h3></div>
            <div className="c-body flush" style={{ padding: 0 }}>
              <Table cols={[{ t: "Term" }, { t: "Commitment" }]}>
                {STANDARD_TERMS.map((t) => <tr key={t.term}><td className="strong">{t.term}</td><td>{t.val}</td></tr>)}
              </Table>
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
