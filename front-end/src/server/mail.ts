/* Server-only. Email delivery (production programme group 8b). Owner decision: built, but off until the owner configures an email service;
   until then nothing is sent and every screen that would send says so (links are shown to the person who created them, as before).
   - An HTTPS email API (Resend or Postmark), called with plain fetch like the other providers: no mail library (dependencies are managed by
     Dependabot). Set MAIL_PROVIDER, MAIL_API_KEY and MAIL_FROM (an address on a domain with SPF, DKIM and DMARC) in Vercel.
   - Messages carry a title, a short sentence and a link, never record detail beyond that (SOD_MATRIX section 10) and never a secret other
     than a one-time code sent to its own owner.
   - At most 10 messages an hour to one address. A failure never blocks the change that asked for the message: it is recorded and the screen
     falls back to showing the link.
   - The audit log records the template and a masked address, never the message. */
import { createHash } from "node:crypto";
import { httpsNet, type Net } from "./integrations/net";
import type { Deps } from "./types";

export interface MailMessage { to: string; subject: string; text: string; html: string; /** e.g. List-Unsubscribe for update emails */ headers?: Record<string, string> }
export interface Mailer { provider: "resend" | "postmark"; from: string; send(m: MailMessage): Promise<void> }

const EMAIL_RE = /^[^\s@<>"']{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
export const isMailable = (to: string) => EMAIL_RE.test(to) && to.length <= 254;

export function mailerFromEnv(e: Record<string, string | undefined>, net: Net = httpsNet): Mailer | undefined {
  const provider = (e.MAIL_PROVIDER || "").toLowerCase(); const key = e.MAIL_API_KEY || ""; const from = e.MAIL_FROM || "";
  if (!key || !from || (provider !== "resend" && provider !== "postmark") || !/^[^<>]{0,80}<?[^\s@<>]+@[^\s@<>]+>?$/.test(from)) return undefined;
  const fail = (status: number) => { throw new Error(`mail provider answered ${status}`); };
  if (provider === "resend") return { provider, from, async send(m) {
    const r = await net("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text, html: m.html, ...(m.headers ? { headers: m.headers } : {}) }) });
    if (r.status !== 200 && r.status !== 202) fail(r.status);
  } };
  return { provider: "postmark", from, async send(m) {
    const r = await net("https://api.postmarkapp.com/email", { method: "POST", headers: { "x-postmark-server-token": key, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ From: from, To: m.to, Subject: m.subject, TextBody: m.text, HtmlBody: m.html, MessageStream: m.headers ? "broadcast" : "outbound", ...(m.headers ? { Headers: Object.entries(m.headers).map(([Name, Value]) => ({ Name, Value })) } : {}) }) });
    if (r.status !== 200) fail(r.status);
  } };
}
/** The configured mailer: a test stand-in, none (null), or the environment's. */
export const mailerOf = (d: Deps): Mailer | null => (d.mail === undefined ? mailerFromEnv(process.env, d.net) ?? null : d.mail);
export const mailConfigured = (d: Deps) => !!mailerOf(d);

/* ---------------- templates: a title, a sentence or two, one link ---------------- */
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const clip = (v: unknown, n = 120) => String(v ?? "").replace(/[\r\n]+/g, " ").slice(0, n);
export type Template =
  | { t: "invite"; company: string; role: string; link: string; expires: string }
  | { t: "first-admin"; company: string; link: string; expires: string }
  | { t: "join-decided"; company: string; approved: boolean; link: string }
  | { t: "mfa-reset"; link: string }
  | { t: "code"; code: string; purpose: string }
  | { t: "vendor-invite"; company: string; vendor: string; link: string; due: string }
  | { t: "vendor-clarify"; company: string; vendor: string; link: string }
  | { t: "trust-decided"; company: string; resource: string; approved: boolean; note: string; link: string }
  | { t: "trust-update"; company: string; title: string; link: string; unsubscribe: string }
  | { t: "invoice"; id: string; amount: string; due: string; link: string; resent: boolean };
function render(m: Template): { subject: string; lines: string[]; link: string; button: string; foot?: string } {
  switch (m.t) {
    case "invite": return { subject: `${clip(m.company, 80)} invited you to Selvara`, lines: [`${clip(m.company, 80)} invited you to join its Selvara workspace as ${clip(m.role, 30)}.`, `The link works once, with this email address, until ${m.expires}.`], link: m.link, button: "Accept the invitation" };
    case "first-admin": return { subject: `Your Selvara workspace for ${clip(m.company, 80)} is ready`, lines: [`You are the first admin of ${clip(m.company, 80)} on Selvara.`, `The link works once, with this email address, until ${m.expires}. You set a password and an authenticator when you join.`], link: m.link, button: "Set up your account" };
    case "join-decided": return { subject: m.approved ? `You can now sign in to ${clip(m.company, 80)}` : `Your request to join ${clip(m.company, 80)}`, lines: [m.approved ? `A company admin approved your request to join ${clip(m.company, 80)}. Sign in with the password you chose.` : `A company admin of ${clip(m.company, 80)} did not approve your request to join. Ask them if you think this is a mistake.`], link: m.link, button: "Open Selvara" };
    case "mfa-reset": return { subject: "Your Selvara second factor was reset", lines: ["Your multi-factor authentication was reset after an identity check, and your sessions were ended.", "Sign in again and set up a new authenticator. If you did not ask for this, contact your company admin at once."], link: m.link, button: "Sign in" };
    case "code": return { subject: `Your Selvara code: ${m.code}`, lines: [`Your one-time code for ${clip(m.purpose, 80)} is ${m.code}.`, "It works once, for 10 minutes. Nobody from Selvara will ask you for it. If you did not ask for it, ignore this message."], link: "", button: "" };
    case "vendor-invite": return { subject: `${clip(m.company, 80)} asks ${clip(m.vendor, 80)} to complete a security questionnaire`, lines: [`${clip(m.company, 80)} asks you to complete its security questionnaire for ${clip(m.vendor, 80)}${m.due ? `, by ${m.due}` : ""}.`, "Open the link and confirm this email address; a one-time code is sent to it."], link: m.link, button: "Open the questionnaire" };
    case "vendor-clarify": return { subject: `${clip(m.company, 80)} asks for a clarification`, lines: [`${clip(m.company, 80)} asks for a clarification on the security questionnaire for ${clip(m.vendor, 80)}. The note is in the portal.`], link: m.link, button: "Open the questionnaire" };
    case "trust-decided": return { subject: `${clip(m.company, 80)} Trust Center: ${clip(m.resource, 80)}`, lines: [m.approved ? `${clip(m.company, 80)} gave you access to ${clip(m.resource, 80)}. Confirm your email address on the Trust Center, accept the NDA, and open the document.` : `${clip(m.company, 80)} declined your request for ${clip(m.resource, 80)}.${m.note ? ` Their note: ${clip(m.note, 300)}` : ""}`], link: m.link, button: "Open the Trust Center" };
    case "trust-update": return { subject: `${clip(m.company, 80)} Trust Center update`, lines: [`${clip(m.company, 80)} published: ${clip(m.title, 160)}.`], link: m.link, button: "Open the Trust Center", foot: `You get these because you subscribed. Unsubscribe: ${m.unsubscribe}` };
    case "invoice": return { subject: `Selvara invoice ${m.id}${m.resent ? " (copy)" : ""}`, lines: [`Invoice ${m.id} for ${m.amount} is due on ${m.due}.`, "Your company admins can see it and pay it in Selvara, under Billing & Invoices."], link: m.link, button: "Open Billing & Invoices" };
  }
}
export function compose(to: string, m: Template): MailMessage {
  const r = render(m);
  const text = [...r.lines, ...(r.link ? ["", `${r.button}: ${r.link}`] : []), ...(r.foot ? ["", r.foot] : []), "", "Selvara"].join("\n");
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#1b1b1f">${r.lines.map((l) => `<p>${esc(l)}</p>`).join("")}${r.link ? `<p><a href="${esc(r.link)}">${esc(r.button)}</a></p>` : ""}${r.foot ? `<p style="font-size:12px;color:#5b5b66">${esc(r.foot)}</p>` : ""}<p style="font-size:12px;color:#5b5b66">Selvara</p></body></html>`;
  // bulk updates carry a one-click unsubscribe (RFC 8058) that mail providers show next to the sender
  const headers = m.t === "trust-update" ? { "List-Unsubscribe": `<${m.unsubscribe}>` } : undefined;
  return { to, subject: r.subject.replace(/[\r\n]+/g, " "), text, html, headers };
}

export const maskEmail = (e: string) => { const [u, dom] = e.split("@"); return dom ? `${u.slice(0, 1)}•••@${dom}` : "•••"; };
const RATE = 10; const HOUR = 3600_000;
export interface MailResult { sent: boolean; reason?: "not configured" | "invalid address" | "rate limited" | "failed" }
/** Sends one message if email is configured. Never throws: the caller falls back to showing the link. `tenantId` puts the record in that
 *  company's log (null: the platform's). */
export async function sendMail(d: Deps, to: string, m: Template, log: { tenantId: string | null; actor: string; ip: string }): Promise<MailResult> {
  const mailer = mailerOf(d); if (!mailer) return { sent: false, reason: "not configured" };
  const addr = to.trim().toLowerCase(); if (!isMailable(addr)) return { sent: false, reason: "invalid address" };
  const key = createHash("sha256").update(addr).digest("hex").slice(0, 32); const now = d.now();
  const recent = ((await d.store.kvGet<number[]>("mailrate", key)) ?? []).filter((t) => now - t < HOUR);
  const record = (action: string, extra = "") => d.store.audit({ at: now, actor: log.actor, actorId: null, tenantId: log.tenantId, action, target: `${m.t} to ${maskEmail(addr)}${extra}`, cat: "Email", space: log.tenantId ? "ws" : "admin", ip: log.ip });
  if (recent.length >= RATE) { await record("email.rate_limited"); return { sent: false, reason: "rate limited" }; }
  await d.store.kvSet("mailrate", key, [...recent, now], HOUR);
  try { await mailer.send(compose(addr, m)); await record("email.sent"); return { sent: true }; }
  catch { await record("email.failed", ` (${mailer.provider})`); return { sent: false, reason: "failed" }; }
}
