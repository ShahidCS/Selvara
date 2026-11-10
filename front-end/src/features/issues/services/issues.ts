/* Issues API stubs (see services/audits.ts for the pattern). Contract: docs/security/SOD_MATRIX.md section 3 (Issue).
 * Rules live here (SodError, deny by default); the UI mirrors them via the `whyCannot*` helpers. The real API must enforce them again. */
import { DATA } from "@/lib/data";
import { wsLog } from "@/lib/audit";
import { getActor, SodError } from "@/lib/sod";
import { approve as engineApprove, getApproval, reject as engineReject, requestApproval, sweepExpired, whyCannotApprove as engineWhy, withdraw as engineWithdraw } from "@/lib/approvals";
import { guard, isoDay, reasonText, roleReason, samePerson, selfReason } from "@/lib/grcSod";
import { apiFetch, viaApi } from "@/services/http";
import { nextId } from "@/services/audits";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const ISSUE_STATUSES = ["Open", "In progress", "Closed"];
export const ISSUE_SEVS = ["Critical", "High", "Medium", "Low"];
export const isHighSev = (sev: unknown) => sev === "High" || sev === "Critical";
const WRITERS = ["admin", "owner", "analyst"];
const post = <T,>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
const enc = encodeURIComponent;

export const issFind = (id: string) => DATA.issues.find((i) => i.id === id);
export function issInit(i: any) {
  if (!i.tasks) i.tasks = [];
  if (i.rootCause === undefined) i.rootCause = "";
  if (i.corrective === undefined) i.corrective = "";
  if (!i.linkedControls) i.linkedControls = [];
  if (!i.linkedRisks) i.linkedRisks = [];
  return i;
}


const need = (id: string) => { const i = issFind(id); if (!i) throw new SodError("Issue not found."); return issInit(i); };
export const whyCannotWrite = (): string | null => roleReason("changing issues", ...WRITERS);
/** Owner, due date and severity can be changed after creation only by admin/owner. */
export const whyCannotEditCore = (): string | null => roleReason("changing owner, due date or severity", "admin", "owner");
export function pendingClosure(i: any) {
  sweepExpired();
  const a = i.closure ? getApproval(i.closure.approvalId) : undefined;
  return a && a.status === "Pending" ? a : undefined;
}
export function whyCannotProposeClose(i: any): string | null {
  if (i.status === "Closed") return "Already closed.";
  if (pendingClosure(i)) return "A closure is already awaiting verification.";
  return whyCannotWrite();
}
/** Verifier must be a different person from the assignee, the owner and the proposer. */
export function whyCannotVerify(i: any): string | null {
  const a = pendingClosure(i); if (!a) return "No closure is awaiting verification.";
  return roleReason("verifying a closure", ...WRITERS) || selfReason("the verifier cannot be the assignee, the owner or the person who proposed the closure", i.owner, i.assignee, a.requestedBy) || engineWhy(a);
}
export const whyCannotDelete = (i: any): string | null => {
  if (isHighSev(i.sev) && i.status !== "Closed") return "High/Critical issues cannot be deleted; close them through verification.";
  if (DATA.audits.some((a: any) => (a.findings || []).some((f: any) => f.issue === i.id))) return "An audit finding references this issue.";
  return roleReason("deleting an issue", "admin", "owner");
};

export function createIssue(input: { title: string; sev: string; owner: string; due: string }) {
  return viaApi(() => {
    guard(whyCannotWrite());
    const me = getActor();
    const id = nextId("R-", 60, DATA.issues);
    DATA.issues.unshift({ id, title: input.title, sev: ISSUE_SEVS.includes(input.sev) ? input.sev : "High", status: "Open", owner: input.owner || me.name, due: input.due || "Due 14d", createdBy: me.name });
    wsLog("issue.created", `${id} (${input.sev}) by ${me.name}`, "Control");
    return { id };
  }, () => post<{ id: string }>("/issues", input));
}
export function updateIssue(id: string, input: { title: string; sev: string; owner: string; due: string }) {
  return viaApi(() => {
    const i = need(id); guard(whyCannotWrite());
    const core = i.sev !== input.sev || i.owner !== input.owner || i.due !== input.due;
    if (core) {
      guard(whyCannotEditCore());
      if (pendingClosure(i)) throw new SodError("Withdraw the pending closure before changing owner, due date or severity.");
      if (!ISSUE_SEVS.includes(input.sev)) throw new SodError("Unknown severity.");
    }
    const was = `${i.sev}/${i.owner}/${i.due}`;
    i.title = input.title; i.sev = input.sev; i.owner = input.owner; i.due = input.due; // source keeps owner/due as typed (may be empty)
    wsLog("issue.updated", `${i.id}` + (core ? ` core fields ${was} → ${i.sev}/${i.owner}/${i.due} by ${getActor().name}` : " title"), "Control");
    return true;
  }, () => post<boolean>(`/issues/${enc(id)}`, input));
}
export function deleteIssue(id: string) {
  return viaApi(() => {
    const i = need(id); guard(whyCannotDelete(i));
    DATA.issues = DATA.issues.filter((x) => x.id !== id);
    wsLog("issue.deleted", `${id} (${i.sev}) by ${getActor().name}`, "Control"); return true;
  }, () => post<boolean>(`/issues/${enc(id)}/delete`, {}));
}
/** Direct status moves. Closing High/Critical is refused here: it needs the verification step. Reopening needs admin/owner. */
export function setIssueStatus(id: string, status: string) {
  return viaApi(() => {
    const i = need(id); guard(whyCannotWrite());
    if (!ISSUE_STATUSES.includes(status)) throw new SodError("Unknown status.");
    if (status === "Closed" && isHighSev(i.sev)) throw new SodError("High/Critical issues are closed only after a different person verifies the fix.");
    if (i.status === "Closed") guard(roleReason("reopening an issue", "admin", "owner"));
    if (pendingClosure(i)) throw new SodError("A closure is awaiting verification.");
    const from = i.status as string; i.status = status;
    wsLog("issue.status.changed", `${i.id}: ${from} → ${status} by ${getActor().name}` + (status === "Closed" && samePerson(getActor().name, i.createdBy) ? " (closer is the creator)" : ""), "Control");
    return { from };
  }, () => post<{ from: string } | null>(`/issues/${enc(id)}/status`, { status }));
}
/** Propose closing a High/Critical issue. Closure happens only when a different person verifies it with a note. */
export function proposeClosure(id: string, note: string) {
  return viaApi(() => {
    const i = need(id); guard(whyCannotProposeClose(i));
    if (!isHighSev(i.sev)) throw new SodError("Only High/Critical issues need verification; move the status directly.");
    const n = reasonText(note, 10, "A description of the fix");
    const a = requestApproval({ kind: "issue.close", title: `Verify closure of ${i.id} ${i.title}`, subject: i.id, payload: { issueId: i.id, note: n }, needs: 1, approverRoles: ["admin", "owner", "analyst"], forbid: [i.owner, i.assignee].filter(Boolean), ttlHours: 24 * 14 });
    i.closure = { approvalId: a.id, by: a.requestedBy, at: isoDay(), note: n };
    wsLog("issue.closure.proposed", `${i.id} (${i.sev}) ${a.id} by ${a.requestedBy}`, "Control");
    return a.id;
  }, () => post<string>(`/issues/${enc(id)}/closure`, { note }));
}
export function decideClosure(id: string, decision: "verify" | "reject", note: string) {
  return viaApi(() => {
    const i = need(id); guard(whyCannotVerify(i)); const a = pendingClosure(i)!;
    const n = reasonText(note, 10, "A verification note"); const me = getActor().name;
    if (decision === "reject") { engineReject(a.id, n); wsLog("issue.closure.rejected", `${i.id} ${a.id} by ${me}: ${n}`, "Control"); return false; }
    engineApprove(a.id, n);
    const from = i.status; i.status = "Closed"; i.verification = { by: me, at: isoDay(), note: n, approvalId: a.id, proposedBy: a.requestedBy };
    wsLog("issue.closed.verified", `${i.id} (${i.sev}): ${from} → Closed; proposed by ${a.requestedBy}, verified by ${me} (${a.id})`, "Control");
    return true;
  }, () => post<boolean>(`/issues/${enc(id)}/closure/decision`, { decision, note }));
}
export function withdrawClosure(id: string) {
  return viaApi(() => {
    const i = need(id); const a = pendingClosure(i); if (!a) throw new SodError("No closure is awaiting verification.");
    engineWithdraw(a.id); wsLog("issue.closure.withdrawn", `${i.id} ${a.id}`, "Control"); return true;
  }, () => post<boolean>(`/issues/${enc(id)}/closure/withdraw`, {}));
}
export function saveRca(id: string, rootCause: string, corrective: string) {
  return viaApi(() => { guard(whyCannotWrite()); const i = issFind(id); if (!i) return false; i.rootCause = rootCause; i.corrective = corrective; return true; },
    () => post<boolean>(`/issues/${enc(id)}/rca`, { rootCause, corrective }));
}
export function addTask(id: string, text: string) {
  return viaApi(() => { guard(whyCannotWrite()); const i = issInit(issFind(id)); i.tasks.push({ text, done: false }); return true; }, () => post<boolean>(`/issues/${enc(id)}/tasks`, { text }));
}
export function toggleTask(id: string, ti: number) {
  return viaApi(() => { guard(whyCannotWrite()); const i = issInit(issFind(id)); if (!i.tasks[ti]) return false; i.tasks[ti].done = !i.tasks[ti].done; return true; },
    () => post<boolean>(`/issues/${enc(id)}/tasks/${ti}/toggle`, {}));
}
export function linkIssue(id: string, kind: "control" | "risk", value: string) {
  return viaApi(() => {
    guard(whyCannotWrite());
    const i = issInit(issFind(id)); const arr: string[] = kind === "control" ? i.linkedControls : i.linkedRisks;
    if (!arr.includes(value)) arr.push(value);
    return true;
  }, () => post<boolean>(`/issues/${enc(id)}/links`, { kind, value }));
}
