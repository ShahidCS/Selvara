import { afterEach, describe, expect, it } from "vitest";
import { approvals, getApproval } from "@/lib/approvals";
import { decideApproval } from "@/lib/approvalKit";
import { WS_AUDIT } from "@/lib/audit";
import { SodError } from "@/lib/sod";
import { appStore } from "@/lib/store";
import { AUTONOMY, LADDER, nextRung, trackRecord } from "@/features/assistant/lib/autonomy";
import { ASST, createAgent, decideRun, findAgent, lowerAutonomy, raiseBlockReason, rejectApplied, requestRaise, runAgent } from "@/features/assistant/services/assistant";
import { setAgentTrackRecord, TEAM_SETTINGS } from "@/services/team";

/* Autonomy ladder. Personas: admin = Jordan Avery, admin2 = Casey Morgan, owner = Owen Hart, owner2 = Taylor Reed, employee = Priya Nair. No DOM. */
const as = (role: string) => appStore.set({ role });
const reason = "Its suggestions have been accurate for weeks";
const snapshot = JSON.parse(JSON.stringify({ agents: ASST.agents, runs: ASST.runs }));
afterEach(() => { TEAM_SETTINGS.agentTrackRecord = 3; ASST.agents = JSON.parse(JSON.stringify(snapshot.agents)); ASST.runs = JSON.parse(JSON.stringify(snapshot.runs)); approvals.set({ list: [] }); as("super"); });

/** An active agent created by Jordan Avery (enabled by Casey Morgan), with `n` suggestions triggered by Jordan and approved by Owen Hart. */
async function seasoned(n: number, rejectLast = false, runsAs = "Read-only") {
  as("admin"); const a = await createAgent({ name: "Test agent", trigger: "Control fails", runsAs });
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
    const a = await seasoned(AUTONOMY.TRACK_DEFAULT - 1);
    as("admin"); expect(raiseBlockReason(a)).toMatch(/needs 3 approved suggestions/);
    await expect(requestRaise(a.id, reason)).rejects.toBeInstanceOf(SodError);
  });
  it("refuses after a recent rejection", async () => {
    const a = await seasoned(AUTONOMY.TRACK_DEFAULT + 1, true);
    expect(trackRecord(a, ASST.runs).recentRejection).toBe(true);
    as("admin"); expect(raiseBlockReason(a)).toMatch(/rejected/);
  });
  it("raises one rung with a second person's approval, never the creator's or the requester's", async () => {
    const a = await seasoned(AUTONOMY.TRACK_DEFAULT);
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
    const a = await seasoned(AUTONOMY.TRACK_DEFAULT);
    as("owner"); await expect(requestRaise(a.id, "short")).rejects.toBeInstanceOf(SodError);
    await requestRaise(a.id, reason);
    await expect(requestRaise(a.id, reason)).rejects.toThrow(/already awaiting/);
  });
  it("re-checks the record when the approval is decided", async () => {
    const a = await seasoned(AUTONOMY.TRACK_DEFAULT);
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

describe("track record setting", () => {
  it("can be 2 or off, only by a company admin, audited; anything else is refused", async () => {
    as("owner"); await expect(setAgentTrackRecord(2)).rejects.toBeInstanceOf(SodError);
    as("admin"); await expect(setAgentTrackRecord(1)).rejects.toBeInstanceOf(SodError);
    await setAgentTrackRecord(2);
    expect(TEAM_SETTINGS.agentTrackRecord).toBe(2);
    expect(WS_AUDIT.some((e) => e.action === "team.agent_track_record.changed" && e.target === "3 approved suggestions → 2 approved suggestions")).toBe(true);
  });
  it("at 2, two approved suggestions are enough", async () => {
    const a = await seasoned(2);
    as("admin"); expect(raiseBlockReason(a)).toMatch(/needs 3/);
    await setAgentTrackRecord(2);
    expect(raiseBlockReason(a)).toBeNull();
  });
  it("off: no record is needed, but a second person still approves", async () => {
    const a = await seasoned(0);
    as("admin"); await setAgentTrackRecord(0);
    expect(raiseBlockReason(a)).toBeNull();
    as("owner"); const r = await requestRaise(a.id, reason);
    await expect(decide(r!.approvalId, "owner")).rejects.toBeInstanceOf(SodError);
    await expect(decide(r!.approvalId, "admin")).rejects.toBeInstanceOf(SodError);
    await decide(r!.approvalId, "admin2");
    expect(findAgent(a.id)!.autonomy).toBe("Acts (logged)");
  });
});

describe("service-account agents", () => {
  it("need two different approvers to be raised", async () => {
    const a = await seasoned(AUTONOMY.TRACK_DEFAULT, false, "Service account");
    as("owner"); const r = await requestRaise(a.id, reason);
    expect(getApproval(r!.approvalId)!.needs).toBe(2);
    await decide(r!.approvalId, "admin2");
    expect(findAgent(a.id)!.autonomy).toBe("Suggests only");
    await expect(decide(r!.approvalId, "admin2")).rejects.toBeInstanceOf(SodError); // same person twice
    await decide(r!.approvalId, "owner2");
    expect(findAgent(a.id)!.autonomy).toBe("Acts (logged)");
  });
});

describe("rejecting a change an acting agent applied", () => {
  it("lowers the agent at once, audited, and counts against its record", async () => {
    as("admin"); await runAgent("AG1");
    const run = ASST.runs[0]; expect(run.decision).toBe("Auto-applied");
    as("employee"); await expect(rejectApplied(run.id, "Emailed the wrong owners")).rejects.toBeInstanceOf(SodError);
    as("admin"); await expect(rejectApplied(run.id, "short")).rejects.toBeInstanceOf(SodError);
    const out = await rejectApplied(run.id, "Emailed the wrong owners"); // the person who ran it may reject it (safe direction)
    expect(out!.run.decision).toBe("Rejected after applying");
    expect(out!.lowered!.autonomy).toBe("Suggests only");
    expect(WS_AUDIT.some((e) => e.action === "assistant.agent.autonomy_lowered" && e.target.includes("automatically"))).toBe(true);
    expect(trackRecord(findAgent("AG1")!, ASST.runs).recentRejection).toBe(true);
    await expect(rejectApplied(run.id, "Emailed the wrong owners")).rejects.toBeInstanceOf(SodError); // only once, only an applied change
  });
  it("refuses a suggestion that is still waiting", async () => {
    as("admin"); await expect(rejectApplied("R1", "Not an applied change")).rejects.toBeInstanceOf(SodError);
  });
});
