/* Server-only. In-memory stand-ins for Supabase Auth and Postgres, used by the server tests (and usable for local development without a project).
   They behave like the real services where the handlers depend on it: unconfirmed users cannot sign in, TOTP is verified with a used-step check,
   and recovery sessions come from a reset email. */
import { newSecret, otpauthUri, verifyTotp } from "@/lib/totp";
import { randomId, sha256Hex } from "./crypto";
import type { AuthProvider, NoticeRow, PasskeyRow, Profile, RecoveryRow, SessionRow, Store, AuditRow } from "./types";

interface MUser { id: string; email: string; salt: string; hash: string; confirmed: boolean; factor?: { id: string; secret: string; verified: boolean; lastStep: number } }
export class MemoryAuth implements AuthProvider {
  constructor(private now: () => number = Date.now) {}
  users = new Map<string, MUser>(); tokens = new Map<string, { userId: string; recovery: boolean }>(); outbox: { email: string; token: string }[] = [];
  private byEmail(e: string) { return [...this.users.values()].find((u) => u.email === e); }
  private tok(userId: string, recovery = false) { const access = randomId(16), refresh = randomId(16); this.tokens.set(access, { userId, recovery }); return { access, refresh }; }
  private user(t: { access: string }) { const x = this.tokens.get(t.access); return x ? this.users.get(x.userId) : undefined; }
  async signInWithPassword(email: string, password: string) {
    const u = this.byEmail(email); if (!u || !u.confirmed || (await sha256Hex(u.salt + password)) !== u.hash) return null;
    return { userId: u.id, ...this.tok(u.id) };
  }
  async verifiedTotpFactor(t: { access: string }) { const u = this.user(t); return u?.factor?.verified ? u.factor.id : null; }
  async enrollTotp(t: { access: string }, label: string) { const u = this.user(t); if (!u) throw new Error("no session"); const secret = newSecret(); u.factor = { id: randomId(8), secret, verified: false, lastStep: -1 }; return { factorId: u.factor.id, secret, uri: otpauthUri(secret, label) }; }
  async verifyTotp(t: { access: string }, factorId: string, code: string) {
    const u = this.user(t); if (!u?.factor || u.factor.id !== factorId) return false;
    const step = await verifyTotp(u.factor.secret, code, u.factor.lastStep, this.now()); if (step === null) return false;
    u.factor.lastStep = step; u.factor.verified = true; return true;
  }
  async signOut(t: { access: string }) { this.tokens.delete(t.access); }
  async createUser(email: string, password: string, _person?: string) { void _person; const id = crypto.randomUUID(); /* a uuid, as Supabase Auth issues */ const salt = randomId(8); this.users.set(id, { id, email, salt, hash: await sha256Hex(salt + password), confirmed: false }); return id; }
  async confirmUser(id: string) { const u = this.users.get(id); if (u) u.confirmed = true; }
  async setPassword(id: string, password: string) { const u = this.users.get(id); if (u) u.hash = await sha256Hex(u.salt + password); }
  async sendResetEmail(email: string) { const u = this.byEmail(email); if (u) { const t = this.tok(u.id, true); this.outbox.push({ email, token: Buffer.from(JSON.stringify(t)).toString("base64url") }); } }
  async userOfRecovery(t: { access: string }) { const x = this.tokens.get(t.access); return x?.recovery ? x.userId : null; }
  async mfaEnrolled(userId: string) { return !!this.users.get(userId)?.factor?.verified; }
  async resetMfa(userId: string) { const u = this.users.get(userId); if (u) delete u.factor; }
  /** Test helper: the factor secret an authenticator app would hold. */
  secretOf(email: string) { return this.byEmail(email)?.factor?.secret; }
}

export class MemoryStore implements Store {
  profiles = new Map<string, Profile>(); kv = new Map<string, { v: unknown; exp: number }>(); sessions = new Map<string, SessionRow>();
  notices: NoticeRow[] = []; auditLog: AuditRow[] = []; passkeys: PasskeyRow[] = []; recovery: RecoveryRow[] = [];
  constructor(private now: () => number = Date.now) {}
  async profileByEmail(e: string) { return [...this.profiles.values()].find((p) => p.email === e) || null; }
  async profileById(id: string) { return this.profiles.get(id) || null; }
  async insertProfile(p: Profile) { this.profiles.set(p.id, { ...p }); }
  async updateProfile(id: string, patch: Partial<Profile>) { const p = this.profiles.get(id); if (p) Object.assign(p, patch); }
  async pendingProfiles() { return [...this.profiles.values()].filter((p) => p.status === "Pending"); }
  async kvGet<T>(ns: string, key: string) { const x = this.kv.get(ns + "|" + key); if (!x || (x.exp && x.exp <= this.now())) return null; return structuredClone(x.v) as T; }
  async kvSet(ns: string, key: string, v: unknown, ttl?: number) { this.kv.set(ns + "|" + key, { v: structuredClone(v), exp: ttl ? this.now() + ttl : 0 }); }
  async kvDel(ns: string, key: string) { this.kv.delete(ns + "|" + key); }
  async insertSession(s: SessionRow) { this.sessions.set(s.idHash, { ...s }); }
  async sessionByHash(h: string) { const s = this.sessions.get(h); return s ? { ...s } : null; }
  async updateSession(h: string, patch: Partial<SessionRow>) { const s = this.sessions.get(h); if (s) Object.assign(s, patch); }
  async sessionsOf(u: string) { return [...this.sessions.values()].filter((s) => s.userId === u).map((s) => ({ ...s })); }
  async insertNotice(n: NoticeRow) { this.notices.push(n); }
  async noticesOf(u: string, limit: number) { return this.notices.filter((n) => n.userId === u).sort((a, b) => b.at - a.at).slice(0, limit); }
  async audit(a: AuditRow) { this.auditLog.push(a); }
  async passkeysOf(u: string) { return this.passkeys.filter((p) => p.userId === u).map((p) => ({ ...p })); }
  async insertPasskey(p: PasskeyRow) { this.passkeys.push({ ...p }); }
  async updatePasskey(id: string, patch: Partial<PasskeyRow>) { const p = this.passkeys.find((x) => x.id === id); if (p) Object.assign(p, patch); }
  async deletePasskey(id: string) { this.passkeys = this.passkeys.filter((p) => p.id !== id); }
  async recoveryOf(u: string) { return this.recovery.filter((r) => r.userId === u).map((r) => ({ ...r })); }
  async replaceRecovery(u: string, rows: RecoveryRow[]) { this.recovery = [...this.recovery.filter((r) => r.userId !== u), ...rows]; }
  async markRecoveryUsed(u: string, hash: string) { const r = this.recovery.find((x) => x.userId === u && x.hash === hash && !x.usedAt); if (!r) return false; r.usedAt = this.now(); return true; }
}
