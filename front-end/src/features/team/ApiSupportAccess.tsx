import { useEffect, useState } from "react";
import { Chip, DataTable, Icon, Segmented, StatusChip, type DTColumn } from "@/components/ui";
import { useLayer } from "@/hooks/useLayer";
import { apiMessage, utcMin } from "@/components/kit/serverRequests";
import { REASON_MIN, SUPPORT_GRANT_HOURS } from "@/lib/rules";
import { bumpData, useData } from "@/lib/store";
import * as svc from "@/services/support";

/* Support access, the company's side (slice 3b). Platform staff cannot see this company's workspace unless an admin here gives a support grant:
   read-only, a few hours at most, revocable at any time. Every support session, and everything it looked at, is listed here from the company's
   own audit log. The server and the database enforce it; this page only asks and shows. */
const ACTION_LABEL: Record<string, string> = {
  "support.grant.created": "Grant given", "support.grant.revoked": "Grant revoked", "support.access.started": "Session started",
  "support.access.ended": "Session ended", "support.viewed": "Viewed",
};
const VIEW_LABEL: Record<string, string> = { members: "Members", settings: "Sign-in setting", audit: "Audit log" };

export function ApiSupportAccess() {
  const v = useData(); const L = useLayer();
  const [data, setData] = useState<Awaited<ReturnType<typeof svc.getCompanySupport>> | null>(null); const [err, setErr] = useState("");
  const [reason, setReason] = useState(""); const [hours, setHours] = useState<string>("4"); const [ferr, setFerr] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { let on = true; svc.getCompanySupport().then((x) => { if (on) { setData(x); setErr(""); } }, (e) => { if (on) setErr(apiMessage(e, "Could not load support access")); }); return () => { on = false; }; }, [v]);
  const live = data?.grants.find((g) => g.status === "Live") ?? null;
  const give = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return; setBusy(true); setFerr("");
    try { await svc.giveGrant(reason.trim(), Number(hours)); setReason(""); bumpData(); L.toast(`Support access granted for ${hours} hour${hours === "1" ? "" : "s"}`); }
    catch (x) { setFerr(apiMessage(x, "Could not give support access")); }
    setBusy(false);
  };
  const revoke = async (g: svc.SupportGrant) => { try { await svc.revokeGrant(g.id); bumpData(); L.toast("Support access revoked. Any open support session has ended."); } catch (x) { L.toast(apiMessage(x, "Could not revoke support access"), false); } };
  const chip = (s: svc.SupportGrant["status"]) => (s === "Live" ? <Chip cls="warn" icon="access">Live</Chip> : <StatusChip s={s} />);
  const cols: DTColumn<svc.SupportGrant>[] = [
    { key: "reason", header: "Reason", value: (g) => g.reason, locked: true, render: (g) => <span className="strong">{g.reason}</span> },
    { key: "by", header: "Given by", value: (g) => g.grantedBy, render: (g) => g.grantedBy },
    { key: "when", header: "Given", value: (g) => g.createdAt, render: (g) => <span className="num">{utcMin(g.createdAt)}</span> },
    { key: "exp", header: "Ends", value: (g) => g.revokedAt ?? g.expiresAt, render: (g) => <span className="num">{utcMin(g.revokedAt ?? g.expiresAt)}</span> },
    { key: "status", header: "Status", value: (g) => g.status, render: (g) => chip(g.status) },
    { key: "act", header: "Actions", hideHeader: true, render: (g) => (g.status === "Live" ? <button className="btn btn-ghost sm" aria-label={`Revoke support access: ${g.reason}`} onClick={() => revoke(g)}><Icon name="x" />Revoke now</button> : null) },
  ];
  const logCols: DTColumn<svc.SupportLogLine>[] = [
    { key: "at", header: "When", value: (x) => x.at, locked: true, render: (x) => <span className="num">{utcMin(x.at)}</span> },
    { key: "who", header: "Who", value: (x) => x.actor, render: (x) => x.actor },
    { key: "what", header: "What", value: (x) => ACTION_LABEL[x.action] ?? x.action, render: (x) => ACTION_LABEL[x.action] ?? x.action },
    { key: "detail", header: "Details", value: (x) => x.target, render: (x) => (x.action === "support.viewed" ? VIEW_LABEL[x.target] ?? x.target : x.target) },
  ];
  if (err) return <p role="alert" style={{ color: "var(--bad-ink)" }}>{err}</p>;
  if (!data) return <p style={{ color: "var(--muted)" }}>Loading…</p>;
  return (
    <>
      <p className="field help" style={{ marginTop: 0 }}>Selvara staff cannot see your workspace unless you give support access here. It is read-only (members, the sign-in setting and the audit log), lasts {data.maxHours} hours at most, and you can revoke it at any time. Each support session needs its own reason and ticket, lasts 60 minutes at most, and is listed below with everything it looked at.</p>
      {live ? (
        <div className="banner warn" role="status" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Icon name="access" /><span style={{ flex: "1 1 260px" }}><b>Support access is on</b> until {utcMin(live.expiresAt)}, given by {live.grantedBy}.</span>
          <button className="btn btn-secondary sm" onClick={() => revoke(live)}>Revoke now</button>
        </div>
      ) : (
        <form onSubmit={give} noValidate style={{ maxWidth: 640, marginBottom: 12 }}>
          <div className="field"><label htmlFor="sg-reason">Why Selvara support needs access (at least {REASON_MIN} characters)</label>
            <textarea className="input" id="sg-reason" rows={2} maxLength={300} style={{ resize: "vertical" }} value={reason} onChange={(e) => { setReason(e.target.value); setFerr(""); }} aria-invalid={!!ferr} aria-describedby="sg-err" /></div>
          <div className="field"><Segmented<string> label="For" value={hours} onChange={setHours} options={SUPPORT_GRANT_HOURS.map((h) => ({ value: String(h), label: `${h} hour${h === 1 ? "" : "s"}` }))} /></div>
          <p className="field help" id="sg-err" role="alert" style={{ color: "var(--bad-ink)", display: ferr ? "block" : "none" }}>{ferr}</p>
          <button type="submit" className="btn btn-primary" disabled={busy}>Give support access</button>
        </form>
      )}
      <div className="sectitle">Grants</div>
      {data.grants.length ? <DataTable<svc.SupportGrant> id="team-support-grants" label="Support grants" rows={data.grants} rowKey={(g) => g.id} columns={cols} searchText={(g) => `${g.reason} ${g.grantedBy} ${g.status}`} exportName="support-grants" />
        : <p style={{ color: "var(--muted)" }}>No support access given yet.</p>}
      <div className="sectitle">Support activity in your workspace</div>
      {data.log.length ? <DataTable<svc.SupportLogLine> id="team-support-log" label="Support activity" rows={data.log} rowKey={(x) => `${x.at}-${x.action}-${x.target}`} columns={logCols} searchText={(x) => `${x.actor} ${x.action} ${x.target}`} exportName="support-activity" />
        : <p style={{ color: "var(--muted)" }}>No support activity.</p>}
    </>
  );
}
