import { Table } from "@/components/ui";

export interface RateLimit { ep: string; id: string; ip: string; then: string }

export function RateLimitTable({ rows }: { rows: RateLimit[] }) {
  return (
    <Table cols={[{ t: "Endpoint" }, { t: "Per email / token" }, { t: "Per IP / device" }, { t: "When exceeded" }]} minw={720}>
      {rows.map((l) => (
        <tr key={l.ep}>
          <th scope="row" className="strong" style={{ textAlign: "left", fontWeight: 500, padding: "11px 14px", borderBottom: "1px solid var(--line)" }}>{l.ep}</th>
          <td>{l.id}</td><td>{l.ip}</td><td>{l.then}</td>
        </tr>
      ))}
    </Table>
  );
}
