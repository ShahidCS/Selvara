/* The custom agents page (reference review R30 to R33): a summary band with "Pause all agents", the "Runs on its own" and "Asks you first"
   lists (each agent's permission boundary, for human oversight), and agent cards with status, latest run and an autonomy meter.
   Figures are counted from the agents and runs already loaded; nothing here calls a model. */
import type { ReactNode } from "react";
import { Chip, Icon, KpiStrip, KpiTile } from "@/components/ui";
import { useLayer } from "@/components/shell/LayerProvider";
import { askReason } from "@/components/kit/ReasonDialog";
import { bumpData } from "@/lib/store";
import { getApproval } from "@/lib/approvals";
import { LADDER, rungOf } from "@/features/assistant/lib/autonomy";
import * as svc from "@/features/assistant/services/assistant";

type Agent = svc.Agent; type Run = svc.AgentRun;
const APPROVED = new Set(["Approved & applied", "Applied after review", "Auto-applied"]);
const REJECTED = /^Rejected/;
/** A run from today: the demonstration says "12m ago" or "just now", the server gives "YYYY-MM-DD HH:MM UTC". */
export function isToday(when: string, now = new Date()): boolean {
  if (/just now|\b\d+\s*[mh] ago/i.test(when)) return true;
  return when.startsWith(now.toISOString().slice(0, 10));
}
/** Waiting for a second admin to enable it (the server shows this as the status; the demonstration keeps the request id). */
const enabling = (a: Agent) => a.status === "Pending approval" || (!!a.pendingApproval && getApproval(a.pendingApproval)?.status === "Pending");
const runsOf = (a: Agent, runs: Run[]) => runs.filter((r) => (r.agentId ? r.agentId === a.id : r.agent === a.name));

/** What the page counts: active agents, today's runs, and decisions (waiting, approved or applied, rejected). */
export function agentFigures(agents: Agent[], runs: Run[], now = new Date()) {
  return {
    active: agents.filter((a) => a.status === "Active").length, total: agents.length,
    today: runs.filter((r) => isToday(r.when, now)).length,
    waiting: runs.filter((r) => r.decision === "Waiting").length,
    approved: runs.filter((r) => APPROVED.has(r.decision)).length,
    rejected: runs.filter((r) => REJECTED.test(r.decision)).length,
  };
}

export function AgentSummary({ manage }: { manage: boolean }) {
  const L = useLayer();
  const f = agentFigures(svc.ASST.agents, svc.ASST.runs);
  const pauseAll = () => askReason(L, {
    title: "Pause all agents?", label: "Reason", danger: true, confirm: "Pause all agents",
    intro: <>Every active agent stops at once and no enable request already waiting can restart one. Each agent is resumed on its own, with approval from a different admin or owner. The reason is recorded in the audit log.</>,
    run: async (reason) => { const r = await svc.pauseAllAgents(reason); bumpData(); return `${r.paused} agent${r.paused === 1 ? "" : "s"} paused${r.withdrawn ? `; ${r.withdrawn} enable request${r.withdrawn === 1 ? "" : "s"} withdrawn` : ""}`; },
  });
  const sentence = f.active
    ? `${f.active} of ${f.total} agent${f.total === 1 ? " is" : "s are"} active. ${f.today} run${f.today === 1 ? "" : "s"} today; ${f.waiting ? `${f.waiting} change${f.waiting === 1 ? " is" : "s are"} waiting for review.` : "nothing is waiting for review."}`
    : f.total ? "All agents are paused. Nothing runs until an agent is enabled again." : "No custom agents yet.";
  return (
    <section className="panel-soft" aria-labelledby="agents-sum-h" data-tour="assistant-summary">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div><h2 id="agents-sum-h" className="cal-h">Agents at a glance</h2><p className="cell-sub" style={{ margin: "2px 0 0" }}>{sentence}</p></div>
        {manage ? <button className="btn btn-danger" disabled={!f.active && !svc.ASST.agents.some(enabling)} title={f.active ? undefined : "No agent is active"} onClick={pauseAll}><Icon name="pause" />Pause all agents</button> : null}
      </div>
      <KpiStrip label="Agent activity">
        <KpiTile label="Active agents" value={`${f.active}/${f.total}`} caption="Paused agents never run" />
        <KpiTile label="Runs today" value={f.today} caption="Started by Run now or a trigger" />
        <KpiTile label="Waiting for review" value={f.waiting} delta={f.waiting ? { tone: "watch", text: "Needs a person" } : undefined} caption="Approved by someone other than who ran it" />
        <KpiTile label="Approved or applied" value={f.approved} caption="All time, in the run log" />
        <KpiTile label="Rejected" value={f.rejected} caption="Including applied changes rejected later" />
      </KpiStrip>
    </section>
  );
}

/** R31: the permission boundary of each active agent. "Acts (logged)" agents apply changes within scope; "Suggests only" agents ask first. */
export function AgentLists() {
  const active = svc.ASST.agents.filter((a) => a.status === "Active");
  const own = active.filter((a) => rungOf(a.autonomy) > 0); const ask = active.filter((a) => rungOf(a.autonomy) <= 0);
  const list = (rows: Agent[], empty: string) => rows.length
    ? <ul className="agent-list">{rows.map((a) => <li key={a.id}><span className="strong">{a.name}</span><span className="cell-sub">{a.trigger} · runs as {a.runsAs.toLowerCase()}</span></li>)}</ul>
    : <p className="cell-sub" style={{ margin: 0 }}>{empty}</p>;
  return (
    <div className="agent-lists">
      <section className="card" aria-labelledby="al-own"><div className="c-head"><h3 id="al-own"><Icon name="play" />Runs on its own</h3><span className="cell-sub">Applies changes within scope; each one is logged</span></div><div className="c-body">{list(own, "No agent acts on its own.")}</div></section>
      <section className="card" aria-labelledby="al-ask"><div className="c-head"><h3 id="al-ask"><Icon name="user" />Asks you first</h3><span className="cell-sub">Every change waits for a person to approve it</span></div><div className="c-body">{list(ask, "No active agent suggests changes.")}</div></section>
    </div>
  );
}

/** Autonomy as a meter of the ladder's rungs, with the rung's name (never the bars alone). */
export function AutonomyMeter({ autonomy }: { autonomy: string }) {
  const at = Math.max(0, rungOf(autonomy));
  return (
    <span className="auto-meter" role="img" aria-label={`Autonomy: ${autonomy}, level ${at + 1} of ${LADDER.length}`}>
      <span className="auto-bars" aria-hidden="true">{LADDER.map((r, i) => <span key={r} className={i <= at ? "on" : undefined} />)}</span>
      <span aria-hidden="true">{autonomy}</span>
    </span>
  );
}

function statusOf(a: Agent, waiting: number): ReactNode {
  if (enabling(a)) return <Chip cls="warn" icon="clock">Pending approval</Chip>;
  if (a.status !== "Active") return <Chip cls="neutral" icon="pause">Paused</Chip>;
  if (waiting) return <Chip cls="warn" icon="alert">Needs you</Chip>;
  return <Chip cls="ok" icon="check">Active</Chip>;
}

/** R32: one card per agent. The autonomy controls and actions are the table's own, so both views do the same things. */
export function AgentCards({ rows, autonomy, actions }: { rows: Agent[]; autonomy: (a: Agent) => ReactNode; actions: (a: Agent) => ReactNode }) {
  if (!rows.length) return <p className="cell-sub">No custom agents yet.</p>;
  return (
    <ul className="agent-cards" aria-label="Agents">
      {rows.map((a) => {
        const rs = runsOf(a, svc.ASST.runs); const waiting = rs.filter((r) => r.decision === "Waiting").length;
        const latest = rs[0];
        return (
          <li key={a.id} className="agent-card">
            <div className="agent-top"><h3 className="strong">{a.name}</h3>{statusOf(a, waiting)}</div>
            <div className="cell-sub">{a.trigger} · runs as {a.runsAs.toLowerCase()}</div>
            <div className="agent-figs">
              <div><span className="eyebrow">Runs</span><span className="num">{rs.length}</span></div>
              <div><span className="eyebrow">Approved</span><span className="num">{rs.filter((r) => APPROVED.has(r.decision)).length}</span></div>
              <div><span className="eyebrow">Last run</span><span>{a.last}</span></div>
            </div>
            <div className="agent-latest">{latest ? <><span className="eyebrow">Latest</span><span>{latest.change}</span><span className="cell-sub">{latest.decision}</span></> : <span className="cell-sub">No runs yet</span>}</div>
            <AutonomyMeter autonomy={a.autonomy} />
            {autonomy(a)}
            <div className="agent-acts">{actions(a)}</div>
          </li>
        );
      })}
    </ul>
  );
}
