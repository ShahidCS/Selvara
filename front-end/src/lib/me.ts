/* Member workspace (/ws/me) state. Demo only: per-user acknowledgements live in memory (never localStorage: no record data in client storage).
 * A real API owns acknowledgements (see docs/guides/checklist/me.md "Security notes"). */
import seed from "@/data/meSeed.json";
import { DATA } from "@/lib/data";
import { randInt } from "@/lib/security";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Ack { at: string; ver: string }
export type MeTask = { id: string; kind: "Review" | "Acknowledge" | "Training" | "Reply"; title: string; policyId?: string; detail: string; due: string; late: boolean; ack?: string; btn: string; doneMsg: string };
export interface MeRemark { id: string; policy: string; section: string; text: string; due: string; status: string }

/** user (persona name) -> policyId -> acknowledgement. Per-user, so one person's acknowledgement never counts for another. */
const ACKS: Record<string, Record<string, Ack>> = JSON.parse(JSON.stringify(seed.acks));
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDay = (d = new Date()) => `${String(d.getDate()).padStart(2, "0")} ${MON[d.getMonth()]} ${d.getFullYear()}`;

/** Published = approved and Active. Read-only view of the policy register. */
export const publishedPolicies = () => DATA.policies.filter((p: any) => p.status === "Active");
export const approvedOn = (id: string): string => (seed.approved as Record<string, string>)[id] || "Not recorded";
/** An acknowledgement only counts for the version that was acknowledged; a new approved version needs a fresh acknowledgement. */
export function ackOf(user: string, policyId: string): Ack | null {
  const a = ACKS[user]?.[policyId];
  const p = DATA.policies.find((x: any) => x.id === policyId);
  return a && p && a.ver === p.ver ? a : null;
}
export function recordAck(user: string, policyId: string): Ack | null {
  const p = publishedPolicies().find((x: any) => x.id === policyId); // only published policies can be acknowledged
  if (!p) return null;
  const a = { at: fmtDay(), ver: String(p.ver) };
  (ACKS[user] ||= {})[policyId] = a;
  return a;
}
export const toAcknowledge = (user: string) => publishedPolicies().filter((p: any) => !ackOf(user, p.id)).length;

export function tasksFor(roleId: string): MeTask[] {
  const all = seed.tasks as Record<string, MeTask[]>;
  return (all[roleId] || []).map((t) => {
    const p = t.policyId ? DATA.policies.find((x: any) => x.id === t.policyId) : null;
    return p && t.kind !== "Review" ? { ...t, title: p.name } : t; // seeded titles are kept; ack titles follow the register name
  });
}
export const remarksFor = (roleId: string): MeRemark[] => ((seed.remarks as Record<string, MeRemark[]>)[roleId] || []);

export const SECURITY = seed.security;
export const SESSIONS = seed.sessions;

/** Recovery codes: 10 x XXXX-XXXX from a 32-character unambiguous alphabet, crypto.getRandomValues only. SYNTHETIC in this demo:
 *  never stored, logged or sent anywhere; the caller shows them once. A real API generates, hashes (Argon2id/bcrypt) and stores them server-side. */
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateRecoveryCodes(n = 10): string[] {
  const seg = () => Array.from({ length: 4 }, () => ALPHA[randInt(ALPHA.length)]).join("");
  return Array.from({ length: n }, () => `${seg()}-${seg()}`);
}
