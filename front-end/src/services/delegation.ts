/* Delegation of a named approver slot (rules: src/lib/delegation.ts, docs/security/SOD_MATRIX.md section 9). Deny by default, audited with who, to whom,
   until when and why; the real API must enforce every rule again. */
import { DAY_MS, DELEGATION, delegations, givenBy, isLive, liveDelegations, type Delegation } from "@/lib/delegation";
import { wsLog } from "@/lib/audit";
import { clampText } from "@/lib/security";
import { ROLES } from "@/lib/rbac";
import { assertRole, getActor, hasRole, isSamePerson, SodError } from "@/lib/sod";
import { bumpData } from "@/lib/store";
import { apiFetch, viaApi } from "./http";

const post = <T,>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";
export const delegationUntil = fmt;

/** People the signed-in person may delegate to: another admin or owner. */
export function eligibleDelegates(): string[] {
  const me = getActor(); const out: string[] = [];
  ROLES.forEach((r) => {
    if (!hasRole(r.id, ...DELEGATION.ROLES) || isSamePerson(r.person, me.name) || out.some((o) => isSamePerson(o, r.person))) return;
    out.push(r.person);
  });
  return out;
}
/** Ends delegations that ran out (audited once each). Safe to call often. */
export function sweepDelegations(): void {
  let changed = false;
  delegations.get().list.forEach((d) => {
    if (!d.endedLogged && !d.revokedAt && d.until <= Date.now()) { d.endedLogged = true; wsLog("delegation.expired", `${d.from} → ${d.to}`, "Approval"); changed = true; }
  });
  if (changed) { delegations.set((s) => ({ list: [...s.list] })); bumpData(); }
}

export interface NewDelegation { to: string; days: number; reason: string }
export function createDelegation(input: NewDelegation) {
  return viaApi<Delegation>(() => {
    sweepDelegations();
    assertRole("delegate approvals", ...DELEGATION.ROLES);
    const me = getActor();
    const to = ROLES.find((r) => isSamePerson(r.person, String(input.to)) && hasRole(r.id, ...DELEGATION.ROLES));
    if (!to) throw new SodError("Choose another admin or owner.");
    if (isSamePerson(to.person, me.name)) throw new SodError("Segregation of duties: you cannot delegate to yourself.");
    const days = Number(input.days);
    if (!Number.isInteger(days) || days < 1 || days > DELEGATION.MAX_DAYS) throw new SodError(`Choose 1 to ${DELEGATION.MAX_DAYS} days.`);
    const reason = clampText(input.reason, 300);
    if (reason.length < DELEGATION.REASON_MIN) throw new SodError(`Give a reason of at least ${DELEGATION.REASON_MIN} characters.`);
    if (givenBy(me.name)) throw new SodError("You already have an active delegation. End it before starting another.");
    // no loops: if they delegated to you, you cannot delegate back while that is live
    if (liveDelegations().some((d) => isSamePerson(d.from, to.person) && isSamePerson(d.to, me.name))) throw new SodError("That person has delegated to you. End that delegation first.");
    const d: Delegation = { id: "DG-" + (101 + delegations.get().list.length), from: me.name, fromRoleId: me.roleId, to: to.person, toRoleId: to.id, reason, createdAt: Date.now(), until: Date.now() + days * DAY_MS };
    delegations.set((s) => ({ list: [d, ...s.list] }));
    wsLog("delegation.created", `${d.id}: ${d.from} → ${d.to} until ${fmt(d.until)}; reason: ${reason}`, "Approval"); bumpData();
    return d;
  }, () => post<Delegation>("/delegations", input));
}
/** The delegator ends it at any time; a company admin may also end anyone's (a safety valve), with the same audit entry. */
export function revokeDelegation(id: string) {
  return viaApi<Delegation>(() => {
    sweepDelegations();
    const d = delegations.get().list.find((x) => x.id === id);
    if (!d) throw new SodError("Delegation not found.");
    if (!isLive(d)) throw new SodError("That delegation has already ended.");
    const me = getActor();
    if (!isSamePerson(d.from, me.name) && !hasRole(me.roleId, "admin")) throw new SodError("Only the person who delegated, or a company admin, can end it.");
    d.revokedAt = Date.now(); d.revokedBy = me.name; d.endedLogged = true;
    delegations.set((s) => ({ list: [...s.list] }));
    wsLog("delegation.revoked", `${d.id}: ${d.from} → ${d.to}, ended by ${me.name}`, "Approval"); bumpData();
    return d;
  }, () => post<Delegation>(`/delegations/${encodeURIComponent(id)}/revoke`, {}));
}
