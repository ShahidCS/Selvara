import { API_ON } from "@/lib/rbac";
import { ModuleTip } from "@/components/kit/ModuleTip";
import { Chip, DataTable, Icon, KpiStrip, KpiTile, Page, StatusChip, type DTColumn } from "@/components/ui";
import { DATA } from "@/lib/data";
import { useApp, useData } from "@/lib/store";
import { hasRole } from "@/lib/sod";
import { polInit, policyState, openExceptions, workVersion, exceptionState } from "@/features/policies/services/policies";
import { useGo, useRoute } from "@/lib/route";
import { PolicyDetail } from "./PolicyDetail";
import { PolicyFormPage } from "./PolicyFormPage";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Policy = any;
/** Policies: register, versioning and the named-approver workflow (contract: docs/security/SOD_MATRIX.md sections 3 and 5). */
/** `/ws/policies` is the register; `/new`, `/:id` and `/:id/edit` are pages. */
export default function PoliciesModule({ param: propParam }: { param?: string | null }) {
  const route = useRoute();
  const param = propParam ?? route.param;
  if (param === "new") return <PolicyFormPage />;
  if (param && route.sub === "edit") return <PolicyFormPage id={param} />;
  if (param) return <PolicyDetail id={param} />;
  return <PoliciesList />;
}

function PoliciesList() {
  useData();
  const go = useGo();
  const role = useApp((s) => s.role);
  DATA.policies.forEach(polInit);
  const canCreate = hasRole(role, "admin", "owner");
  const STATES = Array.from(new Set<string>(DATA.policies.map((p: Policy) => policyState(p))));
  const owners = Array.from(new Set(DATA.policies.map((p: Policy) => String(p.owner)))).sort();
  const cols: DTColumn<Policy>[] = [
    { key: "id", header: "ID", value: (p) => p.id, locked: true, render: (p) => <span className="strong num">{p.id}</span> },
    { key: "name", header: "Policy", value: (p) => p.name, render: (p) => p.name },
    { key: "ver", header: "Version", value: (p) => p.ver, render: (p) => p.ver },
    { key: "owner", header: "Owner", value: (p) => p.owner, render: (p) => p.owner },
    { key: "review", header: "Next review", value: (p) => p.review, sortBy: (p) => Date.parse(p.review) || Number.MAX_SAFE_INTEGER, render: (p) => p.review },
    { key: "status", header: "Status", value: (p) => policyState(p), render: (p) => {
      const w = workVersion(p); const ex = openExceptions(p);
      return (
        <><StatusChip s={policyState(p)} />{w && p.status === "Active" ? <> <Chip cls="warn" icon="clock">v{w.ver} {w.status.toLowerCase()}</Chip></> : null}
          {ex.length ? <> <Chip cls="bad" icon="alert">{ex.some((x) => exceptionState(x) === "Overdue") ? "Emergency approval overdue" : "Emergency: approval pending"}</Chip></> : null}</>
      );
    } },
  ];
  return (
    <Page mod="policies" acts={<button className="btn btn-primary" disabled={!canCreate} title={canCreate ? undefined : "Read-only for your role: employees read and acknowledge, auditors read."} onClick={() => go("/ws/policies/new")}><Icon name="plus" />New policy</button>}>
      <ModuleTip mod="policies" force={API_ON && !DATA.policies.length} />
      <KpiStrip label="Policy summary">
        <KpiTile label="Policies" value={DATA.policies.length} caption="In the library" />
        <KpiTile label="Active" value={DATA.policies.filter((p) => p.status === "Active").length} caption="Approved and in force" />
        <KpiTile label="Review due" value={DATA.policies.filter((p) => policyState(p) === "Review due").length} delta={DATA.policies.some((p) => policyState(p) === "Review due") ? { tone: "watch", text: "Due now" } : { tone: "good", text: "Up to date" }} caption="Active, past the review date" />
        <KpiTile label="Emergency approvals" value={DATA.policies.filter((p) => openExceptions(p).length).length} delta={DATA.policies.some((p) => openExceptions(p).length) ? { tone: "bad", text: "Needs action" } : { tone: "good", text: "None open" }} caption="Awaiting a second approver" />
      </KpiStrip>
      <div className="card" style={{ flex: "1 1 auto" }}>
        <div className="c-body flush scroll" style={{ padding: 0 }}>
          <DataTable<Policy> id="policies" label="Policies" rows={DATA.policies} rowKey={(p) => p.id} columns={cols} searchText={(p) => `${p.id} ${p.name} ${p.owner}`}
            tabs={STATES.map((s) => ({ key: s, label: s, match: (p: Policy) => policyState(p) === s }))}
            filters={[{ key: "owner", label: "Owner", options: owners, get: (p: Policy) => p.owner }]}
            onOpen={(p) => go(`/ws/policies/${encodeURIComponent(p.id)}`)} exportName="policies" />
        </div>
      </div>
    </Page>
  );
}
