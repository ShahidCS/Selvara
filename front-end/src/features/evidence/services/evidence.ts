/* Evidence API stubs. Contract: docs/security/SOD_MATRIX.md section 3 (Evidence). Mock mode performs the in-memory DATA mutation and writes wsLog;
 * rules live here (SodError, deny by default) and the UI mirrors them through the `whyCannot*` helpers. In http mode each call goes to the
 * (not yet existing) API, which must re-validate every field, enforce authorization, scan/store uploaded files and own review/deletion state. */
import { DATA } from "@/lib/data";
import { nowStamp } from "@/lib/format";
import { wsLog } from "@/lib/audit";
import { getActor, SodError } from "@/lib/sod";
import { approve as engineApprove, getApproval, reject as engineReject, requestApproval, sweepExpired, whyCannotApprove as engineWhy, withdraw as engineWithdraw } from "@/lib/approvals";
import { guard, reasonText, selfReason } from "@/lib/grcSod";
import { viaApi } from "@/services/http";
import { wsPatch, wsPost, wsUpload } from "@/services/ws";
import { inAuditorScope } from "@/services/audits";
import { evidenceDecideDeleteBlock, evidenceRequestDeleteBlock, evidenceReviewBlock, evidenceWriteBlock } from "@/lib/rulesWs";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const EVIDENCE_TYPES = ["Screenshot", "PDF", "Report", "Record", "CSV"];
export const REVIEW_STATES = ["Pending review", "Accepted", "Rejected"];
const EXT: Record<string, string> = { Screenshot: "png", PDF: "pdf", Report: "pdf", Record: "pdf", CSV: "csv" };

/** Production: the same change on the server (under /api/ws), then the workspace reloads. */
const send = <T,>(method: "POST" | "PATCH", path: string, body: unknown = {}) => (method === "PATCH" ? wsPatch<T>(`/ws${path}`, body) : wsPost<T>(`/ws${path}`, body));
const enc = encodeURIComponent;

/** Tombstones of deleted evidence (who, why, who approved). In a real system this is an immutable server-side record. */
export const EVIDENCE_TOMBSTONES: { id: string; name: string; at: string; requestedBy: string; approvedBy: string; reason: string }[] = [];

/** Demo file size, derived from the file name so the same file always shows the same size (it is not read from a real file). */
const demoSize = (name: string, base: number, span: number) => { let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return (base + (h % span)) + " KB"; };
/** source evInit: fill defaults on a record (idempotent). The size is a demo value only. */
export function evInit(e: any) {
  if (!e.ver) e.ver = 1;
  if (!e.attachments) e.attachments = [{ name: String(e.name).replace(/[^a-z0-9]+/gi, "-").toLowerCase() + "." + (EXT[e.type] || "pdf"), size: demoSize(String(e.name), 80, 900), by: e.by }];
  if (!e.history) e.history = [{ ver: 1, at: e.updated, by: e.by, note: "Initial version collected" }];
  if (!e.review) e.review = { status: "Pending review" };
  return e;
}
/** An evidence item by id; outside an external auditor's scope it does not exist for them. */
export const findEvidence = (id: string) => DATA.evidence.find((e) => e.id === id && inAuditorScope("evidence", e.id));
const today = () => nowStamp().slice(0, 10);
const need = (id: string) => { const e = findEvidence(id); if (!e) throw new SodError("Evidence not found."); return evInit(e); };

/** Everyone who collected, versioned or attached: none of them may accept the evidence. */
export const contributors = (e: any): string[] =>
  [e.by, ...(e.history || []).map((h: any) => h.by), ...(e.attachments || []).map((a: any) => a.by)].filter(Boolean);
export const whyCannotWrite = (): string | null => evidenceWriteBlock(getActor().base);
export function whyCannotReview(e: any): string | null {
  return evidenceReviewBlock(e.review?.status ?? "Pending review", getActor().base, !!selfReason("", ...contributors(e)));
}
/** The pending deletion request (approval record), if any. */
export function pendingDelete(e: any) {
  sweepExpired();
  const a = e.deleteRequest ? getApproval(e.deleteRequest.approvalId) : undefined;
  return a && a.status === "Pending" ? a : undefined;
}
export function whyCannotRequestDelete(e: any): string | null {
  return evidenceRequestDeleteBlock(getActor().base, !!pendingDelete(e));
}
export function whyCannotDecideDelete(e: any): string | null {
  const a = pendingDelete(e);
  return evidenceDecideDeleteBlock(!!a, getActor().base, !!a && !!selfReason("", a.requestedBy)) || (a ? engineWhy(a) : null);
}

/** Any content change to accepted evidence invalidates the acceptance (a new version needs a new review). */
function touch(e: any, what: string) {
  if (e.review && e.review.status !== "Pending review") {
    wsLog("evidence.review.reset", `${e.id} v${e.ver}: ${e.review.status} → Pending review after ${what}`, "Control");
    e.review = { status: "Pending review" };
  }
}

export function createEvidence(input: { name: string; type: string; note: string }) {
  return viaApi(() => {
    guard(whyCannotWrite());
    const me = getActor();
    // source: id = "EV-"+(209+length); bump until unique so a delete followed by an add cannot duplicate an id
    let n = 209 + DATA.evidence.length;
    while (DATA.evidence.some((e) => e.id === "EV-" + n)) n++;
    const id = "EV-" + n;
    // The collector is always the signed-in person (never a typed name): the reviewer must differ from them.
    const e = evInit({ id, name: input.name, type: EVIDENCE_TYPES.includes(input.type) ? input.type : EVIDENCE_TYPES[0], updated: today(), by: me.name, note: input.note, attachments: [], history: [{ ver: 1, at: today(), by: me.name, note: "Evidence created" }], ver: 1 });
    DATA.evidence.unshift(e);
    wsLog("evidence.created", `${id} v1 collected by ${me.name}`, "Control");
    return { id };
  }, () => send<{ id: string }>("POST", "/evidence", input));
}
export function updateEvidence(id: string, input: { name: string; type: string; note: string }) {
  return viaApi(() => {
    const e = need(id); guard(whyCannotWrite());
    e.name = input.name; e.type = EVIDENCE_TYPES.includes(input.type) ? input.type : e.type; e.note = input.note; // collector cannot be edited
    touch(e, "edit");
    wsLog("evidence.updated", `${e.id} v${e.ver}`, "Control");
    return e;
  }, () => send<any>("PATCH", `/evidence/${enc(id)}`, input));
}
/** Reviewer accepts (or rejects) collected evidence. Reviewer must not be the collector or any contributor. */
export function reviewEvidence(id: string, decision: "Accepted" | "Rejected", note: string) {
  return viaApi(() => {
    const e = need(id); guard(whyCannotReview(e));
    const n = reasonText(note, decision === "Rejected" ? 10 : 0, "A review note");
    e.review = { status: decision, by: getActor().name, at: today(), note: n };
    wsLog("evidence." + (decision === "Accepted" ? "accepted" : "rejected"), `${e.id} v${e.ver} by ${e.review.by} (collector ${e.by})`, "Control");
    return e;
  }, () => send<any>("POST", `/evidence/${enc(id)}/review`, { decision, note, seen: findEvidence(id)?._v }));
}
/** Step 1 of deletion: an admin requests it with a reason. Nothing is deleted until a DIFFERENT admin approves. */
export function requestDelete(id: string, reason: string) {
  return viaApi(() => {
    const e = need(id); guard(whyCannotRequestDelete(e));
    const r = reasonText(reason, 15, "A deletion reason");
    const a = requestApproval({ kind: "evidence.delete", title: `Delete evidence ${e.id} ${e.name}`, subject: e.id, payload: { evidenceId: e.id, reason: r }, needs: 1, approverRoles: ["admin"], ttlHours: 72 });
    e.deleteRequest = { approvalId: a.id, by: a.requestedBy, at: today(), reason: r };
    wsLog("evidence.delete.requested", `${e.id} v${e.ver} (${a.id}): ${r}`, "Control");
    return a;
  }, () => send<any>("POST", `/evidence/${enc(id)}/delete-requests`, { reason }));
}
/** Step 2: a second admin approves (evidence is then removed and a tombstone kept) or rejects. */
export function decideDelete(id: string, decision: "approve" | "reject", reason: string) {
  return viaApi(() => {
    const e = need(id); guard(whyCannotDecideDelete(e)); const a = pendingDelete(e)!;
    const me = getActor().name;
    if (decision === "reject") { engineReject(a.id, reason); wsLog("evidence.delete.rejected", `${e.id} (${a.id}) by ${me}`, "Control"); return false; }
    engineApprove(a.id, reason);
    EVIDENCE_TOMBSTONES.push({ id: e.id, name: e.name, at: today(), requestedBy: a.requestedBy, approvedBy: me, reason: e.deleteRequest.reason });
    DATA.evidence = DATA.evidence.filter((x) => x.id !== id);
    wsLog("evidence.deleted", `${e.id} v${e.ver}; requested by ${a.requestedBy}, approved by ${me} (${a.id})`, "Control");
    return true;
  }, () => send<boolean>("POST", `/evidence/${enc(id)}/delete-requests/${decision}`, { reason, seen: findEvidence(id)?._v }).then(() => decision === "approve"));
}
export function withdrawDelete(id: string) {
  return viaApi(() => {
    const e = need(id); const a = pendingDelete(e); if (!a) throw new SodError("No pending deletion request.");
    engineWithdraw(a.id); wsLog("evidence.delete.withdrawn", `${e.id} (${a.id})`, "Control"); return true;
  }, () => send<boolean>("POST", `/evidence/${enc(id)}/delete-requests/withdraw`));
}
export function addAttachment(id: string, name: string) {
  return viaApi(() => {
    const e = need(id); guard(whyCannotWrite());
    e.attachments.push({ name, size: demoSize(name, 60, 700), by: getActor().name });
    touch(e, "attachment added");
    wsLog("evidence.attachment.added", `${e.id} v${e.ver}: ${name}`, "Control");
    return e;
  }, () => Promise.reject(new SodError("Choose a file to upload.")));
}
export function removeAttachment(id: string, index: number) {
  return viaApi(() => {
    const e = need(id); guard(whyCannotWrite());
    const f = e.attachments[index];
    e.attachments.splice(index, 1);
    touch(e, "attachment removed");
    wsLog("evidence.attachment.removed", `${e.id} v${e.ver}: ${f ? f.name : ""}`, "Control");
    return f as { name: string; size: string } | undefined;
  }, async () => {
    const f = findEvidence(id)?.attachments?.[index]; if (!f?.id) throw new SodError("File not found.");
    await send<void>("POST", `/evidence/${enc(id)}/files/${enc(f.id)}/remove`); return f as { name: string; size: string };
  });
}
export function createVersion(id: string, note: string) {
  return viaApi(() => {
    const e = need(id); guard(whyCannotWrite());
    e.ver++; e.updated = today();
    e.history.push({ ver: e.ver, at: e.updated, by: getActor().name, note });
    touch(e, "new version");
    wsLog("evidence.version.created", `${e.id} v${e.ver} by ${getActor().name}`, "Control");
    return e;
  }, () => send<any>("POST", `/evidence/${enc(id)}/versions`, { note }));
}

/* ---------- production only: real files (the demonstration records a typed name) ---------- */
/** Uploads a file (at most 4 MB; the server checks its type and content and stores it privately for the company). */
export const uploadAttachment = (id: string, file: File) => wsUpload<{ id: string }>(`/ws/evidence/${enc(id)}/files`, file);
/** A short-lived download link for a stored file (the download is recorded in the audit log). */
export const attachmentLink = (id: string, fileId: string) => wsPost<{ url: string }>(`/ws/evidence/${enc(id)}/files/${enc(fileId)}/download`);
