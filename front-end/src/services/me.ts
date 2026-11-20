/* Member workspace API stubs. Mock mode mutates in-memory demo state; the caller does wsLog/toast/bumpData.
 * A real API must: bind acknowledgement to the authenticated user, policy id + exact version and a server timestamp (non-repudiation);
 * generate and hash recovery codes server-side and return the plaintext once; revoke sessions server-side (refresh/session tokens). */
import { recordAck, generateRecoveryCodes, type Ack } from "@/lib/me";
import { apiFetch, viaApi } from "./http";
import { wsPost } from "./ws";
import { hasRecentAuth } from "@/lib/accountSecurity";
import { signOutOtherSessions } from "@/lib/session";
import { SodError } from "@/lib/sod";

const send = <T,>(method: string, path: string, body?: unknown) => apiFetch<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export function acknowledge(user: string, policyId: string): Promise<Ack | null> {
  return viaApi(() => recordAck(user, policyId), () => wsPost<Ack>("/ws/me/acknowledgements", { policyId }));
}
/** Ends every other session of the signed-in person (safe direction, no re-authentication). Returns how many ended. */
export function signOutOthers(): Promise<number> {
  return viaApi(() => signOutOtherSessions(), () => send<number>("POST", "/me/sessions/revoke-others"));
}
/** Returns the new plaintext codes ONCE. Callers must not store, log or persist them. */
export function regenerateCodes(): Promise<string[]> {
  return viaApi(() => { if (!hasRecentAuth()) throw new SodError("Confirm your password first."); return generateRecoveryCodes(10); }, () => send<{ codes: string[] }>("POST", "/me/recovery-codes").then((r) => r.codes));
}
