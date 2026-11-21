import { Chip, DataTable, Icon, type DTColumn } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { API_ON } from "@/lib/rbac";
import { useApp } from "@/lib/store";
import { canActOnAccess } from "@/services/access";
import { RevokeGrantForm } from "./GrantForms";
import { DATA } from "@/lib/data";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Grant = any;
/** One chip per grant, labelled with the grant's own status (tone and icon follow it). */
const GRANT_TONE: Record<string, [string, string]> = { Active: ["ok", "check"], Expiring: ["warn", "clock"], "Needs review": ["warn", "alert"], Revoked: ["neutral", "x"] };
const GrantChip = ({ s }: { s: string }) => { const [c, i] = GRANT_TONE[s] || ["bad", "alert"]; return <Chip cls={c} icon={i}>{s}</Chip>; };
const COLS: DTColumn<Grant>[] = [
  { key: "user", header: "User", value: (a) => a.user, locked: true, render: (a) => <span className="strong">{a.user}</span> },
  { key: "system", header: "System", value: (a) => a.system, render: (a) => a.system },
  { key: "level", header: "Level", value: (a) => a.level, render: (a) => a.level },
  { key: "granted", header: "Granted", value: (a) => a.granted, sortBy: (a) => Date.parse(a.granted) || 0, render: (a) => a.granted },
  { key: "status", header: "Status", value: (a) => a.status, render: (a) => <GrantChip s={a.status} /> },
];

/** Grants register shared by Access > Account inventory and People > Access grants. */
export function GrantsTable() {
  const L = useLayer(); const role = useApp((s) => s.role); const act = API_ON && canActOnAccess(role);
  const cols: DTColumn<Grant>[] = act ? [...COLS, { key: "act", header: "Actions", hideHeader: true, render: (a) => <button className="btn btn-ghost sm" aria-label={`Revoke ${a.user} → ${a.system}`} onClick={() => L.openModal("Revoke access", (close) => <RevokeGrantForm grant={a} close={close} />)}><Icon name="x" />Revoke</button> }] : COLS;
  const systems = Array.from(new Set<string>(DATA.access.map((a: Grant) => String(a.system)))).sort();
  const statuses = Array.from(new Set<string>(DATA.access.map((a: Grant) => String(a.status)))).sort();
  return (
    <DataTable<Grant> id="grants" label="Access grants" rows={DATA.access} rowKey={(a) => a.id ?? `${a.user}|${a.system}|${a.level}|${a.granted}`} columns={cols} searchText={(a) => `${a.user} ${a.system} ${a.level}`}
      filters={[{ key: "system", label: "System", options: systems, get: (a: Grant) => a.system }, { key: "status", label: "Status", options: statuses, get: (a: Grant) => a.status }]} exportName="access-grants" />
  );
}
