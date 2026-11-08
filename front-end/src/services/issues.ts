/* Issues API stubs (see services/audits.ts for the pattern). The real API must authorize every mutation server-side. */
import { DATA } from "@/lib/data";
import { apiFetch, viaApi } from "./http";
import { nextId } from "./audits";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const ISSUE_STATUSES = ["Open", "In progress", "Closed"];
export const ISSUE_SEVS = ["High", "Medium", "Low"];

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

export function createIssue(input: { title: string; sev: string; owner: string; due: string }) {
  return viaApi(() => {
    const id = nextId("R-", 60, DATA.issues);
    DATA.issues.unshift({ id, title: input.title, sev: input.sev, status: "Open", owner: input.owner || "Unassigned", due: input.due || "Due 14d" });
    return { id };
  }, () => post<{ id: string }>("/issues", input));
}
export function updateIssue(id: string, input: { title: string; sev: string; owner: string; due: string }) {
  return viaApi(() => {
    const i = issFind(id); if (!i) return false;
    i.title = input.title; i.sev = input.sev; i.owner = input.owner; i.due = input.due; // source keeps owner/due as typed (may be empty)
    return true;
  }, () => post<boolean>(`/issues/${enc(id)}`, input));
}
export function deleteIssue(id: string) {
  return viaApi(() => { DATA.issues = DATA.issues.filter((x) => x.id !== id); return true; }, () => post<boolean>(`/issues/${enc(id)}/delete`, {}));
}
export function setIssueStatus(id: string, status: string) {
  return viaApi(() => {
    const i = issFind(id); if (!i) return null;
    const from = i.status as string; i.status = status; return { from };
  }, () => post<{ from: string } | null>(`/issues/${enc(id)}/status`, { status }));
}
export function saveRca(id: string, rootCause: string, corrective: string) {
  return viaApi(() => { const i = issFind(id); if (!i) return false; i.rootCause = rootCause; i.corrective = corrective; return true; },
    () => post<boolean>(`/issues/${enc(id)}/rca`, { rootCause, corrective }));
}
export function addTask(id: string, text: string) {
  return viaApi(() => { const i = issInit(issFind(id)); i.tasks.push({ text, done: false }); return true; }, () => post<boolean>(`/issues/${enc(id)}/tasks`, { text }));
}
export function toggleTask(id: string, ti: number) {
  return viaApi(() => { const i = issInit(issFind(id)); if (!i.tasks[ti]) return false; i.tasks[ti].done = !i.tasks[ti].done; return true; },
    () => post<boolean>(`/issues/${enc(id)}/tasks/${ti}/toggle`, {}));
}
export function linkIssue(id: string, kind: "control" | "risk", value: string) {
  return viaApi(() => {
    const i = issInit(issFind(id)); const arr: string[] = kind === "control" ? i.linkedControls : i.linkedRisks;
    if (!arr.includes(value)) arr.push(value);
    return true;
  }, () => post<boolean>(`/issues/${enc(id)}/links`, { kind, value }));
}
