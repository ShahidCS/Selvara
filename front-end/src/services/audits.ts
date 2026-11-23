/* Audits API stubs. In mock mode (default) each function performs the in-memory DATA mutation the prototype did and returns the result;
 * the caller then does wsLog / toast / bumpData. In http mode it would call the (not yet existing) API, which must re-check authorization. */
import { DATA, FW_SHORT } from "@/lib/data";
import { nowStamp } from "@/lib/format";
import { wsLog } from "@/lib/audit";
import { baseRole, getActor, SodError } from "@/lib/sod";
import { guard, isoDay, reasonText, roleReason, samePerson } from "@/lib/grcSod";
import { apiFetch, viaApi } from "./http";
import { API_ON } from "@/lib/rbac";
import { wsPost } from "./ws";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const AUDIT_FWS = ["ISO 27001", "SOC 2", "GDPR", "PCI DSS", "NIST CSF", "-"];
export const PBC_ORDER = ["Requested", "Outstanding", "Received"];
/** Progress per stage index (source: [0,40,85,100][i+1]). */
export const STAGE_PROGRESS = [0, 40, 85, 100];

/** Production: the same change on the server (under /api/ws), then the workspace reloads. */
const post = <T,>(path: string, body: unknown) => wsPost<T>(`/ws${path}`, body);
const enc = encodeURIComponent;

export const FINDING_SEVS = ["Critical", "High", "Medium", "Low"];
/** A finding counts as open once management has it on its books (not a draft or a rejected draft, not closed). */
export const isOpenFinding = (f: any) => !["Closed", "Draft", "Rejected"].includes(f.status);
const today = () => isoDay();

export const findAudit = (id: string) => DATA.audits.find((a) => a.id === id);
export function auditInit(a: any) {
  if (a.auditorAccess === undefined) a.auditorAccess = "none";
  if (a.populationsFrozen === undefined) a.populationsFrozen = false;
  if (!a.irs) a.irs = [];
  return a;
}
/** Unique demo id with the source's numbering (`prefix + (base + count)`); bumps past ids already in use. */
export function nextId(prefix: string, base: number, list: { id: string }[]): string {
  let n = base + list.length;
  while (list.some((x) => x.id === prefix + n)) n++;
  return prefix + n;
}


const need = (id: string) => { const a = findAudit(id); if (!a) throw new SodError("Audit not found."); return auditInit(a); };
/** Management (admin/owner) owns the organisation's audit records. Auditors (and every other role) are read-only on them. */
export const whyCannotManage = (): string | null => roleReason("managing an audit", "admin", "owner");
const leadName = (a: any) => String(a.lead).replace(/^[^,]+,\s*/, "");
/** Auditor actions (raise information requests, draft findings) need the auditor role, an engagement assigned to them and shared access. */
export function whyCannotAuditorAct(a: any): string | null {
  // production: the server sends an auditor only the engagements assigned to them while access is live
  if (API_ON) return roleReason("this auditor action", "auditor") || (a.auditorAccess === "granted" ? null : a.auditorAccess === "ended" ? "Auditor access for this engagement has ended." : "Auditor access has not been granted for this engagement yet.");
  return roleReason("this auditor action", "auditor")
    || (/External/.test(a.lead) && samePerson(getActor().name, leadName(a)) ? null : "You are not the assigned auditor for this engagement.")
    || (a.auditorAccess === "granted" ? null : a.auditorAccess === "ended" ? "Auditor access for this engagement has ended." : "Auditor access has not been granted for this engagement yet.");
}
/** Production: an answered request is closed with the engagement, so only open ones block completion. */
const openIrs = (a: any) => (a.irs || []).filter((r: any) => (API_ON ? r.status === "Open" : r.status !== "Closed"));
const draftFindings = (a: any) => (a.findings || []).filter((f: any) => f.status === "Draft");
/** Reasons the engagement cannot be closed yet (null = may close). Open findings or outstanding requests only need a recorded reason. */
export function whyCannotComplete(a: any): string | null {
  if (draftFindings(a).length) return `${draftFindings(a).length} auditor-drafted finding(s) await a management decision.`;
  if (openIrs(a).length) return `${openIrs(a).length} information request(s) are still open.`;
  return null;
}
export const needsCloseReason = (a: any): boolean => (a.findings || []).some(isOpenFinding) || (a.pbc || []).some((p: any) => p.status !== "Received");

export function createAudit(input: { name: string; fw: string; auditor: string; scope: string }) {
  return viaApi(() => {
    guard(whyCannotManage());
    const id = nextId("AUD-", 10, DATA.audits); const me = getActor();
    DATA.audits.push({
      id, name: input.name, fw: input.fw, auditor: input.auditor || "Internal Audit", lead: "Internal, " + me.name, stage: "Planned",
      scope: input.scope || "To be defined", period: "Planning", progress: 0, opened: nowStamp().slice(0, 10), pbc: [], tests: [], findings: [],
    });
    return { id };
  }, () => post<{ id: string }>("/audits", input));
}
export function grantAuditorAccess(id: string, auditorId = "", until = "") {
  return viaApi(() => { const a = need(id); guard(whyCannotManage()); a.auditorAccess = "granted"; return true; }, () => post<boolean>(`/audits/${enc(id)}/auditor-access`, { auditorId, until }));
}
/** Completes the engagement and revokes the external auditor. Blocked while drafts/requests are pending; open items need a recorded reason. */
export function endAuditorAccess(id: string, reason = "") {
  return viaApi(() => {
    const a = need(id); guard(whyCannotManage(), whyCannotComplete(a));
    const r = needsCloseReason(a) ? reasonText(reason, 10, "A reason for closing with open findings or outstanding requests") : String(reason).trim().slice(0, 500);
    a.auditorAccess = "ended";
    if (a.stage !== "Complete") { a.stage = "Complete"; a.progress = 100; }
    wsLog("audit.auditor.access.ended", `${a.id} by ${getActor().name}` + (r ? `: ${r}` : ""), "Audit");
    return true;
  }, () => post<boolean>(`/audits/${enc(id)}/auditor-access/end`, { reason }));
}
export function freezePopulations(id: string) {
  return viaApi(() => { const a = need(id); guard(whyCannotManage()); a.populationsFrozen = true; return true; }, () => post<boolean>(`/audits/${enc(id)}/populations/freeze`, {}));
}
export function advanceStage(id: string, reason = "") {
  return viaApi(() => {
    const a = need(id); guard(whyCannotManage());
    const i = DATA.auditStages.indexOf(a.stage);
    if (i < DATA.auditStages.length - 1) {
      const next = DATA.auditStages[i + 1];
      if (next === "Complete") {
        guard(whyCannotComplete(a));
        if (a.auditorAccess === "granted") throw new SodError("Use \"Complete & end auditor access\" so the external auditor is revoked and the reason is recorded.");
      }
      a.stage = next; a.progress = Math.min(100, STAGE_PROGRESS[i + 1]); return { stage: a.stage as string };
    }
    return null;
  }, () => post<{ stage: string } | null>(`/audits/${enc(id)}/advance`, { reason }));
}
/** Management PBC items: only management advances them (auditors raise information requests instead). */
export function cyclePbc(id: string, pid: string) {
  return viaApi(() => {
    const a = need(id); guard(whyCannotManage()); const p = a.pbc.find((x: any) => x.id === pid);
    if (!p) return null;
    p.status = PBC_ORDER[(PBC_ORDER.indexOf(p.status) + 1) % PBC_ORDER.length];
    return { id: p.id as string, status: p.status as string };
  }, () => post<{ id: string; status: string } | null>(`/audits/${enc(id)}/pbc/${enc(pid)}/advance`, {}));
}
export function addPbc(id: string, input: { item: string; owner: string; ownerId?: string }) {
  return viaApi(() => {
    const a = need(id); guard(whyCannotManage()); const pid = "PBC-" + (50 + a.pbc.length);
    a.pbc.push({ id: pid, item: input.item, owner: input.owner || "Unassigned", status: "Requested" });
    return { id: pid };
  }, () => post<{ id: string }>(`/audits/${enc(id)}/pbc`, input));
}
/** Management accepts a finding into an issue (auditors cannot create issues). A drafted finding becomes Open on acceptance. */
export function promoteFinding(id: string, fid: string) {
  return viaApi(() => {
    const a = need(id); guard(whyCannotManage()); const f = a.findings.find((x: any) => x.id === fid);
    if (!f || f.issue || f.status === "Closed" || f.status === "Rejected") return null;
    const me = getActor(); const iid = nextId("R-", 60, DATA.issues);
    const wasDraft = f.status === "Draft";
    DATA.issues.unshift({ id: iid, title: f.title, sev: f.sev, status: "Open", owner: /^Internal/.test(a.lead) ? leadName(a) : me.name, due: "Due 14d", createdBy: me.name });
    f.issue = iid; if (wasDraft) { f.status = "Open"; f.acceptedBy = me.name; f.acceptedAt = today(); }
    wsLog("audit.finding.promoted", `${a.id} ${f.id} → ${iid}${wasDraft ? " (accepted draft by " + f.draftedBy + ")" : ""} by ${me.name}`, "Audit");
    return { iid, title: f.title as string };
  }, async () => { const r = await post<{ issue: string }>(`/audits/${enc(id)}/findings/${enc(fid)}/issue`, {}); return { iid: r.issue, title: "" }; });
}
export function rejectFinding(id: string, fid: string, reason: string) {
  return viaApi(() => {
    const a = need(id); guard(whyCannotManage()); const f = a.findings.find((x: any) => x.id === fid);
    if (!f || f.status !== "Draft") throw new SodError("Only a drafted finding can be declined.");
    f.status = "Rejected"; f.rejectedReason = reasonText(reason, 10, "A reason"); f.rejectedBy = getActor().name;
    wsLog("audit.finding.rejected", `${a.id} ${f.id} by ${f.rejectedBy}: ${f.rejectedReason}`, "Audit");
    return true;
  }, () => post<boolean>(`/audits/${enc(id)}/findings/${enc(fid)}/reject`, { reason }));
}
/** Auditors draft findings; management decides. */
export function draftFinding(id: string, input: { title: string; sev: string; rec: string }) {
  return viaApi(() => {
    const a = need(id); guard(whyCannotAuditorAct(a));
    if (!FINDING_SEVS.includes(input.sev)) throw new SodError("Unknown severity.");
    const fid = "F-" + String(a.findings.length + 1).padStart(2, "0");
    a.findings.push({ id: fid, title: input.title, sev: input.sev, status: "Draft", rec: input.rec, issue: "", draftedBy: getActor().name });
    wsLog("audit.finding.drafted", `${a.id} ${fid} (${input.sev}) by ${getActor().name}`, "Audit");
    return { id: fid };
  }, () => post<{ id: string }>(`/audits/${enc(id)}/findings`, input));
}
export function raiseInformationRequest(id: string, item: string) {
  return viaApi(() => {
    const a = need(id); guard(whyCannotAuditorAct(a));
    const rid = "IR-" + String(a.irs.length + 1).padStart(2, "0");
    a.irs.push({ id: rid, item, by: getActor().name, at: today(), status: "Open", response: "" });
    wsLog("audit.ir.raised", `${a.id} ${rid} by ${getActor().name}`, "Audit");
    return { id: rid };
  }, () => post<{ id: string }>(`/audits/${enc(id)}/information-requests`, { item }));
}
export function respondInformationRequest(id: string, rid: string, response: string) {
  return viaApi(() => {
    const a = need(id); guard(whyCannotManage()); const r = a.irs.find((x: any) => x.id === rid);
    if (!r || r.status !== "Open") throw new SodError("The request is not open.");
    r.response = reasonText(response, 5, "A response"); r.status = "Answered"; r.answeredBy = getActor().name;
    wsLog("audit.ir.answered", `${a.id} ${rid} by ${r.answeredBy}`, "Audit");
    return true;
  }, () => post<boolean>(`/audits/${enc(id)}/information-requests/${enc(rid)}/respond`, { response }));
}
export function closeInformationRequest(id: string, rid: string) {
  return viaApi(() => {
    const a = need(id); guard(whyCannotAuditorAct(a)); const r = a.irs.find((x: any) => x.id === rid);
    if (!r || r.status === "Closed") throw new SodError("The request is already closed.");
    r.status = "Closed"; wsLog("audit.ir.closed", `${a.id} ${rid} by ${getActor().name}`, "Audit"); return true;
  }, () => post<boolean>(`/audits/${enc(id)}/information-requests/${enc(rid)}/close`, {}));
}
/** Plain-text draft report (downloaded as text/plain; never rendered as HTML). */
export function exportReport(id: string) {
  return viaApi(() => {
    const a = findAudit(id)!;
    return `AUDIT REPORT (DRAFT) — ${a.name}\nFramework: ${a.fw}\nAuditor: ${a.auditor}\nStage: ${a.stage}\nScope: ${a.scope}\n\nRequests: ${a.pbc.map((p: any) => p.id + " " + p.item + " [" + p.status + "]").join("; ")}\nTests: ${a.tests.map((t: any) => t.id + " " + t.ctrl + " " + t.result).join("; ")}\nFindings:\n${a.findings.filter((f: any) => f.status !== "Draft").map((f: any) => " - [" + f.sev + "] " + f.title + " (" + f.status + ")" + (f.issue ? " -> " + f.issue : "")).join("\n")}\n\nDraft only. Requires human review before use.`;
  }, async () => (await apiFetch<{ content: string }>(`/ws/audits/${enc(id)}/report`, { method: "POST", body: "{}" })).content);
}

/* ---------- What management shares with an engagement's auditor ---------- */
/** The three lists an engagement shares with its auditor (server: `Audit.shared`; missing means nothing shared). */
export const SHARE_KINDS = ["controls", "evidence", "policies"] as const;
export type ShareKind = (typeof SHARE_KINDS)[number];
export const SHARE_MAX = 500;
export const sharedOf = (a: any): Record<ShareKind, string[]> => ({ controls: a?.shared?.controls ?? [], evidence: a?.shared?.evidence ?? [], policies: a?.shared?.policies ?? [] });
/** Management adds (on) or removes one record from what the engagement's auditor may see. The server checks it again. */
export function setShared(id: string, kind: ShareKind, itemId: string, on: boolean) {
  return viaApi(() => {
    const a = need(id); guard(whyCannotManage());
    if (a.stage === "Complete") throw new SodError("This engagement is complete and locked.");
    if (!SHARE_KINDS.includes(kind)) throw new SodError("Choose controls, evidence or policies.");
    const sh = sharedOf(a); const has = sh[kind].includes(itemId);
    if (on) {
      if (has) return true;
      if (!(DATA as any)[kind].some((x: any) => x.id === itemId)) throw new SodError("Unknown item: choose one of the company's records.");
      if (sh[kind].length >= SHARE_MAX) throw new SodError(`At most ${SHARE_MAX} ${kind} can be shared with one engagement.`);
      sh[kind] = [...sh[kind], itemId];
    } else {
      if (!has) return true;
      sh[kind] = sh[kind].filter((x) => x !== itemId);
    }
    a.shared = sh;
    wsLog(on ? "audit.shared.added" : "audit.shared.removed", `${a.id} ${a.name}: ${kind} ${itemId} by ${getActor().name}`, "Audit");
    return true;
  }, () => post<boolean>(`/audits/${enc(id)}/shared`, { kind, id: itemId, on }));
}
const isAuditor = () => baseRole(getActor().roleId) === "auditor";
/** The signed-in auditor's engagements whose access is live (production: the server sends an auditor only those). Empty for other roles. */
export const myEngagements = (): any[] => (isAuditor() ? DATA.audits.filter((a) => !whyCannotAuditorAct(auditInit(a))) : []);
/** The framework an engagement names ("ISO 27001") as the id the frameworks data uses, or null. */
const fwIdOf = (fw: string): string | null =>
  Object.entries(FW_SHORT).find(([k, v]) => v === fw && DATA.frameworks.some((f) => f.id === k))?.[0] ?? DATA.frameworks.find((f) => f.name === fw)?.id ?? null;
export interface AuditorScope { frameworks: Set<string>; controls: Set<string>; evidence: Set<string>; policies: Set<string> }
/** What an external auditor may see in Frameworks, Controls, Evidence and Policies: their live engagements' frameworks and what management
 *  shared with them. Null when nothing is limited: other roles, and production, where the server sends an auditor only this (server/ws/audits.ts). */
export function auditorScope(): AuditorScope | null {
  if (API_ON || !isAuditor()) return null;
  const s: AuditorScope = { frameworks: new Set(), controls: new Set(), evidence: new Set(), policies: new Set() };
  for (const a of myEngagements()) {
    const fw = fwIdOf(a.fw); if (fw) s.frameworks.add(fw);
    const sh = sharedOf(a); for (const k of SHARE_KINDS) for (const x of sh[k]) s[k].add(x);
  }
  return s;
}
/** Whether the signed-in person may see this record (always, unless they are an auditor and it is outside their scope). */
export const inAuditorScope = (kind: keyof AuditorScope, id: string): boolean => { const s = auditorScope(); return !s || s[kind].has(id); };
/** The records of a list the signed-in person may see. */
export function scoped<T extends { id: string }>(kind: keyof AuditorScope, list: T[]): T[] { const s = auditorScope(); return s ? list.filter((x) => s[kind].has(x.id)) : list; }
/** Tests the signed-in person may see: for an auditor, those supporting a control in their scope, each naming only the controls in it. */
export function scopedTests<T extends { controls: string[] }>(list: T[]): T[] {
  const s = auditorScope(); if (!s) return list;
  return list.filter((x) => x.controls.some((c) => s.controls.has(c))).map((x) => ({ ...x, controls: x.controls.filter((c) => s.controls.has(c)) }));
}

/** Production: a risk register snapshot shared with this engagement's auditor, as JSON text for download. */
export async function sharedSnapshot(id: string, sid: string): Promise<string> {
  return JSON.stringify(await apiFetch<unknown>(`/ws/audits/${enc(id)}/snapshots/${enc(sid)}`), null, 2);
}
