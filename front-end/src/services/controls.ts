/* Controls API stubs. In mock mode (default) each function performs the in-memory DATA mutation the prototype did and
 * returns the result; the caller then does wsLog / toast / bumpData. In http mode it would call the (not yet existing) API. */
import { DATA, FW_SHORT, testsForControl } from "@/lib/data";
import { nowStamp, csvCell } from "@/lib/format";
import { wsLog } from "@/lib/audit";
import { getActor, SodError } from "@/lib/sod";
import { approve as engineApprove, getApproval, reject as engineReject, requestApproval, whyCannotApprove as engineWhy } from "@/lib/approvals";
import { guard, iAm, isoDay, parseIso, reasonText, roleReason, selfReason } from "@/lib/grcSod";
import { apiFetch, viaApi } from "./http";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const MATRIX_FWS = ["iso27001", "soc2", "nistcsf", "gdpr", "pci"];
export const CONTROL_DOMAINS = ["Governance", "Identity & Access", "Operations", "Cryptography", "Network", "Logging", "Business Continuity", "Third Party", "Privacy", "AI"];
let TESTSEQ = 6; // source: let TESTSEQ=6

const post = <T,>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
const csv = (head: string[], rows: unknown[][]) =>
  [head.join(",")].concat(rows.map((r) => r.map(csvCell).join(","))).join("\n");

export const CONTROL_STATUSES = ["Pass", "Needs evidence", "Fail"];
export interface ControlException { id: string; requestedBy: string; at: string; reason: string; compensating: string; expires: string; approvalId: string; expiryLogged?: boolean }
const need = (id: string) => { const c = DATA.controls.find((x) => x.id === id); if (!c) throw new SodError("Control not found."); return c; };
const today = () => isoDay();

/* ---------- reasons (null = allowed); services guard() the same functions the UI uses to disable buttons ---------- */
export const whyCannotManage = (): string | null => roleReason("changing controls", "admin", "owner");
export const whyCannotRunTests = (): string | null => roleReason("running tests", "admin", "owner", "analyst");
export function whyCannotAttest(c: any): string | null {
  return roleReason("attesting a control", "admin", "owner") || (iAm(c.owner) ? null : `Only the control owner (${c.owner}) can attest.`);
}
/** Controls with linked automated tests take their status from the tests; a manual override is blocked (use an exception/waiver). */
export function whyCannotSetStatus(c: any): string | null {
  const n = testsForControl(c.id).length;
  if (n) return `Status follows ${n} automated test${n > 1 ? "s" : ""}; it cannot be overridden manually. Request an exception with a compensating control instead.`;
  return roleReason("changing control status", "admin", "owner") || (iAm(c.owner) ? null : `Only the control owner (${c.owner}) can change the status.`);
}
export const whyCannotRequestException = (): string | null => roleReason("requesting an exception", "admin", "owner");
export function exceptionState(x: ControlException): "Pending" | "Active" | "Expired" | "Rejected" {
  const a = getApproval(x.approvalId);
  if (!a || a.status === "Rejected" || a.status === "Withdrawn") return "Rejected";
  if (a.status === "Pending") return x.expires < today() ? "Expired" : "Pending";
  if (a.status === "Expired") return "Expired";
  return x.expires < today() ? "Expired" : "Active";
}
export const exceptionsOf = (c: any): ControlException[] => c.exceptions || [];
export function whyCannotDecideException(c: any, x: ControlException): string | null {
  const a = getApproval(x.approvalId);
  if (exceptionState(x) !== "Pending") return "This request is no longer pending.";
  return roleReason("approving an exception", "admin", "owner") || selfReason("the requester and the control owner cannot approve the exception", x.requestedBy, c.owner) || (a ? engineWhy(a) : "Approval record not found.");
}
/** Audit the expiry of waivers once (call from event handlers, never from render). */
export function sweepExceptions(): void {
  DATA.controls.forEach((c) => exceptionsOf(c).forEach((x) => {
    if (!x.expiryLogged && exceptionState(x) === "Expired" && getApproval(x.approvalId)?.status === "Approved") { x.expiryLogged = true; wsLog("control.exception.expired", `${c.id} ${x.id} expired ${x.expires}`, "Control"); }
  }));
}
/** Status derived from automated tests: any failure => Fail; all passing => Pass; otherwise Needs evidence. */
function followTests(c: any): void {
  const ts = testsForControl(c.id); if (!ts.length) return;
  const next = ts.some((t) => t.result === "Fail") ? "Fail" : ts.every((t) => t.result === "Pass") ? "Pass" : "Needs evidence";
  if (c.status !== next) { const from = c.status; c.status = next; wsLog("control.status.followed-tests", `${c.id}: ${from} → ${next} (automated tests)`, "Control"); }
}

export function createControl(input: { title: string; domain: string; owner: string }) {
  return viaApi(() => {
    guard(whyCannotManage());
    const pre = (input.domain.match(/[A-Z]/g) || ["C"]).slice(0, 3).join("");
    const id = pre + "-" + (DATA.controls.filter((c) => c.id.startsWith(pre)).length + 1);
    DATA.controls.push({ id, title: input.title, domain: CONTROL_DOMAINS.includes(input.domain) ? input.domain : CONTROL_DOMAINS[0], owner: input.owner || getActor().name, status: "Needs evidence", map: {}, custom: true });
    return { id };
  }, () => post<{ id: string }>("/controls", input));
}
/** Attestation is always made by the signed-in control owner (the attester name cannot be typed). */
export function attestControl(id: string, note: string) {
  return viaApi(() => {
    const c = need(id); guard(whyCannotAttest(c));
    const n = reasonText(note, 1, "A statement");
    c.attestation = { by: getActor().name, at: nowStamp().slice(0, 10), note: n };
    wsLog("control.attested", `${c.id} by ${c.attestation.by}`, "Control");
    return c.attestation as { by: string; at: string; note: string };
  }, () => post<{ by: string; at: string; note: string }>(`/controls/${encodeURIComponent(id)}/attestation`, { note }));
}
/** Manual status change: only for controls WITHOUT automated tests, only by the control owner, with a reason. */
export function setControlStatus(id: string, status: string, reason: string) {
  return viaApi(() => {
    const c = need(id); guard(whyCannotSetStatus(c));
    if (!CONTROL_STATUSES.includes(status)) throw new SodError("Unknown status.");
    const r = reasonText(reason, 10, "A reason"); const from = c.status; c.status = status;
    wsLog("control.status.changed", `${c.id}: ${from} → ${status} by ${getActor().name}: ${r}`, "Control");
    return true;
  }, () => post<boolean>(`/controls/${encodeURIComponent(id)}/status`, { status, reason }));
}
/** Exception / waiver: needs an approver other than the requester (and the control owner), an expiry <= 12 months and a compensating-control note. */
export function requestException(id: string, input: { reason: string; expires: string; compensating: string }) {
  return viaApi(() => {
    const c = need(id); guard(whyCannotRequestException());
    const reason = reasonText(input.reason, 10, "A reason"), comp = reasonText(input.compensating, 20, "A compensating-control note");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expires) || Number.isNaN(parseIso(input.expires).getTime())) throw new SodError("Enter a valid expiry date.");
    if (input.expires <= today()) throw new SodError("The expiry must be in the future.");
    if (parseIso(input.expires).getTime() > Date.now() + 366 * 86400_000) throw new SodError("An exception can last at most 12 months.");
    const me = getActor();
    const a = requestApproval({ kind: "control.exception", title: `Exception for ${c.id} ${c.title}`, subject: c.id, payload: { controlId: c.id, expires: input.expires }, needs: 1, approverRoles: ["admin", "owner"], forbid: [c.owner], ttlHours: 24 * 14 });
    (c.exceptions ||= []).push({ id: a.id, requestedBy: me.name, at: today(), reason, compensating: comp, expires: input.expires, approvalId: a.id } as ControlException);
    wsLog("control.exception.requested", `${c.id} ${a.id} until ${input.expires} by ${me.name}`, "Control");
    return a.id;
  }, () => post<string>(`/controls/${encodeURIComponent(id)}/exceptions`, input));
}
export function decideException(id: string, exId: string, decision: "approve" | "reject", reason: string) {
  return viaApi(() => {
    const c = need(id); const x = exceptionsOf(c).find((e) => e.id === exId); if (!x) throw new SodError("Exception not found.");
    guard(whyCannotDecideException(c, x));
    if (decision === "approve") engineApprove(x.approvalId, reason); else { reasonText(reason, 10, "A reason"); engineReject(x.approvalId, reason); }
    wsLog("control.exception." + (decision === "approve" ? "approved" : "rejected"), `${c.id} ${x.id} by ${getActor().name} (requester ${x.requestedBy}), expires ${x.expires}`, "Control");
    return true;
  }, () => post<boolean>(`/controls/${encodeURIComponent(id)}/exceptions/${encodeURIComponent(exId)}`, { decision, reason }));
}
export function addMapping(id: string, fw: string, ref: string) {
  return viaApi(() => {
    const c = need(id); guard(whyCannotManage());
    c.map = c.map || {};
    c.map[fw] = (c.map[fw] || []).concat(ref);
    return c.map;
  }, () => post<Record<string, string[]>>(`/controls/${encodeURIComponent(id)}/mappings`, { fw, ref }));
}
export function createTicket(id: string) {
  return viaApi(() => (guard(roleReason("creating tickets", "admin", "owner", "analyst")), { key: "SEC-" + (1000 + Math.floor(Math.random() * 9000)) }),
    () => post<{ key: string }>(`/controls/${encodeURIComponent(id)}/ticket`, {}));
}
export function createTest(input: { name: string; source: string; control: string; logic: string }) {
  return viaApi(() => {
    guard(whyCannotManage());
    const id = "TST-" + String(++TESTSEQ).padStart(2, "0");
    DATA.tests.push({ id, name: input.name, source: input.source || "Custom", controls: [input.control], logic: input.logic || "Custom condition", result: "Needs data", cadence: "On demand", last: "Not yet run", items: [] });
    return { id };
  }, () => post<{ id: string }>("/tests", input));
}
export function runTest(id: string) {
  return viaApi(() => {
    guard(whyCannotRunTests()); const t = DATA.tests.find((x) => x.id === id)!; t.last = nowStamp();
    t.controls.forEach((cid: string) => { const c = DATA.controls.find((x) => x.id === cid); if (c) followTests(c); });
    return t;
  }, () => post<any>(`/tests/${encodeURIComponent(id)}/run`, {}));
}
export function deactivateTest(id: string) {
  return viaApi(() => { guard(whyCannotManage()); DATA.tests = DATA.tests.filter((x) => x.id !== id); return true; }, () => post<boolean>(`/tests/${encodeURIComponent(id)}/deactivate`, {}));
}
export function syncAllTests() {
  return viaApi(() => {
    guard(whyCannotRunTests()); DATA.tests.forEach((t) => (t.last = nowStamp()));
    DATA.controls.forEach(followTests);
    return DATA.tests.length;
  }, () => post<number>("/tests/sync", {}));
}

/* exports: return file text (mock builds it from DATA) */
export function exportSoa() {
  return viaApi(() => csv(["Doc", "Control", "Title", "Domain", "Owner", "Status", "Frameworks"],
    DATA.controls.map((c) => ["SoA", c.id, c.title, c.domain, c.owner, c.status, Object.keys(c.map || {}).map((k) => FW_SHORT[k] || k).join("|")])),
  () => post<string>("/controls/export/soa", {}));
}
export function exportMatrix() {
  return viaApi(() => csv(["Control", "Domain", ...MATRIX_FWS.map((f) => FW_SHORT[f])],
    DATA.controls.map((c) => [c.id, c.domain, ...MATRIX_FWS.map((f) => ((c.map || {})[f] || []).join("|"))])),
  () => post<string>("/controls/export/matrix", {}));
}
export function exportWorkpaper(id: string) {
  return viaApi(() => {
    const c = DATA.controls.find((x) => x.id === id)!;
    const tests = testsForControl(c.id);
    return `LOCKED WORKPAPER — ${c.id} ${c.title}\nDomain: ${c.domain}\nOwner: ${c.owner}\nStatus: ${c.status}\nMappings: ${Object.keys(c.map || {}).map((k) => FW_SHORT[k] + " " + c.map[k].join("/")).join("; ")}\nAttestation: ${c.attestation ? c.attestation.by + " on " + c.attestation.at : "none"}\nTests:\n${tests.map((t) => " - " + t.id + " " + t.name + " [" + t.result + "]").join("\n") || " none"}\n\nDraft workpaper for audit support. Requires reviewer sign-off.`;
  }, () => post<string>(`/controls/${encodeURIComponent(id)}/export/workpaper`, {}));
}
