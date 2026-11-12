import { DataTable, StatusChip, type DTColumn } from "@/components/ui";
import { DATA } from "@/lib/data";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Grant = any;
const STATUS_CHIP = (s: string) => (s === "Active" ? "Active" : s === "Expiring" ? "Review" : "Needs evidence");
const COLS: DTColumn<Grant>[] = [
  { key: "user", header: "User", value: (a) => a.user, locked: true, render: (a) => <span className="strong">{a.user}</span> },
  { key: "system", header: "System", value: (a) => a.system, render: (a) => a.system },
  { key: "level", header: "Level", value: (a) => a.level, render: (a) => a.level },
  { key: "granted", header: "Granted", value: (a) => a.granted, sortBy: (a) => Date.parse(a.granted) || 0, render: (a) => a.granted },
  { key: "status", header: "Status", value: (a) => a.status, render: (a) => <><StatusChip s={STATUS_CHIP(a.status)} /> <span style={{ color: "var(--muted)", fontSize: 12 }}>{a.status}</span></> },
];

/** Grants register shared by Access > Account inventory and People > Access grants. */
export function GrantsTable() {
  const systems = Array.from(new Set<string>(DATA.access.map((a: Grant) => String(a.system)))).sort();
  const statuses = Array.from(new Set<string>(DATA.access.map((a: Grant) => String(a.status)))).sort();
  return (
    <DataTable<Grant> id="grants" label="Access grants" rows={DATA.access} rowKey={(a) => `${a.user}|${a.system}|${a.level}|${a.granted}`} columns={COLS} searchText={(a) => `${a.user} ${a.system} ${a.level}`}
      filters={[{ key: "system", label: "System", options: systems, get: (a: Grant) => a.system }, { key: "status", label: "Status", options: statuses, get: (a: Grant) => a.status }]} exportName="access-grants" />
  );
}
