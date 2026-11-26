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
