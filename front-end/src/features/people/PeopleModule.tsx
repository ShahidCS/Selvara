import { Chip, DataTable, Icon, KpiStrip, KpiTile, Page, type DTColumn, Avatar } from "@/components/ui";
import { DATA } from "@/lib/data";
import { useApp, useData, useModState } from "@/lib/store";
import { canManagePeople } from "@/services/people";
import { GrantsTable } from "@/features/access";
import { useGo, useRoute } from "@/lib/route";
import { ContractorFormPage } from "./ContractorFormPage";
import { DeviceChip, PersonDetail } from "./PersonDetail";
import { useResetMfa } from "./actions";
import { PendingApprovals } from "@/features/mfa";
import { KINDS } from "@/services/people";
import { sodReason } from "@/lib/sod";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Person = any;
/** `/ws/people` is the register; `/new` and `/:id` are pages. */
export default function PeopleModule() {
  const { param } = useRoute();
  if (param === "new") return <ContractorFormPage />;
  if (param) return <PersonDetail id={param} />;
  return <PeopleList />;
}

function PeopleList() {
  useData();
  const go = useGo(); const resetMfa = useResetMfa();
  const canAct = canManagePeople(useApp((s) => s.role));
  const [v, setV] = useModState<string>("people.view", "People");
  const view = v === "Access" ? "Access" : "People";
  const depts = Array.from(new Set<string>(DATA.people.map((p: Person) => String(p.dept)))).sort();
  const devices = Array.from(new Set<string>(DATA.people.map((p: Person) => String(p.device)))).sort();
  const cols: DTColumn<Person>[] = [
    { key: "name", header: "Name", value: (p) => p.name, locked: true, render: (p) => <span className="person"><Avatar name={p.name} /><span className="strong">{p.name}</span></span> },
    { key: "role", header: "Role", value: (p) => p.role, render: (p) => p.role },
    { key: "dept", header: "Department", value: (p) => p.dept, render: (p) => p.dept },
    { key: "device", header: "Device", value: (p) => p.device, render: (p) => p.device === "Not connected" ? <span style={{ color: "var(--muted)", fontSize: 12 }}>Not connected</span> : <DeviceChip d={p.device} /> },
    { key: "mfa", header: "MFA", value: (p) => (p.mfa ? "Enrolled" : "Not enrolled"), render: (p) => (p.mfa ? <Chip cls="ok" icon="check">Enrolled</Chip> : <Chip cls="neutral" icon="dot">Not enrolled</Chip>) },
    { key: "act", header: "Actions", align: "end", locked: true, render: (p) => (canAct ? (
      <button className="btn btn-ghost sm" data-tour="people-reset-mfa" disabled={!p.mfa || !!sodReason("self-service MFA reset is not allowed, ask another admin", p.name)} title={sodReason("self-service MFA reset is not allowed, ask another admin", p.name) || (p.mfa ? undefined : "Not enrolled in MFA, so there is nothing to reset.")} aria-label={`Reset MFA for ${p.name}`} onClick={() => resetMfa(p.id)}><Icon name="refresh" />Reset MFA</button>
    ) : null) },
  ];
  const noDevices = DATA.people.every((p) => p.device === "Not connected"); // production before a device integration: nothing to score
  const comp = DATA.people.filter((p) => p.device === "Compliant").length, mfa = DATA.people.filter((p) => p.mfa).length, n = DATA.people.length;
  return (
    <Page mod="people">
      <KpiStrip label="People summary">
        <KpiTile label="Workforce" value={n} caption="People on record" />
        <KpiTile label="Device compliant" value={noDevices ? "—" : `${comp}/${n}`} caption={noDevices ? "No device integration connected" : "Managed and up to date"} />
        <KpiTile label="MFA enrolled" value={`${mfa}/${n}`} caption="Second factor set up" />
        <KpiTile label="Unmanaged" value={noDevices ? "—" : n - comp} delta={noDevices ? undefined : n - comp ? { tone: "bad", text: "Needs action" } : { tone: "good", text: "None" }} caption={noDevices ? "Shown once devices are connected" : "Devices not compliant"} />
      </KpiStrip>
      <PendingApprovals kinds={KINDS} title="Pending approvals (MFA reset, offboarding)" subjectLabel="Person" />
      <div className="card" data-tour="people-table">
        <div className="c-head" style={{ padding: "0 8px", gap: 8, flexWrap: "wrap" }}>
          <div className="tabs" role="tablist" data-tour="people-tabs">
            <button className="tab" role="tab" aria-selected={view === "People"} onClick={() => setV("People")}>People &amp; devices</button>
            <button className="tab" role="tab" aria-selected={view === "Access"} onClick={() => setV("Access")}>Access grants</button>
          </div>
          {canAct ? <button className="btn btn-secondary sm" data-tour="people-add" style={{ marginLeft: "auto" }} onClick={() => go("/ws/people/new")}><Icon name="plus" />Add contractor</button> : null}
        </div>
        <div className="c-body flush scroll" style={{ padding: 0 }} id="pplBody">
          {view === "People" ? (
            <DataTable<Person> id="people" label="People" rows={DATA.people} rowKey={(p) => p.id} columns={cols} searchText={(p) => `${p.name} ${p.role} ${p.dept}`}
              filters={[{ key: "dept", label: "Department", options: depts, get: (p: Person) => p.dept }, { key: "device", label: "Device", options: devices, get: (p: Person) => p.device, more: true }, { key: "mfa", label: "MFA", options: ["Enrolled", "Not enrolled"], get: (p: Person) => (p.mfa ? "Enrolled" : "Not enrolled") }]}
              onOpen={(p) => go(`/ws/people/${encodeURIComponent(p.id)}`)} exportName="people" />
          ) : <GrantsTable />}
        </div>
      </div>
    </Page>
  );
}
