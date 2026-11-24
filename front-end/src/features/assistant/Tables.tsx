import { useEffect, useState } from "react";
import { Chip, DataTable, Icon, Segmented, type DTColumn } from "@/components/ui";
import { AgentCards, AgentLists, AgentSummary } from "./AgentsOverview";
import { LayerFoot, useLayer } from "@/components/shell/LayerProvider";
import { wsLog } from "@/lib/audit";
import { bumpData, setModState, useModState } from "@/lib/store";
import * as svc from "@/features/assistant/services/assistant";
import { AUTONOMY, CERT, REJECTED_AFTER, RUNG_HELP, certDate, certState, nextRung, trackRecord, type Rung } from "@/features/assistant/lib/autonomy";
import { getApproval } from "@/lib/approvals";
import { WhyNot, attempt } from "@/components/kit/sodKit";
import { askReason } from "@/components/kit/ReasonDialog";
import { API_ON } from "@/lib/rbac";

type Agent = (typeof svc.ASST.agents)[number];
type Run = (typeof svc.ASST.runs)[number];
type Mcp = (typeof svc.ASST.mcp)[number];

/** Prototype: "agents" view. */
export function AgentsTab({ manage }: { manage: boolean }) {
  const L = useLayer(); const fail = (m: string) => L.toast(m, false);
  const run = (id: string) => attempt(L, async () => {
    const r = await svc.runAgent(id); if (!r) return fail("Agent not found");
    if ((r as { nothing?: boolean }).nothing) { L.toast(r.agent.name + " ran: nothing to do (see the run log)"); setModState("assistant.view", "log"); bumpData(); return; }
    wsLog("assistant.agent.run", r.agent.name, "System");
    L.toast(r.agent.name + " ran" + (r.suggest ? " — awaiting approval" : ""));
    setModState("assistant.view", "log"); bumpData();
  });
  const toggle = (id: string) => attempt(L, async () => {
    const r = await svc.toggleAgent(id); if (!r) return fail("Agent not found");
    if (r.pending) { wsLog("assistant.agent.enable_requested", r.agent.name, "System"); L.toast("Enabling " + r.agent.name + " needs approval from a different admin or owner"); bumpData(); return; }
    wsLog("assistant.agent.paused", r.agent.name, "System"); bumpData();
  });
  const lower = (a: Agent) => attempt(L, async () => { const r = await svc.lowerAutonomy(a.id); if (!r) return fail("Agent not found"); L.toast(`${r.name} now ${r.autonomy.toLowerCase()}`); bumpData(); });
  const raise = (a: Agent) => L.openModal(`Raise autonomy: ${a.name}`, () => <RaiseForm id={a.id} />);
  const recert = (a: Agent) => L.openModal(`Recertify: ${a.name}`, () => <RecertForm id={a.id} />);
  useEffect(() => { if (svc.sweepCertifications().length) bumpData(); }, []);
  const [view, setView] = useModState<"cards" | "table">("assistant.agentsView", "cards");
  const del = (a0: Agent) => askReason(L, { title: `Delete ${a0.name}?`, label: "", danger: true, confirm: "Delete agent",
    intro: "The agent stops running. This cannot be undone.",
    run: async () => { const a = await svc.deleteAgent(a0.id); if (!a) throw new Error("Agent not found"); wsLog("assistant.agent.deleted", a.name, "System"); return "Agent deleted"; } });
  const autonomyCell = (a: Agent) => {
      const pending = !!a.pendingAutonomy && getApproval(a.pendingAutonomy)?.status === "Pending";
      const up = nextRung(a.autonomy);
      const n = svc.trackSetting(); const t = up && n && !pending ? trackRecord(a, svc.ASST.runs, n) : null;
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {a.autonomy === "Suggests only" ? <Chip cls="neutral" icon="dot">{a.autonomy}</Chip> : <Chip cls="info" icon="check">{a.autonomy}</Chip>}
            {pending ? <Chip cls="warn" icon="clock">Raise requested</Chip> : null}
            <CertChip a={a} />
          </div>
          {t ? <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{t.approved} of {n} approved suggestions</span> : null}
          {manage && !pending && a.status !== "Pending approval" ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>{up
              ? <button className="btn btn-ghost sm" aria-label={`Raise autonomy: ${a.name}`} onClick={() => raise(a)}>Raise</button>
              : <>
                {a.pendingRecert && getApproval(a.pendingRecert)?.status === "Pending" ? null : <button className="btn btn-ghost sm" aria-label={`Recertify: ${a.name}`} onClick={() => recert(a)}>Recertify</button>}
                <button className="btn btn-ghost sm" aria-label={`Lower to suggests only: ${a.name}`} title="Lower to suggests only" onClick={() => lower(a)}>Lower</button>
              </>}</div>) : null}
        </div>
      );
  };
  const actionsCell = (a: Agent) => (manage ? (
      <div className="btngrp" style={{ justifyContent: "flex-end", flexWrap: "nowrap", whiteSpace: "nowrap" }}>
        <button className="btn btn-ghost sm" disabled={a.status !== "Active"} title={a.status === "Active" ? "Run now" : "Only an active agent can run"} aria-label={`Run ${a.name} now`} onClick={() => run(a.id)}><Icon name="play" /></button>
        <button className="btn btn-ghost sm" disabled={a.status === "Pending approval"} title={a.status === "Pending approval" ? "Waiting for a different admin or owner to approve" : undefined} onClick={() => toggle(a.id)}>{a.status === "Active" ? "Pause" : a.status === "Pending approval" ? "Awaiting approval" : "Request enable"}</button>
        <button className="btn btn-ghost sm" title="Delete agent" aria-label={`Delete agent ${a.name}`} onClick={() => del(a)}><Icon name="trash" /></button>
      </div>
    ) : <span style={{ color: "var(--faint)", fontSize: 12 }}>View only</span>);
  const cols: DTColumn<Agent>[] = [
    { key: "name", header: "Agent", value: (a) => a.name, locked: true, render: (a) => <span className="strong">{a.name}</span> },
    { key: "trigger", header: "Trigger", value: (a) => a.trigger, render: (a) => a.trigger },
    { key: "runsAs", header: "Runs as", value: (a) => a.runsAs, render: (a) => a.runsAs },
    { key: "autonomy", header: "Autonomy", value: (a) => a.autonomy, render: (a) => autonomyCell(a) },
    { key: "last", header: "Last run", value: (a) => a.last, render: (a) => <span style={{ color: "var(--muted)" }}>{a.last}</span> },
    { key: "status", header: "Status", value: (a) => a.status, render: (a) => (a.status === "Active" ? <Chip cls="ok" icon="check">Active</Chip> : a.status === "Pending approval" ? <Chip cls="warn" icon="clock">Pending approval</Chip> : <Chip cls="neutral" icon="dot">Paused</Chip>) },
    { key: "act", header: "Actions", hideHeader: true, align: "end", locked: true, render: (a) => actionsCell(a) },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="field help" style={{ margin: 0 }}>Enabling or raising an agent needs a different admin or owner.
      <details style={{ marginTop: 4 }}>
        <summary style={{ cursor: "pointer", width: "fit-content" }}>How autonomy works</summary>
        <p style={{ margin: "6px 0 0" }}>Agents run on triggers with least-privilege access. Creating or resuming an agent needs approval from a different admin or owner. Every agent starts at &quot;Suggests only&quot;, where a person approves each change. It can be raised to &quot;Acts (logged)&quot; after {svc.trackSetting() ? `${svc.trackSetting()} approved suggestions and no recent rejection` : "approval (no track record is required in this workspace)"}, with approval from a different admin or owner (two for an agent that runs as a service account). Lowering is immediate, and rejecting a change an agent applied lowers it automatically. An acting agent must be recertified every {CERT.VALID_DAYS} days or it drops to &quot;Suggests only&quot; before its next run.{API_ON ? " A run reads the records its trigger names (for example failing controls), and the AI drafts a note to their owners; the note is sent once approved. Agents run when someone selects Run now: scheduled runs need the platform scheduler, which is not set up yet." : ""}</p>
      </details></div>
      <AgentSummary manage={manage} />
      <AgentLists />
      <div style={{ display: "flex", justifyContent: "flex-end" }}><Segmented<"cards" | "table"> label="Show agents as" value={view} onChange={(v) => setView(v)} options={[{ value: "cards", label: "Cards" }, { value: "table", label: "Table" }]} /></div>
      {view === "cards" ? <AgentCards rows={svc.ASST.agents} autonomy={autonomyCell} actions={actionsCell} /> : (
      <DataTable<Agent> id="agents" label="Agents" rows={svc.ASST.agents} rowKey={(a) => a.id} columns={cols} searchText={(a) => `${a.name} ${a.trigger} ${a.runsAs}`}
        tabs={["Active", "Pending approval", "Paused"].map((st) => ({ key: st, label: st, match: (a: Agent) => a.status === st }))} exportName="agents" />
      )}
    </div>
  );
}

/** Certification of an acting agent: transition (acting before the ladder), due soon, valid, or a recertification in progress. Never colour alone. */
function CertChip({ a }: { a: Agent }) {
  const st = certState(a);
  if (a.pendingRecert && getApproval(a.pendingRecert)?.status === "Pending") return <Chip cls="warn" icon="clock">Recertification requested</Chip>;
  if (st === "transition") return <Chip cls="warn" icon="alert">Recertify by {certDate(a.certifiedUntil as number)}</Chip>;
  if (st === "due") return <Chip cls="warn" icon="clock">Recertification due {certDate(a.certifiedUntil as number)}</Chip>;
  if (st === "valid") return <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Certified until {certDate(a.certifiedUntil as number)}</span>;
  return null;
}

/** Ask to recertify an acting agent for another period (four-eyes; two approvers for a service account). */
function RecertForm({ id }: { id: string }) {
  const L = useLayer(); const a = svc.findAgent(id);
  const [reason, setReason] = useState(""); const [err, setErr] = useState("");
  if (!a) return <p className="field help">Agent not found.</p>;
  const why = svc.recertBlockReason(a); const need = svc.raiseApprovers(a); const st = certState(a);
  const go = () => attempt(L, async () => {
    if (reason.trim().length < AUTONOMY.REASON_MIN) { setErr(`Give a reason of at least ${AUTONOMY.REASON_MIN} characters.`); return; }
    const r = await svc.requestRecertify(id, reason); if (!r) { L.toast("Agent not found", false); return; }
    L.closeLayer(); L.toast(`Recertifying ${r.agent.name} needs approval from ${need === 2 ? "two different admins or owners" : "a different admin or owner"}`); bumpData();
  });
  return (
    <>
      <div>
        <dl className="meta-grid lstart">
          <dt>Acts as</dt><dd>{a.autonomy}, runs as {a.runsAs}</dd>
          <dt>Certified</dt><dd>{st === "transition" ? `Never: acting before the ladder, transition ends ${certDate(a.certifiedUntil as number)}` : a.certifiedUntil ? `Until ${certDate(a.certifiedUntil)}${a.certifiedBy ? `, by ${a.certifiedBy}` : ""}` : "No"}</dd>
          <dt>Renewal</dt><dd>{CERT.VALID_DAYS} days from approval</dd>
          <dt>Approvers needed</dt><dd>{need === 2 ? "Two (it runs as a service account)" : "One"}</dd>
        </dl>
        {why ? <p className="field help" id="rc-why" style={{ color: "var(--bad-ink)", marginTop: 10 }}>{why}</p> : (
          <div className="field" style={{ marginTop: 10 }}><label htmlFor="rc-reason">Attestation <span style={{ color: "var(--bad-ink)" }}>*</span></label><textarea className="input" id="rc-reason" data-focus rows={3} maxLength={300} style={{ resize: "vertical" }} placeholder="What you checked: its recent changes, its scope, its owner" value={reason} onChange={(e) => { setReason(e.target.value); setErr(""); }} aria-invalid={!!err} aria-describedby={err ? "rc-err" : undefined} /></div>
        )}
        <p className="field help" id="rc-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
        <p className="field help">If it is not recertified in time it drops to &quot;Suggests only&quot; automatically before its next run.</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={() => L.closeLayer()}>Cancel</button><button className="btn btn-primary" disabled={!!why} aria-describedby={why ? "rc-why" : undefined} onClick={go}>Request approval</button></LayerFoot>
    </>
  );
}

/** Ask to raise an agent one rung. Shows its track record; the request goes to a different admin or owner (not the creator). */
function RaiseForm({ id }: { id: string }) {
  const L = useLayer(); const a = svc.findAgent(id);
  const [reason, setReason] = useState(""); const [err, setErr] = useState("");
  if (!a) return <p className="field help">Agent not found.</p>;
  const to = nextRung(a.autonomy); const n = svc.trackSetting(); const t = trackRecord(a, svc.ASST.runs, n); const why = svc.raiseBlockReason(a); const need = svc.raiseApprovers(a);
  const go = () => attempt(L, async () => {
    if (reason.trim().length < AUTONOMY.REASON_MIN) { setErr(`Give a reason of at least ${AUTONOMY.REASON_MIN} characters.`); return; }
    const r = await svc.requestRaise(id, reason); if (!r) { L.toast("Agent not found", false); return; }
    L.closeLayer(); L.toast(`Raising ${r.agent.name} needs approval from a different admin or owner`); bumpData();
  });
  return (
    <>
      <div>
        <dl className="meta-grid lstart">
          <dt>Now</dt><dd>{a.autonomy}: {RUNG_HELP[a.autonomy as Rung] ?? ""}</dd>
          <dt>Raise to</dt><dd>{to ? `${to}: ${RUNG_HELP[to]}` : "Already at the highest level"}</dd>
          {n ? <><dt>Approved suggestions</dt><dd>{t.approved} of {n} needed</dd>
          <dt>Recent rejection</dt><dd>{t.recentRejection ? `Yes, in its last ${n}` : "None"}</dd></> : <><dt>Track record</dt><dd>Not required in this workspace</dd></>}
          <dt>Approvers needed</dt><dd>{need === 2 ? "Two (it runs as a service account)" : "One"}</dd>
        </dl>
        {why ? <p className="field help" id="ra-why" style={{ color: "var(--bad-ink)", marginTop: 10 }}>{why}</p> : (
          <div className="field" style={{ marginTop: 10 }}><label htmlFor="ra-reason">Reason <span style={{ color: "var(--bad-ink)" }}>*</span></label><textarea className="input" id="ra-reason" data-focus rows={3} maxLength={300} style={{ resize: "vertical" }} value={reason} onChange={(e) => { setReason(e.target.value); setErr(""); }} aria-invalid={!!err} aria-describedby={err ? "ra-err" : undefined} /></div>
        )}
        <p className="field help" id="ra-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
        <p className="field help">{need === 2 ? "Two different admins or owners" : "A different admin or owner"}, not you and not the agent&apos;s creator, must approve. Any admin or owner can lower it again at once.</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={() => L.closeLayer()}>Cancel</button><button className="btn btn-primary" disabled={!!why} aria-describedby={why ? "ra-why" : undefined} onClick={go}>Request approval</button></LayerFoot>
    </>
  );
}

/** Reject a change an acting agent already applied. The agent drops to "Suggests only" at once; the change itself is reversed where it was made. */
function RejectAppliedForm({ id }: { id: string }) {
  const L = useLayer(); const r = svc.ASST.runs.find((x) => x.id === id);
  const [reason, setReason] = useState(""); const [err, setErr] = useState("");
  if (!r) return <p className="field help">Run not found.</p>;
  const go = () => attempt(L, async () => {
    if (reason.trim().length < AUTONOMY.REASON_MIN) { setErr(`Give a reason of at least ${AUTONOMY.REASON_MIN} characters.`); return; }
    const out = await svc.rejectApplied(id, reason); if (!out) { L.toast("Run not found", false); return; }
    L.closeLayer(); L.toast(out.lowered ? `Change rejected; ${out.lowered.name} now suggests only` : "Change rejected"); bumpData();
  });
  return (
    <>
      <div>
        <dl className="meta-grid lstart"><dt>Agent</dt><dd>{r.agent}</dd><dt>Applied change</dt><dd>{r.change}</dd></dl>
        <div className="field" style={{ marginTop: 10 }}><label htmlFor="rj-reason">Reason <span style={{ color: "var(--bad-ink)" }}>*</span></label><textarea className="input" id="rj-reason" data-focus rows={3} maxLength={300} style={{ resize: "vertical" }} value={reason} onChange={(e) => { setReason(e.target.value); setErr(""); }} aria-invalid={!!err} aria-describedby={err ? "rj-err" : undefined} /></div>
        <p className="field help" id="rj-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
        <p className="field help">The agent moves back to &quot;Suggests only&quot; at once and the rejection counts against its record. Reverse the change itself where it was made. Recorded in the audit log with your name.</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={() => L.closeLayer()}>Cancel</button><button className="btn btn-danger" onClick={go}>Confirm rejection</button></LayerFoot>
    </>
  );
}

function DecideRunForm({ id, decision }: { id: string; decision: "Approved & applied" | "Rejected" }) {
  const L = useLayer(); const r = svc.ASST.runs.find((x) => x.id === id);
  const [reason, setReason] = useState(""); const [err, setErr] = useState("");
  if (!r) return <p className="field help">Run not found.</p>;
  const approving = decision !== "Rejected";
  const go = () => attempt(L, async () => {
    if (reason.trim().length < 10) { setErr("Give a reason of at least 10 characters."); return; }
    const out = await svc.decideRun(id, decision, reason); if (!out) { L.toast("Run not found", false); return; }
    wsLog("assistant.run." + (approving ? "approved" : "rejected"), out.agent + ": " + out.change + " (reason: " + (out.decidedReason || "") + ")", "System");
    L.closeLayer(); L.toast(approving ? "Change approved and applied" : "Change rejected"); bumpData();
  });
  return (
    <>
      <div>
        <p style={{ margin: "0 0 8px", fontSize: 13 }}>{approving ? "Approve and apply" : "Reject"} this proposed change?</p>
        <dl className="meta-grid lstart"><dt>Agent</dt><dd>{r.agent}</dd><dt>Proposed change</dt><dd>{r.change}</dd><dt>Triggered by</dt><dd>{r.requestedBy || "Agent trigger"}</dd></dl>
        <div className="field" style={{ marginTop: 10 }}><label htmlFor="rd-reason">Reason <span style={{ color: "var(--bad-ink)" }}>*</span></label><textarea className="input" id="rd-reason" data-focus rows={3} maxLength={300} style={{ resize: "vertical" }} value={reason} onChange={(e) => { setReason(e.target.value); setErr(""); }} aria-invalid={!!err} aria-describedby={err ? "rd-err" : undefined} /></div>
        <p className="field help" id="rd-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
        <p className="field help">Recorded in the audit log with your name. Decisions cannot be undone.</p>
      </div>
      <LayerFoot><button className="btn btn-secondary" onClick={() => L.closeLayer()}>Cancel</button><button className={`btn ${approving ? "btn-primary" : "btn-danger"}`} onClick={go}>{approving ? "Confirm approval" : "Confirm rejection"}</button></LayerFoot>
    </>
  );
}

/** Prototype: "log" view. Approve / Reject are logged decisions behind a confirmation step; the approver is never the person who triggered the run. */
export function RunLogTab({ manage }: { manage: boolean }) {
  const L = useLayer();
  const waiting = svc.ASST.runs.filter((r) => r.decision === "Waiting").length;
  const flag = (r: Run) => L.openModal(`Reject applied change: ${r.agent}`, () => <RejectAppliedForm id={r.id} />);
  const open = (id: string, decision: "Approved & applied" | "Rejected") => L.openModal(decision === "Rejected" ? "Reject proposed change" : "Approve proposed change", () => <DecideRunForm id={id} decision={decision} />);
  const cols: DTColumn<Run>[] = [
    { key: "when", header: "When", value: (r) => r.when, render: (r) => <span style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{r.when}</span> },
    { key: "agent", header: "Agent", value: (r) => r.agent, locked: true, render: (r) => <span className="strong">{r.agent}{r.requestedBy ? <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 400 }}>run by {r.requestedBy}</div> : null}</span> },
    { key: "change", header: "Proposed change", value: (r) => r.change, render: (r) => r.change },
    { key: "decision", header: "Decision", value: (r) => r.decision, render: (r) => (<>{r.decision === "Waiting" ? <Chip cls="warn" icon="clock">Waiting</Chip> : r.decision === "Rejected" || r.decision === REJECTED_AFTER ? <Chip cls="bad" icon="x">{r.decision}</Chip> : r.decision === "Blocked" ? <Chip cls="bad" icon="alert">Blocked (personal data)</Chip> : r.decision === "No change" ? <Chip cls="neutral" icon="dot">No change</Chip> : <Chip cls="ok" icon="check">{r.decision}</Chip>}{r.decidedBy ? <div style={{ fontSize: 11.5, color: "var(--muted)" }}>by {r.decidedBy}</div> : null}</>) },
    { key: "act", header: "Actions", hideHeader: true, align: "end", locked: true, render: (r) => {
      if (manage && r.decision === "Auto-applied") return <button className="btn btn-ghost sm" aria-label={`Reject applied change: ${r.change}`} onClick={() => flag(r)}><Icon name="x" />Reject applied change</button>;
      const why = manage && r.decision === "Waiting" ? svc.runBlockReason(r) : null;
      return manage && r.decision === "Waiting" ? (
        <>
          <div className="btngrp" style={{ justifyContent: "flex-end" }}>
            <button className="btn btn-ghost sm" disabled={!!why} aria-describedby={why ? "rw-" + r.id : undefined} aria-label={`Approve: ${r.change}`} onClick={() => open(r.id, "Approved & applied")}><Icon name="check" />Approve</button>
            <button className="btn btn-ghost sm" disabled={!!why} aria-describedby={why ? "rw-" + r.id : undefined} aria-label={`Reject: ${r.change}`} onClick={() => open(r.id, "Rejected")}><Icon name="x" />Reject</button>
          </div>
          <WhyNot id={"rw-" + r.id} text={why} />
        </>
      ) : null;
    } },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {waiting ? (
        <div className="card" style={{ boxShadow: "none", background: "var(--accent-weak)", borderColor: "transparent" }}>
          <div className="c-body" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: 11 }}><span style={{ fontWeight: 500, flex: "1 1 220px" }}>{waiting} proposed change{waiting !== 1 ? "s" : ""} waiting for approval by someone other than who triggered the run</span></div>
        </div>
      ) : null}
      <DataTable<Run> id="agent-runs" label="Agent runs" rows={svc.ASST.runs} rowKey={(r) => r.id} columns={cols} searchText={(r) => `${r.agent} ${r.change} ${r.requestedBy || ""}`}
        tabs={["Waiting", "Approved & applied", "Rejected"].map((d) => ({ key: d, label: d, match: (r: Run) => (d === "Rejected" ? r.decision === d || r.decision === REJECTED_AFTER : r.decision === d) }))} exportName="agent-runs" />
    </div>
  );
}

/** Prototype: "mcp" view. */
export function McpTab({ manage }: { manage: boolean }) {
  const L = useLayer();
  const toggle = (i: number) => attempt(L, async () => {
    const r = await svc.toggleMcp(i); if (!r) { L.toast("Server not found", false); return; }
    const s = r.grant;
    if (r.pending) { wsLog("assistant.mcp.grant_requested", s.server + " (" + s.tools + ")", "System"); L.toast("Granting " + s.server + " needs approval from a different admin or owner"); bumpData(); return; }
    wsLog("assistant.mcp.revoked", s.server + " (" + s.tools + ")", "System");
    L.toast(s.server + " revoked"); bumpData();
  });
  const cols: DTColumn<Mcp>[] = [
    { key: "server", header: "Server", value: (s) => s.server, locked: true, render: (s) => <span className="strong">{s.server}</span> },
    { key: "tools", header: "Tools", value: (s) => s.tools, render: (s) => <span className="num">{s.tools}</span> },
    { key: "access", header: "Access", value: (s) => s.access, render: (s) => s.access },
    { key: "status", header: "Status", value: (s) => s.status, render: (s) => (s.status === "Granted" ? <Chip cls="ok" icon="check">Granted</Chip> : s.pendingApproval ? <Chip cls="warn" icon="clock">Grant requested</Chip> : <Chip cls="neutral" icon="dot">Revoked</Chip>) },
    { key: "act", header: "Actions", hideHeader: true, align: "end", locked: true, render: (s) => (manage ? <button className="btn btn-ghost sm" aria-label={`${s.status === "Granted" ? "Revoke" : "Request grant for"} ${s.server}`} onClick={() => toggle(svc.ASST.mcp.indexOf(s))}>{s.status === "Granted" ? "Revoke" : "Request grant"}</button> : null) },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="field help" style={{ margin: 0 }}>Granting access needs a different admin or owner; revoking is immediate.
      <details style={{ marginTop: 4 }}>
        <summary style={{ cursor: "pointer", width: "fit-content" }}>How access works</summary>
        <p style={{ margin: "6px 0 0" }}>{API_ON ? "Agents reach Selvara's own data only through these governed grants: no agent runs without \"Selvara workspace (read)\", and nothing an agent proposes is sent without \"Selvara notices\". Every run is recorded in the audit log with the records it read. Revoke access at any time; granting access needs approval from a different admin or owner." : "Agents reach tools only through governed MCP servers. Each grant is least-privilege and every call is logged. Revoke access at any time; granting access needs approval from a different admin or owner."}</p>
      </details></div>
      <DataTable<Mcp> id="mcp" label="MCP servers" rows={svc.ASST.mcp} rowKey={(s) => s.id ?? s.server} columns={cols} searchText={(s) => `${s.server} ${s.tools} ${s.access}`}
        tabs={["Granted", "Revoked"].map((st) => ({ key: st, label: st, match: (s: Mcp) => s.status === st }))} exportName="mcp-servers" />
    </div>
  );
}
