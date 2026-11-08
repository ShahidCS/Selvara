/* AI Assistant stubs. Mock mode: canned, template-based drafts (no model call, no network) and in-memory agent / run / MCP state.
 * The real API MUST: authorize every agent run / approval / MCP grant server-side, keep model credentials server-side, treat prompts as untrusted input
 * (prompt injection) and never let model output trigger an action without the approval gate. */
import seed from "@/data/assistantSeed.json";
import { DATA } from "@/lib/data";
import { apiFetch, viaApi } from "./http";

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
export interface Agent { id: string; name: string; trigger: string; runsAs: string; autonomy: string; last: string; status: string }
export interface AgentRun { id: string; when: string; agent: string; change: string; decision: string }
export interface McpGrant { server: string; tools: string; access: string; status: string }
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

/** UI gate only (prototype: asstCanManage, exact list). Deny by default. */
export const asstCanManage = (roleId: string) => ["super", "admin", "owner"].includes(roleId);

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

/** Prototype: asstRunAgent. */
export function runAgent(id: string) {
  return viaApi<{ agent: Agent; suggest: boolean } | null>(() => {
    const a = findAgent(id); if (!a) return null;
    a.last = "just now"; const suggest = a.autonomy === "Suggests only";
    ASST.runs.unshift({ id: uid("R", ASST.runs), when: "just now", agent: a.name, change: suggest ? "Proposed an update for review" : "Ran within scope and applied", decision: suggest ? "Waiting" : "Auto-applied" });
    return { agent: a, suggest };
  }, () => post(`/assistant/agents/${enc(id)}/run`, {}));
}
export function toggleAgent(id: string) {
  return viaApi<Agent | null>(() => { const a = findAgent(id); if (!a) return null; a.status = a.status === "Active" ? "Paused" : "Active"; return a; }, () => post<Agent | null>(`/assistant/agents/${enc(id)}/toggle`, {}));
}
export function deleteAgent(id: string) {
  return viaApi<Agent | null>(() => { const a = findAgent(id); if (!a) return null; ASST.agents = ASST.agents.filter((x) => x.id !== id); return a; }, () => apiFetch<Agent | null>(`/assistant/agents/${enc(id)}`, { method: "DELETE" }));
}
export function createAgent(input: { name: string; trigger: string; autonomy: string; runsAs: string }) {
  return viaApi<Agent>(() => {
    const a: Agent = {
      id: uid("AG", ASST.agents), name: input.name,
      trigger: AGENT_TRIGGERS.includes(input.trigger) ? input.trigger : AGENT_TRIGGERS[0],
      runsAs: AGENT_RUNS_AS.includes(input.runsAs) ? input.runsAs : AGENT_RUNS_AS[0],
      autonomy: AGENT_AUTONOMY.includes(input.autonomy) ? input.autonomy : AGENT_AUTONOMY[0], last: "never", status: "Active",
    };
    ASST.agents.unshift(a); return a;
  }, () => post<Agent>("/assistant/agents", input));
}
/** Prototype: asstDecide. Only a run that is still "Waiting" can be decided (the source re-applied any decision to any run id). */
export function decideRun(id: string, decision: "Approved & applied" | "Rejected") {
  return viaApi<AgentRun | null>(() => { const r = ASST.runs.find((x) => x.id === id); if (!r || r.decision !== "Waiting") return null; r.decision = decision; return r; }, () => post<AgentRun | null>(`/assistant/runs/${enc(id)}/decision`, { decision }));
}
export function toggleMcp(i: number) {
  return viaApi<McpGrant | null>(() => { const s = ASST.mcp[i]; if (!s) return null; s.status = s.status === "Granted" ? "Revoked" : "Granted"; return s; }, () => post<McpGrant | null>(`/assistant/mcp/${i}/toggle`, {}));
}
