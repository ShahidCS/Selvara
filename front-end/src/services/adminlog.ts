/* Platform admin audit log service (prototype: alogVerify, alogExport, ropaExport, evidencePackage, alogRows).
 * Read-only viewer plus append-only side effects. There is deliberately NO edit/delete function. The real API MUST: keep the log append-only
 * server-side with HMAC/signed seals (FNV-1a here is a demo), take actor/role/IP from the authenticated request (never client values), authorize
 * (platform admins only), rate-limit exports, enforce retention (PA-15: 7 years) and sign evidence packages. */
import { ADMIN_AUDIT, adminLog, chainEntry, lastHash, verifyChain, type AdminEntry } from "@/lib/adminAudit";
import { getMe, hashStr } from "@/lib/audit";
import { csvCell, downloadText, nowStampUTC } from "@/lib/format";
import { CUSTOMERS, ROPA } from "@/lib/platform";
import { downloadRopa } from "@/lib/ropa";
import { modAllowed } from "@/lib/rbac";
import { appStore, bumpData } from "@/lib/store";
import { safeFileName } from "@/lib/security";
import { ApiError, apiFetch, viaApi } from "./http";

export const DEMO_HASH_NOTE = "Demo seal: 32-bit FNV-1a chaining shows tamper evidence but is NOT a cryptographic guarantee. A real system needs server-side append-only storage with HMAC or signatures.";
export const canAdminLog = (roleId: string) => modAllowed(roleId, "admin", "adminlog");
const guard = () => { if (!canAdminLog(appStore.get().role)) throw new ApiError(403, "Forbidden"); };
const post = <T,>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
const AUDIT_OPTS = { categories: ["Audit"], basis: "Legal obligation" };

export interface AlogFilter { q: string; tenant: string; basis: string }
/** Prototype: alogRows (newest first). */
export function alogRows(f: AlogFilter): AdminEntry[] {
  const q = f.q.toLowerCase();
  return ADMIN_AUDIT.filter((l) => {
    if (f.tenant !== "All" && (l.tenant || "") !== f.tenant) return false;
    if (f.basis !== "All" && l.basis !== f.basis) return false;
    if (q && !`${l.actor} ${l.action} ${l.object} ${l.ip} ${l.role}`.toLowerCase().includes(q)) return false;
    return true;
  }).slice().reverse();
}
export const tenantName = (t?: string) => (t ? (CUSTOMERS[t] ? CUSTOMERS[t].name : t) : "Platform");
/** Sealed only if the hash matches the fields AND the link points at the predecessor's hash. */
export function linkOk(l: AdminEntry, i: number): boolean {
  const prev = i === 0 ? "0".repeat(8) : ADMIN_AUDIT[i - 1].hash;
  return l.prev === prev && l.hash === chainEntry(l, l.prev, l.seq);
}

export function verify() {
  return viaApi<boolean>(() => { guard(); const ok = verifyChain(); adminLog("adminlog.chain.verified", ok ? "intact, " + ADMIN_AUDIT.length + " entries" : "BROKEN", AUDIT_OPTS); return ok; }, () => post<boolean>("/admin/audit/verify", {}));
}
const COLS = ["seq", "at", "actor", "role", "tenant", "action", "object", "before", "after", "basis", "categories", "ip", "hash", "prev"] as const;
export function exportLog(fmt: "json" | "csv", f: AlogFilter) {
  return viaApi<boolean>(() => {
    guard();
    if (fmt !== "json" && fmt !== "csv") throw new ApiError(400, "Bad format");
    const rows = alogRows(f).slice().reverse(); const cn = ADMIN_AUDIT.length;
    const ok = fmt === "json"
      ? downloadText(safeFileName("admin-audit-log.json"), JSON.stringify(rows, null, 2))
      : downloadText(safeFileName("admin-audit-log.csv"), [COLS.join(",")].concat(rows.map((r) => COLS.map((c) => csvCell(c === "categories" ? (r.categories || []).join("|") : r[c])).join(","))).join("\n"));
    adminLog("adminlog.exported", cn + " entries, " + fmt.toUpperCase(), AUDIT_OPTS);
    return ok;
  }, () => post<boolean>("/admin/audit/exports", { format: fmt, filter: f }));
}
export function exportRopa(fmt: "json" | "csv") {
  return viaApi<boolean>(() => {
    guard();
    if (fmt !== "json" && fmt !== "csv") throw new ApiError(400, "Bad format");
    const ok = downloadRopa(fmt);
    adminLog("ropa.exported", ROPA.length + " activities, " + fmt.toUpperCase(), AUDIT_OPTS);
    return ok;
  }, () => post<boolean>("/admin/audit/ropa/exports", { format: fmt }));
}
export interface AdminExport { id: string; at: string; by: string; entries: number; sha: string }
const EXPORTS: AdminExport[] = []; // append-only register
export const exportsRegister = (): readonly AdminExport[] => EXPORTS;
export function generatePackage() {
  return viaApi<string>(() => {
    guard();
    const id = "EXP-" + String(EXPORTS.length + 1).padStart(3, "0");
    const payload = JSON.stringify({ entries: ADMIN_AUDIT, ropa: ROPA });
    const sha = hashStr(payload) + hashStr(payload.split("").reverse().join("")) + hashStr(id);
    const manifest = { package: id, generatedUTC: nowStampUTC(), generatedBy: getMe().name, entries: ADMIN_AUDIT.length, ropaActivities: ROPA.length, anchoredHead: lastHash(), hash: sha, algorithm: "FNV-1a (demo, not cryptographic)", note: "Sample evidence package for illustration. Requires reviewer sign-off." };
    EXPORTS.push({ id, at: nowStampUTC(), by: getMe().name, entries: ADMIN_AUDIT.length, sha });
    downloadText(safeFileName(id + "-manifest.json"), JSON.stringify(manifest, null, 2));
    adminLog("evidence.package.generated", id + ", " + ADMIN_AUDIT.length + " entries", AUDIT_OPTS); bumpData();
    return id;
  }, () => post<string>("/admin/audit/packages", {}));
}
