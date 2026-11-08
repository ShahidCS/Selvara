/* Controls API stubs. In mock mode (default) each function performs the in-memory DATA mutation the prototype did and
 * returns the result; the caller then does wsLog / toast / bumpData. In http mode it would call the (not yet existing) API. */
import { DATA, FW_SHORT, testsForControl } from "@/lib/data";
import { nowStamp, csvCell } from "@/lib/format";
import { apiFetch, viaApi } from "./http";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const MATRIX_FWS = ["iso27001", "soc2", "nistcsf", "gdpr", "pci"];
export const CONTROL_DOMAINS = ["Governance", "Identity & Access", "Operations", "Cryptography", "Network", "Logging", "Business Continuity", "Third Party", "Privacy", "AI"];
let TESTSEQ = 6; // source: let TESTSEQ=6

const post = <T,>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
const csv = (head: string[], rows: unknown[][]) =>
  [head.join(",")].concat(rows.map((r) => r.map(csvCell).join(","))).join("\n");

export function createControl(input: { title: string; domain: string; owner: string }) {
  return viaApi(() => {
    const pre = (input.domain.match(/[A-Z]/g) || ["C"]).slice(0, 3).join("");
    const id = pre + "-" + (DATA.controls.filter((c) => c.id.startsWith(pre)).length + 1);
    DATA.controls.push({ id, title: input.title, domain: input.domain, owner: input.owner || "Unassigned", status: "Needs evidence", map: {}, custom: true });
    return { id };
  }, () => post<{ id: string }>("/controls", input));
}
export function attestControl(id: string, by: string, note: string) {
  return viaApi(() => {
    const c = DATA.controls.find((x) => x.id === id)!;
    c.attestation = { by: by || c.owner, at: nowStamp().slice(0, 10), note };
    return c.attestation as { by: string; at: string; note: string };
  }, () => post<{ by: string; at: string; note: string }>(`/controls/${encodeURIComponent(id)}/attestation`, { by, note }));
}
export function addMapping(id: string, fw: string, ref: string) {
  return viaApi(() => {
    const c = DATA.controls.find((x) => x.id === id)!;
    c.map = c.map || {};
    c.map[fw] = (c.map[fw] || []).concat(ref);
    return c.map;
  }, () => post<Record<string, string[]>>(`/controls/${encodeURIComponent(id)}/mappings`, { fw, ref }));
}
export function createTicket(id: string) {
  return viaApi(() => ({ key: "SEC-" + (1000 + Math.floor(Math.random() * 9000)) }),
    () => post<{ key: string }>(`/controls/${encodeURIComponent(id)}/ticket`, {}));
}
export function createTest(input: { name: string; source: string; control: string; logic: string }) {
  return viaApi(() => {
    const id = "TST-" + String(++TESTSEQ).padStart(2, "0");
    DATA.tests.push({ id, name: input.name, source: input.source || "Custom", controls: [input.control], logic: input.logic || "Custom condition", result: "Needs data", cadence: "On demand", last: "Not yet run", items: [] });
    return { id };
  }, () => post<{ id: string }>("/tests", input));
}
export function runTest(id: string) {
  return viaApi(() => { const t = DATA.tests.find((x) => x.id === id)!; t.last = nowStamp(); return t; }, () => post<any>(`/tests/${encodeURIComponent(id)}/run`, {}));
}
export function deactivateTest(id: string) {
  return viaApi(() => { DATA.tests = DATA.tests.filter((x) => x.id !== id); return true; }, () => post<boolean>(`/tests/${encodeURIComponent(id)}/deactivate`, {}));
}
export function syncAllTests() {
  return viaApi(() => { DATA.tests.forEach((t) => (t.last = nowStamp())); return DATA.tests.length; }, () => post<number>("/tests/sync", {}));
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
