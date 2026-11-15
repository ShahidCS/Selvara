/* Delegation of a NAMED approver slot (phase 5; policy: docs/security/SOD_MATRIX.md section 9). A company admin or owner who has been named as the approver
   of a request (a policy, a member MFA reset) can hand that slot to another admin or owner for a limited time. It never grants new authority:
   the delegate must already hold an approver role, every rule the engine and the module apply to the delegate still applies (requester, subject, author,
   last editor, second person, reason), and nothing is delegated for platform (Admin Console) approvals. There are no chains: a delegation covers only the
   delegator's OWN slot, so a delegate cannot pass it on. In-memory demo; the real API must enforce all of this server-side. */
import { createStore } from "./store";
import { hasRole, getActor, isSamePerson } from "./sod";
import type { Approval } from "./approvals";

export interface Delegation {
  id: string; from: string; fromRoleId: string; to: string; toRoleId: string; reason: string;
  createdAt: number; until: number; revokedAt?: number; revokedBy?: string; endedLogged?: boolean;
}
export const delegations = createStore<{ list: Delegation[] }>({ list: [] });
/** Who may hold or receive a delegation (base roles), the longest period, the shortest reason. */
export const DELEGATION = { ROLES: ["admin", "owner"], MAX_DAYS: 14, REASON_MIN: 10 } as const;
export const DAY_MS = 86400_000;

export const isLive = (d: Delegation, now = Date.now()): boolean => !d.revokedAt && d.until > now;
export const liveDelegations = (): Delegation[] => delegations.get().list.filter((d) => isLive(d));
/** The live delegation a person has handed out (at most one), and the ones handed to them. */
export const givenBy = (name: string): Delegation | undefined => liveDelegations().find((d) => isSamePerson(d.from, name));
export const givenTo = (name: string): Delegation[] => liveDelegations().filter((d) => isSamePerson(d.to, name));

/** Why a delegation from `named` cannot cover this approval (null = it can): the delegator could not decide it themselves. */
export function delegatorConflict(a: Approval, named: string): string | null {
  if (isSamePerson(named, a.requestedBy)) return "The named approver raised this request, so it cannot be delegated.";
  if (a.forbid.some((f) => isSamePerson(named, f))) return "The named approver is the subject of this request, so it cannot be delegated.";
  return null;
}

/** True when the signed-in person IS the named person, or holds a live delegation from them. Never for platform approvals, never chained
 *  (only a delegation from `named` themselves counts), and only while the delegate still holds an approver role. */
export function actsAs(named: string, approval?: Approval): boolean {
  const me = getActor();
  if (isSamePerson(me.name, named)) return true;
  if (approval && (approval.domain !== "ws" || delegatorConflict(approval, named))) return false;
  if (!hasRole(me.roleId, ...DELEGATION.ROLES)) return false;
  return liveDelegations().some((d) => isSamePerson(d.from, named) && isSamePerson(d.to, me.name));
}
/** The named person the signed-in person is acting for (null when they are the named person, or not acting through a delegation). */
export const onBehalfOf = (named: string, approval?: Approval): string | null =>
  named && !isSamePerson(getActor().name, named) && actsAs(named, approval) ? named : null;
