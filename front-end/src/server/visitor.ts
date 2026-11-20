/* Server-only. Verified visitors (production programme group 8b): people without a Selvara account who prove an email address with a
   one-time code, for the standalone vendor portal and the public Trust Center. Both need email: without it they say so and do nothing.
   - A code is 6 digits, works once, for 10 minutes, at most 5 tries; only its hash is kept. At most 5 codes an hour per address and 30 an hour
     per network address; the answer is the same whether or not a code was sent (no address enumeration).
   - A verified visitor gets a session of their own (cookie `__Host-vv`, HttpOnly, Secure, SameSite=Strict) bound to one company, one purpose
     and one subject: 15 minutes idle, 8 hours at most, ended by signing out. It is never a member session and opens nothing else. */
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { Req, Res } from "./core";
import { sendMail } from "./mail";
import type { Deps } from "./types";

export const VCOOKIE = "__Host-vv";
export type Purpose = "vendor-portal" | "trust";
export interface Visitor { tenantId: string; purpose: Purpose; subject: string; email: string; created: number; last: number }
const CODE_MS = 10 * 60_000; const IDLE_MS = 15 * 60_000; const MAX_MS = 8 * 3600_000; const HOUR = 3600_000;
const h = (v: string) => createHash("sha256").update(v).digest("hex");
const codeKey = (v: Omit<Visitor, "created" | "last">) => h(`${v.purpose}|${v.tenantId}|${v.subject}|${v.email}`).slice(0, 40);

async function under(d: Deps, bucket: string, key: string, max: number): Promise<boolean> {
  const now = d.now(); const list = ((await d.store.kvGet<number[]>(bucket, key)) ?? []).filter((t) => now - t < HOUR);
  if (list.length >= max) return false;
  await d.store.kvSet(bucket, key, [...list, now], HOUR); return true;
}
/** Sends a code to `email` for this purpose and subject. Returns false only when the limits refused it (the caller says "wait"). */
export async function sendCode(d: Deps, r: Req, v: Omit<Visitor, "created" | "last">, purposeText: string): Promise<boolean> {
  if (!(await under(d, "vcode-ip", h(r.ip).slice(0, 32), 30)) || !(await under(d, "vcode-to", h(v.email).slice(0, 32), 5))) return false;
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await d.store.kvSet("vcode", codeKey(v), { hash: h(code), exp: d.now() + CODE_MS, tries: 0 }, CODE_MS);
  await sendMail(d, v.email, { t: "code", code, purpose: purposeText }, { tenantId: v.tenantId, actor: "Visitor", ip: r.ip });
  return true;
}
/** Checks a code; on success the visitor's session cookie. A wrong code counts; the fifth ends the code. */
export async function checkCode(d: Deps, v: Omit<Visitor, "created" | "last">, code: string): Promise<{ ok: true; cookie: string } | { ok: false; error: string }> {
  const k = codeKey(v); const rec = await d.store.kvGet<{ hash: string; exp: number; tries: number }>("vcode", k);
  if (!rec || rec.exp < d.now() || rec.tries >= 5) return { ok: false, error: "That code has expired. Ask for a new one." };
  const a = Buffer.from(h(String(code).replace(/\D/g, "").slice(0, 6))); const b = Buffer.from(rec.hash);
  if (!timingSafeEqual(a, b)) {
    rec.tries++; await d.store.kvSet("vcode", k, rec, Math.max(1000, rec.exp - d.now()));
    return { ok: false, error: rec.tries >= 5 ? "Too many wrong codes. Ask for a new one." : "That code did not work." };
  }
  await d.store.kvDel("vcode", k);
  const token = randomBytes(32).toString("base64url"); const now = d.now();
  await d.store.kvSet("vsess", h(token), { ...v, created: now, last: now } satisfies Visitor, MAX_MS);
  return { ok: true, cookie: `${VCOOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${MAX_MS / 1000}` };
}
/** The visitor of this request for `purpose`, or null (none, expired, idle, or for something else). Each use renews the idle time. */
export async function visitorOf(d: Deps, r: Req, purpose: Purpose): Promise<Visitor | null> {
  const token = r.cookies[VCOOKIE]; if (!token || token.length > 100) return null;
  const k = h(token); const v = await d.store.kvGet<Visitor>("vsess", k); const now = d.now();
  if (!v || v.purpose !== purpose || now - v.last > IDLE_MS || now - v.created > MAX_MS) return null;
  v.last = now; await d.store.kvSet("vsess", k, v, Math.max(1000, v.created + MAX_MS - now));
  return v;
}
export async function endVisitor(d: Deps, r: Req): Promise<Res> {
  const token = r.cookies[VCOOKIE]; if (token && token.length <= 100) await d.store.kvDel("vsess", h(token));
  return { status: 204, cookies: [`${VCOOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`] };
}
/** Personal and disposable mail domains are refused where a work address is needed (vendor contacts, Trust Center requests). */
const PERSONAL = /^(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|aol|icloud|me|mac|proton|protonmail|pm|gmx|mail|yandex|zoho|qq|163|126|hey|fastmail|tutanota)\.[a-z.]+$/;
const DISPOSABLE = /(mailinator|guerrillamail|10minutemail|tempmail|temp-mail|trashmail|yopmail|sharklasers|throwaway|discard)/;
export function workEmailBlock(email: string): string | null {
  const dom = email.split("@")[1] ?? "";
  if (DISPOSABLE.test(dom)) return "Temporary email addresses cannot be used.";
  if (PERSONAL.test(dom)) return "Personal email addresses cannot be used. Use your company email.";
  return null;
}
