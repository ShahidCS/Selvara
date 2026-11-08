import { Icon } from "@/components/ui";
import { fmtCountdown, fmtUtc, useElevation } from "@/lib/elevation";
import { useLayer } from "@/hooks/useLayer";

/** Board header + banner copy. The countdown is derived from the stored expiry timestamp; the state is a display, not a control. */
export function ElevationBanner() {
  const L = useLayer(); const el = useElevation();
  const mins = Math.max(1, Math.ceil(el.remainingMs / 60000));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="banner info"><b>Sample data.</b> Customer names are fictional. Super admins manage tenants and billing; they cannot read customer policy content without a time-boxed support grant approved by the customer.</div>
      {el.active ? (
        <div className="banner warn" role="status" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Icon name="shieldcheck" />
          <div style={{ flex: "1 1 280px" }}>
            <b>Elevated session</b>: Hardware key · allow-listed network · just-in-time role expires in {mins} min.
            <div style={{ fontSize: 12 }}>Until {fmtUtc(el.until as number)} · <span className="num" aria-hidden="true">{fmtCountdown(el.remainingMs)}</span> left · hardware key and network checks are simulated in this demo.</div>
          </div>
          {el.canElevate ? <button className="btn btn-secondary" onClick={() => { if (el.end()) L.toast("Elevation ended"); }}><Icon name="x" />End elevation</button> : null}
        </div>
      ) : (
        <div className="banner info" role="status">
          <b>Not elevated.</b> {el.canElevate ? "This session is non-privileged. Request just-in-time elevation (60 minutes maximum, reason recorded) before making changes." : "Elevation is available to the Platform Super Admin role only. Your role has read-only access to this page."}
          {el.last ? <div style={{ fontSize: 12 }}>{el.last.kind === "expired" ? "Elevation expired" : "Elevation ended"} at {fmtUtc(el.last.at)}: {el.last.note}.</div> : null}
        </div>
      )}
    </div>
  );
}
