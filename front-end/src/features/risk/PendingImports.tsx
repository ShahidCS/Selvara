/* "Pending imports" panel (Register tab): imports that would update existing risks wait here for a second admin (four-eyes, docs/security/SOD_MATRIX.md).
 * Everyone who can edit risks sees the list; only an eligible approver (admin, not the importer) can use Approve / Reject. */
import { useState } from "react";
import { Chip } from "@/components/ui";
import { useLayer } from "@/components/shell/LayerProvider";
import { approvals, whyCannotApprove } from "@/lib/approvals";
import { riskCanEdit } from "@/lib/risk";
import { bumpData, useApp, useData } from "@/lib/store";
import { hasRole } from "@/lib/sod";
import { IMPORT_KIND, decideRiskImport, withdrawRiskImport } from "@/features/risk/services/riskImport";
import { attemptR } from "./util";

export default function PendingImports() {
  useData();
  const L = useLayer();
  const role = useApp((s) => s.role);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const list = approvals.get().list.filter((a) => a.kind === IMPORT_KIND && a.status === "Pending");
  if (!list.length || !(riskCanEdit(role) || hasRole(role, "admin"))) return null;
  const decide = (id: string, d: "approve" | "reject") => attemptR(L, async () => {
    const res = await decideRiskImport(id, d, reasons[id] || "");
    if (d === "approve") L.toast("Import approved: " + res.nNew + " new and " + res.nUpd + " updated risk" + (res.nNew + res.nUpd !== 1 ? "s" : ""));
    else L.toast("Import rejected. No risk was changed.");
    setReasons((p) => ({ ...p, [id]: "" })); bumpData();
  });
  const wd = (id: string) => attemptR(L, async () => { await withdrawRiskImport(id); L.toast("Import withdrawn. No risk was changed."); bumpData(); });
  return (
    <section className="card" aria-label="Pending imports"><div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h3 style={{ margin: 0 }}>Pending imports</h3>
      <p className="sub" style={{ margin: 0 }}>These files would update existing risks. Nothing changes until an admin other than the importer approves.</p>
      {list.map((a) => {
        const why = whyCannotApprove(a); const p = a.payload as { nNew: number; nUpd: number; ids?: string[] };
        const mine = !!a.requestedBy && why === "Segregation of duties: you cannot approve your own request.";
        return (
          <div key={a.id} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
              <span className="strong">{a.title}</span><Chip cls="warn" icon="clock">Awaiting approval</Chip>
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{a.id} · imported by {a.requestedBy} · {p.nUpd} update{p.nUpd !== 1 ? "s" : ""}, {p.nNew} new{p.ids ? " · " + p.ids.slice(0, 8).join(", ") + (p.ids.length > 8 ? " …" : "") : ""}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label className="field" style={{ flex: "1 1 220px", margin: 0 }}><span className="flab">Reason (at least 10 characters)</span>
                <input className="input" maxLength={300} disabled={!!why} value={reasons[a.id] || ""} onChange={(e) => setReasons((x) => ({ ...x, [a.id]: e.target.value }))} /></label>
              <button className="btn btn-primary sm" disabled={!!why} title={why || undefined} onClick={() => decide(a.id, "approve")}>Approve</button>
              <button className="btn btn-secondary sm" disabled={!!why} title={why || undefined} onClick={() => decide(a.id, "reject")}>Reject</button>
              {mine ? <button className="btn btn-ghost sm" onClick={() => wd(a.id)}>Withdraw</button> : null}
            </div>
            {why ? <div style={{ fontSize: 12, color: "var(--muted)" }}>{why}</div> : null}
          </div>
        );
      })}
    </div></section>
  );
}
