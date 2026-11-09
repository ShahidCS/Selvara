import { Chip, Icon, Page, StatusChip, Table, activate } from "@/components/ui";
import { DATA } from "@/lib/data";
import { useApp, useData } from "@/lib/store";
import { useLayer } from "@/hooks/useLayer";
import { hasRole } from "@/lib/sod";
import { polInit, policyState, openExceptions, workVersion, exceptionState } from "@/services/policies";
import { openPolicyDrawer, openPolicyForm } from "./policies/PolicyLayers";

/** Policies: register, versioning and the named-approver workflow (contract: docs/security/SOD_MATRIX.md sections 3 and 5). */
export default function PoliciesModule() {
  useData();
  const L = useLayer();
  const role = useApp((s) => s.role);
  DATA.policies.forEach(polInit);
  const canCreate = hasRole(role, "admin", "owner");
  return (
    <Page mod="policies" acts={<button className="btn btn-primary" disabled={!canCreate} title={canCreate ? undefined : "Read-only for your role: employees read and acknowledge, auditors read."} onClick={() => openPolicyForm(L)}><Icon name="plus" />New policy</button>}>
      <div className="card" style={{ flex: "1 1 auto" }}>
        <div className="c-body flush scroll" style={{ padding: 0 }}>
          <Table cols={[{ t: "ID" }, { t: "Policy" }, { t: "Version" }, { t: "Owner" }, { t: "Next review" }, { t: "Status" }, { t: "" }]}>
            {DATA.policies.map((p) => {
              const w = workVersion(p); const ex = openExceptions(p);
              return (
                <tr key={p.id} className="clickable" {...activate(() => openPolicyDrawer(L, p.id))}>
                  <td className="strong num">{p.id}</td><td>{p.name}</td><td>{p.ver}</td><td>{p.owner}</td><td>{p.review}</td>
                  <td><StatusChip s={policyState(p)} />{w && p.status === "Active" ? <> <Chip cls="warn" icon="clock">v{w.ver} {w.status.toLowerCase()}</Chip></> : null}
                    {ex.length ? <> <Chip cls="bad" icon="alert">{ex.some((x) => exceptionState(x) === "Overdue") ? "Emergency approval overdue" : "Emergency: approval pending"}</Chip></> : null}</td>
                  <td className="r"><Icon name="chevron" /></td>
                </tr>
              );
            })}
          </Table>
        </div>
      </div>
    </Page>
  );
}
