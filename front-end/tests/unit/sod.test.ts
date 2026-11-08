import { beforeEach, describe, expect, it } from "vitest";
import { SOD, SodError, assertNotSelf, assertRole, baseRole, getActor, hasRole, isMe, isSamePerson, personKey, sodReason } from "@/lib/sod";
import { appStore } from "@/lib/store";

beforeEach(() => appStore.set({ role: "admin" }));

describe("personKey / isSamePerson", () => {
  it("normalises name variants to the same key", () => {
    expect(personKey("J. Avery")).toBe("j avery");
    expect(personKey("Jordan Avery")).toBe("j avery");
    expect(personKey("Avery, Jordan")).toBe("a jordan"); // documented limitation: "Last, First" is not reordered
    expect(personKey("  jordan   AVERY ")).toBe("j avery");
  });
  it("returns empty for blank input", () => {
    expect(personKey("")).toBe("");
    expect(personKey(null)).toBe("");
    expect(personKey(undefined)).toBe("");
  });
  it("matches seed short names to persona full names", () => {
    expect(isSamePerson("J. Avery", "Jordan Avery")).toBe(true);
    expect(isSamePerson("O. Hart", "Owen Hart")).toBe(true);
  });
  it("distinguishes different people and never matches blanks", () => {
    expect(isSamePerson("Jordan Avery", "Casey Morgan")).toBe(false);
    expect(isSamePerson("", "")).toBe(false);
    expect(isSamePerson(null, undefined)).toBe(false);
  });
});

describe("baseRole / hasRole", () => {
  it("strips the trailing 2 of peer personas", () => {
    expect(baseRole("super2")).toBe("super");
    expect(baseRole("admin2")).toBe("admin");
    expect(baseRole("owner")).toBe("owner");
  });
  it("hasRole matches on base role", () => {
    expect(hasRole("admin2", "admin")).toBe(true);
    expect(hasRole("owner2", "admin", "owner")).toBe(true);
    expect(hasRole("employee", "admin", "owner")).toBe(false);
    expect(hasRole("support", "super")).toBe(false);
  });
});

describe("acting persona", () => {
  it("getActor follows appStore role", () => {
    appStore.set({ role: "owner2" });
    expect(getActor()).toMatchObject({ roleId: "owner2", base: "owner", name: "Taylor Reed" });
    appStore.set({ role: "super" });
    expect(getActor().name).toBe("Dana Whitfield");
  });
  it("isMe compares against the persona", () => {
    expect(isMe("J. Avery")).toBe(true);
    expect(isMe("Casey Morgan")).toBe(false);
  });
  it("assertNotSelf throws SodError when the actor is among others", () => {
    expect(() => assertNotSelf("you own it", "O. Hart", "J. Avery")).toThrow(SodError);
    expect(() => assertNotSelf("you own it", "O. Hart", undefined, "")).not.toThrow();
    expect(() => assertNotSelf("you own it")).not.toThrow();
  });
  it("sodReason returns a message instead of throwing", () => {
    expect(sodReason("you own it", "Jordan Avery")).toMatch(/Segregation of duties: you own it/);
    expect(sodReason("you own it", "Casey Morgan")).toBeNull();
  });
  it("assertRole is deny-by-default", () => {
    expect(() => assertRole("x", "admin")).not.toThrow();
    appStore.set({ role: "employee" });
    expect(() => assertRole("x", "admin", "owner")).toThrow(/Not permitted/);
    appStore.set({ role: "admin2" });
    expect(() => assertRole("x", "admin")).not.toThrow();
  });
});

describe("thresholds", () => {
  it("documents the dual-control constants", () => {
    expect(SOD.RISK_BOARD_THRESHOLD).toBe(15);
    expect(SOD.RISK_MAX_ACCEPT_MONTHS).toBe(12);
    expect(SOD.FINANCE_DUAL_USD).toBe(1000);
  });
});
