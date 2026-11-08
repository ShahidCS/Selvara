/* Member workspace API stubs. Mock mode mutates in-memory demo state; the caller does wsLog/toast/bumpData.
 * A real API must: bind acknowledgement to the authenticated user, policy id + exact version and a server timestamp (non-repudiation);
 * generate and hash recovery codes server-side and return the plaintext once; revoke sessions server-side (refresh/session tokens). */
import { recordAck, generateRecoveryCodes, type Ack } from "@/lib/me";
import { apiFetch, viaApi } from "./http";

const send = <T,>(method: string, path: string, body?: unknown) => apiFetch<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export function acknowledge(user: string, policyId: string): Promise<Ack | null> {
  return viaApi(() => recordAck(user, policyId), () => send<Ack>("POST", `/me/acknowledgements`, { policyId }));
}
export function signOutOthers(): Promise<void> {
  return viaApi(() => undefined, () => send<void>("POST", "/me/sessions/revoke-others"));
}
/** Returns the new plaintext codes ONCE. Callers must not store, log or persist them. */
export function regenerateCodes(): Promise<string[]> {
  return viaApi(() => generateRecoveryCodes(10), () => send<{ codes: string[] }>("POST", "/me/recovery-codes").then((r) => r.codes));
}
