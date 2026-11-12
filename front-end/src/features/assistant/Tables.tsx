import { useState } from "react";
import { Chip, DataTable, Icon, type DTColumn } from "@/components/ui";
import { LayerFoot, useLayer } from "@/components/shell/LayerProvider";
import { wsLog } from "@/lib/audit";
import { bumpData, setModState } from "@/lib/store";
import * as svc from "@/features/assistant/services/assistant";
import { WhyNot, attempt } from "@/components/kit/sodKit";

type Agent = (typeof svc.ASST.agents)[number];
type Run = (typeof svc.ASST.runs)[number];
type Mcp = (typeof svc.ASST.mcp)[number];

/** Prototype: "agents" view. */
export function AgentsTab({ manage }: { manage: boolean }) {
  const L = useLayer(); const fail = (m: string) => L.toast(m, false);
  const run = (id: string) => attempt(L, async () => {
    const r = await svc.runAgent(id); if (!r) return fail("Agent not found");
    wsLog("assistant.agent.run", r.agent.name, "System");
    L.toast(r.agent.name + " ran" + (r.suggest ? " — awaiting approval" : ""));
    setModState("assistant.view", "log"); bumpData();
  });
  const toggle = (id: string) => attempt(L, async () => {
    const r = await svc.toggleAgent(id); if (!r) return fail("Agent not found");
    if (r.pending) { wsLog("assistant.agent.enable_requested", r.agent.name, "System"); L.toast("Enabling " + r.agent.name + " needs approval from a different admin or owner"); bumpData(); return; }
    wsLog("assistant.agent.paused", r.agent.name, "System"); bumpData();
  });
  const del = (id: string) => attempt(L, async () => { const a = await svc.deleteAgent(id); if (!a) return fail("Agent not found"); wsLog("assistant.agent.deleted", a.name, "System"); L.toast("Agent deleted"); bumpData(); });
  const cols: DTColumn<Agent>[] = [
    { key: "name", header: "Agent", value: (a) => a.name, locked: true, render: (a) => <span className="strong">{a.name}</span> },
    { key: "trigger", header: "Trigger", value: (a) => a.trigger, render: (a) => a.trigger },
    { key: "runsAs", header: "Runs as", value: (a) => a.runsAs, render: (a) => a.runsAs },
    { key: "autonomy", header: "Autonomy", value: (a) => a.autonomy, render: (a) => (a.autonomy === "Suggests only" ? <Chip cls="neutral" icon="dot">{a.autonomy}</Chip> : <Chip cls="info" icon="check">{a.autonomy}</Chip>) },
    { key: "last", header: "Last run", value: (a) => a.last, render: (a) => <span style={{ color: "var(--muted)" }}>{a.last}</span> },
    { key: "status", header: "Status", value: (a) => a.status, render: (a) => (a.status === "Active" ? <Chip cls="ok" icon="check">Active</Chip> : a.status === "Pending approval" ? <Chip cls="warn" icon="clock">Pending approval</Chip> : <Chip cls="neutral" icon="dot">Paused</Chip>) },
    { key: "act", header: "Actions", hideHeader: true, align: "end", locked: true, render: (a) => (manage ? (
      <div className="btngrp" style={{ justifyContent: "flex-end", flexWrap: "nowrap", whiteSpace: "nowrap" }}>
        <button className="btn btn-ghost sm" disabled={a.status !== "Active"} title={a.status === "Active" ? "Run now" : "Only an active agent can run"} aria-label={`Run ${a.name} now`} onClick={() => run(a.id)}><Icon name="play" /></button>
        <button className="btn btn-ghost sm" disabled={a.status === "Pending approval"} onClick={() => toggle(a.id)}>{a.status === "Active" ? "Pause" : a.status === "Pending approval" ? "Awaiting approval" : "Request enable"}</button>
        <button className="btn btn-ghost sm" title="Delete agent" aria-label={`Delete agent ${a.name}`} onClick={() => del(a.id)}><Icon name="x" /></button>
      </div>
    ) : <span style={{ color: "var(--faint)", fontSize: 12 }}>View only</span>) },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p className="field help" style={{ margin: 0 }}>Agents run on triggers with least-privilege access. Creating or resuming an agent needs approval from a different admin or owner. &quot;Suggests only&quot; agents never act without approval; &quot;Acts (logged)&quot; agents act within their scope and record every action to the audit log.</p>
      <DataTable<Agent> id="agents" label="Agents" rows={svc.ASST.agents} rowKey={(a) => a.id} columns={cols} searchText={(a) => `${a.name} ${a.trigger} ${a.runsAs}`}
        tabs={["Active", "Pending approval", "Paused"].map((st) => ({ key: st, label: st, match: (a: Agent) => a.status === st }))} exportName="agents" />
    </div>
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
        <dl className="meta-grid"><dt>Agent</dt><dd>{r.agent}</dd><dt>Proposed change</dt><dd>{r.change}</dd><dt>Triggered by</dt><dd>{r.requestedBy || "Agent trigger"}</dd></dl>
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
  const open = (id: string, decision: "Approved & applied" | "Rejected") => L.openModal(decision === "Rejected" ? "Reject proposed change" : "Approve proposed change", () => <DecideRunForm id={id} decision={decision} />);
  const cols: DTColumn<Run>[] = [
    { key: "when", header: "When", value: (r) => r.when, render: (r) => <span style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{r.when}</span> },
    { key: "agent", header: "Agent", value: (r) => r.agent, locked: true, render: (r) => <span className="strong">{r.agent}{r.requestedBy ? <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 400 }}>run by {r.requestedBy}</div> : null}</span> },
    { key: "change", header: "Proposed change", value: (r) => r.change, render: (r) => r.change },
    { key: "decision", header: "Decision", value: (r) => r.decision, render: (r) => (<>{r.decision === "Waiting" ? <Chip cls="warn" icon="clock">Waiting</Chip> : r.decision === "Rejected" ? <Chip cls="bad" icon="x">Rejected</Chip> : <Chip cls="ok" icon="check">{r.decision}</Chip>}{r.decidedBy ? <div style={{ fontSize: 11.5, color: "var(--muted)" }}>by {r.decidedBy}</div> : null}</>) },
    { key: "act", header: "Actions", hideHeader: true, align: "end", locked: true, render: (r) => {
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
        tabs={["Waiting", "Approved & applied", "Rejected"].map((d) => ({ key: d, label: d, match: (r: Run) => r.decision === d }))} exportName="agent-runs" />
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
      <p className="field help" style={{ margin: 0 }}>Agents reach tools only through governed MCP servers. Each grant is least-privilege and every call is logged. Revoke access at any time; granting access needs approval from a different admin or owner.</p>
      <DataTable<Mcp> id="mcp" label="MCP servers" rows={svc.ASST.mcp} rowKey={(s) => s.server} columns={cols} searchText={(s) => `${s.server} ${s.tools} ${s.access}`}
        tabs={["Granted", "Revoked"].map((st) => ({ key: st, label: st, match: (s: Mcp) => s.status === st }))} exportName="mcp-servers" />
    </div>
  );
}
