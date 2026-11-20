import { DataTable, Icon, KpiCard, Page, StatusChip, Table, type DTColumn } from "@/components/ui";
import { DATA } from "@/lib/data";
import { API_ON } from "@/lib/rbac";
import { SodError } from "@/lib/sod";
import { askReason } from "@/components/kit/ReasonDialog";
import { ModuleTip } from "@/components/kit/ModuleTip";
import { wsLog } from "@/lib/audit";
import { bumpData, useApp, useData, useModState } from "@/lib/store";
import { VENDOR_REQS } from "@/lib/requests";
import { VENDOR_TIERS, personOnly, vInitAll, vendorCanManage } from "@/features/vendors/lib/vendors";
import { getApproval } from "@/lib/approvals";
import { sodReason } from "@/lib/sod";
import { useLayer } from "@/hooks/useLayer";
import * as svc from "@/features/vendors/services/vendors";
import { ApprovalsPanel, WhyNot, attempt } from "@/components/kit/sodKit";
import { useGo, useRoute } from "@/lib/route";
import { VendorDetail, scoreColor } from "./VendorDetail";
import { ReassessFormPage, VendorFormPage, WaiverFormPage } from "./VendorForms";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Vendor = any;
/** `/ws/vendors` is the register; `/new`, `/:id`, `/:id/reassess` and `/:id/waiver` are pages. */
export default function VendorsModule() {
  const { param, sub } = useRoute();
  if (param === "new") return <VendorFormPage />;
  if (param && sub === "reassess") return <ReassessFormPage id={param} />;
  if (param && sub === "waiver") return <WaiverFormPage id={param} />;
  if (param) return <VendorDetail id={param} />;
  return <VendorsList />;
}

function VendorsList() {
  useData();
  const L = useLayer(); const go = useGo();
  const role = useApp((s) => s.role);
  const [tierRaw, setTier] = useModState<string>("vendors.tier", "All");
  const vt = VENDOR_TIERS.includes(tierRaw) ? tierRaw : "All";
  vInitAll();
  const canManage = vendorCanManage(role);
  const approve = (id: string) => attempt(L, async () => {
    const r = await svc.approveRequest(id); if (r.ok === false) { L.toast(r.msg); return; }
    if (r.pending) { wsLog("vendor.request.approval_requested", r.name + " (Critical tier, 2 approvers needed)", "Vendor"); L.toast(API_ON ? "Critical tier: a second admin or owner must confirm before " + r.name + " is added" : "Critical tier: two other approvers must confirm before " + r.name + " is added"); bumpData(); return; }
    wsLog("vendor.request.approved", r.name + " → added to inventory", "Vendor"); L.toast(r.name + " added to the vendor inventory"); bumpData();
  });
  const dismiss = (id: string) => API_ON ? askReason(L, { title: "Dismiss vendor request", label: "Reason (the requester is told)", confirm: "Dismiss", danger: true,
    run: async (why) => { const r = await svc.dismissRequest(id, why); if (r.ok === false) throw new SodError(r.msg); return "Request dismissed"; } }) : attempt(L, async () => {
    const r = await svc.dismissRequest(id); if (r.ok === false) { L.toast(r.msg); return; }
    wsLog("vendor.request.dismissed", r.name, "Vendor"); L.toast("Request dismissed"); bumpData();
  });
  const list = vt === "All" ? DATA.vendors : DATA.vendors.filter((v) => v.tier === vt);
  const cats = Array.from(new Set<string>(DATA.vendors.map((v: Vendor) => String(v.cat)))).sort();
  const statuses = Array.from(new Set<string>(DATA.vendors.map((v: Vendor) => String(v.status)))).sort();
  const cols: DTColumn<Vendor>[] = [
    { key: "name", header: "Vendor", value: (v) => v.name, locked: true, render: (v) => <span className="strong">{v.name}</span> },
    { key: "cat", header: "Category", value: (v) => v.cat, render: (v) => v.cat },
    { key: "tier", header: "Tier", value: (v) => v.tier, sortBy: (v) => { const i = VENDOR_TIERS.indexOf(v.tier); return i < 0 ? 99 : i; }, render: (v) => <StatusChip s={v.tier === "Critical" ? "High" : v.tier} /> },
    { key: "score", header: "Risk score", value: (v) => v.score, render: (v) => <><span style={{ fontWeight: 600, color: scoreColor(v.score) }}>{v.score}</span><span style={{ color: "var(--muted)" }}>/100</span></> },
    { key: "due", header: "Review due", value: (v) => v.due, sortBy: (v) => { const m = /Overdue (\d+)d/.exec(v.due); if (m) return -Number(m[1]); const t = Date.parse(v.due); return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t; }, render: (v) => (/Overdue/.test(v.due) ? <span style={{ color: "var(--bad-ink)", fontWeight: 500 }}>{v.due}</span> : <>{v.due}</>) },
    { key: "status", header: "Status", value: (v) => v.status, render: (v) => <StatusChip s={v.status} /> },
  ];
  return (
    <Page mod="vendors" acts={<button className="btn btn-primary" disabled={!canManage} title={canManage ? undefined : "Only admin or owner can add vendors"} onClick={() => go("/ws/vendors/new")}><Icon name="plus" />Add vendor</button>}>
      <ModuleTip mod="vendors" force={API_ON && !DATA.vendors.length} />
      {canManage ? <ApprovalsPanel prefix="vendor." title="Vendor approvals (four-eyes)" /> : null}
      <div className="kpis" style={{ marginBottom: 12 }} role="group" aria-label="Vendors by tier">
        {VENDOR_TIERS.map((t) => {
          const vs = DATA.vendors.filter((v) => v.tier === t); const due = vs.filter((v) => /Overdue/.test(v.due)).length;
          return <KpiCard key={t} icon="vendors" label={`${t} tier`} value={vs.length} sub={due ? `${due} overdue` : "On schedule"} subTone={due ? "bad" : "flat"} pressed={vt === t}
            onClick={() => setTier(vt === t ? "All" : t)} />;
        })}
      </div>
      {VENDOR_REQS.length && canManage ? (
        <div className="card" style={{ flex: "0 0 auto", marginBottom: 12, borderColor: "color-mix(in srgb,var(--accent) 30%,var(--line))" }}>
          <div className="c-head"><h3>New vendor requests</h3><span className="tag" style={{ marginLeft: 6 }}>{VENDOR_REQS.length}</span></div>
          <div className="c-body flush" style={{ padding: 0 }}>
            <Table cols={[{ t: "Request" }, { t: "Vendor" }, { t: "Purpose" }, { t: "Requested by" }, { t: "" }]}>
              {VENDOR_REQS.map((r) => {
                const waiting = getApproval(r.pendingApproval)?.status === "Pending";
                const why = waiting ? (API_ON ? "Awaiting a second approver (Critical tier)." : "Awaiting two approvers (Critical tier).") : sodReason("you raised this request, so another admin or owner must approve it", personOnly(r.requester));
                const crit = r.crit === "Critical";
                return (
                  <tr key={r.id}>
                    <td className="strong num">{r.id}</td>
                    <td className="strong">{r.name}<div style={{ fontSize: 11.5, color: "var(--muted)" }}>{r.cat} · {r.crit} tier{r.data ? <> · <span style={{ color: "var(--warn-ink)" }}>processes our data</span></> : null}</div></td>
                    <td style={{ fontSize: 12.5 }}>{r.reason}</td>
                    <td style={{ fontSize: 12, color: "var(--muted)" }}>{r.requester}<div style={{ fontSize: 11 }}>{r.at}</div></td>
                    <td className="r" style={{ whiteSpace: "nowrap" }}>
                      <button className="btn btn-ghost sm" disabled={!!why} aria-describedby={why ? "vrw-" + r.id : undefined} aria-label={`${crit ? "Request approval to add" : "Add"} ${r.name} to inventory`} onClick={() => approve(r.id)}><Icon name="check" />{crit ? "Request approval" : "Add to inventory"}</button>
                      <button className="btn btn-ghost sm" disabled={waiting} aria-label={`Dismiss request ${r.id}`} onClick={() => dismiss(r.id)}>Dismiss</button>
                      <WhyNot id={"vrw-" + r.id} text={why} />
                    </td>
                  </tr>
                );
              })}
            </Table>
          </div>
        </div>
      ) : null}
      <div className="card" style={{ flex: "1 1 auto" }}>
        <div className="c-head"><h3>Third parties{vt !== "All" ? ` · ${vt} tier` : ""}</h3>{vt !== "All" ? <button className="btn btn-ghost sm" style={{ marginLeft: "auto" }} onClick={() => setTier("All")}><Icon name="x" />Clear filter</button> : null}</div>
        <div className="c-body flush scroll" style={{ padding: 0 }}>
          <DataTable<Vendor> id="vendors" label="Third parties" rows={list} rowKey={(v) => v.id} columns={cols} searchText={(v) => `${v.name} ${v.cat} ${v.tier} ${v.status}`}
            filters={[{ key: "cat", label: "Category", options: cats, get: (v: Vendor) => v.cat }, { key: "status", label: "Status", options: statuses, get: (v: Vendor) => v.status }]}
            onOpen={(v) => go(`/ws/vendors/${encodeURIComponent(v.id)}`)} exportName="vendors" />
        </div>
      </div>
    </Page>
  );
}
