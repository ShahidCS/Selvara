import { DataTable, Icon, KpiStrip, KpiTile, Page, StatusChip, type DTColumn } from "@/components/ui";
import { DATA } from "@/lib/data";
import { useApp, useData } from "@/lib/store";
import { useGo, useRoute } from "@/lib/route";
import { evInit, pendingDelete, whyCannotWrite, EVIDENCE_TYPES, REVIEW_STATES } from "@/features/evidence/services/evidence";
import { EvidenceDetail, reviewChip } from "./EvidenceDetail";
import { EvidenceFormPage } from "./EvidenceFormPage";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Ev = any;
/** `/ws/evidence` is the register; `/new`, `/:id` and `/:id/edit` are pages. */
export default function EvidenceModule() {
  const { param, sub } = useRoute();
  if (param === "new") return <EvidenceFormPage />;
  if (param && sub === "edit") return <EvidenceFormPage id={param} />;
  if (param) return <EvidenceDetail id={param} />;
  return <EvidenceList />;
}

function EvidenceList() {
  useData(); useApp((s) => s.role);
  const go = useGo();
  const writeWhy = whyCannotWrite();
  DATA.evidence.forEach(evInit);
  const status = (e: Ev) => String(e.review?.status ?? "Pending review");
  const owners = Array.from(new Set<string>(DATA.evidence.map((e: Ev) => String(e.by)))).sort();
  const cols: DTColumn<Ev>[] = [
    { key: "id", header: "ID", value: (e) => e.id, locked: true, render: (e) => <span className="strong num">{e.id}</span> },
    { key: "name", header: "Evidence", value: (e) => e.name, render: (e) => e.name },
    { key: "type", header: "Type", value: (e) => e.type, render: (e) => e.type },
    { key: "ver", header: "Version", value: (e) => e.ver, render: (e) => `v${e.ver}` },
    { key: "by", header: "Collected by", value: (e) => e.by, render: (e) => e.by },
    { key: "updated", header: "Updated", value: (e) => e.updated, sortBy: (e) => Date.parse(e.updated) || 0, render: (e) => e.updated },
    { key: "review", header: "Review", value: (e) => status(e), render: (e) => <><StatusChip s={reviewChip(status(e))} />{pendingDelete(e) ? <> <span className="tag">Deletion requested</span></> : null}</> },
  ];
  const n = (s: string) => DATA.evidence.filter((e: Ev) => status(e) === s).length;
  return (
    <Page mod="evidence" acts={<button className="btn btn-primary" disabled={!!writeWhy} title={writeWhy || undefined} onClick={() => go("/ws/evidence/new")}><Icon name="plus" />Add evidence</button>}>
      <KpiStrip label="Evidence summary">
        <KpiTile label="Evidence items" value={DATA.evidence.length} caption="On record" />
        <KpiTile label="Awaiting review" value={n("Pending review")} delta={n("Pending review") ? { tone: "bad", text: "Needs a reviewer" } : { tone: "good", text: "None" }} caption="Not yet accepted" />
        <KpiTile label="Accepted" value={n("Accepted")} caption="Reviewed by a second person" />
        <KpiTile label="Rejected" value={n("Rejected")} caption="Needs fixing" />
      </KpiStrip>
      <div className="card" style={{ flex: "1 1 auto" }}>
        <div className="c-body flush scroll" style={{ padding: 0 }} id="evList">
          <DataTable<Ev> id="evidence" label="Evidence" rows={DATA.evidence} rowKey={(e) => e.id} columns={cols} searchText={(e) => `${e.id} ${e.name} ${e.type} ${e.by}`}
            tabs={REVIEW_STATES.map((s) => ({ key: s, label: s, match: (e: Ev) => status(e) === s }))}
            filters={[{ key: "type", label: "Type", options: EVIDENCE_TYPES, get: (e: Ev) => e.type }, { key: "by", label: "Collected by", options: owners, get: (e: Ev) => e.by }]}
            onOpen={(e) => go(`/ws/evidence/${encodeURIComponent(e.id)}`)} exportName="evidence" />
        </div>
      </div>
    </Page>
  );
}
