/* Server-only. Delegation of a named approver slot (production programme group 2; SOD_MATRIX section 9; inventory group 2, section 0.6). An
   admin or owner hands their named-approver slot to another admin or owner for 1 to 14 days, with a reason; one live delegation per person, no
   loops, no chains. The delegate counts only where the delegator is the named approver, never where the delegator raised the request or is
   excluded from it, and keeps every exclusion of their own. People are compared by user id. */
import { delegationBlock } from "@/lib/rulesWs";
import type { Deps } from "../types";
import { invalid, membersOf, missing, ok, pickOne, refuse, str, txt, wsRoute, type WsHelpers } from "./common";
import type { Actor, WsTx } from "./store";

export interface Delegation { id: string; from: string; fromId: string; to: string; toId: string; reason: string; createdAt: number; until: number; revokedAt?: number; revokedBy?: string; endedLogged?: boolean }
const live = (x: Delegation, now: number) => !x.revokedAt && x.until > now;
const utc = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";

/** Records, once each, delegations that ran out. */
export async function sweepDelegations(t: WsTx) {
  for (const r of await t.list<Delegation>("delegation")) {
    const x = r.data;
    if (!x.revokedAt && !x.endedLogged && x.until <= t.now) { x.endedLogged = true; await t.update("delegation", r.id, x, r.version); await t.audit("delegation.expired", `${x.from} → ${x.to}`, "Approval", true); }
  }
}
/** True when the actor may act as the named approver `namedId`: they are that person, or hold a live delegation from them (and the request was
 *  neither raised by nor excludes the delegator). Returns the delegator's name when acting by delegation. */
export async function actsAs(t: WsTx, actor: Actor, namedId: string | null | undefined, conflict: { requestedBy?: string; forbid?: string[] } = {}): Promise<{ ok: boolean; onBehalfOf: string | null }> {
  if (!namedId) return { ok: false, onBehalfOf: null };
  if (actor.id === namedId) return { ok: true, onBehalfOf: null };
  if (!["admin", "owner"].includes(actor.role)) return { ok: false, onBehalfOf: null };
  if (conflict.requestedBy === namedId || (conflict.forbid ?? []).includes(namedId)) return { ok: false, onBehalfOf: null };
  const d = (await t.list<Delegation>("delegation")).map((x) => x.data).find((x) => x.fromId === namedId && x.toId === actor.id && live(x, t.now));
  return d ? { ok: true, onBehalfOf: d.from } : { ok: false, onBehalfOf: null };
}
/** The delegations the person gave or received (for My workspace), with whether each is live. */
export async function delegationsOf(t: WsTx, userId: string) {
  return (await t.list<Delegation>("delegation")).map((x) => x.data).filter((x) => x.fromId === userId || x.toId === userId).map((x) => ({ ...x, live: live(x, t.now) }));
}

export function delegationRoutes(h: WsHelpers) {
  const tx = <T,>(d: Deps, c: { actor: Actor }, w: (t: WsTx) => Promise<T>) => d.ws.tx(c.actor, d.now(), w);
  const create = wsRoute(h, "me", async (d, r, c) => {
    const me = c.actor; const days = Number(r.body.days); const reason = txt(r.body.reason, 300);
    const ms = await membersOf(d, me);
    const to = r.body.toId || r.body.to ? pickOne(ms, r.body.toId, r.body.to, "Choose another admin or owner.") : null;
    return tx(d, c, async (t) => {
      await sweepDelegations(t);
      const all = (await t.list<Delegation>("delegation")).map((x) => x.data);
      const why = delegationBlock({ role: me.role, toRole: to?.role ?? null, self: to?.id === me.id, days, reason, live: all.some((x) => x.fromId === me.id && live(x, t.now)),
        loop: !!to && all.some((x) => x.fromId === to.id && x.toId === me.id && live(x, t.now)) });
      if (why) { if (why.startsWith("Segregation") || why.startsWith("Not permitted")) refuse(why); invalid(why); }
      const id = `DG-${await t.next("delegation", 100)}`; const until = t.now + days * 86400_000;
      const x: Delegation = { id, from: me.name, fromId: me.id, to: to!.name, toId: to!.id, reason, createdAt: t.now, until };
      await t.insert("delegation", id, x);
      await t.audit("delegation.created", `${id}: ${me.name} → ${to!.name} until ${utc(until)}; reason: ${reason}`, "Approval");
      await t.notify(to!.id, `${me.name} delegated their approvals to you until ${utc(until)}: ${reason}`);
      return ok({ ...x, live: true });
    });
  });
  const revoke = wsRoute(h, "me", async (d, r, c) => tx(d, c, async (t) => {
    const id = str(r.path[2], 40); const rec = (await t.get<Delegation>("delegation", id)) ?? missing("Delegation");
    const x = rec.data;
    if (!live(x, t.now)) invalid("That delegation has already ended.");
    if (x.fromId !== c.actor.id && c.actor.role !== "admin") refuse("Only the person who delegated, or a company admin, can end it.");
    x.revokedAt = t.now; x.revokedBy = c.actor.name; x.endedLogged = true;
    await t.update("delegation", id, x, rec.version);
    await t.audit("delegation.revoked", `${id}: ${x.from} → ${x.to}, ended by ${c.actor.name}`, "Approval");
    return ok({ ...x, live: false });
  }));
  return { "POST ws/delegations": create, "POST ws/delegations/:id/revoke": revoke };
}
