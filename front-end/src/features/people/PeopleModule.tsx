import { Chip, Icon, Kpi, Page, StatusChip, Table, activate } from "@/components/ui";
import { DATA } from "@/lib/data";
import { useApp, useData, useModState } from "@/lib/store";
import { useLayer } from "@/hooks/useLayer";
import { canManagePeople } from "@/services/people";
import { GrantsTable } from "@/features/access";
import { ContractorForm } from "./ContractorForm";
import { openPersonDrawer } from "./PersonDrawer";
import { useResetMfa } from "./actions";
import { PendingApprovals } from "@/features/mfa";
import { KINDS } from "@/services/people";
import { sodReason } from "@/lib/sod";

export default function PeopleModule() {
  useData();
  const L = useLayer(); const resetMfa = useResetMfa();
  const canAct = canManagePeople(useApp((s) => s.role));
  const [v, setV] = useModState<string>("people.view", "People");
  const view = v === "Access" ? "Access" : "People";
  const comp = DATA.people.filter((p) => p.device === "Compliant").length, mfa = DATA.people.filter((p) => p.mfa).length, n = DATA.people.length;
  const stop = { onClick: (e: React.MouseEvent) => e.stopPropagation(), onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation() };
  return (
    <Page mod="people">
      <div className="kpis">
        <Kpi icon="people" label="Workforce" value={n} tone="accent" />
        <Kpi icon="check" label="Device compliant" value={comp + "/" + n} tone="good" />
        <Kpi icon="access" label="MFA enrolled" value={mfa + "/" + n} tone="good" />
        <Kpi icon="alert" label="Unmanaged" value={n - comp} tone="bad" />
      </div>
      <PendingApprovals kinds={KINDS} title="Pending approvals (MFA reset, offboarding)" subjectLabel="Person" />
      <div className="card" style={{ flex: "1 1 auto" }}>
        <div className="c-head" style={{ padding: "0 8px", gap: 8 }}>
          <div className="tabs" role="tablist">
            <button className="tab" role="tab" aria-selected={view === "People"} onClick={() => setV("People")}>People &amp; devices</button>
            <button className="tab" role="tab" aria-selected={view === "Access"} onClick={() => setV("Access")}>Access grants</button>
          </div>
          {canAct ? <button className="btn btn-secondary sm" style={{ marginLeft: "auto" }} onClick={() => L.openModal("Add a contractor", (close) => <ContractorForm close={close} />)}><Icon name="plus" />Add contractor</button> : null}
        </div>
        <div className="c-body flush scroll" style={{ padding: 0 }} id="pplBody">
          {view === "People" ? (
            <Table cols={[{ t: "Name" }, { t: "Role" }, { t: "Department" }, { t: "Device" }, { t: "MFA" }, { t: "" }]}>
              {DATA.people.map((p) => (
                <tr key={p.id} className="clickable" {...activate(() => openPersonDrawer(L, p.id))}>
                  <td className="strong">{p.name}</td><td>{p.role}</td><td>{p.dept}</td>
                  <td><StatusChip s={p.device === "Compliant" ? "OK" : p.device === "At risk" ? "Needs evidence" : "Open"} /> <span style={{ color: "var(--muted)", fontSize: 12 }}>{p.device}</span></td>
                  <td>{p.mfa ? <Chip cls="ok" icon="check">Enrolled</Chip> : <Chip cls="neutral" icon="dot">Not enrolled</Chip>}</td>
                  <td className="r" {...stop}>{canAct ? <button className="btn btn-ghost sm" disabled={!p.mfa || !!sodReason("self-service MFA reset is not allowed, ask another admin", p.name)} title={sodReason("self-service MFA reset is not allowed, ask another admin", p.name) || undefined} aria-label={`Reset MFA for ${p.name}`} onClick={() => resetMfa(p.id)}><Icon name="refresh" />Reset MFA</button> : null}</td>
                </tr>
              ))}
            </Table>
          ) : <GrantsTable />}
        </div>
      </div>
    </Page>
  );
}
