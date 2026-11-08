/* Risk import API stub. In mock mode it performs the in-memory DATA mutation the prototype did (and the wsLog entry);
 * in http mode it would POST the already-validated rows. The server must re-validate everything (ids, ranges, lengths, RBAC). */
import { wsLog } from "@/lib/audit";
import { applyImport, type Parsed } from "@/components/modules/risk/import/convert";
import { viaApi, apiFetch } from "./http";

export function commitRiskImport(rows: Parsed[], fileName: string) {
  return viaApi(
    () => applyImport(rows, fileName, wsLog),
    () => apiFetch<{ nNew: number; nUpd: number }>("/risks/import", {
      method: "POST",
      body: JSON.stringify({ fileName, rows: rows.filter((r) => r.result !== "Skip").map((r) => r._apply) }),
    }),
  );
}
