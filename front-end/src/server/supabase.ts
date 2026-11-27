/* Server-only. Supabase Auth and Postgres behind the AuthProvider and Store interfaces. Two clients: the public (anon) key for password sign-in,
   TOTP and reset emails as the user; the service key for admin actions and the tables. The service key never reaches the browser: this file is
   imported only by pages/api. Schema: supabase/migrations/0001_selvara_auth.sql to 0005_team_changes.sql. */
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { logSignInRefused, upstream } from "./errors";
import type { AuthProvider, NoticeRow, PasskeyRow, Profile, RecoveryRow, SessionRow, Store, AuditRow } from "./types";

const OPTS = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
export interface SupabaseEnv { url: string; anonKey: string; serviceKey: string }
type T = { access: string; refresh: string };
/** Supabase needs a unique name per factor: the person's label plus a short suffix, which the account page leaves out. */
const friendly = (label: string) => `${label.slice(0, 40)} · ${Date.now().toString(36)}`;
const labelOf = (name: string | undefined) => (name || "Authenticator app").replace(/ · [a-z0-9]+$/, "");

export class SupabaseAuth implements AuthProvider {
  constructor(private env: SupabaseEnv) {}
  private anon() { return createClient(this.env.url, this.env.anonKey, OPTS); }
  private service() { return createClient(this.env.url, this.env.serviceKey, OPTS); }
  private async as(t: T): Promise<SupabaseClient> { const c = this.anon(); const { error } = await c.auth.setSession({ access_token: t.access, refresh_token: t.refresh }); if (error) throw upstream("auth.session", error); return c; }
  async signInWithPassword(email: string, password: string) {
    const { data, error } = await this.anon().auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user) { logSignInRefused("auth-refused", error); return null; }
    return { userId: data.user.id, access: data.session.access_token, refresh: data.session.refresh_token };
  }
  async verifiedTotpFactor(t: T) { const { data } = await (await this.as(t)).auth.mfa.listFactors(); return data?.totp?.find((f) => f.status === "verified")?.id ?? null; }
  async enrollTotp(t: T, label: string) {
    const c = await this.as(t);
    const { data: list } = await c.auth.mfa.listFactors();
    for (const f of list?.all ?? []) if (f.status !== "verified") await c.auth.mfa.unenroll({ factorId: f.id }); // a half-finished set-up
    const { data, error } = await c.auth.mfa.enroll({ factorType: "totp", friendlyName: friendly(label) });
    if (error || !data || data.type !== "totp") throw upstream("auth.totp-enroll", error);
    return { factorId: data.id, secret: data.totp.secret, uri: data.totp.uri };
  }
  async verifyTotp(t: T, factorId: string, code: string) { const { error } = await (await this.as(t)).auth.mfa.challengeAndVerify({ factorId, code }); return !error; }
  async signOut(t: T) { try { await (await this.as(t)).auth.signOut({ scope: "local" }); } catch { /* already gone */ } }
  async createUser(email: string, password: string, person: string) {
    const { data, error } = await this.service().auth.admin.createUser({ email, password, email_confirm: false, user_metadata: { name: person } });
    if (error || !data.user) throw upstream("auth.create-user", error); return data.user.id;
  }
  async mfaEnrolled(userId: string) {
    const { data, error } = await this.service().auth.admin.mfa.listFactors({ userId }); if (error) throw upstream("auth.mfa-list", error);
    return (data?.factors ?? []).some((f) => f.status === "verified");
  }
  async setBanned(userId: string, banned: boolean) {
    const { error } = await this.service().auth.admin.updateUserById(userId, { ban_duration: banned ? "876000h" : "none" }); if (error) throw upstream("auth.ban", error);
  }
  async scrubUser(userId: string, placeholderEmail: string) {
    await this.resetMfa(userId);
    const password = randomBytes(32).toString("base64url");
    const { error } = await this.service().auth.admin.updateUserById(userId, { email: placeholderEmail, email_confirm: true, password, user_metadata: {}, ban_duration: "876000h" });
    if (error) throw upstream("auth.scrub", error);
  }
  async resetMfa(userId: string) {
    const { data, error } = await this.service().auth.admin.mfa.listFactors({ userId }); if (error) throw upstream("auth.mfa-list", error);
    for (const f of data?.factors ?? []) { const r = await this.service().auth.admin.mfa.deleteFactor({ id: f.id, userId }); if (r.error) throw upstream("auth.mfa-delete", r.error); }
  }
  async listTotp(userId: string) {
    const { data, error } = await this.service().auth.admin.mfa.listFactors({ userId }); if (error) throw upstream("auth.mfa-list", error);
    return (data?.factors ?? []).filter((f) => f.factor_type === "totp" && f.status === "verified")
      .map((f) => ({ id: f.id, label: labelOf(f.friendly_name), createdAt: Date.parse(f.created_at) || 0 })).sort((a, b) => a.createdAt - b.createdAt);
  }
  async removeTotp(userId: string, factorId: string) { const r = await this.service().auth.admin.mfa.deleteFactor({ id: factorId, userId }); if (r.error) throw upstream("auth.mfa-delete", r.error); }
  private async tryCode(c: SupabaseClient, code: string) {
    const { data } = await c.auth.mfa.listFactors();
    for (const f of data?.totp ?? []) if (f.status === "verified") { const { error } = await c.auth.mfa.challengeAndVerify({ factorId: f.id, code }); if (!error) return f.id; }
    return null;
  }
  async verifyAnyTotp(t: T, code: string) { return this.tryCode(await this.as(t), code); }
  async enrollTotpStepUp(t: T, code: string, label: string) {
    const c = await this.as(t); if (!(await this.tryCode(c, code))) return null; // the session is now at the two-step level
    const { data: list } = await c.auth.mfa.listFactors();
    for (const f of list?.all ?? []) if (f.status !== "verified") await c.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await c.auth.mfa.enroll({ factorType: "totp", friendlyName: friendly(label) });
    if (error || !data || data.type !== "totp") throw upstream("auth.totp-enroll", error);
    const { data: ses } = await c.auth.getSession(); if (!ses.session) throw upstream("auth.session", null);
    return { factorId: data.id, secret: data.totp.secret, uri: data.totp.uri, access: ses.session.access_token, refresh: ses.session.refresh_token };
  }
  async confirmUser(id: string) { const { error } = await this.service().auth.admin.updateUserById(id, { email_confirm: true }); if (error) throw upstream("auth.confirm-user", error); }
  async setPassword(id: string, password: string) { const { error } = await this.service().auth.admin.updateUserById(id, { password }); if (error) throw upstream("auth.set-password", error); }
  async sendResetEmail(email: string, redirectTo: string) { await this.anon().auth.resetPasswordForEmail(email, { redirectTo }); }
  async userOfRecovery(t: T) {
    const { data, error } = await this.anon().auth.getUser(t.access); if (error || !data.user) return null;
    try { // only a session opened from a reset link counts (amr "recovery")
      const claims = JSON.parse(Buffer.from(t.access.split(".")[1], "base64url").toString()) as { amr?: { method: string }[] };
      return claims.amr?.some((m) => m.method === "recovery") ? data.user.id : null;
    } catch { return null; }
  }
}

const P = (r: Record<string, unknown>): Profile => ({ id: String(r.id), email: String(r.email), person: String(r.person), status: r.status as Profile["status"], requestedAt: Number(r.requested_ms), decidedBy: (r.decided_by as string) ?? undefined, reason: (r.reason as string) ?? undefined });
const S = (r: Record<string, unknown>): SessionRow => ({ idHash: String(r.id_hash), userId: String(r.user_id), device: String(r.device), ip: String(r.ip), createdAt: Number(r.created_ms), lastSeen: Number(r.last_seen_ms), expiresAt: Number(r.expires_ms), revokedAt: r.revoked_ms == null ? undefined : Number(r.revoked_ms), revokedWhy: (r.revoked_why as string) ?? undefined, tenantId: (r.tenant_id as string | null) ?? null });
const snake = (o: Record<string, unknown>, map: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([k, v]) => k in map && v !== undefined).map(([k, v]) => [map[k], v]));
const PMAP = { id: "id", email: "email", person: "person", status: "status", requestedAt: "requested_ms", decidedBy: "decided_by", reason: "reason" };
const SMAP = { idHash: "id_hash", userId: "user_id", device: "device", ip: "ip", createdAt: "created_ms", lastSeen: "last_seen_ms", expiresAt: "expires_ms", revokedAt: "revoked_ms", revokedWhy: "revoked_why", tenantId: "tenant_id" };
/** Unwraps a database result; a failure carries the table and Supabase's code and status (see errors.ts). */
const check = <X,>(r: { data: X; error: unknown; status?: number }, table = "?"): X => { if (r.error) throw upstream(`db.${table}`, r.error, r.status); return r.data; };

export class SupabaseStore implements Store {
  private db: SupabaseClient;
  constructor(env: SupabaseEnv, private now: () => number = Date.now) { this.db = createClient(env.url, env.serviceKey, OPTS); }
  async profileByEmail(e: string) { const d = check(await this.db.from("profiles").select("*").eq("email", e).maybeSingle(), "profiles"); return d ? P(d) : null; }
  async profileById(id: string) { const d = check(await this.db.from("profiles").select("*").eq("id", id).maybeSingle(), "profiles"); return d ? P(d) : null; }
  async insertProfile(p: Profile) { check(await this.db.from("profiles").insert(snake(p as unknown as Record<string, unknown>, PMAP)), "profiles"); }
  async updateProfile(id: string, patch: Partial<Profile>) { check(await this.db.from("profiles").update(snake(patch as Record<string, unknown>, PMAP)).eq("id", id), "profiles"); }
  async pendingProfiles() { return (check(await this.db.from("profiles").select("*").eq("status", "Pending").order("requested_ms"), "profiles") ?? []).map(P); }
  async kvGet<X>(ns: string, key: string) { const d = check(await this.db.from("kv").select("value, expires_ms").eq("ns", ns).eq("key", key).maybeSingle(), "kv"); if (!d || (d.expires_ms && Number(d.expires_ms) <= this.now())) return null; return d.value as X; }
  async kvSet(ns: string, key: string, value: unknown, ttl?: number) { check(await this.db.from("kv").upsert({ ns, key, value, expires_ms: ttl ? this.now() + ttl : null }), "kv"); }
  async kvDel(ns: string, key: string) { check(await this.db.from("kv").delete().eq("ns", ns).eq("key", key), "kv"); }
  async insertSession(s: SessionRow) { check(await this.db.from("sessions").insert(snake(s as unknown as Record<string, unknown>, SMAP)), "sessions"); }
  async sessionByHash(h: string) { const d = check(await this.db.from("sessions").select("*").eq("id_hash", h).maybeSingle(), "sessions"); return d ? S(d) : null; }
  async updateSession(h: string, patch: Partial<SessionRow>) { check(await this.db.from("sessions").update(snake(patch as Record<string, unknown>, SMAP)).eq("id_hash", h), "sessions"); }
  async sessionsOf(u: string) { return (check(await this.db.from("sessions").select("*").eq("user_id", u).order("last_seen_ms", { ascending: false }).limit(50), "sessions") ?? []).map(S); }
  async insertNotice(n: NoticeRow) { check(await this.db.from("notices").insert({ id: n.id, user_id: n.userId, at_ms: n.at, text: n.text }), "notices"); }
  async noticesOf(u: string, limit: number) { return (check(await this.db.from("notices").select("*").eq("user_id", u).order("at_ms", { ascending: false }).limit(limit), "notices") ?? []).map((r) => ({ id: String(r.id), userId: u, at: Number(r.at_ms), text: String(r.text) })); }
  async audit(a: AuditRow) { check(await this.db.from("audit_log").insert({ at_ms: a.at, actor: a.actor, action: a.action, target: a.target, cat: a.cat, space: a.space, ip: a.ip, tenant_id: a.tenantId ?? null, actor_id: a.actorId ?? null }), "audit_log"); }
  async passkeysOf(u: string) { return (check(await this.db.from("passkeys").select("*").eq("user_id", u), "passkeys") ?? []).map((r) => ({ id: String(r.id), userId: u, publicKey: String(r.public_key), signCount: Number(r.sign_count), createdAt: Number(r.created_ms), label: String(r.label) })); }
  async insertPasskey(p: PasskeyRow) { check(await this.db.from("passkeys").insert({ id: p.id, user_id: p.userId, public_key: p.publicKey, sign_count: p.signCount, created_ms: p.createdAt, label: p.label }), "passkeys"); }
  async updatePasskey(id: string, patch: Partial<PasskeyRow>) { if (patch.signCount !== undefined) check(await this.db.from("passkeys").update({ sign_count: patch.signCount }).eq("id", id), "passkeys"); }
  async deletePasskey(id: string) { check(await this.db.from("passkeys").delete().eq("id", id), "passkeys"); }
  async recoveryOf(u: string) { return (check(await this.db.from("recovery_codes").select("*").eq("user_id", u), "recovery_codes") ?? []).map((r) => ({ userId: u, salt: String(r.salt), hash: String(r.hash), usedAt: r.used_ms == null ? undefined : Number(r.used_ms) })); }
  async replaceRecovery(u: string, rows: RecoveryRow[]) { check(await this.db.from("recovery_codes").delete().eq("user_id", u), "recovery_codes"); check(await this.db.from("recovery_codes").insert(rows.map((r) => ({ user_id: u, salt: r.salt, hash: r.hash }))), "recovery_codes"); }
  async markRecoveryUsed(u: string, hash: string) { const d = check(await this.db.from("recovery_codes").update({ used_ms: this.now() }).eq("user_id", u).eq("hash", hash).is("used_ms", null).select("hash"), "recovery_codes"); return (d ?? []).length === 1; }
}
