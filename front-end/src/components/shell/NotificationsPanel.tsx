import { useState } from "react";
import { Icon } from "@/components/ui";
import { useApp, useData, useModVersion } from "@/lib/store";
import { notificationsFor, markRead, readIds, restoreRead, unreadCount, type Notif } from "@/lib/notifications";
import type { LayerApi } from "./LayerProvider";

type Tab = "all" | "approval" | "alert";
const TABS: [Tab, string][] = [["all", "All"], ["approval", "Approvals"], ["alert", "Alerts"]];
const TONE: Record<Notif["tone"], string> = { bad: "bad", warn: "warn", info: "info" };
const TONE_LABEL: Record<Notif["tone"], string> = { bad: "Critical", warn: "Needs attention", info: "Awaiting decision" };

/** Body of the notifications slide-over. Items open the record to review; nothing is approved from here, because a decision needs a reason and a second person. */
export function NotificationsBody({ space, go, close, L }: { space: "ws" | "admin"; go: (p: string) => void; close: () => void; L: LayerApi }) {
  useData(); useModVersion(); // follow data and read-state changes
  const role = useApp((s) => s.role);
  const [tab, setTab] = useState<Tab>("all");
  const items = notificationsFor(role, space);
  const read = new Set(readIds());
  const unread = unreadCount(items);
  const shown = items.filter((n) => tab === "all" || n.kind === tab);
  const count = (t: Tab) => items.filter((n) => t === "all" || n.kind === t).length;
  const groups: [string, Notif[]][] = ([["Needs your decision", shown.filter((n) => n.kind === "approval")], ["Alerts", shown.filter((n) => n.kind === "alert")]] as [string, Notif[]][]).filter((g) => g[1].length);

  const open = (n: Notif) => { markRead([n.id]); close(); go(n.path); };
  const markAll = () => {
    const before = readIds();
    markRead(items.map((n) => n.id));
    L.toast("All notifications marked read", true, { action: { label: "Undo", run: () => restoreRead(before) } });
  };

  return (
    <div className="nt">
      <div className="nt-bar">
        <div className="tabs" role="tablist" aria-label="Notification type">
          {TABS.map(([k, l]) => (
            <button key={k} className="tab" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l} <span className="nt-n">{count(k)}</span></button>
          ))}
        </div>
        <button className="btn btn-ghost sm" disabled={!unread} onClick={markAll}>Mark all read</button>
      </div>
      <p className="nt-sum" role="status" aria-live="polite">{unread ? `${unread} unread` : items.length ? "You are all caught up" : ""}</p>
      {groups.length === 0 ? (
        <div className="empty" style={{ padding: "32px 12px" }}><div className="ei"><Icon name="check" /></div><h4>Nothing here</h4><p>{items.length ? "No notifications in this tab." : "Nothing needs your attention right now."}</p></div>
      ) : groups.map(([g, list]) => (
        <section key={g} aria-label={g}>
          <h4 className="nt-g">{g}</h4>
          <ul className="nt-list">
            {list.map((n) => (
              <li key={n.id}>
                <button className={`nt-item${read.has(n.id) ? " read" : ""}`} onClick={() => open(n)}>
                  <span className={`nt-ico ${TONE[n.tone]}`}><Icon name={n.icon} /></span>
                  <span className="nt-txt">
                    <span className="nt-t">{n.title}</span>
                    <span className="nt-d">{n.detail}</span>
                    <span className={`chip ${TONE[n.tone]}`}><Icon name={n.tone === "info" ? "clock" : "alert"} />{TONE_LABEL[n.tone]}</span>
                  </span>
                  {read.has(n.id) ? null : <span className="nt-dot" aria-label="Unread" />}
                  <span className="nt-go">Review<Icon name="chevron" /></span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
