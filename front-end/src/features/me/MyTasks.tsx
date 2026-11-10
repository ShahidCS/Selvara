import { Chip } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { getMe, wsLog } from "@/lib/audit";
import { useData, useModState, bumpData } from "@/lib/store";
import { ackOf, tasksFor, type MeTask } from "@/lib/me";
import { acknowledge } from "@/services/me";

const KIND: Record<MeTask["kind"], string> = { Review: "info", Acknowledge: "neutral", Training: "ok", Reply: "warn" };

/** Open task count shared with the greeting (same rule as the board: done = acknowledged policy or clicked task). */
export function useTasks(role: string) {
  useData();
  const user = getMe().name;
  const [done, setDone] = useModState<Record<string, boolean>>(`me.done.${role}`, {});
  const tasks = tasksFor(role).map((t) => ({ ...t, isDone: t.ack ? !!ackOf(user, t.ack) : !!done[t.id] }));
  return { tasks, markDone: (id: string) => setDone((d) => ({ ...d, [id]: true })) };
}

export default function MyTasks({ role }: { role: string }) {
  const L = useLayer();
  const { tasks, markDone } = useTasks(role);
  const run = async (t: MeTask) => {
    if (t.ack) {
      const a = await acknowledge(getMe().name, t.ack);
      if (!a) { L.toast("This policy is not published, so it cannot be acknowledged", false); return; }
      wsLog("policy.acknowledged", `${t.title} v${a.ver}`, "Policy"); bumpData();
      L.toast(`Acknowledged ${t.title} — recorded with timestamp in the audit log`); return;
    }
    markDone(t.id); if (t.doneMsg) L.toast(t.doneMsg);
  };
  return (
    <div className="card" style={{ flex: "1 1 420px" }}>
      <div className="c-head"><h3>My tasks</h3></div>
      <div className="c-body flush">
        {tasks.length === 0 ? <p className="sub" style={{ padding: 16, margin: 0 }}>No open tasks. Nothing is waiting on you.</p> : (
          <ul style={{ listStyle: "none", margin: 0, padding: "0 16px" }}>
            {tasks.map((t) => (
              <li key={t.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><Chip cls={KIND[t.kind] || "neutral"}>{t.kind}</Chip><span style={{ fontWeight: 600 }}>{t.title}</span></div>
                  <div className="sub" style={{ fontSize: 12, marginTop: 2 }}>{t.detail}</div>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", color: t.isDone ? "var(--ok-ink)" : t.late ? "var(--bad-ink)" : "var(--muted)" }}>{t.isDone ? "Completed" : t.due}</span>
                  <button className={`btn sm ${t.isDone ? "btn-secondary" : "btn-primary"}`} disabled={t.isDone} onClick={() => run(t)}>{t.isDone ? "Done" : t.btn}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
