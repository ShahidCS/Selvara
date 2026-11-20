/* People & Devices API stubs. In mock mode each function performs the in-memory DATA mutation the prototype did and returns
 * what the caller needs for wsLog / toast; the caller then does wsLog / toast / bumpData.
 * The real API MUST enforce authorization, step-up / four-eyes for MFA reset and offboarding, and write the audit entry itself. */
import { DATA } from "@/lib/data";
import { registerKind, settle } from "@/lib/approvalFlow";
import { approvals, requestApproval } from "@/lib/approvals";
import { wsLog } from "@/lib/audit";
import { modAllowed } from "@/lib/rbac";
import { ACCESS_REQUESTS } from "@/lib/requests";
import { clampText } from "@/lib/security";
import { assertNotSelf, assertRole, isSamePerson, SodError, SOD } from "@/lib/sod";
import { appStore, bumpData } from "@/lib/store";
import { ADMIN_ROLE, adminCount, holdsPrivilegedAccess, isPrivilegedRoleName, memberRole } from "@/lib/teamRoles";
import { viaApi } from "./http";
import { wsPost } from "./ws";
import { API_ON } from "@/lib/rbac";
import { eligibleApprovers, KIND_MEMBER, validateResetFields } from "./mfa";
import type { ResetFields } from "./mfa";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Production: the server decides and records it (under /api/ws), then the workspace reloads. */
const post = <T,>(path: string, body: unknown) => wsPost<T>(`/ws${path}`, body);

/** UI gate only. The prototype had no per-action gate beyond module access (people: super, admin, owner); deny by default otherwise. */
export const canManagePeople = (roleId: string) => modAllowed(roleId, "ws", "people");

export const findPerson = (id: string): any | undefined => DATA.people.find((x) => x.id === id);

/** Prototype: pplInit. Fills posture / accounts / employment lazily (idempotent). */
export function initPerson(p: any) {
  const comp = p.device === "Compliant";
  if (!p.posture) p.posture = { antivirus: comp ? "On" : "Missing", encryption: comp ? "On" : "Off", screenLock: comp ? "On" : "Off", passwordMgr: comp ? "In use" : "Not detected", os: comp ? "macOS 15.1" : "Windows 10 (EOL soon)" };
  if (!p.accounts) p.accounts = DATA.access.filter((a) => a.user === p.name || a.user.split(" ").slice(-1)[0] === p.name.split(" ").slice(-1)[0]).map((a) => ({ system: a.system, level: a.level }));
  if (!p.employment) p.employment = p.contractor ? "Contractor" : "Employee";
  return p;
}

/** Pending four-eyes requests for People (shown by PendingApprovals). */
export const KINDS = [KIND_MEMBER, "offboard"];
export const eligibleMemberApprovers = (subject: string) => eligibleApprovers(["admin", "owner"], subject);
export const isPrivilegedPerson = (p: any): boolean => holdsPrivilegedAccess(p.name) || isPrivilegedRoleName(memberRole(p));
const pendingFor = (kind: string, subject: string) => approvals.get().list.some((a) => a.status === "Pending" && a.kind === kind && isSamePerson(a.subject, subject));

/** MFA reset for a member (SOD_MATRIX 3 and 4). Raises an approval; the reset itself happens only on final approval (see handler below). */
export function requestMemberMfaReset(input: ResetFields & { personId: string }) {
  if (API_ON) return post<{ id: string; needs: number }>(`/people/${encodeURIComponent(input.personId)}/mfa-reset`, { checks: [input.checks?.callback, input.checks?.sponsor, input.checks?.idCheck], reason: input.reason, reasonText: input.reasonText, ticket: input.ticket, approver: input.approver })
    .then((r) => ({ name: findPerson(input.personId)?.name ?? "", needs: r.needs, id: r.id }) as never);
  return Promise.resolve().then(() => {
    settle();
    assertRole("request a member MFA reset", "admin");
    if (!canManagePeople(appStore.get().role)) throw new SodError("Not permitted.");
    const p = findPerson(input.personId); if (!p) throw new SodError("Person not found.");
    assertNotSelf("self-service MFA reset is not allowed through this flow", p.name);
    if (!p.mfa) throw new SodError("This person has no MFA enrolled.");
    if (pendingFor(KIND_MEMBER, p.name)) throw new SodError("A reset is already pending for this person.");
    const eligible = eligibleMemberApprovers(p.name);
    const needs: 1 | 2 = isPrivilegedPerson(p) ? 2 : 1;
    if (eligible.length < needs) throw new SodError(`This reset needs ${needs} eligible approver(s) (not you, not ${p.name}); only ${eligible.length} available.`);
    const clean = validateResetFields(input, eligible);
    const ap = requestApproval({
      kind: KIND_MEMBER, title: `Reset MFA for ${p.name}`, subject: p.name, needs, approverRoles: ["admin", "owner"], forbid: [p.name], ttlHours: SOD.MFA_RESET_REQUEST_TTL_H, ticket: clean.ticket, domain: "ws",
      payload: { personId: p.id, reason: clean.reason, reasonText: clean.reasonText, approver: clean.approver, checks: { callback: true, sponsor: true, idCheck: true } },
    });
    wsLog("person.mfa.reset.requested", `${p.name}; ticket ${clean.ticket}; named approver ${clean.approver}; ${needs} approval(s) needed; identity checks confirmed; request ${ap.id}`, "Access");
    return { name: p.name as string, id: ap.id };
  });
}
registerKind(KIND_MEMBER, {
  describe: (a) => `${a.payload.reason} · ticket ${a.ticket}`,
  apply: (a) => {
    const u = findPerson(String(a.payload.personId)); if (!u) return;
    u.mfa = false; u.sessionsRevoked = true; u.mustReenrol = true; u.recoveryCodesValid = false;
    wsLog("person.mfa.reset", `${u.name}; approved by ${a.approvals.map((x) => x.by).join(", ")}; ticket ${a.ticket}; effects applied: sessions revoked, factors removed, user notified, re-enrolment forced, recovery codes invalidated`, "Access");
  },
  closed: (a) => { wsLog("person.mfa.reset." + a.status.toLowerCase(), `${a.subject}; ticket ${a.ticket}${a.decidedReason ? "; reason: " + a.decidedReason : ""}`, "Access"); },
});

/** Revokes every access grant of a person and closes their open access requests. Returns the number of grants removed. */
function revokeAllAccess(p: any, why: string): number {
  let n = 0;
  for (let i = DATA.access.length - 1; i >= 0; i--) {
    const g = DATA.access[i];
    if (!isSamePerson(g.user, p.name)) continue;
    g.status = "Revoked"; DATA.access.splice(i, 1); n++;
    wsLog("access.revoked", `${g.user} → ${g.system} (${g.level}); ${why}`, "Access");
  }
  ACCESS_REQUESTS.forEach((r) => { if (r.status === "Pending" && isSamePerson(r.user, p.name)) { r.status = "Denied"; r.decisionReason = why; wsLog("access.request.denied", `${r.user} → ${r.system}; ${why}`, "Access"); } });
  p.accounts = [];
  return n;
}
function executeOffboard(p: any, transferTo: string, approvedBy: string): { name: string; revoked: number } {
  const revoked = revokeAllAccess(p, "offboarding");
  DATA.people = DATA.people.filter((x) => x.id !== p.id);
  wsLog("person.offboarded", `${p.name}, items → ${transferTo}; ${revoked} access grant(s) revoked${approvedBy ? "; approved by " + approvedBy : ""}`, "Access");
  bumpData();
  return { name: p.name as string, revoked };
}
registerKind("offboard", {
  describe: (a) => `Offboard, transfer to ${a.payload.transferTo}`,
  apply: (a) => {
    const p = findPerson(String(a.payload.personId)); if (!p) return;
    if (memberRole(p) === ADMIN_ROLE && adminCount() <= 1) { wsLog("person.offboard.blocked", `${p.name}; last remaining admin`, "Access"); return; }
    executeOffboard(p, String(a.payload.transferTo), a.approvals.map((x) => x.by).join(", "));
  },
  closed: (a) => { wsLog("person.offboard." + a.status.toLowerCase(), `${a.subject}${a.decidedReason ? "; reason: " + a.decidedReason : ""}`, "Access"); },
});

/** Offboarding. Accounts holding privileged access (Admin / Super admin grants or a privileged role) need a second approver; otherwise it completes now.
 *  Either way all of the person's access grants are revoked and logged when it completes. Transfer target must be a known person. */
export function offboardPerson(id: string, transferTo: string) {
  if (API_ON) return post<{ pending: boolean; revoked?: number; id?: string }>(`/people/${encodeURIComponent(id)}/offboard`, { transferTo })
    .then((r) => ({ name: findPerson(id)?.name ?? "", pending: r.pending, revoked: r.revoked ?? 0 }) as never);
  return Promise.resolve().then(() => {
    settle();
    assertRole("offboard people", "admin", "owner");
    if (!canManagePeople(appStore.get().role)) throw new SodError("Not permitted.");
    const p = findPerson(id); if (!p) throw new SodError("Person not found.");
    assertNotSelf("you cannot offboard yourself", p.name);
    const t = DATA.people.find((x) => x.id !== id && isSamePerson(x.name, clampText(transferTo, 80)));
    if (!t) throw new SodError("Transfer owned items to a known person (not the person being offboarded).");
    if (memberRole(p) === ADMIN_ROLE && adminCount() <= 1) throw new SodError("The last remaining admin cannot be offboarded.");
    if (isPrivilegedPerson(p)) {
      if (pendingFor("offboard", p.name)) throw new SodError("An offboarding request is already pending for this person.");
      if (!eligibleApprovers(["admin", "owner"], p.name).length) throw new SodError("No eligible second approver (not you, not the person being offboarded).");
      const ap = requestApproval({ kind: "offboard", title: `Offboard ${p.name} (privileged access)`, subject: p.name, needs: 1, approverRoles: ["admin", "owner"], forbid: [p.name], ttlHours: 72, domain: "ws", payload: { personId: p.id, transferTo: t.name } });
      wsLog("person.offboard.requested", `${p.name}, items → ${t.name}; privileged access, second approver required; request ${ap.id}`, "Access");
      return { name: p.name as string, pending: true, revoked: 0 };
    }
    const r = executeOffboard(p, t.name, "");
    return { name: r.name, pending: false, revoked: r.revoked };
  });
}

/** Prototype: pplDoAddContractor. The source id was "PP-"+(length+1), which can collide after an offboarding; pick the next unused number instead. */
export function addContractor(input: { name: string; role: string; dept: string }) {
  return viaApi<{ id: string; name: string }>(() => {
    assertRole("add a contractor", "admin", "owner");
    let n = DATA.people.length + 1;
    while (DATA.people.some((x) => x.id === "PP-" + n)) n++;
    const id = "PP-" + n;
    DATA.people.push(initPerson({ id, name: input.name, role: input.role || "Contractor", dept: input.dept || "External", device: "Unmanaged", mfa: false, contractor: true }));
    return { id, name: input.name };
  }, () => post<{ id: string; name: string }>("/people/contractors", input));
}
