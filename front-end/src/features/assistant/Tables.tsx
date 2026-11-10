import { useState } from "react";
import { Chip, Icon, Table } from "@/components/ui";
import { LayerFoot, useLayer } from "@/components/shell/LayerProvider";
import { wsLog } from "@/lib/audit";
import { bumpData, setModState } from "@/lib/store";
import * as svc from "@/services/assistant";
import { WhyNot, attempt } from "@/components/kit/sodKit";

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
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p className="field help" style={{ margin: 0 }}>Agents run on triggers with least-privilege access. Creating or resuming an agent needs approval from a different admin or owner. &quot;Suggests only&quot; agents never act without approval; &quot;Acts (logged)&quot; agents act within their scope and record every action to the audit log.</p>
      <Table minw={1000} cols={[{ t: "Agent" }, { t: "Trigger" }, { t: "Runs as" }, { t: "Autonomy" }, { t: "Last run" }, { t: "Status" }, { t: "" }]}>
        {svc.ASST.agents.map((a) => (
          <tr key={a.id}>
            <td className="strong">{a.name}</td><td>{a.trigger}</td><td>{a.runsAs}</td>
            <td>{a.autonomy === "Suggests only" ? <Chip cls="neutral" icon="dot">{a.autonomy}</Chip> : <Chip cls="info" icon="check">{a.autonomy}</Chip>}</td>
            <td style={{ color: "var(--muted)" }}>{a.last}</td>
            <td>{a.status === "Active" ? <Chip cls="ok" icon="check">Active</Chip> : a.status === "Pending approval" ? <Chip cls="warn" icon="clock">Pending approval</Chip> : <Chip cls="neutral" icon="dot">Paused</Chip>}</td>
            <td className="r">{manage ? (
              <div className="btngrp" style={{ justifyContent: "flex-end", flexWrap: "nowrap", whiteSpace: "nowrap" }}>
                <button className="btn btn-ghost sm" disabled={a.status !== "Active"} title={a.status === "Active" ? "Run now" : "Only an active agent can run"} aria-label={`Run ${a.name} now`} onClick={() => run(a.id)}><Icon name="play" /></button>
                <button className="btn btn-ghost sm" disabled={a.status === "Pending approval"} onClick={() => toggle(a.id)}>{a.status === "Active" ? "Pause" : a.status === "Pending approval" ? "Awaiting approval" : "Request enable"}</button>
                <button className="btn btn-ghost sm" title="Delete agent" aria-label={`Delete agent ${a.name}`} onClick={() => del(a.id)}><Icon name="x" /></button>
              </div>
            ) : <span style={{ color: "var(--faint)", fontSize: 12 }}>View only</span>}</td>
          </tr>
        ))}
      </Table>
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
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {waiting ? (
        <div className="card" style={{ boxShadow: "none", background: "var(--accent-weak)", borderColor: "transparent" }}>
          <div className="c-body" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: 11 }}><span style={{ fontWeight: 500, flex: "1 1 220px" }}>{waiting} proposed change{waiting !== 1 ? "s" : ""} waiting for approval by someone other than who triggered the run</span></div>
        </div>
      ) : null}
      <Table minw={940} cols={[{ t: "When" }, { t: "Agent" }, { t: "Proposed change" }, { t: "Decision" }, { t: "" }]}>
        {svc.ASST.runs.map((r) => {
          const why = manage && r.decision === "Waiting" ? svc.runBlockReason(r) : null;
          return (
            <tr key={r.id}>
              <td style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{r.when}</td><td className="strong">{r.agent}{r.requestedBy ? <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 400 }}>run by {r.requestedBy}</div> : null}</td><td>{r.change}</td>
              <td>{r.decision === "Waiting" ? <Chip cls="warn" icon="clock">Waiting</Chip> : r.decision === "Rejected" ? <Chip cls="bad" icon="x">Rejected</Chip> : <Chip cls="ok" icon="check">{r.decision}</Chip>}{r.decidedBy ? <div style={{ fontSize: 11.5, color: "var(--muted)" }}>by {r.decidedBy}</div> : null}</td>
              <td className="r">{manage && r.decision === "Waiting" ? (
                <>
                  <div className="btngrp" style={{ justifyContent: "flex-end" }}>
                    <button className="btn btn-ghost sm" disabled={!!why} aria-describedby={why ? "rw-" + r.id : undefined} aria-label={`Approve: ${r.change}`} onClick={() => open(r.id, "Approved & applied")}><Icon name="check" />Approve</button>
                    <button className="btn btn-ghost sm" disabled={!!why} aria-describedby={why ? "rw-" + r.id : undefined} aria-label={`Reject: ${r.change}`} onClick={() => open(r.id, "Rejected")}><Icon name="x" />Reject</button>
                  </div>
                  <WhyNot id={"rw-" + r.id} text={why} />
                </>
              ) : null}</td>
            </tr>
          );
        })}
      </Table>
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
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p className="field help" style={{ margin: 0 }}>Agents reach tools only through governed MCP servers. Each grant is least-privilege and every call is logged. Revoke access at any time; granting access needs approval from a different admin or owner.</p>
      <Table minw={780} cols={[{ t: "Server" }, { t: "Tools" }, { t: "Access" }, { t: "Status" }, { t: "" }]}>
        {svc.ASST.mcp.map((s, i) => (
          <tr key={s.server}>
            <td className="strong">{s.server}</td><td className="num">{s.tools}</td><td>{s.access}</td>
            <td>{s.status === "Granted" ? <Chip cls="ok" icon="check">Granted</Chip> : s.pendingApproval ? <Chip cls="warn" icon="clock">Grant requested</Chip> : <Chip cls="neutral" icon="dot">Revoked</Chip>}</td>
            <td className="r">{manage ? <button className="btn btn-ghost sm" aria-label={`${s.status === "Granted" ? "Revoke" : "Request grant for"} ${s.server}`} onClick={() => toggle(i)}>{s.status === "Granted" ? "Revoke" : "Request grant"}</button> : null}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
