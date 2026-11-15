/* Notification matrix changes (rules: src/lib/notifPrefs.ts, docs/security/SOD_MATRIX.md section 10). Deny by default, audited. A person changes only their own
   preferences; the real API must key them to the authenticated user. */
import { wsLog } from "@/lib/audit";
import { NOTIF_CATS, NOTIF_CHANNELS, catsFor, isCat, isChannel, isLocked, isOn, setPref, type NotifCat, type NotifChannel } from "@/lib/notifPrefs";
import { getActor, SodError } from "@/lib/sod";
import { bumpData } from "@/lib/store";
import { apiFetch, viaApi } from "./http";

export function setNotifPref(cat: NotifCat, channel: NotifChannel, on: boolean) {
  return viaApi<{ cat: NotifCat; channel: NotifChannel; on: boolean }>(() => {
    if (!isCat(cat) || !isChannel(channel) || typeof on !== "boolean") throw new SodError("Unknown notification setting.");
    const me = getActor();
    if (!catsFor(me.roleId).some((c) => c.id === cat)) throw new SodError("Not permitted: your role does not receive that kind of notice.");
    if (isLocked(cat, channel) && !on) throw new SodError("Approvals waiting for your decision always appear in the bell.");
    if (isOn(me.roleId, cat, channel) === on) return { cat, channel, on };
    setPref(me.roleId, cat, channel, on);
    const label = (NOTIF_CATS.find((c) => c.id === cat) as { label: string }).label;
    const ch = (NOTIF_CHANNELS.find((c) => c.id === channel) as { label: string }).label;
    wsLog("notifications.pref.changed", `${me.name}: ${label}, ${ch.toLowerCase()} ${on ? "on" : "off"}`, "System"); bumpData();
    return { cat, channel, on };
  }, () => apiFetch("/notification-preferences", { method: "PUT", body: JSON.stringify({ cat, channel, on }) }));
}
