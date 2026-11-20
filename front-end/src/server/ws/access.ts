/* Server-only. Access on the server (production programme group 2; inventory group 2, section 3): the account inventory, access requests with a
   second approver for privileged access, and access reviews (recertification). Deliberate differences: grants and review rows have ids; a
   request names a real member or contractor, and the same pending request cannot be raised twice; a review's scope is applied (all accounts,
   or privileged accounts only); an admin or owner can record existing access found elsewhere and revoke a grant, each with a reason. Approving
   a request records the grant here: provisioning in the source system stays with its administrators until the integrations (group 7). */
import { ACCESS_LEVELS, ACCESS_SECOND_TTL_H, accessDecideBlock, accessRequestBlock, isPrivilegedLevel, isPrivilegedSystem, roleBlock, textBlock } from "@/lib/rulesWs";
import type { Deps } from "../types";
import { approvalsView, invalid, membersOf, missing, modAllowed, ok, refuse, str, sweepApprovals, txt, wsRoute, type WsHelpers } from "./common";
import type { Contractor, Grant } from "./people";
import type { Actor, WsTx } from "./store";

export interface AccessRequest {
  id: string; user: string; userId: string; requester: string; requesterId: string; system: string; level: string; reason: string;
  status: "Pending" | "Approved" | "Denied" | "Expired"; stage: "" | "second"; firstApprover?: string; firstApproverId?: string; approvalId?: string; decidedBy?: string; decisionReason?: string; at: number;
}
export interface ReviewAccount { id: string; grantId: string; userId: string | null; user: string; system: string; level: string; decision: "" | "Keep" | "Revoke"; decidedBy?: string; decidedById?: string; revoked?: boolean }
export interface AccessReview { id: string; name: string; scope: string; status: "Open" | "Complete"; createdBy: string; createdById: string; completedBy?: string; at: number; accounts: ReviewAccount[] }
export const ACCESS_KINDS = ["access-request"];
const SCOPES = ["All accounts", "Privileged accounts only"];
const day = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const privilegedRequest = (r: { system: string; level: string }, grants: Grant[]) =>
  isPrivilegedLevel(r.level) || isPrivilegedSystem(r.system) || grants.some((g) => g.system.toLowerCase() === r.system.toLowerCase() && isPrivilegedLevel(g.level));

/** A member or contractor of the company, by id (or exact name). */
async function personRef(d: Deps, t: WsTx, v: { id?: unknown; name?: unknown }) {
  const ms = (await membersOf(d, t.actor)).map((m) => ({ id: m.id, name: m.name }));
  const cs = (await t.list<Contractor>("contractor")).map((x) => ({ id: x.data.id, name: x.data.name }));
  const all = [...ms, ...cs]; const id = str(v.id, 100); const name = txt(v.name, 100);
  const hits = id ? all.filter((p) => p.id === id) : all.filter((p) => p.name === name);
  if (hits.length !== 1) invalid(hits.length > 1 ? "Two people share this name. Choose them from the list." : "Choose a member or contractor of your company.");
  return hits[0];
}
/** Adds the grant unless the same person already holds the same access. */
export async function grantFor(t: WsTx, r: { userId: string; user: string; system: string; level: string; id?: string }, source: string) {
  if ((await t.list<Grant>("grant")).some((g) => g.data.userId === r.userId && g.data.system.toLowerCase() === r.system.toLowerCase() && g.data.level === r.level)) return;
  const id = `G-${await t.next("grant", 0)}`;
  await t.insert("grant", id, { id, userId: r.userId, user: r.user, system: r.system, level: r.level, status: "Active", granted: day(t.now), source } satisfies Grant);
  await t.audit("access.granted", `${r.user} → ${r.system} (${r.level}); ${source}`, "Access");
}

export function accessRoutes(h: WsHelpers) {
  const tx = <T,>(d: Deps, c: { actor: Actor }, w: (t: WsTx) => Promise<T>) => d.ws.tx(c.actor, d.now(), w);
  /** Employees (and anyone with My Work) may request; admins and owners decide. */
  const canRequest = (role: string) => modAllowed(role, "access") || modAllowed(role, "work");

  const data = wsRoute(h, "access", async (d, _r, c) => ok(await tx(d, c, async (t) => {
    await sweepAccess(t);
    const names = new Map((await membersOf(d, c.actor)).map((m) => [m.id, m.name]));
    const grants = (await t.list<Grant>("grant")).map((x) => x.data);
    const requests = (await t.list<AccessRequest>("access-request")).map((x) => ({ ...x.data, privileged: privilegedRequest(x.data, grants) })).reverse();
    return { grants, requests, reviews: (await t.list<AccessReview>("access-review")).map((x) => x.data).reverse(), approvals: await approvalsView(t, ACCESS_KINDS, names) };
  })));
  const request = wsRoute(h, null, async (d, r, c) => {
    const me = c.actor; if (!canRequest(me.role)) refuse("Not permitted.");
    return tx(d, c, async (t) => {
      const forOther = !!(r.body.userId || (r.body.user && txt(r.body.user, 100) !== me.name)) && str(r.body.userId, 100) !== me.id;
      const who = forOther ? await personRef(d, t, { id: r.body.userId, name: r.body.user }) : { id: me.id, name: me.name };
      const q = { system: txt(r.body.system, 100), level: str(r.body.level, 20), reason: txt(r.body.reason, 300) };
      const bad = accessRequestBlock({ ...q, forOther: who.id !== me.id, employee: !["admin", "owner"].includes(me.role) }); if (bad) invalid(bad);
      if ((await t.list<AccessRequest>("access-request")).some((x) => x.data.status === "Pending" && x.data.userId === who.id && x.data.system.toLowerCase() === q.system.toLowerCase() && x.data.level === q.level))
        invalid("The same access request is already pending.");
      const id = `AR-${String(await t.next("access-request", 0)).padStart(2, "0")}`;
      await t.insert("access-request", id, { id, user: who.name, userId: who.id, requester: me.name, requesterId: me.id, ...q, reason: q.reason || "—", status: "Pending", stage: "", at: t.now } satisfies AccessRequest);
      await t.audit("access.requested", `${q.system} (${q.level}) for ${who.name}`, "Access");
      return ok({ id });
    });
  });
  /** The first decision on a request: deny, approve (grants at once), or for privileged access record the first approval and ask a second
   *  admin or owner. The second decision goes through the approvals route (flow.ts). */
  const decide = wsRoute(h, "access", async (d, r, c) => {
    const me = c.actor; const decision = str(r.body.decision, 10); if (decision !== "Approved" && decision !== "Denied") invalid("Choose Approved or Denied.");
    const reason = txt(r.body.reason, 300); const bad = textBlock(reason, 10, "A reason"); if (bad) invalid("Give a reason of at least 10 characters.");
    return tx(d, c, async (t) => {
      const rec = (await t.get<AccessRequest>("access-request", str(r.path[3], 20))) ?? missing("Request"); const q = rec.data;
      if (q.status !== "Pending" || q.stage === "second") invalid(q.stage === "second" ? "This request is waiting for its second approver." : "Request is no longer pending.");
      refuse(accessDecideBlock({ role: me.role, isRequester: q.requesterId === me.id, isBeneficiary: q.userId === me.id, isFirstApprover: false }));
      if (decision === "Denied") {
        q.status = "Denied"; q.decidedBy = me.name; q.decisionReason = reason; await t.update("access-request", q.id, q, rec.version);
        await t.audit("access.request.denied", `${q.user} → ${q.system}; by ${me.name}; reason: ${reason}`, "Access");
        await t.notify(q.requesterId, `Your access request ${q.id} (${q.system}, ${q.level}) was denied: ${reason}`);
        return ok(q);
      }
      if (privilegedRequest(q, (await t.list<Grant>("grant")).map((x) => x.data))) {
        const others = (await membersOf(d, me)).filter((m) => ["admin", "owner"].includes(m.role) && ![me.id, q.requesterId, q.userId].includes(m.id));
        if (!others.length) invalid("No eligible second approver (not you, not the requester, not the beneficiary).");
        const a = await t.request({ kind: "access-request", title: `Second approval: ${q.user} → ${q.system} (${q.level})`, subject: q.userId, needs: 1, approverRoles: ["admin", "owner"],
          forbid: [...new Set([q.requesterId, q.userId, me.id])].filter((x) => x !== me.id), ttlMs: ACCESS_SECOND_TTL_H * 3600_000, payload: { reqId: q.id, system: q.system, level: q.level, firstApprover: me.name, firstApproverId: me.id, firstReason: reason } });
        q.stage = "second"; q.firstApprover = me.name; q.firstApproverId = me.id; q.approvalId = a.id; await t.update("access-request", q.id, q, rec.version);
        await t.audit("access.request.approval.first", `${q.user} → ${q.system} (${q.level}); first approver ${me.name}; reason: ${reason}; second approver required (${a.id})`, "Access");
        return ok(q);
      }
      q.status = "Approved"; q.decidedBy = me.name; q.decisionReason = reason; await t.update("access-request", q.id, q, rec.version);
      await t.audit("access.request.approved", `${q.user} → ${q.system}; by ${me.name}; reason: ${reason}`, "Access");
      await grantFor(t, q, `request ${q.id}`);
      await t.notify(q.requesterId, `Your access request ${q.id} (${q.system}, ${q.level}) was approved. The system's administrators complete it.`);
      return ok(q);
    });
  });
  /** Records access that already exists elsewhere (found in a source system), or revokes a grant: admin or owner, with a reason. */
  const grantAdd = wsRoute(h, "access", async (d, r, c) => {
    refuse(roleBlock(c.actor.role, "recording access", "admin", "owner"));
    const reason = txt(r.body.reason, 300); if (reason.length < 10) invalid("Give a reason of at least 10 characters.");
    const level = str(r.body.level, 20); if (!(ACCESS_LEVELS as readonly string[]).includes(level)) invalid("Choose a valid access level.");
    const system = txt(r.body.system, 100); if (!system) invalid("System is required.");
    return tx(d, c, async (t) => { const who = await personRef(d, t, { id: r.body.userId, name: r.body.user }); await grantFor(t, { userId: who.id, user: who.name, system, level }, `recorded by ${c.actor.name}: ${reason}`); return ok(); });
  });
  const grantRevoke = wsRoute(h, "access", async (d, r, c) => {
    refuse(roleBlock(c.actor.role, "revoking access", "admin", "owner"));
    const reason = txt(r.body.reason, 300); if (reason.length < 10) invalid("Give a reason of at least 10 characters.");
    return tx(d, c, async (t) => {
      const g = (await t.get<Grant>("grant", str(r.path[3], 20))) ?? missing("Grant");
      if (g.data.userId === c.actor.id) refuse("Segregation of duties: you cannot decide on your own access.");
      await t.remove("grant", g.id, g.version);
      await t.audit("access.revoked", `${g.data.user} → ${g.data.system} (${g.data.level}); by ${c.actor.name}: ${reason}; follow-up: confirm removal in the source system`, "Access");
      return ok();
    });
  });
  const reviewCreate = wsRoute(h, "access", async (d, r, c) => {
    refuse(roleBlock(c.actor.role, "starting an access review", "admin", "owner"));
    const name = txt(r.body.name, 120); if (!name) invalid("Review name is required.");
    const scope = /privileged/i.test(str(r.body.scope, 160)) ? SCOPES[1] : SCOPES[0]; // "All privileged accounts" (the form's default) means privileged only
    return tx(d, c, async (t) => {
      const grants = (await t.list<Grant>("grant")).map((x) => x.data).filter((g) => scope === SCOPES[0] || isPrivilegedLevel(g.level) || isPrivilegedSystem(g.system));
      if (!grants.length) invalid("There is no access in this scope to review.");
      const id = `REV-${await t.next("access-review", 100)}`;
      await t.insert("access-review", id, { id, name, scope, status: "Open", createdBy: c.actor.name, createdById: c.actor.id, at: t.now,
        accounts: grants.map((g, i) => ({ id: `${id}-${i + 1}`, grantId: g.id, userId: g.userId, user: g.user, system: g.system, level: g.level, decision: "" })) } satisfies AccessReview);
      await t.audit("access.review.created", `${name}; by ${c.actor.name}; ${scope}; ${grants.length} account(s) frozen`, "Access");
      return ok({ id });
    });
  });
  const reviewDecide = wsRoute(h, "access", async (d, r, c) => {
    refuse(roleBlock(c.actor.role, "deciding access", "admin", "owner"));
    const decision = str(r.body.decision, 10); if (decision !== "Keep" && decision !== "Revoke") invalid("Choose Keep or Revoke.");
    return tx(d, c, async (t) => {
      const rec = (await t.get<AccessReview>("access-review", str(r.path[3], 20))) ?? missing("Review"); const v = rec.data;
      const acc = v.accounts.find((a) => a.id === str(r.body.accountId, 40)) ?? v.accounts[Number(r.path[5])] ?? missing("Account");
      if (v.status !== "Open" || acc.decision) invalid("This review item can no longer be changed.");
      if (acc.userId === c.actor.id) refuse("Segregation of duties: you cannot decide on your own access.");
      acc.decision = decision as "Keep" | "Revoke"; acc.decidedBy = c.actor.name; acc.decidedById = c.actor.id;
      await t.update("access-review", v.id, v, rec.version);
      await t.audit("access.review.decision", `${acc.user} → ${acc.system}: ${decision}; reviewer ${c.actor.name}; review ${v.id}`, "Access");
      return ok(v);
    });
  });
  const reviewComplete = wsRoute(h, "access", async (d, r, c) => {
    refuse(roleBlock(c.actor.role, "completing an access review", "admin", "owner"));
    return tx(d, c, async (t) => {
      const rec = (await t.get<AccessReview>("access-review", str(r.path[3], 20))) ?? missing("Review"); const v = rec.data;
      if (v.status !== "Open" || v.accounts.some((a) => !a.decision)) invalid("This review cannot be completed yet.");
      if (v.accounts.some((a) => isPrivilegedLevel(a.level)) && v.createdById === c.actor.id) refuse("Segregation of duties: a review with privileged accounts must be completed by someone other than its creator.");
      let k = 0, m = 0, u = 0;
      for (const a of v.accounts.filter((x) => x.decision === "Revoke")) {
        k++; const g = await t.get<Grant>("grant", a.grantId);
        if (g) { await t.remove("grant", g.id, g.version); a.revoked = true; m++; await t.audit("access.revoked", `${a.user} → ${a.system} (${a.level}); access review ${v.id}; follow-up: confirm removal in the source system`, "Access"); }
        else { u++; await t.audit("access.revoke.unmatched", `${a.user} → ${a.system} (${a.level}); no matching grant in the inventory, manual revocation task; review ${v.id}`, "Access"); }
      }
      v.status = "Complete"; v.completedBy = c.actor.name; await t.update("access-review", v.id, v, rec.version);
      await t.audit("access.review.completed", `${v.name}; ${k} revocation(s), ${m} applied${u ? `, ${u} need manual follow-up` : ""}; completed by ${c.actor.name}`, "Access");
      return ok(v);
    });
  });
  return {
    "GET ws/data/access": data, "POST ws/access/requests": request, "POST ws/access/requests/:id/decision": decide,
    "POST ws/access/grants": grantAdd, "POST ws/access/grants/:id/revoke": grantRevoke,
    "POST ws/access/reviews": reviewCreate, "POST ws/access/reviews/:id/accounts/:index/decision": reviewDecide, "POST ws/access/reviews/:id/complete": reviewComplete,
  };
}
/** Second approvals that ran out: the request expires too (recorded once, as the system). */
export async function sweepAccess(t: WsTx) {
  const before = (await t.approvals(ACCESS_KINDS)).filter((a) => a.status === "Pending" && a.expiresAt <= t.now).map((a) => a.id);
  await sweepApprovals(t, ACCESS_KINDS);
  for (const r of await t.list<AccessRequest>("access-request")) if (r.data.approvalId && before.includes(r.data.approvalId) && r.data.status === "Pending") {
    r.data.status = "Expired"; await t.update("access-request", r.id, r.data, r.version); await t.audit("access.request.expired", `${r.data.user} → ${r.data.system}`, "Access", true);
  }
}
