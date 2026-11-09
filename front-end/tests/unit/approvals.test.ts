import { beforeEach, describe, expect, it, vi } from "vitest";
import { approvals, approve, pendingFor, reject, requestApproval, sweepExpired, whyCannotApprove, withdraw } from "@/lib/approvals";
import { SodError } from "@/lib/sod";
import { appStore } from "@/lib/store";

const as = (role: string) => appStore.set({ role });
const REASON = "Reviewed the evidence in full";

beforeEach(() => { vi.useRealTimers(); approvals.set({ list: [] }); as("admin"); });

describe("four-eyes approval engine", () => {
  it("records the requester and starts Pending", () => {
    const a = requestApproval({ kind: "t", title: "Do thing", approverRoles: ["admin", "owner"] });
    expect(a.status).toBe("Pending");
    expect(a.requestedBy).toBe("Jordan Avery");
    expect(a.needs).toBe(1);
    expect(pendingFor("t")).toHaveLength(1);
  });

  it("requester cannot approve or reject their own request", () => {
    const a = requestApproval({ kind: "t", title: "x", approverRoles: ["admin"] });
    expect(whyCannotApprove(a)).toMatch(/your own request/);
    expect(() => approve(a.id, REASON)).toThrow(SodError);
    expect(() => reject(a.id, "no")).toThrow(SodError);
    expect(a.status).toBe("Pending");
  });

  it("a different authorised person can approve (needs=1)", () => {
    const a = requestApproval({ kind: "t", title: "x", approverRoles: ["admin"] });
    as("admin2");
    expect(whyCannotApprove(a)).toBeNull();
    expect(approve(a.id, REASON).status).toBe("Approved");
  });

  it("requires a reason of at least 10 characters", () => {
    const a = requestApproval({ kind: "t", title: "x", approverRoles: ["admin"] });
    as("admin2");
    expect(() => approve(a.id, "short")).toThrow(/at least 10/);
    expect(a.status).toBe("Pending");
  });

  it("a person outside the approver roles cannot approve", () => {
    const a = requestApproval({ kind: "t", title: "x", approverRoles: ["admin"] });
    as("employee");
    expect(whyCannotApprove(a)).toMatch(/Only admin/);
    expect(() => approve(a.id, REASON)).toThrow(SodError);
  });

  it("the forbid list blocks subjects and owners", () => {
    const a = requestApproval({ kind: "t", title: "x", approverRoles: ["admin", "owner"], forbid: ["O. Hart"] });
    as("owner");
    expect(whyCannotApprove(a)).toMatch(/subject or owner/);
    expect(() => approve(a.id, REASON)).toThrow(SodError);
    as("owner2");
    expect(whyCannotApprove(a)).toBeNull();
  });

  it("needs=2 requires two different approvers", () => {
    const a = requestApproval({ kind: "t", title: "x", approverRoles: ["admin", "owner"], needs: 2 });
    as("admin2");
    expect(approve(a.id, REASON).status).toBe("Pending");
    expect(a.approvals).toHaveLength(1);
    expect(whyCannotApprove(a)).toMatch(/already approved/);
    expect(() => approve(a.id, REASON)).toThrow(/already approved/);
    as("owner");
    expect(approve(a.id, REASON).status).toBe("Approved");
    expect(a.approvals.map((x) => x.by)).toEqual(["Casey Morgan", "Owen Hart"]);
  });

  it("only the requester can withdraw, and only while Pending", () => {
    const a = requestApproval({ kind: "t", title: "x", approverRoles: ["admin"] });
    as("admin2");
    expect(() => withdraw(a.id)).toThrow(/Only the requester/);
    as("admin");
    expect(withdraw(a.id).status).toBe("Withdrawn");
    expect(() => withdraw(a.id)).toThrow(/withdrawn/);
    as("admin2");
    expect(() => approve(a.id, REASON)).toThrow(/withdrawn/);
  });

  it("rejection is final", () => {
    const a = requestApproval({ kind: "t", title: "x", approverRoles: ["admin"] });
    as("admin2");
    expect(reject(a.id, "Not justified").status).toBe("Rejected");
    expect(() => approve(a.id, REASON)).toThrow(/rejected/);
  });

  it("expires after the TTL and can no longer be approved", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-08T10:00:00Z"));
    const a = requestApproval({ kind: "t", title: "x", approverRoles: ["admin"], ttlHours: 1 });
    as("admin2");
    vi.setSystemTime(new Date("2026-11-08T10:59:00Z"));
    expect(whyCannotApprove(a)).toBeNull();
    vi.setSystemTime(new Date("2026-11-08T11:01:00Z"));
    expect(whyCannotApprove(a)).toMatch(/expired/);
    expect(() => approve(a.id, REASON)).toThrow(SodError);
    expect(a.status).toBe("Expired");
    vi.useRealTimers();
  });

  it("sweepExpired only touches Pending requests", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-08T10:00:00Z"));
    const a = requestApproval({ kind: "t", title: "a", approverRoles: ["admin"], ttlHours: 1 });
    const b = requestApproval({ kind: "t", title: "b", approverRoles: ["admin"], ttlHours: 1 });
    withdraw(b.id);
    vi.setSystemTime(new Date("2026-11-08T12:00:00Z"));
    sweepExpired();
    expect(a.status).toBe("Expired");
    expect(b.status).toBe("Withdrawn");
    vi.useRealTimers();
  });

  it("unknown id throws", () => {
    expect(() => approve("AP-nope", REASON)).toThrow(/not found/);
    expect(() => withdraw("AP-nope")).toThrow(/not found/);
  });
});
