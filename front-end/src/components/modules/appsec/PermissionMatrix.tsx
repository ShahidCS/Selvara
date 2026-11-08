import { Chip, Table } from "@/components/ui";

export interface MatrixRow { action: string; cells: string[] }

/** Board classes: Yes / No / Own* / everything else conditional. Text stays in the chip (colour is never the only signal). */
function kind(t: string): [string, string] {
  if (t === "Yes") return ["ok", "check"];
  if (t === "No") return ["neutral", "x"];
  if (t.indexOf("Own") === 0) return ["info", "user"];
  return ["warn", "clock"];
}

export function PermissionMatrix({ roles, rows }: { roles: string[]; rows: MatrixRow[] }) {
  return (
    <Table cols={[{ t: "Action" }, ...roles.map((r) => ({ t: r }))]} minw={900}>
      {rows.map((r) => (
        <tr key={r.action}>
          <th scope="row" className="strong" style={{ textAlign: "left", fontWeight: 500, padding: "11px 14px", borderBottom: "1px solid var(--line)" }}>{r.action}</th>
          {r.cells.map((t, i) => { const [c, ic] = kind(t); return <td key={i}><Chip cls={c} icon={ic}>{t}</Chip></td>; })}
        </tr>
      ))}
    </Table>
  );
}
