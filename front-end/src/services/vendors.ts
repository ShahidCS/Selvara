/* Third-party (vendor) API stubs. Mock mode mutates DATA / VENDOR_REQS as the prototype did and returns what the caller needs
 * for wsLog / toast; the caller then does wsLog / toast / bumpData.
 * AUTHORITY: approving a vendor request, the procurement gate (Approve / Block), reassessment scores and tier changes are risk decisions.
 * The prototype only gates request approval (vendorCanManage); every drawer action is open to anyone who can open the module.
 * The real API MUST authorize each of these server-side (and record who decided) rather than rely on the UI. */
import { DATA } from "@/lib/data";
import { getMe } from "@/lib/audit";
import { nowStamp } from "@/lib/format";
import { clampText } from "@/lib/security";
import { VENDOR_REQS } from "@/lib/requests";
import { FINDING_SEVS, REASSESS_OUTCOMES, TIER_WINDOW, VENDOR_TIERS, vFind, vInit, vendorCanManage } from "@/lib/vendors";
import { apiFetch, viaApi } from "./http";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Res<T = object> = ({ ok: true } & T) | { ok: false; msg: string };
const post = <T,>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
const enc = encodeURIComponent;
const fail = (msg: string): { ok: false; msg: string } => ({ ok: false, msg });
const NOT_FOUND = fail("Vendor not found");
const pickOf = (v: string, list: string[], fb: string) => (list.includes(v) ? v : fb);

/** Prototype: vReqApprove. Moves a request into the inventory (status "Needs evidence"). Gate: vendorCanManage. */
export function approveRequest(id: string) {
  return viaApi<Res<{ name: string }>>(() => {
    if (!vendorCanManage()) return fail("Only Security can approve vendor requests");
    const ix = VENDOR_REQS.findIndex((x) => x.id === id); if (ix < 0) return fail("Request not found");
    const r = VENDOR_REQS[ix]; VENDOR_REQS.splice(ix, 1);
    const crit = pickOf(String(r.crit), VENDOR_TIERS, "Medium"); // source copied r.crit as-is
    const v = vInit({ name: r.name, cat: r.cat, tier: crit, score: 70, status: "Needs evidence", due: TIER_WINDOW[crit] || "Due 30d" });
    v.ai = !!r.data; DATA.vendors.push(v);
    return { ok: true, name: r.name as string };
  }, () => post<Res<{ name: string }>>(`/vendors/requests/${enc(id)}/approve`, {}));
}
/** Prototype: vReqDismiss (no gate in the source; the card is only shown to vendorCanManage, so the check is added here as defence in depth). */
export function dismissRequest(id: string) {
  return viaApi<Res<{ name: string }>>(() => {
    if (!vendorCanManage()) return fail("Only Security can dismiss vendor requests");
    const ix = VENDOR_REQS.findIndex((x) => x.id === id); if (ix < 0) return fail("Request not found");
    const r = VENDOR_REQS[ix]; VENDOR_REQS.splice(ix, 1); return { ok: true, name: r.name as string };
  }, () => post<Res<{ name: string }>>(`/vendors/requests/${enc(id)}/dismiss`, {}));
}

/** Prototype: vendorSave. Note the source's `parseInt(..)||75` turns an entered 0 into 75 (kept; see checklist). */
export function createVendor(input: { name: string; cat: string; tier: string; score: string }) {
  return viaApi<Res<{ name: string; tier: string }>>(() => {
    const name = clampText(input.name, 120); if (!name) return fail("Vendor name is required.");
    const tier = pickOf(input.tier, VENDOR_TIERS, "Medium");
    const sc = Math.max(0, Math.min(100, parseInt(input.score, 10) || 75));
    DATA.vendors.push(vInit({ name, cat: clampText(input.cat, 80) || "General", tier, score: sc, status: "Needs evidence", due: TIER_WINDOW[tier] }));
    return { ok: true, name, tier };
  }, () => post<Res<{ name: string; tier: string }>>("/vendors", input));
}
/** Prototype: vendorGate. Approved clears "Needs evidence" to Active; Blocked sets status In review. */
export function setGate(id: string, decision: string) {
  return viaApi<Res<{ name: string }>>(() => {
    const v = vFind(id); if (!v) return NOT_FOUND;
    if (decision !== "Approved" && decision !== "Blocked") return fail("Invalid decision");
    v.gate = decision;
    if (decision === "Approved" && v.status === "Needs evidence") v.status = "Active";
    if (decision === "Blocked") v.status = "In review";
    return { ok: true, name: v.name as string };
  }, () => post<Res<{ name: string }>>(`/vendors/${enc(id)}/gate`, { decision }));
}
/** Prototype: vendorDoCert. */
export function addCert(id: string, input: { type: string; expires: string }) {
  return viaApi<Res<{ type: string; name: string }>>(() => {
    const v = vFind(id); if (!v) return NOT_FOUND;
    const t = clampText(input.type, 120); if (!t) return fail("Type is required.");
    v.certs.push({ type: t, expires: clampText(input.expires, 40) || "TBD", status: "Valid" });
    return { ok: true, type: t, name: v.name as string };
  }, () => post<Res<{ type: string; name: string }>>(`/vendors/${enc(id)}/certificates`, input));
}
/** Prototype: vendorDoFinding. The id is a demo value (random 3 digits, re-rolled on a clash). */
export function addFinding(id: string, input: { title: string; sev: string }) {
  return viaApi<Res<{ title: string; name: string }>>(() => {
    const v = vFind(id); if (!v) return NOT_FOUND;
    const t = clampText(input.title, 300); if (!t) return fail("Finding description is required.");
    let fid = ""; do { fid = "VF-" + Math.floor(100 + Math.random() * 900); } while (v.findings.some((f: any) => f.id === fid));
    v.findings.push({ id: fid, title: t, sev: pickOf(input.sev, FINDING_SEVS, "Medium"), status: "Open" });
    return { ok: true, title: t, name: v.name as string };
  }, () => post<Res<{ title: string; name: string }>>(`/vendors/${enc(id)}/findings`, input));
}
/** Prototype: vendorCloseFinding (source addressed the finding by index; a second close of a closed finding is a no-op here). */
export function closeFinding(id: string, fi: number) {
  return viaApi<Res<{ title: string }>>(() => {
    const v = vFind(id); if (!v) return NOT_FOUND;
    const f = Number.isInteger(fi) ? v.findings[fi] : null; if (!f) return fail("Finding not found");
    f.status = "Closed"; return { ok: true, title: f.title as string };
  }, () => post<Res<{ title: string }>>(`/vendors/${enc(id)}/findings/${fi}/close`, {}));
}
/** Prototype: vendorSendQ. The source only flips the status; nothing is sent. */
export function sendQuestionnaire(id: string) {
  return viaApi<Res<{ name: string }>>(() => {
    const v = vFind(id); if (!v) return NOT_FOUND;
    v.status = "In review"; return { ok: true, name: v.name as string };
  }, () => post<Res<{ name: string }>>(`/vendors/${enc(id)}/questionnaire`, {}));
}
/** Prototype: vendorDoReassess. Score 0-100 integer (parseInt, so "7.9" -> 7 as in the source). */
export function reassess(id: string, input: { score: string; outcome: string; by: string }) {
  return viaApi<Res<{ name: string; score: number; outcome: string }>>(() => {
    const v = vFind(id); if (!v) return NOT_FOUND;
    const sc = parseInt(input.score, 10); if (Number.isNaN(sc) || sc < 0 || sc > 100) return fail("Enter a score between 0 and 100.");
    const out = pickOf(input.outcome, REASSESS_OUTCOMES, REASSESS_OUTCOMES[0]);
    v.score = sc; v.status = out.startsWith("Escalate") ? "In review" : "Active"; v.due = TIER_WINDOW[v.tier] || v.due;
    v.reassessments.push({ at: nowStamp().slice(0, 10), by: clampText(input.by, 80) || getMe().name, score: sc, outcome: out });
    return { ok: true, name: v.name as string, score: sc, outcome: out };
  }, () => post<Res<{ name: string; score: number; outcome: string }>>(`/vendors/${enc(id)}/reassessments`, input));
}
/** Prototype: vendorDoTier. Returns `changed:false` when the tier is unchanged (no log, no toast in the source). */
export function changeTier(id: string, tier: string) {
  return viaApi<Res<{ changed: boolean; name: string; from: string; to: string }>>(() => {
    const v = vFind(id); if (!v) return NOT_FOUND;
    const nt = pickOf(tier, VENDOR_TIERS, ""); if (!nt) return fail("Choose a tier from the list");
    if (nt === v.tier) return { ok: true, changed: false, name: v.name as string, from: v.tier as string, to: nt };
    const from = v.tier as string; v.tier = nt; v.due = TIER_WINDOW[nt];
    return { ok: true, changed: true, name: v.name as string, from, to: nt };
  }, () => post<Res<{ changed: boolean; name: string; from: string; to: string }>>(`/vendors/${enc(id)}/tier`, { tier }));
}
