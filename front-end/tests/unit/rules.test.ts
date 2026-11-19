import { describe, expect, it } from "vitest";
import { approvalBlock, isPrivilegedRole, nameBlock, reasonBlock, roleChangeBlock, secondAdminBlock, withdrawBlock } from "@/lib/rules";

/* Decision D3: the rules are pure functions shared by the server (which enforces them) and the browser (which explains them). */
const base = { status: "Pending", expiresAt: 2_000, approverRoles: ["admin"], requestedBy: "u1", forbid: ["u3"], votes: [] as string[] };
describe("shared rules", () => {
  it("approval: only a listed role, never the requester, the subject or a second vote; pending and unexpired only", () => {
    expect(approvalBlock({ key: "u2", base: "admin" }, base, 1_000)).toBeNull();
    expect(approvalBlock({ key: "u1", base: "admin" }, base, 1_000)).toMatch(/own request/);
    expect(approvalBlock({ key: "u3", base: "admin" }, base, 1_000)).toMatch(/subject or owner/);
    expect(approvalBlock({ key: "u2", base: "admin" }, { ...base, votes: ["u2"] }, 1_000)).toMatch(/already approved/);
    expect(approvalBlock({ key: "u2", base: "owner" }, base, 1_000)).toMatch(/Only admin/);
    expect(approvalBlock({ key: "u2", base: "admin" }, base, 2_000)).toBe("Request has expired.");
    expect(approvalBlock({ key: "u2", base: "admin" }, { ...base, status: "Rejected" }, 1_000)).toBe("Request is rejected.");
    expect(approvalBlock({ key: "", base: "admin" }, { ...base, requestedBy: "" }, 1_000)).toBeNull(); // an empty key never matches
  });
  it("withdraw: the requester, while pending", () => {
    expect(withdrawBlock({ key: "u1", base: "admin" }, base)).toBeNull();
    expect(withdrawBlock({ key: "u2", base: "admin" }, base)).toMatch(/Only the requester/);
    expect(withdrawBlock({ key: "u1", base: "admin" }, { ...base, status: "Approved" })).toBe("Request is approved.");
  });
  it("role change: not your own, a valid new role, never the last admin, one open request", () => {
    const c = { self: false, from: "employee", to: "analyst", valid: true, fromIsAdmin: false, toIsAdmin: false, admins: 1, pending: false };
    expect(roleChangeBlock(c)).toBeNull();
    expect(roleChangeBlock({ ...c, self: true })).toMatch(/own role/);
    expect(roleChangeBlock({ ...c, valid: false })).toBe("Choose a valid role.");
    expect(roleChangeBlock({ ...c, to: "employee" })).toBe("That is already their role.");
    expect(roleChangeBlock({ ...c, from: "admin", fromIsAdmin: true, to: "owner" })).toBe("The last remaining admin cannot be demoted.");
    expect(roleChangeBlock({ ...c, from: "admin", fromIsAdmin: true, to: "owner", admins: 2 })).toBeNull();
    expect(roleChangeBlock({ ...c, pending: true })).toMatch(/already pending/);
    expect(secondAdminBlock(0)).toMatch(/No eligible second admin/); expect(secondAdminBlock(1)).toBeNull();
    expect(["admin", "owner", "Company Admin", "super"].every(isPrivilegedRole)).toBe(true);
    expect(["employee", "analyst", "auditor", "vendor", "Risk Analyst"].some(isPrivilegedRole)).toBe(false);
  });
  it("reasons and names", () => {
    expect(reasonBlock("too short")).toMatch(/at least 10/); expect(reasonBlock("long enough now")).toBeNull();
    for (const n of ["<jordan>", "Sam {x}", 'Al "Bo"', "A\u0007B", "x"]) expect(nameBlock(n)).not.toBeNull();
    for (const n of ["Siobhán O'Brien", "Jean-Luc Picard", "李 小龍"]) expect(nameBlock(n)).toBeNull();
  });
});
