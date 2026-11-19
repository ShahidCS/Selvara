/* Generic four-eyes approval engine (contract: docs/security/SOD_MATRIX.md). Modules create an approval request for a high-impact action,
 * a DIFFERENT authorised person approves it, and only then does the module's service apply the change.
 * In-memory demo store; the real API must persist, authorise and audit this server-side. */
import { createStore, bumpData } from "./store";
import { baseRole, getActor, personKey, SodError } from "./sod";
import { approvalBlock, reasonBlock, withdrawBlock, type Decider } from "./rules";
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
/** Reason a given person cannot approve (null = may approve). Use for disabling buttons. The rule itself is shared with the server (rules.ts). */
const me = (): Decider => { const a = getActor(); return { key: personKey(a.name), base: baseRole(a.roleId) }; };
export function whyCannotApprove(a: Approval): string | null {
  return approvalBlock(me(), { status: a.status, expiresAt: a.expiresAt, approverRoles: a.approverRoles, requestedBy: personKey(a.requestedBy), forbid: a.forbid.map(personKey), votes: a.approvals.map((x) => personKey(x.by)) }, Date.now());
}
export function approve(id: string, reason: string): Approval {
  sweepExpired(); const a = approvals.get().list.find((x) => x.id === id); if (!a) throw new SodError("Request not found.");
  const why = whyCannotApprove(a); if (why) throw new SodError(why);
  const r = String(reason || "").trim(); const short = reasonBlock(r); if (short) throw new SodError(short);
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
  const why = withdrawBlock(me(), { status: a.status, requestedBy: personKey(a.requestedBy) }); if (why) throw new SodError(why);
  a.status = "Withdrawn"; audit(a, "withdrawn", `${a.title} (${a.id})`);
  approvals.set((s) => ({ list: [...s.list] })); bumpData(); return a;
}
export const getApproval = (id: string) => approvals.get().list.find((x) => x.id === id);
export const pendingFor = (kind?: string) => approvals.get().list.filter((a) => a.status === "Pending" && (!kind || a.kind === kind));
