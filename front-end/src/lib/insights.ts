/* Computed insights (reference review R9, R18, R22). Every figure, cause and suggested step here is counted from the records already loaded,
   by fixed rules; no model is called. An AI can reword them on request (components/kit/AiWording.tsx), as a draft that a person reviews.
   The rules are deliberately plain so that a reviewer can check each suggestion against the record it names. */
import { getApproval } from "./approvals";
import { DATA } from "./data";
import { riskOpen, sCur, sRes } from "./metrics";

export const APPETITE = 11; // the same threshold as metrics() and lib/risk.ts (RISK_APPETITE)
type Row = Record<string, unknown>;
const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const n = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
/** Days overdue from the list's "Overdue 7d" text, else 0. */
export const overdueDays = (due: unknown) => { const m = /Overdue (\d+)d/.exec(s(due)); return m ? Number(m[1]) : 0; };
const isHigh = (sev: unknown) => /Critical|High/.test(s(sev));
const plural = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

/** Where a step or cause leads: a page, or a risk (risks open in the register's panel, which the caller knows how to open). */
export type Target = { path: string } | { risk: string };
export interface Cause { label: string; count: number; weight: number; to: Target }
export interface Step { text: string; why: string; to: Target }
export interface Brief { sentence: string; causes: Cause[]; steps: Step[]; facts: string[] }

/** R9: the main causes holding posture back, ranked by weight (failing controls weigh most), and up to three next steps on named records. */
export function postureBrief(can: (mod: string) => boolean): Brief {
  const causes: Cause[] = []; const steps: Step[] = [];
  const controls = can("controls") ? (DATA.controls as Row[]) : [];
  const failing = controls.filter((c) => c.status === "Fail");
  const byDomain = new Map<string, Row[]>();
  failing.forEach((c) => { const d = s(c.domain) || "Other"; byDomain.set(d, [...(byDomain.get(d) ?? []), c]); });
  for (const [d, list] of byDomain) causes.push({ label: `${plural(list.length, "control")} failing in ${d}`, count: list.length, weight: list.length * 3, to: { path: "/ws/controls" } });
  const evid = controls.filter((c) => c.status === "Needs evidence");
  if (evid.length) causes.push({ label: `${plural(evid.length, "control")} waiting for evidence`, count: evid.length, weight: evid.length, to: { path: "/ws/controls" } });

  const issues = can("issues") ? (DATA.issues as Row[]).filter((i) => i.status !== "Closed") : [];
  const late = issues.filter((i) => overdueDays(i.due) > 0).sort((a, b) => overdueDays(b.due) - overdueDays(a.due));
  if (late.length) { const hi = late.filter((i) => isHigh(i.sev)).length; causes.push({ label: `${plural(late.length, "issue")} overdue${hi ? `, ${hi} high or critical` : ""}`, count: late.length, weight: late.length * 2 + hi, to: { path: "/ws/issues" } }); }

  const risks = can("risk") ? (DATA.risks as Row[]).filter((r) => riskOpen(r as never)) : [];
  const above = risks.filter((r) => sCur(r as never) >= APPETITE).sort((a, b) => sCur(b as never) - sCur(a as never));
  if (above.length) causes.push({ label: `${plural(above.length, "risk")} above appetite`, count: above.length, weight: above.length * 2, to: { path: "/ws/risk" } });

  const vendors = can("vendors") ? (DATA.vendors as Row[]).filter((v) => /Overdue/.test(s(v.due)) || v.status === "In review") : [];
  if (vendors.length) causes.push({ label: `${plural(vendors.length, "vendor review")} overdue or open`, count: vendors.length, weight: vendors.length, to: { path: "/ws/vendors" } });

  causes.sort((a, b) => b.weight - a.weight);
  const top = causes.slice(0, 5);

  const lateHigh = late.find((i) => isHigh(i.sev));
  if (lateHigh) steps.push({ text: `Agree a recovery date for ${s(lateHigh.id)}, ${s(lateHigh.title)}`, why: `${s(lateHigh.sev)} issue, overdue ${overdueDays(lateHigh.due)} days`, to: { path: `/ws/issues/${encodeURIComponent(s(lateHigh.id))}` } });
  const fc = failing[0];
  if (fc) steps.push({ text: `Fix failing control ${s(fc.id)}, ${s(fc.title)}`, why: `Failing in ${s(fc.domain) || "its domain"}`, to: { path: `/ws/controls/${encodeURIComponent(s(fc.id))}` } });
  const tr = above[0];
  if (tr) steps.push({ text: `Review the treatment of ${s(tr.id)}, ${s(tr.title)}`, why: `Current score ${sCur(tr as never)}, appetite ${APPETITE}`, to: { risk: s(tr.id) } });

  const facts = [
    controls.length ? `${failing.length} of ${controls.length} controls failing, ${evid.length} waiting for evidence` : "",
    issues.length ? `${issues.length} open issues, ${late.length} overdue` : "",
    risks.length ? `${risks.length} open risks, ${above.length} above appetite (${APPETITE})` : "",
    vendors.length ? `${vendors.length} vendor reviews overdue or open` : "",
    ...top.map((c) => `Cause: ${c.label}`),
  ].filter(Boolean);
  const sentence = top.length
    ? `Posture is held back mostly by ${top[0].label}${top[1] ? `, then ${top[1].label}` : ""}.`
    : "Nothing is holding posture back in the modules you can open.";
  return { sentence, causes: top, steps: steps.slice(0, 3), facts };
}

/** R18: one suggested next step for an issue, from its status, due date, root cause, tasks and closure. */
export function issueNextStep(i: Row): string {
  if (i.status === "Closed") return "";
  const closure = i.closure as Row | undefined;
  if (closure && (closure.pending === true || getApproval(s(closure.approvalId))?.status === "Pending")) return "Verify the proposed closure";
  const od = overdueDays(i.due);
  if (od > 0 && isHigh(i.sev)) return "Agree a recovery date or escalate";
  if (od > 0) return "Agree a new due date";
  if (i.status === "Open") return "Start work and record the root cause";
  if (!s(i.rootCause).trim()) return "Record the root cause";
  const tasks = Array.isArray(i.tasks) ? (i.tasks as Row[]) : [];
  if (tasks.length && tasks.every((t) => t.done)) return "Propose closure with a verification note";
  if (!tasks.length) return "Add the tasks that fix it";
  return "Finish the open tasks";
}

/** R18: one suggested next step for a risk, from its status, treatment, scores and appetite. */
export function riskNextStep(r: Row): string {
  if (!riskOpen(r as never)) return "";
  const cur = sCur(r as never); const res = sRes(r as never);
  if (r.review === "Draft" || r.review === "Changes requested") return "Submit the assessment for review";
  if (r.review === "Submitted") return "Approve or return the assessment";
  if (cur >= APPETITE && s(r.treat) === "Accept") return "Accepting above appetite: confirm authority";
  if (cur >= APPETITE && !(Array.isArray(r.actions) && r.actions.length)) return "Add treatment actions";
  if (cur >= APPETITE) return "Track the treatment actions";
  if (res < APPETITE && s(r.treat) === "Accept") return "Record the acceptance";
  return "Review at the next cycle";
}

/** R22: what happened, why it matters and the suggested next step, for an issue. Facts only; each line names where it comes from. */
export function explainIssue(i: Row): { happened: string; why: string; next: string; facts: string[] } {
  const od = overdueDays(i.due);
  const tasks = Array.isArray(i.tasks) ? (i.tasks as Row[]) : [];
  const done = tasks.filter((t) => t.done).length;
  const links = [...(Array.isArray(i.linkedControls) ? (i.linkedControls as string[]) : []), ...(Array.isArray(i.linkedRisks) ? (i.linkedRisks as string[]) : [])];
  const happened = `${s(i.title)}. Raised as ${s(i.sev) || "unrated"}, now ${s(i.status).toLowerCase()}${s(i.due) ? `, ${s(i.due).toLowerCase()}` : ""}.`;
  const why = [
    isHigh(i.sev) ? "High and critical issues are closed only after a second person verifies the fix." : "",
    od > 0 ? `It is ${od} days past its due date.` : "",
    links.length ? `It is linked to ${links.join(", ")}.` : "It is not linked to a control or risk yet.",
    s(i.rootCause).trim() ? "" : "No root cause is recorded yet.",
  ].filter(Boolean).join(" ");
  const facts = [`Issue ${s(i.id)}: ${s(i.title)}`, `Severity ${s(i.sev)}, status ${s(i.status)}, due ${s(i.due)}`, `Tasks ${done} of ${tasks.length} done`, `Linked: ${links.join(", ") || "none"}`, `Root cause recorded: ${s(i.rootCause).trim() ? "yes" : "no"}`];
  return { happened, why, next: issueNextStep(i) || "Nothing: the issue is closed.", facts };
}

/** R22: the same for a risk. */
export function explainRisk(r: Row): { happened: string; why: string; next: string; facts: string[] } {
  const cur = sCur(r as never); const res = sRes(r as never); const inh = n(r.l) * n(r.i);
  const happened = `${s(r.title)}. ${s(r.cat) ? `${s(r.cat)} risk, ` : ""}${s(r.status).toLowerCase()}, treatment ${s(r.treat).toLowerCase() || "not set"}.`;
  const why = [
    `Inherent score ${inh}, current ${cur}, residual ${res}; appetite is ${APPETITE}.`,
    cur >= APPETITE ? "The current score is above appetite." : "The current score is within appetite.",
    s(r.reviewed) ? `Last reviewed ${s(r.reviewed)}.` : "",
  ].filter(Boolean).join(" ");
  const facts = [`Risk ${s(r.id)}: ${s(r.title)}`, `Scores: inherent ${inh}, current ${cur}, residual ${res}, appetite ${APPETITE}`, `Status ${s(r.status)}, treatment ${s(r.treat)}`, s(r.desc) ? `Description: ${s(r.desc).slice(0, 400)}` : ""].filter(Boolean);
  return { happened, why, next: riskNextStep(r) || "Nothing: the risk is accepted or closed.", facts };
}
