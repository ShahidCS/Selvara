import { useState } from "react";
import { Chip, Icon, Table } from "@/components/ui";
import { LayerFoot } from "@/components/shell/LayerProvider";
import { useLayer } from "@/hooks/useLayer";
import { useGate } from "@/components/kit/admin/ElevateGate";
import { sodMessage } from "@/lib/approvalFlow";
import { IP_POLICY, LEVEL_LABEL, REPUTATION, thresholdFor } from "@/lib/ipGuard";
import { hasRole } from "@/lib/sod";
import { useApp, useData } from "@/lib/store";
import { LIFT_REASON_MIN, blockedAddresses, unblockAddress } from "@/services/ipBlocks";

const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";

/** Network addresses blocked after repeated failed sign-ins. Platform support can see them; only an elevated super admin can lift one. */
export function BlockedAddresses() {
  useData(); const role = useApp((s) => s.role); const gate = useGate(); const L = useLayer();
  const list = blockedAddresses();
  const isSuper = hasRole(role, "super");
  return (
    <section className="card" aria-labelledby="ipb-h">
      <div className="c-head"><h3 id="ipb-h">Blocked sign-in addresses</h3><div className="r"><span className="tag">{list.length} blocked</span></div></div>
      <div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p className="field help" style={{ margin: 0, maxWidth: "80ch" }}>
          {IP_POLICY.THRESHOLD} failed sign-ins from one address within {IP_POLICY.WINDOW_MS / 60_000} minutes, across any accounts, block it. Each repeat within {IP_POLICY.RESET_MS / 86_400_000} days lasts longer: {LEVEL_LABEL.join(", ")}, and 24-hour blocks repeat while failures continue. No block is permanent. Every block ends on its own; only an elevated platform super admin can lift one early.
        </p>
        {list.length === 0 ? <p className="field help" style={{ margin: 0 }}>No address is blocked.</p> : (
          <div style={{ margin: "0 -16px" }}>
            <Table cols={[{ t: "Address" }, { t: "Level" }, { t: "Blocked until" }, { t: "Blocks" }, { t: "" }]}>
              {list.map((r) => (
                <tr key={r.ip}>
                  <td className="strong num">{r.ip}</td>
                  <td>{r.level >= LEVEL_LABEL.length ? <Chip cls="bad" icon="alert">{LEVEL_LABEL[r.level - 1]}</Chip> : <Chip cls="warn" icon="clock">{LEVEL_LABEL[r.level - 1]}</Chip>}</td>
                  <td className="num" style={{ fontSize: 12 }}>{fmt(r.until)}</td>
                  <td className="num">{r.blocks}</td>
                  <td className="r">{isSuper ? <button className="btn btn-ghost sm" disabled={gate.locked} title={gate.title} aria-label={`Lift block: ${r.ip}`} onClick={() => L.openModal(`Lift block on ${r.ip}`, (close) => <Lift ip={r.ip} close={close} />)}><Icon name="access" />Lift block</button> : null}</td>
                </tr>
              ))}
            </Table>
          </div>
        )}
        {!isSuper ? <p className="field help" style={{ margin: 0 }}>Read-only for your role: only a platform super admin can lift a block.</p> : null}
        <h4 style={{ margin: "8px 0 0", fontSize: 13 }}>Address reputation</h4>
        <p className="field help" style={{ margin: 0, maxWidth: "80ch" }}>Hosting, VPN and proxy networks are blocked after {thresholdFor(REPUTATION[0].prefix + "1")} failures instead of {IP_POLICY.THRESHOLD}, and always get the extra check before a sign-in. In production this list comes from an IP intelligence feed; here the ranges are synthetic.</p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{REPUTATION.map((r) => <li key={r.prefix}>{r.label}</li>)}</ul>
      </div>
    </section>
  );
}

function Lift({ ip, close }: { ip: string; close: () => void }) {
  const L = useLayer();
  const [reason, setReason] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return;
    if (reason.trim().length < LIFT_REASON_MIN) { setErr(`Give a reason of at least ${LIFT_REASON_MIN} characters.`); return; }
    setBusy(true);
    try { await unblockAddress(ip, reason); close(); L.toast(`Block lifted on ${ip}`); } catch (e) { setErr(sodMessage(e, "Could not lift the block")); setBusy(false); }
  };
  return (
    <>
      <div className="field"><label htmlFor="ipb-reason">Reason (at least {LIFT_REASON_MIN} characters)</label><textarea className="input" id="ipb-reason" data-focus rows={3} maxLength={300} style={{ resize: "vertical" }} placeholder="Who asked, how you verified them, the ticket" value={reason} onChange={(e) => { setReason(e.target.value); setErr(""); }} aria-invalid={!!err} aria-describedby={err ? "ipb-err" : undefined} /></div>
      <p className="field help" id="ipb-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      <p className="field help">The address can try again at once and its next block starts at {LEVEL_LABEL[0]}. Recorded in the admin log with your elevation ticket.</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={go}><Icon name="access" />Lift block</button></LayerFoot>
    </>
  );
}
