/* Risk import API stub. Contract (docs/security/SOD_MATRIX.md): an import that would UPDATE existing risk ids is never applied directly. It is staged as an
 * approval request (kind "risk.import", one admin approver who is not the importer); approving applies the staged rows. Imports of only NEW ids apply at once.
 * In http mode the already-validated rows are POSTed; the server must re-validate (ids, ranges, lengths, RBAC) and enforce the same four-eyes rule. */
import { wsLog } from "@/lib/audit";
import { approve as approveReq, getApproval, reject as rejectReq, requestApproval, sweepExpired } from "@/lib/approvals";
import { SodError, assertRole, getActor } from "@/lib/sod";
import { riskCanEdit } from "@/lib/risk";
import { clampText } from "@/lib/security";
import { applyImport, type Parsed } from "@/features/risk/import/convert";
import { viaApi, apiFetch } from "@/services/http";

export const IMPORT_KIND = "risk.import";
export interface ImportResult { nNew: number; nUpd: number; staged?: boolean; approvalId?: string }

export function commitRiskImport(rows: Parsed[], fileName: string): Promise<ImportResult> {
  return viaApi<ImportResult>(
    () => {
      if (!riskCanEdit()) throw new SodError("Not permitted: importing risks requires an editing role.");
      const live = rows.filter((r) => r.result !== "Skip" && r._apply);
      const nUpd = live.filter((r) => r._apply?.mode === "Update").length, nNew = live.length - nUpd;
      const fn = clampText(fileName, 120);
      if (!nUpd) return applyImport(rows, fileName, wsLog, getActor().name);
      const ap = requestApproval({
        kind: IMPORT_KIND, title: "Risk import " + fn + ": " + nNew + " new, " + nUpd + " update" + (nUpd !== 1 ? "s" : ""), subject: fn,
        needs: 1, approverRoles: ["admin"], forbid: [getActor().name], ttlHours: 72,
        payload: { rows: JSON.parse(JSON.stringify(live)), fileName: fn, nNew, nUpd, ids: live.map((r) => r._apply?.id), applied: false },
      });
      wsLog("risk.import.staged", ap.id + ": " + nNew + " new, " + nUpd + " updates (" + fn + ") awaiting approval", "Risk");
      return { nNew, nUpd, staged: true, approvalId: ap.id };
    },
    () => apiFetch<ImportResult>("/risks/import", {
      method: "POST",
      body: JSON.stringify({ fileName, rows: rows.filter((r) => r.result !== "Skip").map((r) => r._apply) }),
    }),
  );
}

/** Approver decision on a staged import. Throws SodError (not an admin, or the importer / a forbidden person). Approving applies the staged rows once. */
export function decideRiskImport(id: string, decision: "approve" | "reject", reasonIn: string): Promise<ImportResult> {
  return viaApi<ImportResult>(
    () => {
      assertRole("deciding a risk import", "admin");
      sweepExpired();
      const ap = getApproval(id); if (!ap || ap.kind !== IMPORT_KIND) throw new SodError("Request not found.");
      const reason = clampText(reasonIn, 300); if (reason.length < 10) throw new SodError("Give a reason of at least 10 characters.");
      const p = ap.payload as { rows: Parsed[]; fileName: string; nNew: number; nUpd: number; applied?: boolean };
      if (decision === "reject") {
        rejectReq(id, reason); wsLog("risk.import.rejected", id + ": " + p.fileName + " not applied", "Risk");
        return { nNew: 0, nUpd: 0 };
      }
      const done = approveReq(id, reason);
      if (done.status !== "Approved" || p.applied) return { nNew: 0, nUpd: 0 };
      p.applied = true;
      const res = applyImport(p.rows, p.fileName, wsLog, ap.requestedBy);
      wsLog("risk.import.approved", id + ": applied " + res.nNew + " new, " + res.nUpd + " updated (" + p.fileName + ")", "Risk");
      return res;
    },
    () => apiFetch<ImportResult>(`/risks/import/${encodeURIComponent(id)}/decision`, { method: "POST", body: JSON.stringify({ decision, reason: reasonIn }) }),
  );
}
