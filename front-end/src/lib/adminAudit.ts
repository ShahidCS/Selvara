/* Platform admin audit log: append-only, hash-chained, RoPA-aligned (ported from the prototype's adminLog).
 * The FNV-1a chain is a tamper-evidence demonstration, NOT a cryptographic control: a real system needs server-side
 * append-only storage with HMAC/signatures. */
import { ADMIN_SEED } from "./platform";
import { appStore, bumpData } from "./store";
import { roleOf } from "./rbac";
import { getMe, hashStr } from "./audit";
import { nowStampUTC } from "./format";
import { randInt } from "./security";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface AdminEntry {
  seq: number; prev: string; hash: string; at: string; actor: string; role: string; tenant: string; action: string; object: string;
  before: string; after: string; basis: string; categories: string[]; ip: string;
}
const ZERO = "0".repeat(8);
export function chainEntry(e: any, prev: string, seq: number): string {
  const body = [seq, e.at, e.actor, e.role, e.tenant, e.action, e.object, e.before, e.after, e.basis, (e.categories || []).join("|"), e.ip, prev].join("␟");
  return hashStr(body);
}
export const ADMIN_AUDIT: AdminEntry[] = [];
(function initChain() {
  let prev = ZERO;
  ADMIN_SEED.forEach((e: any, i: number) => {
    const seq = i + 1; const entry = { seq, prev, ...e } as AdminEntry; entry.hash = chainEntry(e, prev, seq); prev = entry.hash; ADMIN_AUDIT.push(entry);
  });
})();
export const lastHash = () => (ADMIN_AUDIT.length ? ADMIN_AUDIT[ADMIN_AUDIT.length - 1].hash : ZERO);
/** Verify the chain is intact (append-only, no edits). */
export function verifyChain(): boolean {
  let prev = ZERO;
  for (const e of ADMIN_AUDIT) { if (e.prev !== prev || e.hash !== chainEntry(e, prev, e.seq)) return false; prev = e.hash; }
  return true;
}
/** Synthetic documentation-range address (198.51.100.0/24). Never a real client IP. */
export const synthIP = () => "198.51.100." + (2 + randInt(250));

export interface AdminLogOpts { actor?: string; role?: string; tenant?: string; before?: string; after?: string; basis?: string; categories?: string[]; ip?: string }
export function adminLog(action: string, object?: string, opts: AdminLogOpts = {}): AdminEntry {
  const prev = lastHash(); const seq = ADMIN_AUDIT.length + 1;
  const e = {
    at: nowStampUTC(), actor: opts.actor || getMe().name, role: opts.role || roleOf(appStore.get().role).name, tenant: opts.tenant || "", action,
    object: object || "", before: opts.before || "", after: opts.after || "", basis: opts.basis || "Legitimate interest", categories: opts.categories || ["Account"], ip: opts.ip || synthIP(),
  };
  const entry = { seq, prev, ...e } as AdminEntry; entry.hash = chainEntry(e, prev, seq);
  ADMIN_AUDIT.push(entry); bumpData(); return entry;
}
