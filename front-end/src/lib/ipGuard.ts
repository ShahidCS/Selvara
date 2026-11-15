/* Brute-force protection by network address (DEMO ONLY: there is no server, so the "address" is a synthetic documentation-range IP kept per browser).
   Failed sign-ins are counted per address across all accounts. Too many in the window blocks the address; each repeat block within the reset period
   lasts longer: 5 minutes, 30 minutes, 2 hours, then 24 hours, and 24-hour blocks repeat while the abuse goes on. There is no permanent block
   (compliance decision 2026-11, following OWASP: blocks are temporary, a whole office can share one address). Only a platform super admin
   (elevated, with a reason) can lift a block early.
   The real service must enforce this on the server, key it on the real client address (behind trusted proxies only), and consider shared corporate
   addresses (NAT) before blocking hard. See docs/security/SOD_MATRIX.md section 12. */
import { adminLog } from "./adminAudit";
import { randInt } from "./security";
import { bumpData } from "./store";

const MIN = 60_000; const HOUR = 60 * MIN; const DAY = 24 * HOUR;
export const IP_POLICY = {
  /** Failed sign-ins from one address, across every account, that trigger a block. */
  THRESHOLD: 10,
  WINDOW_MS: 15 * MIN,
  /** Block length by level; the last level (24 hours) repeats. No block is permanent. */
  LADDER: [5 * MIN, 30 * MIN, 2 * HOUR, DAY] as const,
  /** Without a new block for this long, the next block starts again at the first level. */
  RESET_MS: 30 * DAY,
  /** Requests to join from one address per window. */
  JOIN_MAX: 3,
  JOIN_WINDOW_MS: HOUR,
};
export const LEVEL_LABEL = ["5 minutes", "30 minutes", "2 hours", "24 hours"];

export interface IpRecord {
  ip: string; fails: number[]; joins: number[];
  /** Other rate-limited actions (password reset requests) by key. */
  acts?: Record<string, number[]>;
  /** Level of the current or last block (1-based; 0 = never blocked). */
  level: number;
  /** End of the current block (ms); 0 when not blocked. */
  until: number;
  lastBlockAt: number; blocks: number;
  liftedBy?: string; liftedAt?: number;
}
const KEY = "selvara.demo.ipGuard"; const IP_KEY = "selvara.demo.clientIp";
/** Synthetic addresses already blocked, so the console has something to review (TEST-NET-3, never real). */
const SEED: IpRecord[] = [
  { ip: "203.0.113.24", fails: [], joins: [], level: 4, until: Date.now() + 9 * HOUR, lastBlockAt: Date.now() - 15 * HOUR, blocks: 6 },
  { ip: "203.0.113.77", fails: [], joins: [], level: 4, until: Date.now() + 20 * HOUR, lastBlockAt: Date.now() - 4 * HOUR, blocks: 4 },
];
let RECS: IpRecord[] | null = null;
const ser = (r: IpRecord) => r;
function load(): IpRecord[] {
  if (RECS) return RECS;
  RECS = SEED.map((r) => ({ ...r }));
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : null;
    if (Array.isArray(list)) RECS = list.filter((r) => r && typeof r.ip === "string").slice(0, 500).map((r) => ({ ...r, level: Math.min(Number(r.level) || 0, IP_POLICY.LADDER.length), until: r.until === "permanent" ? (Number(r.lastBlockAt) || Date.now()) + DAY : Number(r.until) || 0, /* a permanent block stored before the cap becomes 24 hours */ fails: Array.isArray(r.fails) ? r.fails : [], joins: Array.isArray(r.joins) ? r.joins : [] }));
  } catch { /* unreadable: seeds only */ }
  return RECS;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(load().map(ser))); } catch { /* memory only */ } bumpData(); }
/** Test helper. */
export function resetIpGuard(seeds = true) { RECS = seeds ? SEED.map((r) => ({ ...r })) : []; try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

/** This browser's synthetic address (198.51.100.0/24, documentation range). */
export function clientIp(): string {
  try {
    const v = localStorage.getItem(IP_KEY);
    if (v && /^198\.51\.100\.\d{1,3}$/.test(v)) return v;
    const ip = "198.51.100." + (2 + randInt(250)); localStorage.setItem(IP_KEY, ip); return ip;
  } catch { return "198.51.100.1"; }
}
const rec = (ip: string, create = false): IpRecord | undefined => {
  let r = load().find((x) => x.ip === ip);
  if (!r && create) { r = { ip, fails: [], joins: [], level: 0, until: 0, lastBlockAt: 0, blocks: 0 }; load().push(r); }
  return r;
};
export const ipRecords = (): IpRecord[] => load();
export const isBlocked = (r: IpRecord, now = Date.now()) => r.until > now;
/** Null when the address may try; otherwise the message to show. Same wording for every account. */
export function ipBlockMessage(ip: string, now = Date.now()): string | null {
  if (isTrusted(ip)) return null;
  const r = rec(ip); if (!r || !isBlocked(r, now)) return null;
  return `Too many failed sign-in attempts from your network. Try again after ${new Date(r.until).toISOString().slice(11, 16)} UTC.`;
}
/** Counts a failed sign-in; blocks the address at the threshold, one level longer than its last block within the reset period. */
export function recordIpFailure(ip: string, now = Date.now()): IpRecord {
  const r = rec(ip, true) as IpRecord;
  r.fails = r.fails.filter((t) => now - t < IP_POLICY.WINDOW_MS); r.fails.push(now);
  if (r.fails.length >= thresholdFor(ip) && !isTrusted(ip)) { // a trusted office network is never blocked; accounts still lock and MFA still applies
    const next = r.lastBlockAt && now - r.lastBlockAt < IP_POLICY.RESET_MS ? Math.min(r.level + 1, IP_POLICY.LADDER.length) : 1;
    r.level = next; r.until = now + IP_POLICY.LADDER[next - 1]; r.lastBlockAt = now; r.blocks += 1; r.fails = [];
    adminLog("auth.ip.blocked", ip, { actor: "Sign-in protection", role: "System", after: LEVEL_LABEL[next - 1], categories: ["Security"] });
  }
  save(); return r;
}
export function recordIpSuccess(ip: string) { const r = rec(ip); if (r && r.fails.length) { r.fails = []; save(); } }
/** Requests to join from one address are limited; returns false when over the limit. */
export function allowJoin(ip: string, now = Date.now()): boolean {
  const r = rec(ip, true) as IpRecord;
  r.joins = r.joins.filter((t) => now - t < IP_POLICY.JOIN_WINDOW_MS);
  if (r.joins.length >= IP_POLICY.JOIN_MAX) { save(); return false; }
  r.joins.push(now); save(); return true;
}
/** Generic per-address rate limit for an action (for example "reset"); returns false when over the limit. */
export function allowAction(ip: string, key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const r = rec(ip, true) as IpRecord; r.acts = r.acts || {};
  const list = (r.acts[key] || []).filter((t) => now - t < windowMs);
  if (list.length >= max) { r.acts[key] = list; save(); return false; }
  list.push(now); r.acts[key] = list; save(); return true;
}
/** Failed sign-ins from this address inside the current window. */
export const recentFailures = (ip: string, now = Date.now()) => (rec(ip)?.fails || []).filter((t) => now - t < IP_POLICY.WINDOW_MS).length;

/* ---------- address reputation (synthetic) ---------- */
/** Ranges classed as hosting, VPN or proxy networks. In production this comes from an IP intelligence feed on the server. All ranges are documentation ranges. */
export const REPUTATION: { prefix: string; label: string }[] = [
  { prefix: "192.0.2.", label: "Hosting provider (synthetic range 192.0.2.0/24)" },
  { prefix: "198.18.", label: "Anonymising VPN or proxy (synthetic range 198.18.0.0/15)" },
];
export const reputationOf = (ip: string) => REPUTATION.find((r) => ip.startsWith(r.prefix)) || null;
/** Hosting, VPN and proxy addresses are blocked after half as many failures and always get the challenge step. */
export const thresholdFor = (ip: string) => (reputationOf(ip) ? Math.ceil(IP_POLICY.THRESHOLD / 2) : IP_POLICY.THRESHOLD);

/* ---------- trusted office networks (company allowlist) ---------- */
export interface TrustedNet { id: string; net: string; label: string; requestedBy: string; approvedBy?: string; status: "Pending" | "Active" | "Removed"; approvalId?: string }
const NET_KEY = "selvara.demo.trustedNets";
let NETS: TrustedNet[] | null = null;
export function trustedNets(): TrustedNet[] {
  if (NETS) return NETS;
  NETS = [];
  try { const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(NET_KEY); const l = raw ? JSON.parse(raw) : []; if (Array.isArray(l)) NETS = l.filter((n) => n && typeof n.net === "string").slice(0, 100); } catch { /* none */ }
  return NETS;
}
export function saveTrustedNets() { try { localStorage.setItem(NET_KEY, JSON.stringify(trustedNets())); } catch { /* memory only */ } bumpData(); }
export function resetTrustedNets() { NETS = []; try { localStorage.removeItem(NET_KEY); } catch { /* ignore */ } }
/** "198.51.100.7" or "198.51.100.0/24" (only exact addresses and /24 networks, to keep an entry from covering more than one office). */
export const NET_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(\/24)?$/;
export function validNet(v: string): boolean { const m = NET_RE.exec(v.trim()); return !!m && [1, 2, 3, 4].every((i) => Number(m[i]) <= 255) && (!m[5] || m[4] === "0"); }
export function isTrusted(ip: string): boolean {
  return trustedNets().some((n) => n.status === "Active" && (n.net.endsWith("/24") ? ip.startsWith(n.net.slice(0, n.net.lastIndexOf(".") + 1)) : n.net === ip));
}
/** Lifting a block (service layer checks who may). Resets the level: the next block starts again at 5 minutes. */
export function liftBlock(ip: string, by: string): IpRecord | null {
  const r = rec(ip); if (!r || !isBlocked(r)) return null;
  r.until = 0; r.level = 0; r.fails = []; r.liftedBy = by; r.liftedAt = Date.now(); save(); return r;
}
