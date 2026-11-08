import { Chip, Icon, Table } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { wsLog } from "@/lib/audit";
import { bumpData, setModState } from "@/lib/store";
import * as svc from "@/services/assistant";

/** Prototype: "agents" view. */
export function AgentsTab({ manage }: { manage: boolean }) {
  const L = useLayer(); const fail = (m: string) => L.toast(m, false);
  const run = async (id: string) => {
    try {
      const r = await svc.runAgent(id); if (!r) return fail("Agent not found");
      wsLog("assistant.agent.run", r.agent.name, "System");
      L.toast(r.agent.name + " ran" + (r.suggest ? " — awaiting approval" : ""));
      setModState("assistant.view", "log"); bumpData();
    } catch { fail("Could not run the agent"); }
  };
  const toggle = async (id: string) => { try { const a = await svc.toggleAgent(id); if (!a) return fail("Agent not found"); wsLog("assistant.agent." + (a.status === "Active" ? "resumed" : "paused"), a.name, "System"); } catch { fail("Could not update the agent"); } };
  const del = async (id: string) => { try { const a = await svc.deleteAgent(id); if (!a) return fail("Agent not found"); wsLog("assistant.agent.deleted", a.name, "System"); L.toast("Agent deleted"); } catch { fail("Could not delete the agent"); } };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p className="field help" style={{ margin: 0 }}>Agents run on triggers with least-privilege access. &quot;Suggests only&quot; agents never act without approval; &quot;Acts (logged)&quot; agents act within their scope and record every action to the audit log.</p>
      <Table minw={1000} cols={[{ t: "Agent" }, { t: "Trigger" }, { t: "Runs as" }, { t: "Autonomy" }, { t: "Last run" }, { t: "Status" }, { t: "" }]}>
        {svc.ASST.agents.map((a) => (
          <tr key={a.id}>
            <td className="strong">{a.name}</td><td>{a.trigger}</td><td>{a.runsAs}</td>
            <td>{a.autonomy === "Suggests only" ? <Chip cls="neutral" icon="dot">{a.autonomy}</Chip> : <Chip cls="info" icon="check">{a.autonomy}</Chip>}</td>
            <td style={{ color: "var(--muted)" }}>{a.last}</td>
            <td>{a.status === "Active" ? <Chip cls="ok" icon="check">Active</Chip> : <Chip cls="neutral" icon="dot">Paused</Chip>}</td>
            <td className="r">{manage ? (
              <div className="btngrp" style={{ justifyContent: "flex-end", flexWrap: "nowrap", whiteSpace: "nowrap" }}>
                <button className="btn btn-ghost sm" title="Run now" aria-label={`Run ${a.name} now`} onClick={() => run(a.id)}><Icon name="play" /></button>
                <button className="btn btn-ghost sm" onClick={() => toggle(a.id)}>{a.status === "Active" ? "Pause" : "Resume"}</button>
                <button className="btn btn-ghost sm" title="Delete agent" aria-label={`Delete agent ${a.name}`} onClick={() => del(a.id)}><Icon name="x" /></button>
              </div>
            ) : <span style={{ color: "var(--faint)", fontSize: 12 }}>View only</span>}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

/** Prototype: "log" view. Approve / Reject are logged decisions (human approval gate). */
export function RunLogTab({ manage }: { manage: boolean }) {
  const L = useLayer();
  const waiting = svc.ASST.runs.filter((r) => r.decision === "Waiting").length;
  const decide = async (id: string, decision: "Approved & applied" | "Rejected") => {
    try {
      const r = await svc.decideRun(id, decision); if (!r) { L.toast("Run not found", false); return; }
      wsLog("assistant.run." + (/Rejected/.test(decision) ? "rejected" : "approved"), r.agent + ": " + r.change, "System");
      L.toast(/Rejected/.test(decision) ? "Change rejected" : "Change approved and applied"); bumpData();
    } catch { L.toast("Could not record the decision", false); }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {waiting ? (
        <div className="card" style={{ boxShadow: "none", background: "var(--accent-weak)", borderColor: "transparent" }}>
          <div className="c-body" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: 11 }}><span style={{ fontWeight: 500, flex: "1 1 220px" }}>{waiting} proposed change{waiting !== 1 ? "s" : ""} waiting for your approval</span></div>
        </div>
      ) : null}
      <Table minw={940} cols={[{ t: "When" }, { t: "Agent" }, { t: "Proposed change" }, { t: "Decision" }, { t: "" }]}>
        {svc.ASST.runs.map((r) => (
          <tr key={r.id}>
            <td style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{r.when}</td><td className="strong">{r.agent}</td><td>{r.change}</td>
            <td>{r.decision === "Waiting" ? <Chip cls="warn" icon="clock">Waiting</Chip> : r.decision === "Rejected" ? <Chip cls="bad" icon="x">Rejected</Chip> : <Chip cls="ok" icon="check">{r.decision}</Chip>}</td>
            <td className="r">{manage && r.decision === "Waiting" ? (
              <div className="btngrp" style={{ justifyContent: "flex-end" }}>
                <button className="btn btn-ghost sm" aria-label={`Approve: ${r.change}`} onClick={() => decide(r.id, "Approved & applied")}><Icon name="check" />Approve</button>
                <button className="btn btn-ghost sm" aria-label={`Reject: ${r.change}`} onClick={() => decide(r.id, "Rejected")}><Icon name="x" />Reject</button>
              </div>
            ) : null}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

/** Prototype: "mcp" view. */
export function McpTab({ manage }: { manage: boolean }) {
  const L = useLayer();
  const toggle = async (i: number) => {
    try {
      const s = await svc.toggleMcp(i); if (!s) { L.toast("Server not found", false); return; }
      wsLog("assistant.mcp." + (s.status === "Granted" ? "granted" : "revoked"), s.server + " (" + s.tools + ")", "System");
      L.toast(s.server + " " + (s.status === "Granted" ? "granted" : "revoked")); bumpData();
    } catch { L.toast("Could not update the grant", false); }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p className="field help" style={{ margin: 0 }}>Agents reach tools only through governed MCP servers. Each grant is least-privilege and every call is logged. Revoke access at any time.</p>
      <Table minw={780} cols={[{ t: "Server" }, { t: "Tools" }, { t: "Access" }, { t: "Status" }, { t: "" }]}>
        {svc.ASST.mcp.map((s, i) => (
          <tr key={s.server}>
            <td className="strong">{s.server}</td><td className="num">{s.tools}</td><td>{s.access}</td>
            <td>{s.status === "Granted" ? <Chip cls="ok" icon="check">Granted</Chip> : <Chip cls="neutral" icon="dot">Revoked</Chip>}</td>
            <td className="r">{manage ? <button className="btn btn-ghost sm" aria-label={`${s.status === "Granted" ? "Revoke" : "Grant"} ${s.server}`} onClick={() => toggle(i)}>{s.status === "Granted" ? "Revoke" : "Grant"}</button> : null}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
