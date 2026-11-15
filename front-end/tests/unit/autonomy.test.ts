import { afterEach, describe, expect, it } from "vitest";
import { approvals, getApproval } from "@/lib/approvals";
import { decideApproval } from "@/lib/approvalKit";
import { WS_AUDIT } from "@/lib/audit";
import { SodError } from "@/lib/sod";
import { appStore } from "@/lib/store";
import { AUTONOMY, LADDER, nextRung, trackRecord } from "@/features/assistant/lib/autonomy";
import { ASST, createAgent, decideRun, findAgent, lowerAutonomy, raiseBlockReason, requestRaise, runAgent } from "@/features/assistant/services/assistant";

/* Autonomy ladder. Personas: admin = Jordan Avery, admin2 = Casey Morgan, owner = Owen Hart, owner2 = Taylor Reed, employee = Priya Nair. No DOM. */
const as = (role: string) => appStore.set({ role });
const reason = "Its suggestions have been accurate for weeks";
const snapshot = JSON.parse(JSON.stringify({ agents: ASST.agents, runs: ASST.runs }));
afterEach(() => { ASST.agents = JSON.parse(JSON.stringify(snapshot.agents)); ASST.runs = JSON.parse(JSON.stringify(snapshot.runs)); approvals.set({ list: [] }); as("super"); });

/** An active agent created by Jordan Avery (enabled by Casey Morgan), with `n` suggestions triggered by Jordan and approved by Owen Hart. */
async function seasoned(n: number, rejectLast = false) {
  as("admin"); const a = await createAgent({ name: "Test agent", trigger: "Control fails", runsAs: "Read-only" });
  as("admin2"); await decideApproval(a.pendingApproval as string, "approve", "Reviewed the agent setup");
  for (let i = 0; i < n; i++) {
    as("admin"); await runAgent(a.id);
    as("owner"); await decideRun(ASST.runs[0].id, rejectLast && i === n - 1 ? "Rejected" : "Approved & applied", "Checked the proposed change");
  }
  return findAgent(a.id)!;
}
const decide = async (id: string, role: string) => { as(role); return decideApproval(id, "approve", "Track record reviewed and fine"); };

describe("autonomy ladder", () => {
  it("starts every new agent on the lowest rung, whatever is asked", async () => {
    as("admin"); const a = await createAgent({ name: "Eager", trigger: "Control fails", runsAs: "Service account", autonomy: "Acts (logged)" });
    expect(a.autonomy).toBe(LADDER[0]);
    expect(nextRung(LADDER[0])).toBe("Acts (logged)"); expect(nextRung("Acts (logged)")).toBeNull();
  });
  it("needs a track record before it can be raised", async () => {
    const a = await seasoned(AUTONOMY.TRACK_MIN - 1);
    as("admin"); expect(raiseBlockReason(a)).toMatch(/needs 3 approved suggestions/);
    await expect(requestRaise(a.id, reason)).rejects.toBeInstanceOf(SodError);
  });
  it("refuses after a recent rejection", async () => {
    const a = await seasoned(AUTONOMY.TRACK_MIN + 1, true);
    expect(trackRecord(a, ASST.runs).recentRejection).toBe(true);
    as("admin"); expect(raiseBlockReason(a)).toMatch(/rejected/);
  });
  it("raises one rung with a second person's approval, never the creator's or the requester's", async () => {
    const a = await seasoned(AUTONOMY.TRACK_MIN);
    as("owner"); const r = await requestRaise(a.id, reason);
    expect(r!.agent.autonomy).toBe("Suggests only");
    await expect(decide(r!.approvalId, "owner")).rejects.toBeInstanceOf(SodError); // requester
    await expect(decide(r!.approvalId, "admin")).rejects.toBeInstanceOf(SodError); // creator
    await expect(decide(r!.approvalId, "employee")).rejects.toBeInstanceOf(SodError); // role
    await decide(r!.approvalId, "admin2");
    expect(findAgent(a.id)!.autonomy).toBe("Acts (logged)");
    expect(getApproval(r!.approvalId)!.status).toBe("Approved");
    expect(WS_AUDIT.some((e) => e.action === "assistant.agent.autonomy_raised" && e.target.includes("Casey Morgan"))).toBe(true);
    // an agent that acts applies its changes at once
    as("owner"); const run = await runAgent(a.id); expect(run!.suggest).toBe(false);
    expect(ASST.runs[0].decision).toBe("Auto-applied");
  });
  it("needs a reason and refuses a second request while one is pending", async () => {
    const a = await seasoned(AUTONOMY.TRACK_MIN);
    as("owner"); await expect(requestRaise(a.id, "short")).rejects.toBeInstanceOf(SodError);
    await requestRaise(a.id, reason);
    await expect(requestRaise(a.id, reason)).rejects.toThrow(/already awaiting/);
  });
  it("re-checks the record when the approval is decided", async () => {
    const a = await seasoned(AUTONOMY.TRACK_MIN);
    as("owner"); const r = await requestRaise(a.id, reason);
    // a rejection lands before the approver decides
    as("admin"); await runAgent(a.id); as("owner"); await decideRun(ASST.runs[0].id, "Rejected", "Wrong owner was emailed");
    await expect(decide(r!.approvalId, "admin2")).rejects.toThrow(/rejected/);
    expect(findAgent(a.id)!.autonomy).toBe("Suggests only");
  });
  it("lowers at once, audited, and only admins or owners may", async () => {
    as("employee"); await expect(lowerAutonomy("AG1")).rejects.toBeInstanceOf(SodError);
    as("owner"); const a = await lowerAutonomy("AG1");
    expect(a!.autonomy).toBe("Suggests only");
    expect(WS_AUDIT.some((e) => e.action === "assistant.agent.autonomy_lowered" && e.target.includes("Owen Hart"))).toBe(true);
    await expect(lowerAutonomy("AG1")).rejects.toThrow(/lowest/);
    as("owner"); expect(raiseBlockReason(findAgent("AG1")!)).not.toBeNull(); // climbing back needs the record again
  });
});
