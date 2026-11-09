/* Reports API stubs (source lines 3496-3525). Caller does wsLog/toast/bumpData.
 * CONTRACT (docs/security/SOD_MATRIX.md section 3, Reports): owner/admin may schedule; scheduling EXTERNAL distribution is a four-eyes approval: it is requested here and goes live
 * only when a DIFFERENT admin approves (approvals engine). Internal-only schedules save at once. A recipient is internal only if it is a known internal group or an
 * address on the workspace's own email domain; anything else is external (deny by default). Violations throw SodError.
 * A real API must generate reports server-side with the caller's permissions, own scheduling/recipients (validate addresses, restrict external recipients) and distribution. */
import { wsLog } from "@/lib/audit";
import { getApproval, requestApproval } from "@/lib/approvals";
import { payloadStr, registerApprovalHandler } from "@/lib/approvalKit";
import { assertRole, SodError } from "@/lib/sod";
import { roleOf } from "@/lib/rbac";
import { appStore } from "@/lib/store";
import { usersFor } from "@/lib/tenantUsers";
import { clampText } from "@/lib/security";
import { nowStamp } from "@/lib/format";
import { SCHED_PACKS, SchedPack } from "@/lib/trustData";
import { apiFetch, viaApi } from "./http";

const send = <T,>(method: string, path: string, body?: unknown) =>
  apiFetch<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

/** source reportGenerate content (plain text, draft). */
export function generateReport(name: string) {
  return viaApi(() => (assertRole("generating a report", "admin", "owner"), "REPORT (DRAFT) — " + name + "\nGenerated " + nowStamp() + "\n\nSynthetic demo content. Requires review before distribution."),
    () => send<string>("POST", "/reports/generate", { name }));
}
const INTERNAL_GROUPS = ["board", "exec team", "executive team", "exec", "leadership", "management", "risk committee", "audit committee", "security team", "compliance team", "all staff", "employees", "ciso", "cfo", "ceo"];
/** Recipients that are NOT a known internal group or an address on the signed-in workspace's own email domain (free text, deny by default). */
export function externalRecipients(recip: string): string[] {
  const tenant = roleOf(appStore.get().role).tenant;
  const own = new Set(usersFor(tenant || "").map((u) => u.email.split("@")[1]?.toLowerCase()).filter(Boolean));
  return String(recip || "").split(/[,;\n]/).map((t) => t.trim()).filter((t) => t && t !== "—").filter((t) => {
    if (INTERNAL_GROUPS.includes(t.toLowerCase())) return false;
    const at = t.lastIndexOf("@"); return !(at > 0 && own.has(t.slice(at + 1).toLowerCase()));
  });
}
const upsert = (rec: SchedPack) => { const ex = SCHED_PACKS.find((p) => p.name === rec.name); if (ex) Object.assign(ex, rec); else SCHED_PACKS.unshift(rec); };
/** Approval id of the pending external-distribution request per pack name. */
const requestIds = new Map<string, string>();
const pendingFor = (name: string) => { const id = requestIds.get(name); return !!id && getApproval(id)?.status === "Pending"; };

registerApprovalHandler("report.distribution", {
  apply: (ap) => {
    const rec = ap.payload.rec as SchedPack | undefined; if (!rec || typeof rec.name !== "string") throw new SodError("Schedule request is invalid.");
    const by = ap.approvals.map((x) => x.by).join(", ");
    upsert({ ...rec, external: true, approvedBy: by, approvalId: ap.id }); requestIds.delete(rec.name);
    wsLog("report.scheduled", `${rec.name} · ${rec.freq}${rec.detail ? " (" + rec.detail + ")" : ""} (external distribution approved by ${by}; requested by ${ap.requestedBy})`, "System");
  },
  closed: (ap) => { requestIds.delete(payloadStr(ap, "name")); },
});

/** Saves an internal-only schedule at once; an external one becomes a pending approval (nothing is distributed until a different admin approves). */
export function saveSchedule(rec: SchedPack) {
  return viaApi<{ rec: SchedPack; pending: boolean }>(() => {
    assertRole("scheduling a report", "admin", "owner");
    const ext = externalRecipients(rec.recip);
    if (!ext.length) { upsert({ ...rec, external: false }); return { rec, pending: false }; }
    if (pendingFor(rec.name)) throw new SodError("A schedule for this pack is already awaiting approval.");
    const ap = requestApproval({ kind: "report.distribution", title: `Schedule external distribution of "${clampText(rec.name, 80)}" (${rec.freq}) to ${clampText(ext.join(", "), 120)}`, subject: rec.name, payload: { name: rec.name, rec }, needs: 1, approverRoles: ["admin"] });
    requestIds.set(rec.name, ap.id); return { rec, pending: true };
  }, () => send<{ rec: SchedPack; pending: boolean }>("PUT", "/reports/schedules", rec));
}
export function removeSchedule(i: number) {
  return viaApi(() => { assertRole("removing a schedule", "admin", "owner"); const r = SCHED_PACKS[i]; if (r) SCHED_PACKS.splice(i, 1); return r || null; }, () => send<SchedPack | null>("DELETE", `/reports/schedules/${i}`));
}
