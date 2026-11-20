/* Server-only. People on the server (production programme group 2; inventory group 2, section 2). The workforce is the company's real members
   (their MFA status comes from the authentication service) plus contractors an admin or owner adds. A member MFA reset needs three identity
   checks, a ticket and a named approver (two approvers for a privileged person), and when approved it really resets: the member's
   authenticators and recovery codes are removed and their sessions in this company end, so they enrol again at the next sign-in. Offboarding
   really offboards: the membership ends (never the last admin), sessions end, grants are revoked, pending access requests are denied,
   delegations end, and owned controls and policies move to the chosen member. A privileged person needs a second admin or owner.
   Device posture has no source until the device integrations (group 7): it is shown as "Not connected", never invented. */
import { MFA_RESET_TTL_H, OFFBOARD_TTL_H, isPrivilegedLevel, mfaResetFieldsBlock, roleBlock } from "@/lib/rulesWs";
import { ROLE_LABEL, isPrivilegedRole as privRole } from "@/lib/rules";
import type { Deps } from "../types";
import { approvalsView, invalid, membersOf, missing, ok, pickOne, refuse, stepUp, str, sweepApprovals, txt, wsRoute, type WsHelpers } from "./common";
import type { Delegation } from "./delegation";
import { WsConflict, type Actor, type WsTx } from "./store";

export interface Contractor { id: string; name: string; role: string; dept: string; contractor: true; addedBy: string; addedAt: number }
export interface Grant { id: string; userId: string | null; user: string; system: string; level: string; status: string; granted: string; source?: string }
export const NOT_CONNECTED = "Not connected";
const POSTURE = { antivirus: NOT_CONNECTED, encryption: NOT_CONNECTED, screenLock: NOT_CONNECTED, passwordMgr: NOT_CONNECTED, os: NOT_CONNECTED };

/** Everyone the company tracks: active members and contractors, each with their grants. */
export async function workforce(d: Deps, t: WsTx) {
  const grants = (await t.list<Grant>("grant")).map((x) => x.data);
  const members = await d.dir.members(t.actor.tenantId, t.actor.id, "Active");
  const out = [];
  for (const m of members) {
    out.push({ id: m.userId, name: m.person, role: ROLE_LABEL[m.role] ?? m.role, dept: "—", device: NOT_CONNECTED, mfa: await d.auth.mfaEnrolled(m.userId).catch(() => false),
      employment: "Employee", wsRole: ROLE_LABEL[m.role] ?? m.role, memberRole: m.role, member: true, posture: POSTURE, accounts: grants.filter((g) => g.userId === m.userId).map((g) => ({ system: g.system, level: g.level })) });
  }
  for (const c of (await t.list<Contractor>("contractor")).map((x) => x.data)) {
    out.push({ id: c.id, name: c.name, role: c.role, dept: c.dept, device: NOT_CONNECTED, mfa: false, contractor: true, employment: "Contractor", wsRole: "Vendor Contact", memberRole: "", member: false, posture: POSTURE,
      accounts: grants.filter((g) => g.userId === c.id).map((g) => ({ system: g.system, level: g.level })) });
  }
  return out;
}
type Person = Awaited<ReturnType<typeof workforce>>[number];
/** A privileged person: an admin or owner of the company, or holding an admin-level grant. */
export const privileged = (p: Person) => privRole(p.memberRole || "") || p.accounts.some((a) => isPrivilegedLevel(a.level));
export async function personOf(d: Deps, t: WsTx, id: string): Promise<Person> { return (await workforce(d, t)).find((p) => p.id === id) ?? missing("Person"); }

/** What offboarding does inside the company's records (the membership itself is ended by the directory first). */
export async function offboardRecords(t: WsTx, p: { id: string; name: string }, to: { id: string; name: string }, note: string) {
  let revoked = 0, denied = 0, controls = 0, policies = 0;
  for (const g of await t.list<Grant>("grant")) if (g.data.userId === p.id) { await t.remove("grant", g.id, g.version); revoked++; await t.audit("access.revoked", `${g.data.user} → ${g.data.system} (${g.data.level}); offboarding`, "Access"); }
  for (const r of await t.list<{ userId: string; user: string; system: string; status: string; decidedBy?: string; decisionReason?: string }>("access-request"))
    if (r.data.userId === p.id && r.data.status === "Pending") { r.data.status = "Denied"; r.data.decidedBy = t.actor.name; r.data.decisionReason = "Offboarding"; await t.update("access-request", r.id, r.data, r.version); denied++; await t.audit("access.request.denied", `${r.data.user} → ${r.data.system}; offboarding`, "Access"); }
  for (const x of await t.list<Delegation>("delegation"))
    if ((x.data.fromId === p.id || x.data.toId === p.id) && !x.data.revokedAt && x.data.until > t.now) { x.data.revokedAt = t.now; x.data.revokedBy = t.actor.name; x.data.endedLogged = true; await t.update("delegation", x.id, x.data, x.version); await t.audit("delegation.revoked", `${x.id}: ${x.data.from} → ${x.data.to}, ended by offboarding`, "Approval"); }
  for (const c of await t.list<{ ownerId?: string; owner?: string }>("control")) if (c.data.ownerId === p.id) { c.data.ownerId = to.id; c.data.owner = to.name; await t.update("control", c.id, c.data, c.version); controls++; }
  for (const x of await t.list<{ ownerId?: string; owner?: string }>("policy")) if (x.data.ownerId === p.id) { x.data.ownerId = to.id; x.data.owner = to.name; await t.update("policy", x.id, x.data, x.version); policies++; }
  const c = await t.get("contractor", p.id); if (c) await t.remove("contractor", p.id, c.version);
  await t.audit("person.offboarded", `${p.name}, items → ${to.name}; ${revoked} access grant(s) revoked; ${denied} request(s) denied; ${controls} control(s) and ${policies} polic${policies === 1 ? "y" : "ies"} transferred${note}`, "Access");
  return revoked;
}
/** Ends the person's sessions in this company (their next request signs them out). */
export async function endSessions(d: Deps, userId: string, tenantId: string | null, why: string) {
  for (const s of await d.store.sessionsOf(userId)) if (!s.revokedAt && (tenantId === null || (s.tenantId ?? null) === tenantId)) await d.store.updateSession(s.idHash, { revokedAt: d.now(), revokedWhy: why });
}
/** The member's MFA reset, once approved: authenticators and recovery codes removed, sessions here ended, the member told. */
/** The authenticator belongs to the account, not to one company: the reset is account-wide, so every session ends (in every company), as a
 *  password reset does, and the account shows no authenticator until the person enrols again. */
export async function applyMfaReset(d: Deps, _tenantId: string, userId: string) {
  await d.auth.resetMfa(userId); await d.store.replaceRecovery(userId, []); await d.store.kvDel("mfa", userId); await endSessions(d, userId, null, "MFA reset");
  await d.store.insertNotice({ id: crypto.randomUUID().slice(0, 12), userId, at: d.now(), text: "Your two-step verification was reset by your company admins. Set up your authenticator again at your next sign-in." });
}

export const PEOPLE_KINDS = ["mfa-reset-member", "offboard"];
const VERB: Record<string, string> = { "mfa-reset-member": "person.mfa.reset", offboard: "person.offboard" };
/** Requests that ran out are closed once, as the system, with their module's own entry. */
export async function sweepPeople(t: WsTx) {
  const before = (await t.approvals(PEOPLE_KINDS)).filter((a) => a.status === "Pending" && a.expiresAt <= t.now);
  await sweepApprovals(t, PEOPLE_KINDS);
  for (const a of before) await t.audit(`${VERB[a.kind]}.expired`, String(a.payload.person ?? a.subject ?? ""), "Access", true);
}

export function peopleRoutes(h: WsHelpers) {
  const tx = <T,>(d: Deps, c: { actor: Actor }, w: (t: WsTx) => Promise<T>) => d.ws.tx(c.actor, d.now(), w);
  const data = wsRoute(h, "people", async (d, _r, c) => ok(await tx(d, c, async (t) => {
    await sweepPeople(t);
    return { people: await workforce(d, t), approvals: await approvalsView(t, PEOPLE_KINDS, new Map((await membersOf(d, c.actor)).map((m) => [m.id, m.name]))) };
  })));
  const addContractor = wsRoute(h, "people", async (d, r, c) => {
    refuse(roleBlock(c.actor.role, "adding contractors", "admin", "owner"));
    const name = txt(r.body.name, 100); if (name.length < 2) invalid("Name is required.");
    return tx(d, c, async (t) => {
      const id = `PP-${await t.next("contractor", 0)}`;
      await t.insert("contractor", id, { id, name, role: txt(r.body.role, 100) || "Contractor", dept: txt(r.body.dept, 100) || "External", contractor: true, addedBy: c.actor.name, addedAt: t.now } satisfies Contractor);
      await t.audit("contractor.added", name, "Access");
      return ok({ id });
    });
  });
  /** Requests a member MFA reset (admin only; never for oneself), with the three identity checks, a ticket and a named approver. */
  const mfaReset = wsRoute(h, "people", async (d, r, c) => {
    const me = c.actor; refuse(roleBlock(me.role, "request a member MFA reset", "admin"));
    await stepUp(d, c);
    const pid = str(r.path[2], 100);
    const f = { checks: (Array.isArray(r.body.checks) ? r.body.checks : []).map(Boolean).slice(0, 3), reason: str(r.body.reason, 60), details: txt(r.body.reasonText, 300), ticket: txt(r.body.ticket, 20).toUpperCase() };
    const bad = mfaResetFieldsBlock(f); if (bad) invalid(bad);
    const members = await membersOf(d, me);
    return tx(d, c, async (t) => {
      const p = await personOf(d, t, pid);
      if (!p.member) invalid("Contractors do not sign in to Selvara, so they have no MFA to reset.");
      if (p.id === me.id) refuse("Segregation of duties: self-service MFA reset is not allowed through this flow.");
      if (!p.mfa) invalid("This person has no MFA enrolled.");
      if ((await t.approvals(["mfa-reset-member"])).some((a) => a.status === "Pending" && a.expiresAt > t.now && a.payload.personId === p.id)) invalid("A reset is already pending for this person.");
      const needs: 1 | 2 = privileged(p) ? 2 : 1;
      const eligible = members.filter((m) => ["admin", "owner"].includes(m.role) && m.id !== me.id && m.id !== p.id);
      if (eligible.length < needs) invalid(`This reset needs ${needs} eligible approver(s) (not you, not ${p.name}); only ${eligible.length} available.`);
      const named = pickOne(eligible, r.body.approverId, r.body.approver, "Choose a named approver from the eligible people.");
      const a = await t.request({ kind: "mfa-reset-member", title: `Reset MFA for ${p.name}`, subject: p.name, needs, approverRoles: ["admin", "owner"], forbid: [p.id], ttlMs: MFA_RESET_TTL_H * 3600_000,
        payload: { personId: p.id, person: p.name, reason: f.reason, reasonText: f.details, ticket: f.ticket, approver: named!.name, approverId: named!.id, checks: f.checks } });
      await t.audit("person.mfa.reset.requested", `${p.name}; ticket ${f.ticket}; named approver ${named!.name}; ${needs} approval(s) needed; identity checks confirmed; request ${a.id}`, "Access");
      await t.notify(named!.id, `${me.name} asked you to approve an MFA reset for ${p.name} (ticket ${f.ticket}). It expires in ${MFA_RESET_TTL_H} hours.`);
      return ok({ id: a.id, needs });
    });
  });
  /** Offboards a person: at once for a non-privileged person, through a second admin or owner for a privileged one. */
  const offboard = wsRoute(h, "people", async (d, r, c) => {
    const me = c.actor; refuse(roleBlock(me.role, "offboarding", "admin", "owner"));
    const pid = str(r.path[2], 100); if (pid === me.id) refuse("Segregation of duties: you cannot offboard yourself.");
    await stepUp(d, c);
    const members = await membersOf(d, me);
    // owned controls and policies go to someone who can manage them: an admin or owner other than the person leaving
    const to = pickOne(members.filter((m) => ["admin", "owner"].includes(m.role) && m.id !== pid), r.body.transferToId, r.body.transferTo, "Transfer owned items to an admin or owner (not the person being offboarded).");
    const p = await tx(d, c, (t) => personOf(d, t, pid));
    if (p.member && p.memberRole === "admin" && members.filter((m) => m.role === "admin").length <= 1) invalid("The last remaining admin cannot be offboarded.");
    if (privileged(p)) {
      return tx(d, c, async (t) => {
        if ((await t.approvals(["offboard"])).some((a) => a.status === "Pending" && a.expiresAt > t.now && a.payload.personId === p.id)) invalid("An offboarding request is already pending for this person.");
        if (!members.some((m) => ["admin", "owner"].includes(m.role) && m.id !== me.id && m.id !== p.id)) invalid("No eligible second approver (not you, not the person being offboarded).");
        const a = await t.request({ kind: "offboard", title: `Offboard ${p.name} (privileged access)`, subject: p.name, needs: 1, approverRoles: ["admin", "owner"], forbid: [p.id], ttlMs: OFFBOARD_TTL_H * 3600_000,
          payload: { personId: p.id, person: p.name, member: p.member, transferToId: to!.id, transferTo: to!.name } });
        await t.audit("person.offboard.requested", `${p.name}, items → ${to!.name}; privileged access, second approver required; request ${a.id}`, "Access");
        return { status: 202, body: { pending: true, id: a.id } };
      });
    }
    const n = await tx(d, c, (t) => offboardIn(t, d, p, to, ""));
    if (p.member) await endSessions(d, p.id, me.tenantId, "Offboarded");
    return ok({ pending: false, revoked: n });
  });
  return { "GET ws/data/people": data, "POST ws/people/contractors": addContractor, "POST ws/people/:id/mfa-reset": mfaReset, "POST ws/people/:id/offboard": offboard };
}
/** Offboards inside the caller's unit of work: the records first, then the membership (the directory refuses the last admin, which rolls the
 *  whole change back; a retry after a partial failure finds the membership already ended and carries on). Sessions end after the commit
 *  (and fail their membership check at the next request anyway). Returns the grants revoked. */
export async function offboardIn(t: WsTx, d: Deps, p: { id: string; name: string; member: boolean }, to: { id: string; name: string }, note: string): Promise<number> {
  const a = t.actor;
  const n = await offboardRecords(t, p, to, note);
  if (p.member) {
    const res = await d.dir.removeMember(a.tenantId, a.id, p.id, `Offboarded by ${a.name}`, t.now,
      { at: t.now, actor: a.name, actorId: a.id, tenantId: a.tenantId, action: "member.removed", target: `${p.name}: offboarded`, cat: "Access", space: "ws", ip: a.ip });
    if (res === "last-admin") throw new WsConflict("The last remaining admin cannot be offboarded.");
  }
  return n;
}
