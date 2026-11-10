/* Policies API stubs. Contract: docs/security/SOD_MATRIX.md sections 3 and 5.
 * Lifecycle: Draft -> In review (NAMED approver) -> Approved (immutable, effective date) -> Published (status "Active") -> Review due (derived).
 * Rules live here (deny by default, SodError) and are mirrored by the `whyCannot*` helpers the UI uses to disable buttons with the reason.
 * Mock mode mutates DATA; every transition writes wsLog with policy id + version. A real API must enforce all of this again,
 * own version numbers/timestamps, keep versions immutable and write an append-only trail (see docs/guides/checklist/policies.md). */
import { DATA } from "@/lib/data";
import { wsLog } from "@/lib/audit";
import { getActor, SodError } from "@/lib/sod";
import { approve as engineApprove, reject as engineReject, requestApproval, getApproval, whyCannotApprove as engineWhy } from "@/lib/approvals";
import {
  addBusinessDays, addMonths, eligiblePeople, fmtDay, guard, iAm, isoDay, parseDay, parseIso, personByName, reasonText, roleReason, samePerson, selfReason,
} from "@/lib/grcSod";
import { apiFetch, viaApi } from "@/services/http";

/* eslint-disable @typescript-eslint/no-explicit-any */
const send = <T,>(method: string, path: string, body?: unknown) =>
  apiFetch<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
const enc = encodeURIComponent;

export type VersionStatus = "Draft" | "In review" | "Approved" | "Published" | "Superseded";
export interface PolicyVersion {
  ver: string; name: string; status: VersionStatus; body: string; note: string; cycle: number;
  author: string; editors: string[]; lastEditor: string; createdAt: string;
  approver?: string; approverRole?: string; submittedAt?: string;
  approvedBy?: string; approvedAt?: string; approvalReason?: string; effective?: string;
  publishedBy?: string; publishedAt?: string; supersededAt?: string;
  emergency?: boolean; exceptionId?: string;
}
export interface PolicyException { id: string; ver: string; by: string; at: string; reason: string; dueBy: string; approvalId: string; status: "Pending" | "Approved" | "Rejected"; decidedBy?: string; decidedAt?: string }
export const REVIEW_CYCLES = [6, 12, 24];
export const EMERGENCY_DAYS = 5;
const WORKING: VersionStatus[] = ["Draft", "In review", "Approved"];

export const findPolicy = (id: string) => DATA.policies.find((p) => p.id === id);
export const liveVersion = (p: any): PolicyVersion | undefined => (p.versions || []).find((v: PolicyVersion) => v.status === "Published");
export const workVersion = (p: any): PolicyVersion | undefined => (p.versions || []).find((v: PolicyVersion) => WORKING.includes(v.status));
const cleanVer = (v: unknown) => { const m = /^(\d+)\.(\d+)/.exec(String(v ?? "")); return m ? `${m[1]}.${m[2]}` : "0.1"; };
export const bumpMinor = (v: string) => { const m = /^(\d+)\.(\d+)$/.exec(cleanVer(v)) as RegExpExecArray; return `${m[1]}.${Number(m[2]) + 1}`; };
const today = () => isoDay();

/** Keep the legacy top-level fields (status, ver, name) other modules read: they describe the LIVE version, else the working one. */
function syncTop(p: any) {
  const live = liveVersion(p), work = workVersion(p);
  if (live) { p.status = "Active"; p.ver = live.ver; p.name = live.name; }
  else if (work) { p.status = work.status; p.ver = work.status === "Draft" ? work.ver + " draft" : work.ver; p.name = work.name; }
}
const log = (p: any, ver: string, action: string, reason = "") => {
  p.changeLog.push({ at: today(), ver, by: getActor().name, action, reason });
};

/** source polInit, extended: migrates a prototype record into the versioned model (idempotent, no logging, safe to call from render). */
export function polInit(p: any) {
  if (!p.versions) {
    const st: VersionStatus = p.status === "Active" ? "Published" : p.status === "In review" ? "In review" : p.status === "Approved" ? "Approved" : "Draft";
    p.creator = p.creator || p.owner;
    p.versions = [{
      ver: cleanVer(p.ver), name: p.name, status: st, body: p.body || "", note: "Baseline imported from the previous register (approval evidence not recorded)", cycle: 12,
      author: p.owner, editors: [p.owner], lastEditor: p.owner, createdAt: today(), ...(st === "Published" ? { publishedBy: "Recorded before workflow tracking" } : {}),
    } as PolicyVersion];
  }
  if (!p.changeLog) p.changeLog = [{ at: today(), ver: cleanVer(p.ver), by: p.owner, action: "Baseline imported", reason: "Policy register migrated to the versioned workflow" }];
  if (!p.exceptions) p.exceptions = [];
  if (!p.mappedControls) p.mappedControls = [];
  if (!p.acceptance) p.acceptance = { required: p.status === "Active" ? 42 : 0, done: p.status === "Active" ? Math.round(42 * (0.7 + Math.random() * 0.25)) : 0 };
  return p;
}

/* ---------- derived state ---------- */
export function reviewDue(p: any): boolean {
  const d = parseDay(p.review); if (!d || p.status !== "Active") return false;
  return d.getTime() <= Date.now() + 30 * 86400_000;
}
/** Displayed lifecycle state ("Review due" is derived from the next-review date, never stored). */
export const policyState = (p: any): string => (p.status === "Active" && reviewDue(p) ? "Review due" : p.status);
export function exceptionState(x: PolicyException): "Pending" | "Approved" | "Rejected" | "Overdue" {
  return x.status === "Pending" && x.dueBy < today() ? "Overdue" : x.status;
}
export const openExceptions = (p: any): PolicyException[] => (p.exceptions || []).filter((x: PolicyException) => x.status === "Pending");
export const eligibleApprovers = () => eligiblePeople("admin", "owner");

/* ---------- reasons (null = allowed). Services call guard() on the same functions. ---------- */
export const isPolicyOwner = (p: any) => iAm(p.owner);
export function whyCannotEdit(p: any): string | null {
  const w = workVersion(p);
  return roleReason("editing a policy", "admin", "owner")
    || (isPolicyOwner(p) ? null : `Only the policy owner (${p.owner}) can edit content. An admin can reassign ownership.`)
    || (w && w.status !== "Draft" ? `Content is locked while the version is ${w.status.toLowerCase()}.` : null);
}
export function whyCannotSubmit(p: any): string | null {
  const w = workVersion(p);
  if (!w) return "There is no draft to submit.";
  if (w.status !== "Draft") return `The version is already ${w.status.toLowerCase()}.`;
  return roleReason("submitting a policy", "admin", "owner") || (isPolicyOwner(p) ? null : `Only the policy owner (${p.owner}) can submit it.`);
}
const editorsOf = (w: PolicyVersion) => [w.author, w.lastEditor, ...w.editors];
export function whyCannotApprove(p: any): string | null {
  const w = workVersion(p);
  if (!w || w.status !== "In review") return "Only a version in review can be approved.";
  return roleReason("approving a policy", "admin", "owner")
    || (w.approver ? null : "No approver has been named yet.")
    || selfReason("the author or a last editor cannot approve their own policy", ...editorsOf(w))
    || (iAm(w.approver) ? null : `Only the named approver (${w.approver}) can do this.`);
}
export function whyCannotPublish(p: any): string | null {
  const w = workVersion(p);
  if (!w || w.status !== "Approved") return "Only an approved version can be published.";
  return roleReason("publishing a policy", "admin", "owner")
    || selfReason("the author or a last editor cannot publish their own policy", ...editorsOf(w))
    || (iAm(w.approver) ? null : `Only the named approver (${w.approver}) can publish.`)
    || (w.effective && w.effective > today() ? `The effective date (${w.effective}) has not been reached.` : null);
}
export function whyCannotEmergency(p: any): string | null {
  const w = workVersion(p);
  if (!w || (w.status !== "Draft" && w.status !== "In review")) return "An emergency change needs a draft or in-review version.";
  return roleReason("an emergency change", "admin");
}
export const whyCannotReassign = (p: any): string | null => roleReason("reassigning ownership", "admin") || (p ? null : "Policy not found.");
export function whyCannotDecideException(p: any, x: PolicyException): string | null {
  if (x.status !== "Pending") return `The exception is already ${x.status.toLowerCase()}.`;
  const v = (p.versions as PolicyVersion[]).find((y) => y.ver === x.ver && y.emergency);
  const a = getApproval(x.approvalId);
  return roleReason("retrospective approval", "admin", "owner")
    || selfReason("the person who published the emergency change or its authors cannot approve it", x.by, ...(v ? editorsOf(v) : []))
    || (a ? engineWhy(a) : "Approval record not found.");
}

/* ---------- mutations ---------- */
function need(id: string) { const p = findPolicy(id); if (!p) throw new SodError("Policy not found."); return polInit(p); }
const clean = (s: unknown, max: number) => String(s ?? "").trim().slice(0, max);

export function createPolicy(input: { name: string; body: string; cycle: number }) {
  return viaApi(() => {
    guard(roleReason("creating a policy", "admin", "owner"));
    const me = getActor();
    let n = 20 + DATA.policies.length;
    while (DATA.policies.some((p) => p.id === "P-" + String(n).padStart(3, "0"))) n++;
    const id = "P-" + String(n).padStart(3, "0");
    const name = clean(input.name, 160); if (!name) throw new SodError("Policy name is required.");
    const cycle = REVIEW_CYCLES.includes(input.cycle) ? input.cycle : 12;
    const v: PolicyVersion = { ver: "0.1", name, status: "Draft", body: clean(input.body, 8000), note: "Policy created", cycle, author: me.name, editors: [me.name], lastEditor: me.name, createdAt: today() };
    const p = polInit({ id, name, status: "Draft", owner: me.name, creator: me.name, ver: "0.1 draft", review: "Not started", versions: [v], changeLog: [], exceptions: [] });
    log(p, "0.1", "Policy created", "Creator is recorded as the policy owner");
    DATA.policies.push(p);
    wsLog("policy.created", `${id} v0.1 by ${me.name}`, "Policy");
    return { id };
  }, () => send<{ id: string }>("POST", "/policies", input));
}

/** Save content. Only the policy owner. On an Active policy this starts a NEW draft version (the published one stays untouched). */
export function savePolicy(id: string, input: { name: string; body: string; cycle: number; note: string }) {
  return viaApi(() => {
    const p = need(id); guard(whyCannotEdit(p));
    const me = getActor(); const live = liveVersion(p); let w = workVersion(p); const fresh = !w;
    const name = clean(input.name, 160); if (!name) throw new SodError("Policy name is required.");
    const note = fresh ? reasonText(input.note, 10, "A change reason") : clean(input.note, 300) || "Draft edited";
    if (!w) {
      if (!live) throw new SodError("There is nothing to edit.");
      w = { ver: bumpMinor(live.ver), name: live.name, status: "Draft", body: live.body, note, cycle: live.cycle, author: me.name, editors: [me.name], lastEditor: me.name, createdAt: today() };
      p.versions.push(w);
    }
    w.name = name; w.body = clean(input.body, 8000); w.cycle = REVIEW_CYCLES.includes(input.cycle) ? input.cycle : w.cycle; w.note = note;
    w.lastEditor = me.name; if (!w.editors.some((e) => samePerson(e, me.name))) w.editors.push(me.name);
    syncTop(p); log(p, w.ver, fresh ? "New draft version" : "Draft edited", note);
    wsLog(fresh ? "policy.draft.created" : "policy.draft.saved", `${p.id} v${w.ver}`, "Policy");
    return { ver: w.ver, fresh };
  }, () => send<any>("PATCH", `/policies/${enc(id)}`, input));
}

export function submitForReview(id: string, approverName: string) {
  return viaApi(() => {
    const p = need(id); guard(whyCannotSubmit(p)); const w = workVersion(p) as PolicyVersion;
    const person = personByName(approverName, "admin", "owner"); if (!person) throw new SodError("Choose an approver with the admin or owner role.");
    if (editorsOf(w).some((e) => samePerson(e, person.name))) throw new SodError("Segregation of duties: the approver cannot be the author or a last editor.");
    w.status = "In review"; w.approver = person.name; w.approverRole = person.roleName; w.submittedAt = today();
    syncTop(p); log(p, w.ver, "Submitted for review", "Approver: " + person.name);
    wsLog("policy.submitted", `${p.id} v${w.ver} → approver ${person.name}`, "Policy");
    return { ver: w.ver };
  }, () => send<any>("POST", `/policies/${enc(id)}/submit`, { approver: approverName }));
}

/** Owner changes or names the approver of a version that is in review (same eligibility rules). */
export function setApprover(id: string, approverName: string) {
  return viaApi(() => {
    const p = need(id); const w = workVersion(p);
    if (!w || w.status !== "In review") throw new SodError("Only a version in review has an approver.");
    guard(roleReason("naming an approver", "admin", "owner"), isPolicyOwner(p) ? null : `Only the policy owner (${p.owner}) can name the approver.`);
    const person = personByName(approverName, "admin", "owner"); if (!person) throw new SodError("Choose an approver with the admin or owner role.");
    if (editorsOf(w).some((e) => samePerson(e, person.name))) throw new SodError("Segregation of duties: the approver cannot be the author or a last editor.");
    w.approver = person.name; w.approverRole = person.roleName; syncTop(p);
    log(p, w.ver, "Approver named", person.name); wsLog("policy.approver.named", `${p.id} v${w.ver} → ${person.name}`, "Policy");
    return true;
  }, () => send<any>("POST", `/policies/${enc(id)}/approver`, { approver: approverName }));
}

/** Named approver returns a version to draft with remarks, or the owner withdraws it. */
export function returnToDraft(id: string, reason: string) {
  return viaApi(() => {
    const p = need(id); const w = workVersion(p);
    if (!w || w.status !== "In review") throw new SodError("Only a version in review can be returned to draft.");
    const isApprover = !!w.approver && iAm(w.approver);
    if (!isApprover) guard(roleReason("returning a policy to draft", "admin", "owner"), isPolicyOwner(p) ? null : "Only the named approver or the policy owner can return it to draft.");
    else guard(selfReason("the author or a last editor cannot act as approver", ...editorsOf(w)));
    const r = reasonText(reason, 10, "A reason");
    w.status = "Draft"; w.approver = undefined; w.approverRole = undefined; syncTop(p);
    log(p, w.ver, isApprover ? "Changes requested" : "Withdrawn from review", r); wsLog("policy.returned", `${p.id} v${w.ver}: ${r}`, "Policy");
    return true;
  }, () => send<any>("POST", `/policies/${enc(id)}/return`, { reason }));
}

/** Approval (separate from publication). Named approver only; never the author or a last editor. Freezes the version. */
export function approveVersion(id: string, input: { reason: string; effective?: string }) {
  return viaApi(() => {
    const p = need(id); guard(whyCannotApprove(p)); const w = workVersion(p) as PolicyVersion;
    const reason = reasonText(input.reason, 10, "An approval reason");
    const eff = input.effective || today();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eff) || Number.isNaN(parseIso(eff).getTime())) throw new SodError("Enter a valid effective date.");
    if (eff < today()) throw new SodError("The effective date cannot be in the past.");
    if (parseIso(eff).getTime() > Date.now() + 90 * 86400_000) throw new SodError("The effective date can be at most 90 days ahead.");
    if (w.ver.startsWith("0.")) w.ver = "1.0";
    w.status = "Approved"; w.approvedBy = getActor().name; w.approvedAt = today(); w.approvalReason = reason; w.effective = eff;
    syncTop(p); log(p, w.ver, "Approved (immutable)", reason);
    wsLog("policy.approved", `${p.id} v${w.ver} by ${w.approvedBy}, effective ${eff}`, "Policy");
    return { ver: w.ver };
  }, () => send<any>("POST", `/policies/${enc(id)}/approve`, input));
}

export function publishVersion(id: string) {
  return viaApi(() => {
    const p = need(id); guard(whyCannotPublish(p)); const w = workVersion(p) as PolicyVersion;
    const prev = liveVersion(p); if (prev) { prev.status = "Superseded"; prev.supersededAt = today(); }
    w.status = "Published"; w.publishedBy = getActor().name; w.publishedAt = today();
    syncTop(p); p.body = w.body;
    p.review = fmtDay(addMonths(parseIso(w.effective || today()), w.cycle));
    p.acceptance = { required: 42, done: 0 };
    log(p, w.ver, "Published", "Effective " + (w.effective || today()) + (prev ? "; v" + prev.ver + " superseded (kept in history)" : ""));
    wsLog("policy.published", `${p.id} v${w.ver} by ${w.publishedBy}` + (prev ? `, supersedes v${prev.ver}` : ""), "Policy");
    return { ver: w.ver };
  }, () => send<any>("POST", `/policies/${enc(id)}/publish`, {}));
}

/** Emergency change: admin publishes immediately; an exception record needs retrospective approval within 5 business days by a different person. */
export function emergencyPublish(id: string, reason: string) {
  return viaApi(() => {
    const p = need(id); guard(whyCannotEmergency(p)); const w = workVersion(p) as PolicyVersion;
    const r = reasonText(reason, 20, "An emergency justification");
    const me = getActor();
    const due = addBusinessDays(new Date(), EMERGENCY_DAYS);
    const ap = requestApproval({
      kind: "policy.emergency", title: `Retrospective approval: ${p.name} v${w.ver}`, subject: p.id, payload: { policyId: p.id, ver: w.ver }, needs: 1,
      approverRoles: ["admin", "owner"], forbid: [me.name, ...editorsOf(w)], ttlHours: 24 * 365,
    });
    const prev = liveVersion(p); if (prev) { prev.status = "Superseded"; prev.supersededAt = today(); }
    const exId = "PX-" + (p.exceptions.length + 1);
    p.exceptions.push({ id: exId, ver: w.ver, by: me.name, at: today(), reason: r, dueBy: isoDay(due), approvalId: ap.id, status: "Pending" } as PolicyException);
    if (w.ver.startsWith("0.")) w.ver = "1.0";
    w.status = "Published"; w.emergency = true; w.exceptionId = exId; w.effective = today(); w.publishedBy = me.name; w.publishedAt = today(); w.approver = undefined;
    syncTop(p); p.body = w.body; p.review = fmtDay(addMonths(new Date(), w.cycle)); p.acceptance = { required: 42, done: 0 };
    log(p, w.ver, "EMERGENCY publish (exception " + exId + ")", r);
    wsLog("policy.emergency.published", `${p.id} v${w.ver} by ${me.name}; exception ${exId} (${ap.id}) due ${isoDay(due)}`, "Policy");
    return { exId, dueBy: isoDay(due) };
  }, () => send<any>("POST", `/policies/${enc(id)}/emergency`, { reason }));
}

export function decideException(id: string, exId: string, decision: "approve" | "reject", reason: string) {
  return viaApi(() => {
    const p = need(id); const x = (p.exceptions as PolicyException[]).find((e) => e.id === exId); if (!x) throw new SodError("Exception not found.");
    guard(whyCannotDecideException(p, x));
    const me = getActor().name;
    if (decision === "approve") engineApprove(x.approvalId, reason); else { reasonText(reason, 10, "A reason"); engineReject(x.approvalId, reason); }
    x.status = decision === "approve" ? "Approved" : "Rejected"; x.decidedBy = me; x.decidedAt = today();
    log(p, x.ver, `Emergency exception ${x.id} ${x.status.toLowerCase()}`, String(reason).trim().slice(0, 300));
    wsLog("policy.exception." + (decision === "approve" ? "approved" : "rejected"), `${p.id} v${x.ver} ${x.id} by ${me}${exceptionState({ ...x, status: "Pending" }) === "Overdue" ? " (after the 5 business day deadline)" : ""}`, "Policy");
    return x;
  }, () => send<any>("POST", `/policies/${enc(id)}/exceptions/${enc(exId)}`, { decision, reason }));
}

/** Admin reassigns ownership to a role successor with a reason. The previous owner loses edit rights immediately. */
export function reassignOwner(id: string, successor: string, reason: string) {
  return viaApi(() => {
    const p = need(id); guard(whyCannotReassign(p));
    const person = personByName(successor, "admin", "owner"); if (!person) throw new SodError("Choose a successor with the admin or owner role.");
    const r = reasonText(reason, 10, "A reason");
    if (samePerson(person.name, p.owner)) throw new SodError("The successor is already the owner.");
    guard(selfReason("an admin cannot reassign a policy to themselves", person.name));
    const w = workVersion(p);
    if (w && w.status === "In review" && w.approver && samePerson(w.approver, person.name)) throw new SodError("The successor is the named approver of the pending version. Return it to draft first.");
    const prev = p.owner; p.owner = person.name;
    log(p, p.ver, "Ownership reassigned", `${prev} → ${person.name}: ${r}`);
    wsLog("policy.owner.reassigned", `${p.id}: ${prev} → ${person.name}: ${r}`, "Policy");
    return true;
  }, () => send<any>("POST", `/policies/${enc(id)}/owner`, { successor, reason }));
}

export function mapControl(id: string, control: string) {
  return viaApi(() => {
    const p = need(id); guard(roleReason("mapping controls", "admin", "owner"));
    if (!DATA.controls.some((c) => c.id === control)) throw new SodError("Unknown control.");
    if (!p.mappedControls.includes(control)) p.mappedControls.push(control);
    wsLog("policy.control.mapped", `${p.id} v${p.ver} → ${control}`, "Policy");
    return p;
  }, () => send<any>("POST", `/policies/${enc(id)}/controls`, { control }));
}
export function remindOutstanding(id: string) {
  return viaApi(() => {
    const p = need(id); guard(roleReason("sending reminders", "admin", "owner"));
    const out = p.acceptance.required - p.acceptance.done;
    wsLog("policy.acceptance.reminded", `${p.id} v${p.ver}, ${out} outstanding`, "Policy");
    return out;
  }, () => send<number>("POST", `/policies/${enc(id)}/remind`, {}));
}

