/* My Work (/ws/work: greeting, Policies and Account security tabs) state. Demo only: per-user acknowledgements live in memory (never localStorage: no record data in client storage).
 * A real API owns acknowledgements (see docs/guides/checklist/me.md "Security notes"). */
import seed from "@/data/meSeed.json";
import { DATA } from "@/lib/data";
import { randInt } from "@/lib/security";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Ack { at: string; ver: string }
export type MeTask = { id: string; kind: "Review" | "Acknowledge" | "Training" | "Reply"; title: string; policyId?: string; detail: string; due: string; late: boolean; ack?: string; btn: string; doneMsg: string };
export interface MeRemark { id: string; policy: string; section: string; text: string; due: string; status: string }

/** user (persona name) -> policyId -> acknowledgement. Per-user, so one person's acknowledgement never counts for another. */
const PRODUCTION = (process.env.NEXT_PUBLIC_API_MODE || "mock") === "http";
const ACKS: Record<string, Record<string, Ack>> = PRODUCTION ? {} : JSON.parse(JSON.stringify(seed.acks));
/** Production: the signed-in person's acknowledgements, from the server (services/ws.ts). */
export function setAcks(user: string, acks: Record<string, Ack>) { for (const k of Object.keys(ACKS)) delete ACKS[k]; ACKS[user] = { ...acks }; }
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDay = (d = new Date()) => `${String(d.getDate()).padStart(2, "0")} ${MON[d.getMonth()]} ${d.getFullYear()}`;

/** Published = approved and Active. Read-only view of the policy register. */
export const publishedPolicies = () => DATA.policies.filter((p: any) => p.status === "Active");
export const approvedOn = (id: string): string => {
  if (PRODUCTION) { const p: any = DATA.policies.find((x: any) => x.id === id); const live = p?.versions?.find((v: any) => v.status === "Published"); return live?.approvedAt || live?.publishedAt || p?.approvedAt || "Not recorded"; }
  return (seed.approved as Record<string, string>)[id] || "Not recorded";
};
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

let serverTasks: MeTask[] = [];
/** Production: the person's real tasks from the server (policies to acknowledge, approve or publish). */
export function setTasks(t: { id: string; title: string; policyId: string; kind: string }[]) {
  serverTasks = t.map((x) => ({ id: x.id, kind: x.kind === "ack" ? "Acknowledge" : "Review", title: x.title, policyId: x.policyId, detail: x.kind === "ack" ? "Read the published policy and acknowledge it." : x.kind === "approve" ? "You are the named approver." : "Approved and ready to publish.",
    due: "", late: false, ack: x.kind === "ack" ? x.policyId : undefined, btn: x.kind === "ack" ? "Acknowledge" : "Open", doneMsg: "" }));
}
export function tasksFor(roleId: string): MeTask[] {
  if (PRODUCTION) return serverTasks;
  const all = seed.tasks as Record<string, MeTask[]>;
  return (all[roleId] || []).map((t) => {
    const p = t.policyId ? DATA.policies.find((x: any) => x.id === t.policyId) : null;
    return p && t.kind !== "Review" ? { ...t, title: p.name } : t; // seeded titles are kept; ack titles follow the register name
  });
}
export const remarksFor = (roleId: string): MeRemark[] => (PRODUCTION ? [] : (seed.remarks as Record<string, MeRemark[]>)[roleId] || []);

export const SECURITY = seed.security;
export const SESSIONS = seed.sessions;

/** Recovery codes: 10 x XXXX-XXXX from a 32-character unambiguous alphabet, crypto.getRandomValues only. SYNTHETIC in this demo:
 *  never stored, logged or sent anywhere; the caller shows them once. A real API generates, hashes (Argon2id/bcrypt) and stores them server-side. */
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateRecoveryCodes(n = 10): string[] {
  const seg = () => Array.from({ length: 4 }, () => ALPHA[randInt(ALPHA.length)]).join("");
  return Array.from({ length: n }, () => `${seg()}-${seg()}`);
}
