import { afterEach, describe, expect, it } from "vitest";
import { approvals, requestApproval, type NewApproval } from "@/lib/approvals";
import { decideApproval, registerApprovalHandler } from "@/lib/approvalKit";
import { inlineApprovalsFor, inlineHome } from "@/lib/inboxApprovals";
import { notificationsFor } from "@/lib/notifications";
import { SodError } from "@/lib/sod";
import { appStore } from "@/lib/store";

/* Decisions from the notifications panel use the shared four-eyes path, so the rules are the engine's. vitest runs without a DOM: only the logic is tested here. */
let applied: string[] = [];
registerApprovalHandler("q.inbox-test", { apply: (a) => { applied.push(a.id); } });
const as = (role: string) => appStore.set({ role });
const raise = (o: Partial<NewApproval> = {}) => requestApproval({ kind: "q.inbox-test", title: "Send questionnaire for the inbox test", approverRoles: ["admin"], ...o });
afterEach(() => { approvals.set({ list: [] }); applied = []; as("super"); });

describe("approvals offered from the notifications panel", () => {
  it("maps only the shared-path kinds to a module", () => {
    expect(inlineHome("vendor.tier")).toBe("vendors"); expect(inlineHome("ai.guardrail")).toBe("ai"); expect(inlineHome("api.key")).toBe("api");
    for (const other of ["access-request", "offboard", "team-role", "mfa-reset-member", "risk.accept", "policy.approve", "evidence.delete", "issue.close", "control.exception"]) expect(inlineHome(other)).toBeNull();
  });
  it("lists a request for a different eligible person, never for the requester or the wrong role", () => {
    as("admin"); const a = raise();
    expect(inlineApprovalsFor("admin").map((x) => x.id)).not.toContain(a.id); // own request
    as("admin2"); expect(inlineApprovalsFor("admin2").map((x) => x.id)).toContain(a.id);
    as("employee"); expect(inlineApprovalsFor("employee")).toEqual([]);
    as("auditor"); expect(inlineApprovalsFor("auditor")).toEqual([]);
  });
  it("does not list the subject of the request, an expired request, a kind without a handler, or another domain", () => {
    as("admin");
    const subject = raise({ forbid: ["Casey Morgan"] }); // admin2 is Casey Morgan: the subject can never approve
    const open = raise();
    raise({ kind: "q.nohandler" }); raise({ domain: "admin" });
    const old = raise(); old.expiresAt = Date.now() - 1000;
    as("admin2");
    const ids = inlineApprovalsFor("admin2").map((x) => x.id);
    expect(ids).toEqual([open.id]); // only the ordinary, live, ws request with a handler
    expect(ids).not.toContain(subject.id); expect(ids).not.toContain(old.id);
  });
  it("returns nothing when asked for a role other than the signed-in one", () => {
    as("admin"); raise(); as("admin2");
    expect(inlineApprovalsFor("admin")).toEqual([]);
  });
  it("appears in the bell as an approval item that carries its id and opens the module", () => {
    as("admin"); raise(); as("admin2");
    const n = notificationsFor("admin2", "ws").find((x) => x.approvalId);
    expect(n).toBeTruthy(); expect(n?.kind).toBe("approval");
  });
});

describe("deciding from the panel", () => {
  it("needs a reason of at least 10 characters and records nothing otherwise", () => {
    as("admin"); const a = raise(); as("admin2");
    expect(() => decideApproval(a.id, "approve", "short")).toThrow(SodError);
    expect(approvals.get().list.find((x) => x.id === a.id)?.status).toBe("Pending"); expect(applied).toEqual([]);
  });
  it("applies the change once, on the second person's approval, and the item leaves the list", () => {
    as("admin"); const a = raise(); as("admin2");
    decideApproval(a.id, "approve", "Checked the scope with the owner");
    expect(applied).toEqual([a.id]);
    expect(inlineApprovalsFor("admin2")).toEqual([]);
  });
  it("refuses the requester, and refuses before recording when the change could not be applied", () => {
    as("admin"); const a = raise();
    expect(() => decideApproval(a.id, "approve", "Approving my own request")).toThrow(SodError);
    as("admin2"); const stray = raise({ kind: "q.nohandler" });
    as("admin"); expect(() => decideApproval(stray.id, "approve", "No handler is registered")).toThrow(/cannot be applied/);
    expect(approvals.get().list.find((x) => x.id === stray.id)?.status).toBe("Pending"); // not stranded as Approved
  });
  it("rejecting also needs a reason and ends the request", () => {
    as("admin"); const a = raise(); as("admin2");
    expect(() => decideApproval(a.id, "reject", "no")).toThrow(SodError);
    decideApproval(a.id, "reject", "Out of scope for this quarter");
    expect(approvals.get().list.find((x) => x.id === a.id)?.status).toBe("Rejected"); expect(applied).toEqual([]);
  });
});
