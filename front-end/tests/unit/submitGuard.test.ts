import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CREDIT_MS, beginWrite, guardedWrite, isBusy, onActivation, resetSubmitGuard, type GuardEl } from "@/lib/submitGuard";

/* EDGE-11: no button can send the same save twice while the first is still running. The guard is generic (installed once at the app
   root), so it is tested here with small stand-ins for DOM elements; the vitest setup has no browser. */
class FakeEl implements GuardEl {
  attrs = new Map<string, string>();
  constructor(public tag = "button") {}
  setAttribute(n: string, v: string) { this.attrs.set(n, v); }
  removeAttribute(n: string) { this.attrs.delete(n); }
  hasAttribute(n: string) { return this.attrs.has(n); }
  closest() { return this; }
}
const click = (el: FakeEl, now = 1_000) => onActivation("click", el, null, now);

beforeEach(() => resetSubmitGuard());
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

describe("EDGE-11: the button that started a save is busy until it ends", () => {
  it("a second click while the save runs is blocked; the button is marked busy, then free again", () => {
    const save = new FakeEl();
    expect(click(save)).toBe("allow");
    const done = beginWrite(1_100);
    expect(isBusy(save)).toBe(true); expect(save.attrs.get("aria-busy")).toBe("true"); expect(save.hasAttribute("data-busy")).toBe(true);
    expect(click(save, 1_200)).toBe("block");
    done(); done(); // ending twice is harmless
    expect(isBusy(save)).toBe(false); expect(save.hasAttribute("aria-busy")).toBe(false);
    expect(click(save, 1_300)).toBe("allow");
  });
  it("other buttons (Cancel) stay usable while a save runs", () => {
    const save = new FakeEl(), cancel = new FakeEl();
    click(save); const done = beginWrite(1_050);
    expect(click(cancel, 1_100)).toBe("allow");
    done();
  });
  it("a write long after the click is not credited to it; nor is a write with no click", () => {
    expect(beginWrite(5_000)).toBeTypeOf("function");
    const b = new FakeEl(); click(b, 1_000);
    beginWrite(1_000 + CREDIT_MS + 1);
    expect(isBusy(b)).toBe(false);
  });
  it("a save made of several writes keeps the button busy until the last ends", () => {
    const b = new FakeEl(); click(b);
    const one = beginWrite(1_010), two = beginWrite(1_020);
    one(); expect(isBusy(b)).toBe(true);
    two(); expect(isBusy(b)).toBe(false);
  });
  it("leaves BusyButton (which keeps its own state) alone", () => {
    const b = new FakeEl(); b.setAttribute("data-busy-owner", ""); click(b);
    beginWrite(1_010); expect(isBusy(b)).toBe(false); expect(b.hasAttribute("aria-busy")).toBe(false);
  });
  it("a form submitted with Enter and no button is guarded as a whole", () => {
    const form = new FakeEl("form");
    expect(onActivation("submit", form, null, 1_000)).toBe("allow");
    const done = beginWrite(1_010);
    expect(onActivation("submit", form, null, 1_020)).toBe("block");
    done();
  });
  it("guardedWrite ends the busy state even when the save fails", async () => {
    const b = new FakeEl(); click(b, Date.now());
    await expect(guardedWrite(() => Promise.reject(new Error("refused")))).rejects.toThrow("refused");
    expect(isBusy(b)).toBe(false);
  });
});

describe("EDGE-11: an identical write still in flight is sent once", () => {
  async function http() {
    vi.stubEnv("NEXT_PUBLIC_API_MODE", "http"); vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "/api");
    return import("@/services/http");
  }
  it("two identical POSTs share one request and one answer; a later one is sent again", async () => {
    let calls = 0; let release!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => { calls++; return new Promise<Response>((r) => { release = r; }); }));
    const { apiFetch } = await http();
    const body = JSON.stringify({ title: "Synthetic risk" });
    const a = apiFetch<{ id: string }>("/ws/risk", { method: "POST", body });
    const b = apiFetch<{ id: string }>("/ws/risk", { method: "POST", body });
    expect(calls).toBe(1);
    release(new Response(JSON.stringify({ id: "R-001" }), { status: 201 }));
    expect(await a).toEqual({ id: "R-001" }); expect(await b).toEqual({ id: "R-001" });
    const c = apiFetch("/ws/risk", { method: "POST", body }); expect(calls).toBe(2);
    release(new Response("{}")); await c;
  });
  it("different bodies, and reads, are never merged", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(() => { calls++; return Promise.resolve(new Response("{}")); }));
    const { apiFetch } = await http();
    await Promise.all([
      apiFetch("/ws/risk", { method: "POST", body: JSON.stringify({ title: "A" }) }),
      apiFetch("/ws/risk", { method: "POST", body: JSON.stringify({ title: "B" }) }),
      apiFetch("/ws/data/risk"), apiFetch("/ws/data/risk"),
    ]);
    expect(calls).toBe(4);
  });
  it("a failed write is forgotten, so trying again sends it", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(() => { calls++; return Promise.resolve(new Response(JSON.stringify({ error: "Try again." }), { status: 409 })); }));
    const { apiFetch } = await http();
    await expect(apiFetch("/ws/risk/R-1", { method: "PATCH", body: "{}" })).rejects.toThrow("Try again.");
    await expect(apiFetch("/ws/risk/R-1", { method: "PATCH", body: "{}" })).rejects.toThrow("Try again.");
    expect(calls).toBe(2);
  });
});
