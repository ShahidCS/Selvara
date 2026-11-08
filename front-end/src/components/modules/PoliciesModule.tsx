import { Icon, Page, StatusChip, Table, activate } from "@/components/ui";
import { DATA } from "@/lib/data";
import { useData } from "@/lib/store";
import { useLayer } from "@/hooks/useLayer";
import { polInit } from "@/services/policies";
import { openPolicyDrawer, openPolicyForm } from "./policies/PolicyLayers";

/** Policies: register, versioning and approval workflow (source REND.policies, lines 2252-2284). */
export default function PoliciesModule() {
  useData();
  const L = useLayer();
  DATA.policies.forEach(polInit);
  return (
    <Page mod="policies" acts={<button className="btn btn-primary" onClick={() => openPolicyForm(L)}><Icon name="plus" />New policy</button>}>
      <div className="card" style={{ flex: "1 1 auto" }}>
        <div className="c-body flush scroll" style={{ padding: 0 }}>
          <Table cols={[{ t: "ID" }, { t: "Policy" }, { t: "Version" }, { t: "Owner" }, { t: "Next review" }, { t: "Status" }, { t: "" }]}>
            {DATA.policies.map((p) => (
              <tr key={p.id} className="clickable" {...activate(() => openPolicyDrawer(L, p.id))}>
                <td className="strong num">{p.id}</td><td>{p.name}</td><td>{p.ver}</td><td>{p.owner}</td><td>{p.review}</td><td><StatusChip s={p.status} /></td><td className="r"><Icon name="chevron" /></td>
              </tr>
            ))}
          </Table>
        </div>
      </div>
    </Page>
  );
}
