/* Workspace audit log: append-only, hash-chained (tamper-evident demo, NOT a security control). */
import seed from "@/data/wsAuditSeed.json";
import { nowStamp } from "./format";
import { appStore, bumpData } from "./store";
import { API_ON, roleOf } from "./rbac";

export interface WsEntry { seq: number; prev: string; hash: string; at: string; actor: string; action: string; target: string; cat: string }
const ZERO = "0".repeat(8);
export function hashStr(x: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < x.length; i++) { h ^= x.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}
const body = (e: { at: string; actor: string; action: string; target: string; cat: string }, prev: string, seq: number) =>
  [seq, e.at, e.actor, e.action, e.target, e.cat, prev].join("␟");

export const WS_AUDIT: WsEntry[] = [];
(function init() {
  if (API_ON) return; // production: the company's real log comes from the server (services/ws.ts)
  let prev = ZERO;
  (seed as unknown as { at: string; actor: string; action: string; target: string; cat: string }[]).forEach((e, i) => {
    const seq = i + 1;
    const entry = { seq, prev, ...e, hash: hashStr(body(e, prev, seq)) } as WsEntry;
    prev = entry.hash; WS_AUDIT.push(entry);
  });
})();
export const wsLastHash = () => (WS_AUDIT.length ? WS_AUDIT[WS_AUDIT.length - 1].hash : ZERO);
export function verifyWsChain(): boolean {
  let prev = ZERO;
  for (const e of WS_AUDIT) { if (e.prev !== prev || e.hash !== hashStr(body(e, prev, e.seq))) return false; prev = e.hash; }
  return true;
}
/** Current signed-in persona (prototype: ME). */
export function getMe() {
  const { role, who } = appStore.get(); const r = roleOf(role);
  if (API_ON && who) return { name: who, role: r.name, initials: who.split(/\s+/).map((x) => x[0] || "").join("").slice(0, 2).toUpperCase() };
  return { name: r.person, role: r.name, initials: r.initials };
}
/** `actor` overrides the signed-in person, only for events with nobody signed in (a password reset, a request to join). */
export function wsLog(action: string, target: string, cat?: string, actor?: string): WsEntry {
  const prev = wsLastHash(); const seq = WS_AUDIT.length + 1;
  const e = { at: nowStamp(), actor: actor || getMe().name, action, target, cat: cat || "System" };
  const entry = { seq, prev, ...e, hash: hashStr(body(e, prev, seq)) } as WsEntry;
  if (API_ON) return entry; // production: the server writes the company's audit log in the same transaction as the change
  WS_AUDIT.push(entry); bumpData(); return entry;
}
/** Canonical string that is hashed for a workspace entry (exported so the chain view can re-check each link). */
export const wsChainBody = body;
