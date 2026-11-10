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
import { SOD, SodError, baseRole } from "./sod";

export const ELEV_MAX_MIN = SOD.ELEVATION_MAX_MIN;
export const ELEV_REASON_MAX = 300;
export const ELEV_REASON_MIN = 15;
export const ELEV_DURATIONS = [15, 30, 60] as const;
/** Base role that may elevate (matches `super` and `super2` through baseRole). */
export const ELEV_ROLE = "super";
/** Exact text for disabled mutation controls and the banner link (docs/security/SOD_MATRIX.md section 2). */
export const ELEVATE_TEXT = "Elevate to make changes";
/** Ticket reference, e.g. SEC-1234. Anchored; the value is also used in audit text, so only this pattern is ever accepted. */
export const TICKET_RE = /^[A-Z]{2,6}-\d{1,6}$/;
export const validTicket = (t: unknown): t is string => typeof t === "string" && TICKET_RE.test(t.trim());

export interface Elevation { until: number; reason: string; ticket: string; startedAt: number; actor: string; roleId: string; roleName: string }
export interface ElevOutcome { kind: "ended" | "expired"; at: number; note: string }
const store = createStore<{ elevation: Elevation | null; last: ElevOutcome | null }>({ elevation: null, last: null });

/** Deny by default: only platform super admins (super, super2) can elevate. Support never can. */
export const canElevate = (roleId: string) => baseRole(roleId) === ELEV_ROLE;

const p2 = (x: number) => String(x).padStart(2, "0");
/** "YYYY-MM-DD HH:MM UTC" */
export function fmtUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())} UTC`;
}
export const fmtCountdown = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${p2(s % 60)}`; };

export type StartResult = { ok: true; until: number } | { ok: false; why: "forbidden" | "active" | "reason" | "ticket" | "minutes" };
export const ELEV_FAIL: Record<string, string> = {
  forbidden: "Only platform super admins can elevate", active: "This session is already elevated",
  reason: `Enter a reason of at least ${ELEV_REASON_MIN} characters`, ticket: "Enter a ticket reference such as SEC-1234",
  minutes: "Choose a duration of 60 minutes or less",
};

export function startElevation(roleId: string, reasonRaw: unknown, minutesRaw: unknown, ticketRaw?: unknown): StartResult {
  if (!canElevate(roleId)) return { ok: false, why: "forbidden" };
  expireIfDue(); dropIfRoleChanged();
  if (store.get().elevation) return { ok: false, why: "active" };
  const reason = clampText(reasonRaw, ELEV_REASON_MAX);
  if (reason.length < ELEV_REASON_MIN) return { ok: false, why: "reason" };
  const ticket = String(ticketRaw ?? "").trim();
  if (!TICKET_RE.test(ticket)) return { ok: false, why: "ticket" };
  const minutes = Number(minutesRaw);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > ELEV_MAX_MIN) return { ok: false, why: "minutes" };
  const now = Date.now(); const until = now + minutes * 60000; const me = getMe();
  store.set({ elevation: { until, reason, ticket, startedAt: now, actor: me.name, roleId, roleName: roleOf(roleId).name }, last: null });
  adminLog("admin.elevated", "Platform super admin role", {
    before: "Standard (non-privileged)", after: `Elevated ${minutes} min, until ${fmtUtc(until)}; ticket: ${ticket}; hardware key: simulated (demo); reason: ${reason}`,
    basis: "Legitimate interest", categories: ["Authentication", "Account"],
  });
  return { ok: true, until };
}

/** Message safe to show in a toast: SodError text only; anything else gets the fallback (never raw exception text). */
export const sodMessage = (e: unknown, fallback: string): string => (e instanceof SodError ? e.message : fallback);

/** True only while THIS actor (the current role) holds an unexpired elevation. A role switch to another person never inherits it.
 *  Services call this through assertElevated(); UI calls it (or useElevation) to disable buttons. Not a trust boundary: the API must check its own record. */
export function elevationActive(): boolean {
  expireIfDue(); dropIfRoleChanged();
  return elevationLive();
}
/** Same check without side effects (no audit write, no store update): safe to call while rendering. */
export function elevationLive(): boolean {
  const e = store.get().elevation;
  return !!e && e.until > Date.now() && canElevate(appStore.get().role) && e.roleId === appStore.get().role;
}
/** Deny by default: every admin mutation calls this first. */
export function assertElevated(): void {
  if (!elevationActive()) throw new SodError("Elevation required");
}
/** Ticket of the live elevation ("" when none) for audit entries. */
export const elevationTicket = (): string => { const e = store.get().elevation; return e && elevationActive() ? e.ticket : ""; };
/** Audit suffix "; ticket SEC-1" (empty when not elevated). */
export const ticketNote = (): string => { const t = elevationTicket(); return t ? `; elevation ticket ${t}` : ""; };

function dropIfRoleChanged(): void {
  const e = store.get().elevation;
  if (e && e.roleId !== appStore.get().role) endElevation("ended", "Role switched; session dropped to non-privileged");
}

/** Ends the elevation (idempotent: a second call finds nothing to end and logs nothing). */
export function endElevation(kind: "ended" | "expired" = "ended", note = ""): boolean {
  const e = store.get().elevation;
  if (!e) return false;
  const now = Date.now();
  const text = note || (kind === "expired" ? "Expired automatically at " + fmtUtc(e.until) : "Ended early by the operator");
  store.set({ elevation: null, last: { kind, at: now, note: text } });
  adminLog(kind === "expired" ? "admin.elevation.expired" : "admin.elevation.ended", "Platform super admin role", {
    actor: e.actor, role: e.roleName, before: `Elevated until ${fmtUtc(e.until)}; ticket ${e.ticket}`, after: "Standard (non-privileged); " + text,
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
  last: ElevOutcome | null; ticket: string; request: (reason: string, minutes: number, ticket: string) => StartResult; end: () => boolean;
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
    const iv = setInterval(() => { setNow(Date.now()); expireIfDue(); }, 1000);
    const to = setTimeout(expireIfDue, Math.max(0, e.until - Date.now()) + 50);
    return () => { clearInterval(iv); clearTimeout(to); };
  }, [e]);
  useEffect(() => { if (e && (!canElevate(role) || e.roleId !== role)) endElevation("ended", "Role changed; session dropped to non-privileged"); }, [e, role]);
  // `now` only ticks while a session is active, so it can be stale when a new one starts. A session never starts in the future, so the
  // clock is never read earlier than its start: the first frame is accurate without setting state in the effect.
  const clock = e ? Math.max(now, e.startedAt) : now;
  const live = !!e && canElevate(role) && e.roleId === role && e.until > clock;
  return {
    active: live, until: e ? e.until : null, reason: e ? e.reason : "", remainingMs: e ? Math.max(0, e.until - clock) : 0, ticket: e ? e.ticket : "",
    canElevate: canElevate(role), last, request: (r, m, t) => startElevation(appStore.get().role, r, m, t), end: () => endElevation("ended"),
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
