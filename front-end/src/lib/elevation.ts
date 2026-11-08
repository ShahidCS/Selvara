/* Just-in-time elevation for the Platform Super Admin role (board: super-admin-console, gap 8.G1).
 *
 * IMPORTANT: this is UI state for a demonstration. It is NOT an access control. Real enforcement (hardware security key,
 * allow-listed network, JIT role grant, 60-minute cap, reason capture) is server-side; the server must refuse privileged
 * calls when its own elevation record is missing or expired, whatever this store says. State is deliberately in memory
 * only (never localStorage): a reload drops the session to non-privileged, which is the safe default.
 * Expiry is computed from absolute timestamps (`until`), never by counting timer ticks, so throttled tabs cannot extend it. */
import { useEffect, useState, useSyncExternalStore } from "react";
import { adminLog } from "./adminAudit";
import { getMe } from "./audit";
import { roleOf } from "./rbac";
import { appStore, createStore } from "./store";
import { clampText } from "./security";

export const ELEV_MAX_MIN = 60;
export const ELEV_REASON_MAX = 300;
export const ELEV_DURATIONS = [15, 30, 60] as const;
export const ELEV_ROLE = "super";

export interface Elevation { until: number; reason: string; startedAt: number; actor: string; roleName: string }
export interface ElevOutcome { kind: "ended" | "expired"; at: number; note: string }
const store = createStore<{ elevation: Elevation | null; last: ElevOutcome | null }>({ elevation: null, last: null });

/** Deny by default: only the Platform Super Admin role can elevate. */
export const canElevate = (roleId: string) => roleId === ELEV_ROLE;

const p2 = (x: number) => String(x).padStart(2, "0");
/** "YYYY-MM-DD HH:MM UTC" */
export function fmtUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())} UTC`;
}
export const fmtCountdown = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${p2(s % 60)}`; };

export type StartResult = { ok: true; until: number } | { ok: false; why: "forbidden" | "active" | "reason" | "minutes" };
export const ELEV_FAIL: Record<string, string> = {
  forbidden: "Only the Platform Super Admin role can elevate", active: "This session is already elevated",
  reason: "Enter a reason for the elevation", minutes: "Choose a duration of 60 minutes or less",
};

export function startElevation(roleId: string, reasonRaw: unknown, minutesRaw: unknown): StartResult {
  if (!canElevate(roleId)) return { ok: false, why: "forbidden" };
  expireIfDue();
  if (store.get().elevation) return { ok: false, why: "active" };
  const reason = clampText(reasonRaw, ELEV_REASON_MAX);
  if (!reason) return { ok: false, why: "reason" };
  const minutes = Number(minutesRaw);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > ELEV_MAX_MIN) return { ok: false, why: "minutes" };
  const now = Date.now(); const until = now + minutes * 60000; const me = getMe();
  store.set({ elevation: { until, reason, startedAt: now, actor: me.name, roleName: roleOf(roleId).name }, last: null });
  adminLog("admin.elevated", "Platform super admin role", {
    before: "Standard (non-privileged)", after: `Elevated ${minutes} min, until ${fmtUtc(until)}; hardware key: simulated (demo); reason: ${reason}`,
    basis: "Legitimate interest", categories: ["Authentication", "Account"],
  });
  return { ok: true, until };
}

/** Ends the elevation (idempotent: a second call finds nothing to end and logs nothing). */
export function endElevation(kind: "ended" | "expired" = "ended", note = ""): boolean {
  const e = store.get().elevation;
  if (!e) return false;
  const now = Date.now();
  const text = note || (kind === "expired" ? "Expired automatically at " + fmtUtc(e.until) : "Ended early by the operator");
  store.set({ elevation: null, last: { kind, at: now, note: text } });
  adminLog(kind === "expired" ? "admin.elevation.expired" : "admin.elevation.ended", "Platform super admin role", {
    actor: e.actor, role: e.roleName, before: `Elevated until ${fmtUtc(e.until)}`, after: "Standard (non-privileged); " + text,
    basis: "Legitimate interest", categories: ["Authentication", "Account"],
  });
  return true;
}
/** Drops an elapsed elevation. Safe to call from any number of components. */
export function expireIfDue(): boolean {
  const e = store.get().elevation;
  return !!e && e.until <= Date.now() ? endElevation("expired") : false;
}

export interface ElevationView {
  active: boolean; until: number | null; reason: string; remainingMs: number; canElevate: boolean;
  last: ElevOutcome | null; request: (reason: string, minutes: number) => StartResult; end: () => boolean;
}
/** Hook other modules can adopt later (e.g. to disable mutation buttons with "Elevate to make changes"). Display state only. */
export function useElevation(): ElevationView {
  const role = useApp2();
  const e = useSyncExternalStore(store.subscribe, () => store.get().elevation, () => null);
  const last = useSyncExternalStore(store.subscribe, () => store.get().last, () => null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    expireIfDue();
    if (!e) return;
    setNow(Date.now());
    const iv = setInterval(() => { setNow(Date.now()); expireIfDue(); }, 1000);
    const to = setTimeout(expireIfDue, Math.max(0, e.until - Date.now()) + 50);
    return () => { clearInterval(iv); clearTimeout(to); };
  }, [e]);
  useEffect(() => { if (e && !canElevate(role)) endElevation("ended", "Role changed; session dropped to non-privileged"); }, [e, role]);
  const live = !!e && canElevate(role) && e.until > now;
  return {
    active: live, until: e ? e.until : null, reason: e ? e.reason : "", remainingMs: e ? Math.max(0, e.until - now) : 0,
    canElevate: canElevate(role), last, request: (r, m) => startElevation(appStore.get().role, r, m), end: () => endElevation("ended"),
  };
}
function useApp2(): string {
  return useSyncExternalStore(appStore.subscribe, () => appStore.get().role, () => appStore.get().role);
}

/* ---------- customer-approved support grants (board 8.G2) ---------- */
export interface SupportGrant { id: string; custId: string; approvedBy: string; approvedAt: number; expiresAt: number; scope: string }
let grants: SupportGrant[] | null = null;
/** Synthetic seed, created lazily on the client so times are relative to the session (no SSR clock mismatch). Real grants come from the server. */
export function getSupportGrants(): SupportGrant[] {
  if (!grants) {
    const t = Date.now(); const m = 60000;
    grants = [
      { id: "SG-1003", custId: "cust-103", approvedBy: "security@najm.example", approvedAt: t - 90 * m, expiresAt: t - 90 * m + 240 * m, scope: "Read-only" },
      { id: "SG-1002", custId: "cust-102", approvedBy: "grc@contoso.example", approvedAt: t - 300 * m, expiresAt: t - 300 * m + 240 * m, scope: "Read-only" },
      { id: "SG-1001", custId: "cust-105", approvedBy: "it@liffey.example", approvedAt: t - 20 * m, expiresAt: t - 20 * m + 60 * m, scope: "Read-only" },
    ];
  }
  return grants;
}
