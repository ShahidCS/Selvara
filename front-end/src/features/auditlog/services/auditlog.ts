/* Workspace audit log service (prototype: wsVerify, wsLogExport, ropaExport, wsEvidencePackage).
 * Mock mode appends to the in-memory hash chain. The log is append-only: there is no update/delete function anywhere, and none must be added.
 * The real API MUST: store the log append-only server-side with HMAC/signed seals (FNV-1a here is a demo, not cryptographic), derive the actor
 * from the authenticated session (never from the client), authorize every call (audit-log access = tenant admin), rate-limit exports,
 * and record evidence packages server-side with a real SHA-256/signature. */
import { WS_AUDIT, hashStr, verifyWsChain, wsLastHash, wsLog, getMe, wsChainBody, type WsEntry } from "@/lib/audit";
import { csvCell, downloadText, nowStamp } from "@/lib/format";
import { ROPA } from "@/lib/platform";
import { downloadRopa } from "@/lib/ropa";
import { adminLog } from "@/lib/adminAudit";
import { appStore, bumpData } from "@/lib/store";
import { API_ON, modAllowed } from "@/lib/rbac";
import { g4Meta, wsPost } from "@/services/ws";
import { safeFileName } from "@/lib/security";
import { ApiError, apiFetch, viaApi } from "@/services/http";

/** Production adds the categories the server writes (audits, approvals, evidence, issues, incidents, sign-in security). */
export const AUDIT_CATS = ["All", "RoPA", "Control", "Access", "Policy", "Vendor", "Risk", "System", ...(API_ON ? ["Audit", "Approval", "Evidence", "Issue", "Incident", "Security"] : [])];
export const DEMO_HASH_NOTE = "Demo seal: 32-bit FNV-1a chaining, which shows tamper evidence but is NOT a cryptographic guarantee. A real system needs server-side append-only storage with HMAC or signatures.";
/** UI gate = module access (deny by default). Re-checked in every mutation below; the server must enforce it too. */
export const canAuditLog = (roleId: string) => modAllowed(roleId, "ws", "auditlog");
const guard = () => { if (!canAuditLog(appStore.get().role)) throw new ApiError(403, "Forbidden"); };
/** Production: a file the server built (and recorded in the company's log), saved in the browser. */
const fetchFile = async (path: string, body: unknown) => { const f = await wsPost<{ fileName: string; type?: string; content: string }>(path, body); downloadText(safeFileName(f.fileName), f.content, f.type); return f; };

export interface WsExport { id: string; at: string; by: string; entries: number; sha: string }
const EXPORTS: WsExport[] = []; // append-only register (module memory)
export const wsExports = (): readonly WsExport[] => (API_ON ? g4Meta.get().auditlog.packages : EXPORTS);
/** Production: the server's verification of the company's SHA-256 chain (null = intact). */
export const serverFirstBad = () => g4Meta.get().auditlog.firstBad;

/** A link is sealed only if its hash matches its fields AND it points at its predecessor's hash (genesis for the first). */
export function linkOk(l: WsEntry, i: number): boolean {
  if (API_ON) { const bad = serverFirstBad(); return bad == null || l.seq < bad; } // the server verified the chain
  const prev = i === 0 ? "0".repeat(8) : WS_AUDIT[i - 1].hash;
  return l.prev === prev && l.hash === hashStr(wsChainBody(l, l.prev, l.seq));
}

export function verifyChain() {
  return viaApi<boolean>(() => { guard(); const ok = verifyWsChain(); wsLog("auditlog.chain.verified", ok ? "intact, " + WS_AUDIT.length + " entries" : "BROKEN", "System"); return ok; }, async () => (await wsPost<{ intact: boolean }>("/ws/auditlog/verify", {})).intact);
}
const LOG_COLS = ["seq", "at", "actor", "action", "target", "cat", "hash", "prev"] as const;
export function exportLog(fmt: "json" | "csv") {
  return viaApi<boolean>(() => {
    guard();
    if (fmt !== "json" && fmt !== "csv") throw new ApiError(400, "Bad format");
    const rows = WS_AUDIT.slice();
    const ok = fmt === "json"
      ? downloadText(safeFileName("workspace-audit-log.json"), JSON.stringify(rows, null, 2))
      : downloadText(safeFileName("workspace-audit-log.csv"), [LOG_COLS.join(",")].concat(rows.map((r) => LOG_COLS.map((c) => csvCell(r[c])).join(","))).join("\n"));
    wsLog("auditlog.exported", WS_AUDIT.length + " entries, " + fmt.toUpperCase(), "System");
    return ok;
  }, async () => { await fetchFile("/ws/auditlog/exports", { format: fmt }); return true; });
}
/** Prototype: ropaExport. The source logs it through adminLog (platform chain) even when raised from the workspace module; ported as-is (see checklist). */
export function exportRopa(fmt: "json" | "csv") {
  return viaApi<boolean>(() => {
    guard();
    if (fmt !== "json" && fmt !== "csv") throw new ApiError(400, "Bad format");
    const ok = downloadRopa(fmt);
    adminLog("ropa.exported", ROPA.length + " activities, " + fmt.toUpperCase(), { categories: ["Audit"], basis: "Legal obligation" });
    return ok;
  }, async () => { guard(); await apiFetch("/ws/exports", { method: "POST", body: JSON.stringify({ action: "ropa.exported", target: fmt }) }); return downloadRopa(fmt); });
}
export function generatePackage() {
  return viaApi<string>(() => {
    guard();
    const id = "WEXP-" + String(EXPORTS.length + 1).padStart(3, "0");
    const payload = JSON.stringify({ entries: WS_AUDIT, ropa: ROPA });
    const sha = hashStr(payload) + hashStr(payload.split("").reverse().join("")) + hashStr(id);
    const manifest = { package: id, generated: nowStamp(), generatedBy: getMe().name, entries: WS_AUDIT.length, ropaActivities: ROPA.length, anchoredHead: wsLastHash(), hash: sha, algorithm: "FNV-1a (demo, not cryptographic)", note: "Sample evidence package for illustration. Requires reviewer sign-off." };
    EXPORTS.push({ id, at: nowStamp(), by: getMe().name, entries: WS_AUDIT.length, sha });
    downloadText(safeFileName(id + "-manifest.json"), JSON.stringify(manifest, null, 2));
    wsLog("evidence.package.generated", id + ", " + WS_AUDIT.length + " entries", "System"); bumpData();
    return id;
  }, async () => { const f = await fetchFile("/ws/auditlog/packages", {}); return f.fileName.replace(/\.json$/, ""); });
}
