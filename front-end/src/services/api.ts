/* API / Webhooks / Custom tests stubs. Mock mode performs the in-memory mutations; the caller then does wsLog / toast / bumpData.
 * CONTRACT (docs/security/SOD_MATRIX.md section 3, API): everything here is admin-only (assertRole, deny by default). A key with the WRITE scope and every webhook need approval
 * from a SECOND admin (approvals engine): until then the key has no secret and no prefix, the webhook never delivers. After approval the key is generated and shown ONCE,
 * only to the requester (never to the approver). Read-only keys are issued by a single admin. Webhook URLs stay https-only (isSafeWebhookUrl). Violations throw SodError.
 * The real API MUST generate and hash keys server-side (plaintext once, store only a hash + prefix), keep webhook signing secrets server-side, enforce RBAC and the
 * second-admin rule on every call, and defend webhook delivery against SSRF (resolve + pin the IP, block private ranges, no redirects). */
import seed from "@/data/apiSeed.json";
import { nowStamp } from "@/lib/format";
import { isSafeWebhookUrl, randInt, secureHex } from "@/lib/security";
import { requestApproval } from "@/lib/approvals";
import { payloadStr, registerApprovalHandler } from "@/lib/approvalKit";
import { assertRole, getActor, hasRole, isSamePerson, SodError } from "@/lib/sod";
import { wsLog } from "@/lib/audit";
import { apiFetch, viaApi } from "./http";

/* eslint-disable @typescript-eslint/no-explicit-any */
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
/** status: Active | Revoked | "Pending approval" (write scope, no secret yet) | "Not approved" (rejected, withdrawn or expired). */
export interface ApiKey { id: string; label: string; prefix: string; created: string; lastUsed: string; scope: string; status: string; approvalId?: string; requestedBy?: string }
/** status: Active | Paused | "Pending approval" | "Not approved". */
export interface Webhook { id: string; url: string; events: string[]; status: string; lastDelivery: string; approvalId?: string }
export interface CustomTest { id: string; name: string; target: string; schedule: string; last: string; result: string }
export interface ApiEvent { ev: string; res: string; http: string; lat: string; when: string }
export const WH_EVENTS: string[] = seed.WH_EVENTS;
export const KEY_SCOPES = ["Read", "Read/Write"];
export const TEST_SCHEDULES = ["Every 2h", "Daily", "Weekly", "On push"];
const EVENT_CAP = 200;
/** Mutable demo collections (prototype globals API_KEYS / WEBHOOKS / CUSTOM_TESTS / API_EVENTS). */
export const API = {
  keys: clone(seed.API_KEYS) as ApiKey[], hooks: clone(seed.WEBHOOKS) as Webhook[],
  tests: clone(seed.CUSTOM_TESTS) as CustomTest[], events: clone(seed.API_EVENTS) as ApiEvent[],
};
const post = <T,>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
const enc = encodeURIComponent;
/** Demo id in the source's style ("K"+Date.now()), bumped if it would collide. Not a security token. */
function uid(prefix: string, list: { id: string }[]) { let n = Date.now(); while (list.some((x) => x.id === prefix + n)) n++; return prefix + n; }
const pushEvent = (e: ApiEvent) => { API.events.unshift(e); if (API.events.length > EVENT_CAP) API.events.length = EVENT_CAP; };

/** Admin only (base role). The prototype also listed super/owner, who cannot open the API module per ROLE_MODS. UI gate only: services call assertRole too. */
export const apiCanManage = (roleId: string) => hasRole(roleId, "admin");
const gate = (what: string) => assertRole(what, "admin");
const APPROVERS = ["admin"];
export const KEY_REVEAL_MIN = 60;
/** The one-time secrets of approved write keys, held only until the requester reveals them (mock stand-in for the server's issue-once flow). */
const VAULT = new Map<string, { full: string; by: string; until: number }>();
const issue = (): { full: string; prefix: string } => { const full = "ak_demo_" + secureHex(16); return { full, prefix: "ak_demo_" + full.slice(8, 12) + "…" }; };

registerApprovalHandler("api.key", {
  apply: (ap) => {
    const k = API.keys.find((x) => x.id === payloadStr(ap, "id")); if (!k) throw new SodError("Key request not found.");
    const { full, prefix } = issue(); k.prefix = prefix; k.status = "Active";
    VAULT.set(k.id, { full, by: ap.requestedBy, until: Date.now() + KEY_REVEAL_MIN * 60_000 });
    wsLog("api.key.approved", `${k.label} (${k.scope}; approved by ${ap.approvals.map((x) => x.by).join(", ")}; requested by ${ap.requestedBy})`, "System"); // never the key
  },
  closed: (ap) => { const k = API.keys.find((x) => x.id === payloadStr(ap, "id")); if (k && k.status === "Pending approval") k.status = "Not approved"; },
});
registerApprovalHandler("api.webhook", {
  apply: (ap) => {
    const w = API.hooks.find((x) => x.id === payloadStr(ap, "id")); if (!w) throw new SodError("Webhook request not found.");
    w.status = "Active";
    wsLog("webhook.approved", `${logSafe(w.url)} (approved by ${ap.approvals.map((x) => x.by).join(", ")}; requested by ${ap.requestedBy})`, "System");
  },
  closed: (ap) => { const w = API.hooks.find((x) => x.id === payloadStr(ap, "id")); if (w && w.status === "Pending approval") w.status = "Not approved"; },
});
const logSafe = (u: string) => { try { const x = new URL(u); return x.origin + x.pathname; } catch { return "(invalid url)"; } };

/** Prototype: apiDoNewKey. Read-only: issued at once (shown once). Read/Write: a pending request; the secret exists only after a second admin approves. */
export function createKey(input: { label: string; scope: string }) {
  return viaApi<{ id: string; full?: string; pending: boolean }>(() => {
    gate("creating an API key");
    const scope = KEY_SCOPES.includes(input.scope) ? input.scope : "Read";
    const id = uid("K", API.keys); const me = getActor().name;
    if (scope === "Read") {
      const { full, prefix } = issue();
      API.keys.unshift({ id, label: input.label, prefix, created: nowStamp().slice(0, 10), lastUsed: "never", scope, status: "Active", requestedBy: me });
      return { id, full, pending: false };
    }
    const ap = requestApproval({ kind: "api.key", title: `Create write-scope API key "${input.label.slice(0, 60)}"`, subject: id, payload: { id }, needs: 1, approverRoles: APPROVERS });
    API.keys.unshift({ id, label: input.label, prefix: "—", created: nowStamp().slice(0, 10), lastUsed: "never", scope, status: "Pending approval", approvalId: ap.id, requestedBy: me });
    return { id, pending: true };
  }, () => post<{ id: string; full?: string; pending: boolean }>("/api-keys", input));
}
/** Can the signed-in person reveal this key now? (approved write key, they requested it, secret not yet shown, not expired) */
export function keyRevealable(id: string): boolean {
  const v = VAULT.get(id); return !!v && v.until > Date.now() && isSamePerson(v.by, getActor().name);
}
/** Shows the secret of an approved key ONCE to its requester, then forgets it. */
export function revealKey(id: string) {
  return viaApi<{ full: string; label: string; scope: string }>(() => {
    gate("revealing an API key");
    const k = API.keys.find((x) => x.id === id); const v = VAULT.get(id); if (!k || !v) throw new SodError("This key was already shown or is not available. Create a new key if it was lost.");
    if (!isSamePerson(v.by, getActor().name)) throw new SodError("Only the admin who requested this key can see it.");
    VAULT.delete(id);
    if (v.until <= Date.now()) { k.status = "Revoked"; wsLog("api.key.expired_unrevealed", k.label, "System"); throw new SodError("The reveal window has expired and the key was revoked. Create a new key."); }
    wsLog("api.key.revealed", `${k.label} (shown once to ${v.by})`, "System");
    return { full: v.full, label: k.label, scope: k.scope };
  }, () => post<{ full: string; label: string; scope: string }>(`/api-keys/${enc(id)}/reveal`, {}));
}
export function revokeKey(id: string) {
  return viaApi<ApiKey | null>(() => { gate("revoking an API key"); const k = API.keys.find((x) => x.id === id); if (!k) return null; k.status = "Revoked"; VAULT.delete(id); return k; }, () => post<ApiKey | null>(`/api-keys/${enc(id)}/revoke`, {}));
}
/** Prototype: whAdd. A webhook is created "Pending approval" (it never delivers) and a second admin must approve it. The https-only URL rule is re-checked here. */
export function addWebhook(input: { url: string; events: string[] }) {
  return viaApi<Webhook>(() => {
    gate("adding a webhook");
    if (!isSafeWebhookUrl(input.url)) throw new SodError("A valid https URL is required.");
    const events = input.events.filter((e) => WH_EVENTS.includes(e));
    const id = uid("W", API.hooks);
    const ap = requestApproval({ kind: "api.webhook", title: `Add webhook ${logSafe(input.url).slice(0, 120)}`, subject: id, payload: { id }, needs: 1, approverRoles: APPROVERS });
    const w: Webhook = { id, url: input.url, events: events.length ? events : ["control.failed"], status: "Pending approval", lastDelivery: "—", approvalId: ap.id };
    API.hooks.unshift(w); return w;
  }, () => post<Webhook>("/webhooks", input));
}
const approvedHook = (id: string): Webhook | null => {
  const w = API.hooks.find((x) => x.id === id); if (!w) return null;
  if (w.status !== "Active" && w.status !== "Paused") throw new SodError("This webhook has not been approved by a second admin.");
  return w;
};
export function testWebhook(id: string) {
  return viaApi<Webhook | null>(() => {
    gate("testing a webhook");
    const w = approvedHook(id); if (!w) return null;
    pushEvent({ ev: w.events[0] || "test.ping", res: "webhook-test", http: "200", lat: 60 + randInt(90) + "ms", when: "just now" });
    w.lastDelivery = "200 · just now"; return w;
  }, () => post<Webhook | null>(`/webhooks/${enc(id)}/test`, {}));
}
export function toggleWebhook(id: string) {
  return viaApi<Webhook | null>(() => { gate("changing a webhook"); const w = approvedHook(id); if (!w) return null; w.status = w.status === "Active" ? "Paused" : "Active"; return w; }, () => post<Webhook | null>(`/webhooks/${enc(id)}/toggle`, {}));
}
export function deleteWebhook(id: string) {
  return viaApi<Webhook | null>(() => { gate("deleting a webhook"); const w = API.hooks.find((x) => x.id === id); if (!w) return null; API.hooks = API.hooks.filter((x) => x.id !== id); return w; }, () => apiFetch<Webhook | null>(`/webhooks/${enc(id)}`, { method: "DELETE" }));
}
export function createTest(input: { name: string; target: string; schedule: string }) {
  return viaApi<CustomTest>(() => {
    gate("creating a custom test");
    const t: CustomTest = { id: uid("T", API.tests), name: input.name, target: input.target || "—", schedule: TEST_SCHEDULES.includes(input.schedule) ? input.schedule : TEST_SCHEDULES[0], last: "not run", result: "Pending" };
    API.tests.unshift(t); return t;
  }, () => post<CustomTest>("/custom-tests", input));
}
/** Prototype: ctRun. Simulated result (75% pass). A custom test's logic is NEVER executed client-side. */
export function runTest(id: string) {
  return viaApi<CustomTest | null>(() => { gate("running a custom test"); const t = API.tests.find((x) => x.id === id); if (!t) return null; t.result = randInt(100) < 75 ? "Pass" : "Fail"; t.last = "just now"; return t; }, () => post<CustomTest | null>(`/custom-tests/${enc(id)}/run`, {}));
}
export function deleteTest(id: string) {
  return viaApi<CustomTest | null>(() => { gate("deleting a custom test"); const t = API.tests.find((x) => x.id === id); if (!t) return null; API.tests = API.tests.filter((x) => x.id !== id); return t; }, () => apiFetch<CustomTest | null>(`/custom-tests/${enc(id)}`, { method: "DELETE" }));
}
const SAMPLE_EVENTS: [string, string][] = [["resource.pushed", "s3://logs-prod"], ["test.evaluated", "edge-01"], ["resource.pushed", "vpc/flow-logs"], ["test.evaluated", "iam/root"]];
export function pushTestEvent() {
  return viaApi<[string, string]>(() => {
    gate("pushing a test event");
    const s = SAMPLE_EVENTS[randInt(SAMPLE_EVENTS.length)];
    pushEvent({ ev: s[0], res: s[1], http: "200", lat: 60 + randInt(90) + "ms", when: "just now" }); return s;
  }, () => post<[string, string]>("/api-events/test", {}));
}
