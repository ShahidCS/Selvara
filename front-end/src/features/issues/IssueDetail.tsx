import { useState } from "react";
import { RecordHistory } from "@/components/kit/RecordHistory";
import { ExplainCard } from "@/components/kit/ExplainCard";
import { explainIssue } from "@/lib/insights";
import { Empty, Icon, Page, Stepper, StatusChip } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { bumpData, useApp, useData } from "@/lib/store";
import { useGo } from "@/lib/route";
import { clampText } from "@/lib/security";
import { wsLog } from "@/lib/audit";
import { iAm } from "@/lib/grcSod";
import * as svc from "@/features/issues/services/issues";
import { useRiskDrawer } from "@/features/risk";
import { DueText, attempt, openAddTask, openDecideClosure, openDelete, openLink, openProposeClosure } from "./IssueLayers";

/* eslint-disable @typescript-eslint/no-explicit-any */
const STEPS = svc.ISSUE_STATUSES.map((s) => ({ key: s, label: s }));

/** An issue as a page (`/ws/issues/:id`): status and closure workflow, root cause, tasks, links. Every action is the same service call as the old drawer;
 *  the short dialogs (closure note, add task, link, delete) remain dialogs. */
export function IssueDetail({ id }: { id: string }) {
  useData(); useApp((s) => s.role);
  const L = useLayer(); const go = useGo(); const openRisk = useRiskDrawer();
  const back = { href: "/ws/issues", label: "Issues" };
  const i: any = svc.issFind(id);
  const [rc, setRc] = useState(() => String(i?.rootCause ?? "")); const [ca, setCa] = useState(() => String(i?.corrective ?? ""));
  if (!i) return <Page title="Issue not found" back={back}><Empty icon="issues" title="No such issue">There is no issue with the ID &ldquo;{id}&rdquo;. It may have been removed, or the link may be wrong.</Empty></Page>;
  svc.issInit(i);
  const doneTasks = i.tasks.filter((t: any) => t.done).length;
  const high = svc.isHighSev(i.sev);
  const writeWhy = svc.whyCannotWrite();
  const pend = svc.pendingClosure(i);
  const verifyWhy = pend ? svc.whyCannotVerify(i) : null;
  const proposeWhy = svc.whyCannotProposeClose(i);
  const delWhy = svc.whyCannotDelete(i);
  const dis = (why: string | null) => ({ disabled: !!why, title: why || undefined });
  const setStatus = (s: string) => attempt(L, async () => { const r = await svc.setIssueStatus(id, s); if (!r) return; L.toast(i.id + " moved to " + s); bumpData(); });
  const saveRca = () => attempt(L, async () => { await svc.saveRca(id, clampText(rc, 2000), clampText(ca, 2000)); wsLog("issue.rca.saved", i.id, "Control"); L.toast("Root cause saved"); });
  const toggle = (ti: number) => attempt(L, async () => { await svc.toggleTask(id, ti); bumpData(); });
  const step = Math.max(0, svc.ISSUE_STATUSES.indexOf(i.status));

  return (
    <Page title={i.title} sub={`${i.id}, owner ${i.owner}`} back={back} acts={<>
      <StatusChip s={i.sev} /><StatusChip s={i.status} />
      <button className="btn btn-ghost" {...dis(writeWhy)} onClick={() => go(`/ws/issues/${encodeURIComponent(id)}/edit`)}><Icon name="edit" />Edit</button>
      <button className="btn btn-ghost" {...dis(delWhy)} onClick={() => openDelete(L, id, () => go("/ws/issues"))}><Icon name="trash" />Delete</button>
    </>}>
      <div className="scroll rec-scroll">
        {pend ? (
          <div className="card" style={{ background: "var(--warn-bg)", borderColor: "var(--warn-ink)", marginBottom: 12 }} role="alert"><div className="c-body" style={{ padding: 12 }}>
            <div style={{ fontWeight: 600 }}><Icon name="clock" /> Closure awaiting verification</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", margin: "3px 0 8px" }}>Proposed by {pend.requestedBy}: {i.closure?.note}</div>
            <div className="btngrp">
              <button className="btn btn-primary btn-decide sm" {...dis(verifyWhy)} onClick={() => openDecideClosure(L, id, "verify")}><Icon name="check" />Verify and close</button>
              <button className="btn btn-secondary sm" {...dis(verifyWhy)} onClick={() => openDecideClosure(L, id, "reject")}><Icon name="x" />Reject</button>
              {iAm(pend.requestedBy) ? <button className="btn btn-ghost sm" onClick={() => attempt(L, async () => { await svc.withdrawClosure(id); L.toast("Closure withdrawn"); bumpData(); })}><Icon name="back" />Withdraw</button> : null}
            </div>
            {verifyWhy ? <p className="field help" style={{ margin: "6px 0 0" }}>{verifyWhy}</p> : null}
          </div></div>
        ) : null}

        <div className="rec-grid">
          <div className="rec-main">
            <div className="card"><div className="c-head"><h3>Progress</h3><span className="sub">{i.status}</span></div>
              <div className="c-body">
                <Stepper label="Issue progress" steps={STEPS} current={step} overdue={/Overdue/.test(i.due) && i.status !== "Closed"} />
                {/* the current status is a state, not a button; only the other statuses are offered as moves */}
                <div className="btngrp" style={{ marginTop: 12, alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>Status</span> <StatusChip s={i.status} />
                  <span style={{ fontSize: 13, color: "var(--muted)", marginLeft: 8 }}>Move to</span>
                  {svc.ISSUE_STATUSES.filter((s) => s !== i.status).map((s) => {
                    const toClosed = s === "Closed" && high;
                    const why = toClosed ? proposeWhy : pend ? "A closure is awaiting verification." : writeWhy;
                    return <button key={s} className="btn btn-secondary sm" disabled={!!why} title={why || undefined} onClick={() => (toClosed ? openProposeClosure(L, id) : setStatus(s))}>{toClosed ? "Propose closure" : s}</button>;
                  })}
                </div>
                {high && i.status !== "Closed" ? <p className="field help" style={{ margin: "8px 0 0" }}>Closing a {i.sev} issue needs a verifier who is not the assignee, the owner or the person proposing, with a verification note.</p> : null}
                {writeWhy ? <p className="field help" style={{ margin: "8px 0 0" }} role="note">{writeWhy}</p> : null}
              </div></div>

            <div className="card"><div className="c-head"><h3>Root cause &amp; corrective action</h3></div><div className="c-body">
              <div className="field"><label htmlFor={`rc-${id}`}>Root cause</label><textarea className="input" id={`rc-${id}`} rows={3} maxLength={2000} style={{ resize: "vertical" }} placeholder="Why did this happen?" value={rc} onChange={(e) => setRc(e.target.value)} /></div>
              <div className="field"><label htmlFor={`ca-${id}`}>Corrective action</label><textarea className="input" id={`ca-${id}`} rows={3} maxLength={2000} style={{ resize: "vertical" }} placeholder="What will prevent recurrence?" value={ca} onChange={(e) => setCa(e.target.value)} /></div>
              <button className="btn btn-secondary sm" {...dis(writeWhy)} onClick={saveRca}><Icon name="check" />Save root cause</button>
            </div></div>

            <div className="card"><div className="c-head"><h3>Tasks</h3><span className="sub">{doneTasks} of {i.tasks.length} done</span></div><div className="c-body">
              {i.tasks.length ? i.tasks.map((t: any, ti: number) => (
                <label key={ti} className="listrow" style={{ border: "1px solid var(--line)", borderRadius: 8, marginBottom: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, padding: "8px 10px" }}>
                  <input type="checkbox" checked={!!t.done} disabled={!!writeWhy} onChange={() => toggle(ti)} />
                  <span style={t.done ? { textDecoration: "line-through", color: "var(--muted)" } : undefined}>{t.text}</span>
                </label>
              )) : <p className="field help">No tasks yet.</p>}
              <button className="btn btn-ghost sm" {...dis(writeWhy)} onClick={() => openAddTask(L, id)}><Icon name="plus" />Add task</button>
            </div></div>
          </div>

          <aside className="rec-side">
            <ExplainCard e={explainIssue(i)} record={{ mod: "issues", id: i.id }} />
            <div className="card"><div className="c-head"><h3>Details</h3></div><div className="c-body">
              <dl className="meta-grid"><dt>Severity</dt><dd><StatusChip s={i.sev} /></dd><dt>Owner</dt><dd>{i.owner}</dd><dt>Due</dt><dd><DueText due={i.due} />{i.dueDate ? <span style={{ color: "var(--muted)" }}> ({i.dueDate})</span> : null}</dd><dt>Status</dt><dd><StatusChip s={i.status} /></dd>
                {delWhy && !writeWhy ? <><dt>Delete</dt><dd style={{ color: "var(--muted)" }}>{delWhy}</dd></> : null}
                {i.verification ? <><dt>Verified closure</dt><dd>{i.verification.by} on {i.verification.at}: {i.verification.note} (proposed by {i.verification.proposedBy})</dd></> : null}</dl>
            </div></div>
            <div className="card"><div className="c-head"><h3>Linked controls &amp; risks</h3></div><div className="c-body">
              <div className="btngrp" style={{ marginBottom: 8 }}>
                {i.linkedControls.length + i.linkedRisks.length === 0 ? <span style={{ color: "var(--muted)", fontSize: 13 }}>Nothing linked</span> : null}
                {i.linkedControls.map((c: string) => <button key={"c" + c} className="fchip" onClick={() => go(`/ws/controls/${encodeURIComponent(c)}`)}><Icon name="controls" />{c}</button>)}
                {i.linkedRisks.map((r: string) => <button key={"r" + r} className="fchip" onClick={() => openRisk(r)}><Icon name="risk" />{r}</button>)}
              </div>
              <div className="btngrp">
                <button className="btn btn-ghost sm" {...dis(writeWhy)} onClick={() => openLink(L, id, "control")}><Icon name="controls" />Link control</button>
                <button className="btn btn-ghost sm" {...dis(writeWhy)} onClick={() => openLink(L, id, "risk")}><Icon name="risk" />Link risk</button>
              </div>
            </div></div>
            <RecordHistory id={id} />
          </aside>
        </div>
      </div>
    </Page>
  );
}
