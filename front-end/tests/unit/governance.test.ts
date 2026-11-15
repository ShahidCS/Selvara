import { afterEach, describe, expect, it } from "vitest";
import { decideApproval } from "@/lib/approvalFlow";
import { approvals } from "@/lib/approvals";
import { WS_AUDIT } from "@/lib/audit";
import { DATA } from "@/lib/data";
import { SodError } from "@/lib/sod";
import { appStore } from "@/lib/store";
import * as gov from "@/features/team/services/governance";

/* Automation rules and data retention (drafts). Personas: admin = Jordan Avery, admin2 = Casey Morgan, owner = Owen Hart. */
const as = (role: string) => appStore.set({ role });
const why = "Agreed in the risk committee";
const issues0 = DATA.issues.length;
const ret0 = JSON.parse(JSON.stringify(gov.RETENTION));
afterEach(() => { gov.RULES.splice(0); DATA.issues.splice(0, DATA.issues.length - issues0); gov.RETENTION.splice(0, gov.RETENTION.length, ...JSON.parse(JSON.stringify(ret0))); approvals.set({ list: [] }); as("super"); });
const approve = (id: string, role: string) => { as(role); return decideApproval(id, true, "Checked and agreed"); };

describe("automation rules", () => {
  it("only company admins create rules, from the listed triggers and actions only", () => {
    as("owner"); expect(() => gov.createRule({ name: "X rule", trigger: "control.failing", action: "notify.owner" })).toThrow(SodError);
    as("admin");
    expect(() => gov.createRule({ name: "X rule", trigger: "control.deleted", action: "notify.owner" })).toThrow(/listed triggers/);
    expect(() => gov.createRule({ name: "X rule", trigger: "control.failing", action: "approve.everything" })).toThrow(/listed actions/);
    const r = gov.createRule({ name: "Failing controls get an issue", trigger: "control.failing", action: "create.issue" });
    expect(r.status).toBe("Draft");
    expect(() => gov.runRule(r.id)).toThrow(/Only a rule that is on/);
  });
  it("turning a rule on needs a different admin who did not create it; pausing is immediate; turning it back on needs approval again", () => {
    as("admin"); const r = gov.createRule({ name: "Failing controls get an issue", trigger: "control.failing", action: "create.issue" });
    const ap = gov.requestEnable(r.id, why);
    expect(() => approve(ap.id, "admin")).toThrow(SodError);
    approve(ap.id, "admin2");
    expect(r.status).toBe("Active"); expect(r.approvedBy).toBe("Casey Morgan");
    as("admin"); gov.pauseRule(r.id); expect(r.status).toBe("Paused");
    const ap2 = gov.requestEnable(r.id, why); expect(r.status).toBe("Pending approval");
    approve(ap2.id, "admin2"); expect(r.status).toBe("Active");
    expect(WS_AUDIT.some((e) => e.action === "team.rule.enabled" && e.target.includes("Casey Morgan"))).toBe(true);
  });
  it("a run opens one issue per matching record, never twice, and every action is audited", () => {
    as("admin"); const r = gov.createRule({ name: "Failing controls get an issue", trigger: "control.failing", action: "create.issue" });
    approve(gov.requestEnable(r.id, why).id, "admin2");
    const want = DATA.controls.filter((c: { status: string }) => c.status === "Fail").length;
    expect(gov.previewRule(r.id).matches.length).toBe(want);
    as("admin"); const run = gov.runRule(r.id);
    expect(run.acted).toBe(Math.min(want, gov.RULE_LIMITS.MAX_ACTIONS_PER_RUN));
    expect(DATA.issues.length - issues0).toBe(run.acted);
    const again = gov.runRule(r.id);
    if (!run.capped) expect(again.acted).toBe(0);
    expect(WS_AUDIT.filter((e) => e.action === "team.rule.action" && e.target.startsWith(r.id)).length).toBe(run.acted + again.acted);
  });
  it("a rule that is on cannot be deleted until paused", () => {
    as("admin"); const r = gov.createRule({ name: "Notify on overdue issues", trigger: "issue.overdue", action: "notify.owner" });
    approve(gov.requestEnable(r.id, why).id, "admin2");
    as("admin"); expect(() => gov.deleteRule(r.id)).toThrow(/Pause the rule/);
    gov.pauseRule(r.id); gov.deleteRule(r.id); expect(gov.RULES.length).toBe(0);
  });
});

describe("data retention", () => {
  it("longer is immediate; shorter needs a different admin; never below the minimum", () => {
    as("owner"); expect(() => gov.setRetention("issues", 48, why)).toThrow(SodError);
    as("admin");
    expect(gov.setRetention("issues", 48, why)).toEqual({ pending: false });
    expect(gov.RETENTION.find((t) => t.id === "issues")!.months).toBe(48);
    expect(() => gov.setRetention("audit", 24, why)).toThrow(/at least 60 months/);
    expect(gov.setRetention("issues", 24, why)).toEqual({ pending: true });
    expect(gov.RETENTION.find((t) => t.id === "issues")!.months).toBe(48);
    const ap = approvals.get().list.find((a) => a.kind === "team-retention")!;
    expect(() => approve(ap.id, "admin")).toThrow(SodError);
    approve(ap.id, "admin2");
    expect(gov.RETENTION.find((t) => t.id === "issues")!.months).toBe(24);
    expect(() => gov.setRetention("issues", 24, "short")).toThrow(/reason/);
  });
  it("a legal hold is placed at once, stops purging, and is released only with a different admin's approval", () => {
    as("admin"); gov.placeHold("evidence", "Regulator inquiry REF-1234 opened");
    expect(gov.retentionPreview("evidence")).toEqual({ due: 0, held: true });
    expect(() => gov.placeHold("evidence", why)).toThrow(/already/);
    gov.requestRelease("evidence", "Inquiry closed by the regulator");
    const ap = approvals.get().list.find((a) => a.kind === "team-hold")!;
    expect(() => approve(ap.id, "admin")).toThrow(SodError); // the person who placed it
    approve(ap.id, "admin2");
    expect(gov.RETENTION.find((t) => t.id === "evidence")!.hold).toBeUndefined();
    expect(WS_AUDIT.some((e) => e.action === "team.retention.hold_released")).toBe(true);
  });
  it("the preview counts audit entries older than the period", () => {
    expect(gov.retentionPreview("audit", Date.now() + 100 * 365 * 86_400_000).due).toBeGreaterThan(0);
    expect(gov.retentionPreview("audit").due).toBe(0);
  });
});
