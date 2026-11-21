import { useEffect, useState } from "react";
import { Chip, DataTable, Page, type DTColumn } from "@/components/ui";
import { apiMessage, utcMin } from "@/components/kit/serverRequests";
import { useData } from "@/lib/store";
import * as svc from "@/services/platform";

/* Admin Audit Log in production (slice 3a): the platform's own entries (no company), newest first, with the database's SHA-256 chain checked
   on every load. Each company's own log stays in that company's workspace. */
export function ApiAdminLog() {
  const v = useData();
  const [res, setRes] = useState<Awaited<ReturnType<typeof svc.platformAudit>> | null>(null); const [err, setErr] = useState("");
  useEffect(() => { let on = true; svc.platformAudit().then((x) => { if (on) { setRes(x); setErr(""); } }, (e) => { if (on) setErr(apiMessage(e, "Could not load the audit log")); }); return () => { on = false; }; }, [v]);
  const cols: DTColumn<svc.PlatformAuditEntry>[] = [
    { key: "at", header: "When", value: (e) => e.at, render: (e) => <span className="num">{utcMin(e.at)}</span> },
    { key: "actor", header: "Actor", value: (e) => e.actor, locked: true, render: (e) => <span className="strong">{e.actor}</span> },
    { key: "action", header: "Action", value: (e) => e.action, render: (e) => <span className="num">{e.action}</span> },
    { key: "target", header: "Detail", value: (e) => e.target, render: (e) => e.target },
    { key: "ip", header: "Address", value: (e) => e.ip, defaultHidden: true, render: (e) => <span className="num">{e.ip}</span> },
    { key: "chain", header: "Chain", value: (e) => e.chainN ?? 0, defaultHidden: true, render: (e) => <span className="num">{e.chainN ?? "—"}</span> },
  ];
  return (
    <Page mod="adminlog" sub="Platform actions: sign-ins of platform staff, elevations, company requests and decisions.">
      <div className="card" data-tour="adminlog-table" style={{ flex: "1 1 auto" }}>
        <div className="c-head"><h3>Platform log</h3><div className="r" data-tour={res ? "adminlog-chain" : undefined}>{res ? (res.verified ? <Chip cls="ok" icon="check">Chain verified</Chip> : <Chip cls="bad" icon="alert">{`Chain broken at entry ${res.firstBad}`}</Chip>) : null}</div></div>
        <div className="c-body flush scroll" style={{ padding: 0 }}>
          {err ? <p role="alert" style={{ padding: 12, color: "var(--bad-ink)" }}>{err}</p> : null}
          {res ? <DataTable<svc.PlatformAuditEntry> id="platform-audit-api" label="Platform audit log" rows={res.entries} rowKey={(e) => String(e.seq)} columns={cols} searchText={(e) => `${e.actor} ${e.action} ${e.target}`}
            filters={[{ key: "action", label: "Action", options: Array.from(new Set(res.entries.map((e) => e.action.split(".").slice(0, 2).join(".")))).sort(), get: (e) => e.action.split(".").slice(0, 2).join(".") }]} exportName="platform-audit" />
            : err ? null : <p style={{ padding: 12, color: "var(--muted)" }}>Loading…</p>}
        </div>
      </div>
    </Page>
  );
}
