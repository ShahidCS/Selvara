/* AI Assistant stubs. Mock mode: canned, template-based drafts (no model call, no network) and in-memory agent / run / MCP state.
 * CONTRACT (docs/security/SOD_MATRIX.md section 3, Assistant): everything here is admin/owner only (assertRole, deny by default); approving an agent action needs an approver
 * who is not the person who triggered it, with a reason; ENABLING a custom agent (create or resume) and GRANTING MCP access are approvals by a second admin/owner
 * (approvals engine), never by the creator. Pausing an agent and revoking MCP access are immediate (safe direction). Violations throw SodError.
 * The real API MUST authorize every agent run / approval / MCP grant server-side, keep model credentials server-side, treat prompts as untrusted input
 * (prompt injection) and never let model output trigger an action without the approval gate. */
import seed from "@/features/assistant/data/assistantSeed.json";
import { DATA } from "@/lib/data";
import { getApproval, requestApproval } from "@/lib/approvals";
import { payloadStr, registerApprovalHandler } from "@/lib/approvalKit";
import { assertNotSelf, assertRole, getActor, hasRole, SodError } from "@/lib/sod";
import { wsLog } from "@/lib/audit";
import { clampText } from "@/lib/security";
import { apiFetch, viaApi } from "@/services/http";

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
export interface Agent { id: string; name: string; trigger: string; runsAs: string; autonomy: string; last: string; status: string; createdBy?: string; pendingApproval?: string }
export interface AgentRun { id: string; when: string; agent: string; change: string; decision: string; requestedBy?: string; decidedBy?: string; decidedReason?: string }
export interface McpGrant { server: string; tools: string; access: string; status: string; pendingApproval?: string }
export interface Msg { role: "user" | "assistant"; text: string; draft?: boolean }
export const ASST = {
  thread: [] as Msg[],
  agents: clone(seed.ASST_AGENTS) as Agent[], runs: clone(seed.ASST_RUNS) as AgentRun[], mcp: clone(seed.ASST_MCP) as McpGrant[],
};
export const AGENT_TRIGGERS = ["On schedule (weekly)", "Evidence overdue", "Control fails", "On new questionnaire", "Risk updated"];
export const AGENT_AUTONOMY = ["Suggests only", "Acts (logged)"];
export const AGENT_RUNS_AS = ["Read-only", "Service account"];
export const ASK_MAX = 2000;
const post = <T,>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
const enc = encodeURIComponent;
function uid(prefix: string, list: { id: string }[]) { let n = Date.now(); while (list.some((x) => x.id === prefix + n)) n++; return prefix + n; }

/** Admin or owner (base roles). The prototype also listed `super`, who has no workspace access (SOD_MATRIX section 2). UI gate only: the services call assertRole too. */
export const asstCanManage = (roleId: string) => hasRole(roleId, "admin", "owner");
const gate = (what: string) => assertRole(what, "admin", "owner");
const stillPending = (id?: string) => !!id && getApproval(id)?.status === "Pending";
const APPROVERS = ["admin", "owner"];
const by = (a: { approvals: { by: string }[] }) => a.approvals.map((x) => x.by).join(", ");

registerApprovalHandler("assistant.agent.enable", {
  apply: (ap) => {
    const a = findAgent(payloadStr(ap, "id")); if (!a) throw new SodError("Agent not found.");
    a.status = "Active"; delete a.pendingApproval;
    wsLog("assistant.agent.enabled", `${a.name} (approved by ${by(ap)}; requested by ${ap.requestedBy})`, "System");
  },
  closed: (ap) => { const a = findAgent(payloadStr(ap, "id")); if (a) { delete a.pendingApproval; if (a.status === "Pending approval") a.status = "Paused"; } },
});
registerApprovalHandler("assistant.mcp.grant", {
  apply: (ap) => {
    const g = ASST.mcp.find((x) => x.server === payloadStr(ap, "server")); if (!g) throw new SodError("Server not found.");
    g.status = "Granted"; delete g.pendingApproval;
    wsLog("assistant.mcp.granted", `${g.server} (${g.tools}; approved by ${by(ap)}; requested by ${ap.requestedBy})`, "System");
  },
  closed: (ap) => { const g = ASST.mcp.find((x) => x.server === payloadStr(ap, "server")); if (g) delete g.pendingApproval; },
});

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Prototype: asstMetrics. */
export function asstMetrics() {
  const m = { ctrlTotal: 0, ctrlFail: 0, risks: 0, highRisk: 0, policies: 0 };
  try { m.ctrlTotal = DATA.controls.length; m.ctrlFail = DATA.controls.filter((c: any) => /fail/i.test((c.status || "") + "")).length; } catch { /* keep zeros */ }
  try { m.risks = DATA.risks.length; m.highRisk = DATA.risks.filter((r: any) => r.rl * r.ri >= 12 || r.l * r.i >= 16).length; } catch { /* keep zeros */ }
  try { m.policies = DATA.policies.length; } catch { /* keep zeros */ }
  return m;
}
/** Prototype: asstDraft. Copy verbatim. Output is always a draft that requires human review. */
export function asstDraft(prompt: string): string {
  const q = (prompt || "").toLowerCase(); const m = asstMetrics(); const tail = "\n\nThis is an AI-generated draft and must be reviewed and approved before use.";
  if (/board|exec|summary|update/.test(q)) return `Executive security summary (draft)\n\nOverall posture is stable. ${m.ctrlFail} of ${m.ctrlTotal} controls currently need attention and ${m.highRisk} of ${m.risks} tracked risks are rated high or critical. Remediation is in progress against agreed SLAs, with no material incidents to report this period.\n\nRecommended for the board: approve funding for the top risk treatments and confirm risk acceptance where residual risk remains above appetite.` + tail;
  if (/risk/.test(q)) return `Open risk summary (draft)\n\nThe register holds ${m.risks} risks, of which ${m.highRisk} are rated high or critical. Treatment plans are active on the highest-rated items.\n\nSuggested next steps: (1) confirm an owner and due date on each high/critical risk, (2) re-score after mitigations land, (3) escalate any proposed risk acceptance to the risk committee with a residual-risk rationale.` + tail;
  if (/control|soc|iso|test|fail|audit/.test(q)) return `Control posture (draft)\n\n${m.ctrlFail} of ${m.ctrlTotal} controls need attention (failing or awaiting evidence), concentrated in access management and vulnerability remediation.\n\nSuggested next steps: assign owners to failing controls, attach current evidence, and re-run the related automated tests before the next audit window.` + tail;
  if (/mfa|access|identity|account|privileg/.test(q)) return `Access and MFA posture (draft)\n\nMFA is enforced across managed accounts, with a small number of exceptions pending enrolment. Privileged access is covered by the current recertification campaign.\n\nSuggested next steps: close out remaining MFA exceptions, complete the open access review, and confirm no dormant privileged accounts remain.` + tail;
  if (/policy|policies|acknowledg/.test(q)) return `Policy review status (draft)\n\nThe library holds ${m.policies} policies. Most are active; a few are approaching their review date.\n\nSuggested next steps: schedule reviews for policies due this quarter, confirm owners, and chase outstanding workforce acknowledgements on recently published versions.` + tail;
  if (/vendor|third|supplier|supply/.test(q)) return `Third-party risk summary (draft)\n\nActive vendors are tracked with risk tiers and review dates. Higher-tier vendors carry current assessments; a few reviews are approaching their due date.\n\nSuggested next steps: prioritise reassessment of critical vendors, confirm data-processing agreements are in place, and record any residual risk acceptances.` + tail;
  return `Posture overview (draft)\n\nBased on current workspace data: ${m.ctrlFail} of ${m.ctrlTotal} controls need attention and ${m.highRisk} of ${m.risks} risks are rated high or critical. Evidence collection and remediation are in progress.\n\nAsk me to summarise risks, draft a board update, or explain your control, access or vendor posture — I can turn any of these into a document for your review.` + tail;
}
/** Prototype: asstAsk (appends the user message and the draft reply to the in-memory thread). */
export function ask(text: string) {
  return viaApi<Msg>(() => {
    ASST.thread.push({ role: "user", text });
    const reply: Msg = { role: "assistant", text: asstDraft(text), draft: true };
    ASST.thread.push(reply); return reply;
  }, () => post<Msg>("/assistant/ask", { text }));
}
export const clearThread = () => { ASST.thread = []; };
export const findAgent = (id: string) => ASST.agents.find((x) => x.id === id);

/** Prototype: asstRunAgent. Only an Active agent runs (the source also ran Paused agents). The person who triggers the run is recorded: they cannot approve its change. */
export function runAgent(id: string) {
  return viaApi<{ agent: Agent; suggest: boolean } | null>(() => {
    gate("running an agent");
    const a = findAgent(id); if (!a) return null;
    if (a.status !== "Active") throw new SodError("Only an active agent can run.");
    a.last = "just now"; const suggest = a.autonomy === "Suggests only";
    ASST.runs.unshift({ id: uid("R", ASST.runs), when: "just now", agent: a.name, change: suggest ? "Proposed an update for review" : "Ran within scope and applied", decision: suggest ? "Waiting" : "Auto-applied", requestedBy: getActor().name });
    return { agent: a, suggest };
  }, () => post(`/assistant/agents/${enc(id)}/run`, {}));
}
/** Pause is immediate. Resume is "enabling" an agent: an approval by someone other than the requester and the agent's creator. */
export function toggleAgent(id: string) {
  return viaApi<{ agent: Agent; pending: boolean } | null>(() => {
    gate("changing an agent");
    const a = findAgent(id); if (!a) return null;
    if (a.status === "Active") { a.status = "Paused"; return { agent: a, pending: false }; }
    if (stillPending(a.pendingApproval)) throw new SodError("Enabling is already awaiting approval.");
    const ap = requestApproval({ kind: "assistant.agent.enable", title: `Enable agent ${clampText(a.name, 80)} (${a.autonomy}, runs as ${a.runsAs})`, subject: a.id, payload: { id: a.id }, needs: 1, approverRoles: APPROVERS, forbid: [a.createdBy].filter(Boolean) });
    a.pendingApproval = ap.id; return { agent: a, pending: true };
  }, () => post<{ agent: Agent; pending: boolean } | null>(`/assistant/agents/${enc(id)}/toggle`, {}));
}
export function deleteAgent(id: string) {
  return viaApi<Agent | null>(() => { gate("deleting an agent"); const a = findAgent(id); if (!a) return null; ASST.agents = ASST.agents.filter((x) => x.id !== id); return a; }, () => apiFetch<Agent | null>(`/assistant/agents/${enc(id)}`, { method: "DELETE" }));
}
/** A new custom agent is created "Pending approval" and cannot run until a second admin/owner (not the creator) approves enabling it. */
export function createAgent(input: { name: string; trigger: string; autonomy: string; runsAs: string }) {
  return viaApi<Agent>(() => {
    gate("creating an agent");
    const a: Agent = {
      id: uid("AG", ASST.agents), name: input.name,
      trigger: AGENT_TRIGGERS.includes(input.trigger) ? input.trigger : AGENT_TRIGGERS[0],
      runsAs: AGENT_RUNS_AS.includes(input.runsAs) ? input.runsAs : AGENT_RUNS_AS[0],
      autonomy: AGENT_AUTONOMY.includes(input.autonomy) ? input.autonomy : AGENT_AUTONOMY[0], last: "never", status: "Pending approval", createdBy: getActor().name,
    };
    const ap = requestApproval({ kind: "assistant.agent.enable", title: `Enable new agent ${clampText(a.name, 80)} (${a.autonomy}, runs as ${a.runsAs})`, subject: a.id, payload: { id: a.id }, needs: 1, approverRoles: APPROVERS, forbid: [a.createdBy] });
    a.pendingApproval = ap.id; ASST.agents.unshift(a); return a;
  }, () => post<Agent>("/assistant/agents", input));
}
/** Why the signed-in person cannot decide this run (null = may). Shared with the UI so the buttons show the same reason. */
export function runBlockReason(r: AgentRun): string | null {
  if (!hasRole(getActor().roleId, "admin", "owner")) return "Only admin or owner can approve or reject agent actions.";
  const me = getActor().name; const rb = r.requestedBy;
  if (rb && rb.toLowerCase().replace(/[.,]/g, " ") === me.toLowerCase().replace(/[.,]/g, " ")) return "Segregation of duties: you triggered this run, so another admin or owner must decide it.";
  return null;
}
/** Prototype: asstDecide. Only a run that is still "Waiting" can be decided, by someone other than whoever triggered it, with a reason (the confirmation step collects it). */
export function decideRun(id: string, decision: "Approved & applied" | "Rejected", reason: string) {
  return viaApi<AgentRun | null>(() => {
    gate("approving or rejecting an agent action");
    const r = ASST.runs.find((x) => x.id === id); if (!r || r.decision !== "Waiting") return null;
    assertNotSelf("you triggered this run, so another admin or owner must decide it", r.requestedBy);
    const why = clampText(reason, 300); if (why.length < 10) throw new SodError("Give a reason of at least 10 characters.");
    r.decision = decision; r.decidedBy = getActor().name; r.decidedReason = why; return r;
  }, () => post<AgentRun | null>(`/assistant/runs/${enc(id)}/decision`, { decision, reason }));
}
/** Revoke is immediate. Grant is an approval by a second admin/owner (not the requester). */
export function toggleMcp(i: number) {
  return viaApi<{ grant: McpGrant; pending: boolean } | null>(() => {
    gate("changing MCP access");
    const s = ASST.mcp[i]; if (!s) return null;
    if (s.status === "Granted") { s.status = "Revoked"; return { grant: s, pending: false }; }
    if (stillPending(s.pendingApproval)) throw new SodError("This grant is already awaiting approval.");
    const ap = requestApproval({ kind: "assistant.mcp.grant", title: `Grant MCP access: ${clampText(s.server, 60)} (${clampText(s.tools, 80)}; ${clampText(s.access, 60)})`, subject: s.server, payload: { server: s.server }, needs: 1, approverRoles: APPROVERS });
    s.pendingApproval = ap.id; return { grant: s, pending: true };
  }, () => post<{ grant: McpGrant; pending: boolean } | null>(`/assistant/mcp/${i}/toggle`, {}));
}
