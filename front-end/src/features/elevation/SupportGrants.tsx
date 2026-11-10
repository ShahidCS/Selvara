import { useEffect, useState, useSyncExternalStore } from "react";
import { Chip, Table } from "@/components/ui";
import { fmtUtc, getSupportGrants } from "@/lib/elevation";
import { CUSTOMERS } from "@/lib/platform";

const noopSubscribe = () => () => {};

/** Customer-approved, time-boxed, read-only support grants (board: no standing access to customer content). Status is computed from the expiry timestamp. */
export function SupportGrants() {
  // false on the server and during hydration, true afterwards: the table renders empty first, so server and client markup match
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(iv); }, []);
  const rows = mounted ? getSupportGrants() : [];
  return (
    <div className="card">
      <div className="c-head"><h3>Customer-approved support grants</h3></div>
      <p className="field help" style={{ margin: "0 16px 8px" }}><b>Customer-approved support grants are the only route to workspace content.</b> Each grant is approved by the customer, read-only and expiring (for example 4 h). Without an active grant, platform staff, including super admins, cannot read customer workspace content. Grants are created and revoked by the customer; this list is read-only.</p>
      <div className="c-body flush" style={{ padding: 0 }}>
        <Table cols={[{ t: "Grant" }, { t: "Customer" }, { t: "Approved by" }, { t: "Approved" }, { t: "Access" }, { t: "Expires" }, { t: "Status" }]}>
          {rows.map((g) => {
            const live = now < g.expiresAt;
            return (
              <tr key={g.id}>
                <td className="strong num">{g.id}</td><td>{CUSTOMERS[g.custId] ? CUSTOMERS[g.custId].name : "Unknown customer"}</td>
                <td style={{ fontSize: 12 }}>{g.approvedBy}</td><td className="num">{fmtUtc(g.approvedAt)}</td><td>{g.scope}</td><td className="num">{fmtUtc(g.expiresAt)}</td>
                <td>{live ? <Chip cls="ok" icon="clock">Active</Chip> : <Chip cls="neutral" icon="dot">Expired</Chip>}</td>
              </tr>
            );
          })}
        </Table>
      </div>
    </div>
  );
}
