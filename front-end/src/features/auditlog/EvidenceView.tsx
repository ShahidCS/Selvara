import { Empty, Icon, Table } from "@/components/ui";
import { wsExports } from "@/features/auditlog/services/auditlog";

/** Prototype: wsEvidenceView. Column "Package SHA-256" relabelled: the value is an FNV-1a demo digest (see checklist). */
export function EvidenceView({ onGenerate, can }: { onGenerate: () => void; can: boolean }) {
  const ex = wsExports();
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="card" style={{ boxShadow: "none" }}><div className="c-body">
        <div className="sectitle" style={{ marginTop: 0 }}>Evidence export package</div>
        <p className="field help" style={{ margin: "0 0 10px", maxWidth: "72ch" }}>Generate a sealed package of the workspace audit log and RoPA register with a hash manifest for auditors. Append-only; each package is recorded below. Demo digest (FNV-1a), not SHA-256 or a signature: a real package must be signed server-side.</p>
        <button className="btn btn-primary sm" disabled={!can} onClick={onGenerate}><Icon name="download" />Generate and download package</button>
      </div></div>
      <div className="card"><div className="c-head"><h3>Exports register</h3>{ex.length ? <span className="tag" style={{ marginLeft: "auto" }}>{ex.length}</span> : null}</div>
        <div className="c-body flush scroll" style={{ padding: 0 }}>
          {ex.length ? (
            <Table cols={[{ t: "Package" }, { t: "Generated" }, { t: "By" }, { t: "Entries" }, { t: "Package hash (demo)" }]} minw={860}>
              {ex.slice().reverse().map((e) => (
                <tr key={e.id}><td className="strong num">{e.id}</td><td className="num" style={{ color: "var(--muted)" }}>{e.at}</td><td>{e.by}</td><td className="num">{e.entries}</td><td className="num" style={{ fontSize: 11, color: "var(--muted)" }}>{e.sha}</td></tr>
              ))}
            </Table>
          ) : <Empty icon="download" title="No packages yet">Generate a package to seal the current log and RoPA register for an auditor.</Empty>}
        </div></div>
    </div>
  );
}
