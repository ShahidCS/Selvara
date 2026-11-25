/* Server-only. Reads the server configuration from the environment (set in Vercel, never in the repository). Missing values -> the API is off (503). */
import type { Deps } from "./types";
import { SupabaseAuth, SupabaseStore } from "./supabase";
import { dbFromEnv } from "./db";
import { PgDirectory } from "./directory";
import { PgPlatform } from "./platform";
import { PgSupport } from "./support";
import { PgHelpDesk } from "./helpdesk";
import { PgCspReports } from "./cspReport";
import { SupabaseFileStore } from "./ws/files";
import { PgWsStore } from "./ws/store";
import { claudeFromEnv } from "./claude";
import { httpsHookSender } from "./ws/webhooks";
import { PgPlatStore } from "./platstore";
import { stripeFromEnv } from "./billing";

let cached: Deps | null | undefined;
/** Names of the variables the API needs. Values are secrets except the URLs. DATABASE_URL (as selvara_app, with DATABASE_CA_CERT for TLS) is
 *  required since sessions belong to a company: roles come from memberships, which only the database role bound by row level security reads
 *  (docs/guides/SUPABASE.md section 4b). Without it, or with a value that does not parse, the whole API answers 503 (fails closed). */
export const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SITE_URL", "SERVER_SECRET", "DATABASE_URL"] as const;
export function deps(): Deps | null {
  if (cached !== undefined) return cached;
  const e = process.env;
  if (REQUIRED_ENV.some((k) => !e[k]) || String(e.SERVER_SECRET).length < 32) { cached = null; return cached; }
  const site = new URL(String(e.SITE_URL));
  const env = { url: String(e.SUPABASE_URL), anonKey: String(e.SUPABASE_ANON_KEY), serviceKey: String(e.SUPABASE_SERVICE_ROLE_KEY) };
  let db: NonNullable<Deps["db"]>;
  try { db = dbFromEnv(String(e.DATABASE_URL), e.DATABASE_CA_CERT); } catch { cached = null; return cached; } // e.g. no CA certificate for a remote database
  const store = new SupabaseStore(env);
  cached = { auth: new SupabaseAuth(env), store, dir: new PgDirectory(db), plat: new PgPlatform(db), sup: new PgSupport(db), help: new PgHelpDesk(db), csp: new PgCspReports(db), ws: new PgWsStore(db, store), files: new SupabaseFileStore(env, e.EVIDENCE_BUCKET || undefined), site: { origin: site.origin, rpId: site.hostname }, secret: String(e.SERVER_SECRET), now: Date.now, db, ai: claudeFromEnv(e), hooks: httpsHookSender, pstore: new PgPlatStore(db), payments: stripeFromEnv(e) ?? null };
  return cached;
}
/** The client address: from Vercel's own header when running on Vercel (a trusted proxy), otherwise the socket. Never from a header a client can set elsewhere. */
export function clientAddress(headers: Record<string, string | string[] | undefined>, socketIp: string | undefined): string {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.split(",")[0]?.trim();
  const ip = process.env.VERCEL ? one(headers["x-vercel-forwarded-for"]) || one(headers["x-real-ip"]) : undefined;
  return (ip || socketIp || "0.0.0.0").slice(0, 64);
}
