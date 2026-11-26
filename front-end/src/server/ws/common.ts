/* Server-only. What every workspace module's routes share: which company roles may open which module (the same table the browser uses,
   data/roles.json), the acting person from the session, turning refusals into answers, and the company's members for owner pickers. */
import { scalarText } from "@/server/text";
import { validTimeZone } from "@/lib/rulesWs";
import roles from "@/data/roles.json";
import { REAUTH_MS } from "@/lib/accountSecurity";
import type { Ctx, Req, Res } from "../core";
import type { Deps } from "../types";
import { WsConflict, WsRefused, type Actor, type WsTx } from "./store";

type H = (d: Deps, r: Req) => Promise<Res>;
export type WsHandler = (d: Deps, r: Req, c: Ctx & { actor: Actor }) => Promise<Res>;
export interface WsHelpers { signed: (h: (d: Deps, r: Req, c: Ctx) => Promise<Res>) => H }

const MODS = (roles as unknown as { ROLE_MODS: Record<string, { ws?: string[] | "*" }> }).ROLE_MODS;
/** Whether a company role may open a workspace module (deny by default; platform staff never). */
export const modAllowed = (role: string, mod: string): boolean => { const m = MODS[role]?.ws; return m === "*" || (Array.isArray(m) && m.includes(mod)); };

export const ok = (body?: unknown): Res => ({ status: body === undefined ? 204 : 200, body });
export const err = (status: number, error: string): Res => ({ status, body: { error } });
export const str = (v: unknown, max = 300) => scalarText(v).slice(0, max);
export const txt = (v: unknown, max = 500) => str(v, max * 2).trim().slice(0, max);

const afterCommit: ((d: Deps, a: Actor) => Promise<void>)[] = [];
/** Runs after a route's changes committed, with what was audited (outgoing webhooks, server/ws/webhooks.ts; Trust Center update emails,
 *  server/trustpublic.ts). Each listener once per module load. */
export const onCommitted = (fn: (d: Deps, a: Actor) => Promise<void>) => { if (!afterCommit.includes(fn)) afterCommit.push(fn); };
/** A workspace route: a member of the session's company whose role may open `mod`. Refusals from rules and stale copies become answers. */
/** EDGE-18: the version the person loaded of the record named in the path (the id after the module), if the screen sent it. */
const expectedVersion = (r: Req): Actor["expect"] => {
  const v = Number(r.headers["x-record-version"]); const id = r.path[2];
  return r.method !== "GET" && id && Number.isSafeInteger(v) && v > 0 ? { id, version: v } : undefined;
};
export function wsRoute(h: WsHelpers, mod: string | null, fn: WsHandler): H {
  return h.signed(async (d, r, c) => {
    if (c.a.platform || !c.a.company) return err(403, "Not permitted.");
    if (mod && !modAllowed(c.a.role, mod)) return err(403, "Not permitted.");
    const actor: Actor = { id: c.p.id, name: c.p.person, role: c.a.role, tenantId: c.a.company.id, ip: r.ip, tz: validTimeZone(r.headers["x-time-zone"]), expect: expectedVersion(r), committed: [] };
    try {
      const out = await fn(d, r, { ...c, actor });
      if (actor.committed?.length) for (const fn of afterCommit) await fn(d, actor).catch(() => undefined); // never fails the change itself
      return out;
    }
    catch (e) {
      if (e instanceof WsRefused) return err(e.status, e.message);
      if (e instanceof WsConflict) return err(409, e.message);
      throw e;
    }
  });
}
/** Throws the first rule refusal (the same text the browser shows on the disabled button). */
export function refuse(...reasons: (string | null | undefined)[]): void { const m = reasons.find((x) => !!x); if (m) throw new WsRefused(m); }
export const invalid = (m: string): never => { throw new WsRefused(m, 400); };
/** SEC-18: a file that failed checkFile. Active content is recorded in the company's audit log (its own transaction, so the refusal does not
 *  roll it back) and refused with 422, which the request handler also logs as a security event. Other problems are a plain 400. */
export async function refuseFile(d: Deps, actor: Actor, f: { error: string; threat?: string }, name: unknown): Promise<never> {
  if (!f.threat) invalid(f.error);
  await d.ws.tx(actor, d.now(), (t) => t.audit("file.refused", `${scalarText(name).slice(0, 120) || "file"}: ${f.threat}`, "Security"));
  throw new WsRefused(f.error, 422);
}
export const missing = (what: string): never => { throw new WsRefused(`${what} not found.`, 404); };

/** The company's active members (id, name, role), for owners and assignees. */
export async function membersOf(d: Deps, a: Actor) {
  return (await d.dir.members(a.tenantId, a.id, "Active")).map((m) => ({ id: m.userId, name: m.person, role: m.role }));
}
/** Resolves an owner given as a member id (or, from older screens, an exact name) to an active member. */
export async function memberRef(d: Deps, a: Actor, v: { id?: unknown; name?: unknown }, fallbackSelf = true): Promise<{ id: string; name: string }> {
  const ms = await membersOf(d, a); const id = str(v.id, 100); const name = txt(v.name, 80).toLowerCase();
  const m = (id && ms.find((x) => x.id === id)) || (name && ms.find((x) => x.name.toLowerCase() === name)) || null;
  if (m) return { id: m.id, name: m.name };
  if (!id && !name && fallbackSelf) return { id: a.id, name: a.name };
  return invalid("Choose an active member of your company.");
}

/** Exactly one of `list`, by id or else by exact name; refuses when none matches or two share the name. */
export function pickOne<T extends { id: string; name: string }>(list: T[], id: unknown, name: unknown, msg: string): T {
  const i = str(id, 100); const n = txt(name, 100);
  const hits = i ? list.filter((x) => x.id === i) : n ? list.filter((x) => x.name === n) : [];
  if (hits.length > 1) invalid("Two people share this name. Ask a company admin to tell them apart.");
  if (!hits.length) invalid(msg);
  return hits[0];
}
/** Sensitive changes (MFA resets, offboarding) need the password confirmed in the last few minutes (POST /api/me/reauth). */
export async function stepUp(d: Deps, c: { s: { idHash: string } }) {
  const at = await d.store.kvGet<number>("reauth", c.s.idHash);
  if (!at || d.now() - at >= REAUTH_MS) throw new WsRefused(STEP_UP, 403);
}
export const STEP_UP = "Confirm your password first.";
/** Four-eyes requests as the browser's engine shows them (names, not ids). */
export async function approvalsView(t: WsTx, kinds: string[], names: Map<string, string>) {
  return (await t.approvals(kinds)).map((x) => ({
    id: x.id, kind: x.kind, title: x.title, subject: x.subject ?? undefined, requestedBy: x.requestedByName, requestedById: x.requestedBy, requestedByRole: "", payload: x.payload,
    needs: x.needs, approverRoles: x.approverRoles, forbid: x.forbid.map((f) => names.get(f) ?? f), approvals: x.votes.map((v) => ({ by: v.byName, at: new Date(v.at).toISOString(), reason: v.reason })),
    status: x.status === "Pending" && x.expiresAt <= t.now ? "Expired" : x.status, createdAt: x.createdAt, expiresAt: x.expiresAt, decidedReason: x.decidedReason, domain: "ws" as const,
  }));
}
/** Marks pending requests of these kinds that ran out as Expired, once, with their audit entry. */
export async function sweepApprovals(t: WsTx, kinds: string[]) {
  for (const a of await t.approvals(kinds)) if (a.status === "Pending" && a.expiresAt <= t.now) { await t.setApproval(a.id, "Expired"); await t.audit(`approval.${a.kind}.expired`, `${a.title} (${a.id})`, "Approval", true); }
}
