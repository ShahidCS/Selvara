import { DataTable, Empty, Page, type DTColumn } from "@/components/ui";
import { API_ON } from "@/lib/rbac";
import { useData } from "@/lib/store";
import { useGo } from "@/lib/route";
import { myEngagements, sharedOf } from "@/services/audits";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Eng = any;
const windowOf = (a: Eng) => (API_ON && a.access?.until ? `${a.access.from} to ${a.access.until}` : String(a.period ?? ""));
const openIrs = (a: Eng) => (a.irs ?? []).filter((r: any) => r.status === "Open").length;

/** The Overview of an external auditor: their engagements whose access is live, never the company's posture figures (the server sends an
 *  auditor none). Each row opens the engagement, where the items shared with them are listed. */
export function AuditorOverview() {
  useData(); const go = useGo();
  const rows = myEngagements();
  const cols: DTColumn<Eng>[] = [
    { key: "name", header: "Engagement", value: (a) => a.name, locked: true, render: (a) => <span className="strong">{a.name}</span> },
    { key: "fw", header: "Framework", value: (a) => a.fw, render: (a) => a.fw },
    { key: "window", header: "Access", value: (a) => windowOf(a), render: (a) => windowOf(a) },
    { key: "controls", header: "Controls shared", value: (a) => sharedOf(a).controls.length, align: "end", render: (a) => <span className="num">{sharedOf(a).controls.length}</span> },
    { key: "evidence", header: "Evidence shared", value: (a) => sharedOf(a).evidence.length, align: "end", render: (a) => <span className="num">{sharedOf(a).evidence.length}</span> },
    { key: "policies", header: "Policies shared", value: (a) => sharedOf(a).policies.length, align: "end", render: (a) => <span className="num">{sharedOf(a).policies.length}</span> },
    { key: "irs", header: "Open information requests", value: (a) => openIrs(a), align: "end", render: (a) => <span className="num">{openIrs(a)}</span> },
  ];
  return (
    <Page title="Your engagements" sub="You see each engagement's framework and the controls, evidence and policies management shares with it, while your access is live.">
      <div className="card" style={{ flex: "1 1 auto" }}><div className="c-body flush scroll" style={{ padding: 0 }}>
        {rows.length ? (
          <DataTable<Eng> id="auditor-engagements" label="Your engagements" rows={rows} rowKey={(a) => a.id} columns={cols} searchText={(a) => `${a.name} ${a.fw}`}
            onOpen={(a) => go("/ws/audits/" + encodeURIComponent(a.id))} exportName="engagements" />
        ) : <Empty icon="audits" title="No engagement with live access">When management gives you access to an engagement, it appears here with what they share with you.</Empty>}
      </div></div>
    </Page>
  );
}
