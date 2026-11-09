import { Icon } from "./Icon";

export function Chip({ cls, children, icon }: { cls: string; children: React.ReactNode; icon?: string }) {
  return <span className={`chip ${cls}`}>{icon ? <Icon name={icon} /> : null}{children}</span>;
}
const STATUS: Record<string, [string, string]> = {
  Pass: ["ok", "check"], Passing: ["ok", "check"], OK: ["ok", "check"], Active: ["ok", "check"], Approved: ["ok", "check"], Compliant: ["ok", "check"], Paid: ["ok", "check"], Closed: ["ok", "check"], Complete: ["ok", "check"], Completed: ["ok", "check"], Applied: ["ok", "check"], Enrolled: ["ok", "check"], Done: ["ok", "check"],
  "Not applied": ["bad", "x"], "Not enrolled": ["neutral", "dot"], "Not applicable": ["neutral", "dot"], Suspended: ["bad", "x"], Invited: ["info", "clock"], Rejected: ["bad", "x"], Archived: ["neutral", "dot"],
  Fail: ["bad", "x"], Failing: ["bad", "x"], Overdue: ["bad", "alert"], "Past due": ["bad", "alert"], Critical: ["bad", "alert"], High: ["bad", "alert"], Open: ["warn", "dot"], "In review": ["warn", "clock"], "In progress": ["warn", "clock"], Pending: ["warn", "clock"], "Needs evidence": ["warn", "alert"], Draft: ["neutral", "edit"], Medium: ["warn", "dot"], Low: ["neutral", "dot"], Trial: ["info", "clock"], Upcoming: ["info", "clock"], Held: ["warn", "alert"], "Not started": ["neutral", "dot"], Review: ["warn", "clock"],
};
export function StatusChip({ s }: { s: string }) {
  const [c, i] = STATUS[s] || ["neutral", "dot"];
  return <Chip cls={c} icon={i}>{s}</Chip>;
}
export function ReqStatusPill({ st }: { st: string }) {
  const a = ({ Met: ["ok", "check"], "Partially met": ["warn", "clock"], "Not met": ["bad", "x"], "Not assessed": ["neutral", "dot"], "Not applicable": ["neutral", "dot"] } as Record<string, [string, string]>)[st] || ["neutral", "dot"];
  return <Chip cls={a[0]} icon={a[1]}>{st}</Chip>;
}
