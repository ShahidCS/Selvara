import { Chip, Empty, Icon, Table } from "@/components/ui";
import { ADMIN_AUDIT, lastHash } from "@/lib/adminAudit";
import { DEMO_HASH_NOTE, exportsRegister, linkOk } from "@/features/adminlog/services/adminlog";

/** Prototype: alogChain. Entry rows show a per-link Sealed/Broken chip (hash AND predecessor link). Text only. */
export function AdminChainView({ ok, onVerify, can }: { ok: boolean; onVerify: () => void; can: boolean }) {
  return (
    <div style={{ padding: 16, maxWidth: 900 }}>
      <div className="card" style={{ boxShadow: "none", background: ok ? "var(--ok-bg)" : "var(--bad-bg)", borderColor: "transparent", marginBottom: 14 }}>
        <div className="c-body" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Icon name={ok ? "check" : "alert"} style={{ color: ok ? "var(--ok-ink)" : "var(--bad-ink)", flex: "none" }} />
          <div style={{ flex: "1 1 240px", minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: ok ? "var(--ok-ink)" : "var(--bad-ink)" }} role="status">{ok ? "Chain intact" : "Chain broken — tampering detected"}</div>
            <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{ADMIN_AUDIT.length} entries sealed. Anchored head: <span className="num">{lastHash()}</span></div>
          </div>
          <button className="btn btn-primary sm" disabled={!can} onClick={onVerify}><Icon name="check" />Verify chain</button>
        </div>
      </div>
      <p className="field help" style={{ margin: "0 0 14px", maxWidth: "72ch" }}>{DEMO_HASH_NOTE}</p>
      <div className="sectitle">How the chain of evidence works</div>
      <ul style={{ margin: "0 0 14px", paddingLeft: 18, lineHeight: 1.7, color: "var(--ink-2)", maxWidth: "72ch", fontSize: 13 }}>
        <li>Each entry records the UTC time, the actor and role, the tenant, the action and object, the before and after state, the lawful basis, the data categories and the GDPR Article 30 processing activity it belongs to.</li>
        <li>The entry is sealed: its fields plus the previous entry&apos;s hash are hashed into this entry&apos;s hash, so any later edit or deletion breaks every hash after it.</li>
        <li>The log is append-only. Verifying walks the chain from the genesis hash to the anchored head and confirms every link.</li>
      </ul>
      <div className="sectitle">Chain links</div>
      <Table cols={[{ t: "#" }, { t: "Time (UTC)" }, { t: "Action" }, { t: "Prev hash" }, { t: "Entry hash" }, { t: "Link" }]} minw={760}>
        {ADMIN_AUDIT.map((l, i) => ({ l, i })).reverse().map(({ l, i }) => (
          <tr key={l.seq}>
            <td className="num" style={{ color: "var(--muted)" }}>{l.seq}</td><td className="num" style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{l.at}</td><td className="num">{l.action}</td>
            <td className="num" style={{ color: "var(--muted)", fontSize: 11 }}>{l.prev}</td><td className="num" style={{ fontSize: 11 }}>{l.hash}</td>
            <td>{linkOk(l, i) ? <Chip cls="ok" icon="check">Sealed</Chip> : <Chip cls="bad" icon="x">Broken</Chip>}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

/** Prototype: alogExportsView. "SHA-256" relabelled to the real (demo FNV-1a) digest. */
export function AdminExportsView({ onGenerate, can }: { onGenerate: () => void; can: boolean }) {
  const ex = exportsRegister();
  return (
    <div style={{ padding: 16, maxWidth: 900 }}>
      <div className="card" style={{ boxShadow: "none", marginBottom: 14 }}><div className="c-body">
        <div className="sectitle" style={{ marginTop: 0 }}>Evidence export package</div>
        <p className="field help" style={{ margin: "0 0 10px" }}>Generate a sealed package of the audit log and RoPA register with a hash manifest for auditors. Append-only; each package is recorded in the exports register. Demo digest (FNV-1a), not SHA-256 or a signature: a real package must be signed server-side.</p>
        <button className="btn btn-primary sm" disabled={!can} onClick={onGenerate}><Icon name="download" />Generate and download package</button>
      </div></div>
      <div className="sectitle">Exports register</div>
      {ex.length ? (
        <Table cols={[{ t: "Package" }, { t: "Generated (UTC)" }, { t: "By" }, { t: "Entries" }, { t: "Package hash (demo)" }]}>
          {ex.slice().reverse().map((e) => (
            <tr key={e.id}><td className="strong num">{e.id}</td><td className="num" style={{ color: "var(--muted)" }}>{e.at}</td><td>{e.by}</td><td className="num">{e.entries}</td><td className="num" style={{ fontSize: 11, color: "var(--muted)" }}>{e.sha}</td></tr>
          ))}
        </Table>
      ) : <Empty icon="download" title="No packages yet">Generate a package to seal the current log and RoPA register for an auditor.</Empty>}
    </div>
  );
}
