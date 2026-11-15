/* Notification matrix (phase 5, draft for compliance review): which kinds of notice reach which channel, per signed-in persona.
   Rules: approvals waiting for your decision and security alerts about your own account always reach the bell (never silenced). Everything else is your choice.
   The bell is real; the email digest is a saved preference only, because this build has no mail service (nothing is sent). Admin Console notices are not
   configurable. State is per browser session, like the read state. */
import { modAllowed } from "./rbac";
import { getModState, setModState } from "./store";

export type NotifCat = "security" | "approvals" | "controls" | "evidence" | "issues" | "vendors";
export type NotifChannel = "bell" | "email";

export interface NotifCatDef { id: NotifCat; label: string; help: string; /** Module the person must be able to open to receive it. */ mod: string | null }
export const NOTIF_CATS: NotifCatDef[] = [
  { id: "security", label: "Security alerts about your account", help: "Sign-in, password and session events", mod: null },
  { id: "approvals", label: "Approvals waiting for you", help: "Requests you can decide", mod: null },
  { id: "controls", label: "Failing controls", help: "A control test failed", mod: "controls" },
  { id: "evidence", label: "Controls needing evidence", help: "Evidence is missing or stale", mod: "controls" },
  { id: "issues", label: "Overdue issues", help: "An open issue is past its due date", mod: "issues" },
  { id: "vendors", label: "Vendor reviews", help: "A vendor review is overdue or in progress", mod: "vendors" },
];
export const NOTIF_CHANNELS: { id: NotifChannel; label: string }[] = [{ id: "bell", label: "In the bell" }, { id: "email", label: "Email digest" }];

/** Defaults: everything in the bell; the digest only for approvals. */
const DEFAULT_ON = (cat: NotifCat, ch: NotifChannel) => ch === "bell" || cat === "approvals" || cat === "security";
/** Cells nobody can switch off. */
export const isLocked = (cat: NotifCat, ch: NotifChannel): boolean => (cat === "approvals" || cat === "security") && ch === "bell";
export const isCat = (v: unknown): v is NotifCat => NOTIF_CATS.some((c) => c.id === v);
export const isChannel = (v: unknown): v is NotifChannel => NOTIF_CHANNELS.some((c) => c.id === v);
/** Categories this persona can receive at all (the module must be open to them). */
export const catsFor = (role: string): NotifCatDef[] => NOTIF_CATS.filter((c) => !c.mod || modAllowed(role, "ws", c.mod));

const KEY = "shell.notifPrefs";
type Prefs = Record<string, Record<string, boolean>>; // role -> "cat:channel" -> on
const all = () => getModState<Prefs>(KEY, {});
export function isOn(role: string, cat: NotifCat, ch: NotifChannel): boolean {
  if (isLocked(cat, ch)) return true;
  const v = all()[role]?.[`${cat}:${ch}`];
  return v === undefined ? DEFAULT_ON(cat, ch) : v;
}
export function setPref(role: string, cat: NotifCat, ch: NotifChannel, on: boolean): void {
  const p = all(); setModState(KEY, { ...p, [role]: { ...(p[role] || {}), [`${cat}:${ch}`]: on } });
}
