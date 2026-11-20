/* Server-only. Interfaces the auth handlers depend on, so they run against Supabase in production and against an in-memory stand-in in tests. */
/** A person (profiles). Their access comes from memberships and platform_staff, never from the profile (profiles.role was dropped in 0005). */
export interface Profile { id: string; email: string; person: string; status: "Pending" | "Active" | "Rejected"; requestedAt: number; decidedBy?: string; reason?: string }
export interface SessionRow { idHash: string; userId: string; device: string; ip: string; createdAt: number; lastSeen: number; expiresAt: number; revokedAt?: number; revokedWhy?: string; /** The company this session works in (null for platform staff). */ tenantId?: string | null }
export interface NoticeRow { id: string; userId: string; at: number; text: string }
export interface AuditRow { at: number; actor: string; action: string; target: string; cat: string; space: "ws" | "admin"; ip: string; /** Company log (null: platform log). */ tenantId?: string | null; actorId?: string | null }
export interface PasskeyRow { id: string; userId: string; publicKey: string; signCount: number; createdAt: number; label: string }
export interface RecoveryRow { userId: string; salt: string; hash: string; usedAt?: number }

/** Supabase Auth (or the test stand-in): identities, password hashes and authenticator (TOTP) factors. */
export interface AuthProvider {
  /** Password check. Returns tokens for a short-lived Supabase session (used only for the MFA step, then signed out). */
  signInWithPassword(email: string, password: string): Promise<{ userId: string; access: string; refresh: string } | null>;
  verifiedTotpFactor(t: { access: string; refresh: string }): Promise<string | null>;
  enrollTotp(t: { access: string; refresh: string }, label: string): Promise<{ factorId: string; secret: string; uri: string }>;
  verifyTotp(t: { access: string; refresh: string }, factorId: string, code: string): Promise<boolean>;
  signOut(t: { access: string; refresh: string }): Promise<void>;
  createUser(email: string, password: string, person: string): Promise<string>;
  confirmUser(userId: string): Promise<void>;
  setPassword(userId: string, password: string): Promise<void>;
  /** Emails a password-reset link (Supabase's mailer). Does nothing for unknown emails. */
  sendResetEmail(email: string, redirectTo: string): Promise<void>;
  /** The user of a recovery session from a reset link, or null. */
  userOfRecovery(t: { access: string; refresh: string }): Promise<string | null>;
  /** Whether the person has a verified authenticator (admin API, no session needed). */
  mfaEnrolled(userId: string): Promise<boolean>;
  /** Removes every authenticator factor of the person (an approved MFA reset): they enrol again at their next sign-in. */
  resetMfa(userId: string): Promise<void>;
}
/** Supabase Postgres (or the test stand-in). Only the server reaches it, with the service key; row level security denies everyone else. */
export interface Store {
  profileByEmail(email: string): Promise<Profile | null>;
  profileById(id: string): Promise<Profile | null>;
  insertProfile(p: Profile): Promise<void>;
  updateProfile(id: string, patch: Partial<Profile>): Promise<void>;
  pendingProfiles(): Promise<Profile[]>;
  kvGet<T>(ns: string, key: string): Promise<T | null>;
  kvSet(ns: string, key: string, value: unknown, ttlMs?: number): Promise<void>;
  kvDel(ns: string, key: string): Promise<void>;
  insertSession(s: SessionRow): Promise<void>;
  sessionByHash(h: string): Promise<SessionRow | null>;
  updateSession(h: string, patch: Partial<SessionRow>): Promise<void>;
  sessionsOf(userId: string): Promise<SessionRow[]>;
  insertNotice(n: NoticeRow): Promise<void>;
  noticesOf(userId: string, limit: number): Promise<NoticeRow[]>;
  audit(a: AuditRow): Promise<void>;
  passkeysOf(userId: string): Promise<PasskeyRow[]>;
  insertPasskey(p: PasskeyRow): Promise<void>;
  updatePasskey(id: string, patch: Partial<PasskeyRow>): Promise<void>;
  deletePasskey(id: string): Promise<void>;
  recoveryOf(userId: string): Promise<RecoveryRow[]>;
  replaceRecovery(userId: string, rows: RecoveryRow[]): Promise<void>;
  markRecoveryUsed(userId: string, hash: string): Promise<boolean>;
}
/** `dir` holds companies, memberships and platform staff (directory.ts); `db` is the company-scoped Postgres access (db.ts) behind it, absent in
 *  the in-memory tests. */
export interface Deps { auth: AuthProvider; store: Store; dir: import("./directory").Directory; /** The Admin Console's data (platform.ts). */ plat: import("./platform").Platform; /** Support access to company workspaces (support.ts). */ sup: import("./support").Support; /** The workspace modules' records (ws/store.ts) and evidence files (ws/files.ts). */ ws: import("./ws/store").WsStore; files: import("./ws/files").FileStore; site: { origin: string; rpId: string }; secret: string; now: () => number; db?: import("./db").Db;
  /** The AI model (server/claude.ts); absent until the owner adds the key. */ ai?: import("./claude").AiClient;
  /** Outgoing webhook delivery (server/ws/webhooks.ts); tests use a stand-in. */ hooks?: import("./ws/webhooks").HookSender;
  /** Integrations (group 7): the network the connectors use and the platform credentials; both default to the real ones, tests use stand-ins. */ net?: import("./integrations/net").Net; intEnv?: import("./integrations/providers").IntegrationEnv;
  /** Group 8: the platform's own records (billing, rates) and the payment provider (undefined: from the environment; null: none). */ pstore?: import("./platstore").PlatStore; payments?: import("./billing").Payments | null }
