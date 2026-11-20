/* Glue between the four-eyes engine (approvals.ts) and the modules that own the effects.
 * A module registers a handler per approval `kind`; `settle()` then applies the effect ONLY when the approval reached "Approved", and runs the
 * clean-up hook for Rejected / Withdrawn / Expired. Effects are therefore never applied on request, only on the final approval.
 * `decideApproval` / `withdrawApproval` add the rules the generic engine does not know: NAMED approver, reason length for reject,
 * elevation for admin-domain approvals. In-memory demo; the real API must do all of this server-side.
 * ADD-only shared lib (does not edit approvals.ts). */
import { SERVER_KINDS } from "./rulesWs";
import { approvals, approve, reject, sweepExpired, whyCannotApprove, withdraw } from "./approvals";
import type { Approval } from "./approvals";
import { assertElevated, elevationActive } from "./elevation";
import { getActor, isSamePerson, SodError } from "./sod";
import { actsAs, onBehalfOf } from "./delegation";
import { wsLog } from "./audit";
import { bumpData } from "./store";

export interface KindHandler {
  /** Short text shown in the pending list (no secrets). */
  describe: (a: Approval) => string;
  /** Runs once, on the final approval. */
  apply: (a: Approval) => void;
  /** Runs once when the request ends without approval. */
  closed?: (a: Approval) => void;
}
const handlers = new Map<string, KindHandler>();
const settled = new Set<string>();
export const registerKind = (kind: string, h: KindHandler) => { handlers.set(kind, h); };
export const handlerFor = (kind: string) => handlers.get(kind);
export const knownKind = (kind: string) => handlers.has(kind);

/** Applies/cleans up every request that reached a final state since the last call (also sweeps expiry). Idempotent. */
const PRODUCTION = (process.env.NEXT_PUBLIC_API_MODE || "mock") === "http";
export function settle(): void {
  sweepExpired();
  let ran = false;
  approvals.get().list.slice().forEach((a) => {
    if (a.status === "Pending" || settled.has(a.id)) return;
    if (PRODUCTION && SERVER_KINDS.includes(a.kind)) return; // production: the server applied it in the decision's transaction
    const h = handlers.get(a.kind); if (!h) return;
    settled.add(a.id); ran = true;
    try { if (a.status === "Approved") h.apply(a); else h.closed?.(a); } catch { /* never let one handler block the others */ }
  });
  if (ran) bumpData();
}

const namedApprover = (a: Approval): string => String(a.payload.approver || "");
/** Reason the signed-in person cannot approve/reject (null = may). Adds the named-approver and elevation rules. */
export function whyCannotDecide(a: Approval): string | null {
  const base = whyCannotApprove(a); if (base) return base;
  if (a.domain === "admin" && !elevationActive()) return "Elevate to make changes";
  const named = namedApprover(a);
  if (named && !actsAs(named, a)) {
    // two-approver requests: the named person (or their delegate) must approve; the other eligible person is the additional one
    if (a.needs < 2 || a.approvals.some((x) => isSamePerson(x.by, getActor().name))) return `Only the named approver (${named}) can decide this request.`;
  }
  return null;
}
export const myRequest = (a: Approval) => isSamePerson(getActor().name, a.requestedBy);

export function decideApproval(id: string, ok: boolean, reason: string): Approval {
  sweepExpired();
  const a = approvals.get().list.find((x) => x.id === id); if (!a) throw new SodError("Request not found.");
  if (a.domain === "admin") assertElevated();
  const why = whyCannotDecide(a); if (why) throw new SodError(why);
  const r = String(reason || "").trim(); if (r.length < 10) throw new SodError("Give a reason of at least 10 characters.");
  const named = namedApprover(a);
  // final approval must include the named approver, or the person they delegated to
  const viaDelegation = named ? onBehalfOf(named, a) : null;
  const delegated = (a.payload.delegated && typeof a.payload.delegated === "object" ? a.payload.delegated : {}) as Record<string, string>;
  if (ok && named && a.needs >= 2 && a.approvals.length + 1 >= a.needs && !actsAs(named, a) && !a.approvals.some((x) => isSamePerson(x.by, named) || isSamePerson(delegated[x.by], named))) {
    throw new SodError(`The named approver (${named}) must also approve this request.`);
  }
  const me = getActor().name;
  const out = ok ? approve(id, r) : reject(id, r);
  if (viaDelegation) {
    // remember who this decision was made for, and say so in the audit log
    out.payload.delegated = { ...delegated, [me]: viaDelegation };
    wsLog(`approval.${out.kind}.on_behalf`, `${out.title} (${out.id}): ${ok ? "approved" : "rejected"} by ${me} on behalf of ${viaDelegation} (delegation)`, "Approval");
  }
  settle();
  return out;
}
export function withdrawApproval(id: string): Approval {
  const a = approvals.get().list.find((x) => x.id === id); if (!a) throw new SodError("Request not found.");
  if (a.domain === "admin") assertElevated();
  const out = withdraw(id); settle(); return out;
}
/** Message for a toast: SodError text only; anything else gets the generic fallback (never raw exception text). */
export const sodMessage = (e: unknown, fallback: string): string => (e instanceof SodError || refusal(e) ? (e as Error).message : fallback);
/** A refusal from the production API (4xx): the server's own words. */
const refusal = (e: unknown): boolean => { const st = e instanceof Error ? (e as Error & { status?: unknown }).status : undefined; return typeof st === "number" && st >= 400 && st < 500; };
export const TICKET_RE = /^[A-Z]{2,6}-\d{1,6}$/;
export const hoursLeft = (a: Approval) => Math.max(0, Math.ceil((a.expiresAt - Date.now()) / 3600_000));
