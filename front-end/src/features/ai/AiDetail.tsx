/* An AI system as a page (`/ws/ai/:id`) with the same tabs the drawer had: overview, EU AI Act, impact, bias, signals. The short dialogs (guardrail, EU
   classification, impact assessment, bias test, oversight, owner) stay dialogs; the page re-renders from the data store behind them. */
import { Chip, Empty, Icon, Page, StatusChip } from "@/components/ui";
import { useLayer } from "@/components/shell/LayerProvider";
import { getApproval } from "@/lib/approvals";
import { sodReason } from "@/lib/sod";
import { bumpData, useApp, useData, useModState } from "@/lib/store";
import { useGo } from "@/lib/route";
import { AI_GUARDRAILS, aiCanDecide, aiCanManage, aiEuRationale, aiFind, aiForbidden, aiInit, aiLog } from "@/features/ai/lib/ai";
import * as svc from "@/features/ai/services/ai";
import { WhyNot, attempt } from "@/components/kit/sodKit";
import { AiBiasChip, AiEuChip, AiFriaChip, AiGuardChip } from "./AiChips";
import { openAssign, openBias, openEuClassify, openFria, openGuard, openOversight } from "./AiModals";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const AI_TABS: [string, string][] = [["over", "Overview"], ["eu", "EU AI Act"], ["fria", "Impact"], ["bias", "Bias"], ["signals", "Signals"]];
const GATE = <p style={{ fontSize: 12, color: "var(--muted)", margin: "10px 0 0" }}>Read-only — only the AI system owner, an admin or an owner can change this.</p>;
const pendingOf = (ref: unknown) => (ref ? getApproval(String(ref))?.status === "Pending" : false);
const card = (bg: string, extra?: object) => ({ boxShadow: "none", background: bg, borderColor: "transparent", ...extra });

export function AiDetail({ id }: { id: string }) {
  useData(); useApp((s) => s.role);
  const L = useLayer(); const go = useGo();
  const [tabRaw, setTab] = useModState<string>("ai.tab", "over");
  const tab = AI_TABS.some((t) => t[0] === tabRaw) ? tabRaw : "over";
  const a = aiFind(id);
  const back = { href: "/ws/ai", label: "AI governance" };
  if (!a) return <Page title="AI system not found" back={back}><Empty icon="ai" title="No such AI system">There is no AI system with the ID &ldquo;{id}&rdquo;. It may have been archived, or the link may be wrong.</Empty></Page>;
  aiInit(a);
  const manage = aiCanManage(a); const decider = aiCanDecide();
  /** Run a service call; a refusal shows the source toast, an exception a generic one. */
  const act = (p: () => Promise<svc.Res<any>>, ok: (r: any) => void) => attempt(L, async () => { const r = await p(); if (!r.ok) { L.toast(r.msg); return; } ok(r); });

  const tabs = (
    <div className="tabs" role="tablist" style={{ marginBottom: 14 }}>
      {AI_TABS.map((t) => <button key={t[0]} className="tab" role="tab" aria-selected={tab === t[0]} onClick={() => setTab(t[0])}>{t[1]}</button>)}
    </div>
  );

  let body: React.ReactNode = null;
  if (tab === "over") {
    const gr = AI_GUARDRAILS.find((g) => g[0] === a.guardrail) || AI_GUARDRAILS[0];
    const reviewWhy = !decider ? "Completing a review is an approval: only admin or owner can do it." : sodReason("you registered or own this system, so a different admin or owner must complete its review", a.registeredBy, a.owner);
    body = (
      <>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}><span className="tag">{a.lifecycle}</span></div>
        <dl className="meta-grid">
          <dt>Surface</dt><dd>{a.surface}</dd><dt>Model</dt><dd>{a.model}</dd><dt>Provider</dt><dd>{a.provider}</dd><dt>Data it can reach</dt><dd>{a.dataReached}</dd><dt>Autonomy</dt><dd>{a.autonomy}</dd><dt>Users</dt><dd>{a.users}</dd><dt>Discovered by</dt><dd>{a.discovered}</dd>
          {a.tools ? <><dt>Tools &amp; MCP servers</dt><dd>{a.tools}</dd></> : null}
          <dt>Owner</dt><dd>{a.owner}</dd><dt>Added on</dt><dd>{a.added || "-"}</dd><dt>Next review</dt><dd>{a.nextReview || "-"}</dd><dt>Evidence</dt><dd>{a.evidence ? a.evidence : "None attached"}</dd>
        </dl>
        <div className="hr" /><div className="sectitle">Guardrail tier</div>
        <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}><AiGuardChip g={a.guardrail} /></div>
          <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{gr[1]}</div>
          {manage ? <button className="btn btn-ghost sm" style={{ marginTop: 8 }} disabled={pendingOf(a.guardrailPending)} onClick={() => openGuard(L, id)}><Icon name="edit" />{pendingOf(a.guardrailPending) ? "Change awaiting approval" : "Request guardrail change"}</button> : null}
        </div>
        <div className="hr" /><div className="sectitle">ISO/IEC 42001 &amp; EU AI Act obligations</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {a.obligations.map((o: string[]) => <div key={o[0]} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", fontSize: 13 }}><span style={{ color: "var(--ink-2)" }}>{o[0]}</span><Chip cls={o[1] === "Met" ? "ok" : o[1] === "Partial" ? "warn" : "bad"}>{o[1]}</Chip></div>)}
        </div>
        <button className="btn btn-ghost sm" style={{ marginTop: 10 }} onClick={() => go("/ws/frameworks")}><Icon name="frameworks" />Open ISO 42001 / EU AI Act framework</button>
        {manage ? (
          <>
            <div className="hr" /><div className="sectitle">Manage</div>
            <div className="btngrp">
              <button className="btn btn-secondary sm" onClick={() => go(`/ws/ai/${encodeURIComponent(id)}/edit`)}><Icon name="edit" />Edit</button>
              <button className="btn btn-secondary sm" onClick={() => openAssign(L, id)}><Icon name="user" />Assign owner</button>
              <button className="btn btn-secondary sm" onClick={() => act(() => svc.attachEvidence(id), (r) => { aiLog("ai.evidence.attached", a.name); L.toast("Evidence attached to " + r.name); bumpData(); })}><Icon name="evidence" />Attach evidence</button>
              <button className="btn btn-secondary sm" disabled={a.status === "In review" && !!reviewWhy} aria-describedby={a.status === "In review" && reviewWhy ? "ai-rw" : undefined} onClick={() => act(() => svc.toggleReview(id), (r) => { aiLog(r.completed ? "ai.review.completed" : "ai.review.started", a.name); L.toast((r.completed ? "Review completed for " : "Review started for ") + r.name); bumpData(); })}><Icon name="play" />{a.status === "In review" ? "Complete review" : "Start review"}</button>
              <button className="btn btn-danger sm" disabled={pendingOf(a.archivePending)} onClick={() => act(() => svc.archiveSystem(id), (r) => { aiLog("ai.archive.requested", a.name); L.closeLayer(); bumpData(); L.toast("Archive of " + r.name + " requested; a second approver must confirm"); })}><Icon name="archive" />{pendingOf(a.archivePending) ? "Archive awaiting approval" : "Request archive"}</button>
            </div>
            {a.status === "In review" ? <WhyNot id="ai-rw" text={reviewWhy} /> : null}
          </>
        ) : GATE}
      </>
    );
  } else if (tab === "eu") {
    const st = a.euState || { state: "Not classified", draftBy: a.owner };
    const confirmWhy = !decider ? "Confirmation is reserved for an admin or owner." : sodReason("you drafted this classification or own the system, so a different admin or owner must confirm it", ...aiForbidden(a, st.draftBy));
    const canConfirm = manage && st.state === "Draft" && !confirmWhy;
    body = (
      <>
        <div className="sectitle">EU AI Act classification</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          <AiEuChip c={a.euClass} /> {st.state === "Confirmed" ? <Chip cls="ok" icon="check">Confirmed</Chip> : st.state === "Draft" ? <Chip cls="warn" icon="clock">Draft — needs confirming</Chip> : <Chip cls="neutral">Not classified</Chip>}
        </div>
        <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55 }}>{a.euRationale || aiEuRationale(a.euClass)}</p>
        <dl className="meta-grid lstart" style={{ marginTop: 8 }}>
          <dt>Basis</dt><dd>Art. 5 (prohibited), Art. 6 with Annexes I &amp; III (high-risk), Art. 50 (transparency)</dd>
          <dt>Drafted by</dt><dd>{st.draftBy || a.owner}</dd>
          <dt>Confirmed by</dt><dd>{st.state === "Confirmed" ? st.by + (st.at ? " · " + st.at : "") : <span style={{ color: "var(--muted)" }}>Awaiting a second person</span>}</dd>
        </dl>
        {st.state === "Draft" ? <div className="card" style={card("var(--warn-bg)", { marginTop: 10 })}><div className="c-body" style={{ padding: "10px 12px", fontSize: 12.5, color: "var(--warn-ink)" }}>Draft legal determination. It must be confirmed by an admin or owner other than the drafter (and not the system owner) before the tier, guardrail and the ISO 42001 AI-inventory test take effect.</div></div> : null}
        <div className="hr" /><div className="sectitle">What the categories mean</div>
        <dl className="meta-grid lstart"><dt>Prohibited</dt><dd>Unacceptable-risk uses — not permitted.</dd><dt>High-risk</dt><dd>Full obligations: risk management, data governance, documentation, human oversight, logging.</dd><dt>Limited risk</dt><dd>Transparency — users are told they interact with AI.</dd><dt>Minimal risk</dt><dd>No specific obligations; voluntary codes.</dd></dl>
        {manage ? (
          <>
            <div className="btngrp" style={{ marginTop: 14 }}>
              <button className="btn btn-primary sm" onClick={() => openEuClassify(L, id)}><Icon name="shieldcheck" />{st.state === "Not classified" ? "Classify under EU AI Act" : "Re-run classification"}</button>
              {st.state === "Draft" ? <button className="btn btn-secondary sm" disabled={!canConfirm} onClick={() => act(() => svc.confirmEu(id), () => { aiLog("ai.euact.confirmed", a.name); bumpData(); L.toast("Classification confirmed"); })}><Icon name="check" />Confirm classification</button> : null}
            </div>
            {st.state === "Draft" && !canConfirm ? <WhyNot text={confirmWhy} /> : null}
          </>
        ) : GATE}
      </>
    );
  } else if (tab === "fria") {
    const f = a.fria || { status: "Not started", review: "None" }; const rev = f.review || "None";
    const revChip = rev === "Approved" ? <Chip cls="ok" icon="check">Approved</Chip> : rev === "Submitted" ? <Chip cls="warn" icon="clock">Submitted for approval</Chip> : rev === "Changes requested" ? <Chip cls="bad" icon="alert">Changes requested</Chip> : rev === "Draft" ? <Chip cls="neutral">Draft</Chip> : <Chip cls="neutral">Not started</Chip>;
    const approveWhy = !decider ? "Approval is reserved for an admin or owner." : sodReason("you submitted, authored or own this assessment, so a different admin or owner must approve it", ...aiForbidden(a, f.submittedBy, f.by));
    const canApprove = manage && rev === "Submitted" && !approveWhy;
    body = (
      <>
        <div className="sectitle">AI impact assessment (FRIA / DPIA)</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}><AiFriaChip f={f} /> {revChip}</div>
        <dl className="meta-grid lstart"><dt>Completed</dt><dd>{f.date ? f.date : "—"}</dd><dt>Submitted by</dt><dd>{f.submittedBy ? f.submittedBy : "—"}</dd><dt>Approved by</dt><dd>{f.approvedBy ? f.approvedBy : <span style={{ color: "var(--muted)" }}>—</span>}</dd></dl>
        {f.summary ? <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 8, lineHeight: 1.55 }}>{f.summary}</p> : null}
        <div className="card" style={{ boxShadow: "none", background: "var(--surface-2)", marginTop: 10 }}><div className="c-body" style={{ padding: "10px 12px", fontSize: 12, color: "var(--muted)" }}>Approval updates evidence <strong>D-07 (AI system impact assessment)</strong> and counts toward ISO/IEC 42001 clause 6.1.4. The approver must be an admin or owner other than the submitter, the author and the system owner. An approved assessment is never edited in place: changes start a new version.</div></div>
        {rev === "Submitted" ? <div className="card" style={card("var(--warn-bg)", { marginTop: 8 })}><div className="c-body" style={{ padding: "10px 12px", fontSize: 12.5, color: "var(--warn-ink)" }}>Submitted by {f.submittedBy || "—"}, awaiting a second approver.</div></div> : null}
        {manage ? (
          <>
            <div className="btngrp" style={{ marginTop: 12 }}>
              {(rev === "None" || rev === "Draft" || rev === "Changes requested" || rev === "Approved") ? <button className="btn btn-secondary sm" onClick={() => openFria(L, id)}><Icon name="edit" />{rev === "None" ? "Record impact assessment" : rev === "Approved" ? "Start new version (needs approval again)" : "Edit"}</button> : null}
              {(rev === "Draft" || rev === "Changes requested") ? <button className="btn btn-primary sm" onClick={() => act(() => svc.submitFria(id), () => { aiLog("ai.impact_assessment.submitted", a.name); bumpData(); L.toast("Impact assessment submitted for approval"); })}><Icon name="check" />Submit for approval</button> : null}
              {rev === "Submitted" ? (
                <>
                  <button className="btn btn-primary sm" disabled={!canApprove} onClick={() => act(() => svc.approveFria(id), () => { aiLog("ai.impact_assessment.approved", a.name); bumpData(); L.toast("Impact assessment approved; evidence D-07 updated"); })}><Icon name="check" />Approve</button>
                  <button className="btn btn-secondary sm" disabled={!canApprove} onClick={() => act(() => svc.returnFria(id), () => { aiLog("ai.impact_assessment.returned", a.name); bumpData(); L.toast("Returned with changes"); })}>Return with changes</button>
                </>
              ) : null}
            </div>
            {rev === "Submitted" && !canApprove ? <WhyNot text={approveWhy} /> : null}
          </>
        ) : GATE}
      </>
    );
  } else if (tab === "bias") {
    const bz = a.bias;
    body = (
      <>
        <div className="sectitle">Bias &amp; validation testing</div>
        <dl className="meta-grid lstart"><dt>Result</dt><dd><AiBiasChip b={bz} /></dd><dt>Last tested</dt><dd>{bz.last ? bz.last : "—"}</dd></dl>
        {bz.result ? <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 6, lineHeight: 1.55 }}>{bz.result}</p> : null}
        {manage ? <button className="btn btn-secondary sm" style={{ marginTop: 8 }} onClick={() => openBias(L, id)}><Icon name="play" />Log bias / validation test</button> : null}
        <div className="hr" /><div className="sectitle">Human oversight</div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--ink-2)", display: "flex", flexDirection: "column", gap: 5 }}>{a.oversight.map((o: string, k: number) => <li key={k}>{o}</li>)}</ul>
        {manage ? <button className="btn btn-ghost sm" style={{ marginTop: 10 }} onClick={() => openOversight(L, id)}><Icon name="edit" />Edit oversight measures</button> : GATE}
      </>
    );
  } else if (!a.signals.length) {
    body = <><div className="sectitle">Signals</div><p style={{ fontSize: 13, color: "var(--muted)" }}>No open signals for this system. Signals arrive from DLP, vendor monitoring and the device monitor.</p></>;
  } else {
    body = (
      <>
        <div className="sectitle">Signals</div>
        <p className="field help" style={{ margin: "0 0 10px" }}>From DLP, vendor monitoring and the device monitor. The system owner or an admin triages each one.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {a.signals.map((s: any, si: number) => {
            const done = s.status && s.status !== "Open"; const sevc = s.sev === "Review" ? "warn" : s.sev === "Alert" ? "bad" : "info";
            return (
              <div key={si} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "11px 13px" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 5 }}>
                  <Chip cls={sevc}>{s.sev}</Chip><span style={{ fontSize: 11.5, color: "var(--muted)" }}>{s.at} · {s.source}</span>
                  {done ? <Chip cls={s.status === "Dismissed" ? "neutral" : "ok"} icon={s.status === "Dismissed" ? "x" : "check"}>{s.status}</Chip> : null}
                </div>
                <div style={{ fontSize: 13, color: "var(--ink)" }}>{s.text}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Recommended: {s.rec || "Triage and record a decision"}</div>
                {(manage && !done) ? (
                  <div className="btngrp" style={{ marginTop: 9 }}>
                    <button className="btn btn-secondary sm" onClick={() => act(() => svc.signalRaiseRisk(id, si), (r) => { aiLog("ai.signal.risk_raised", a.name); bumpData(); L.toast("Risk " + r.ref + " raised from signal (draft)"); })}><Icon name="risk" />Raise risk</button>
                    <button className="btn btn-secondary sm" onClick={() => act(() => svc.signalRaiseIssue(id, si), (r) => { aiLog("ai.signal.issue_raised", a.name); bumpData(); L.toast("Issue " + r.ref + " raised from signal"); })}><Icon name="flag" />Raise issue</button>
                    <button className="btn btn-ghost sm" onClick={() => act(() => svc.signalDismiss(id, si), () => { aiLog("ai.signal.dismissed", a.name); bumpData(); L.toast("Signal dismissed"); })}>Dismiss</button>
                  </div>
                ) : (done && s.ref ? <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6 }}>→ {s.ref}</div> : null)}
              </div>
            );
          })}
        </div>
        {manage ? null : GATE}
      </>
    );
  }
  return (
    <Page title={a.name} sub={`${a.id} · ${a.purpose}`} back={back} acts={<><AiEuChip c={a.euClass} /><AiGuardChip g={a.guardrail} /><StatusChip s={a.status} /></>}>
      <div className="card" style={{ flex: "1 1 auto" }}>
        <div className="c-body scroll" id="aiDBody">{tabs}<div style={{ maxWidth: 860 }}>{body}</div></div>
      </div>
    </Page>
  );
}
