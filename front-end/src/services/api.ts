/* API / Webhooks / Custom tests stubs. Mock mode performs the prototype's in-memory mutations; the caller then does wsLog / toast / bumpData.
 * The real API MUST: generate and hash API keys server-side (show the plaintext once, store only a hash + prefix), store webhook signing secrets
 * server-side, enforce RBAC on every call, and defend webhook delivery against SSRF (resolve + pin the IP, block private ranges, no redirects). */
import seed from "@/data/apiSeed.json";
import { nowStamp } from "@/lib/format";
import { randInt, secureHex } from "@/lib/security";
import { apiFetch, viaApi } from "./http";

/* eslint-disable @typescript-eslint/no-explicit-any */
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
export interface ApiKey { id: string; label: string; prefix: string; created: string; lastUsed: string; scope: string; status: string }
export interface Webhook { id: string; url: string; events: string[]; status: string; lastDelivery: string }
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

/** UI gate only (prototype: apiCanManage, exact list). Deny by default. */
export const apiCanManage = (roleId: string) => ["super", "admin", "owner"].includes(roleId);

/** Prototype: apiDoNewKey. The demo key is clearly synthetic ("ak_demo_" prefix, crypto-random) and returned ONCE; only label/prefix are stored. */
export function createKey(input: { label: string; scope: string }) {
  return viaApi<{ id: string; full: string }>(() => {
    const scope = KEY_SCOPES.includes(input.scope) ? input.scope : "Read";
    const full = "ak_demo_" + secureHex(16);
    const id = uid("K", API.keys);
    API.keys.unshift({ id, label: input.label, prefix: "ak_demo_" + full.slice(8, 12) + "…", created: nowStamp().slice(0, 10), lastUsed: "never", scope, status: "Active" });
    return { id, full };
  }, () => post<{ id: string; full: string }>("/api-keys", input));
}
export function revokeKey(id: string) {
  return viaApi<ApiKey | null>(() => { const k = API.keys.find((x) => x.id === id); if (!k) return null; k.status = "Revoked"; return k; }, () => post<ApiKey | null>(`/api-keys/${enc(id)}/revoke`, {}));
}
export function addWebhook(input: { url: string; events: string[] }) {
  return viaApi<Webhook>(() => {
    const events = input.events.filter((e) => WH_EVENTS.includes(e));
    const w: Webhook = { id: uid("W", API.hooks), url: input.url, events: events.length ? events : ["control.failed"], status: "Active", lastDelivery: "—" };
    API.hooks.unshift(w); return w;
  }, () => post<Webhook>("/webhooks", input));
}
export function testWebhook(id: string) {
  return viaApi<Webhook | null>(() => {
    const w = API.hooks.find((x) => x.id === id); if (!w) return null;
    pushEvent({ ev: w.events[0] || "test.ping", res: "webhook-test", http: "200", lat: 60 + randInt(90) + "ms", when: "just now" });
    w.lastDelivery = "200 · just now"; return w;
  }, () => post<Webhook | null>(`/webhooks/${enc(id)}/test`, {}));
}
export function toggleWebhook(id: string) {
  return viaApi<Webhook | null>(() => { const w = API.hooks.find((x) => x.id === id); if (!w) return null; w.status = w.status === "Active" ? "Paused" : "Active"; return w; }, () => post<Webhook | null>(`/webhooks/${enc(id)}/toggle`, {}));
}
export function deleteWebhook(id: string) {
  return viaApi<Webhook | null>(() => { const w = API.hooks.find((x) => x.id === id); if (!w) return null; API.hooks = API.hooks.filter((x) => x.id !== id); return w; }, () => apiFetch<Webhook | null>(`/webhooks/${enc(id)}`, { method: "DELETE" }));
}
export function createTest(input: { name: string; target: string; schedule: string }) {
  return viaApi<CustomTest>(() => {
    const t: CustomTest = { id: uid("T", API.tests), name: input.name, target: input.target || "—", schedule: TEST_SCHEDULES.includes(input.schedule) ? input.schedule : TEST_SCHEDULES[0], last: "not run", result: "Pending" };
    API.tests.unshift(t); return t;
  }, () => post<CustomTest>("/custom-tests", input));
}
/** Prototype: ctRun. Simulated result (75% pass). A custom test's logic is NEVER executed client-side. */
export function runTest(id: string) {
  return viaApi<CustomTest | null>(() => { const t = API.tests.find((x) => x.id === id); if (!t) return null; t.result = randInt(100) < 75 ? "Pass" : "Fail"; t.last = "just now"; return t; }, () => post<CustomTest | null>(`/custom-tests/${enc(id)}/run`, {}));
}
export function deleteTest(id: string) {
  return viaApi<CustomTest | null>(() => { const t = API.tests.find((x) => x.id === id); if (!t) return null; API.tests = API.tests.filter((x) => x.id !== id); return t; }, () => apiFetch<CustomTest | null>(`/custom-tests/${enc(id)}`, { method: "DELETE" }));
}
const SAMPLE_EVENTS: [string, string][] = [["resource.pushed", "s3://logs-prod"], ["test.evaluated", "edge-01"], ["resource.pushed", "vpc/flow-logs"], ["test.evaluated", "iam/root"]];
export function pushTestEvent() {
  return viaApi<[string, string]>(() => {
    const s = SAMPLE_EVENTS[randInt(SAMPLE_EVENTS.length)];
    pushEvent({ ev: s[0], res: s[1], http: "200", lat: 60 + randInt(90) + "ms", when: "just now" }); return s;
  }, () => post<[string, string]>("/api-events/test", {}));
}
