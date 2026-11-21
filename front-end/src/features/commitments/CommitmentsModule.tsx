import { DataTable, Icon, KpiStrip, KpiTile, Page, StatusChip, Table, type DTColumn } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { DATA } from "@/lib/data";
import { useSyncExternalStore } from "react";
import { g4Meta } from "@/services/ws";
import { API_ON } from "@/lib/rbac";
import { askReason } from "@/components/kit/ReasonDialog";
import { wsLog } from "@/lib/audit";
import { adminLog } from "@/lib/adminAudit";
import { hasRole } from "@/lib/sod";
import { useApp, useData } from "@/lib/store";
import { INCIDENT, STANDARD_TERMS } from "@/lib/trustData";
import * as svc from "@/features/commitments/services/commitments";
import { ImportContractForm, StartIncidentForm, openAnalysis } from "./CommitmentLayers";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Commitment = any;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-11-21 12:13" (or ISO) as a Date; null when it is not a timestamp. */
const parseStamp = (s: unknown): Date | null => { const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s ?? "")); return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null; };
/** The app's date format plus the time: "21 Nov 2026, 12:13". Anything else is shown as it is. */
const stampText = (s: unknown): string => { const d = s instanceof Date ? s : parseStamp(s); if (!d) return String(s ?? ""); const p = (n: number) => String(n).padStart(2, "0"); return `${p(d.getDate())} ${MON[d.getMonth()]} ${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`; };
/** Commitments, standard terms and incident mode (source REND.commitments, lines 3479-3495). */
export default function CommitmentsModule() {
  useData();
  const L = useLayer();
  const incidents = useSyncExternalStore(g4Meta.subscribe, () => g4Meta.get().incidents, () => g4Meta.get().incidents) as { id: string; summary: string; started: string; startedBy: string; closed: string; closedBy: string; outcome: string }[];
  const can = hasRole(useApp((s) => s.role), "admin", "owner");
  const why = can ? undefined : "Only admin or owner can start or close an incident.";
  const cols: DTColumn<Commitment>[] = [
    { key: "name", header: "Commitment", value: (c) => c.name, locked: true, render: (c) => <span className="strong">{c.name}</span> },
    { key: "detail", header: "Detail", value: (c) => c.detail, render: (c) => c.detail },
    { key: "status", header: "Status", value: (c) => c.status, render: (c) => <StatusChip s={c.status} /> },
    ...(API_ON ? [{ key: "act", header: "", value: () => "", render: (c: Commitment) => (c.status === "Review" && can ? <button className="btn btn-ghost sm" aria-label={"Mark " + c.name + " reviewed"} onClick={() => askReason(L, { title: "Mark reviewed: " + c.name, label: "What did you check?", confirm: "Mark reviewed",
      run: async (note) => { await svc.reviewCommitment(c.id, note); return c.name + " reviewed"; } })}>Mark reviewed</button> : c.reviewedBy ? <span className="sub">by {c.reviewedBy}</span> : null) }] as DTColumn<Commitment>[] : []),
  ];
  const closeIncident = () => API_ON ? askReason(L, { title: "Close incident", label: "Outcome", max: 500, confirm: "Close incident", intro: "Record what happened and whether customers were notified.",
    run: async (outcome) => { await svc.closeIncident(outcome); return "Incident closed"; } }) : askReason(L, { title: "Close incident", label: "", confirm: "Close incident", intro: "This stops the breach-notification clock. Close it only once the incident is resolved and customers who had to be told were notified.",
    run: async () => {
      await svc.closeIncident();
      wsLog("incident.closed", "incident resolved", "Policy");
      adminLog("incident.closed", "incident resolved", { categories: ["Incident"], basis: "Legal obligation" });
      return "Incident closed";
    } });
  /** The notice deadline: the server's in production; in the demonstration 48 hours after the clock started. */
  const started = parseStamp(INCIDENT.started);
  const deadline = INCIDENT.deadline ? stampText(INCIDENT.deadline) : !API_ON && started ? stampText(new Date(started.getTime() + 48 * 3600_000)) : "";
  const banner = INCIDENT.active ? (
    <div className="card" style={{ background: "var(--bad-bg,var(--warn-bg))", borderColor: "transparent", marginBottom: 12 }}>
      <div className="c-body" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 10, color: "var(--bad-ink)" }} role="alert">
        <Icon name="alert" />
        <div style={{ flex: "1 1 auto" }}><div style={{ fontWeight: 600 }}>Incident mode active</div><div style={{ fontSize: 12.5 }}>{INCIDENT.summary ? <div style={{ fontWeight: 500 }}>{INCIDENT.summary}</div> : null}Breach clock started {stampText(INCIDENT.started)}{INCIDENT.startedBy ? " by " + INCIDENT.startedBy : ""}. Customer notice obligations are in effect (48h){deadline ? <>: <strong>notify affected customers by {deadline}</strong></> : ""}.{INCIDENT.overdue ? " The notice deadline has passed." : ""}</div></div>
        <button className="btn btn-secondary sm" disabled={!can} title={why} onClick={closeIncident}><Icon name="check" />Close incident</button>
      </div>
    </div>
  ) : null;
  return (
    <Page mod="commitments" acts={INCIDENT.active ? undefined : (
      <>
        <button className="btn btn-secondary" disabled={!can} title={why} onClick={() => L.openModal("Import contract", <ImportContractForm L={L} />)}><Icon name="plus" />Import contract</button>
        <button className="btn btn-secondary" disabled={!can} title={why} onClick={() => L.openModal("Start incident clock", <StartIncidentForm L={L} />)}><Icon name="alert" />Start incident</button>
      </>
    )}>
      {banner}
      <KpiStrip label="Commitments summary">
        <KpiTile label="Commitments" value={DATA.commitments.length} caption="Made to customers in contracts" />
        <KpiTile label="Standard terms" value={STANDARD_TERMS.length} caption="Offered to every customer" />
        <KpiTile label="Incident mode" value={INCIDENT.active ? "Active" : "Off"} delta={INCIDENT.active ? { tone: "bad", text: "48h notice clock running", icon: "alert" } : { tone: "good", text: "No open incident", icon: "check" }} caption="Breach clock for customer notice" />
      </KpiStrip>
      <div className="scroll" style={{ flex: "1 1 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,340px),1fr))", gap: 14, alignItems: "start", paddingRight: 2 }}>
          <div className="card">
            <div className="c-head"><h3>Commitments</h3><button className="btn btn-ghost sm" style={{ marginLeft: "auto" }} onClick={() => openAnalysis(L)}><Icon name="search" />Run contract analysis</button></div>
            <div className="c-body flush" style={{ padding: 0 }}>
              <DataTable<Commitment> id="commitments" label="Commitments" rows={DATA.commitments} rowKey={(c) => c.id ?? c.name} columns={cols} searchText={(c) => `${c.name} ${c.detail}`}
                filters={[{ key: "status", label: "Status", options: Array.from(new Set<string>(DATA.commitments.map((c: Commitment) => String(c.status)))), get: (c: Commitment) => c.status }]} exportName="commitments" />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card">
            <div className="c-head"><h3>Standard terms</h3></div>
            <div className="c-body flush" style={{ padding: 0 }}>
              <Table cols={[{ t: "Term" }, { t: "Commitment" }]}>
                {STANDARD_TERMS.map((t) => <tr key={t.term}><td className="strong">{t.term}</td><td>{t.val}</td></tr>)}
              </Table>
            </div>
          </div>
          {API_ON && incidents.length ? (
            <div className="card">
              <div className="c-head"><h3>Incident history</h3></div>
              <div className="c-body flush" style={{ padding: 0 }}>
                <Table cols={[{ t: "Incident" }, { t: "Started" }, { t: "Closed" }, { t: "Outcome" }]}>
                  {incidents.map((x) => <tr key={x.id}><td className="strong">{x.id} {x.summary}</td><td>{x.started} by {x.startedBy}</td><td>{x.closed ? `${x.closed} by ${x.closedBy}` : "Open"}</td><td>{x.outcome || "—"}</td></tr>)}
                </Table>
              </div>
            </div>
          ) : null}
          </div>
        </div>
      </div>
    </Page>
  );
}
