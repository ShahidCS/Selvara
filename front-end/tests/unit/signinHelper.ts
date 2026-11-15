import { vi } from "vitest";
import { issueChallenge, solveChallenge } from "@/lib/accountSecurity";
import { ChallengeRequired, completeSignIn, joinRequests, requestToJoin, signIn, signOut, type SignInResult, type SignInStep } from "@/lib/session";
import { appStore } from "@/lib/store";
import { decideJoin } from "@/services/joinRequests";
import { stepAt, totpAt, TOTP } from "@/lib/totp";

/** Authenticator secrets of the real accounts a test created (what the person's app would hold), and the last step each used. */
export const SECRETS = new Map<string, string>();
const used = new Map<string, number>();
/** The code an authenticator would show now, moved to the next step if this one was already used (codes are single use). */
export async function codeFor(email: string): Promise<string> {
  const secret = SECRETS.get(email); if (!secret) throw new Error("no secret for " + email);
  const last = used.get(email) ?? -1;
  // a person waits for the next code; the test moves the clock to the next 30-second step instead
  if (stepAt(Date.now()) <= last) { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime((last + 1) * TOTP.STEP_S * 1000 + 1_000); }
  const now = Date.now(); used.set(email, stepAt(now)); return totpAt(secret, now);
}
export function forgetSecrets() { SECRETS.clear(); used.clear(); vi.useRealTimers(); }

/** Step one the way the login page does it: when the challenge is asked for, solve it and try once more. */
export async function firstStep(email: string, password: string): Promise<SignInStep> {
  try { return await signIn(email, password); }
  catch (e) {
    if (!(e instanceof ChallengeRequired)) throw e;
    const c = issueChallenge();
    return signIn(email, password, { seed: c.seed, nonce: await solveChallenge(c.seed, c.digits) });
  }
}
/** Full sign-in: step one, then the second step (the demo code, the authenticator code, or adding an authenticator first). */
export async function attempt(email: string, password: string): Promise<SignInResult> {
  const st = await firstStep(email, password);
  const e = email.trim().toLowerCase();
  if (st.step === "enroll") { SECRETS.set(e, st.secret); return completeSignIn(st.ticket, await codeFor(e)); }
  if (st.method === "demo") return completeSignIn(st.ticket, st.demoCode);
  return completeSignIn(st.ticket, await codeFor(e));
}
/** A real account: asks to join, is approved by a company admin, and adds an authenticator at the first sign-in (then signs out). */
export async function realAccount(name: string, email: string, password: string): Promise<SignInResult> {
  await requestToJoin({ name, email, password });
  const id = joinRequests().find((m) => m.email === email.toLowerCase() && m.status === "Pending")!.id;
  appStore.set({ role: "admin" }); await decideJoin(id, "approve", "Joined the team this week");
  signOut(false);
  const r = await attempt(email, password); signOut(false); return r;
}
