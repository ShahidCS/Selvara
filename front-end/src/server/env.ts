/* Server-only. Reads the server configuration from the environment (set in Vercel, never in the repository). Missing values -> the API is off (503). */
import type { Deps } from "./types";
import { SupabaseAuth, SupabaseStore } from "./supabase";

let cached: Deps | null | undefined;
/** Names of the variables the API needs. Values are secrets except the URLs. */
export const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SITE_URL", "SERVER_SECRET"] as const;
export function deps(): Deps | null {
  if (cached !== undefined) return cached;
  const e = process.env;
  if (REQUIRED_ENV.some((k) => !e[k]) || String(e.SERVER_SECRET).length < 32) { cached = null; return cached; }
  const site = new URL(String(e.SITE_URL));
  const env = { url: String(e.SUPABASE_URL), anonKey: String(e.SUPABASE_ANON_KEY), serviceKey: String(e.SUPABASE_SERVICE_ROLE_KEY) };
  cached = { auth: new SupabaseAuth(env), store: new SupabaseStore(env), site: { origin: site.origin, rpId: site.hostname }, secret: String(e.SERVER_SECRET), now: Date.now };
  return cached;
}
/** The client address: from Vercel's own header when running on Vercel (a trusted proxy), otherwise the socket. Never from a header a client can set elsewhere. */
export function clientAddress(headers: Record<string, string | string[] | undefined>, socketIp: string | undefined): string {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.split(",")[0]?.trim();
  const ip = process.env.VERCEL ? one(headers["x-vercel-forwarded-for"]) || one(headers["x-real-ip"]) : undefined;
  return (ip || socketIp || "0.0.0.0").slice(0, 64);
}
