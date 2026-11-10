/* Vendor drawer (source vendorDrawer + vendorGate / vendorCloseFinding / vendorSendQ). Tabs and in-place actions re-render the open drawer. */
import { useCallback } from "react";
import { Chip, Icon, Ring, StatusChip, Table } from "@/components/ui";
import { useLayer } from "@/components/shell/LayerProvider";
import type { LayerApi } from "@/components/shell/LayerProvider";
import { wsLog } from "@/lib/audit";
import { bumpData, useApp, useData, useModState } from "@/lib/store";
import { getApproval } from "@/lib/approvals";
import { sodReason } from "@/lib/sod";
import { TIER_CADENCE, personOnly, vFind, vInit, vendorCanManage } from "@/features/vendors/lib/vendors";
import * as svc from "@/features/vendors/services/vendors";
import { WhyNot, attempt } from "@/components/kit/sodKit";
import { openAddCert, openAddFinding, openChangeTier, openReassess, openWaiver } from "./VendorModals";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const scoreColor = (s: number) => (s >= 80 ? "var(--ok-ink)" : s >= 70 ? "var(--warn-ink)" : "var(--bad-ink)");
const TAB_IDS = ["over", "certs", "findings", "mon"];

const pendingOf = (ref: unknown) => (ref ? getApproval(String(ref))?.status === "Pending" : false);

function VendorDrawerBody({ id }: { id: string }) {
  useData(); const role = useApp((s) => s.role);
  const L = useLayer();
  const [tabRaw, setTab] = useModState<string>("vendors.tab", "over");
  const tab = TAB_IDS.includes(tabRaw) ? tabRaw : "over";
  const v = vFind(id);
  if (!v) return <p className="field help">Vendor not found.</p>;
  vInit(v);
  const reopen = () => openVendorDrawer(L, id);
  const act = (p: () => Promise<svc.Res<any>>, ok: (r: any) => void) => attempt(L, async () => { const r = await p(); if (r.ok === false) { L.toast(r.msg); return; } ok(r); });
  const can = vendorCanManage(role);
  const gate = (decision: "Approved" | "Blocked") => act(() => svc.setGate(id, decision), (r) => {
    if (r.pending) { wsLog("vendor.gate.approval_requested", r.name + " (Critical tier, 2 approvers needed)", "Vendor"); setTab("over"); L.toast("Critical tier: two other approvers must confirm the gate"); bumpData(); return; }
    wsLog("vendor.gate." + decision.toLowerCase(), r.name, "Vendor"); setTab("over"); L.toast("Procurement gate " + decision.toLowerCase()); bumpData();
  });
  const gatePend = pendingOf(v.gatePending);
  const gateWhy = !can ? "Read-only: only admin or owner can decide the procurement gate." : gatePend ? "Awaiting two approvers (Critical tier)." : sodReason("you requested or added this vendor, so another admin or owner must approve its gate", personOnly(v.requestedBy), personOnly(v.addedBy));
  const tabs: [string, string][] = [["over", "Overview"], ["certs", "Certificates (" + v.certs.length + ")"], ["findings", "Findings (" + v.findings.filter((f: any) => f.status !== "Closed").length + ")"], ["mon", "Monitoring"]];

  let body: React.ReactNode;
  if (tab === "over") {
    body = (
      <>
        <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 12 }}>
          <Ring pct={v.score} size={76} color={scoreColor(v.score)} />
          <div><div style={{ fontSize: 13, color: "var(--muted)" }}>Risk score</div><div style={{ fontSize: 22, fontWeight: 600 }}>{v.score}/100</div><div style={{ marginTop: 4 }}><StatusChip s={v.status} /></div></div>
        </div>
        <dl className="meta-grid"><dt>Category</dt><dd>{v.cat}</dd><dt>Tier</dt><dd>{v.tier}</dd><dt>Reassessment cadence</dt><dd>{TIER_CADENCE[v.tier]}</dd><dt>Review due</dt><dd>{v.due}</dd><dt>DPA</dt><dd>{v.tier === "Low" ? "Missing" : "On file"}</dd><dt>Procurement gate</dt><dd><StatusChip s={v.gate === "Approved" ? "Approved" : v.gate === "Blocked" ? "Rejected" : "Pending"} /></dd></dl>
        <div className="hr" /><div className="sectitle">Procurement approval gate</div>
        <div className="btngrp"><button className="btn btn-secondary sm" disabled={!!gateWhy} aria-describedby={gateWhy ? "vg-why" : undefined} onClick={() => gate("Approved")}><Icon name="check" />{v.tier === "Critical" ? "Request approval" : "Approve"}</button><button className="btn btn-secondary sm" disabled={!can} onClick={() => gate("Blocked")}><Icon name="x" />Block</button></div>
        <WhyNot id="vg-why" text={gateWhy} />
        {pendingOf(v.tierPending) ? <p className="field help">A tier change is awaiting approval (see Vendor approvals).</p> : null}
        <div className="hr" /><div className="sectitle">Discovered applications</div>
        <Table cols={[{ t: "App" }, { t: "Users" }, { t: "Status" }]}>
          {v.apps.map((a: any, i: number) => <tr key={i}><td className="strong">{a.name}</td><td className="num">{a.users}</td><td>{a.sanctioned ? <Chip cls="ok" icon="check">Sanctioned</Chip> : <Chip cls="warn" icon="alert">Shadow IT</Chip>}</td></tr>)}
        </Table>
        {v.reassessments.length ? (
          <>
            <div className="hr" /><div className="sectitle">Reassessment history</div>
            <Table cols={[{ t: "Date" }, { t: "By" }, { t: "Score" }, { t: "Outcome" }]}>
              {v.reassessments.slice().reverse().map((a: any, i: number) => <tr key={i}><td>{a.at}</td><td>{a.by}</td><td className="num">{a.score}/100</td><td>{a.outcome}</td></tr>)}
            </Table>
          </>
        ) : null}
      </>
    );
  } else if (tab === "certs") {
    body = (
      <>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}><div className="sectitle" style={{ margin: 0 }}>Certificates &amp; attestations</div><span style={{ marginLeft: "auto", display: "flex", gap: 6 }}><button className="btn btn-secondary sm" disabled={!can} onClick={() => openWaiver(L, id, reopen)}><Icon name="flag" />Request waiver</button><button className="btn btn-secondary sm" disabled={!can} onClick={() => openAddCert(L, id, reopen)}><Icon name="plus" />Add certificate</button></span></div>
        {pendingOf(v.waiverPending) ? <p className="field help">A waiver is awaiting approval by someone other than the requester.</p> : null}
        {v.certs.length ? (
          <Table cols={[{ t: "Type" }, { t: "Expires" }, { t: "Status" }]}>
            {v.certs.map((c: any, i: number) => <tr key={i}><td className="strong">{c.type}{c.waiver ? <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Waiver {c.waiver.approvalId}, approved by {c.waiver.approvedBy}: {c.waiver.reason}</div> : null}</td><td>{c.expires}</td><td>{c.status === "Waived" ? <Chip cls="warn" icon="alert">Waived</Chip> : <StatusChip s={c.status === "Valid" ? "Active" : c.status === "Expiring" ? "Review" : "Overdue"} />}</td></tr>)}
          </Table>
        ) : <div className="empty"><div className="ei"><Icon name="evidence" /></div><h4>No certificates</h4><p>No certificates are on file for this vendor.</p></div>}
      </>
    );
  } else if (tab === "findings") {
    body = (
      <>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}><div className="sectitle" style={{ margin: 0 }}>Findings</div><button className="btn btn-secondary sm" style={{ marginLeft: "auto" }} disabled={!can} onClick={() => openAddFinding(L, id, reopen)}><Icon name="plus" />Flag finding</button></div>
        {v.findings.length ? (
          <Table cols={[{ t: "ID" }, { t: "Finding" }, { t: "Severity" }, { t: "Status" }, { t: "" }]}>
            {v.findings.map((f: any, fi: number) => (
              <tr key={fi}><td className="strong num">{f.id}</td><td>{f.title}</td><td><StatusChip s={f.sev} /></td><td><StatusChip s={f.status} /></td>
                <td className="r">{f.status !== "Closed" ? <button className="btn btn-ghost sm" disabled={!can} aria-label={`Close finding ${f.id}`} onClick={() => act(() => svc.closeFinding(id, fi), (r) => { wsLog("vendor.finding.closed", r.title, "Vendor"); L.toast("Finding closed"); bumpData(); })}><Icon name="check" />Close</button> : null}</td></tr>
            ))}
          </Table>
        ) : <div className="empty"><div className="ei"><Icon name="check" /></div><h4>No findings</h4><p>No open findings for this vendor.</p></div>}
      </>
    );
  } else {
    body = (
      <>
        <div className="sectitle">Continuous monitoring</div>
        {v.monitoring.length ? v.monitoring.map((a: any, i: number) => (
          <div key={i} className="feed-item"><span className="dot" style={{ marginTop: 5, background: a.level === "Review" ? "var(--warn-ink)" : "var(--accent)" }} /><div className="fi"><div className="ft">{a.signal}</div><div className="fm">{a.at}</div></div>{a.level === "Review" ? <Chip cls="warn" icon="alert">Review</Chip> : <Chip cls="neutral" icon="dot">Info</Chip>}</div>
        )) : <p className="field help">No monitoring signals. Continuous monitoring is enabled for Critical-tier vendors.</p>}
      </>
    );
  }
  return (
    <>
      <div className="tabs" role="tablist" style={{ marginBottom: 12 }}>{tabs.map((t) => <button key={t[0]} className="tab" role="tab" aria-selected={tab === t[0]} onClick={() => setTab(t[0])}>{t[1]}</button>)}</div>
      {body}
    </>
  );
}

function VendorDrawerFoot({ id }: { id: string }) {
  const L = useLayer(); const can = vendorCanManage(useApp((s) => s.role));
  const sendQ = () => attempt(L, async () => {
    const r = await svc.sendQuestionnaire(id); if (r.ok === false) { L.toast(r.msg); return; }
    wsLog("vendor.questionnaire.sent", r.name, "Vendor"); L.toast("Security questionnaire sent to " + r.name); bumpData(); // source leaves the drawer open
  });
  return (
    <>
      <button className="btn btn-secondary" disabled={!can} title={can ? undefined : "Only admin or owner can do this"} onClick={sendQ}><Icon name="ext" />Send questionnaire</button>
      <button className="btn btn-secondary" disabled={!can} title={can ? undefined : "Only admin or owner can do this"} onClick={() => openChangeTier(L, id)}><Icon name="frameworks" />Change tier</button>
      <button className="btn btn-primary" disabled={!can} title={can ? undefined : "Only admin or owner can do this"} onClick={() => openReassess(L, id)}><Icon name="refresh" />Reassess</button>
    </>
  );
}

export function openVendorDrawer(L: LayerApi, id: string) {
  const v = vFind(id);
  if (v) vInit(v);
  L.openDrawer(v ? v.name : "Vendor", v ? v.cat + ", " + v.tier + " tier" : undefined, <VendorDrawerBody key={id} id={id} />, v ? <VendorDrawerFoot id={id} /> : undefined);
}
/** Hook for other modules: `const openVendor = useVendorDrawer(); openVendor("V-ARBO")`. Unknown ids open a "not found" drawer. */
export function useVendorDrawer() {
  const L = useLayer();
  return useCallback((id: string) => openVendorDrawer(L, id), [L]);
}
