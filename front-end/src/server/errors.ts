/* Server-only. Errors from Supabase carry the step that failed and Supabase's own code and status, so a 500 can be diagnosed from the function logs.
   What is logged is deliberately small: never request bodies, keys, tokens, cookies, email addresses or the values Postgres quotes back. */

/** A call to Supabase (Auth or the database) failed. `step` names what we were doing; `code` and `status` come from Supabase. */
export class UpstreamError extends Error {
  constructor(public step: string, public code?: string, public status?: number, public detail?: string) { super(step); this.name = "UpstreamError"; }
}

/** An expected refusal raised inside a unit of work (a rule, a stale copy). Db.tx rolls back and rethrows it unchanged, so the route can answer
 *  with its message instead of a generic 500. */
export class PassThrough extends Error {}

/** Builds an UpstreamError from a Supabase error object (Postgrest or Auth), keeping only its code, status and a redacted message. */
export function upstream(step: string, e: unknown, status?: number): UpstreamError {
  const o = (e && typeof e === "object" ? e : {}) as { code?: unknown; status?: unknown; message?: unknown };
  const st = typeof o.status === "number" ? o.status : status;
  return new UpstreamError(step, o.code == null || o.code === "" ? undefined : String(o.code).slice(0, 40), st, safeMessage(o.message));
}

/** A message safe to log: values Postgres quotes after a colon, email addresses and anything shaped like a token are removed; 160 characters at most. */
export function safeMessage(m: unknown): string | undefined {
  if (typeof m !== "string" || !m) return undefined;
  return m
    .replace(/:\s*".*$/s, ': "[redacted]"') // e.g. invalid input syntax for type uuid: "<value>"
    .replace(/[^\s@"']+@[^\s@"']+/g, "[email]")
    .replace(/\b(?:eyJ|sb_(?:secret|publishable)_)[\w.-]*/g, "[token]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[token]")
    .slice(0, 160);
}

/** One structured log line for an unexpected failure. `route` is the route pattern (never the real path, which can hold a reset token). */
export function logFailure(route: string, e: unknown, requestId?: string): void {
  const u = e instanceof UpstreamError ? e : null;
  const line = {
    level: "error", event: "api.error", route,
    step: u ? u.step : "internal",
    ...(u?.code ? { code: u.code } : {}),
    ...(u?.status ? { status: u.status } : {}),
    ...(u ? (u.detail ? { message: u.detail } : {}) : { message: `${e instanceof Error ? e.name : typeof e}: ${safeMessage(e instanceof Error ? e.message : "") ?? ""}`.slice(0, 200) }),
    ...(requestId ? { requestId: requestId.slice(0, 80) } : {}),
  };
  console.error(JSON.stringify(line));
}

/** Why a password sign-in was refused, for the operator: a reason and Supabase Auth's error code and status. Never the email address, password or
 *  address; the person still gets the one generic answer. Lets "the password is wrong" be told apart from "the email is not confirmed" or
 *  "the key is from another project" (all of which look the same on the sign-in page). */
export function logSignInRefused(reason: "no-profile" | "auth-refused", e?: unknown): void {
  const o = (e && typeof e === "object" ? e : {}) as { code?: unknown; status?: unknown; message?: unknown };
  const line = {
    level: "warn", event: "auth.sign-in.refused", reason,
    ...(o.code != null && o.code !== "" ? { code: String(o.code).slice(0, 40) } : {}),
    ...(typeof o.status === "number" ? { status: o.status } : {}),
    ...(reason === "auth-refused" && safeMessage(o.message) ? { message: safeMessage(o.message) } : {}),
  };
  console.warn(JSON.stringify(line));
}

/** SEC-8 (ASVS V7.1, V7.2): one structured line per security event for the operator's log search and alerting: failed sign-ins and second
 *  steps, account locks, refused requests (permission denied 403, locked 423, rate limited 429), uploads refused for active content (422,
 *  SEC-18) and sessions that are no longer valid. It carries the time, the event, the route pattern, the status, the client address and who it concerns: the user id when known, otherwise `subject`, a keyed
 *  hash of the email address (so repeated attempts on one account can be correlated without logging the address). Never a password, token or
 *  cookie. Admin actions are in the audit log (store.audit) with the same who, when and address. */
export interface SecurityEvent { event: string; ip: string; route?: string; status?: number; userId?: string; subject?: string; session?: string; requestId?: string }
export function logSecurityEvent(e: SecurityEvent, now = Date.now()): void {
  console.warn(JSON.stringify({ level: "warn", at: new Date(now).toISOString(), ...e, ...(e.requestId ? { requestId: e.requestId.slice(0, 80) } : {}) }));
}
