/* Third-party (vendor) API stubs. Mock mode mutates DATA / VENDOR_REQS and returns what the caller needs for wsLog / toast.
 * CONTRACT (docs/SOD_MATRIX.md section 3, Vendor): every decision is admin/owner only (assertRole, deny by default); approving a request or the
 * onboarding gate needs an approver other than the requester / whoever added the vendor; Critical tier needs TWO approvers (approvals engine);
 * a tier change and a certificate waiver are approvals by someone other than the initiator (waivers carry reason + expiry + named approver).
 * Rule violations throw SodError (the UI shows its message). The real API MUST enforce all of this server-side from the session identity. */
import { DATA } from "@/lib/data";
import { getMe, wsLog } from "@/lib/audit";
import { getApproval, requestApproval, type Approval } from "@/lib/approvals";
import { payloadStr, registerApprovalHandler } from "@/lib/approvalKit";
import { assertNotSelf, assertRole, getActor, SOD, SodError } from "@/lib/sod";
import { nowStamp } from "@/lib/format";
import { clampText, isIsoDate } from "@/lib/security";
import { VENDOR_REQS } from "@/lib/requests";
import { FINDING_SEVS, REASSESS_OUTCOMES, TIER_WINDOW, VENDOR_TIERS, parseScore, personOnly, vFind, vInit } from "@/lib/vendors";
import { apiFetch, viaApi } from "./http";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Res<T = object> = ({ ok: true } & T) | { ok: false; msg: string };
const post = <T,>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
const enc = encodeURIComponent;
const fail = (msg: string): { ok: false; msg: string } => ({ ok: false, msg });
const NOT_FOUND = fail("Vendor not found");
const pickOf = (v: string, list: string[], fb: string) => (list.includes(v) ? v : fb);
const gate = () => assertRole("vendor decisions", "admin", "owner");
const stillPending = (id?: string) => !!id && getApproval(id)?.status === "Pending";
const approversOf = (a: Approval) => a.approvals.map((x) => x.by).join(", ");
/** Who may never approve a decision about this vendor: the person who requested it or added it. */
const ownersOf = (v: any) => [v.requestedBy, v.addedBy].filter(Boolean);
const APPROVERS = ["admin", "owner"];

/** Moves an approved request into the inventory (status "Needs evidence", gate Pending: the onboarding gate is a separate step). */
function onboard(r: any, approvedBy: string) {
  const ix = VENDOR_REQS.findIndex((x) => x.id === r.id); if (ix >= 0) VENDOR_REQS.splice(ix, 1);
  const crit = pickOf(String(r.crit), VENDOR_TIERS, "Medium"); // source copied r.crit as-is
  const v = vInit({ name: r.name, cat: r.cat, tier: crit, score: 70, status: "Needs evidence", due: TIER_WINDOW[crit] || "Due 30d" });
  v.ai = !!r.data; v.requestedBy = personOnly(r.requester); v.approvedBy = approvedBy; DATA.vendors.push(v);
  return v;
}

registerApprovalHandler("vendor.request.critical", {
  apply: (a) => {
    const r = VENDOR_REQS.find((x) => x.id === payloadStr(a, "reqId")); if (!r) throw new SodError("The vendor request no longer exists.");
    const v = onboard(r, approversOf(a));
    wsLog("vendor.request.approved", `${v.name} → added to inventory (Critical, approved by ${approversOf(a)}; requested by ${personOnly(r.requester)})`, "Vendor");
  },
  closed: (a) => { const r = VENDOR_REQS.find((x) => x.id === payloadStr(a, "reqId")); if (r) delete r.pendingApproval; },
});
registerApprovalHandler("vendor.gate", {
  apply: (a) => {
    const v = vFind(payloadStr(a, "vendorId")); if (!v) throw new SodError("Vendor not found.");
    v.gate = "Approved"; if (v.status === "Needs evidence") v.status = "Active"; delete v.gatePending;
    wsLog("vendor.gate.approved", `${v.name} (Critical, approved by ${approversOf(a)})`, "Vendor");
  },
  closed: (a) => { const v = vFind(payloadStr(a, "vendorId")); if (v) delete v.gatePending; },
});
registerApprovalHandler("vendor.tier", {
  apply: (a) => {
    const v = vFind(payloadStr(a, "vendorId")); if (!v) throw new SodError("Vendor not found.");
    const to = pickOf(payloadStr(a, "to"), VENDOR_TIERS, ""); if (!to) throw new SodError("Invalid tier.");
    const from = v.tier as string; v.tier = to; v.due = TIER_WINDOW[to]; delete v.tierPending;
    wsLog("vendor.tier.changed", `${v.name}: ${from} → ${to} (approved by ${approversOf(a)}; requested by ${a.requestedBy})`, "Vendor");
  },
  closed: (a) => { const v = vFind(payloadStr(a, "vendorId")); if (v) delete v.tierPending; },
});
registerApprovalHandler("vendor.waiver", {
  apply: (a) => {
    const v = vFind(payloadStr(a, "vendorId")); if (!v) throw new SodError("Vendor not found.");
    v.certs.push({ type: payloadStr(a, "type"), expires: payloadStr(a, "expires"), status: "Waived", waiver: { approvalId: a.id, approvedBy: approversOf(a), requestedBy: a.requestedBy, reason: payloadStr(a, "reason") } });
    delete v.waiverPending;
    wsLog("vendor.waiver.approved", `${payloadStr(a, "type")} for ${v.name} until ${payloadStr(a, "expires")} (approved by ${approversOf(a)}; ref ${a.id})`, "Vendor");
  },
  closed: (a) => { const v = vFind(payloadStr(a, "vendorId")); if (v) delete v.waiverPending; },
});

/** Prototype: vReqApprove. Approver must not be the requester. Critical tier is not added here: it opens a 2-approver request. */
export function approveRequest(id: string) {
  return viaApi<Res<{ name: string; pending: boolean }>>(() => {
    gate();
    const r = VENDOR_REQS.find((x) => x.id === id); if (!r) return fail("Request not found");
    if (stillPending(r.pendingApproval)) return fail("This request is already awaiting approval");
    const requester = personOnly(r.requester);
    assertNotSelf("you cannot approve a vendor request you raised", requester);
    const crit = pickOf(String(r.crit), VENDOR_TIERS, "Medium");
    if (crit === "Critical") {
      const ap = requestApproval({ kind: "vendor.request.critical", title: `Onboard Critical-tier vendor ${clampText(r.name, 80)} (${r.id})`, subject: r.id, payload: { reqId: r.id }, needs: 2, approverRoles: APPROVERS, forbid: [requester], ttlHours: SOD.INVITE_TTL_H });
      r.pendingApproval = ap.id; return { ok: true, name: r.name as string, pending: true };
    }
    const v = onboard(r, getActor().name);
    return { ok: true, name: v.name as string, pending: false };
  }, () => post<Res<{ name: string; pending: boolean }>>(`/vendors/requests/${enc(id)}/approve`, {}));
}
/** Prototype: vReqDismiss. Admin/owner only (the source card was only hidden for other roles). */
export function dismissRequest(id: string) {
  return viaApi<Res<{ name: string }>>(() => {
    gate();
    const ix = VENDOR_REQS.findIndex((x) => x.id === id); if (ix < 0) return fail("Request not found");
    if (stillPending(VENDOR_REQS[ix].pendingApproval)) return fail("This request is awaiting approval; withdraw the approval first");
    const r = VENDOR_REQS[ix]; VENDOR_REQS.splice(ix, 1); return { ok: true, name: r.name as string };
  }, () => post<Res<{ name: string }>>(`/vendors/requests/${enc(id)}/dismiss`, {}));
}

/** Prototype: vendorSave. Fix: the source's `parseInt(..)||75` turned an entered 0 into 75. A blank score defaults to 75; anything else must be 0-100. */
export function createVendor(input: { name: string; cat: string; tier: string; score: string }) {
  return viaApi<Res<{ name: string; tier: string }>>(() => {
    gate();
    const name = clampText(input.name, 120); if (!name) return fail("Vendor name is required.");
    const sc = String(input.score ?? "").trim() === "" ? 75 : parseScore(input.score);
    if (sc === null) return fail("Enter a score between 0 and 100.");
    const tier = pickOf(input.tier, VENDOR_TIERS, "Medium");
    const v = vInit({ name, cat: clampText(input.cat, 80) || "General", tier, score: sc, status: "Needs evidence", due: TIER_WINDOW[tier] });
    v.addedBy = getActor().name; DATA.vendors.push(v);
    return { ok: true, name, tier };
  }, () => post<Res<{ name: string; tier: string }>>("/vendors", input));
}
/** Prototype: vendorGate. Block is immediate (safe direction). Approve: not the person who requested/added the vendor; Critical needs two approvers. */
export function setGate(id: string, decision: string) {
  return viaApi<Res<{ name: string; pending: boolean }>>(() => {
    gate();
    const v = vFind(id); if (!v) return NOT_FOUND;
    if (decision !== "Approved" && decision !== "Blocked") return fail("Invalid decision");
    if (decision === "Blocked") { v.status = "In review"; v.gate = "Blocked"; return { ok: true, name: v.name as string, pending: false }; }
    assertNotSelf("you requested or added this vendor, so you cannot approve its onboarding gate", ...ownersOf(v));
    if (stillPending(v.gatePending)) return fail("The onboarding gate is already awaiting approval");
    if (v.tier === "Critical") {
      const ap = requestApproval({ kind: "vendor.gate", title: `Approve onboarding gate for Critical-tier vendor ${clampText(v.name, 80)}`, subject: v.id, payload: { vendorId: v.id }, needs: 2, approverRoles: APPROVERS, forbid: ownersOf(v), ttlHours: SOD.INVITE_TTL_H });
      v.gatePending = ap.id; return { ok: true, name: v.name as string, pending: true };
    }
    v.gate = "Approved"; if (v.status === "Needs evidence") v.status = "Active";
    return { ok: true, name: v.name as string, pending: false };
  }, () => post<Res<{ name: string; pending: boolean }>>(`/vendors/${enc(id)}/gate`, { decision }));
}
/** Prototype: vendorDoCert. */
export function addCert(id: string, input: { type: string; expires: string }) {
  return viaApi<Res<{ type: string; name: string }>>(() => {
    gate();
    const v = vFind(id); if (!v) return NOT_FOUND;
    const t = clampText(input.type, 120); if (!t) return fail("Type is required.");
    v.certs.push({ type: t, expires: clampText(input.expires, 40) || "TBD", status: "Valid" });
    return { ok: true, type: t, name: v.name as string };
  }, () => post<Res<{ type: string; name: string }>>(`/vendors/${enc(id)}/certificates`, input));
}
/** NEW (SOD_MATRIX principle 6): a certificate waiver is an exception: reason, expiry (future, <= 12 months) and an approver other than the initiator. */
export function requestWaiver(id: string, input: { type: string; reason: string; expires: string }) {
  return viaApi<Res<{ type: string; name: string }>>(() => {
    gate();
    const v = vFind(id); if (!v) return NOT_FOUND;
    const t = clampText(input.type, 120); if (!t) return fail("Type is required.");
    const reason = clampText(input.reason, 300); if (reason.length < 10) return fail("Give a reason of at least 10 characters.");
    const exp = String(input.expires || "").trim(); const when = isIsoDate(exp) ? Date.parse(exp) : NaN;
    const max = new Date(); max.setMonth(max.getMonth() + SOD.RISK_MAX_ACCEPT_MONTHS);
    if (Number.isNaN(when) || when <= Date.now() || when > max.getTime()) return fail("Waiver expiry must be a future date within 12 months.");
    if (stillPending(v.waiverPending)) return fail("A waiver is already awaiting approval for this vendor");
    const ap = requestApproval({ kind: "vendor.waiver", title: `Waive ${t} for ${clampText(v.name, 80)} until ${exp}`, subject: v.id, payload: { vendorId: v.id, type: t, reason, expires: exp }, needs: 1, approverRoles: APPROVERS, forbid: ownersOf(v) });
    v.waiverPending = ap.id; return { ok: true, type: t, name: v.name as string };
  }, () => post<Res<{ type: string; name: string }>>(`/vendors/${enc(id)}/waivers`, input));
}
/** Prototype: vendorDoFinding. The id is a demo value (random 3 digits, re-rolled on a clash). */
export function addFinding(id: string, input: { title: string; sev: string }) {
  return viaApi<Res<{ title: string; name: string }>>(() => {
    gate();
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
    gate();
    const v = vFind(id); if (!v) return NOT_FOUND;
    const f = Number.isInteger(fi) ? v.findings[fi] : null; if (!f) return fail("Finding not found");
    f.status = "Closed"; return { ok: true, title: f.title as string };
  }, () => post<Res<{ title: string }>>(`/vendors/${enc(id)}/findings/${fi}/close`, {}));
}
/** Prototype: vendorSendQ. The source only flips the status; nothing is sent. */
export function sendQuestionnaire(id: string) {
  return viaApi<Res<{ name: string }>>(() => {
    gate();
    const v = vFind(id); if (!v) return NOT_FOUND;
    v.status = "In review"; return { ok: true, name: v.name as string };
  }, () => post<Res<{ name: string }>>(`/vendors/${enc(id)}/questionnaire`, {}));
}
/** Prototype: vendorDoReassess. Fix: score is parsed as a decimal 0-100 (the source's parseInt turned "7.9" into 7 and "12abc" into 12). The recorder is always the signed-in person. */
export function reassess(id: string, input: { score: string; outcome: string; by: string }) {
  return viaApi<Res<{ name: string; score: number; outcome: string }>>(() => {
    gate();
    const v = vFind(id); if (!v) return NOT_FOUND;
    const sc = parseScore(input.score); if (sc === null) return fail("Enter a score between 0 and 100.");
    const out = pickOf(input.outcome, REASSESS_OUTCOMES, REASSESS_OUTCOMES[0]);
    v.score = sc; v.status = out.startsWith("Escalate") ? "In review" : "Active"; v.due = TIER_WINDOW[v.tier] || v.due;
    v.reassessments.push({ at: nowStamp().slice(0, 10), by: clampText(input.by, 80) || getMe().name, recordedBy: getActor().name, score: sc, outcome: out });
    return { ok: true, name: v.name as string, score: sc, outcome: out };
  }, () => post<Res<{ name: string; score: number; outcome: string }>>(`/vendors/${enc(id)}/reassessments`, input));
}
/** Prototype: vendorDoTier. A tier change is an approval: it is requested here and applied when a different admin/owner approves. */
export function changeTier(id: string, tier: string) {
  return viaApi<Res<{ changed: boolean; pending: boolean; name: string; from: string; to: string }>>(() => {
    gate();
    const v = vFind(id); if (!v) return NOT_FOUND;
    const nt = pickOf(tier, VENDOR_TIERS, ""); if (!nt) return fail("Choose a tier from the list");
    if (nt === v.tier) return { ok: true, changed: false, pending: false, name: v.name as string, from: v.tier as string, to: nt };
    if (stillPending(v.tierPending)) return fail("A tier change is already awaiting approval for this vendor");
    const from = v.tier as string;
    const ap = requestApproval({ kind: "vendor.tier", title: `Change tier of ${clampText(v.name, 80)}: ${from} → ${nt}`, subject: v.id, payload: { vendorId: v.id, from, to: nt }, needs: 1, approverRoles: APPROVERS, forbid: ownersOf(v) });
    v.tierPending = ap.id;
    return { ok: true, changed: true, pending: true, name: v.name as string, from, to: nt };
  }, () => post<Res<{ changed: boolean; pending: boolean; name: string; from: string; to: string }>>(`/vendors/${enc(id)}/tier`, { tier }));
}
