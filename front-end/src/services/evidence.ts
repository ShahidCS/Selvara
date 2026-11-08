/* Evidence API stubs. Mock mode performs the in-memory DATA mutation the prototype did (source lines 2218-2251) and returns
 * the result; the caller then does wsLog / toast / bumpData. In http mode each call goes to the (not yet existing) API,
 * which must re-validate every field, enforce authorization and scan/store uploaded files itself. */
import { DATA } from "@/lib/data";
import { nowStamp } from "@/lib/format";
import { apiFetch, viaApi } from "./http";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const EVIDENCE_TYPES = ["Screenshot", "PDF", "Report", "Record", "CSV"];
const EXT: Record<string, string> = { Screenshot: "png", PDF: "pdf", Report: "pdf", Record: "pdf", CSV: "csv" };

const send = <T,>(method: string, path: string, body?: unknown) =>
  apiFetch<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
const enc = encodeURIComponent;

/** source evInit: fill defaults on a record (idempotent). The random size is a demo value only. */
export function evInit(e: any) {
  if (!e.ver) e.ver = 1;
  if (!e.attachments) e.attachments = [{ name: String(e.name).replace(/[^a-z0-9]+/gi, "-").toLowerCase() + "." + (EXT[e.type] || "pdf"), size: (80 + Math.floor(Math.random() * 900)) + " KB" }];
  if (!e.history) e.history = [{ ver: 1, at: e.updated, by: e.by, note: "Initial version collected" }];
  return e;
}
export const findEvidence = (id: string) => DATA.evidence.find((e) => e.id === id);
const today = () => nowStamp().slice(0, 10);

export function createEvidence(input: { name: string; type: string; by: string; note: string; actor: string }) {
  return viaApi(() => {
    // source: id = "EV-"+(209+length); bump until unique so a delete followed by an add cannot duplicate an id
    let n = 209 + DATA.evidence.length;
    while (DATA.evidence.some((e) => e.id === "EV-" + n)) n++;
    const id = "EV-" + n;
    const e = evInit({ id, name: input.name, type: input.type, updated: today(), by: input.by || "Unassigned", note: input.note, attachments: [], history: [{ ver: 1, at: today(), by: input.actor, note: "Evidence created" }], ver: 1 });
    DATA.evidence.unshift(e);
    return { id };
  }, () => send<{ id: string }>("POST", "/evidence", input));
}
export function updateEvidence(id: string, input: { name: string; type: string; by: string; note: string }) {
  return viaApi(() => {
    const e = findEvidence(id)!;
    e.name = input.name; e.type = input.type; e.by = input.by; e.note = input.note; // source: "by" is not defaulted on edit
    return e;
  }, () => send<any>("PATCH", `/evidence/${enc(id)}`, input));
}
export function deleteEvidence(id: string) {
  return viaApi(() => { DATA.evidence = DATA.evidence.filter((x) => x.id !== id); return true; }, () => send<boolean>("DELETE", `/evidence/${enc(id)}`));
}
export function addAttachment(id: string, name: string) {
  return viaApi(() => {
    const e = findEvidence(id)!;
    e.attachments.push({ name, size: (60 + Math.floor(Math.random() * 700)) + " KB" });
    return e;
  }, () => send<any>("POST", `/evidence/${enc(id)}/attachments`, { name }));
}
export function removeAttachment(id: string, index: number) {
  return viaApi(() => {
    const e = findEvidence(id)!;
    const f = e.attachments[index];
    e.attachments.splice(index, 1);
    return f as { name: string; size: string } | undefined;
  }, () => send<any>("DELETE", `/evidence/${enc(id)}/attachments/${index}`));
}
export function createVersion(id: string, note: string, actor: string) {
  return viaApi(() => {
    const e = findEvidence(id)!;
    e.ver++; e.updated = today();
    e.history.push({ ver: e.ver, at: e.updated, by: actor, note });
    return e;
  }, () => send<any>("POST", `/evidence/${enc(id)}/versions`, { note }));
}
