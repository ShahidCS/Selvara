import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* Production mode (NEXT_PUBLIC_API_MODE=http): there are no demo accounts and every sign-in step goes to the server. The modules are loaded fresh
   with the production settings; fetch is a stub that records each call and answers like the API contract in docs/security/CONTROLS.md. */
const calls: { url: string; method: string; body: unknown; credentials?: string }[] = [];
let reply: (url: string) => { status: number; json?: unknown } = () => ({ status: 200, json: {} });
let session: typeof import("@/lib/session"); let auth: typeof import("@/services/authApi"); let store: typeof import("@/lib/store");
beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_API_MODE", "http"); vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.test");
  vi.resetModules();
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, method: String(init.method || "GET"), body: init.body ? JSON.parse(String(init.body)) : undefined, credentials: init.credentials as string });
    const r = reply(url);
    return { ok: r.status < 400, status: r.status, statusText: "x", json: async () => r.json } as Response;
  });
  session = await import("@/lib/session"); auth = await import("@/services/authApi"); store = await import("@/lib/store");
});
afterAll(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

describe("production sign-in", () => {
  it("has no demo accounts", () => {
    expect(session.DEMO_ENABLED).toBe(false);
  });
  it("sends the first step to the server with the session cookie, and maps its answers to the generic messages", async () => {
    reply = () => ({ status: 200, json: { step: "mfa", ticket: "t1", method: "totp" } });
    const st = await auth.signIn("alex.kim@company.example", "Lantern-orbit-Quince-71");
    expect(st).toEqual({ step: "mfa", ticket: "t1", method: "totp" });
    expect(calls.at(-1)).toEqual(expect.objectContaining({ url: "https://api.example.test/auth/sign-in", method: "POST", credentials: "include" }));
    reply = () => ({ status: 401 }); await expect(auth.signIn("x@company.example", "y")).rejects.toThrow(session.SIGNIN_FAILED);
    reply = () => ({ status: 428 }); await expect(auth.signIn("x@company.example", "y")).rejects.toBeInstanceOf(session.ChallengeRequired);
    reply = () => ({ status: 403 }); await expect(auth.signIn("x@company.example", "y")).rejects.toThrow(/network is blocked/);
    reply = () => ({ status: 423 }); await expect(auth.signIn("x@company.example", "y")).rejects.toThrow(/Too many attempts/);
  });
  it("a demo account email is just an unknown email to the server", async () => {
    reply = () => ({ status: 401 });
    await expect(auth.signIn("jordan.avery@demo.selvara.test", ["selvara", "demo"].join("-"))).rejects.toThrow(session.SIGNIN_FAILED);
    expect(store.appStore.get().signedIn).toBe(false);
  });
  it("the second step is verified by the server, which then sets who is signed in", async () => {
    reply = () => ({ status: 200, json: { roleId: "employee", who: "Alex Kim", person: "Alex Kim", previous: null, failedSince: 0 } });
    await auth.completeSignIn("t1", "123456");
    expect(calls.at(-1)).toEqual(expect.objectContaining({ url: "https://api.example.test/auth/sign-in/verify", body: { ticket: "t1", code: "123456", recovery: false } }));
    expect(store.appStore.get()).toEqual(expect.objectContaining({ signedIn: true, role: "employee", who: "Alex Kim" }));
  });
  it("a reset request shows no link: the server emails it", async () => {
    reply = () => ({ status: 202 });
    expect(await auth.requestReset("alex.kim@company.example")).toEqual({ token: null });
    expect(calls.at(-1)!.url).toBe("https://api.example.test/auth/password/reset-request");
  });
  it("a session the server no longer knows signs out on load", async () => {
    reply = () => ({ status: 401 });
    expect(await auth.confirmSession()).toBe(false);
    expect(store.appStore.get().signedIn).toBe(false);
  });
});
