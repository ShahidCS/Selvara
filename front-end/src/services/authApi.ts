/* Sign-in, MFA, password reset and account security, the way the pages call them. Mock mode (the public demonstration) runs the browser-side flow in
   lib/session.ts. Production (NEXT_PUBLIC_API_MODE=http) calls the server, which owns every rule: accounts, password hashing (Argon2id), MFA secrets,
   recovery codes, lockout, network blocking, sessions (Secure, HttpOnly, SameSite=Strict cookie) and the audit log. The contract is listed in
   docs/security/CONTROLS.md ("Authentication API contract"). Demo accounts do not exist in production. */
import * as local from "@/lib/session";
import { ChallengeRequired, SIGNIN_FAILED, type SignInResult, type SignInStep } from "@/lib/session";
import { acct, activeSessions, issueChallenge, MFA, noticesFor, solveChallenge } from "@/lib/accountSecurity";
import { appStore as store } from "@/lib/store";
import { createPasskey } from "@/lib/webauthn";
import { THROTTLED_MSG } from "@/lib/credentials";
import { API_BASE, API_MODE, ApiError, apiFetch } from "./http";

/** Mock mode runs `mock` (sync or async); production calls `real`. */
const mode = <T,>(mock: () => T | Promise<T>, real: () => Promise<T>): Promise<T> => (API_MODE === "http" && API_BASE ? real() : Promise.resolve().then(mock));

export interface Company { ref: string; name: string }
const post = <T,>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
/** Server answers are mapped to the same messages the demo shows; details stay on the server. */
function mapError(e: unknown): never {
  if (e instanceof ApiError) {
    if (e.status === 428) throw new ChallengeRequired();
    if (e.status === 401) throw new Error(SIGNIN_FAILED);
    if (e.status === 423 || e.status === 429) throw new Error(THROTTLED_MSG);
    if (e.status === 403) throw new Error("Sign-in from your network is blocked. Ask your administrator to contact platform support.");
  }
  throw e instanceof Error ? e : new Error("Something went wrong. Please try again.");
}
const call = async <T,>(fn: () => Promise<T>): Promise<T> => { try { return await fn(); } catch (e) { return mapError(e); } };

/** The proof-of-work check. Production: the server issues the seed and verifies the answer. */
export async function solveSignInChallenge(): Promise<{ seed: string; nonce: number }> {
  const c = await mode(() => issueChallenge(), () => call(() => post<{ seed: string; digits: number }>("/auth/challenge", {})));
  return { seed: c.seed, nonce: await solveChallenge(c.seed, c.digits) };
}
export const signIn = (email: string, password: string, challenge?: { seed: string; nonce: number }) =>
  mode(() => local.signIn(email, password, challenge), () => call(() => post<SignInStep>("/auth/sign-in", { email, password, challenge })));
export async function completeSignIn(ticket: string, code: string, opts: { recovery?: boolean } = {}): Promise<SignInResult> {
  return mode(() => local.completeSignIn(ticket, code, opts), async () => {
    const r = await call(() => post<SignInResult & { who: string | null; company?: Company | null }>("/auth/sign-in/verify", { ticket, code, recovery: !!opts.recovery }));
    local.applyServerSession(r.roleId, r.who, r.company ?? null); return r; // the shell then confirms the session, which also lists the companies
  });
}
/** Passkey step (super admins). Production: POST /auth/sign-in/passkey; the server holds the challenge and the public keys. */
/** After the passkey, a super admin who also added an authenticator app gets the code step (`step: "mfa"`) instead of a session. */
export type PasskeyOutcome = SignInResult | Extract<SignInStep, { step: "mfa" }>;
export async function completePasskey(ticket: string, p: Parameters<typeof local.completePasskey>[1]): Promise<PasskeyOutcome> {
  return mode(() => local.completePasskey(ticket, p), async () => {
    const r = await call(() => post<PasskeyOutcome & { who?: string | null; company?: Company | null }>("/auth/sign-in/passkey", { ticket, ...p }));
    if ("step" in r) return r;
    local.applyServerSession(r.roleId, r.who ?? null, r.company ?? null); return r;
  });
}
export const requestToJoin = (input: local.JoinInput) => mode(() => local.requestToJoin(input), () => call(() => post<void>("/auth/join-requests", input)));
export const requestReset = (email: string) => mode(() => local.requestReset(email), () => call(() => post<void>("/auth/password/reset-request", { email })).then(() => ({ token: null })));
export const resetLinkValid = (token: string) => mode(() => local.resetLinkValid(token), () => call(() => apiFetch<{ valid: boolean }>(`/auth/password/reset/${encodeURIComponent(token)}`)).then((r) => r.valid));
export const completeReset = (token: string, code: string, password: string) => mode(() => local.completeReset(token, code, password), () => call(() => post<void>("/auth/password/reset", { token, code, password })));
export const reauthenticate = (password: string) => mode(() => local.reauthenticate(password), () => call(() => post<void>("/me/reauth", { password })));
export const changePassword = (current: string, next: string) => mode(() => local.changePassword(current, next), () => call(() => post<void>("/me/password", { current, next })));
export const regenerateRecoveryCodes = () => mode(() => local.regenerateRecoveryCodes(), () => call(() => post<{ codes: string[] }>("/me/recovery-codes", {})).then((r) => r.codes));
export async function signOut(): Promise<void> {
  await mode(() => undefined, () => call(() => post<void>("/auth/sign-out", {})).catch(() => undefined));
  local.signOut();
}
/** Production: confirms the server session on load (the cookie is HttpOnly, so only the server knows). False means signed out. */
export async function confirmSession(): Promise<boolean> {
  return mode(() => true, async () => {
    try { const r = await apiFetch<{ roleId: string; who: string | null; company?: Company | null; companies?: (Company & { role: string })[] }>("/auth/session"); local.applyServerSession(r.roleId, r.who, r.company ?? null, r.companies ?? []); return true; }
    catch { local.signOut(false); return false; }
  });
}

/** Production: moves this session to another company the person is an active member of. The server checks the membership again and returns the
 *  role there; the page then reloads so nothing from the previous company stays on screen. */
export async function switchCompany(ref: string): Promise<void> {
  const r = await apiFetch<{ roleId: string; company: Company }>("/auth/company", { method: "POST", body: JSON.stringify({ company: ref }) });
  local.applyServerSession(r.roleId, store.get().who, r.company);
}

/** What the account page shows. Production: GET /me/security. */
export interface AccountView {
  email: string; person: string; demo: boolean;
  thisSignIn: { at: number; ip: string; device: string } | null;
  sessions: { id: string; device: string; ip: string; startedAt: number; current: boolean; expiresAt?: number }[];
  notices: { id: string; at: number; text: string }[];
  mfa: { enrolledAt: number; codesLeft: number } | null;
  passkeys: { id: string; label: string; createdAt: number }[];
  passkeyRequired: boolean;
  /** Authenticator apps (at most `authenticatorsMax`). The set-up key is never part of this view. */
  authenticators: { id: string; label: string; addedAt: number }[];
  authenticatorsMax: number;
}
export function accountView(): Promise<AccountView | null> {
  return mode(() => {
    const me = local.currentAccount(); if (!me) return null;
    const a = acct(); const f = a.mfa[me.email];
    return {
      email: me.email, person: me.person, demo: local.isDemoAccount(me.email), thisSignIn: a.last[me.email] || null,
      sessions: activeSessions(me.email).map((x) => ({ id: x.id, device: x.device, ip: x.ip, startedAt: x.startedAt, current: x.id === a.current, expiresAt: x.expiresAt })),
      notices: noticesFor(me.email).slice(0, 20).map((n) => ({ id: n.id, at: n.at, text: n.text })),
      mfa: local.appsOf(f).length ? { enrolledAt: f!.enrolledAt, codesLeft: f!.codes.filter((c) => !c.used).length } : null,
      passkeys: (a.passkeys[me.email] || []).map((k) => ({ id: k.id, label: k.label, createdAt: k.createdAt })), passkeyRequired: local.needsPasskey(store.get().role),
      authenticators: local.appsOf(f).map((x) => ({ id: x.id, label: x.label, addedAt: x.addedAt })), authenticatorsMax: MFA.MAX_APPS,
    };
  }, () => call(() => apiFetch<AccountView>("/me/security")));
}
/** Add a passkey from the account page (password confirmed within 5 minutes). Production: POST /me/passkeys/options then POST /me/passkeys. */
export async function addPasskey(): Promise<void> {
  return mode(async () => { const o = local.startAddPasskey(); local.finishAddPasskey(await createPasskey(o)); }, async () => {
    const o = await call(() => post<{ challenge: string; rpId: string; exclude: string[]; email: string; name: string }>("/me/passkeys/options", {}));
    const reg = await createPasskey(o); await call(() => post<void>("/me/passkeys", reg));
  });
}
export const removePasskey = (id: string) => mode(() => local.removePasskey(id), () => call(() => apiFetch<void>(`/me/passkeys/${encodeURIComponent(id)}`, { method: "DELETE" })));

/* Authenticator apps from Your account. Production: POST /me/authenticators, /me/authenticators/verify, /me/authenticators/:id/remove. Each change
   needs the password again and a code from an app already in use (or, for a lost app, a recovery code). The set-up key comes back once. */
export interface AppSetup { secret: string; uri: string; label: string }
export const startAddAuthenticator = (o: { password: string; code: string; recovery?: boolean; label?: string; replaces?: string }) =>
  mode(() => local.startAddAuthenticator(o), () => post<AppSetup>("/me/authenticators", o));
export const confirmAddAuthenticator = (code: string) =>
  mode(() => local.confirmAddAuthenticator(code), () => post<{ recoveryCodes?: string[] }>("/me/authenticators/verify", { code }));
export const removeAuthenticator = (id: string, password: string, code: string) =>
  mode(() => local.removeAuthenticator(id, password, code), () => post<void>(`/me/authenticators/${encodeURIComponent(id)}/remove`, { password, code }));
