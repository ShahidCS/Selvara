/* R23: a record's history as a timeline, read from the company audit log (newest first). It shows only entries the person may already read:
   in production the log reaches the browser only for roles that open Audit Logs, so other roles see no history card at all. Display only. */
import { WS_AUDIT, type WsEntry } from "@/lib/audit";
import { API_ON, modAllowed } from "@/lib/rbac";
import { useApp, useData } from "@/lib/store";
import { Avatar, Empty } from "@/components/ui";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** "issue.closure.proposed" -> "Closure proposed"; the record type prefix is dropped (the page already says what it is). */
export function actionText(action: string): string {
  const parts = action.split(".");
  const words = (parts.length > 1 ? parts.slice(1) : parts).join(" ").replace(/[_-]/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : action;
}
/** Entries whose target names the record id as a whole token at the start ("R-014 …", "R-014: …", "R-014 (High)"). */
export function historyFor(id: string, log: readonly WsEntry[] = WS_AUDIT): WsEntry[] {
  const re = new RegExp(`^${esc(id)}(?![\\w-])`);
  return log.filter((e) => re.test(e.target)).slice().reverse();
}

export function RecordHistory({ id, limit = 8 }: { id: string; limit?: number }) {
  useData();
  const role = useApp((s) => s.role);
  if (API_ON && !modAllowed(role, "ws", "auditlog")) return null;
  const items = historyFor(id);
  return (
    <div className="card" data-tour="record-history"><div className="c-head"><h3>History</h3></div><div className="c-body">
      {items.length ? (
        <ol className="tl">
          {items.slice(0, limit).map((e) => (
            <li key={e.seq} className="tl-i">
              <span className="tl-dot" aria-hidden="true" />
              <div className="tl-b">
                <div className="tl-t">{actionText(e.action)}</div>
                <div className="tl-m"><Avatar name={e.actor} size={18} /><span>{e.actor}</span><span aria-hidden="true">·</span><time>{e.at}</time></div>
              </div>
            </li>
          ))}
        </ol>
      ) : <Empty compact icon="log" title="No changes recorded yet" />}
      {items.length > limit ? <p className="field help" style={{ margin: "8px 0 0" }}>{items.length - limit} earlier change{items.length - limit === 1 ? "" : "s"} in Audit Logs.</p> : null}
    </div></div>
  );
}
