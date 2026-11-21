import { useEffect, useRef, useState } from "react";
import { Icon, Switch } from "@/components/ui";
import { useApp, useData, useModVersion } from "@/lib/store";
import { notificationsFor, markRead, readIds, restoreRead, unreadCount, type Notif } from "@/lib/notifications";
import { NOTIF_CHANNELS, catsFor, isLocked, isOn } from "@/lib/notifPrefs";
import { decide } from "@/services/sodApprovals";
import { setNotifPref } from "@/services/notifPrefs";
import { sodMessage } from "@/lib/approvalFlow";
import type { LayerApi } from "./LayerProvider";

type Tab = "all" | "approval" | "alert";
const TABS: [Tab, string][] = [["all", "All"], ["approval", "Approvals"], ["alert", "Alerts"]];
const TONE: Record<Notif["tone"], string> = { bad: "bad", warn: "warn", info: "info" };
const TONE_LABEL: Record<Notif["tone"], string> = { bad: "Critical", warn: "Needs attention", info: "Awaiting decision" };

const REASON_MIN = 10;
/** Approve or Reject an item from the panel. It calls the same decision function as the module's own panel, so the reason (at least 10 characters), the
 *  second-person and the role rules are the same; a refusal shows its reason here. Only offered for the kinds in `lib/inboxApprovals.ts`. */
function InlineDecision({ id, title, L }: { id: string; title: string; L: LayerApi }) {
  const [mode, setMode] = useState<null | "approve" | "reject">(null);
  const [reason, setReason] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (mode) box.current?.focus(); }, [mode]);
  const short = reason.trim().length < REASON_MIN;
  const go = async () => {
    if (!mode || busy || short) return;
    setBusy(true); setErr("");
    try {
      const r = await decide(id, mode, reason);
      L.toast(mode === "reject" ? "Rejected" : r.status === "Approved" ? "Approved, change applied" : `Approval recorded (${r.approvals.length} of ${r.needs})`);
    } catch (e) { setErr(sodMessage(e, "Could not record the decision")); }
    setBusy(false);
  };
  return (
    <div className="nt-act">
      <div className="btngrp">
        <button className="btn btn-primary sm" aria-label={`Approve: ${title}`} aria-expanded={mode === "approve"} onClick={() => { setMode("approve"); setErr(""); }}><Icon name="check" />Approve</button>
        <button className="btn btn-ghost sm" aria-label={`Reject: ${title}`} aria-expanded={mode === "reject"} onClick={() => { setMode("reject"); setErr(""); }}><Icon name="x" />Reject</button>
      </div>
      {mode ? (
        <form onSubmit={(e) => { e.preventDefault(); void go(); }} noValidate>
          <div className="field"><label htmlFor={`ntr-${id}`}>Reason to {mode} (at least {REASON_MIN} characters)</label>
            <textarea ref={box} className="input" id={`ntr-${id}`} rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} aria-describedby={err ? `nte-${id}` : undefined} /></div>
          <p className="field help" id={`nte-${id}`} role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none", margin: "4px 0" }}>{err}</p>
          <div className="btngrp">
            <button type="submit" className={`btn sm ${mode === "approve" ? "btn-primary" : "btn-danger"}`} disabled={short || busy}>Confirm {mode}</button>
            <button type="button" className="btn btn-ghost sm" onClick={() => { setMode(null); setReason(""); setErr(""); }}>Cancel</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

/** The notification matrix: for each kind of notice, whether it reaches the bell and the email digest. Approvals waiting for you always reach the bell. */
function Matrix({ role, L }: { role: string; L: LayerApi }) {
  const cats = catsFor(role);
  const flip = async (cat: Parameters<typeof setNotifPref>[0], ch: Parameters<typeof setNotifPref>[1], on: boolean) => {
    try { await setNotifPref(cat, ch, on); } catch (e) { L.toast(sodMessage(e, "Could not save the setting"), false); }
  };
  return (
    <div className="nt-prefs">
      <p className="field help" style={{ margin: "0 0 8px" }}>Choose how each kind of notice reaches you. The email digest is saved as a preference only: this build sends no email. Admin Console notices are not configurable.</p>
      {cats.map((c) => (
        <fieldset key={c.id} className="nt-pref">
          <legend>{c.label}<span className="sw-hint">{c.help}</span></legend>
          {NOTIF_CHANNELS.map((ch) => (
            <Switch key={ch.id} id={`np-${c.id}-${ch.id}`} label={ch.label} checked={isOn(role, c.id, ch.id)} disabled={isLocked(c.id, ch.id)} hint={isLocked(c.id, ch.id) ? (c.id === "approvals" ? "Always on, a pending decision is never hidden" : "Always on, security alerts always reach the bell") : undefined} onChange={(v) => void flip(c.id, ch.id, v)} />
          ))}
        </fieldset>
      ))}
    </div>
  );
}

/** Body of the notifications slide-over. An item opens its record to review. Items that the person can decide through the shared four-eyes path also
 *  carry Approve and Reject (with the reason and second-person rules); every other kind of decision is made on its record. */
export function NotificationsBody({ space, go, close, L }: { space: "ws" | "admin"; go: (p: string) => void; close: () => void; L: LayerApi }) {
  useData(); useModVersion(); // follow data and read-state changes
  const role = useApp((s) => s.role);
  const [tab, setTab] = useState<Tab>("all");
  const [prefs, setPrefs] = useState(false);
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

  if (prefs) {
    return (
      <div className="nt">
        <div className="nt-bar"><h4 className="nt-g" style={{ margin: 0 }}>Notification settings</h4><button className="btn btn-ghost sm" onClick={() => setPrefs(false)}><Icon name="back" />Back to notifications</button></div>
        {space === "ws" ? <Matrix role={role} L={L} /> : <p className="field help">Admin Console notices are not configurable.</p>}
      </div>
    );
  }
  return (
    <div className="nt">
      <div className="nt-bar">
        <div className="tabs" role="tablist" aria-label="Notification type">
          {TABS.map(([k, l]) => (
            <button key={k} className="tab" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l} <span className="nt-n">{count(k)}</span></button>
          ))}
        </div>
        <div className="btngrp" style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost sm" disabled={!unread} onClick={markAll}>Mark all read</button>
          <button className="btn btn-ghost sm" onClick={() => setPrefs(true)}><Icon name="bell" />Settings</button>
        </div>
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
                  {read.has(n.id) ? null : <><span className="nt-dot" aria-hidden="true" /><span className="vh">Unread</span></>}
                  <span className="nt-go"><span className="nt-go-t">Review</span><Icon name="chevron" /></span>
                </button>
                {n.approvalId ? <InlineDecision id={n.approvalId} title={n.title} L={L} /> : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
