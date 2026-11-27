/* Automation rules and data retention (phase 5, DRAFT for compliance review: docs/security/SOD_MATRIX.md sections 13 and 14).
   Deny by default, company admins only, audited. Anything that makes the system act on its own or keep data for less time is four-eyes; anything
   that stops it (pause, lengthen, hold) is immediate. The real API must enforce every rule and run rules and purges as server jobs. */
import { RETENTION_DEFS, type RetentionDef } from "@/lib/retention";
import { DATA } from "@/lib/data";
import { registerKind } from "@/lib/approvalFlow";
import { getApproval, requestApproval } from "@/lib/approvals";
import { WS_AUDIT, wsLog } from "@/lib/audit";
import { clampText, secureHex } from "@/lib/security";
import { assertRole, getActor, SodError } from "@/lib/sod";
import { bumpData } from "@/lib/store";

/* eslint-disable @typescript-eslint/no-explicit-any */
const REASON_MIN = 10;
const reasonOf = (r: unknown) => { const v = clampText(r, 300); if (v.length < REASON_MIN) throw new SodError(`Give a reason of at least ${REASON_MIN} characters.`); return v; };
const gate = (what: string) => assertRole(what, "admin");
const pending = (id?: string) => !!id && getApproval(id)?.status === "Pending";

/* ---------- automation rules ---------- */
export type TriggerId = "control.failing" | "evidence.needed" | "issue.overdue" | "vendor.overdue";
export type ActionId = "notify.owner" | "create.issue";
export interface Trigger { id: TriggerId; label: string; matches: () => { id: string; title: string; owner: string }[] }
export const TRIGGERS: Trigger[] = [
  { id: "control.failing", label: "A control is failing", matches: () => DATA.controls.filter((c: any) => c.status === "Fail").map((c: any) => ({ id: c.id, title: c.title, owner: c.owner })) },
  { id: "evidence.needed", label: "A control needs evidence", matches: () => DATA.controls.filter((c: any) => c.status === "Needs evidence").map((c: any) => ({ id: c.id, title: c.title, owner: c.owner })) },
  { id: "issue.overdue", label: "An issue is overdue", matches: () => DATA.issues.filter((i: any) => i.status !== "Closed" && /Overdue/.test(i.due)).map((i: any) => ({ id: i.id, title: i.title, owner: i.owner })) },
  { id: "vendor.overdue", label: "A vendor review is overdue", matches: () => DATA.vendors.filter((v: any) => /Overdue/.test(v.due)).map((v: any) => ({ id: v.id, title: v.name, owner: v.owner || "Vendor owner" })) },
];
/** The only things a rule may do. Rules never approve, delete, publish or change access. */
export const ACTIONS: { id: ActionId; label: string }[] = [
  { id: "notify.owner", label: "Notify the owner" },
  { id: "create.issue", label: "Open an issue (once per record)" },
];
export const RULE_LIMITS = { MAX_ACTIONS_PER_RUN: 20, MAX_RULES: 25 };
export type RuleStatus = "Draft" | "Pending approval" | "Active" | "Paused";
export interface Rule { id: string; name: string; trigger: TriggerId; action: ActionId; status: RuleStatus; createdBy: string; approvalId?: string; approvedBy?: string; runs: { at: number; matched: number; acted: number; capped: boolean; by: string }[]; done: string[] }
export const RULES: Rule[] = [];

export function createRule(input: { name: string; trigger: string; action: string }): Rule {
  gate("create an automation rule");
  const name = clampText(input.name, 80); if (name.length < 3) throw new SodError("Name the rule.");
  if (!TRIGGERS.some((t) => t.id === input.trigger)) throw new SodError("Choose one of the listed triggers.");
  if (!ACTIONS.some((a) => a.id === input.action)) throw new SodError("Choose one of the listed actions.");
  if (RULES.length >= RULE_LIMITS.MAX_RULES) throw new SodError(`A workspace can have at most ${RULE_LIMITS.MAX_RULES} rules.`);
  const r: Rule = { id: "RL-" + secureHex(3).toUpperCase(), name, trigger: input.trigger as TriggerId, action: input.action as ActionId, status: "Draft", createdBy: getActor().name, runs: [], done: [] };
  RULES.unshift(r); wsLog("team.rule.created", `${r.id} ${name}: when "${triggerLabel(r.trigger)}", ${actionLabel(r.action).toLowerCase()} (draft)`, "System"); bumpData();
  return r;
}
export const triggerLabel = (t: TriggerId) => TRIGGERS.find((x) => x.id === t)?.label ?? t;
export const actionLabel = (a: ActionId) => ACTIONS.find((x) => x.id === a)?.label ?? a;
const findRule = (id: string) => { const r = RULES.find((x) => x.id === id); if (!r) throw new SodError("Rule not found."); return r; };
/** Records the rule would act on now, without acting (dry run). */
export function previewRule(id: string) {
  const r = findRule(id); const all = (TRIGGERS.find((t) => t.id === r.trigger) as Trigger).matches();
  const todo = r.action === "create.issue" ? all.filter((m) => !r.done.includes(m.id)) : all;
  return { matches: todo, capped: todo.length > RULE_LIMITS.MAX_ACTIONS_PER_RUN };
}
/** Turning a rule on is four-eyes: a different company admin approves (not the person who asks, not its creator). */
export function requestEnable(id: string, reason: string) {
  gate("turn on an automation rule");
  const r = findRule(id); const why = reasonOf(reason);
  if (r.status === "Active") throw new SodError("The rule is already on.");
  if (pending(r.approvalId)) throw new SodError("Turning it on is already awaiting approval.");
  const n = previewRule(id).matches.length;
  const ap = requestApproval({ kind: "team-rule", title: `Turn on rule ${r.name} (${triggerLabel(r.trigger)} → ${actionLabel(r.action)}; ${n} record${n === 1 ? "" : "s"} now)`, subject: r.id, needs: 1, approverRoles: ["admin"], forbid: [r.createdBy], ttlHours: 72, domain: "ws", payload: { id: r.id, reason: why } });
  r.approvalId = ap.id; r.status = "Pending approval";
  wsLog("team.rule.enable_requested", `${r.id} ${r.name}; reason: ${why}`, "System"); bumpData();
  return ap;
}
registerKind("team-rule", {
  describe: (a) => `Turn on rule ${a.subject}`,
  apply: (a) => { const r = RULES.find((x) => x.id === a.payload.id); if (!r) return; r.status = "Active"; r.approvedBy = a.approvals.map((x) => x.by).join(", "); wsLog("team.rule.enabled", `${r.id} ${r.name}; requested by ${a.requestedBy}, approved by ${r.approvedBy}`, "System"); bumpData(); },
  closed: (a) => { const r = RULES.find((x) => x.id === a.payload.id); if (r && r.status === "Pending approval") r.status = r.approvedBy ? "Paused" : "Draft"; wsLog("team.rule.enable_" + a.status.toLowerCase(), `${a.subject}${a.decidedReason ? "; reason: " + a.decidedReason : ""}`, "System"); bumpData(); },
});
/** Pausing is immediate (safe direction). Turning it back on needs approval again. */
export function pauseRule(id: string) {
  gate("pause an automation rule"); const r = findRule(id);
  if (r.status !== "Active") throw new SodError("Only a rule that is on can be paused.");
  r.status = "Paused"; wsLog("team.rule.paused", `${r.id} ${r.name}`, "System"); bumpData();
}
export function deleteRule(id: string) {
  gate("delete an automation rule"); const r = findRule(id);
  if (r.status === "Active") throw new SodError("Pause the rule before deleting it.");
  RULES.splice(RULES.indexOf(r), 1); wsLog("team.rule.deleted", `${r.id} ${r.name}`, "System"); bumpData();
}
/** Runs an active rule once: at most MAX_ACTIONS_PER_RUN actions, each audited; opening an issue happens once per record. (Production: a server job.) */
export function runRule(id: string) {
  gate("run an automation rule"); const r = findRule(id);
  if (r.status !== "Active") throw new SodError("Only a rule that is on can run.");
  const { matches, capped } = previewRule(id); const todo = matches.slice(0, RULE_LIMITS.MAX_ACTIONS_PER_RUN);
  for (const m of todo) {
    if (r.action === "create.issue") {
      const iss = { id: "I-" + secureHex(2).toUpperCase(), title: `${m.title} (from rule ${r.name})`, sev: "Medium", status: "Open", owner: m.owner, due: "In 14 days", source: r.id };
      DATA.issues.unshift(iss); r.done.push(m.id);
      wsLog("team.rule.action", `${r.id}: opened ${iss.id} for ${m.id}`, "System");
    } else wsLog("team.rule.action", `${r.id}: notified ${m.owner} about ${m.id}`, "System");
  }
  const run = { at: Date.now(), matched: matches.length, acted: todo.length, capped, by: getActor().name };
  r.runs.unshift(run); r.runs = r.runs.slice(0, 20);
  wsLog("team.rule.run", `${r.id} ${r.name}: ${todo.length} action${todo.length === 1 ? "" : "s"} of ${matches.length} matching${capped ? ` (capped at ${RULE_LIMITS.MAX_ACTIONS_PER_RUN})` : ""}`, "System"); bumpData();
  return run;
}

/* ---------- retention ---------- */
export interface RetentionType extends RetentionDef { hold?: { by: string; at: number; reason: string; releaseApproval?: string }; pendingShorter?: { months: number; approvalId: string } }
/** The demonstration's own copy of the shared definitions (lib/retention.ts), changed in the browser. */
export const RETENTION: RetentionType[] = RETENTION_DEFS.map((d) => ({ ...d }));
const findType = (id: string) => { const t = RETENTION.find((x) => x.id === id); if (!t) throw new SodError("Unknown record type."); return t; };
/** Longer is immediate. Shorter is four-eyes and never below the floor. */
export function setRetention(id: string, monthsIn: number, reason: string) {
  gate("change data retention"); const t = findType(id); const why = reasonOf(reason);
  const months = Number(monthsIn);
  if (!Number.isInteger(months) || months < 1 || months > 240) throw new SodError("Choose 1 to 240 months.");
  if (months < t.floor) throw new SodError(`${t.label} must be kept at least ${t.floor} months.`);
  if (months === t.months) return { pending: false };
  if (months > t.months) {
    const before = t.months; t.months = months; delete t.pendingShorter;
    wsLog("team.retention.changed", `${t.label}: ${before} → ${months} months; reason: ${why}`, "System"); bumpData(); return { pending: false };
  }
  if (t.pendingShorter && pending(t.pendingShorter.approvalId)) throw new SodError("A shorter period is already awaiting approval.");
  const ap = requestApproval({ kind: "team-retention", title: `Keep ${t.label.toLowerCase()} for ${months} months instead of ${t.months}`, subject: t.label, needs: 1, approverRoles: ["admin"], ttlHours: 72, domain: "ws", payload: { id, months, reason: why } });
  t.pendingShorter = { months, approvalId: ap.id };
  wsLog("team.retention.shorten_requested", `${t.label}: ${t.months} → ${months} months; reason: ${why}`, "System"); bumpData();
  return { pending: true };
}
registerKind("team-retention", {
  describe: (a) => `Shorter retention: ${a.subject}`,
  apply: (a) => { const t = RETENTION.find((x) => x.id === a.payload.id); if (!t) return; const m = Number(a.payload.months); if (m < t.floor) throw new SodError("Below the minimum."); const before = t.months; t.months = m; delete t.pendingShorter; wsLog("team.retention.changed", `${t.label}: ${before} → ${m} months; requested by ${a.requestedBy}, approved by ${a.approvals.map((x) => x.by).join(", ")}`, "System"); bumpData(); },
  closed: (a) => { const t = RETENTION.find((x) => x.id === a.payload.id); if (t) delete t.pendingShorter; bumpData(); },
});
/** A legal hold stops all deletion of a record type at once; releasing it is four-eyes. */
export function placeHold(id: string, reason: string) {
  gate("place a legal hold"); const t = findType(id); const why = reasonOf(reason);
  if (t.hold) throw new SodError("A legal hold is already in place.");
  t.hold = { by: getActor().name, at: Date.now(), reason: why };
  wsLog("team.retention.hold_placed", `${t.label}; reason: ${why}`, "System"); bumpData();
}
export function requestRelease(id: string, reason: string) {
  gate("release a legal hold"); const t = findType(id); const why = reasonOf(reason);
  if (!t.hold) throw new SodError("There is no legal hold.");
  if (pending(t.hold.releaseApproval)) throw new SodError("Releasing it is already awaiting approval.");
  const ap = requestApproval({ kind: "team-hold", title: `Release the legal hold on ${t.label.toLowerCase()}`, subject: t.label, needs: 1, approverRoles: ["admin"], forbid: [t.hold.by], ttlHours: 72, domain: "ws", payload: { id, reason: why } });
  t.hold.releaseApproval = ap.id;
  wsLog("team.retention.release_requested", `${t.label}; reason: ${why}`, "System"); bumpData();
}
registerKind("team-hold", {
  describe: (a) => `Release legal hold: ${a.subject}`,
  apply: (a) => { const t = RETENTION.find((x) => x.id === a.payload.id); if (!t || !t.hold) return; delete t.hold; wsLog("team.retention.hold_released", `${t.label}; requested by ${a.requestedBy}, approved by ${a.approvals.map((x) => x.by).join(", ")}`, "System"); bumpData(); },
  closed: (a) => { const t = RETENTION.find((x) => x.id === a.payload.id); if (t?.hold) delete t.hold.releaseApproval; bumpData(); },
});
/** What a purge would remove now (dry run; nothing is deleted in the demonstration build). Only the audit log carries dates here. */
export function retentionPreview(id: string, now = Date.now()): { due: number; held: boolean } {
  const t = findType(id); if (t.hold) return { due: 0, held: true };
  if (id !== "audit") return { due: 0, held: false };
  const cutoff = now - t.months * 30.44 * 86_400_000;
  return { due: WS_AUDIT.filter((e) => { const ms = Date.parse(String(e.at).replace(" ", "T")); return !isNaN(ms) && ms < cutoff; }).length, held: false };
}
