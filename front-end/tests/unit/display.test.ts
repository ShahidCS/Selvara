import { afterEach, describe, expect, it, vi } from "vitest";
import { appStore, loadPersisted, persist, PKEY } from "@/lib/store";

/* vitest runs without a DOM: a tiny in-memory localStorage stands in. */
function fakeStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  vi.stubGlobal("localStorage", { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
  return m;
}
afterEach(() => { vi.unstubAllGlobals(); appStore.set({ density: "comfortable", theme: "auto", hydrated: false }); });

describe("display preferences", () => {
  it("saves and loads the density with the other choices", () => {
    const m = fakeStorage();
    appStore.set({ density: "compact", theme: "dark" }); persist();
    expect(JSON.parse(m.get(PKEY) || "{}")).toMatchObject({ density: "compact", theme: "dark" });
    appStore.set({ density: "comfortable", theme: "auto" });
    loadPersisted(["super"]);
    expect(appStore.get().density).toBe("compact");
    expect(appStore.get().theme).toBe("dark");
  });
  it("ignores an unknown density and keeps the default", () => {
    fakeStorage({ [PKEY]: JSON.stringify({ density: "huge", theme: "light" }) });
    loadPersisted(["super"]);
    expect(appStore.get().density).toBe("comfortable");
  });
  it("survives unreadable storage", () => {
    fakeStorage({ [PKEY]: "{not json" });
    loadPersisted(["super"]);
    expect(appStore.get().hydrated).toBe(true);
    expect(appStore.get().density).toBe("comfortable");
  });
});
