import { useEffect, useState } from "react";
import { Chip, Icon, Table } from "@/components/ui";
import { ELEVATE_TEXT, type ElevationState } from "@/components/kit/admin/ServerElevation";
import { apiMessage, utcMin } from "@/components/kit/serverRequests";
import { LayerFoot } from "@/components/shell/LayerProvider";
import { useLayer } from "@/hooks/useLayer";
import { IP_POLICY, LEVEL_LABEL } from "@/lib/ipGuard";
import { bumpData, useData } from "@/lib/store";
import { apiFetch } from "@/services/http";

/* Sign-in blocks in production (programme group 8a): the addresses the server blocked after repeated failed sign-ins, as it holds them.
   Platform staff see them; only an elevated super admin lifts one, with a reason (who asked, how they were verified, the ticket). */
interface Block { ip: string; level: number; until: number; blocks: number; since: number }
const LIFT_MIN = 15;

export function ApiBlocks({ s }: { s: ElevationState }) {
  const v = useData(); const L = useLayer();
  const [rows, setRows] = useState<Block[] | null>(null); const [err, setErr] = useState("");
  useEffect(() => { let on = true; apiFetch<{ blocks: Block[] }>("/admin/security/blocks").then((x) => { if (on) { setRows(x.blocks); setErr(""); } }, (e) => { if (on) setErr(apiMessage(e, "Could not load the blocked addresses")); }); return () => { on = false; }; }, [v]);
  const lock = s.locked ? ELEVATE_TEXT : undefined;
  return (
    <section className="card" aria-labelledby="ipb-h">
      <div className="c-head"><h3 id="ipb-h">Blocked sign-in addresses</h3><div className="r"><span className="tag">{rows ? `${rows.length} blocked` : "…"}</span></div></div>
      <div className="c-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p className="field help" style={{ margin: 0, maxWidth: "80ch" }}>{IP_POLICY.THRESHOLD} failed sign-ins from one address within {IP_POLICY.WINDOW_MS / 60_000} minutes, across any accounts, block it. Each repeat lasts longer: {LEVEL_LABEL.join(", ")}.</p>
        {err ? <p role="alert" style={{ margin: 0, color: "var(--bad-ink)" }}>{err}</p> : !rows ? <p style={{ margin: 0, color: "var(--muted)" }}>Loading…</p> : !rows.length ? <p className="field help" style={{ margin: 0 }}>No address is blocked.</p> : (
          <div style={{ margin: "0 -16px" }}>
            <Table cols={[{ t: "Address" }, { t: "Level" }, { t: "Blocked until" }, { t: "Blocks" }, { t: "" }]}>
              {rows.map((r) => (
                <tr key={r.ip}>
                  <td className="strong num">{r.ip}</td>
                  <td>{r.level >= LEVEL_LABEL.length ? <Chip cls="bad" icon="alert">{LEVEL_LABEL[LEVEL_LABEL.length - 1]}</Chip> : <Chip cls="warn" icon="clock">{LEVEL_LABEL[Math.max(0, r.level - 1)]}</Chip>}</td>
                  <td className="num" style={{ fontSize: 12 }}>{utcMin(r.until)}</td>
                  <td className="num">{r.blocks}</td>
                  <td className="r">{s.canElevate ? <button className="btn btn-ghost sm" disabled={!!lock} title={lock} aria-label={`Lift block: ${r.ip}`} onClick={() => L.openModal(`Lift block on ${r.ip}`, (close) => <Lift ip={r.ip} close={close} />)}><Icon name="access" />Lift block</button> : null}</td>
                </tr>
              ))}
            </Table>
          </div>
        )}
        {!s.canElevate && s.loaded ? <p className="field help" style={{ margin: 0 }}>Read-only for your role: only a platform super admin can lift a block.</p> : null}
      </div>
    </section>
  );
}

function Lift({ ip, close }: { ip: string; close: () => void }) {
  const L = useLayer(); const [reason, setReason] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return; if (reason.trim().length < LIFT_MIN) { setErr(`Give a reason of at least ${LIFT_MIN} characters.`); return; }
    setBusy(true);
    try { await apiFetch(`/admin/security/blocks/${encodeURIComponent(ip)}/lift`, { method: "POST", body: JSON.stringify({ reason }) }); bumpData(); close(); L.toast(`Block lifted on ${ip}`); }
    catch (x) { setErr(apiMessage(x, "Could not lift the block")); setBusy(false); }
  };
  return (
    <>
      <div className="field"><label htmlFor="ipb-reason">Reason (at least {LIFT_MIN} characters)</label><textarea className="input" id="ipb-reason" data-focus rows={3} maxLength={300} style={{ resize: "vertical" }} placeholder="Who asked, how you verified them, the ticket" value={reason} onChange={(e) => { setReason(e.target.value); setErr(""); }} aria-invalid={!!err} aria-describedby={err ? "ipb-err" : undefined} /></div>
      <p className="field help" id="ipb-err" role="alert" style={{ color: "var(--bad-ink)", display: err ? "block" : "none" }}>{err}</p>
      <p className="field help">The address can try again at once and its next block starts at {LEVEL_LABEL[0]}. Recorded in the platform audit log.</p>
      <LayerFoot><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={go}><Icon name="access" />Lift block</button></LayerFoot>
    </>
  );
}
