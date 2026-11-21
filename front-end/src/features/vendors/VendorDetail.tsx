import type { ReactNode } from "react";
import { Chip, Empty, Icon, Page, StatusChip, Table } from "@/components/ui";
import { addMonths, fmtDay, parseDay } from "@/lib/grcSod";
import { useLayer } from "@/hooks/useLayer";
import { wsLog } from "@/lib/audit";
import { bumpData, useApp, useData } from "@/lib/store";
import { useGo } from "@/lib/route";
import { getApproval } from "@/lib/approvals";
import { sodReason } from "@/lib/sod";
import { TIER_CADENCE, personOnly, vFind, vInit, vInitAll, vendorCanManage } from "@/features/vendors/lib/vendors";
import * as svc from "@/features/vendors/services/vendors";
import { WhyNot, attempt } from "@/components/kit/sodKit";
import { openAddCert, openAddFinding, openChangeTier } from "./VendorModals";
import { useSyncExternalStore } from "react";
import { API_ON } from "@/lib/rbac";
import { SodError } from "@/lib/sod";
import { askReason } from "@/components/kit/ReasonDialog";
import { g4Meta } from "@/services/ws";
import { PortalAnswers, SendQuestionnaire } from "./PortalQuestionnaire";


/* eslint-disable @typescript-eslint/no-explicit-any */
/** A service answer as a value, or its refusal as an error (for dialogs that show refusals in place). */
const must = async (p: Promise<svc.Res<any>>): Promise<any> => { const r: any = await p; if (r.ok === false) throw new SodError(r.msg); return r; };
export const scoreColor = (s: number) => (s >= 80 ? "var(--ok-ink)" : s >= 70 ? "var(--warn-ink)" : "var(--bad-ink)");
/** The score band in words, with an icon, so the score never rests on colour alone. Higher is better. */
export const ScoreChip = ({ s }: { s: number }) => s >= 80 ? <Chip cls="ok" icon="check">Acceptable</Chip> : s >= 70 ? <Chip cls="warn" icon="clock">Watch</Chip> : <Chip cls="bad" icon="alert">Poor</Chip>;
/** Dates in the app's format ("14 Feb 2027"); anything that is not a date is shown as it is. */
const dayText = (s: unknown) => { const d = parseDay(s); return d ? fmtDay(d) : String(s ?? ""); };
/** After a reassessment the service stores the tier window ("Due in 12 months"): show the date it means, counted from the last reassessment. */
const dueText = (v: any) => {
  const m = /^Due in (\d+) months$/.exec(String(v.due ?? "")); const last = v.reassessments?.[v.reassessments.length - 1];
  const from = m && last ? parseDay(last.at) : null;
  return from ? fmtDay(addMonths(from, Number(m![1]))) : String(v.due ?? "");
};
const CERT_CHIP: Record<string, [string, string]> = { Valid: ["ok", "check"], Expiring: ["warn", "clock"], Waived: ["warn", "alert"] };
const GATE_CHIP: Record<string, [string, string]> = { Approved: ["ok", "check"], Blocked: ["bad", "x"], Pending: ["warn", "clock"] };
const pendingOf = (ref: unknown) => (ref ? getApproval(String(ref))?.status === "Pending" : false);

/** A third party as a page (`/ws/vendors/:id`): score and gate, certificates, findings, monitoring, applications and reassessment history.
 *  Same service calls as the old drawer. Add certificate, flag finding and change tier stay dialogs; reassess and waiver are form pages. */
export function VendorDetail({ id }: { id: string }) {
  useData(); const role = useApp((s) => s.role); const g4 = useSyncExternalStore(g4Meta.subscribe, g4Meta.get, g4Meta.get);
  const L = useLayer(); const go = useGo();
  const back = { href: "/ws/vendors", label: "Third parties" };
  vInitAll(); const v = vFind(id);
  if (!v) return <Page title="Vendor not found" back={back}><Empty icon="vendors" title="No such vendor">There is no vendor with the ID &ldquo;{id}&rdquo;. It may have been removed, or the link may be wrong.</Empty></Page>;
  vInit(v);
  const can = vendorCanManage(role);
  const act = (p: () => Promise<svc.Res<any>>, ok: (r: any) => void) => attempt(L, async () => { const r = await p(); if (r.ok === false) { L.toast(r.msg); return; } ok(r); });
  const myQs = g4.vendorQs.filter((q) => q.vendorId === id).slice().reverse();
  const gate = (decision: "Approved" | "Blocked") => API_ON && decision === "Blocked" ? askReason(L, { title: "Block procurement gate", label: "Reason for blocking", confirm: "Block", danger: true,
    run: async (why) => { await must(svc.setGate(id, "Blocked", why)); return "Procurement gate blocked"; } }) : act(() => svc.setGate(id, decision), (r) => {
    if (r.pending) { wsLog("vendor.gate.approval_requested", r.name + " (Critical tier, 2 approvers needed)", "Vendor"); L.toast(API_ON ? "Critical tier: a second admin or owner must confirm the gate" : "Critical tier: two other approvers must confirm the gate"); bumpData(); return; }
    wsLog("vendor.gate." + decision.toLowerCase(), r.name, "Vendor"); L.toast("Procurement gate " + decision.toLowerCase()); bumpData();
  });
  const sendQ = () => API_ON ? L.openModal("Send security questionnaire", (close) => <SendQuestionnaire vendorId={id} mail={!!g4.mail} contacts={g4.contacts} close={close} />) : act(() => svc.sendQuestionnaire(id), (r) => { wsLog("vendor.questionnaire.sent", r.name, "Vendor"); L.toast("Security questionnaire sent to " + r.name); bumpData(); });
  const gatePend = pendingOf(v.gatePending);
  const gateWhy = !can ? "Read-only: only admin or owner can decide the procurement gate." : gatePend ? (API_ON ? "Awaiting a second approver (Critical tier)." : "Awaiting two approvers (Critical tier).") : sodReason("you requested or added this vendor, so another admin or owner must approve its gate", personOnly(v.requestedBy), personOnly(v.addedBy));
  const manageTitle = can ? undefined : "Only admin or owner can do this";
  const openFindings = v.findings.filter((f: any) => f.status !== "Closed").length;
  const head = (title: string, extra?: ReactNode) => <div className="c-head" style={{ flexWrap: "wrap" }}><h3>{title}</h3>{extra}</div>;
  const gateVal = v.gate === "Approved" || v.gate === "Blocked" ? v.gate : "Pending";

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
                <div><div style={{ fontSize: 13, color: "var(--muted)" }}>Risk score <span style={{ fontSize: 12 }}>(higher is better)</span></div><div style={{ fontSize: 22, fontWeight: 600 }}>{v.score}/100</div><div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}><ScoreChip s={v.score} /><StatusChip s={v.status} /></div></div>
              </div>
              <dl className="meta-grid"><dt>Category</dt><dd>{v.cat}</dd><dt>Tier</dt><dd>{v.tier}</dd><dt>Reassessment cadence</dt><dd>{TIER_CADENCE[v.tier]}</dd><dt>Review due</dt><dd>{dueText(v)}</dd>{API_ON ? null : <><dt>DPA</dt><dd>{v.tier === "Low" ? "Missing" : "On file"}</dd></>}<dt>Procurement gate</dt><dd><Chip cls={GATE_CHIP[gateVal][0]} icon={GATE_CHIP[gateVal][1]}>{gateVal}</Chip></dd></dl>
              <div className="btngrp" style={{ marginTop: 12 }}>
                {v.gate === "Approved" ? null : <button className="btn btn-secondary sm" disabled={!!gateWhy} aria-describedby={gateWhy ? "vg-why" : undefined} onClick={() => gate("Approved")}><Icon name="check" />{v.tier === "Critical" ? "Request approval" : "Approve gate"}</button>}
                <button className="btn btn-secondary sm" disabled={!can} title={manageTitle} onClick={() => gate("Blocked")}><Icon name="x" />Block</button>
              </div>
              {v.gate === "Approved" ? <p className="field help">The gate is already approved. Block it if the vendor should no longer be used.</p> : <WhyNot id="vg-why" text={gateWhy} />}
              {pendingOf(v.tierPending) ? <p className="field help">A tier change is awaiting approval (see Vendor approvals).</p> : null}
              {v.gate === "Blocked" && v.gateReason ? <p className="field help">Blocked: {v.gateReason}</p> : null}
            </div></div>

            <div className="card">{head("Certificates & attestations", <span style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button className="btn btn-secondary sm" disabled={!can} title={manageTitle} onClick={() => go(`/ws/vendors/${encodeURIComponent(id)}/waiver`)}><Icon name="flag" />Request waiver</button>
              <button className="btn btn-secondary sm" disabled={!can} title={manageTitle} onClick={() => openAddCert(L, id)}><Icon name="plus" />Add certificate</button></span>)}
              <div className="c-body flush" style={{ padding: 0 }}>
                {pendingOf(v.waiverPending) ? <p className="field help" style={{ padding: "10px 14px 0" }}>A waiver is awaiting approval by someone other than the requester.</p> : null}
                {v.certs.length ? (
                  <Table cols={[{ t: "Type" }, { t: "Expires" }, { t: "Status" }]}>
                    {v.certs.map((c: any, i: number) => <tr key={i}><td className="strong">{c.type}{c.waiver ? <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Waiver {c.waiver.approvalId}, approved by {c.waiver.approvedBy}: {c.waiver.reason}</div> : null}</td><td>{c.expires}</td><td>{(() => { const [cl, ic] = CERT_CHIP[c.status] || ["bad", "alert"]; return <Chip cls={cl} icon={ic}>{c.status || "Expired"}</Chip>; })()}</td></tr>)}
                  </Table>
                ) : <Empty icon="evidence" title="No certificates">No certificates are on file for this vendor.</Empty>}
              </div></div>

            {API_ON ? (
              <div className="card">{head("Security questionnaire")}<div className="c-body">
                {!myQs.length ? <p className="field help" style={{ margin: 0 }}>{"No questionnaire sent yet. Use Send questionnaire to ask the vendor's contact."}</p> : null}
                {myQs.map((q) => (
                  <div key={q.id} style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span className="strong num">{q.id}</span><StatusChip s={q.status === "Submitted" ? "Complete" : q.status === "Reopened" ? "Review" : "Pending"} />
                      <span className="sub">to {q.contact}, sent {q.at} by {q.sentBy}{q.submittedAt ? `, submitted ${q.submittedAt}` : ""}</span>
                      {q.status === "Submitted" && can && !q.portal ? <button className="btn btn-ghost sm" style={{ marginLeft: "auto" }} onClick={() => askReason(L, { title: "Ask for clarification", label: "What needs clarifying?", max: 500, confirm: "Reopen",
                        run: async (note) => { await svc.reopenVendorQuestionnaire(q.id, note); return "Questionnaire reopened for clarification"; } })}><Icon name="refresh" />Reopen</button> : null}
                    </div>
                    {q.note && q.status === "Reopened" ? <p className="field help">Clarification asked: {q.note}</p> : null}
                    {q.portal ? <PortalAnswers q={q} can={can} /> : q.status !== "Sent" ? <dl className="meta-grid" style={{ marginTop: 8 }}>{q.questions.flatMap((x, i) => [<dt key={"q" + i}>{x.q}</dt>, <dd key={"a" + i}>{q.answers[i] || "—"}</dd>])}</dl> : null}
                  </div>
                ))}
              </div></div>
            ) : null}

            <div className="card">{head("Findings", <><span className="sub">{openFindings} open</span><button className="btn btn-secondary sm" style={{ marginLeft: "auto" }} disabled={!can} title={manageTitle} onClick={() => openAddFinding(L, id)}><Icon name="plus" />Flag finding</button></>)}
              <div className="c-body flush" style={{ padding: 0 }}>
                {v.findings.length ? (
                  <Table cols={[{ t: "ID" }, { t: "Finding" }, { t: "Severity" }, { t: "Status" }, { t: "" }]}>
                    {v.findings.map((f: any, fi: number) => (
                      <tr key={fi}><td className="strong num">{f.id}</td><td>{f.title}</td><td><StatusChip s={f.sev} /></td><td><StatusChip s={f.status} /></td>
                        <td className="r">{f.status !== "Closed" ? <button className="btn btn-ghost sm" disabled={!can} aria-label={`Close finding ${f.id}`} onClick={() => API_ON ? askReason(L, { title: "Close finding " + f.id, label: "How was it resolved?", confirm: "Close finding", run: async (why) => { await must(svc.closeFinding(id, fi, why)); return "Finding closed"; } })
                          : act(() => svc.closeFinding(id, fi), (r) => { wsLog("vendor.finding.closed", r.title, "Vendor"); L.toast("Finding closed"); bumpData(); })}><Icon name="check" />Close</button> : null}</td></tr>
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
              {!v.apps.length ? <p className="field help" style={{ margin: 0, padding: 14 }}>No applications discovered yet. Discovery arrives with the integrations.</p> : null}
              <Table cols={[{ t: "App" }, { t: "Users" }, { t: "Status" }]}>
                {v.apps.map((a: any, i: number) => <tr key={i}><td className="strong">{a.name}</td><td className="num">{a.users}</td><td>{a.sanctioned ? <Chip cls="ok" icon="check">Sanctioned</Chip> : <Chip cls="warn" icon="alert">Shadow IT</Chip>}</td></tr>)}
              </Table>
            </div></div>
            {v.reassessments.length ? (
              <div className="card">{head("Reassessment history")}<div className="c-body flush" style={{ padding: 0 }}>
                <Table cols={[{ t: "Date" }, { t: "By" }, { t: "Score" }, { t: "Outcome" }]}>
                  {v.reassessments.slice().reverse().map((a: any, i: number) => <tr key={i}><td style={{ whiteSpace: "nowrap" }}>{dayText(a.at)}</td><td>{a.by}</td><td className="num">{a.score}/100</td><td>{a.outcome}</td></tr>)}
                </Table>
              </div></div>
            ) : null}
          </aside>
        </div>
      </div>
    </Page>
  );
}
