import { useEffect, useState } from "react";
import { Chip, Table } from "@/components/ui";
import { fmtUtc, getSupportGrants } from "@/lib/elevation";
import { CUSTOMERS } from "@/lib/platform";

/** Customer-approved, time-boxed, read-only support grants (board: no standing access to customer content). Status is computed from the expiry timestamp. */
export function SupportGrants() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const iv = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(iv); }, []);
  const rows = now === null ? [] : getSupportGrants();
  return (
    <div className="card">
      <div className="c-head"><h3>Customer-approved support grants</h3></div>
      <p className="field help" style={{ margin: "0 16px 8px" }}>Support access grant approved by the customer (for example 4 h, read-only). Without an active grant, platform staff cannot read customer policy content. Grants are created and revoked by the customer; this list is read-only.</p>
      <div className="c-body flush" style={{ padding: 0 }}>
        <Table cols={[{ t: "Grant" }, { t: "Customer" }, { t: "Approved by" }, { t: "Approved" }, { t: "Access" }, { t: "Expires" }, { t: "Status" }]}>
          {rows.map((g) => {
            const live = (now as number) < g.expiresAt;
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
