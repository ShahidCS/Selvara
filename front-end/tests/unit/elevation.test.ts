import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_AUDIT, verifyChain } from "@/lib/adminAudit";
import { ELEV_MAX_MIN, assertElevated, elevationActive, elevationLive, endElevation, expireIfDue, startElevation } from "@/lib/elevation";
import { SodError } from "@/lib/sod";
import { appStore } from "@/lib/store";

const REASON = "Investigating a billing dispute";
const TICKET = "SEC-1234";
const MIN = 60_000;
const T0 = Date.UTC(2026, 0, 15, 12, 0, 0);

const as = (role: string) => appStore.set({ role });
const elevate = (minutes = 15) => startElevation("super", REASON, minutes, TICKET);
const auditCount = (action: string) => ADMIN_AUDIT.filter((e) => e.action === action).length;

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0); as("super"); endElevation("ended"); });
afterEach(() => { endElevation("ended"); vi.useRealTimers(); as("admin"); });

describe("elevated session: start", () => {
  it("only a platform super admin can elevate", () => {
    expect(startElevation("admin", REASON, 15, TICKET)).toEqual({ ok: false, why: "forbidden" });
    expect(startElevation("support", REASON, 15, TICKET)).toEqual({ ok: false, why: "forbidden" });
    expect(elevationLive()).toBe(false);
  });

  it("needs a reason, a ticket and a duration within the maximum", () => {
    expect(startElevation("super", "too short", 15, TICKET)).toEqual({ ok: false, why: "reason" });
    expect(startElevation("super", REASON, 15, "no ticket")).toEqual({ ok: false, why: "ticket" });
    expect(startElevation("super", REASON, 0, TICKET)).toEqual({ ok: false, why: "minutes" });
    expect(startElevation("super", REASON, ELEV_MAX_MIN + 1, TICKET)).toEqual({ ok: false, why: "minutes" });
    expect(elevationLive()).toBe(false);
  });

  it("starts live and ends exactly duration after the real clock", () => {
    const r = elevate(15);
    expect(r).toEqual({ ok: true, until: T0 + 15 * MIN });
    expect(elevationLive()).toBe(true);
    expect(elevationActive()).toBe(true);
  });

  it("cannot be started twice while one is active", () => {
    elevate();
    expect(elevate()).toEqual({ ok: false, why: "active" });
  });
});

describe("elevated session: expiry", () => {
  it("is live up to the last millisecond and not live at the deadline", () => {
    elevate(15);
    vi.setSystemTime(T0 + 15 * MIN - 1);
    expect(elevationLive()).toBe(true);
    expect(expireIfDue()).toBe(false);
    vi.setSystemTime(T0 + 15 * MIN);
    expect(elevationLive()).toBe(false); // the pure check already refuses, even before anything drops the session
  });

  it("expireIfDue drops an elapsed session once and writes one audit entry", () => {
    elevate(15);
    const before = auditCount("admin.elevation.expired");
    vi.setSystemTime(T0 + 16 * MIN);
    expect(expireIfDue()).toBe(true);
    expect(expireIfDue()).toBe(false); // idempotent: nothing left to expire, nothing logged
    expect(auditCount("admin.elevation.expired")).toBe(before + 1);
    expect(verifyChain()).toBe(true);
  });

  it("assertElevated refuses after expiry without any timer having fired", () => {
    elevate(1);
    expect(() => assertElevated()).not.toThrow();
    vi.setSystemTime(T0 + 2 * MIN);
    expect(() => assertElevated()).toThrow(SodError);
    expect(elevationLive()).toBe(false);
  });

  it("an expired session can be replaced, and the new one counts from the new start", () => {
    elevate(5);
    vi.setSystemTime(T0 + 30 * MIN);
    expect(elevationActive()).toBe(false); // drops the expired session
    const r = elevate(10);
    expect(r).toEqual({ ok: true, until: T0 + 40 * MIN }); // starts at the real clock, not at a stale one
    vi.setSystemTime(T0 + 39 * MIN);
    expect(elevationLive()).toBe(true);
    vi.setSystemTime(T0 + 40 * MIN);
    expect(elevationLive()).toBe(false);
  });
});

describe("elevated session: ending early and role changes", () => {
  it("ending early is idempotent and logged once", () => {
    elevate();
    const before = auditCount("admin.elevation.ended");
    expect(endElevation("ended")).toBe(true);
    expect(endElevation("ended")).toBe(false);
    expect(auditCount("admin.elevation.ended")).toBe(before + 1);
    expect(elevationLive()).toBe(false);
  });

  it("switching to another role never inherits the session", () => {
    elevate();
    as("admin");
    expect(elevationLive()).toBe(false); // pure check refuses at once
    expect(elevationActive()).toBe(false);
    as("super");
    expect(elevationLive()).toBe(false); // and it does not come back: the session was dropped
  });

  it("a second super admin is not elevated by the first one's session", () => {
    elevate();
    as("super2");
    expect(elevationLive()).toBe(false);
  });
});
