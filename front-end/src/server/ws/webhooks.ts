/* Server-only. Outgoing webhooks (production programme group 6): signed deliveries of company events to the endpoints a company's admins
   registered and a second admin approved. Defences against server-side request forgery: https only (isSafeWebhookUrl), the host is resolved and
   every address it resolves to must be public; the connection is pinned to that checked address (no second lookup, so no DNS rebinding);
   redirects are never followed; a short timeout. Each delivery is signed with the endpoint's own secret (HMAC-SHA256 over "<timestamp>.<body>"),
   which is stored encrypted (AES-256-GCM, key derived from SERVER_SECRET) and shown once to the admin who asked for the endpoint.
   Events come from the company's own audit entries after the change committed; a failing endpoint never fails the change. */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { isSafeWebhookUrl } from "@/lib/security";
import type { Deps } from "../types";
import { onCommitted } from "./common";
import type { Actor, WsTx } from "./store";

/** Events a webhook can subscribe to, and the audit entries that raise them. */
export const WEBHOOK_EVENTS = ["control.failed", "audit.completed", "risk.updated", "evidence.updated", "policy.published", "access.revoked", "issue.created"];
export function eventOf(action: string, target: string): string | null {
  if ((action === "control.status.changed" || action === "test.result.recorded") && /fail/i.test(target)) return "control.failed";
  if (action === "audit.stage.advanced" && /complete/i.test(target)) return "audit.completed";
  if (/^risk\.(created|scored|approved|accepted|closed|reopened)$/.test(action)) return "risk.updated";
  if (/^evidence\.(created|updated|version\.created)$/.test(action)) return "evidence.updated";
  if (action === "policy.published" || action === "policy.emergency.published") return "policy.published";
  if (action === "access.revoked") return "access.revoked";
  if (action === "issue.created") return "issue.created";
  return null;
}
export interface Webhook { id: string; url: string; events: string[]; status: "Active" | "Paused"; approved: boolean; createdBy: string; createdById: string; secret?: string; secretShownAt?: number; approvedAt?: number; lastDelivery: string; failures: number }
export interface HookTarget { url: URL; address: string; family: 4 | 6 }
export interface HookResult { status: number; ms: number; error?: string }
export interface HookSender { resolve(url: string): Promise<HookTarget>; post(t: HookTarget, body: string, headers: Record<string, string>): Promise<HookResult> }

/* ---- secrets at rest ---- */
const keyOf = (secret: string) => createHash("sha256").update(`selvara-webhook-secret|${secret}`).digest();
export function seal(secret: string, plain: string) {
  const iv = randomBytes(12); const c = createCipheriv("aes-256-gcm", keyOf(secret), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${enc.toString("base64url")}`;
}
export function unseal(secret: string, sealed: string) {
  const [iv, tag, enc] = sealed.split("."); const d = createDecipheriv("aes-256-gcm", keyOf(secret), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url")); return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
}
export const signatureOf = (secret: string, ts: string, body: string) => `v1=${createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex")}`;

/* ---- addresses ---- */
/** Whether an address is private, loopback, link-local, shared, documentation, multicast or reserved (never a delivery target). */
export function privateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51) || (a === 203 && b === 0);
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s); if (mapped) return privateAddress(mapped[1]);
    return s === "::" || s === "::1" || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || /^ff/.test(s) || s.startsWith("2001:db8") || s.startsWith("64:ff9b") || s.startsWith("::ffff:") || s.startsWith("100:");
  }
  return true;
}
/** Production sender: resolve, check every address, pin the connection to the checked one, never follow redirects. */
export const httpsHookSender: HookSender = {
  async resolve(raw) {
    if (!isSafeWebhookUrl(raw)) throw new Error("A valid https URL is required.");
    const url = new URL(raw); const host = url.hostname.replace(/\.$/, "");
    let addrs: { address: string; family: number }[];
    try { addrs = await lookup(host, { all: true, verbatim: true }); } catch { throw new Error("The endpoint's host name does not resolve."); }
    if (!addrs.length || addrs.some((a) => privateAddress(a.address))) throw new Error("The endpoint resolves to a private or reserved address.");
    return { url, address: addrs[0].address, family: addrs[0].family === 6 ? 6 : 4 };
  },
  post(t, body, headers) {
    const start = Date.now();
    return new Promise((resolve) => {
      const req = request({
        host: t.address, family: t.family, servername: t.url.hostname, port: Number(t.url.port) || 443, path: `${t.url.pathname}${t.url.search}`, method: "POST", timeout: 4000,
        headers: { ...headers, host: t.url.host, "content-length": Buffer.byteLength(body) },
      }, (res) => { res.resume(); res.on("end", () => resolve({ status: res.statusCode ?? 0, ms: Date.now() - start })); });
      req.on("timeout", () => req.destroy(new Error("timed out")));
      req.on("error", (e) => resolve({ status: 0, ms: Date.now() - start, error: /timed out/.test(e.message) ? "Timed out" : "Could not connect" }));
      req.end(body);
    });
  },
};

const stamp = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";
interface Prepared { id: string; hookId: string; url: string; event: string; body: string; headers: Record<string, string> }
/** Builds and signs one delivery (inside a unit of work); nothing is sent yet. */
async function prepare(d: Deps, t: WsTx, hookId: string, event: string, data: Record<string, unknown>): Promise<Prepared | null> {
  const w = (await t.get<Webhook>("webhook", hookId))?.data; if (!w?.secret || !w.approved) return null;
  const id = `DLV-${await t.next("webhook-delivery", 0)}`; const ts = String(Math.floor(t.now / 1000));
  const body = JSON.stringify({ id, event, occurredAt: new Date(t.now).toISOString(), data });
  return { id, hookId, url: w.url, event, body, headers: { "content-type": "application/json", "user-agent": "Selvara-Webhooks/1", "x-selvara-event": event, "x-selvara-delivery": id, "x-selvara-timestamp": ts, "x-selvara-signature": signatureOf(unseal(d.secret, w.secret), ts, body) } };
}
/** Sends it (outside any database transaction): one retry on a network error or a 5xx. */
async function send(d: Deps, p: Prepared): Promise<HookResult> {
  const sender = d.hooks ?? httpsHookSender;
  try {
    const target = await sender.resolve(p.url);
    const out = await sender.post(target, p.body, p.headers);
    return out.status === 0 || out.status >= 500 ? await sender.post(target, p.body, p.headers) : out;
  } catch (e) { return { status: 0, ms: 0, error: e instanceof Error ? e.message.slice(0, 120) : "Could not deliver" }; }
}
const delivered = (r: HookResult) => r.status >= 200 && r.status < 300;
/** Records the delivery and the endpoint's last result. */
async function record(t: WsTx, p: Prepared, out: HookResult) {
  await t.insert("webhook-delivery", p.id, { id: p.id, hookId: p.hookId, event: p.event, at: t.now, status: out.status, ms: out.ms, error: out.error ?? (delivered(out) ? "" : `HTTP ${out.status}`) });
  const rec = await t.get<Webhook>("webhook", p.hookId); if (!rec) return;
  const w = rec.data; w.lastDelivery = `${delivered(out) ? out.status : out.error ?? `HTTP ${out.status}`} · ${stamp(t.now)}`; w.failures = delivered(out) ? 0 : (w.failures ?? 0) + 1;
  await t.update("webhook", rec.id, w, rec.version);
  if (!delivered(out)) { const u = new URL(w.url); await t.audit("webhook.delivery_failed", `${u.origin}${u.pathname} ${p.event} (${p.id}): ${out.error ?? `HTTP ${out.status}`}`, "System", true); }
}
const quiet = (a: Actor): Actor => ({ ...a, committed: undefined });
/** One delivery to one endpoint: prepared, sent and recorded. */
export async function deliverOne(d: Deps, actor: Actor, hookId: string, event: string, data: Record<string, unknown>): Promise<HookResult> {
  const p = await d.ws.tx(quiet(actor), d.now(), (t) => prepare(d, t, hookId, event, data));
  if (!p) return { status: 0, ms: 0, error: "Not approved" };
  const out = await send(d, p);
  await d.ws.tx(quiet(actor), d.now(), (t) => record(t, p, out));
  return out;
}
/** After a change committed: each event it raised goes to every active, approved endpoint that subscribed to it (at most 5 events and 5 endpoints). */
async function emit(d: Deps, actor: Actor) {
  const events = (actor.committed ?? []).map((x) => ({ ev: eventOf(x.action, x.target), ...x })).filter((x) => x.ev).slice(0, 5); actor.committed = [];
  if (!events.length) return;
  const preps = await d.ws.tx(quiet(actor), d.now(), async (t) => {
    const hooks = (await t.list<Webhook>("webhook")).filter((x) => x.data.approved && x.data.status === "Active");
    const out: Prepared[] = [];
    for (const e of events) for (const h of hooks.filter((x) => x.data.events.includes(e.ev!)).slice(0, 5)) { const p = await prepare(d, t, h.id, e.ev!, { action: e.action, summary: e.target.slice(0, 500) }); if (p) out.push(p); }
    return out;
  });
  if (!preps.length) return;
  const results = await Promise.all(preps.map((p) => send(d, p)));
  await d.ws.tx(quiet(actor), d.now(), async (t) => { for (let i = 0; i < preps.length; i++) await record(t, preps[i], results[i]); });
}
onCommitted(emit);
