/* Generic four-eyes approval engine (contract: docs/security/SOD_MATRIX.md). Modules create an approval request for a high-impact action,
 * a DIFFERENT authorised person approves it, and only then does the module's service apply the change.
 * In-memory demo store; the real API must persist, authorise and audit this server-side. */
import { createStore, bumpData } from "./store";
import { getActor, hasRole, isSamePerson, SodError } from "./sod";
import { wsLog } from "./audit";
import { adminLog } from "./adminAudit";

export type ApprovalStatus = "Pending" | "Approved" | "Rejected" | "Withdrawn" | "Expired";
export interface Approval {
  id: string; kind: string; title: string; subject?: string; requestedBy: string; requestedByRole: string; payload: Record<string, unknown>;
  needs: number;                    // approvals required (1 or 2)
  approverRoles: string[];          // base roles allowed to approve
  forbid: string[];                 // extra people who can never approve (subject, owner, beneficiary...)
  approvals: { by: string; at: string; reason: string }[];
  status: ApprovalStatus; createdAt: number; expiresAt: number; decidedReason?: string; ticket?: string; domain: "ws" | "admin";
}
export const approvals = createStore<{ list: Approval[] }>({ list: [] });
const nextId = (() => { let n = 100; return () => "AP-" + (++n); })();

export interface NewApproval { kind: string; title: string; subject?: string; payload?: Record<string, unknown>; needs?: 1 | 2; approverRoles: string[]; forbid?: unknown[]; ttlHours?: number; ticket?: string; domain?: "ws" | "admin" }
export function requestApproval(o: NewApproval): Approval {
  const me = getActor();
  const a: Approval = {
    id: nextId(), kind: o.kind, title: o.title, subject: o.subject, requestedBy: me.name, requestedByRole: me.roleName, payload: o.payload || {},
    needs: o.needs || 1, approverRoles: o.approverRoles, forbid: (o.forbid || []).map(String), approvals: [], status: "Pending",
    createdAt: Date.now(), expiresAt: Date.now() + (o.ttlHours ?? 24) * 3600_000, ticket: o.ticket, domain: o.domain || "ws",
  };
  approvals.set((s) => ({ list: [a, ...s.list] }));
  audit(a, "requested", `${a.title} (${a.id})`); bumpData(); return a;
}
const audit = (a: Approval, verb: string, target: string) =>
  (a.domain === "admin" ? adminLog(`approval.${a.kind}.${verb}`, target, { categories: ["Approval"], basis: "Legitimate interest" }) : wsLog(`approval.${a.kind}.${verb}`, target, "Approval"));

export function sweepExpired(): void {
  const now = Date.now(); let changed = false;
  approvals.get().list.forEach((a) => { if (a.status === "Pending" && a.expiresAt <= now) { a.status = "Expired"; audit(a, "expired", `${a.title} (${a.id})`); changed = true; } });
  if (changed) { approvals.set((s) => ({ list: [...s.list] })); bumpData(); }
}
/** Reason a given person cannot approve (null = may approve). Use for disabling buttons. */
export function whyCannotApprove(a: Approval): string | null {
  const me = getActor();
  if (a.status !== "Pending") return `Request is ${a.status.toLowerCase()}.`;
  if (a.expiresAt <= Date.now()) return "Request has expired.";
  if (!hasRole(me.roleId, ...a.approverRoles)) return `Only ${a.approverRoles.join(" / ")} can approve.`;
  if (isSamePerson(me.name, a.requestedBy)) return "Segregation of duties: you cannot approve your own request.";
  if (a.forbid.some((f) => isSamePerson(me.name, f))) return "Segregation of duties: you are the subject or owner of this request.";
  if (a.approvals.some((x) => isSamePerson(x.by, me.name))) return "You have already approved this request.";
  return null;
}
export function approve(id: string, reason: string): Approval {
  sweepExpired(); const a = approvals.get().list.find((x) => x.id === id); if (!a) throw new SodError("Request not found.");
  const why = whyCannotApprove(a); if (why) throw new SodError(why);
  const r = String(reason || "").trim(); if (r.length < 10) throw new SodError("Give a reason of at least 10 characters.");
  a.approvals.push({ by: getActor().name, at: new Date().toISOString(), reason: r.slice(0, 300) });
  if (a.approvals.length >= a.needs) a.status = "Approved";
  audit(a, a.status === "Approved" ? "approved" : "approval.recorded", `${a.title} (${a.id})`);
  approvals.set((s) => ({ list: [...s.list] })); bumpData(); return a;
}
export function reject(id: string, reason: string): Approval {
  sweepExpired(); const a = approvals.get().list.find((x) => x.id === id); if (!a) throw new SodError("Request not found.");
  const why = whyCannotApprove(a); if (why) throw new SodError(why);
  a.status = "Rejected"; a.decidedReason = String(reason || "").trim().slice(0, 300); audit(a, "rejected", `${a.title} (${a.id})`);
  approvals.set((s) => ({ list: [...s.list] })); bumpData(); return a;
}
/** Only the requester can withdraw (this is NOT a rejection). */
export function withdraw(id: string): Approval {
  const a = approvals.get().list.find((x) => x.id === id); if (!a) throw new SodError("Request not found.");
  if (!isSamePerson(getActor().name, a.requestedBy)) throw new SodError("Only the requester can withdraw a request.");
  if (a.status !== "Pending") throw new SodError(`Request is ${a.status.toLowerCase()}.`);
  a.status = "Withdrawn"; audit(a, "withdrawn", `${a.title} (${a.id})`);
  approvals.set((s) => ({ list: [...s.list] })); bumpData(); return a;
}
export const getApproval = (id: string) => approvals.get().list.find((x) => x.id === id);
export const pendingFor = (kind?: string) => approvals.get().list.filter((a) => a.status === "Pending" && (!kind || a.kind === kind));
