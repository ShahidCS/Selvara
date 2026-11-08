/* Policies API stubs (source lines 2253-2284). Mock mode mutates DATA as the prototype did; the caller does wsLog/toast/bumpData.
 * A real API must enforce who may submit, approve/publish, edit and map, and must own version numbering and the approval trail. */
import { DATA } from "@/lib/data";
import { nowStamp } from "@/lib/format";
import { apiFetch, viaApi } from "./http";

/* eslint-disable @typescript-eslint/no-explicit-any */
const send = <T,>(method: string, path: string, body?: unknown) =>
  apiFetch<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
const enc = encodeURIComponent;
const today = () => nowStamp().slice(0, 10);

/** source polInit: fill defaults (idempotent). The random acceptance count is a demo value only. */
export function polInit(p: any) {
  if (!p.history) p.history = [{ ver: p.ver, at: p.review, by: p.owner, note: "Current version" }];
  if (!p.reviewers) p.reviewers = [{ name: p.owner, role: "Owner", step: 1 }];
  if (!p.mappedControls) p.mappedControls = [];
  if (!p.acceptance) p.acceptance = { required: p.status === "Active" ? 42 : 0, done: p.status === "Active" ? Math.round(42 * (0.7 + Math.random() * 0.25)) : 0 };
  return p;
}
export const findPolicy = (id: string) => DATA.policies.find((p) => p.id === id);

export function createPolicy(input: { name: string; owner: string; review: string; actor: string }) {
  return viaApi(() => {
    // source: id = "P-"+pad3(20+length); bump until unique
    let n = 20 + DATA.policies.length;
    while (DATA.policies.some((p) => p.id === "P-" + String(n).padStart(3, "0"))) n++;
    const id = "P-" + String(n).padStart(3, "0");
    const p = polInit({ id, name: input.name, status: "Draft", owner: input.owner || "Unassigned", ver: "0.1 draft", review: input.review || "Not started", history: [{ ver: "0.1 draft", at: today(), by: input.actor, note: "Policy created" }] });
    DATA.policies.push(p);
    return { id };
  }, () => send<{ id: string }>("POST", "/policies", input));
}
export function updatePolicy(id: string, input: { name: string; owner: string; review: string }) {
  return viaApi(() => {
    const p = findPolicy(id)!;
    p.name = input.name; p.owner = input.owner; p.review = input.review; // source: owner/review not defaulted on edit
    return p;
  }, () => send<any>("PATCH", `/policies/${enc(id)}`, input));
}
export function addReviewer(id: string, name: string, role: string) {
  return viaApi(() => {
    const p = findPolicy(id)!;
    p.reviewers.push({ name, role: role || "Reviewer", step: p.reviewers.length + 1 });
    return p;
  }, () => send<any>("POST", `/policies/${enc(id)}/reviewers`, { name, role }));
}
export function mapControl(id: string, control: string) {
  return viaApi(() => {
    const p = findPolicy(id)!;
    if (!p.mappedControls.includes(control)) p.mappedControls.push(control);
    return p;
  }, () => send<any>("POST", `/policies/${enc(id)}/controls`, { control }));
}
export function remindOutstanding(id: string) {
  return viaApi(() => { const p = findPolicy(id)!; return p.acceptance.required - p.acceptance.done; },
    () => send<number>("POST", `/policies/${enc(id)}/remind`, {}));
}
export function transitionPolicy(id: string, to: string, actor: string) {
  return viaApi(() => {
    const p = findPolicy(id)!; const from = p.status as string;
    p.status = to;
    if (to === "Active") {
      const base = parseFloat(p.ver) || 0;
      p.ver = (Math.floor(base) + 1).toFixed(1);
      p.history.push({ ver: p.ver, at: today(), by: actor, note: "Approved and published" });
    } else p.history.push({ ver: p.ver, at: today(), by: actor, note: from + " → " + to });
    return { from, p };
  }, () => send<any>("POST", `/policies/${enc(id)}/transition`, { to }));
}
export function startRevision(id: string, actor: string) {
  return viaApi(() => {
    const p = findPolicy(id)!;
    p.status = "Draft";
    p.ver = (parseFloat(p.ver) + 0.1).toFixed(1) + " draft";
    p.history.push({ ver: p.ver, at: today(), by: actor, note: "New revision started" });
    return p;
  }, () => send<any>("POST", `/policies/${enc(id)}/revisions`, {}));
}
