import { afterEach, describe, expect, it, vi } from "vitest";
import { NetworkError, OFFLINE_MSG, TIMEOUT_MSG, netFetch } from "@/services/http";
import { uiMessage } from "@/lib/grcSod";

/* EDGE-10 (airplane mode mid-upload) and EDGE-11 (slow data): the person is told what happened, not a generic failure, and nothing waits forever. */
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("EDGE-10/11: network failures and timeouts", () => {
  it("a dropped connection is a NetworkError with a clear message the UI shows", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    const e = await netFetch("https://app.example.test/api/ws/evidence/E-1/files", { method: "POST" }).catch((x) => x);
    expect(e).toBeInstanceOf(NetworkError); expect(e.message).toBe(OFFLINE_MSG); expect(uiMessage(e)).toBe(OFFLINE_MSG);
  });
  it("a server that does not answer is cut off after the time limit, with its own message", async () => {
    vi.stubGlobal("fetch", vi.fn((_u: string, init: RequestInit) => new Promise((_r, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason)))));
    const e = await netFetch("https://app.example.test/api/ws/data/risk", {}, 50).catch((x) => x);
    expect(e).toBeInstanceOf(NetworkError); expect(uiMessage(e)).toBe(TIMEOUT_MSG);
  });
  it("other unexpected errors still get the generic message (no internal details)", () => {
    expect(uiMessage(new Error("TypeError: x is undefined"))).toBe("Something went wrong. Please try again.");
  });
});

describe("EDGE-11: a slow save is never sent twice", () => {
  it("a second click while the first save is in flight does nothing; after it finishes, a new click works", async () => {
    const { oneAtATime, BusyButton } = await import("@/components/ui");
    const flag = { current: false }; const seen: boolean[] = []; let calls = 0; let release!: () => void;
    const save = () => { calls++; return new Promise<void>((r) => { release = r; }); };
    const first = oneAtATime(flag, save, (b) => seen.push(b));
    await oneAtATime(flag, save, (b) => seen.push(b)); // the double click
    expect(calls).toBe(1);
    release(); await first; expect(seen).toEqual([true, false]);
    const again = oneAtATime(flag, save); release(); await again; expect(calls).toBe(2);
    expect(typeof BusyButton).toBe("function");
  });
});

describe("EDGE-16: the browser tells the server its time zone", () => {
  it("every request carries X-Time-Zone (an explicit one is kept)", async () => {
    const seen: Headers[] = [];
    vi.stubGlobal("fetch", vi.fn((_u: string, init: RequestInit) => { seen.push(new Headers(init.headers)); return Promise.resolve(new Response("{}")); }));
    await netFetch("https://app.example.test/api/ws/data/issues", { headers: { Accept: "application/json" } });
    await netFetch("https://app.example.test/api/ws/data/issues", { headers: { "X-Time-Zone": "Asia/Karachi" } });
    expect(seen[0].get("X-Time-Zone")).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone); expect(seen[0].get("Accept")).toBe("application/json");
    expect(seen[1].get("X-Time-Zone")).toBe("Asia/Karachi");
  });
});
