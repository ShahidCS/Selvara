import { Chip, Icon, Table } from "@/components/ui";
import { WS_AUDIT, wsLastHash } from "@/lib/audit";
import { DEMO_HASH_NOTE, linkOk } from "@/features/auditlog/services/auditlog";

/** Prototype: wsChainView. The algorithm row says FNV-1a (the source said "SHA-256 (demo)", which was inaccurate; see checklist). */
export function ChainView({ ok, onVerify, can }: { ok: boolean; onVerify: () => void; can: boolean }) {
  const genesis = WS_AUDIT.length ? WS_AUDIT[0].prev : "—";
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="card" style={{ boxShadow: "none", background: ok ? "var(--accent-weak)" : "var(--warn-bg)", borderColor: "transparent" }}>
        <div className="c-body" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Icon name={ok ? "check" : "alert"} />
          <div style={{ flex: "1 1 auto" }}>
            <div style={{ fontWeight: 600, fontSize: 15 }} role="status">{ok ? "Chain intact" : "Chain broken — tampering detected"}</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{WS_AUDIT.length} entries sealed. Anchored head: <span className="num">{wsLastHash()}</span></div>
          </div>
          <button className="btn btn-primary sm" disabled={!can} onClick={onVerify}><Icon name="check" />Verify chain</button>
        </div>
      </div>
      <p className="field help" style={{ margin: 0, maxWidth: "none" }}>{DEMO_HASH_NOTE}</p>
      <div className="panels" style={{ gridTemplateColumns: "1.5fr 1fr", alignItems: "stretch" }}>
        <div className="card"><div className="c-head"><h3>How the chain of evidence works</h3></div><div className="c-body"><ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, color: "var(--ink-2)", fontSize: 13 }}>
          <li>Each workspace event records the time, actor, action, target and category, and the GDPR Article 30 processing activity it belongs to.</li>
          <li>Each entry is sealed by hashing its fields plus the previous entry&apos;s hash, so any later edit or deletion breaks every hash after it.</li>
          <li>The log is append-only. Verifying walks the chain from the genesis hash to the anchored head.</li>
        </ul></div></div>
        <div className="card"><div className="c-head"><h3>Chain summary</h3></div><div className="c-body"><dl className="meta-grid">
          <dt>Status</dt><dd>{ok ? <Chip cls="ok" icon="check">Intact</Chip> : <Chip cls="bad" icon="x">Broken</Chip>}</dd>
          <dt>Entries sealed</dt><dd className="num">{WS_AUDIT.length}</dd><dt>Genesis hash</dt><dd className="num">{genesis}</dd>
          <dt>Anchored head</dt><dd className="num">{wsLastHash()}</dd><dt>Algorithm</dt><dd>FNV-1a 32-bit (demo, not cryptographic)</dd>
        </dl></div></div>
      </div>
      <div className="card"><div className="c-head"><h3>Chain links</h3><span className="tag" style={{ marginLeft: "auto" }}>{WS_AUDIT.length} entries</span></div>
        <div className="c-body flush scroll" style={{ padding: 0 }}>
          <Table cols={[{ t: "#" }, { t: "Time" }, { t: "Actor" }, { t: "Action" }, { t: "Target" }, { t: "Prev hash" }, { t: "Entry hash" }, { t: "Link" }]} minw={1060}>
            {WS_AUDIT.map((l, i) => ({ l, i })).reverse().map(({ l, i }) => (
              <tr key={l.seq}>
                <td className="num" style={{ color: "var(--muted)" }}>{l.seq}</td><td className="num" style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{l.at}</td>
                <td className="strong">{l.actor}</td><td className="num">{l.action}</td><td>{l.target}</td>
                <td className="num" style={{ color: "var(--muted)", fontSize: 11 }}>{l.prev}</td><td className="num" style={{ fontSize: 11 }}>{l.hash}</td>
                <td>{linkOk(l, i) ? <Chip cls="ok" icon="check">Sealed</Chip> : <Chip cls="bad" icon="x">Broken</Chip>}</td>
              </tr>
            ))}
          </Table>
        </div></div>
    </div>
  );
}
