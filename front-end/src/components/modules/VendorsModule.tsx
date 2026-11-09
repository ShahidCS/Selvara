import { Icon, Kpi, Page, StatusChip, Table, activate } from "@/components/ui";
import { DATA } from "@/lib/data";
import { wsLog } from "@/lib/audit";
import { bumpData, useApp, useData, useModState } from "@/lib/store";
import { VENDOR_REQS } from "@/lib/requests";
import { VENDOR_TIERS, TIER_TONE, personOnly, vInitAll, vendorCanManage } from "@/lib/vendors";
import { getApproval } from "@/lib/approvals";
import { sodReason } from "@/lib/sod";
import { useLayer } from "@/hooks/useLayer";
import * as svc from "@/services/vendors";
import { ApprovalsPanel, WhyNot, attempt } from "./sodKit";
import { openVendorDrawer, scoreColor } from "./vendors/VendorDrawer";
import { openVendorCreate } from "./vendors/VendorModals";

/* Hook for other modules: `useVendorDrawer()` opens the vendor drawer by id (see vendors/VendorDrawer.tsx). */
export { useVendorDrawer } from "./vendors/VendorDrawer";

export default function VendorsModule() {
  useData();
  const L = useLayer();
  const role = useApp((s) => s.role);
  const [tierRaw, setTier] = useModState<string>("vendors.tier", "All");
  const vt = VENDOR_TIERS.includes(tierRaw) ? tierRaw : "All";
  vInitAll();
  const canManage = vendorCanManage(role);
  const approve = (id: string) => attempt(L, async () => {
    const r = await svc.approveRequest(id); if (r.ok === false) { L.toast(r.msg); return; }
    if (r.pending) { wsLog("vendor.request.approval_requested", r.name + " (Critical tier, 2 approvers needed)", "Vendor"); L.toast("Critical tier: two other approvers must confirm before " + r.name + " is added"); bumpData(); return; }
    wsLog("vendor.request.approved", r.name + " → added to inventory", "Vendor"); L.toast(r.name + " added to the vendor inventory"); bumpData();
  });
  const dismiss = (id: string) => attempt(L, async () => {
    const r = await svc.dismissRequest(id); if (r.ok === false) { L.toast(r.msg); return; }
    wsLog("vendor.request.dismissed", r.name, "Vendor"); L.toast("Request dismissed"); bumpData();
  });
  const list = vt === "All" ? DATA.vendors : DATA.vendors.filter((v) => v.tier === vt);
  return (
    <Page mod="vendors" acts={<button className="btn btn-primary" disabled={!canManage} title={canManage ? undefined : "Only admin or owner can add vendors"} onClick={() => openVendorCreate(L)}><Icon name="plus" />Add vendor</button>}>
      {canManage ? <ApprovalsPanel prefix="vendor." title="Vendor approvals (four-eyes)" /> : null}
      <div className="kpis" style={{ marginBottom: 12 }}>
        {VENDOR_TIERS.map((t) => {
          const vs = DATA.vendors.filter((v) => v.tier === t); const due = vs.filter((v) => /Overdue/.test(v.due)).length;
          return <Kpi key={t} icon="vendors" label={t + " tier"} value={vs.length} tone={TIER_TONE[t] || "neutral"} style={{ cursor: "pointer" }} aria-label={`${t} tier: ${vs.length} vendors. ${vt === t ? "Clear filter" : "Filter the list"}`} {...activate(() => setTier(vt === t ? "All" : t))}
            sub={<div className="kpi-sub" style={due ? { color: "var(--bad-ink)" } : undefined}>{due ? due + " overdue" : "On schedule"}</div>} />;
        })}
      </div>
      {VENDOR_REQS.length && canManage ? (
        <div className="card" style={{ marginBottom: 12, borderColor: "color-mix(in srgb,var(--accent) 30%,var(--line))" }}>
          <div className="c-head"><h3>New vendor requests</h3><span className="tag" style={{ marginLeft: 6 }}>{VENDOR_REQS.length}</span></div>
          <div className="c-body flush" style={{ padding: 0 }}>
            <Table cols={[{ t: "Request" }, { t: "Vendor" }, { t: "Purpose" }, { t: "Requested by" }, { t: "" }]}>
              {VENDOR_REQS.map((r) => {
                const waiting = getApproval(r.pendingApproval)?.status === "Pending";
                const why = waiting ? "Awaiting two approvers (Critical tier)." : sodReason("you raised this request, so another admin or owner must approve it", personOnly(r.requester));
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
          <Table cols={[{ t: "Vendor" }, { t: "Category" }, { t: "Tier" }, { t: "Risk score" }, { t: "Review due" }, { t: "Status" }, { t: "" }]}>
            {list.map((v) => (
              <tr key={v.id} className="clickable" {...activate(() => openVendorDrawer(L, v.id))}>
                <td className="strong">{v.name}</td><td>{v.cat}</td><td><StatusChip s={v.tier === "Critical" ? "High" : v.tier} /></td>
                <td><span style={{ fontWeight: 600, color: scoreColor(v.score) }}>{v.score}</span><span style={{ color: "var(--muted)" }}>/100</span></td>
                <td>{/Overdue/.test(v.due) ? <span style={{ color: "var(--bad-ink)", fontWeight: 500 }}>{v.due}</span> : v.due}</td>
                <td><StatusChip s={v.status} /></td><td className="r"><Icon name="chevron" /></td>
              </tr>
            ))}
          </Table>
        </div>
      </div>
    </Page>
  );
}
