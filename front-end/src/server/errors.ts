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
