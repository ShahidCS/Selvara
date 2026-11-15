import { afterEach, describe, expect, it } from "vitest";
import { approvals, requestApproval, type Approval } from "@/lib/approvals";
import { decideApproval, registerKind, whyCannotDecide } from "@/lib/approvalFlow";
import { actsAs, delegations, DELEGATION, DAY_MS, givenBy, givenTo } from "@/lib/delegation";
import { WS_AUDIT } from "@/lib/audit";
import { SodError } from "@/lib/sod";
import { appStore } from "@/lib/store";
import { createDelegation, eligibleDelegates, revokeDelegation, sweepDelegations } from "@/services/delegation";

/* Delegation of a named approver slot. Personas: admin = Jordan Avery, admin2 = Casey Morgan, owner = Owen Hart, owner2 = Taylor Reed,
   employee = Priya Nair, auditor = Morgan Blake. vitest runs without a DOM: only the rules are tested here. */
let applied: string[] = [];
registerKind("deleg.test", { describe: () => "delegation test", apply: (a) => { applied.push(a.id); } });
const as = (role: string) => appStore.set({ role });
const reason = "Away on leave, covering the approvals";
const raise = (o: { by?: string; named?: string; domain?: "ws" | "admin"; needs?: 1 | 2; forbid?: string[]; roles?: string[] } = {}): Approval => {
  as(o.by ?? "employee");
  return requestApproval({ kind: "deleg.test", title: "Approve the delegated thing", approverRoles: o.roles ?? ["admin", "owner"], needs: o.needs ?? 1, domain: o.domain ?? "ws", forbid: o.forbid, payload: { approver: o.named ?? "Jordan Avery" } });
};
const delegate = async (from: string, to: string, extra: Partial<{ days: number; reason: string }> = {}) => { as(from); return createDelegation({ to, days: extra.days ?? 7, reason: extra.reason ?? reason }); };
afterEach(() => { approvals.set({ list: [] }); delegations.set({ list: [] }); applied = []; as("super"); });

describe("starting a delegation", () => {
  it("lets an admin or owner delegate to another admin or owner, with a limit and a reason", async () => {
    const d = await delegate("admin", "Casey Morgan", { days: 3 });
    expect(d.from).toBe("Jordan Avery"); expect(d.to).toBe("Casey Morgan");
    expect(d.until - d.createdAt).toBe(3 * DAY_MS);
    expect(WS_AUDIT.some((e) => e.action === "delegation.created" && e.target.includes("Casey Morgan"))).toBe(true);
    const o = await delegate("owner", "Taylor Reed");
    expect(o.from).toBe("Owen Hart");
  });
  it("refuses everyone else, and a delegate that is not an admin or owner", async () => {
    for (const role of ["employee", "auditor", "analyst", "viewer", "vendor", "super"]) await expect(delegate(role, "Casey Morgan")).rejects.toBeInstanceOf(SodError);
    await expect(delegate("admin", "Priya Nair")).rejects.toThrow(/another admin or owner/);
    await expect(delegate("admin", "Dana Whitfield")).rejects.toThrow(/another admin or owner/); // a platform super admin
    await expect(delegate("admin", "Nobody At All")).rejects.toThrow(/another admin or owner/);
    expect(delegations.get().list).toEqual([]);
  });
  it("refuses delegating to yourself, a bad length, a short reason, a second live delegation, and a loop", async () => {
    await expect(delegate("admin", "Jordan Avery")).rejects.toThrow(/yourself/);
    for (const days of [0, -1, DELEGATION.MAX_DAYS + 1, 1.5, NaN]) await expect(delegate("admin", "Casey Morgan", { days })).rejects.toBeInstanceOf(SodError);
    await expect(delegate("admin", "Casey Morgan", { reason: "short" })).rejects.toThrow(/at least 10/);
    await delegate("admin", "Casey Morgan");
    await expect(delegate("admin", "Owen Hart")).rejects.toThrow(/already have an active delegation/);
    await expect(delegate("admin2", "Jordan Avery")).rejects.toThrow(/delegated to you/); // A to B and B back to A
    expect(delegations.get().list).toHaveLength(1);
  });
  it("offers only other admins and owners", () => {
    as("admin"); expect(eligibleDelegates().sort()).toEqual(["Casey Morgan", "Owen Hart", "Taylor Reed"]);
  });
});

describe("acting for the named approver", () => {
  it("without a delegation only the named approver may decide", () => {
    const a = raise();
    as("admin2"); expect(whyCannotDecide(a)).toMatch(/named approver/);
    as("admin"); expect(whyCannotDecide(a)).toBeNull();
  });
  it("a live delegation lets the delegate decide, records it as on behalf, and the change is applied", async () => {
    const a = raise(); await delegate("admin", "Casey Morgan");
    as("admin2"); expect(whyCannotDecide(a)).toBeNull();
    decideApproval(a.id, true, "Checked against the policy review notes");
    expect(applied).toEqual([a.id]);
    expect((approvals.get().list.find((x) => x.id === a.id)?.payload.delegated as Record<string, string>)["Casey Morgan"]).toBe("Jordan Avery");
    expect(WS_AUDIT.some((e) => e.action.endsWith(".on_behalf") && e.target.includes("on behalf of Jordan Avery"))).toBe(true);
  });
  it("still needs the reason, and never lets the delegate decide what they raised", async () => {
    await delegate("admin", "Casey Morgan");
    const a = raise(); as("admin2");
    expect(() => decideApproval(a.id, true, "short")).toThrow(SodError);
    const own = raise({ by: "admin2" }); // Casey raised it, so Casey cannot decide it even for Jordan
    expect(whyCannotDecide(own)).toMatch(/own request/);
    expect(() => decideApproval(own.id, true, "Approving my own request now")).toThrow(SodError);
  });
  it("does not cover a request where the delegator could not decide it themselves", async () => {
    await delegate("admin", "Casey Morgan");
    const byNamed = raise({ by: "admin", named: "Jordan Avery" }); // Jordan raised it and is named: Jordan cannot, so neither can the delegate
    as("admin2"); expect(actsAs("Jordan Avery", byNamed)).toBe(false); expect(whyCannotDecide(byNamed)).toBeTruthy();
    const subject = raise({ forbid: ["Jordan Avery"] }); // Jordan is the subject
    as("admin2"); expect(actsAs("Jordan Avery", subject)).toBe(false);
  });
  it("never covers platform (admin domain) approvals", async () => {
    await delegate("admin", "Casey Morgan");
    const a = raise({ domain: "admin", roles: ["admin"] });
    as("admin2"); expect(actsAs("Jordan Avery", a)).toBe(false); expect(whyCannotDecide(a)).toBeTruthy();
  });
  it("does not chain: a delegate cannot pass it on, and a third person gains nothing", async () => {
    await delegate("admin", "Casey Morgan");
    await delegate("admin2", "Owen Hart"); // Casey delegates Casey's OWN slot, not Jordan's
    const a = raise(); as("owner");
    expect(actsAs("Jordan Avery", a)).toBe(false); expect(whyCannotDecide(a)).toMatch(/named approver/);
    const forCasey = raise({ named: "Casey Morgan" }); as("owner");
    expect(actsAs("Casey Morgan", forCasey)).toBe(true); // Casey's own delegation does cover Casey's own slot
  });
  it("covers only the delegate: another person and a role without an approver role gain nothing", async () => {
    const a = raise(); await delegate("admin", "Casey Morgan");
    as("owner"); expect(whyCannotDecide(a)).toMatch(/named approver/);
    as("employee"); expect(actsAs("Jordan Avery", a)).toBe(false);
  });
  it("with two approvers, the delegate counts as the named person but a second different approver is still needed", async () => {
    const a = raise({ needs: 2 }); await delegate("admin", "Casey Morgan");
    as("admin2"); decideApproval(a.id, true, "First approval, for the named approver");
    expect(applied).toEqual([]); // one of two
    expect(() => decideApproval(a.id, true, "A second approval from the same person")).toThrow(SodError);
    as("owner"); decideApproval(a.id, true, "Second approval from a different person");
    expect(applied).toEqual([a.id]);
  });
});

describe("ending a delegation", () => {
  it("stops working when it expires, and the expiry is audited once", async () => {
    const a = raise(); const d = await delegate("admin", "Casey Morgan");
    d.until = Date.now() - 1000;
    as("admin2"); expect(whyCannotDecide(a)).toMatch(/named approver/);
    sweepDelegations(); sweepDelegations();
    expect(WS_AUDIT.filter((e) => e.action === "delegation.expired")).toHaveLength(1);
    expect(givenBy("Jordan Avery")).toBeUndefined();
  });
  it("the delegator can end it at once, and a company admin can end anyone's; others cannot", async () => {
    const a = raise(); const d = await delegate("owner", "Casey Morgan", {}); // Owen Hart delegates
    as("employee"); await expect(revokeDelegation(d.id)).rejects.toThrow(/Only the person who delegated/);
    as("owner2"); await expect(revokeDelegation(d.id)).rejects.toThrow(/Only the person who delegated/);
    as("admin"); await revokeDelegation(d.id); // a company admin may
    expect(givenTo("Casey Morgan")).toEqual([]);
    await expect(revokeDelegation(d.id)).rejects.toThrow(/already ended/);
    const e = await delegate("admin", "Casey Morgan"); as("admin"); await revokeDelegation(e.id);
    as("admin2"); expect(whyCannotDecide(a)).toMatch(/named approver/);
    expect(WS_AUDIT.filter((x) => x.action === "delegation.revoked")).toHaveLength(2);
    await expect(revokeDelegation("DG-999")).rejects.toThrow(/not found/);
  });
});
