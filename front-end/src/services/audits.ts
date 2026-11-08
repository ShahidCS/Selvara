/* Audits API stubs. In mock mode (default) each function performs the in-memory DATA mutation the prototype did and returns the result;
 * the caller then does wsLog / toast / bumpData. In http mode it would call the (not yet existing) API, which must re-check authorization. */
import { DATA } from "@/lib/data";
import { nowStamp } from "@/lib/format";
import { apiFetch, viaApi } from "./http";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const AUDIT_FWS = ["ISO 27001", "SOC 2", "GDPR", "PCI DSS", "NIST CSF", "-"];
export const PBC_ORDER = ["Requested", "Outstanding", "Received"];
/** Progress per stage index (source: [0,40,85,100][i+1]). */
export const STAGE_PROGRESS = [0, 40, 85, 100];

const post = <T,>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
const enc = encodeURIComponent;

export const findAudit = (id: string) => DATA.audits.find((a) => a.id === id);
export function auditInit(a: any) {
  if (a.auditorAccess === undefined) a.auditorAccess = "none";
  if (a.populationsFrozen === undefined) a.populationsFrozen = false;
  return a;
}
/** Unique demo id with the source's numbering (`prefix + (base + count)`); bumps past ids already in use. */
export function nextId(prefix: string, base: number, list: { id: string }[]): string {
  let n = base + list.length;
  while (list.some((x) => x.id === prefix + n)) n++;
  return prefix + n;
}

export function createAudit(input: { name: string; fw: string; auditor: string; scope: string }) {
  return viaApi(() => {
    const id = nextId("AUD-", 10, DATA.audits);
    DATA.audits.push({
      id, name: input.name, fw: input.fw, auditor: input.auditor || "Internal Audit", lead: "Internal, J. Avery", stage: "Planned",
      scope: input.scope || "To be defined", period: "Planning", progress: 0, opened: nowStamp().slice(0, 10), pbc: [], tests: [], findings: [],
    });
    return { id };
  }, () => post<{ id: string }>("/audits", input));
}
export function grantAuditorAccess(id: string) {
  return viaApi(() => { const a = auditInit(findAudit(id)); a.auditorAccess = "granted"; return true; }, () => post<boolean>(`/audits/${enc(id)}/auditor-access`, {}));
}
export function endAuditorAccess(id: string) {
  return viaApi(() => {
    const a = auditInit(findAudit(id)); a.auditorAccess = "ended";
    if (a.stage !== "Complete") { a.stage = "Complete"; a.progress = 100; }
    return true;
  }, () => post<boolean>(`/audits/${enc(id)}/auditor-access/end`, {}));
}
export function freezePopulations(id: string) {
  return viaApi(() => { const a = auditInit(findAudit(id)); a.populationsFrozen = true; return true; }, () => post<boolean>(`/audits/${enc(id)}/populations/freeze`, {}));
}
export function advanceStage(id: string) {
  return viaApi(() => {
    const a = findAudit(id)!; const i = DATA.auditStages.indexOf(a.stage);
    if (i < DATA.auditStages.length - 1) { a.stage = DATA.auditStages[i + 1]; a.progress = Math.min(100, STAGE_PROGRESS[i + 1]); return { stage: a.stage as string }; }
    return null;
  }, () => post<{ stage: string } | null>(`/audits/${enc(id)}/advance`, {}));
}
export function cyclePbc(id: string, pid: string) {
  return viaApi(() => {
    const a = findAudit(id)!; const p = a.pbc.find((x: any) => x.id === pid);
    if (!p) return null;
    p.status = PBC_ORDER[(PBC_ORDER.indexOf(p.status) + 1) % PBC_ORDER.length];
    return { id: p.id as string, status: p.status as string };
  }, () => post<{ id: string; status: string } | null>(`/audits/${enc(id)}/pbc/${enc(pid)}/advance`, {}));
}
export function addPbc(id: string, input: { item: string; owner: string }) {
  return viaApi(() => {
    const a = findAudit(id)!; const pid = "PBC-" + (50 + a.pbc.length);
    a.pbc.push({ id: pid, item: input.item, owner: input.owner || "Unassigned", status: "Requested" });
    return { id: pid };
  }, () => post<{ id: string }>(`/audits/${enc(id)}/pbc`, input));
}
export function promoteFinding(id: string, fid: string) {
  return viaApi(() => {
    const a = findAudit(id)!; const f = a.findings.find((x: any) => x.id === fid);
    if (!f || f.issue || f.status === "Closed") return null;
    const iid = nextId("R-", 60, DATA.issues);
    DATA.issues.unshift({ id: iid, title: f.title, sev: f.sev, status: "Open", owner: String(a.lead).replace(/^[^,]+,\s*/, ""), due: "Due 14d" });
    f.issue = iid;
    return { iid, title: f.title as string };
  }, () => post<{ iid: string; title: string } | null>(`/audits/${enc(id)}/findings/${enc(fid)}/issue`, {}));
}
/** Plain-text draft report (downloaded as text/plain; never rendered as HTML). */
export function exportReport(id: string) {
  return viaApi(() => {
    const a = findAudit(id)!;
    return `AUDIT REPORT (DRAFT) — ${a.name}\nFramework: ${a.fw}\nAuditor: ${a.auditor}\nStage: ${a.stage}\nScope: ${a.scope}\n\nRequests: ${a.pbc.map((p: any) => p.id + " " + p.item + " [" + p.status + "]").join("; ")}\nTests: ${a.tests.map((t: any) => t.id + " " + t.ctrl + " " + t.result).join("; ")}\nFindings:\n${a.findings.map((f: any) => " - [" + f.sev + "] " + f.title + " (" + f.status + ")" + (f.issue ? " -> " + f.issue : "")).join("\n")}\n\nDraft only. Requires human review before use.`;
  }, () => post<string>(`/audits/${enc(id)}/export/report`, {}));
}
