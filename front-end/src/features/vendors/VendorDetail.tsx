import type { ReactNode } from "react";
import { Chip, Empty, Icon, Page, Ring, StatusChip, Table } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { wsLog } from "@/lib/audit";
import { bumpData, useApp, useData } from "@/lib/store";
import { useGo } from "@/lib/route";
import { getApproval } from "@/lib/approvals";
import { sodReason } from "@/lib/sod";
import { TIER_CADENCE, personOnly, vFind, vInit, vendorCanManage } from "@/features/vendors/lib/vendors";
import * as svc from "@/features/vendors/services/vendors";
import { WhyNot, attempt } from "@/components/kit/sodKit";
import { openAddCert, openAddFinding, openChangeTier } from "./VendorModals";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const scoreColor = (s: number) => (s >= 80 ? "var(--ok-ink)" : s >= 70 ? "var(--warn-ink)" : "var(--bad-ink)");
const pendingOf = (ref: unknown) => (ref ? getApproval(String(ref))?.status === "Pending" : false);

/** A third party as a page (`/ws/vendors/:id`): score and gate, certificates, findings, monitoring, applications and reassessment history.
 *  Same service calls as the old drawer. Add certificate, flag finding and change tier stay dialogs; reassess and waiver are form pages. */
export function VendorDetail({ id }: { id: string }) {
  useData(); const role = useApp((s) => s.role);
  const L = useLayer(); const go = useGo();
  const back = { href: "/ws/vendors", label: "Third parties" };
  const v = vFind(id);
  if (!v) return <Page title="Vendor not found" back={back}><Empty icon="vendors" title="No such vendor">There is no vendor with the ID &ldquo;{id}&rdquo;. It may have been removed, or the link may be wrong.</Empty></Page>;
  vInit(v);
  const can = vendorCanManage(role);
  const act = (p: () => Promise<svc.Res<any>>, ok: (r: any) => void) => attempt(L, async () => { const r = await p(); if (r.ok === false) { L.toast(r.msg); return; } ok(r); });
  const gate = (decision: "Approved" | "Blocked") => act(() => svc.setGate(id, decision), (r) => {
    if (r.pending) { wsLog("vendor.gate.approval_requested", r.name + " (Critical tier, 2 approvers needed)", "Vendor"); L.toast("Critical tier: two other approvers must confirm the gate"); bumpData(); return; }
    wsLog("vendor.gate." + decision.toLowerCase(), r.name, "Vendor"); L.toast("Procurement gate " + decision.toLowerCase()); bumpData();
  });
  const sendQ = () => act(() => svc.sendQuestionnaire(id), (r) => { wsLog("vendor.questionnaire.sent", r.name, "Vendor"); L.toast("Security questionnaire sent to " + r.name); bumpData(); });
  const gatePend = pendingOf(v.gatePending);
  const gateWhy = !can ? "Read-only: only admin or owner can decide the procurement gate." : gatePend ? "Awaiting two approvers (Critical tier)." : sodReason("you requested or added this vendor, so another admin or owner must approve its gate", personOnly(v.requestedBy), personOnly(v.addedBy));
  const manageTitle = can ? undefined : "Only admin or owner can do this";
  const openFindings = v.findings.filter((f: any) => f.status !== "Closed").length;
  const head = (title: string, extra?: ReactNode) => <div className="c-head"><h3>{title}</h3>{extra}</div>;

  return (
    <Page title={v.name} sub={`${v.cat}, ${v.tier} tier`} back={back} acts={<>
      <StatusChip s={v.status} />
      <button className="btn btn-secondary" disabled={!can} title={manageTitle} onClick={sendQ}><Icon name="ext" />Send questionnaire</button>
      <button className="btn btn-secondary" disabled={!can} title={manageTitle} onClick={() => openChangeTier(L, id)}><Icon name="frameworks" />Change tier</button>
      <button className="btn btn-primary" disabled={!can} title={manageTitle} onClick={() => go(`/ws/vendors/${encodeURIComponent(id)}/reassess`)}><Icon name="refresh" />Reassess</button>
    </>}>
      <div className="scroll rec-scroll">
        <div className="rec-grid">
          <div className="rec-main">
            <div className="card">{head("Risk and procurement gate")}<div className="c-body">
              <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 12 }}>
                <Ring pct={v.score} size={76} color={scoreColor(v.score)} />
                <div><div style={{ fontSize: 13, color: "var(--muted)" }}>Risk score</div><div style={{ fontSize: 22, fontWeight: 600 }}>{v.score}/100</div><div style={{ marginTop: 4 }}><StatusChip s={v.status} /></div></div>
              </div>
              <dl className="meta-grid"><dt>Category</dt><dd>{v.cat}</dd><dt>Tier</dt><dd>{v.tier}</dd><dt>Reassessment cadence</dt><dd>{TIER_CADENCE[v.tier]}</dd><dt>Review due</dt><dd>{v.due}</dd><dt>DPA</dt><dd>{v.tier === "Low" ? "Missing" : "On file"}</dd><dt>Procurement gate</dt><dd><StatusChip s={v.gate === "Approved" ? "Approved" : v.gate === "Blocked" ? "Rejected" : "Pending"} /></dd></dl>
              <div className="btngrp" style={{ marginTop: 12 }}>
                <button className="btn btn-secondary sm" disabled={!!gateWhy} aria-describedby={gateWhy ? "vg-why" : undefined} onClick={() => gate("Approved")}><Icon name="check" />{v.tier === "Critical" ? "Request approval" : "Approve gate"}</button>
                <button className="btn btn-secondary sm" disabled={!can} title={manageTitle} onClick={() => gate("Blocked")}><Icon name="x" />Block</button>
              </div>
              <WhyNot id="vg-why" text={gateWhy} />
              {pendingOf(v.tierPending) ? <p className="field help">A tier change is awaiting approval (see Vendor approvals).</p> : null}
            </div></div>

            <div className="card">{head("Certificates & attestations", <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button className="btn btn-secondary sm" disabled={!can} title={manageTitle} onClick={() => go(`/ws/vendors/${encodeURIComponent(id)}/waiver`)}><Icon name="flag" />Request waiver</button>
              <button className="btn btn-secondary sm" disabled={!can} title={manageTitle} onClick={() => openAddCert(L, id)}><Icon name="plus" />Add certificate</button></span>)}
              <div className="c-body flush" style={{ padding: 0 }}>
                {pendingOf(v.waiverPending) ? <p className="field help" style={{ padding: "10px 14px 0" }}>A waiver is awaiting approval by someone other than the requester.</p> : null}
                {v.certs.length ? (
                  <Table cols={[{ t: "Type" }, { t: "Expires" }, { t: "Status" }]}>
                    {v.certs.map((c: any, i: number) => <tr key={i}><td className="strong">{c.type}{c.waiver ? <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Waiver {c.waiver.approvalId}, approved by {c.waiver.approvedBy}: {c.waiver.reason}</div> : null}</td><td>{c.expires}</td><td>{c.status === "Waived" ? <Chip cls="warn" icon="alert">Waived</Chip> : <StatusChip s={c.status === "Valid" ? "Active" : c.status === "Expiring" ? "Review" : "Overdue"} />}</td></tr>)}
                  </Table>
                ) : <Empty icon="evidence" title="No certificates">No certificates are on file for this vendor.</Empty>}
              </div></div>

            <div className="card">{head("Findings", <><span className="sub">{openFindings} open</span><button className="btn btn-secondary sm" style={{ marginLeft: "auto" }} disabled={!can} title={manageTitle} onClick={() => openAddFinding(L, id)}><Icon name="plus" />Flag finding</button></>)}
              <div className="c-body flush" style={{ padding: 0 }}>
                {v.findings.length ? (
                  <Table cols={[{ t: "ID" }, { t: "Finding" }, { t: "Severity" }, { t: "Status" }, { t: "" }]}>
                    {v.findings.map((f: any, fi: number) => (
                      <tr key={fi}><td className="strong num">{f.id}</td><td>{f.title}</td><td><StatusChip s={f.sev} /></td><td><StatusChip s={f.status} /></td>
                        <td className="r">{f.status !== "Closed" ? <button className="btn btn-ghost sm" disabled={!can} aria-label={`Close finding ${f.id}`} onClick={() => act(() => svc.closeFinding(id, fi), (r) => { wsLog("vendor.finding.closed", r.title, "Vendor"); L.toast("Finding closed"); bumpData(); })}><Icon name="check" />Close</button> : null}</td></tr>
                    ))}
                  </Table>
                ) : <Empty icon="check" title="No findings">No open findings for this vendor.</Empty>}
              </div></div>
          </div>

          <aside className="rec-side">
            <div className="card">{head("Continuous monitoring")}<div className="c-body">
              {v.monitoring.length ? v.monitoring.map((a: any, i: number) => (
                <div key={i} className="feed-item"><span className="dot" style={{ marginTop: 5, background: a.level === "Review" ? "var(--warn-ink)" : "var(--accent)" }} /><div className="fi"><div className="ft">{a.signal}</div><div className="fm">{a.at}</div></div>{a.level === "Review" ? <Chip cls="warn" icon="alert">Review</Chip> : <Chip cls="neutral" icon="dot">Info</Chip>}</div>
              )) : <p className="field help" style={{ margin: 0 }}>No monitoring signals. Continuous monitoring is enabled for Critical-tier vendors.</p>}
            </div></div>
            <div className="card">{head("Discovered applications")}<div className="c-body flush" style={{ padding: 0 }}>
              <Table cols={[{ t: "App" }, { t: "Users" }, { t: "Status" }]}>
                {v.apps.map((a: any, i: number) => <tr key={i}><td className="strong">{a.name}</td><td className="num">{a.users}</td><td>{a.sanctioned ? <Chip cls="ok" icon="check">Sanctioned</Chip> : <Chip cls="warn" icon="alert">Shadow IT</Chip>}</td></tr>)}
              </Table>
            </div></div>
            {v.reassessments.length ? (
              <div className="card">{head("Reassessment history")}<div className="c-body flush" style={{ padding: 0 }}>
                <Table cols={[{ t: "Date" }, { t: "By" }, { t: "Score" }, { t: "Outcome" }]}>
                  {v.reassessments.slice().reverse().map((a: any, i: number) => <tr key={i}><td>{a.at}</td><td>{a.by}</td><td className="num">{a.score}/100</td><td>{a.outcome}</td></tr>)}
                </Table>
              </div></div>
            ) : null}
          </aside>
        </div>
      </div>
    </Page>
  );
}
