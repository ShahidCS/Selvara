import { describe, expect, it } from "vitest";
import { APPETITE, explainIssue, explainRisk, issueNextStep, postureBrief, riskNextStep } from "@/lib/insights";
import { aiQuestion, templateWording } from "@/components/kit/AiWording";
import { matchFacts } from "@/components/kit/AskPanel";
import { agentFigures, isToday } from "@/features/assistant/AgentsOverview";

/* Reference review part 3: computed insights (R9, R18, R22), the AI question built from them, and the agents page figures (R30). */
describe("computed insights", () => {
  it("ranks posture causes by weight and names records in the next steps, only for modules the role can open", () => {
    const all = postureBrief(() => true);
    expect(all.causes.length).toBeGreaterThan(0);
    expect(all.causes.map((c) => c.weight)).toEqual([...all.causes.map((c) => c.weight)].sort((a, b) => b - a));
    expect(all.sentence).toContain(all.causes[0].label);
    expect(all.steps[0].to).toEqual({ path: "/ws/issues/R-036" }); // the oldest overdue high issue
    expect(all.steps.some((s) => "risk" in s.to)).toBe(true);
    const issuesOnly = postureBrief((m) => m === "issues");
    expect(issuesOnly.causes.every((c) => /issue/.test(c.label))).toBe(true);
    expect(postureBrief(() => false).causes).toEqual([]);
  });
  it("suggests one next step for an issue and a risk by fixed rules", () => {
    expect(issueNextStep({ status: "Closed" })).toBe("");
    expect(issueNextStep({ status: "Open", sev: "High", due: "Overdue 3d" })).toBe("Agree a recovery date or escalate");
    expect(issueNextStep({ status: "Open", sev: "Low", due: "Overdue 3d" })).toBe("Agree a new due date");
    expect(issueNextStep({ status: "Open", sev: "Low", due: "Due 7d" })).toBe("Start work and record the root cause");
    expect(issueNextStep({ status: "In progress", due: "Due 7d", rootCause: "Missing SLA", tasks: [{ done: true }] })).toBe("Propose closure with a verification note");
    expect(riskNextStep({ status: "Accepted", l: 5, i: 5, rl: 1, ri: 1 })).toBe("");
    expect(riskNextStep({ status: "Open", review: "Submitted", l: 1, i: 1, rl: 1, ri: 1 })).toBe("Approve or return the assessment");
    expect(riskNextStep({ status: "Open", review: "Approved", treat: "Accept", l: 4, i: 4, rl: 2, ri: 2 })).toBe("Accepting above appetite: confirm authority");
    expect(riskNextStep({ status: "Open", review: "Approved", treat: "Mitigate", l: 4, i: 4, rl: 2, ri: 2 })).toBe("Add treatment actions");
  });
  it("explains a record from its own fields, without its owner", () => {
    const e = explainIssue({ id: "R-1", title: "MFA gap", sev: "High", status: "Open", due: "Overdue 4d", owner: "Sam Test", linkedControls: ["IAM-2"], linkedRisks: [], tasks: [] });
    expect(e.why).toContain("4 days past"); expect(e.why).toContain("IAM-2"); expect(e.next).toBe("Agree a recovery date or escalate");
    expect(JSON.stringify(e)).not.toContain("Sam Test");
    const r = explainRisk({ id: "RK-9", title: "Vendor breach", status: "Open", review: "Approved", treat: "Mitigate", l: 4, i: 5, rl: 2, ri: 2, owner: "Sam Test", actions: [{}] });
    expect(r.why).toContain(`appetite is ${APPETITE}`); expect(r.next).toBe("Track the treatment actions"); expect(JSON.stringify(r)).not.toContain("Sam Test");
  });
  it("builds the AI question from the facts within the server's limit; the demonstration words or matches facts without a model", () => {
    const q = aiQuestion("Summarise.", ["a".repeat(3000)]); expect(q.length).toBe(2000);
    expect(aiQuestion("Summarise.", ["Two controls failing"])).toContain("- Two controls failing");
    expect(templateWording(["One", "Two."])).toBe("One. Two.");
    expect(matchFacts("Which framework is behind?", ["Framework ISO readiness is 87%", "6 open issues"])).toEqual(["Framework ISO readiness is 87%"]);
    expect(matchFacts("zzz", ["a fact"])).toEqual(["a fact"]);
  });
});

describe("agents page figures", () => {
  it("counts today's runs in both time formats, and waiting, approved and rejected decisions", () => {
    const now = new Date("2026-11-23T10:00:00Z");
    expect(isToday("12m ago", now)).toBe(true); expect(isToday("2026-11-23 08:00 UTC", now)).toBe(true); expect(isToday("1d ago", now)).toBe(false);
    const f = agentFigures(
      [{ id: "A", name: "a", trigger: "", runsAs: "", autonomy: "Suggests only", last: "", status: "Active" }, { id: "B", name: "b", trigger: "", runsAs: "", autonomy: "Acts (logged)", last: "", status: "Paused" }],
      [{ id: "1", when: "just now", agent: "a", change: "", decision: "Waiting" }, { id: "2", when: "2026-11-20 08:00 UTC", agent: "a", change: "", decision: "Approved & applied" }, { id: "3", when: "3h ago", agent: "b", change: "", decision: "Rejected after applying" }],
      now);
    expect(f).toEqual({ active: 1, total: 2, today: 2, waiting: 1, approved: 1, rejected: 1 });
  });
});
