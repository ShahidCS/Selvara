/* Server-only. API keys, webhooks, custom tests and the event stream (production programme group 6; inventory group 6, section 3). Company
   admins only. Deliberate differences from the demonstration, decided for production:
   - Keys are real: "sel_<company code>_<key id>_<secret>", generated on the server, stored only as an HMAC of the whole key with its prefix,
     shown once. They expire (30, 90 or 365 days) and are accepted by the company's API (/api/v1, below): read keys read the registers,
     read/write keys may also push events. A read key is issued at once; a read/write key needs a second admin's approval, and is generated
     only when the requester opens it, within 60 minutes of the approval (no secret is ever held waiting). An approved key not opened in time
     expires unissued (audited).
   - Webhooks are real (server/ws/webhooks.ts): signed, SSRF-safe deliveries of company events with a delivery log. A webhook needs a second
     admin's approval; its signing secret is shown once to the admin who asked for it. A paused webhook delivers nothing, tests included.
   - Custom tests evaluate the events pushed for their target: the latest event's status gives Pass or Fail ("No data" when none arrived).
     "On push" tests are evaluated when an event for their target arrives; the others when they are due, the next time the module is opened.
   - Deleting a webhook or revoking a key withdraws its pending approval. Everything is in the company's audit log. */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isSafeWebhookUrl, logSafeUrl } from "@/lib/security";
import type { Req, Res } from "../core";
import type { Deps } from "../types";
import { approvalsView, err, invalid, membersOf, missing, ok, refuse, str, sweepApprovals, txt, wsRoute, type WsHelpers } from "./common";
import { pendingOf, registerFourEyes } from "./foureyes";
import type { Actor, WsTx } from "./store";
import { deliverOne, seal, unseal, WEBHOOK_EVENTS, type Webhook } from "./webhooks";

export const KEY_SCOPES = ["Read", "Read/Write"];
export const KEY_DAYS = [30, 90, 365];
export const TEST_SCHEDULES = ["Every 2h", "Daily", "Weekly", "On push"];
const EVERY: Record<string, number> = { "Every 2h": 2 * 3600_000, Daily: 86_400_000, Weekly: 7 * 86_400_000 };
export const REVEAL_MIN = 60; const EVENT_CAP = 200; export const V1_PER_HOUR = 600;
const API_KINDS = ["api.key", "api.webhook"]; const TTL = 24 * 3600_000;
export const V1_COLLECTIONS: Record<string, string> = { controls: "control", risks: "risk", issues: "issue", policies: "policy", vendors: "vendor", evidence: "evidence", "ai-systems": "ai-system" };

export interface ApiKey { id: string; label: string; scope: string; days: number; status: "Active" | "Approved" | "Revoked" | "Expired"; prefix: string; hash?: string; createdAt: number; createdBy: string; createdById: string; approvedAt?: number; expiresAt?: number; lastUsedAt?: number; uses: number }
interface CustomTest { id: string; name: string; target: string; schedule: string; lastAt?: number; result: "Pending" | "Pass" | "Fail" | "No data"; eventId?: string }
interface ApiEvent { id: string; ev: string; res: string; status: string; detail: string; at: number; source: string }

const stamp = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const hashKey = (secret: string, full: string) => createHmac("sha256", secret).update(`selvara-api-key|${full}`).digest("hex");
/** A new key for the company: "sel_<company code>_<key id>_<43 random characters>". */
const newKey = (ref: string, id: string) => { const head = `sel_${ref}_${id.toLowerCase().replace(/[^a-z0-9]/g, "")}_`; const full = `${head}${randomBytes(32).toString("base64url")}`; return { full, prefix: `${full.slice(0, head.length + 6)}…` }; };
const keyView = (k: ApiKey, pending: string | undefined, now: number, me: string) => ({
  id: k.id, label: k.label, scope: k.scope, prefix: k.status === "Active" || k.status === "Revoked" ? k.prefix || "—" : "—", created: day(k.createdAt), expires: k.expiresAt ? day(k.expiresAt) : `${k.days} days after issue`,
  lastUsed: k.lastUsedAt ? stamp(k.lastUsedAt) : "never", uses: k.uses, requestedBy: k.createdBy, approvalId: pending,
  status: pending ? "Pending approval" : k.status === "Active" && k.expiresAt && k.expiresAt <= now ? "Expired" : k.status === "Approved" ? "Approved, not yet issued" : k.status,
  revealable: k.status === "Approved" && k.createdById === me && !!k.approvedAt && now - k.approvedAt < REVEAL_MIN * 60_000,
});
const seq = (id: string) => Number(id.replace(/\D/g, "")) || 0;
async function pushEvent(t: WsTx, e: Omit<ApiEvent, "id" | "at">) {
  const id = `EV-${await t.next("api-event", 0)}`; await t.insert("api-event", id, { id, at: t.now, ...e } satisfies ApiEvent);
  const all = (await t.list<ApiEvent>("api-event")).sort((a, b) => a.data.at - b.data.at || seq(a.id) - seq(b.id)); for (const x of all.slice(0, Math.max(0, all.length - EVENT_CAP))) await t.remove("api-event", x.id, x.version); // keep the newest 200
  // "On push" tests on this target are evaluated at once
  for (const rec of await t.list<CustomTest>("custom-test")) if (rec.data.schedule === "On push" && rec.data.target === e.res) await evaluate(t, rec.id, rec.data, rec.version, true);
  return id;
}
/** A custom test's result: the status of the newest event pushed for its target. */
async function evaluate(t: WsTx, id: string, x: CustomTest, version: number, system: boolean) {
  const ev = (await t.list<ApiEvent>("api-event")).map((r) => r.data).filter((e) => e.res === x.target).sort((a, b) => b.at - a.at || seq(b.id) - seq(a.id))[0]; // newest; the same millisecond by sequence
  x.result = !ev ? "No data" : /^(pass|ok|success)$/i.test(ev.status) ? "Pass" : /^(fail|error|failed)$/i.test(ev.status) ? "Fail" : "No data"; x.eventId = ev?.id; x.lastAt = t.now;
  await t.update("custom-test", id, x, version); await t.audit("customtest.run", `${x.name} (${x.id}): ${x.result}${ev ? ` from ${ev.id}` : ""}`, "Control", system);
  return x;
}
/** Approved keys not opened within the window expire unissued (once, audited as System). */
async function sweepKeys(t: WsTx) {
  for (const rec of await t.list<ApiKey>("api-key")) {
    const k = rec.data;
    if (k.status === "Approved" && k.approvedAt && t.now - k.approvedAt >= REVEAL_MIN * 60_000) { k.status = "Expired"; await t.update("api-key", rec.id, k, rec.version); await t.audit("api.key.expired_unrevealed", `${k.label} (${k.id})`, "System", true); }
  }
}

registerFourEyes("api.key", { mod: "api", apply: async (_d, t, ap, by) => {
  const rec = (await t.get<ApiKey>("api-key", String(ap.payload.id))) ?? missing("Key request"); const k = rec!.data;
  if (k.status !== "Approved" || k.approvedAt) invalid("This key request is no longer open.");
  k.approvedAt = t.now; await t.update("api-key", rec!.id, k, rec!.version);
  await t.audit("api.key.approved", `${k.label} (${k.scope}; approved by ${by}; requested by ${ap.requestedByName}); the requester has ${REVEAL_MIN} minutes to open it`, "System");
  await t.notify(k.createdById, `Your API key "${k.label.slice(0, 60)}" was approved by ${by}. Open it within ${REVEAL_MIN} minutes in API, Webhooks & Custom Tests.`);
} });
registerFourEyes("api.webhook", { mod: "api", apply: async (d, t, ap, by) => {
  const rec = (await t.get<Webhook>("webhook", String(ap.payload.id))) ?? missing("Webhook request"); const w = rec!.data;
  if (w.approved) invalid("Already approved.");
  w.approved = true; w.approvedAt = t.now; w.secret = seal(d.secret, `whsec_${randomBytes(32).toString("base64url")}`);
  await t.update("webhook", rec!.id, w, rec!.version);
  await t.audit("webhook.approved", `${logSafeUrl(w.url)} (approved by ${by}; requested by ${ap.requestedByName})`, "System");
  await t.notify(w.createdById, `Your webhook ${logSafeUrl(w.url).slice(0, 120)} was approved by ${by}. Show its signing secret once in API, Webhooks & Custom Tests.`);
} });

export function apiRoutes(h: WsHelpers) {
  const tx = <T,>(d: Deps, c: { actor: Actor }, w: (t: WsTx) => Promise<T>) => d.ws.tx(c.actor, d.now(), w);
  const adminOnly = (me: Actor) => refuse(me.role === "admin" ? null : "Only an admin can change API keys, webhooks and custom tests.");
  const route = (fn: Parameters<typeof wsRoute>[2]) => wsRoute(h, "api", async (d, r, c) => { adminOnly(c.actor); return fn(d, r, c); });
  const hookOf = async (t: WsTx, id: unknown) => (await t.get<Webhook>("webhook", str(id, 20))) ?? missing("Webhook");

  const data = route(async (d, _r, c) => ok(await tx(d, c, async (t) => {
    await sweepApprovals(t, API_KINDS); await sweepKeys(t);
    for (const rec of await t.list<CustomTest>("custom-test")) { const x = rec.data; const every = EVERY[x.schedule]; if (every && (!x.lastAt || t.now - x.lastAt >= every)) await evaluate(t, rec.id, x, rec.version, true); }
    const pend = await pendingOf(t, API_KINDS); const p = (subject: string) => pend.find((x) => x.subject === subject)?.id;
    const names = new Map((await membersOf(d, c.actor)).map((m) => [m.id, m.name]));
    const deliveries = (await t.list<{ id: string; hookId: string; event: string; at: number; status: number; ms: number; error: string }>("webhook-delivery")).map((x) => x.data).sort((a, b) => b.at - a.at).slice(0, 100);
    const hooks = (await t.list<Webhook>("webhook")).map((x) => x.data);
    return {
      keys: (await t.list<ApiKey>("api-key")).map((x) => keyView(x.data, p(x.id), t.now, c.actor.id)).reverse(),
      hooks: hooks.map((w) => ({ id: w.id, url: w.url, events: w.events, lastDelivery: w.lastDelivery || "—", failures: w.failures ?? 0, approvalId: p(w.id),
        status: p(w.id) ? "Pending approval" : w.approved ? w.status : "Not approved", secretRevealable: w.approved && !w.secretShownAt && w.createdById === c.actor.id && !!w.approvedAt && t.now - w.approvedAt < REVEAL_MIN * 60_000 })).reverse(),
      tests: (await t.list<CustomTest>("custom-test")).map((x) => ({ ...x.data, last: x.data.lastAt ? stamp(x.data.lastAt) : "not run" })).reverse(),
      events: [
        ...(await t.list<ApiEvent>("api-event")).map((x) => ({ id: x.data.id, at: x.data.at, ev: x.data.ev, res: x.data.res, http: "202", lat: "—", when: stamp(x.data.at), dir: "In", detail: `${x.data.status}${x.data.detail ? `: ${x.data.detail}` : ""} (${x.data.source})` })),
        ...deliveries.map((x) => ({ id: x.id, at: x.at, ev: x.event, res: logSafeUrl(hooks.find((w) => w.id === x.hookId)?.url ?? ""), http: x.status ? String(x.status) : "failed", lat: x.ms ? `${x.ms}ms` : "—", when: stamp(x.at), dir: "Out", detail: x.error })),
      ].sort((a, b) => b.at - a.at || seq(b.id) - seq(a.id)).slice(0, 200),
      webhookEvents: WEBHOOK_EVENTS, approvals: await approvalsView(t, API_KINDS, names), revealMinutes: REVEAL_MIN,
    };
  })));

  /* keys */
  const createKey = route(async (d, r, c) => {
    const label = txt(r.body.label, 80); if (!label) invalid("Label is required.");
    const scope = KEY_SCOPES.includes(String(r.body.scope)) ? String(r.body.scope) : "Read"; const days = KEY_DAYS.includes(Number(r.body.days)) ? Number(r.body.days) : 90;
    return tx(d, c, async (t) => {
      const id = `K${await t.next("api-key", 0)}`;
      const base: ApiKey = { id, label, scope, days, status: "Approved", prefix: "", createdAt: t.now, createdBy: c.actor.name, createdById: c.actor.id, uses: 0 };
      if (scope === "Read") {
        const { full, prefix } = newKey(c.a.company!.ref, id);
        await t.insert("api-key", id, { ...base, status: "Active", prefix, hash: hashKey(d.secret, full), approvedAt: t.now, expiresAt: t.now + days * 86_400_000 } satisfies ApiKey);
        await t.audit("api.key.created", `${label} (${id}; Read; expires ${day(t.now + days * 86_400_000)})`, "System");
        return ok({ id, full, pending: false });
      }
      await t.insert("api-key", id, base);
      await t.request({ kind: "api.key", title: `Create write-scope API key "${label.slice(0, 60)}"`, subject: id, payload: { id }, needs: 1, approverRoles: ["admin"], forbid: [], ttlMs: TTL });
      await t.audit("api.key.requested", `${label} (${id}; Read/Write)`, "System");
      return ok({ id, pending: true });
    });
  });
  /** The requester opens an approved key once: it is generated now, its hash kept, the key shown and never again. */
  const reveal = route(async (d, r, c) => tx(d, c, async (t) => {
    const rec = (await t.get<ApiKey>("api-key", str(r.path[2], 20))) ?? missing("Key"); const k = rec!.data;
    if (k.status !== "Approved" || !k.approvedAt) invalid("This key was already shown or is not available. Create a new key if it was lost.");
    if (k.createdById !== c.actor.id) refuse("Only the admin who requested this key can see it.");
    if (t.now - k.approvedAt! >= REVEAL_MIN * 60_000) { await sweepKeys(t); return ok({ expired: true, message: "The reveal window has expired and the key was not issued. Create a new key." }); }
    const { full, prefix } = newKey(c.a.company!.ref, k.id);
    Object.assign(k, { status: "Active", prefix, hash: hashKey(d.secret, full), expiresAt: t.now + k.days * 86_400_000 }); await t.update("api-key", rec!.id, k, rec!.version);
    await t.audit("api.key.revealed", `${k.label} (${k.id}; shown once to ${c.actor.name}; expires ${day(k.expiresAt!)})`, "System");
    return ok({ full, label: k.label, scope: k.scope });
  }));
  const revoke = route(async (d, r, c) => tx(d, c, async (t) => {
    const rec = (await t.get<ApiKey>("api-key", str(r.path[2], 20))) ?? missing("Key"); const k = rec!.data;
    const pend = (await pendingOf(t, ["api.key"])).find((x) => x.subject === k.id);
    if (k.status === "Revoked" || k.status === "Expired") invalid("This key is no longer active.");
    if (pend) { await t.setApproval(pend.id, "Withdrawn"); await t.audit("approval.api.key.withdrawn", `${pend.title} (${pend.id}); the key was revoked`, "Approval"); }
    k.status = "Revoked"; delete k.hash; await t.update("api-key", rec!.id, k, rec!.version); await t.audit("api.key.revoked", `${k.label} (${k.id})`, "System");
    return ok({ ...keyView(k, undefined, t.now, c.actor.id) });
  }));

  /* webhooks */
  const addHook = route(async (d, r, c) => {
    const url = str(r.body.url, 2048).trim(); if (!isSafeWebhookUrl(url)) invalid("A valid https URL is required.");
    const events = (Array.isArray(r.body.events) ? r.body.events : []).map(String).filter((e) => WEBHOOK_EVENTS.includes(e));
    if (!events.length) invalid("Choose at least one event.");
    return tx(d, c, async (t) => {
      if ((await t.list<Webhook>("webhook")).length >= 20) invalid("A company can have at most 20 webhooks.");
      const id = `WH-${await t.next("webhook", 0)}`;
      await t.insert("webhook", id, { id, url, events: [...new Set(events)], status: "Active", approved: false, createdBy: c.actor.name, createdById: c.actor.id, lastDelivery: "", failures: 0 } satisfies Webhook);
      await t.request({ kind: "api.webhook", title: `Add webhook ${logSafeUrl(url).slice(0, 120)}`, subject: id, payload: { id }, needs: 1, approverRoles: ["admin"], forbid: [], ttlMs: TTL });
      await t.audit("webhook.requested", `${logSafeUrl(url)} (${id}; ${events.join(", ")})`, "System");
      return ok({ id, url, events, status: "Pending approval" });
    });
  });
  const hookSecret = route(async (d, r, c) => tx(d, c, async (t) => {
    const rec = await hookOf(t, r.path[2]); const w = rec!.data;
    if (!w.approved || !w.secret || w.secretShownAt) invalid("This signing secret was already shown or is not available.");
    if (w.createdById !== c.actor.id) refuse("Only the admin who asked for this webhook can see its signing secret.");
    if (t.now - (w.approvedAt ?? 0) >= REVEAL_MIN * 60_000) invalid("The reveal window has expired. Delete the webhook and add it again to get a new secret.");
    w.secretShownAt = t.now; await t.update("webhook", rec!.id, w, rec!.version);
    await t.audit("webhook.secret.revealed", `${logSafeUrl(w.url)} (shown once to ${c.actor.name})`, "System");
    return ok({ secret: unseal(d.secret, w.secret), url: w.url });
  }));
  const testHook = route(async (d, r, c) => {
    const w = await tx(d, c, async (t) => { const rec = await hookOf(t, r.path[2]); return rec!.data; });
    if (!w.approved) refuse("This webhook has not been approved by a second admin.");
    if (w.status !== "Active") invalid("This webhook is paused. Resume it to send a test event.");
    const out = await deliverOne(d, c.actor, w.id, "test.ping", { summary: `Test event sent by ${c.actor.name}` });
    await tx(d, c, (t) => t.audit("webhook.tested", `${logSafeUrl(w.url)}: ${out.status || out.error}`, "System"));
    return ok({ status: out.status, ms: out.ms, error: out.error ?? (out.status >= 200 && out.status < 300 ? "" : `HTTP ${out.status}`) });
  });
  const toggleHook = route(async (d, r, c) => tx(d, c, async (t) => {
    const rec = await hookOf(t, r.path[2]); const w = rec!.data;
    if (!w.approved) refuse("This webhook has not been approved by a second admin.");
    w.status = w.status === "Active" ? "Paused" : "Active"; await t.update("webhook", rec!.id, w, rec!.version);
    await t.audit(w.status === "Active" ? "webhook.resumed" : "webhook.paused", logSafeUrl(w.url), "System");
    return ok({ id: w.id, url: w.url, status: w.status });
  }));
  const deleteHook = route(async (d, r, c) => tx(d, c, async (t) => {
    const rec = await hookOf(t, r.path[2]); const w = rec!.data;
    const pend = (await pendingOf(t, ["api.webhook"])).find((x) => x.subject === w.id);
    if (pend) { await t.setApproval(pend.id, "Withdrawn"); await t.audit("approval.api.webhook.withdrawn", `${pend.title} (${pend.id}); the webhook was deleted`, "Approval"); }
    await t.remove("webhook", rec!.id, rec!.version); await t.audit("webhook.deleted", `${logSafeUrl(w.url)} (${w.id})`, "System");
    return ok({ id: w.id, url: w.url });
  }));

  /* custom tests and events */
  const createTest = route(async (d, r, c) => {
    const name = txt(r.body.name, 120); if (!name) invalid("Test name is required.");
    const target = txt(r.body.target, 80); if (!target) invalid("Target is required: the resource name your events are pushed for.");
    const schedule = TEST_SCHEDULES.includes(String(r.body.schedule)) ? String(r.body.schedule) : TEST_SCHEDULES[0];
    return tx(d, c, async (t) => {
      const id = `CT-${await t.next("custom-test", 0)}`;
      await t.insert("custom-test", id, { id, name, target, schedule, result: "Pending" } satisfies CustomTest);
      await t.audit("customtest.created", `${name} (${id}; target ${target}; ${schedule})`, "Control");
      return ok({ id, name, target, schedule, last: "not run", result: "Pending" });
    });
  });
  const runTest = route(async (d, r, c) => tx(d, c, async (t) => {
    const rec = (await t.get<CustomTest>("custom-test", str(r.path[2], 20))) ?? missing("Test");
    const x = await evaluate(t, rec!.id, rec!.data, rec!.version, false); return ok({ ...x, last: stamp(t.now) });
  }));
  const deleteTest = route(async (d, r, c) => tx(d, c, async (t) => {
    const rec = (await t.get<CustomTest>("custom-test", str(r.path[2], 20))) ?? missing("Test");
    await t.remove("custom-test", rec!.id, rec!.version); await t.audit("customtest.deleted", `${rec!.data.name} (${rec!.id})`, "Control");
    return ok(rec!.data);
  }));
  const pushTest = route(async (d, _r, c) => tx(d, c, async (t) => {
    const id = await pushEvent(t, { ev: "test.ping", res: "selvara-test", status: "info", detail: "Test event from the console", source: c.actor.name });
    await t.audit("api.event.pushed", `test.ping selvara-test (${id})`, "System");
    return ok(["test.ping", "selvara-test"]);
  }));

  return {
    "GET ws/data/api": data, "POST ws/api-keys": createKey, "POST ws/api-keys/:id/reveal": reveal, "POST ws/api-keys/:id/revoke": revoke,
    "POST ws/webhooks": addHook, "POST ws/webhooks/:id/secret": hookSecret, "POST ws/webhooks/:id/test": testHook, "POST ws/webhooks/:id/toggle": toggleHook, "DELETE ws/webhooks/:id": deleteHook,
    "POST ws/custom-tests": createTest, "POST ws/custom-tests/:id/run": runTest, "DELETE ws/custom-tests/:id": deleteTest, "POST ws/api-events/test": pushTest,
  };
}

/* ---- the company API (/api/v1), authenticated by an API key, never by a cookie ---- */
const keyParts = (auth: string | undefined) => {
  const m = /^Bearer (sel_([a-z0-9-]{2,40})_([a-z0-9]{1,12})_[A-Za-z0-9_-]{43})$/.exec(String(auth ?? "").trim());
  return m ? { full: m[1], ref: m[2], id: m[3].toUpperCase() } : null;
};
/** Who an API call acts as: the key (its creator's member id for the database's row rules), in the key's company. */
async function keyActor(d: Deps, r: Req, write: boolean): Promise<{ actor: Actor; key: ApiKey } | Res> {
  const p = keyParts(r.headers.authorization); if (!p) return err(401, "Send an API key: Authorization: Bearer sel_...");
  const tenantId = await d.dir.companyByCode(p.ref); if (!tenantId) return err(401, "This API key is not valid.");
  const probe: Actor = { id: "", name: "API", role: "admin", tenantId, ip: r.ip };
  const k = await d.ws.tx(probe, d.now(), async (t) => (await t.get<ApiKey>("api-key", p.id))?.data ?? null);
  const want = Buffer.from(hashKey(d.secret, p.full), "hex"); const have = Buffer.from(k?.hash ?? "", "hex");
  if (!k || have.length !== want.length || !timingSafeEqual(have, want) || k.status !== "Active") return err(401, "This API key is not valid.");
  if (k.expiresAt && k.expiresAt <= d.now()) return err(401, "This API key has expired.");
  if (write && k.scope !== "Read/Write") return err(403, "This API key can only read.");
  return { actor: { id: k.createdById, name: `API key ${k.label}`, role: "admin", tenantId, ip: r.ip }, key: k };
}
async function used(t: WsTx, k: ApiKey) {
  const n = await t.next(`apik-${k.id.toLowerCase()}-${Math.floor(t.now / 3600_000)}`, 0); if (n > V1_PER_HOUR) return false;
  const rec = await t.get<ApiKey>("api-key", k.id); if (rec) await t.update("api-key", rec.id, { ...rec.data, lastUsedAt: t.now, uses: (rec.data.uses ?? 0) + 1 }, rec.version);
  return true;
}
const strip = (x: Record<string, unknown>) => { const o = { ...x }; if (Array.isArray(o.attachments)) o.attachments = (o.attachments as unknown[]).length; return o; };
export function v1Routes() {
  const read = async (d: Deps, r: Req): Promise<Res> => {
    const kind = V1_COLLECTIONS[str(r.path[1], 30)]; if (!kind) return err(404, "Not found.");
    const a = await keyActor(d, r, false); if ("status" in a) return a;
    return d.ws.tx(a.actor, d.now(), async (t) => {
      if (!(await used(t, a.key))) return err(429, `At most ${V1_PER_HOUR} calls an hour per key.`);
      return ok({ data: (await t.list<Record<string, unknown>>(kind)).map((x) => strip(x.data)) });
    });
  };
  const push = async (d: Deps, r: Req): Promise<Res> => {
    const a = await keyActor(d, r, true); if ("status" in a) return a;
    const ev = str(r.body.event, 60); const res = txt(r.body.resource, 120); const status = str(r.body.status, 20).toLowerCase() || "info";
    if (!/^[a-z][a-z0-9._-]{1,59}$/.test(ev)) return err(400, "event must be a lower-case name such as resource.checked.");
    if (!res) return err(400, "resource is required.");
    if (!["pass", "fail", "info", "ok", "error"].includes(status)) return err(400, "status must be pass, fail or info.");
    return d.ws.tx(a.actor, d.now(), async (t) => {
      if (!(await used(t, a.key))) return err(429, `At most ${V1_PER_HOUR} calls an hour per key.`);
      const id = await pushEvent(t, { ev, res, status, detail: txt(r.body.detail, 500), source: `key ${a.key.label}` });
      await t.audit("api.event.pushed", `${ev} ${res} ${status} (${id}; key ${a.key.label})`, "System");
      return { status: 202, body: { id } };
    });
  };
  return { "GET v1/:collection": read, "POST v1/events": push };
}
