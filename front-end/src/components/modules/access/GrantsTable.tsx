import { Table, StatusChip } from "@/components/ui";
import { DATA } from "@/lib/data";

/** Grants table shared by Access > Account inventory and People > Access grants (identical markup in the source). */
export function GrantsTable() {
  return (
    <Table cols={[{ t: "User" }, { t: "System" }, { t: "Level" }, { t: "Granted" }, { t: "Status" }]}>
      {DATA.access.map((a, i) => (
        <tr key={a.user + a.system + i}>
          <td className="strong">{a.user}</td><td>{a.system}</td><td>{a.level}</td><td>{a.granted}</td>
          <td><StatusChip s={a.status === "Active" ? "Active" : a.status === "Expiring" ? "Review" : "Needs evidence"} /> <span style={{ color: "var(--muted)", fontSize: 12 }}>{a.status}</span></td>
        </tr>
      ))}
    </Table>
  );
}
