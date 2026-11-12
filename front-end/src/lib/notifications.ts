/* Notifications for the bell. Derived from the same in-memory data the modules show (no separate feed), so a notification can never claim something
   the register does not. Only items for modules the signed-in role may open are returned. Read state is per browser session (module state). */
import { DATA } from "./data";
import { MFA_REQUESTS, custList } from "./platform";
import { modAllowed } from "./rbac";
import { getModState, setModState } from "./store";

export type NotifKind = "approval" | "alert";
export type NotifTone = "bad" | "warn" | "info";
export interface Notif {
  id: string;
  kind: NotifKind;
  tone: NotifTone;
  icon: string;
  title: string;
  detail: string;
  /** Route that opens the record to review (a notification never decides anything itself: decisions need a reason and a second person). */
  path: string;
}
type Space = "ws" | "admin";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function notificationsFor(role: string, space: Space): Notif[] {
  const out: Notif[] = [];
  const can = (mod: string) => modAllowed(role, space, mod);
  if (space === "ws") {
    if (can("controls")) {
      for (const c of DATA.controls.filter((x: any) => x.status === "Fail")) {
        out.push({ id: `ctl:${c.id}`, kind: "alert", tone: "bad", icon: "controls", title: `${c.id} is failing`, detail: `${c.title}, owner ${c.owner}`, path: `/ws/controls/${encodeURIComponent(c.id)}` });
      }
      const ne = DATA.controls.filter((x: any) => x.status === "Needs evidence").length;
      if (ne) out.push({ id: "ctl:needs-evidence", kind: "alert", tone: "warn", icon: "evidence", title: `${ne} control${ne === 1 ? "" : "s"} need evidence`, detail: "Collect or attach evidence before the next test", path: "/ws/controls" });
    }
    if (can("issues")) {
      for (const i of DATA.issues.filter((x: any) => x.status !== "Closed" && /Overdue/.test(x.due))) {
        out.push({ id: `iss:${i.id}`, kind: "alert", tone: "bad", icon: "issues", title: i.title, detail: `${i.id}, ${i.owner}, ${String(i.due).toLowerCase()}`, path: `/ws/issues/${encodeURIComponent(i.id)}` });
      }
    }
    if (can("vendors")) {
      for (const v of DATA.vendors.filter((x: any) => /Overdue/.test(x.due) || x.status === "In review")) {
        const overdue = /Overdue/.test(v.due);
        out.push({ id: `ven:${v.name}`, kind: "alert", tone: overdue ? "bad" : "warn", icon: "vendors", title: overdue ? `Vendor review overdue: ${v.name}` : `Vendor in review: ${v.name}`, detail: `${v.tier} tier, ${v.cat}`, path: "/ws/vendors" });
      }
    }
  } else {
    if (can("mfa")) {
      for (const r of MFA_REQUESTS.filter((x: any) => x.status === "Pending approval")) {
        out.push({ id: `mfa:${r.id}`, kind: "approval", tone: "info", icon: "access", title: `MFA reset awaiting approval: ${r.subject}`, detail: `${r.id}, requested by ${r.by}`, path: "/admin/mfa" });
      }
    }
    if (can("billing")) {
      for (const c of custList().filter((x: any) => x.status === "Past due")) {
        out.push({ id: `bil:${c.id}`, kind: "alert", tone: "bad", icon: "billing", title: `${c.name} invoice is past due`, detail: "Customer billing", path: `/admin/billing` });
      }
    }
  }
  return out;
}

const KEY = "shell.notifRead";
export const readIds = (): string[] => getModState<string[]>(KEY, []);
export const markRead = (ids: string[]) => setModState(KEY, Array.from(new Set([...readIds(), ...ids])));
/** Restores the read set (used by Undo on "Mark all read"). */
export const restoreRead = (ids: string[]) => setModState(KEY, ids);
export const unreadCount = (items: Notif[]): number => { const r = new Set(readIds()); return items.filter((n) => !r.has(n.id)).length; };
