/* Lifting a sign-in block on a network address (lib/ipGuard.ts). Platform super admins only, elevated, with a reason; audited in the admin log.
   Temporary blocks also end on their own; a permanent block ends only here. The real API must enforce the same rule. */
import { adminLog } from "@/lib/adminAudit";
import { assertElevated, ticketNote } from "@/lib/elevation";
import { LEVEL_LABEL, ipRecords, isBlocked, liftBlock, type IpRecord } from "@/lib/ipGuard";
import { clampText } from "@/lib/security";
import { assertRole, getActor, SodError } from "@/lib/sod";
import { apiFetch, viaApi } from "./http";

export const LIFT_REASON_MIN = 15;
export const blockedAddresses = (): IpRecord[] => ipRecords().filter((r) => isBlocked(r)).sort((a, b) => b.until - a.until);
export function unblockAddress(ip: string, reason: string) {
  return viaApi<IpRecord>(() => {
    assertRole("lift a sign-in block", "super");
    assertElevated();
    const why = clampText(reason, 300); if (why.length < LIFT_REASON_MIN) throw new SodError(`Give a reason of at least ${LIFT_REASON_MIN} characters.`);
    const r = ipRecords().find((x) => x.ip === ip);
    if (!r || !isBlocked(r)) throw new SodError("That address is not blocked.");
    const before = LEVEL_LABEL[r.level - 1] ?? "blocked";
    const out = liftBlock(ip, getActor().name) as IpRecord;
    adminLog("auth.ip.unblocked", `${ip}; reason: ${why}${ticketNote()}`, { before, after: "not blocked", categories: ["Security"] });
    return out;
  }, () => apiFetch<IpRecord>(`/platform/sign-in-blocks/${encodeURIComponent(ip)}/lift`, { method: "POST", body: JSON.stringify({ reason }) }));
}
